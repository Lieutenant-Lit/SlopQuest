/**
 * SQ.VoiceProfileGenerator — Generates unique voice profiles for NPCs via LLM.
 * Each NPC gets a custom voice ID + style instruction (accent, tone, pacing, emotion)
 * tailored to their personality and the game's setting.
 */
(function () {
  // Build AVAILABLE_VOICES from the curated ElevenLabs list at runtime
  function getAvailableVoiceIds() {
    return SQ.PlayerConfig.VOICES.map(function (v) { return v.id; });
  }

  SQ.VoiceProfileGenerator = {
    /**
     * Generate voice profiles for the narrator and all NPCs in the skeleton.
     * Makes a single LLM call that returns profiles for the narrator + every NPC.
     * @param {object} skeleton - The story skeleton with npcs array
     * @param {object} meta - Game meta (setting, tone, writing_style, etc.)
     * @returns {Promise<Object>} { narrator: {voice, style}, npcs: { name → {voice, style} } }
     */
    generate: function (skeleton, meta) {
      if (SQ.useMockData) {
        return this._mockGenerate(skeleton);
      }

      var model = SQ.PlayerConfig.getModel('passage');
      var narratorGender = SQ.PlayerConfig.getNarratorGender();

      // Get the allowed voices for the narrator's gender
      var narratorVoices = SQ.PlayerConfig.getVoicesForGender(narratorGender);
      // Pick a random allowed voice to suggest (prevents LLM always picking the same one)
      var suggestedNarrator = narratorVoices[Math.floor(Math.random() * narratorVoices.length)];

      var npcList = '';
      if (skeleton && skeleton.npcs && skeleton.npcs.length > 0) {
        npcList = skeleton.npcs.map(function (npc) {
          return '- ' + npc.name + ': ' + npc.role
            + (npc.motivation ? ' (' + npc.motivation + ')' : '');
        }).join('\n');
      }

      // Build a voice catalog string for the LLM from the curated ElevenLabs list
      var voiceCatalog = SQ.PlayerConfig.VOICES.map(function (v) {
        return v.id + ' = ' + v.label + ' [' + v.gender + ']';
      }).join('\n');

      var narratorVoiceLabels = SQ.PlayerConfig.VOICES
        .filter(function (v) { return narratorVoices.indexOf(v.id) !== -1; })
        .map(function (v) { return v.id + ' (' + v.label + ')'; })
        .join(', ');

      var systemPrompt = 'You are a voice casting director for a high-budget full-cast audiobook. '
        + 'You assign distinct, memorable ElevenLabs voice profiles to characters AND the narrator.\n\n'
        + 'OUTPUT FORMAT: Respond with ONLY a valid JSON object. No markdown, no code fences.\n\n'
        + 'AVAILABLE ELEVENLABS VOICES:\n' + voiceCatalog + '\n\n'
        + 'RULES:\n'
        + '- The NARRATOR must use one of these ' + narratorGender.toUpperCase() + ' voices: ' + narratorVoiceLabels + '\n'
        + '  (Suggestion: try "' + suggestedNarrator + '" — but pick whichever best fits the story.)\n'
        + '- NEVER assign a voice from the wrong gender to the narrator.\n'
        + '- Each NPC should use a DIFFERENT voice from the narrator and from each other.\n'
        + '- For NPCs, pick voices from ANY gender that fits the character.\n'
        + '- Maximize variety — use the voice characteristics (deep, raspy, warm, etc.) to match character personality.\n\n'
        + 'For EACH entry (narrator + every NPC), create a "style" string — a performance direction for the TTS. '
        + 'This gets prepended as [bracketed acting instruction] before the text. Be specific about:\n'
        + '- Emotional delivery (cold, warm, menacing, cheerful, weary, dramatic, intimate, etc.)\n'
        + '- Pacing (fast/slow, clipped/flowing, deliberate, hurried, measured)\n'
        + '- Accent hints (British, Irish, Scottish, Cockney, archaic, etc.)\n'
        + '- Character energy (simmering anger, nervous tension, calm authority)\n'
        + '- Any speech quirks or mannerisms\n\n'
        + 'The narrator style should be crafted for reading prose — dramatic, immersive, suited to the setting.';

      var userPrompt = 'STORY SETTING: ' + (meta.setting || 'Fantasy') + '\n'
        + 'TONE: ' + (meta.tone || 'Dark and atmospheric') + '\n'
        + 'WRITING STYLE: ' + (meta.writing_style || 'Literary') + '\n\n';

      if (npcList) {
        userPrompt += 'CHARACTERS:\n' + npcList + '\n\n';
      }

      userPrompt += 'Respond with this exact JSON structure:\n'
        + '{\n'
        + '  "__narrator__": { "voice": "voice_id", "style": "detailed narrator style instruction" }';
      if (npcList) {
        userPrompt += ',\n  "NPC Name": { "voice": "voice_id", "style": "detailed character style instruction" }';
      }
      userPrompt += '\n}\n\n';
      if (npcList) {
        userPrompt += 'One entry per NPC using their exact names as keys, plus the "__narrator__" entry.';
      }

      var messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];

      return SQ.API.call(model, messages, { temperature: 0.9, max_tokens: 2000 })
        .then(function (raw) {
          var parsed = SQ.API.parseJSON(raw);
          if (!parsed || typeof parsed !== 'object') {
            console.warn('VoiceProfileGenerator: failed to parse response, using fallback');
            return SQ.VoiceProfileGenerator._fallbackGenerate(skeleton, narratorGender);
          }

          var result = { narrator: null, npcs: {} };

          // Extract narrator profile — validate voice is in correct gender category
          var availableVoices = getAvailableVoiceIds();
          var allowedNarratorVoices = SQ.PlayerConfig.getVoicesForGender(narratorGender);
          var narratorEntry = parsed['__narrator__'] || parsed['narrator'] || parsed['Narrator'];
          if (narratorEntry && narratorEntry.voice && narratorEntry.style) {
            var nVoice = narratorEntry.voice;
            // Must be both a valid voice AND in the correct gender category
            if (availableVoices.indexOf(nVoice) === -1 || allowedNarratorVoices.indexOf(nVoice) === -1) {
              console.warn('VoiceProfileGenerator: narrator voice "' + nVoice + '" not in ' + narratorGender + ' category, replacing');
              nVoice = allowedNarratorVoices[Math.floor(Math.random() * allowedNarratorVoices.length)];
            }
            result.narrator = { voice: nVoice, style: narratorEntry.style };
          } else {
            result.narrator = {
              voice: allowedNarratorVoices[Math.floor(Math.random() * allowedNarratorVoices.length)],
              style: 'Speak as a skilled narrator. Use a dramatic, immersive reading voice appropriate for a story.'
            };
          }

          // Extract NPC profiles
          if (skeleton && skeleton.npcs) {
            var narratorVoice = result.narrator.voice;
            skeleton.npcs.forEach(function (npc) {
              var entry = parsed[npc.name];
              if (entry && entry.voice && entry.style) {
                var voiceId = entry.voice;
                if (availableVoices.indexOf(voiceId) === -1) {
                  voiceId = SQ.VoiceProfileGenerator._pickFallbackVoice(result.npcs, narratorVoice);
                }
                result.npcs[npc.name] = { voice: voiceId, style: entry.style };
              } else {
                result.npcs[npc.name] = {
                  voice: SQ.VoiceProfileGenerator._pickFallbackVoice(result.npcs, narratorVoice),
                  style: 'Speak naturally with a distinctive voice appropriate for a ' + (npc.role || 'character') + '.'
                };
              }
            });
          }

          return result;
        })
        .catch(function (err) {
          console.warn('VoiceProfileGenerator: LLM call failed, using fallback');
          console.warn('  Error:', err.message || err);
          return SQ.VoiceProfileGenerator._fallbackGenerate(skeleton, narratorGender);
        });
    },

    /**
     * Pick a voice that hasn't been used yet, excluding narrator voice.
     * @private
     */
    _pickFallbackVoice: function (usedMap, narratorVoice) {
      var voices = getAvailableVoiceIds();
      var usedVoices = {};
      usedVoices[narratorVoice] = true;
      var keys = Object.keys(usedMap);
      for (var i = 0; i < keys.length; i++) {
        var v = usedMap[keys[i]];
        usedVoices[typeof v === 'string' ? v : v.voice] = true;
      }
      for (var j = 0; j < voices.length; j++) {
        if (!usedVoices[voices[j]]) return voices[j];
      }
      return voices[0];
    },

    /**
     * Simple fallback when LLM call fails — assign distinct voices without style.
     * @private
     */
    _fallbackGenerate: function (skeleton, narratorGender) {
      var genderPool = SQ.PlayerConfig.getVoicesForGender(narratorGender);
      var narratorVoice = genderPool[Math.floor(Math.random() * genderPool.length)];
      var pool = getAvailableVoiceIds().filter(function (v) { return v !== narratorVoice; });
      var result = {
        narrator: {
          voice: narratorVoice,
          style: 'Speak as a skilled narrator. Use a dramatic, immersive reading voice appropriate for a story.'
        },
        npcs: {}
      };
      if (skeleton && skeleton.npcs) {
        skeleton.npcs.forEach(function (npc, i) {
          result.npcs[npc.name] = {
            voice: pool[i % pool.length],
            style: 'Speak naturally with a distinctive voice appropriate for a ' + (npc.role || 'character') + '.'
          };
        });
      }
      return result;
    },

    /**
     * Mock voice profile generation for development.
     * @private
     */
    _mockGenerate: function (skeleton) {
      var gender = SQ.PlayerConfig.getNarratorGender();
      var mockVoice = SQ.PlayerConfig._defaultVoiceForGender(gender);
      var result = {
        narrator: {
          voice: mockVoice,
          style: 'Voice: Deep, rich, commanding. Tone: Dramatic, immersive, like a veteran storyteller. Pacing: Measured and deliberate. Accent: Refined British. Emotion: Gravitas and dark humor.'
        },
        npcs: {}
      };
      var mockProfiles = [
        { voice: 'XrExE9yKIg1WjnnlVkGX', style: 'Warm but hardened. Passionate, determined. Measured but urgent. Slight Irish lilt. Fierce conviction tempered by weariness.' },
        { voice: '2EiwWnXFnvU5JabPnv8n', style: 'Deep, gravelly. Cold, clipped military precision. Short sharp sentences. Northern English gruffness. Stoic, controlled anger.' },
        { voice: 'ThT5KcBeYPX3keUQqHPh', style: 'Quiet, deliberate, ethereal. Detached, contemplative. Very slow and precise. Refined old-world. Cold curiosity.' },
        { voice: 'JBFqnCBsd6RMkjVDRZzb', style: 'Smooth, refined, condescending. Theatrical, self-important. Languid, unhurried. Upper-class British. Barely concealed ambition.' },
        { voice: 'pFZP5JQG7iQjIQuC4Bku', style: 'Quick, bright, scrappy. Cheeky, streetwise. Fast and darting. Cockney-influenced. Wary bravado masking vulnerability.' }
      ];

      if (skeleton && skeleton.npcs) {
        skeleton.npcs.forEach(function (npc, i) {
          var profile = mockProfiles[i % mockProfiles.length];
          result.npcs[npc.name] = { voice: profile.voice, style: profile.style };
        });
      }

      return Promise.resolve(result);
    }
  };
})();
