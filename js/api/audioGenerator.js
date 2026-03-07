/**
 * SQ.AudioGenerator — TTS narration via ElevenLabs text-to-speech API.
 *
 * Supports multi-voice narration: when narration_segments are provided
 * (from a separate segmentation API call), each segment is generated
 * in parallel with its assigned ElevenLabs voice, then all PCM16 buffers
 * are stitched together into a single WAV file.
 *
 * Design doc Section 5: fires in parallel with text + image generation,
 * audio plays when ready, gracefully degrades to text-only on failure.
 */
(function () {
  var AUDIO_TIMEOUT_MS = 60000;

  /** Currently playing HTML5 audio element (shared across calls). */
  var _audio = null;

  /** Whether audio is currently playing for the active passage. */
  var _isPlaying = false;

  SQ.AudioGenerator = {
    /**
     * Generate narration audio for a passage.
     * @param {string} passageText - The passage text to narrate (fallback if no segments)
     * @param {Array|null} segments - narration_segments array: [{speaker, text}, ...]
     * @param {Object|null} npcVoices - Map of NPC name → {voice, style, profileId} or string voice ID
     * @returns {Promise<string|null>} Audio data URL or null on failure
     */
    generate: function (passageText, segments, npcVoices) {
      if (!passageText) return Promise.resolve(null);
      if (!SQ.PlayerConfig.isNarrationEnabled()) return Promise.resolve(null);

      // Stop any in-progress narration
      this.stop();

      if (SQ.useMockData) {
        return this._mockGenerate();
      }

      if (!SQ.PlayerConfig.hasElevenLabsApiKey()) {
        console.warn('AudioGenerator: narration enabled but no ElevenLabs API key configured');
        return Promise.resolve(null);
      }

      // If we have segments with any NPC speakers, use multi-voice path.
      // Even if voice IDs overlap, different speakers have different styles.
      if (segments && segments.length > 1 && this._hasNpcSpeakers(segments)) {
        return this._generateMultiVoice(segments, npcVoices);
      }

      // Single-voice fallback: use narrator profile for the whole passage
      var profile = SQ.PlayerConfig.getNarratorProfile();
      return this._generateSingleSegment(passageText, profile.voice, profile.style);
    },

    /**
     * Resolve voice ID from an npcVoices entry (handles both string and object formats).
     * @private
     */
    _resolveVoice: function (npcVoiceEntry) {
      if (!npcVoiceEntry) return null;
      if (typeof npcVoiceEntry === 'string') return npcVoiceEntry;
      return npcVoiceEntry.voice || null;
    },

    /**
     * Resolve style instruction from an npcVoices entry.
     * @private
     */
    _resolveStyle: function (npcVoiceEntry) {
      if (!npcVoiceEntry) return null;
      if (typeof npcVoiceEntry === 'string') return null;
      return npcVoiceEntry.style || null;
    },

    /**
     * Check if any segment has a named speaker (known or unknown).
     * We use multi-voice whenever ANY segment has a non-null speaker,
     * even if that speaker doesn't have a voice entry yet — they'll
     * get one assigned on the fly in _generateMultiVoice.
     * @private
     */
    _hasNpcSpeakers: function (segments) {
      for (var i = 0; i < segments.length; i++) {
        if (segments[i].speaker) return true;
      }
      return false;
    },

    /**
     * Find speakers in segments that don't have voice profiles yet and
     * assign them a unique voice + contextual style instruction built from
     * the passage text, their dialogue, the game setting, and character cues.
     * No extra API calls — everything is derived from data already available.
     * Caches the assignment in npcVoices (and game state) so the same
     * character reuses their voice if they speak again later.
     * @private
     */
    _assignUnknownSpeakers: function (segments, npcVoices) {
      var unknowns = [];
      for (var i = 0; i < segments.length; i++) {
        var speaker = segments[i].speaker;
        if (speaker && !npcVoices[speaker] && unknowns.indexOf(speaker) === -1) {
          unknowns.push(speaker);
        }
      }
      if (unknowns.length === 0) return;

      // Collect voices already in use (narrator + existing NPCs)
      var usedVoices = {};
      usedVoices[SQ.PlayerConfig.getNarratorVoice()] = true;
      var keys = Object.keys(npcVoices);
      for (var j = 0; j < keys.length; j++) {
        var v = npcVoices[keys[j]];
        var voiceId = typeof v === 'string' ? v : (v && v.voice);
        if (voiceId) usedVoices[voiceId] = true;
      }

      // Get full context: passage text, game state, setting info
      var gameState = SQ.GameState.get();
      var passageText = (gameState && gameState.last_passage) || '';
      var meta = (gameState && gameState.meta) || {};
      var setting = meta.setting || 'fantasy';
      var tone = meta.tone || 'dark and atmospheric';

      // Check skeleton NPCs for role/motivation info on this character
      var skeletonNpcs = {};
      if (gameState && gameState.skeleton && gameState.skeleton.npcs) {
        gameState.skeleton.npcs.forEach(function (npc) {
          skeletonNpcs[npc.name.toLowerCase()] = npc;
        });
      }

      for (var k = 0; k < unknowns.length; k++) {
        var name = unknowns[k];

        // Detect gender from passage context
        var gender = this._detectSpeakerGender(name, passageText);
        var genderPool = SQ.PlayerConfig.getVoicesForGender(gender);

        // Extract this speaker's dialogue lines from segments
        var speakerLines = [];
        for (var s = 0; s < segments.length; s++) {
          if (segments[s].speaker === name) {
            speakerLines.push(segments[s].text.replace(/"/g, '').trim());
          }
        }

        // Extract descriptions/context around the speaker from the passage
        var descriptors = this._extractSpeakerContext(name, passageText);

        // Check if this character exists in the skeleton NPC roster
        var skeletonNpc = skeletonNpcs[name.toLowerCase()];

        // Build a rich style instruction from all available context
        var style = this._buildStyleInstruction(name, gender, descriptors, speakerLines, skeletonNpc, setting, tone);

        // Pick an unused voice from the appropriate gender pool
        var picked = null;
        for (var m = 0; m < genderPool.length; m++) {
          if (!usedVoices[genderPool[m]]) {
            picked = genderPool[m];
            break;
          }
        }
        // If all voices in the gender pool are used, pick any unused voice
        if (!picked) {
          var allVoices = SQ.PlayerConfig.VOICES.map(function (v) { return v.id; });
          for (var a = 0; a < allVoices.length; a++) {
            if (!usedVoices[allVoices[a]]) {
              picked = allVoices[a];
              break;
            }
          }
        }
        // Last resort: random from gender pool
        if (!picked) {
          picked = genderPool[Math.floor(Math.random() * genderPool.length)];
        }

        npcVoices[name] = { voice: picked, style: style };
        usedVoices[picked] = true;

        console.log('AudioGenerator: auto-assigned voice "' + picked + '" (' + gender + ') to "' + name + '"');
        console.log('  Style:', style.slice(0, 120) + '...');
      }

      // Persist to game state so these assignments stick across passages
      if (gameState) {
        if (!gameState.npc_voices) gameState.npc_voices = {};
        for (var n = 0; n < unknowns.length; n++) {
          gameState.npc_voices[unknowns[n]] = npcVoices[unknowns[n]];
        }
        SQ.GameState.save();
      }
    },

    /**
     * Extract descriptive context about a speaker from the passage text.
     * Pulls adjectives, titles, descriptions, and action verbs near their name.
     * Returns an object with role cues, manner of speaking, and descriptions.
     * @private
     */
    _extractSpeakerContext: function (name, passageText) {
      var result = { titles: [], descriptions: [], actions: [], manner: [] };
      if (!passageText) return result;

      var lowerText = passageText.toLowerCase();
      var lowerName = name.toLowerCase();

      // Find all text windows around the speaker's name
      var windows = [];
      var searchPos = 0;
      var idx;
      while ((idx = lowerText.indexOf(lowerName, searchPos)) !== -1) {
        var start = Math.max(0, idx - 150);
        var end = Math.min(passageText.length, idx + lowerName.length + 150);
        windows.push(passageText.slice(start, end));
        searchPos = idx + 1;
      }
      var context = windows.join(' ').toLowerCase();

      // Detect titles and rank (e.g., "Captain Voss", "the old merchant")
      var titlePatterns = /\b(captain|commander|sergeant|lieutenant|general|colonel|soldier|guard|officer|official|lord|lady|duke|duchess|king|queen|prince|princess|knight|squire|elder|chief|master|apprentice|scholar|sage|priest|priestess|monk|cleric|mage|sorcerer|sorceress|wizard|witch|merchant|trader|innkeeper|tavern|barkeep|thief|rogue|assassin|hunter|ranger|healer|farmer|peasant|noble|baron|count|councilor|advisor|servant|slave|beggar|urchin|spy|scout|smith|blacksmith|alchemist|bard|jester|warden|sheriff|mayor|governor|ambassador|envoy|messenger|herald|executioner|jailer)\b/gi;
      var titleMatches = context.match(titlePatterns);
      if (titleMatches) {
        result.titles = titleMatches.map(function (t) { return t.toLowerCase(); })
          .filter(function (t, i, arr) { return arr.indexOf(t) === i; }); // unique
      }

      // Detect manner of speaking (e.g., "growled", "whispered", "barked")
      var mannerPatterns = /\b(growl|snarl|bark|snap|hiss|whisper|murmur|mutter|shout|yell|bellow|boom|rasp|drawl|purr|coo|stammer|stutter|slur|croak|wheeze|thunder|rumble|whimper|plead|demand|command|sneer|scoff|mock|taunt|laugh|chuckle|giggle|sob|cry|wail|groan|sigh|intone|drone|lilt|sing|chant)s?\b|(?:said|spoke|replied|answered|asked)\s+(?:in\s+a\s+)?(quiet|loud|soft|harsh|gruff|gentle|cold|warm|deep|high|thin|rich|smooth|rough|raspy|silky|husky|shrill|booming|thunderous|hushed|breathy)/gi;
      var mannerMatches = context.match(mannerPatterns);
      if (mannerMatches) {
        result.manner = mannerMatches.map(function (m) { return m.toLowerCase().trim(); })
          .filter(function (m, i, arr) { return arr.indexOf(m) === i; });
      }

      // Detect physical/personality descriptors near the name
      var descPatterns = /\b(old|young|ancient|grizzled|scarred|weathered|tall|short|broad|thin|gaunt|massive|wiry|stocky|burly|frail|elegant|rough|ragged|armored|cloaked|hooded|masked|bearded|bald|grey-haired|stern|cold|warm|kind|cruel|cunning|nervous|confident|weary|tired|alert|suspicious|friendly|hostile|fearful|calm|agitated|stoic|emotional|proud|humble|arrogant|meek)\b/gi;
      var descMatches = context.match(descPatterns);
      if (descMatches) {
        result.descriptions = descMatches.map(function (d) { return d.toLowerCase(); })
          .filter(function (d, i, arr) { return arr.indexOf(d) === i; });
      }

      return result;
    },

    /**
     * Build a detailed TTS style instruction from all available character context.
     * Produces a system prompt that tells the TTS model exactly how to voice this character.
     * @private
     */
    _buildStyleInstruction: function (name, gender, descriptors, dialogue, skeletonNpc, setting, tone) {
      var parts = [];

      // Character identity
      parts.push('You are voicing the character "' + name + '" in a ' + setting + ' story with a ' + tone + ' tone.');

      // Role from skeleton NPC data or title detection
      var role = '';
      if (skeletonNpc && skeletonNpc.role) {
        role = skeletonNpc.role;
        parts.push('Role: ' + role + '.');
      } else if (descriptors.titles.length > 0) {
        role = descriptors.titles[0];
        parts.push('This character is a ' + descriptors.titles.join(', ') + '.');
      }

      // Motivation from skeleton
      if (skeletonNpc && skeletonNpc.motivation) {
        parts.push('Motivation: ' + skeletonNpc.motivation + '.');
      }

      // Physical/personality descriptors
      if (descriptors.descriptions.length > 0) {
        parts.push('Character traits: ' + descriptors.descriptions.join(', ') + '.');
      }

      // Manner of speaking from narration cues
      if (descriptors.manner.length > 0) {
        parts.push('Speaking manner: ' + descriptors.manner.join(', ') + '.');
      }

      // Infer voice quality from role/descriptors
      var voiceQuality = this._inferVoiceQuality(role, descriptors, gender);
      parts.push(voiceQuality);

      // Dialogue sample for tone reference
      if (dialogue.length > 0) {
        var sample = dialogue[0].slice(0, 100);
        parts.push('Example line: "' + sample + '"');
      }

      parts.push('Make this character sound completely distinct from the narrator and other characters.');

      return parts.join(' ');
    },

    /**
     * Infer voice quality descriptors from character role and traits.
     * Returns a string describing how the voice should sound.
     * @private
     */
    _inferVoiceQuality: function (role, descriptors, gender) {
      var roleLower = (role || '').toLowerCase();
      var descs = descriptors.descriptions || [];
      var titles = descriptors.titles || [];
      var allContext = roleLower + ' ' + descs.join(' ') + ' ' + titles.join(' ');

      // Military/authority figures
      if (/captain|commander|sergeant|general|colonel|soldier|guard|officer|official|knight|warden|sheriff/.test(allContext)) {
        if (descs.indexOf('old') !== -1 || descs.indexOf('grizzled') !== -1 || descs.indexOf('weathered') !== -1) {
          return 'Voice: Gravelly and commanding. Tone: Clipped, no-nonsense military precision. Pacing: Short, sharp sentences.';
        }
        return 'Voice: Firm and authoritative. Tone: Professional, direct. Pacing: Measured, deliberate. Brooking no argument.';
      }

      // Nobles/royalty
      if (/lord|lady|duke|duchess|king|queen|prince|princess|noble|baron|count|councilor|ambassador/.test(allContext)) {
        if (descs.indexOf('cruel') !== -1 || descs.indexOf('cunning') !== -1 || descs.indexOf('arrogant') !== -1) {
          return 'Voice: Smooth, refined, dripping with condescension. Tone: Theatrical, superior. Pacing: Languid and unhurried.';
        }
        return 'Voice: Refined and cultured. Tone: Formal, measured. Pacing: Unhurried, every word deliberate. Accent: Upper-class.';
      }

      // Magical/scholarly
      if (/mage|sorcerer|sorceress|wizard|witch|scholar|sage|alchemist/.test(allContext)) {
        if (descs.indexOf('ancient') !== -1 || descs.indexOf('old') !== -1) {
          return 'Voice: Thin, ethereal, and otherworldly. Tone: Ominous, words carrying weight of centuries. Pacing: Extremely slow and deliberate.';
        }
        return 'Voice: Quiet, precise, slightly detached. Tone: Contemplative, intellectual. Pacing: Measured, choosing each word carefully.';
      }

      // Religious/spiritual
      if (/priest|priestess|monk|cleric/.test(allContext)) {
        return 'Voice: Calm, resonant, carrying quiet authority. Tone: Solemn, contemplative. Pacing: Measured and rhythmic, almost ceremonial.';
      }

      // Street/criminal
      if (/thief|rogue|assassin|urchin|spy|scout|beggar/.test(allContext)) {
        return 'Voice: Quick, sharp, streetwise. Tone: Wary, guarded. Pacing: Fast, words tumbling out. Accent: Common, rough-edged.';
      }

      // Merchants/innkeepers
      if (/merchant|trader|innkeeper|tavern|barkeep|smith|blacksmith/.test(allContext)) {
        return 'Voice: Warm, practical, down-to-earth. Tone: Friendly but shrewd. Pacing: Relaxed, conversational. Accent: Rural, working-class warmth.';
      }

      // Elder/mentor
      if (/elder|mentor|master/.test(allContext) || descs.indexOf('old') !== -1 || descs.indexOf('ancient') !== -1 || descs.indexOf('weathered') !== -1) {
        return 'Voice: Weathered but warm. Tone: Patient, knowing, gentle authority. Pacing: Slow, deliberate, pausing for emphasis.';
      }

      // Young characters
      if (descs.indexOf('young') !== -1 || /squire|apprentice/.test(allContext)) {
        return 'Voice: Clear, eager, youthful. Tone: Earnest, slightly nervous. Pacing: Quick when excited, halting when uncertain.';
      }

      // Hostile/aggressive descriptors
      if (descs.indexOf('hostile') !== -1 || descs.indexOf('cruel') !== -1 || descs.indexOf('cold') !== -1) {
        return 'Voice: Hard, clipped, menacing. Tone: Cold and threatening. Pacing: Deliberate, each word a warning.';
      }

      // Nervous/fearful
      if (descs.indexOf('nervous') !== -1 || descs.indexOf('fearful') !== -1 || descs.indexOf('frail') !== -1) {
        return 'Voice: Thin, uncertain, wavering. Tone: Anxious, hesitant. Pacing: Halting, with nervous pauses.';
      }

      // Confident/proud
      if (descs.indexOf('confident') !== -1 || descs.indexOf('proud') !== -1 || descs.indexOf('arrogant') !== -1) {
        return 'Voice: Strong, self-assured. Tone: Bold, carrying natural authority. Pacing: Unhurried, commanding attention.';
      }

      // Default fallback — still better than the old generic one
      var genderHint = gender === 'feminine' ? 'a distinctive feminine' : gender === 'masculine' ? 'a distinctive masculine' : 'a distinctive';
      return 'Voice: Give this character ' + genderHint + ' voice that fits their role in a ' + (role || 'story') + '. '
        + 'Tone: Natural, in-character. Pacing: Suited to their personality. Make them memorable and distinct.';
    },

    /**
     * Detect a speaker's likely gender from the passage text surrounding their name.
     * Looks for pronouns and gendered nouns near the speaker's name.
     * Returns 'masculine', 'feminine', or 'non-binary'.
     * @private
     */
    _detectSpeakerGender: function (name, passageText) {
      if (!passageText) return 'non-binary';

      // Find text around the speaker's name (200 chars before/after each mention)
      var context = '';
      var lowerText = passageText.toLowerCase();
      var lowerName = name.toLowerCase();
      var searchPos = 0;
      var idx;
      while ((idx = lowerText.indexOf(lowerName, searchPos)) !== -1) {
        var start = Math.max(0, idx - 200);
        var end = Math.min(passageText.length, idx + lowerName.length + 200);
        context += ' ' + passageText.slice(start, end).toLowerCase();
        searchPos = idx + 1;
      }

      if (!context) return 'non-binary';

      // Count masculine vs feminine cues
      var mascPatterns = /\b(he |him |his |himself |man |boy |gentleman |lord |sir |king |prince |father |brother |mr\.? )\b/gi;
      var femPatterns = /\b(she |her |hers |herself |woman |girl |lady |queen |princess |mother |sister |mrs\.? |miss |madam )\b/gi;

      var mascCount = (context.match(mascPatterns) || []).length;
      var femCount = (context.match(femPatterns) || []).length;

      if (mascCount > femCount) return 'masculine';
      if (femCount > mascCount) return 'feminine';
      return 'non-binary';
    },

    /**
     * Generate audio for multiple segments in parallel, then stitch PCM16 buffers.
     * @private
     */
    _generateMultiVoice: function (segments, npcVoices) {
      var narratorProfile = SQ.PlayerConfig.getNarratorProfile();
      var self = this;

      // Ensure npcVoices map exists
      if (!npcVoices) npcVoices = {};

      // Auto-assign voices to any unknown speakers before generating audio.
      // This handles characters not in the original skeleton (guards, merchants, etc.)
      this._assignUnknownSpeakers(segments, npcVoices);

      // Build parallel requests for each segment
      var promises = segments.map(function (seg) {
        var voice = narratorProfile.voice;
        var style = narratorProfile.style;
        if (seg.speaker && npcVoices[seg.speaker]) {
          voice = self._resolveVoice(npcVoices[seg.speaker]) || voice;
          style = self._resolveStyle(npcVoices[seg.speaker]) || style;
        }
        // Each call returns raw PCM16 Uint8Array
        return self._fetchPcm16(seg.text, voice, style);
      });

      return Promise.all(promises)
        .then(function (pcmArrays) {
          // Filter out any null results (failed segments)
          var validArrays = [];
          for (var i = 0; i < pcmArrays.length; i++) {
            if (pcmArrays[i]) validArrays.push(pcmArrays[i]);
          }
          if (validArrays.length === 0) return null;

          // Concatenate all PCM16 buffers in order
          var totalLength = 0;
          for (var j = 0; j < validArrays.length; j++) totalLength += validArrays[j].length;
          var combined = new Uint8Array(totalLength);
          var offset = 0;
          for (var k = 0; k < validArrays.length; k++) {
            combined.set(validArrays[k], offset);
            offset += validArrays[k].length;
          }

          // Wrap combined PCM16 in a single WAV
          var wavBlob = self._pcm16ToWavBlob(combined, 24000);
          return URL.createObjectURL(wavBlob);
        })
        .catch(function (err) {
          console.warn('AudioGenerator: multi-voice generation failed, degrading to text-only.');
          console.warn('  Error:', err.message || err);
          return null;
        });
    },

    /**
     * Generate audio for a single text with a single voice and style.
     * Returns a WAV blob URL.
     * @private
     */
    _generateSingleSegment: function (text, voice, style) {
      var self = this;
      return this._fetchPcm16(text, voice, style)
        .then(function (pcmData) {
          if (!pcmData) return null;
          var wavBlob = self._pcm16ToWavBlob(pcmData, 24000);
          return URL.createObjectURL(wavBlob);
        })
        .catch(function (err) {
          console.warn('AudioGenerator: generation failed, degrading to text-only.');
          console.warn('  Error:', err.message || err);
          return null;
        });
    },

    /**
     * Fetch raw PCM16 audio data for a text segment via ElevenLabs TTS API.
     * Returns a Uint8Array of signed 16-bit PCM at 24 kHz.
     * @param {string} text - Text to narrate
     * @param {string} voiceId - ElevenLabs voice ID
     * @param {string|null} style - Style/acting instruction for voice characterization
     * @returns {Promise<Uint8Array|null>}
     * @private
     */
    _fetchPcm16: function (text, voiceId, style) {
      var apiKey = SQ.PlayerConfig.getElevenLabsApiKey();

      if (!apiKey) {
        console.warn('AudioGenerator: no ElevenLabs API key configured');
        return Promise.resolve(null);
      }

      // Use the first voice in our curated list as fallback
      if (!voiceId) voiceId = SQ.PlayerConfig.VOICES[0].id;

      var model = SQ.PlayerConfig.getElevenLabsModel();
      var url = 'https://api.elevenlabs.io/v1/text-to-speech/'
        + encodeURIComponent(voiceId) + '?output_format=pcm_24000';

      // Prepend style instruction as a bracketed performance direction.
      // ElevenLabs models interpret contextual cues for emotion and delivery.
      var spokenText = text;
      if (style) {
        spokenText = '[' + style + ']\n\n' + text;
      }

      var body = {
        text: spokenText,
        model_id: model,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.4,
          use_speaker_boost: true
        }
      };

      var controller = new AbortController();
      var timeoutId = setTimeout(function () { controller.abort(); }, AUDIO_TIMEOUT_MS);

      return fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': apiKey
        },
        body: JSON.stringify(body),
        signal: controller.signal
      })
        .then(function (response) {
          clearTimeout(timeoutId);

          if (!response.ok) {
            return response.text().then(function (respText) {
              throw new Error('ElevenLabs HTTP ' + response.status + ': ' + respText.slice(0, 200));
            });
          }

          return response.arrayBuffer();
        })
        .then(function (buffer) {
          return new Uint8Array(buffer);
        })
        .catch(function (err) {
          clearTimeout(timeoutId);
          console.warn('AudioGenerator: ElevenLabs segment fetch failed.');
          console.warn('  Voice:', voiceId);
          console.warn('  Error:', err.message || err);
          return null;
        });
    },

    /**
     * Wrap raw PCM16 (signed 16-bit little-endian) data in a WAV container.
     * @param {Uint8Array} pcmData - Raw PCM16 audio bytes
     * @param {number} sampleRate - Sample rate (ElevenLabs pcm_24000 = 24000 Hz)
     * @returns {Blob} WAV file blob
     * @private
     */
    _pcm16ToWavBlob: function (pcmData, sampleRate) {
      var numChannels = 1;
      var bitsPerSample = 16;
      var byteRate = sampleRate * numChannels * (bitsPerSample / 8);
      var blockAlign = numChannels * (bitsPerSample / 8);
      var dataLength = pcmData.length;
      var headerLength = 44;
      var buffer = new ArrayBuffer(headerLength + dataLength);
      var view = new DataView(buffer);

      // RIFF header
      writeString(view, 0, 'RIFF');
      view.setUint32(4, 36 + dataLength, true);
      writeString(view, 8, 'WAVE');

      // fmt sub-chunk
      writeString(view, 12, 'fmt ');
      view.setUint32(16, 16, true);             // sub-chunk size
      view.setUint16(20, 1, true);              // PCM format
      view.setUint16(22, numChannels, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, byteRate, true);
      view.setUint16(32, blockAlign, true);
      view.setUint16(34, bitsPerSample, true);

      // data sub-chunk
      writeString(view, 36, 'data');
      view.setUint32(40, dataLength, true);

      // Copy PCM data after header
      var wavBytes = new Uint8Array(buffer);
      wavBytes.set(pcmData, headerLength);

      return new Blob([buffer], { type: 'audio/wav' });

      function writeString(dv, off, str) {
        for (var i = 0; i < str.length; i++) {
          dv.setUint8(off + i, str.charCodeAt(i));
        }
      }
    },

    /**
     * Play an audio data URL through HTML5 audio.
     * Creates or reuses the shared audio element.
     * @param {string} audioUrl - Data URL or remote URL
     */
    play: function (audioUrl) {
      if (!audioUrl) return;

      this.stop();
      _audio = new Audio(audioUrl);
      _isPlaying = true;

      _audio.addEventListener('ended', function () {
        _isPlaying = false;
        SQ.AudioGenerator._updateControls();
      });

      _audio.addEventListener('error', function () {
        console.warn('AudioGenerator: playback error');
        _isPlaying = false;
        SQ.AudioGenerator._updateControls();
      });

      var speed = SQ.PlayerConfig.getNarrationSpeed();
      _audio.play().then(function () {
        // Set playbackRate after play starts — avoids browser quirks with
        // setting rate on unstarted audio for some WAV/PCM formats.
        if (_audio) _audio.playbackRate = speed;
      }).catch(function (err) {
        // Autoplay blocked — user must interact first
        console.warn('AudioGenerator: autoplay blocked, user gesture required', err.message);
        _isPlaying = false;
        SQ.AudioGenerator._updateControls();
      });

      this._updateControls();
    },

    /**
     * Pause playback.
     */
    pause: function () {
      if (_audio && _isPlaying) {
        _audio.pause();
        _isPlaying = false;
        this._updateControls();
      }
    },

    /**
     * Resume playback.
     */
    resume: function () {
      if (_audio && !_isPlaying) {
        _audio.play().catch(function () {});
        _isPlaying = true;
        this._updateControls();
      }
    },

    /**
     * Toggle play/pause.
     */
    togglePlayPause: function () {
      if (_isPlaying) {
        this.pause();
      } else {
        this.resume();
      }
    },

    /**
     * Replay from the beginning.
     */
    replay: function () {
      if (_audio) {
        _audio.currentTime = 0;
        _audio.playbackRate = SQ.PlayerConfig.getNarrationSpeed();
        _audio.play().catch(function () {});
        _isPlaying = true;
        this._updateControls();
      }
    },

    /**
     * Stop and dispose of the audio element.
     */
    stop: function () {
      if (_audio) {
        _audio.pause();
        _audio.src = '';
        _audio = null;
      }
      _isPlaying = false;
      this._updateControls();
    },

    /**
     * Whether audio is currently playing.
     */
    isPlaying: function () {
      return _isPlaying;
    },

    /**
     * Update the UI audio controls to reflect current state.
     * @private
     */
    _updateControls: function () {
      var container = document.getElementById('audio-controls');
      if (!container) return;

      var playPauseBtn = document.getElementById('btn-audio-playpause');
      if (playPauseBtn) {
        // &#9654; = play, &#9646;&#9646; = pause
        playPauseBtn.innerHTML = _isPlaying ? '&#9646;&#9646;' : '&#9654;';
        playPauseBtn.title = _isPlaying ? 'Pause narration' : 'Play narration';
      }
    },

    /**
     * Show the audio controls bar.
     */
    showControls: function () {
      var container = document.getElementById('audio-controls');
      if (container) {
        container.classList.remove('hidden');
        this._updateControls();
      }
    },

    /**
     * Hide the audio controls bar.
     */
    hideControls: function () {
      var container = document.getElementById('audio-controls');
      if (container) container.classList.add('hidden');
    },

    /**
     * Mock audio generation for development.
     * Returns a tiny silent WAV after a simulated delay.
     * @private
     */
    _mockGenerate: function () {
      return new Promise(function (resolve) {
        setTimeout(function () {
          // Minimal valid WAV file (44 bytes header + 1 sample of silence)
          // This lets us test the full playback flow in mock mode.
          var header = 'UklGRiYAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQIAAAAAAA==';
          resolve('data:audio/wav;base64,' + header);
        }, 1000);
      });
    }
  };
})();
