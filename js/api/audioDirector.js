/**
 * SQ.AudioDirector — Full-cast audio play engine using ElevenLabs.
 *
 * Replaces the old SQ.AudioGenerator (GPT-4o Audio via OpenRouter).
 * When narration is enabled, the Audio Director:
 *   1. Sends the passage + game state to Claude Sonnet for analysis
 *   2. Gets back a structured "audio script" (narration vs dialogue segments)
 *   3. Assigns unique ElevenLabs voices to each character (persistent across turns)
 *   4. Generates TTS audio for each segment via ElevenLabs API
 *   5. Plays segments sequentially for a full-cast audio play experience
 *
 * Voice registry is persisted to localStorage so characters keep their voices
 * across sessions. Even unnamed NPCs ("a guard") get unique voices.
 *
 * Only makes API calls when narration is enabled (SQ.PlayerConfig.isNarrationEnabled()).
 */
(function () {
  var ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1';
  var ELEVENLABS_TIMEOUT_MS = 30000;
  var ANALYSIS_MODEL = 'anthropic/claude-sonnet-4';
  var VOICE_REGISTRY_KEY = 'slopquest_voice_registry';
  var VOICE_CACHE_KEY = 'slopquest_elevenlabs_voices';

  /** Cached list of available ElevenLabs voices. */
  var _availableVoices = null;

  /** Current playback state. */
  var _segments = [];        // Array of { audio: Audio, text: string, speaker: string }
  var _currentIndex = 0;
  var _isPlaying = false;
  var _isPaused = false;

  /** Abort controller for in-flight generation. */
  var _abortController = null;

  /** On-demand generation: passage queued but not yet generated. */
  var _pendingPassage = null;
  var _pendingGameState = null;

  /** Last analysis result for audio debug overlay. */
  var _lastAnalysis = null;
  var _lastAnalysisSegments = null;

  SQ.AudioDirector = {
    // ========================================================
    // PUBLIC API
    // ========================================================

    /**
     * Generate and play full-cast audio for a passage.
     * This is the main entry point called from the game loop.
     * @param {string} passage - The passage text
     * @param {object} gameState - Full game state for context
     * @returns {Promise<boolean>} True if audio was generated successfully
     */
    generate: function (passage, gameState) {
      if (!passage) return Promise.resolve(false);
      if (!SQ.PlayerConfig.isNarrationEnabled()) return Promise.resolve(false);

      // Stop any in-progress playback
      this.stop();

      if (SQ.useMockData) {
        return this._mockGenerate();
      }

      var elevenLabsKey = SQ.PlayerConfig.getElevenLabsApiKey();
      if (!elevenLabsKey) {
        SQ.Logger.warn('Audio', 'No ElevenLabs API key configured');
        return Promise.resolve(false);
      }

      _abortController = new AbortController();
      var self = this;

      return this._ensureVoicesLoaded()
        .then(function () {
          // Run segmentation and voice casting in parallel
          return Promise.all([
            self._segmentPassage(passage, gameState),
            self._castVoices(passage, gameState)
          ]);
        })
        .then(function (results) {
          var segmentResult = results[0];
          // results[1] = casting (already applied to registry via _validateAndApplyVoiceAssignments)

          if (!segmentResult || !segmentResult.segments || segmentResult.segments.length === 0) {
            SQ.Logger.warn('Audio', 'LLM returned empty audio script');
            return false;
          }
          _lastAnalysisSegments = segmentResult.segments;
          return self._generateAllSegments(segmentResult.segments, gameState);
        })
        .then(function (success) {
          // Fire debug event AFTER voice assignment so registry has actual voices
          if (_lastAnalysisSegments) {
            _lastAnalysis = {
              segments: _lastAnalysisSegments,
              ttsSegments: _segments.map(function (s) {
                return { text: s.text, speaker: s.speaker, index: s.index };
              }),
              registry: self._loadRegistry(),
              availableVoices: _availableVoices || []
            };
            document.dispatchEvent(new CustomEvent('audiodebug', { detail: _lastAnalysis }));
            _lastAnalysisSegments = null;
          }
          if (success && _segments.length > 0) {
            self.showControls();
            self._playSegment(0);
            return true;
          }
          return false;
        })
        .catch(function (err) {
          if (err.name === 'AbortError') return false;
          SQ.Logger.warn('Audio', 'Generation failed, degrading to text-only', { error: err.message || String(err) });
          return false;
        });
    },

    /**
     * Queue a passage for on-demand audio generation.
     * Shows the play button without generating audio — generation
     * happens when the user clicks play.
     */
    prepareForPassage: function (passage, gameState) {
      this.stop();
      _pendingPassage = passage;
      _pendingGameState = gameState;
      _segments = [];
      _lastAnalysis = null;
      this.showControls();
      this._updateControls();
    },

    getLastAnalysis: function () {
      return _lastAnalysis;
    },

    hasPendingOrActive: function () {
      return !!_pendingPassage || _segments.length > 0;
    },

    // ========================================================
    // PASSAGE ANALYSIS (Claude Sonnet via OpenRouter)
    // ========================================================

    /**
     * Build a compact voice catalog string for the LLM prompt.
     * Each voice gets one line with its key metadata.
     * @private
     */
    _buildVoiceCatalog: function () {
      if (!_availableVoices || _availableVoices.length === 0) return '';

      var voices = _availableVoices;

      // If list is very large, filter out less relevant use cases
      if (voices.length > 120) {
        var filtered = voices.filter(function (v) {
          var uc = ((v.labels || {}).use_case || '').toLowerCase();
          return !/\b(ivr|phone|informational)\b/.test(uc);
        });
        if (filtered.length > 0) voices = filtered;
      }

      return voices.map(function (v) {
        var labels = v.labels || {};
        var traits = [labels.gender, labels.age, labels.accent].filter(Boolean).join(', ');
        var useCase = labels.use_case || '';
        var parts = ['ID:' + v.voice_id, '"' + v.name + '"', traits];
        if (useCase) parts.push(useCase);
        // Include the rich voice description from ElevenLabs (full blurb)
        if (v.description) parts.push('— ' + v.description);
        return parts.filter(Boolean).join(' | ');
      }).join('\n');
    },

    /**
     * Build a compact game context string for the LLM prompt.
     * Provides genre, tone, setting, NPCs, and relationships for intelligent casting.
     * @private
     */
    _buildGameContext: function (gameState) {
      if (!gameState) return '';
      var parts = [];

      var meta = gameState.meta || {};
      if (meta.title) parts.push('Title: ' + meta.title);
      if (meta.setting) parts.push('Setting: ' + meta.setting);
      if (meta.tone) parts.push('Tone: ' + meta.tone);
      if (meta.writing_style) parts.push('Writing style: ' + meta.writing_style);

      var skel = gameState.skeleton || {};
      if (skel.setting) {
        if (skel.setting.name) parts.push('World: ' + skel.setting.name);
        if (skel.setting.description) parts.push('World description: ' + skel.setting.description);
      }

      if (skel.npcs && skel.npcs.length > 0) {
        var npcLines = skel.npcs.map(function (npc) {
          var bits = [npc.name];
          if (npc.role) bits.push('role: ' + npc.role);
          if (npc.motivation) bits.push('motivation: ' + npc.motivation);
          if (npc.allegiance) bits.push('allegiance: ' + npc.allegiance);
          return '  ' + bits.join(', ');
        });
        parts.push('Story NPCs:\n' + npcLines.join('\n'));
      }

      var cur = gameState.current || {};
      var sceneParts = [];
      if (cur.act) sceneParts.push('Act: ' + cur.act);
      if (cur.location) sceneParts.push('Location: ' + cur.location);
      if (cur.time_of_day) sceneParts.push('Time: ' + cur.time_of_day);
      if (cur.scene_context) sceneParts.push('Scene: ' + cur.scene_context);
      if (sceneParts.length > 0) parts.push(sceneParts.join(' | '));

      var player = gameState.player || {};
      var playerBits = [];
      if (player.name) playerBits.push(player.name);
      if (player.archetype) playerBits.push('archetype: ' + player.archetype);
      if (playerBits.length > 0) parts.push('Player character: ' + playerBits.join(', '));

      var rels = gameState.relationships || {};
      var relKeys = Object.keys(rels);
      if (relKeys.length > 0) {
        var relPairs = relKeys.map(function (k) { return k + ': ' + rels[k]; });
        parts.push('Relationships: ' + relPairs.join(', '));
      }

      return parts.join('\n');
    },

    /**
     * Validate and apply voice assignments from LLM response to the registry.
     * Falls back to keyword matching if the LLM returns invalid voice IDs.
     * @private
     */
    _validateAndApplyVoiceAssignments: function (audioScript, gameState) {
      var registry = this._loadRegistry();

      // Build lookup of valid voice IDs and reverse name-to-ID map
      var validVoiceIds = {};
      var voiceNameMap = {};
      var nameToVoiceId = {};
      var normalizedNameToVoiceId = {};
      if (_availableVoices) {
        _availableVoices.forEach(function (v) {
          validVoiceIds[v.voice_id] = v;
          voiceNameMap[v.voice_id] = v.name;
          nameToVoiceId[v.name.toLowerCase()] = v.voice_id;
          // Normalized: strip all non-alphanumeric for fuzzy matching
          var norm = v.name.toLowerCase().replace(/[^a-z0-9]/g, '');
          normalizedNameToVoiceId[norm] = v.voice_id;
        });
      }

      // Build set of already-used voice IDs for fallback dedup
      var usedVoiceIds = {};
      for (var key in registry) {
        if (registry.hasOwnProperty(key) && registry[key].voice_id) {
          usedVoiceIds[registry[key].voice_id] = true;
        }
      }

      var changed = false;
      var self = this;

      // Helper: assign a voice by ID, with fallback to keyword matching
      var applyAssignment = function (characterKey, voiceId, description, justification) {
        // Skip if already in registry
        if (registry[characterKey] && registry[characterKey].voice_id) {
          var cachedId = registry[characterKey].voice_id;
          var stillAvailable = !_availableVoices || validVoiceIds[cachedId];
          if (stillAvailable) return;
        }

        // If voiceId is actually a name, resolve it to the real ID
        if (voiceId && !validVoiceIds[voiceId]) {
          var lower = voiceId.toLowerCase();
          // Try exact name match first
          var resolved = nameToVoiceId[lower];
          // Try normalized match (strips dashes, spaces, punctuation)
          if (!resolved) {
            var norm = lower.replace(/[^a-z0-9]/g, '');
            resolved = normalizedNameToVoiceId[norm];
          }
          // Try matching just the first word (e.g. "Valory" from "Valory - Intimate, Warm...")
          if (!resolved) {
            var firstWord = lower.split(/[\s\-\u2013\u2014,]+/)[0];
            if (firstWord && firstWord.length > 2) {
              for (var nm in nameToVoiceId) {
                if (nm.split(/[\s\-\u2013\u2014,]+/)[0] === firstWord) {
                  resolved = nameToVoiceId[nm];
                  break;
                }
              }
            }
          }
          if (resolved) {
            SQ.Logger.info('Audio', 'Resolved voice name', { voiceName: voiceId, resolvedId: resolved });
            voiceId = resolved;
          }
        }

        if (voiceId && validVoiceIds[voiceId]) {
          registry[characterKey] = {
            voice_id: voiceId,
            voice_name: voiceNameMap[voiceId] || '',
            description: description || '',
            justification: justification || ''
          };
          usedVoiceIds[voiceId] = true;
          changed = true;
          SQ.Logger.info('Audio', 'Voice cast', { character: characterKey, voice: voiceNameMap[voiceId] || voiceId, justification: justification });
        } else {
          // Fallback to keyword matching
          if (voiceId) {
            SQ.Logger.warn('Audio', 'Fallback: invalid voice_id from LLM', { character: characterKey, voiceId: voiceId });
          } else {
            SQ.Logger.warn('Audio', 'Fallback: no voice_id from LLM', { character: characterKey });
          }
          var bestVoice = self._fallbackMatchVoice(description || '', usedVoiceIds);
          if (bestVoice) {
            registry[characterKey] = {
              voice_id: bestVoice.voice_id,
              voice_name: bestVoice.name,
              description: description || '',
              justification: '(FALLBACK: keyword matching — LLM did not provide a valid voice_id)'
            };
            usedVoiceIds[bestVoice.voice_id] = true;
            changed = true;
            SQ.Logger.warn('Audio', 'Fallback voice assigned', { character: characterKey, voice: bestVoice.name });
          }
        }
      };

      // Apply narrator voice (support both object and bare ID formats)
      var narratorVoice = audioScript.narrator_voice || {};
      var narratorVoiceId = narratorVoice.voice_id || audioScript.narrator_voice_id;
      var narratorGender = (gameState && gameState.narrator && gameState.narrator.voice_gender) || '';
      var narratorDirection = (gameState && gameState.narrator && gameState.narrator.voice_direction) || '';
      var narratorFallbackDesc = [narratorGender, narratorDirection, 'narrator, storytelling'].filter(Boolean).join(', ');
      var narratorDesc = narratorVoice.voice_description || narratorFallbackDesc;
      applyAssignment('__narrator__', narratorVoiceId, narratorDesc, narratorVoice.justification);

      // Apply player character voice (support both object and bare ID formats)
      var playerName = (gameState && gameState.player && gameState.player.name) || '';
      if (playerName) {
        var playerVoice = audioScript.player_voice || {};
        var playerVoiceId = playerVoice.voice_id || audioScript.player_voice_id;
        var playerGender = (gameState && gameState.player && gameState.player.voice_gender) || '';
        var playerDirection = (gameState && gameState.player && gameState.player.voice_direction) || '';
        var playerFallbackDesc = [playerGender, playerDirection, 'protagonist'].filter(Boolean).join(', ');
        var playerDesc = playerVoice.voice_description || playerFallbackDesc;
        applyAssignment(playerName, playerVoiceId, playerDesc, playerVoice.justification);
      }

      // Apply NPC voice assignments
      var assignments = audioScript.voice_assignments || {};
      for (var charName in assignments) {
        if (assignments.hasOwnProperty(charName)) {
          var entry = assignments[charName];
          applyAssignment(charName, entry.voice_id, entry.voice_description || '', entry.justification || '');
        }
      }

      if (changed) {
        this._saveRegistry(registry);
      }

      return audioScript;
    },

    /**
     * Segment a passage into narration and dialogue chunks.
     * This is a focused, lean LLM call — no voice casting, no catalog.
     * @private
     */
    _segmentPassage: function (passage, gameState) {
      var playerName = (gameState && gameState.player && gameState.player.name) || 'The Wanderer';

      // Build known character names from registry for speaker identification
      var registry = this._loadRegistry();
      var knownNames = Object.keys(registry).filter(function (k) {
        return k !== '__narrator__';
      });

      var p = '';
      p += 'You are an Audio Director for an interactive narrative game.\n';
      p += 'Your ONLY job is to break a story passage into audio segments for a full-cast audio play.\n';
      p += 'You do NOT assign voices — only segment the text.\n\n';

      p += 'SEGMENT RULES:\n';
      p += '- Break the passage into "narration" (descriptive text) and "dialogue" (spoken lines) segments.\n';
      p += '- EVERY sentence MUST appear in exactly one segment. Do NOT skip or omit any text.\n';
      p += '- Action beats and narrative between dialogue (e.g., "she says", "he mutters",\n';
      p += '  "you call out cheerfully") are NARRATION segments. NEVER merge them into dialogue.\n';
      p += '- Preserve the EXACT text from the passage. Do not paraphrase or alter wording.\n';
      p += '- For dialogue, include the EXACT text INCLUDING quotation marks.\n';
      p += '- Action beats between dialogue lines MUST be their own narration segments.\n';
      p += '  Do NOT merge them into the preceding or following dialogue segment.\n';
      p += '- Attribution phrases like "he said" or "she whispered" are NARRATION, not dialogue.\n\n';

      p += 'The PLAYER CHARACTER is named "' + playerName + '". When the passage describes the player\n';
      p += 'speaking (e.g., "you say", "you call out", "you reply"), use speaker name "' + playerName + '".\n';
      p += 'For unnamed characters use descriptive identifiers like "Gate Guard" or "Bartender".\n\n';

      if (knownNames.length > 0) {
        p += 'KNOWN CHARACTERS (use these exact names if they appear): ' + knownNames.join(', ') + '\n\n';
      }

      // Minimal scene context for speaker identification
      var cur = (gameState && gameState.current) || {};
      if (cur.location || cur.scene_context) {
        p += 'SCENE CONTEXT: ';
        if (cur.location) p += 'Location: ' + cur.location + '. ';
        if (cur.scene_context) p += cur.scene_context;
        p += '\n\n';
      }

      p += 'Respond with ONLY valid JSON in this format:\n';
      p += '{\n';
      p += '  "segments": [\n';
      p += '    { "type": "narration", "text": "The guard stepped forward." },\n';
      p += '    { "type": "dialogue", "speaker": "Gate Guard", "text": "\\"Halt! Who goes there?\\"" },\n';
      p += '    { "type": "narration", "text": "he barked, gripping his spear." }\n';
      p += '  ]\n';
      p += '}\n';

      var userPrompt = 'Break this passage into audio segments:\n\n' + passage;

      return SQ.API.call(ANALYSIS_MODEL, [
        { role: 'system', content: p },
        { role: 'user', content: userPrompt }
      ], {
        temperature: 0.3,
        max_tokens: 2000
      }).then(function (response) {
        try {
          return SQ.API.parseJSON(response);
        } catch (e) {
          SQ.Logger.warn('Audio', 'Failed to parse segmentation JSON', { error: e.message });
          return { segments: [{ type: 'narration', text: passage }] };
        }
      });
    },

    /**
     * Cast voices for characters in a passage.
     * This is a focused LLM call — no segmentation, only voice assignment.
     * Runs in parallel with _segmentPassage.
     * @private
     */
    _castVoices: function (passage, gameState) {
      var self = this;
      var registry = this._loadRegistry();
      var playerName = (gameState && gameState.player && gameState.player.name) || 'The Wanderer';

      var p = '';
      p += 'You are a Casting Director for an interactive narrative audio play.\n';
      p += 'Your ONLY job is to assign ElevenLabs voices to characters. You do NOT segment text.\n\n';

      // Game context for intelligent casting
      var gameContext = this._buildGameContext(gameState);
      if (gameContext) {
        p += 'GAME CONTEXT:\n' + gameContext + '\n\n';
      }

      // Voice catalog
      var voiceCatalog = this._buildVoiceCatalog();
      if (voiceCatalog) {
        p += 'AVAILABLE ELEVENLABS VOICES (you MUST select from these only):\n';
        p += voiceCatalog + '\n\n';
      }

      // Already-assigned voices
      var assignedLines = [];
      var registryKeys = Object.keys(registry);
      registryKeys.forEach(function (k) {
        var entry = registry[k];
        if (entry && entry.voice_id) {
          var label = k === '__narrator__' ? 'Narrator' : k;
          assignedLines.push(label + ' -> ID:' + entry.voice_id + ' "' + (entry.voice_name || '') + '"');
        }
      });

      if (assignedLines.length > 0) {
        p += 'ALREADY ASSIGNED VOICES (locked — do NOT reassign or change these):\n';
        p += assignedLines.join('\n') + '\n\n';
      }

      // Assignment instructions
      var needsNarrator = !registry['__narrator__'] || !registry['__narrator__'].voice_id;
      var needsPlayer = !registry[playerName] || !registry[playerName].voice_id;

      p += 'VOICE ASSIGNMENT INSTRUCTIONS:\n';
      if (needsNarrator) {
        var nGender = (gameState && gameState.narrator && gameState.narrator.voice_gender) || '';
        var nDirection = (gameState && gameState.narrator && gameState.narrator.voice_direction) || '';
        p += '- SELECT a narrator voice. User preference: gender="' + nGender + '", direction="' + nDirection + '".\n';
        p += '  RESPECT the user\'s accent/style preferences. Return as "narrator_voice" object.\n';
      }
      if (needsPlayer) {
        var pGender = (gameState && gameState.player && gameState.player.voice_gender) || '';
        var pDirection = (gameState && gameState.player && gameState.player.voice_direction) || '';
        var pArchetype = (gameState && gameState.player && gameState.player.archetype) || '';
        p += '- SELECT a voice for player character "' + playerName + '". User preference: gender="' + pGender + '", direction="' + pDirection + '", archetype="' + pArchetype + '".\n';
        p += '  RESPECT the user\'s accent/style preferences. Return as "player_voice" object.\n';
      }
      p += '- For any NEW speaking character in the passage not already assigned above, select a voice_id from the catalog.\n';
      p += '- For unnamed characters, use descriptive identifiers like "Gate Guard" or "Bartender" as the character key in voice_assignments.\n';
      p += '- Use the game\'s genre, tone, setting, and each character\'s role/personality to make intelligent casting decisions.\n';
      p += '- STRONGLY prefer voice diversity — avoid reusing voice IDs already assigned to other characters.\n';
      p += '- For EVERY voice assignment, provide:\n';
      p += '  - voice_description: brief description of the voice qualities\n';
      p += '  - justification: explain WHY you chose this specific voice over alternatives,\n';
      p += '    referencing the voice\'s catalog description, the character/role, and user preferences if applicable.\n\n';

      // Response schema — voice assignments only
      p += 'Respond with ONLY valid JSON in this format:\n';
      p += '{\n';
      p += '  "voice_assignments": {\n';
      p += '    "Character Name": { "voice_id": "<id>", "voice_description": "gruff male, middle-aged, stern", "justification": "why this voice fits" }\n';
      p += '  }';
      if (needsNarrator) p += ',\n  "narrator_voice": { "voice_id": "<id>", "voice_description": "...", "justification": "why this voice fits the narrator, referencing user preferences" }';
      if (needsPlayer) p += ',\n  "player_voice": { "voice_id": "<id>", "voice_description": "...", "justification": "why this voice fits the player character" }';
      p += '\n}\n';
      p += 'voice_assignments should ONLY contain NEW characters not in the already-assigned list.\n';

      var userPrompt = 'Read this passage and assign voices for any characters who speak:\n\n' + passage;

      return SQ.API.call(ANALYSIS_MODEL, [
        { role: 'system', content: p },
        { role: 'user', content: userPrompt }
      ], {
        temperature: 0.3,
        max_tokens: 2000
      }).then(function (response) {
        try {
          var castResult = SQ.API.parseJSON(response);
          // Validate and apply voice assignments to registry
          self._validateAndApplyVoiceAssignments(castResult, gameState);
          return castResult;
        } catch (e) {
          SQ.Logger.warn('Audio', 'Failed to parse casting JSON', { error: e.message });
          return { voice_assignments: {} };
        }
      });
    },

    // ========================================================
    // VOICE REGISTRY (localStorage persistence)
    // ========================================================

    /**
     * Load voice registry from localStorage.
     * Maps character names to { voice_id, voice_name, description }.
     * @private
     */
    _loadRegistry: function () {
      try {
        var raw = localStorage.getItem(VOICE_REGISTRY_KEY);
        if (raw) return JSON.parse(raw);
      } catch (e) {
        SQ.Logger.warn('Audio', 'Failed to load voice registry', { error: e.message });
      }
      return {};
    },

    /**
     * Save voice registry to localStorage.
     * @private
     */
    _saveRegistry: function (registry) {
      localStorage.setItem(VOICE_REGISTRY_KEY, JSON.stringify(registry));
    },

    /**
     * Fuzzy-match a speaker name against registry keys.
     * Handles name mismatches between parallel segmentation/casting calls
     * (e.g. "Gate Guard" vs "Guard").
     * @private
     */
    _fuzzyRegistryLookup: function (registry, speaker) {
      var speakerLower = speaker.toLowerCase();
      var keys = Object.keys(registry).filter(function (k) {
        return k !== '__narrator__';
      });

      // 1. Case-insensitive exact match
      for (var i = 0; i < keys.length; i++) {
        if (keys[i].toLowerCase() === speakerLower) {
          SQ.Logger.info('Audio', 'Fuzzy match (case)', { speaker: speaker, matched: keys[i] });
          return registry[keys[i]];
        }
      }

      // 2. Substring containment (only if exactly 1 match to avoid ambiguity)
      var substringMatches = [];
      for (var j = 0; j < keys.length; j++) {
        var keyLower = keys[j].toLowerCase();
        if (speakerLower.indexOf(keyLower) !== -1 || keyLower.indexOf(speakerLower) !== -1) {
          substringMatches.push(keys[j]);
        }
      }
      if (substringMatches.length === 1) {
        SQ.Logger.info('Audio', 'Fuzzy match (substring)', { speaker: speaker, matched: substringMatches[0] });
        return registry[substringMatches[0]];
      }

      // 3. Word overlap scoring (e.g. "Gate Guard" vs "Guard" = 1/2 = 0.5)
      var speakerWords = speakerLower.split(/\s+/);
      var bestKey = null;
      var bestScore = 0;
      for (var k = 0; k < keys.length; k++) {
        var keyWords = keys[k].toLowerCase().split(/\s+/);
        var overlap = 0;
        for (var w = 0; w < speakerWords.length; w++) {
          if (keyWords.indexOf(speakerWords[w]) !== -1) overlap++;
        }
        var score = overlap / Math.max(speakerWords.length, keyWords.length);
        if (score > bestScore && score >= 0.5) {
          bestScore = score;
          bestKey = keys[k];
        }
      }
      if (bestKey) {
        SQ.Logger.info('Audio', 'Fuzzy match (word overlap)', { speaker: speaker, matched: bestKey });
        return registry[bestKey];
      }

      return null;
    },

    /**
     * Clear the voice registry (e.g., on new game).
     */
    clearRegistry: function () {
      localStorage.removeItem(VOICE_REGISTRY_KEY);
    },

    /**
     * Fallback: match a voice description to the best available ElevenLabs voice
     * using keyword scoring. Only used when the LLM fails to return a valid voice_id.
     * @private
     */
    _fallbackMatchVoice: function (description, usedVoiceIds) {
      SQ.Logger.warn('Audio', 'Falling back to keyword matching', { description: description });
      if (!_availableVoices || _availableVoices.length === 0) return null;

      var desc = (description || '').toLowerCase();

      // Gender detection
      var wantsFemale = /\b(female|woman|girl|she|her)\b/.test(desc);
      var wantsMale = /\b(male|man|boy|he|him|gruff|deep|baritone)\b/.test(desc);

      // Score each voice
      var scored = _availableVoices.map(function (voice) {
        var score = 0;
        var labels = (voice.labels || {});
        var voiceGender = (labels.gender || '').toLowerCase();
        var voiceAge = (labels.age || '').toLowerCase();
        var voiceDesc = (labels.description || '').toLowerCase();
        var voiceUseCase = (labels.use_case || '').toLowerCase();
        var voiceAccent = (labels.accent || '').toLowerCase();

        // Gender matching (strong signal)
        if (wantsFemale && voiceGender === 'female') score += 10;
        if (wantsMale && voiceGender === 'male') score += 10;
        if (wantsFemale && voiceGender === 'male') score -= 10;
        if (wantsMale && voiceGender === 'female') score -= 10;

        // Age matching
        if (/\b(young|youth)\b/.test(desc) && /young/.test(voiceAge)) score += 3;
        if (/\b(old|elderly|aged)\b/.test(desc) && /old/.test(voiceAge)) score += 3;
        if (/\bmiddle.aged\b/.test(desc) && /middle/.test(voiceAge)) score += 3;

        // Expanded vocal quality matching
        var qualityTerms = [
          'deep', 'warm', 'raspy', 'smooth', 'soft', 'crisp', 'husky',
          'gentle', 'strong', 'bright', 'rich', 'thin', 'thick',
          'hoarse', 'clear', 'rough', 'sweet', 'powerful', 'light',
          'gravelly', 'silky', 'breathy', 'sharp', 'calm', 'intense'
        ];
        qualityTerms.forEach(function (term) {
          var re = new RegExp('\\b' + term + '\\b');
          if (re.test(desc) && re.test(voiceDesc)) score += 2;
        });

        // Use-case matching
        if (/narrat|story|audiobook/.test(voiceUseCase)) {
          if (desc === '' || /narrat|story/.test(desc)) score += 5;
        }
        if (/character|animated|gaming/.test(voiceUseCase)) {
          if (/character|animated|gaming/.test(desc)) score += 3;
          // Prefer character voices for any non-narrator dialogue
          if (desc !== '') score += 2;
        }
        if (desc !== '' && /conversat/.test(voiceUseCase)) score += 1;

        // Word overlap: shared words between LLM description and voice labels
        var voiceText = [voiceDesc, voiceUseCase, voiceAccent].join(' ');
        var descWords = desc.split(/[\s,]+/).filter(function (w) { return w.length > 3; });
        descWords.forEach(function (word) {
          if (voiceText.indexOf(word) !== -1) score += 1;
        });

        // Penalty for already-used voices (prefer unique assignments)
        if (usedVoiceIds[voice.voice_id]) score -= 8;

        return { voice: voice, score: score };
      });

      // Sort by score descending
      scored.sort(function (a, b) { return b.score - a.score; });

      SQ.Logger.info('Audio', 'Voice match', { description: description, top: scored.slice(0, 3).map(function (s) { return s.voice.name + ' (' + s.score + ')'; }).join(', ') });

      return scored[0].voice;
    },

    // ========================================================
    // ELEVENLABS API
    // ========================================================

    /**
     * Fetch and cache available voices from ElevenLabs.
     * Only fetches once per session (or if cache is empty).
     * @private
     */
    _ensureVoicesLoaded: function () {
      if (_availableVoices && _availableVoices.length > 0) {
        return Promise.resolve();
      }

      // Try localStorage cache first
      try {
        var cached = localStorage.getItem(VOICE_CACHE_KEY);
        if (cached) {
          _availableVoices = JSON.parse(cached);
          if (_availableVoices.length > 0) return Promise.resolve();
        }
      } catch (e) { /* ignore */ }

      var apiKey = SQ.PlayerConfig.getElevenLabsApiKey();
      if (!apiKey) return Promise.reject(new Error('No ElevenLabs API key'));

      return fetch(ELEVENLABS_BASE + '/voices', {
        method: 'GET',
        headers: { 'xi-api-key': apiKey }
      })
        .then(function (response) {
          if (!response.ok) {
            throw new Error('ElevenLabs voices fetch failed: HTTP ' + response.status);
          }
          return response.json();
        })
        .then(function (data) {
          _availableVoices = (data.voices || []).map(function (v) {
            return {
              voice_id: v.voice_id,
              name: v.name,
              description: v.description || '',
              category: v.category || 'premade',
              labels: v.labels || {},
              preview_url: v.preview_url
            };
          });

          // Filter out default/premade voices if user disabled them
          if (SQ.PlayerConfig.isDisableDefaultVoicesEnabled()) {
            var filtered = _availableVoices.filter(function (v) {
              return v.category !== 'premade';
            });
            if (filtered.length > 0) _availableVoices = filtered;
          }

          // Cache to localStorage
          try {
            localStorage.setItem(VOICE_CACHE_KEY, JSON.stringify(_availableVoices));
          } catch (e) { /* ignore quota errors */ }

          SQ.Logger.info('Audio', 'Loaded voices from ElevenLabs', { count: _availableVoices.length });
        });
    },

    /**
     * Generate TTS audio for a single text segment via ElevenLabs.
     * @param {string} text - Text to synthesize
     * @param {string} voiceId - ElevenLabs voice_id
     * @param {object} [settings] - Voice settings overrides
     * @returns {Promise<string>} Blob URL for audio playback
     * @private
     */
    _generateSegmentAudio: function (text, voiceId, settings) {
      var apiKey = SQ.PlayerConfig.getElevenLabsApiKey();
      if (!apiKey || !voiceId) return Promise.reject(new Error('Missing API key or voice'));

      settings = settings || {};
      var body = {
        text: text,
        model_id: 'eleven_flash_v2_5',
        voice_settings: {
          stability: settings.stability || 0.5,
          similarity_boost: settings.similarity_boost || 0.75,
          style: settings.style || 0.0,
          use_speaker_boost: false
        }
      };

      var controller = _abortController;
      var timeoutId = setTimeout(function () {
        if (controller) controller.abort();
      }, ELEVENLABS_TIMEOUT_MS);

      return fetch(ELEVENLABS_BASE + '/text-to-speech/' + voiceId + '?output_format=mp3_44100_128', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': apiKey
        },
        body: JSON.stringify(body),
        signal: controller ? controller.signal : undefined
      })
        .then(function (response) {
          clearTimeout(timeoutId);
          if (!response.ok) {
            return response.text().then(function (text) {
              throw new Error('ElevenLabs TTS failed: HTTP ' + response.status + ' - ' + text.slice(0, 200));
            });
          }
          return response.arrayBuffer();
        })
        .then(function (buffer) {
          SQ.Logger.info('Audio', 'Segment audio buffer', { byteLength: buffer.byteLength });
          if (buffer.byteLength === 0) {
            throw new Error('ElevenLabs returned empty audio');
          }
          var blob = new Blob([buffer], { type: 'audio/mpeg' });
          return URL.createObjectURL(blob);
        })
        .catch(function (err) {
          clearTimeout(timeoutId);
          throw err;
        });
    },

    /**
     * Generate audio for all segments in the audio script.
     * Assigns voices, then generates TTS for each segment sequentially
     * (to avoid hammering the API and to respect rate limits).
     * @private
     */
    _generateAllSegments: function (segments, gameState) {
      var self = this;
      _segments = [];

      // Voice assignments are already applied to the registry by
      // _validateAndApplyVoiceAssignments() during passage analysis.
      var registry = this._loadRegistry();

      // Generate segments sequentially to respect rate limits
      var chain = Promise.resolve();
      segments.forEach(function (seg, i) {
        chain = chain.then(function () {
          // Check if aborted
          if (_abortController && _abortController.signal.aborted) {
            throw new DOMException('Aborted', 'AbortError');
          }

          var voiceId;
          var speaker;
          var voiceSettings = {};

          if (seg.type === 'dialogue' && seg.speaker) {
            speaker = seg.speaker;
            var entry = registry[seg.speaker] || self._fuzzyRegistryLookup(registry, seg.speaker);
            voiceId = entry ? entry.voice_id : null;
            // Dialogue: expressive character performance
            voiceSettings.stability = 0.30;
            voiceSettings.similarity_boost = 0.75;
            voiceSettings.style = 0.6;
          } else {
            speaker = 'Narrator';
            var narratorEntry = registry['__narrator__'];
            voiceId = narratorEntry ? narratorEntry.voice_id : null;
            // Narrator gets smooth, stable delivery
            voiceSettings.stability = 0.75;
            voiceSettings.similarity_boost = 0.75;
            voiceSettings.style = 0.05;
          }

          if (!voiceId) {
            SQ.Logger.warn('Audio', 'No voice assigned', { speaker: speaker });
            return;
          }

          var text = (seg.text || '').trim();
          if (!text) return;

          // Strip leading/trailing quotation marks for TTS (voices speak directly)
          var ttsText = text.replace(/^["\u201c\u201d\u2018\u2019']+|["\u201c\u201d\u2018\u2019']+$/g, '').trim();
          if (!ttsText) return;

          return self._generateSegmentAudio(ttsText, voiceId, voiceSettings)
            .then(function (audioUrl) {
              _segments.push({
                audioUrl: audioUrl,
                text: text,  // Original text with quotes (for highlighting)
                speaker: speaker,
                index: i
              });
            })
            .catch(function (err) {
              SQ.Logger.warn('Audio', 'Segment failed', { segment: i, error: err.message });
              // Skip failed segments, continue with the rest
            });
        });
      });

      return chain.then(function () {
        return _segments.length > 0;
      });
    },

    // ========================================================
    // PLAYBACK (sequential segment player)
    // ========================================================

    /**
     * Play a specific segment by index.
     * When it finishes, automatically advances to the next segment.
     * @private
     */
    _playSegment: function (index) {
      if (index >= _segments.length) {
        _isPlaying = false;
        _isPaused = false;
        _currentIndex = 0;
        this._updateControls();
        return;
      }

      var self = this;
      var seg = _segments[index];
      _currentIndex = index;
      _isPlaying = true;
      _isPaused = false;

      var audio = new Audio(seg.audioUrl);
      seg.audio = audio;

      // Guard against both 'ended' and 'error' firing and double-advancing
      var advanced = false;

      audio.addEventListener('ended', function () {
        if (!advanced) {
          advanced = true;
          self._playSegment(index + 1);
        }
      });

      audio.addEventListener('error', function () {
        if (!advanced) {
          advanced = true;
          SQ.Logger.warn('Audio', 'Playback error on segment', { segment: index });
          self._playSegment(index + 1);
        }
      });

      audio.play().catch(function (err) {
        SQ.Logger.warn('Audio', 'Autoplay blocked', { error: err.message });
        _isPlaying = false;
        self._updateControls();
      });

      this._updateControls();
    },

    /**
     * Play audio (starts from current position or beginning).
     * @param {string} [audioUrl] - Ignored (kept for API compatibility with old AudioGenerator)
     */
    play: function (audioUrl) {
      if (_segments.length === 0) return;
      this._playSegment(_currentIndex);
    },

    /**
     * Pause the currently playing segment.
     */
    pause: function () {
      if (!_isPlaying) return;
      var seg = _segments[_currentIndex];
      if (seg && seg.audio) {
        seg.audio.pause();
      }
      _isPlaying = false;
      _isPaused = true;
      this._updateControls();
    },

    /**
     * Resume playback from where it was paused.
     */
    resume: function () {
      if (!_isPaused) return;
      var seg = _segments[_currentIndex];
      if (seg && seg.audio) {
        seg.audio.play().catch(function () {});
        _isPlaying = true;
        _isPaused = false;
        this._updateControls();
      }
    },

    /**
     * Toggle play/pause.
     */
    togglePlayPause: function () {
      if (_isPlaying) {
        this.pause();
      } else if (_isPaused) {
        this.resume();
      } else if (_pendingPassage) {
        // First click: generate audio on demand, then auto-play
        var self = this;
        var passage = _pendingPassage;
        var gameState = _pendingGameState;
        _pendingPassage = null;
        _pendingGameState = null;
        self._setGeneratingState(true);
        self.generate(passage, gameState).then(function () {
          self._setGeneratingState(false);
        });
      } else if (_segments.length > 0) {
        this.play();
      }
    },

    /**
     * Replay all segments from the beginning.
     */
    replay: function () {
      this._stopCurrentAudio();
      _currentIndex = 0;
      if (_segments.length > 0) {
        this._playSegment(0);
      }
    },

    /**
     * Stop playback and clean up all audio elements.
     */
    stop: function () {
      if (_abortController) {
        _abortController.abort();
        _abortController = null;
      }
      this._stopCurrentAudio();
      // Revoke blob URLs to free memory
      _segments.forEach(function (seg) {
        if (seg.audioUrl) {
          try { URL.revokeObjectURL(seg.audioUrl); } catch (e) { /* ignore */ }
        }
      });
      _segments = [];
      _currentIndex = 0;
      _isPlaying = false;
      _isPaused = false;
      this._updateControls();
    },

    /**
     * Stop the currently playing audio element without clearing segments.
     * @private
     */
    _stopCurrentAudio: function () {
      _segments.forEach(function (seg) {
        if (seg.audio) {
          seg.audio.pause();
          seg.audio.src = '';
          seg.audio = null;
        }
      });
      _isPlaying = false;
      _isPaused = false;
    },

    /**
     * Whether audio is currently playing.
     */
    isPlaying: function () {
      return _isPlaying;
    },

    // ========================================================
    // UI CONTROLS
    // ========================================================

    /**
     * Show/hide the generating (loading) state on the play button.
     * @private
     */
    _setGeneratingState: function (generating) {
      var btn = document.getElementById('btn-audio-playpause');
      if (btn) {
        if (generating) {
          btn.innerHTML = '&#8987;';
          btn.title = 'Generating audio...';
          btn.disabled = true;
        } else {
          btn.disabled = false;
          this._updateControls();
        }
      }
    },

    /**
     * Update the audio controls UI to reflect current playback state.
     * @private
     */
    _updateControls: function () {
      var playPauseBtn = document.getElementById('btn-audio-playpause');
      if (playPauseBtn) {
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

    // ========================================================
    // UTILITY
    // ========================================================

    /**
     * Refresh the cached voice list from ElevenLabs.
     * Call this if the user changes their API key.
     */
    refreshVoices: function () {
      _availableVoices = null;
      localStorage.removeItem(VOICE_CACHE_KEY);
      return this._ensureVoicesLoaded();
    },

    // ========================================================
    // MOCK MODE
    // ========================================================

    /**
     * Mock audio generation for development.
     * Returns immediately with a tiny silent WAV.
     * @private
     */
    _mockGenerate: function () {
      var self = this;
      return new Promise(function (resolve) {
        setTimeout(function () {
          var header = 'UklGRiYAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQIAAAAAAA==';
          var audioUrl = 'data:audio/wav;base64,' + header;
          _segments = [{
            audioUrl: audioUrl,
            text: '(mock audio)',
            speaker: 'Narrator',
            index: 0
          }];
          self.showControls();
          self._playSegment(0);
          resolve(true);
        }, 500);
      });
    }
  };

  // Backward compatibility: alias AudioGenerator to AudioDirector
  // so existing code that references SQ.AudioGenerator still works
  // during the transition.
  SQ.AudioGenerator = SQ.AudioDirector;
})();
