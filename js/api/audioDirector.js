/**
 * SQ.AudioDirector — Full-cast audio play engine using ElevenLabs.
 *
 * Pipeline:
 *   1. _analyzePassage: Segments passage into coarse speaker blocks (LLM call, Haiku-compatible)
 *   2. _castVoicesForSpeakers: Assigns ElevenLabs voices to speakers from step 1 (LLM call, sequential)
 *   3. Progressive TTS: Generates audio per segment, starts playback after first segment completes
 *
 * Voice registry persisted to localStorage — characters keep voices across turns.
 * Only makes API calls when narration is enabled (SQ.PlayerConfig.isNarrationEnabled()).
 */
(function () {
  var ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1';
  var ELEVENLABS_TIMEOUT_MS = 30000;
  var VOICE_REGISTRY_KEY = 'slopquest_voice_registry';
  var VOICE_CACHE_KEY = 'slopquest_elevenlabs_voices';

  /** Cached list of available ElevenLabs voices. */
  var _availableVoices = null;

  /** Current playback state. */
  var _segments = [];        // Array of { audio: Audio, text: string, speaker: string }
  var _currentIndex = 0;
  var _isPlaying = false;
  var _isPaused = false;

  /** Progressive generation state. */
  var _generationComplete = false;
  var _totalExpectedSegments = 0;
  var _segmentReadyResolvers = {};  // index -> resolve callback for _waitForSegment

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

      var elevenLabsKey = SQ.PlayerConfig.getElevenLabsApiKey();
      if (!elevenLabsKey) {
        SQ.Logger.info('Audio', 'No ElevenLabs API key configured');
        return Promise.resolve(false);
      }

      _abortController = new AbortController();
      var self = this;

      return this._ensureVoicesLoaded()
        .then(function () {
          // Step 1: Segment passage (single LLM call — source of truth for speaker names)
          return self._analyzePassage(passage, gameState);
        })
        .then(function (segmentResult) {
          if (!segmentResult || !segmentResult.segments || segmentResult.segments.length === 0) {
            SQ.Logger.info('Audio', 'LLM returned empty audio script');
            return false;
          }
          _lastAnalysisSegments = segmentResult.segments;

          // Step 2: Cast voices for speakers identified by segmentation
          var speakers = [];
          segmentResult.segments.forEach(function (seg) {
            if (seg.speaker && seg.speaker !== 'narrator' && speakers.indexOf(seg.speaker) === -1) {
              speakers.push(seg.speaker);
            }
          });
          return self._castVoicesForSpeakers(speakers, gameState)
            .then(function () { return segmentResult.segments; });
        })
        .then(function (segments) {
          if (!segments) return false;

          // Dry run mode: skip TTS, fire debug event immediately
          if (SQ.PlayerConfig.isNarrationDryRunEnabled()) {
            _lastAnalysis = {
              segments: _lastAnalysisSegments,
              ttsSegments: (_lastAnalysisSegments || []).map(function (s, i) {
                return { text: s.text, speaker: s.speaker === 'narrator' ? 'Narrator' : s.speaker, index: i };
              }),
              registry: self._loadRegistry(),
              availableVoices: _availableVoices || [],
              dryRun: true
            };
            document.dispatchEvent(new CustomEvent('audiodebug', { detail: _lastAnalysis }));
            _lastAnalysisSegments = null;
            self._setGeneratingState(false);
            self.hideControls();
            SQ.Logger.info('Audio', 'Dry run complete', { segments: segments.length });
            return true;
          }

          // Step 3: Generate TTS for all segments
          return self._generateAllSegments(segments, gameState);
        })
        .then(function (success) {
          // Fire debug event AFTER all generation completes
          if (_lastAnalysisSegments) {
            _lastAnalysis = {
              segments: _lastAnalysisSegments,
              ttsSegments: _segments.filter(Boolean).map(function (s) {
                return { text: s.text, speaker: s.speaker, index: s.index };
              }),
              registry: self._loadRegistry(),
              availableVoices: _availableVoices || []
            };
            document.dispatchEvent(new CustomEvent('audiodebug', { detail: _lastAnalysis }));
            _lastAnalysisSegments = null;
          }
          // Playback was already started by _generateAllSegments (progressive)
          return success;
        })
        .catch(function (err) {
          if (err.name === 'AbortError') return false;
          SQ.Logger.info('Audio', 'Generation failed, degrading to text-only', { error: err.message || String(err) });
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

      var npcs = SQ.GameState.getNpcRoster();
      if (npcs.length > 0) {
        var npcLines = npcs.map(function (npc) {
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
     * Cast voices for speakers identified by segmentation.
     * Uses a single LLM call with the voice catalog, receiving exact speaker names
     * from _analyzePassage (no independent re-analysis of the passage).
     * Skips the LLM call entirely if all speakers are already in the registry.
     * @param {string[]} speakerNames - Unique speaker names from segmentation (excluding "narrator")
     * @param {object} gameState - Full game state for context
     * @returns {Promise}
     * @private
     */
    _castVoicesForSpeakers: function (speakerNames, gameState) {
      var self = this;
      var registry = this._loadRegistry();
      var playerName = (gameState && gameState.player && gameState.player.name) || '';

      // Determine what needs casting
      var needsNarrator = !registry['__narrator__'] || !registry['__narrator__'].voice_id;
      var needsPlayer = playerName && (!registry[playerName] || !registry[playerName].voice_id);

      // Filter speakers to only those not already in registry
      var newSpeakers = speakerNames.filter(function (name) {
        return !registry[name] || !registry[name].voice_id;
      });

      // If everything is already cast, skip the LLM call entirely
      if (!needsNarrator && !needsPlayer && newSpeakers.length === 0) {
        SQ.Logger.info('Audio', 'All speakers already cast, skipping voice casting');
        return Promise.resolve();
      }

      var voiceCatalog = this._buildVoiceCatalog();
      if (!voiceCatalog) {
        SQ.Logger.warn('Audio', 'No voice catalog available for casting');
        return Promise.resolve();
      }

      // Build the casting prompt
      var p = '';
      p += 'You are a Casting Director for an interactive narrative audio play.\n';
      p += 'Your job is to assign ElevenLabs voices to the characters listed below.\n\n';

      var gameContext = this._buildGameContext(gameState);
      if (gameContext) {
        p += 'GAME CONTEXT:\n' + gameContext + '\n\n';
      }

      p += 'AVAILABLE ELEVENLABS VOICES (you MUST select from these only):\n';
      p += voiceCatalog + '\n\n';

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
        p += 'ALREADY ASSIGNED VOICES (locked — do NOT reassign these):\n';
        p += assignedLines.join('\n') + '\n\n';
      }

      p += 'CHARACTERS THAT NEED VOICES:\n';

      if (needsNarrator) {
        var nGender = (gameState && gameState.narrator && gameState.narrator.voice_gender) || '';
        var nDirection = (gameState && gameState.narrator && gameState.narrator.voice_direction) || '';
        p += '- Narrator' + (nGender || nDirection ? ' (user preference: ' + [nGender, nDirection].filter(Boolean).join(', ') + ')' : '') + '\n';
      }
      if (needsPlayer) {
        var pGender = (gameState && gameState.player && gameState.player.voice_gender) || '';
        var pDirection = (gameState && gameState.player && gameState.player.voice_direction) || '';
        var pArchetype = (gameState && gameState.player && gameState.player.archetype) || '';
        p += '- "' + playerName + '" (player character' + (pGender || pDirection || pArchetype ? ', user preference: ' + [pGender, pDirection, pArchetype].filter(Boolean).join(', ') : '') + ')\n';
      }

      // Add NPC context for new speakers from the roster
      var npcs = (SQ.GameState && SQ.GameState.getNpcRoster) ? SQ.GameState.getNpcRoster() : [];
      newSpeakers.forEach(function (name) {
        var npcInfo = '';
        for (var i = 0; i < npcs.length; i++) {
          if (npcs[i].name === name) {
            var bits = [];
            if (npcs[i].role) bits.push(npcs[i].role);
            if (npcs[i].motivation) bits.push(npcs[i].motivation);
            npcInfo = bits.length > 0 ? ' (' + bits.join(', ') + ')' : '';
            break;
          }
        }
        p += '- "' + name + '"' + npcInfo + '\n';
      });

      p += '\nINSTRUCTIONS:\n';
      p += '- Use the game\'s genre, tone, setting, and each character\'s role to make intelligent casting decisions.\n';
      p += '- STRONGLY prefer voice diversity — avoid reusing voice IDs already assigned.\n';
      p += '- RESPECT user preferences for narrator/player gender, accent, and style.\n\n';

      p += 'Respond with ONLY valid JSON:\n';
      p += '{\n';
      p += '  "voice_assignments": {\n';
      p += '    "Character Name": { "voice_id": "<id>", "voice_description": "brief description", "justification": "why this voice fits" }\n';
      p += '  }';
      if (needsNarrator) p += ',\n  "narrator_voice": { "voice_id": "<id>", "voice_description": "...", "justification": "..." }';
      if (needsPlayer) p += ',\n  "player_voice": { "voice_id": "<id>", "voice_description": "...", "justification": "..." }';
      p += '\n}\n';

      return SQ.API.call(SQ.PlayerConfig.getModel('voice_director'), [
        { role: 'system', content: p },
        { role: 'user', content: 'Assign voices for the characters listed above.' }
      ], {
        temperature: 0.3,
        max_tokens: 2000,
        source: 'voice_director'
      }).then(function (response) {
        try {
          var castResult = SQ.API.parseJSON(response);
          self._applyVoiceAssignments(castResult, gameState, newSpeakers);
        } catch (e) {
          SQ.Logger.warn('Audio', 'Failed to parse casting JSON, using fallback', { error: e.message });
          self._fallbackCastAll(needsNarrator, needsPlayer, newSpeakers, gameState);
        }
      }).catch(function (err) {
        SQ.Logger.warn('Audio', 'Voice casting LLM call failed, using fallback', { error: err.message || String(err) });
        self._fallbackCastAll(needsNarrator, needsPlayer, newSpeakers, gameState);
      });
    },

    /**
     * Apply voice assignments from LLM casting response to the registry.
     * Falls back to keyword matching for any invalid voice IDs.
     * @private
     */
    _applyVoiceAssignments: function (castResult, gameState, newSpeakers) {
      var registry = this._loadRegistry();
      var self = this;

      // Build lookup maps
      var validVoiceIds = {};
      var voiceNameMap = {};
      var nameToVoiceId = {};
      var normalizedNameToVoiceId = {};
      if (_availableVoices) {
        _availableVoices.forEach(function (v) {
          validVoiceIds[v.voice_id] = v;
          voiceNameMap[v.voice_id] = v.name;
          nameToVoiceId[v.name.toLowerCase()] = v.voice_id;
          var norm = v.name.toLowerCase().replace(/[^a-z0-9]/g, '');
          normalizedNameToVoiceId[norm] = v.voice_id;
        });
      }

      // Track used voice IDs for dedup
      var usedVoiceIds = {};
      for (var key in registry) {
        if (registry.hasOwnProperty(key) && registry[key].voice_id) {
          usedVoiceIds[registry[key].voice_id] = true;
        }
      }

      var changed = false;

      // Helper: resolve a voice ID (may be name or ID)
      var resolveVoiceId = function (voiceId) {
        if (!voiceId) return null;
        if (validVoiceIds[voiceId]) return voiceId;
        // Try name resolution
        var lower = voiceId.toLowerCase();
        var resolved = nameToVoiceId[lower];
        if (!resolved) {
          var norm = lower.replace(/[^a-z0-9]/g, '');
          resolved = normalizedNameToVoiceId[norm];
        }
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
        return resolved || null;
      };

      // Helper: assign voice to registry
      var assign = function (characterKey, voiceId, description, justification) {
        if (registry[characterKey] && registry[characterKey].voice_id) return; // already assigned

        var resolved = resolveVoiceId(voiceId);
        if (resolved) {
          registry[characterKey] = {
            voice_id: resolved,
            voice_name: voiceNameMap[resolved] || '',
            description: description || '',
            justification: justification || ''
          };
          usedVoiceIds[resolved] = true;
          changed = true;
          SQ.Logger.info('Audio', 'Voice cast', { character: characterKey, voice: voiceNameMap[resolved] || resolved });
        } else {
          // Fallback to keyword matching
          SQ.Logger.warn('Audio', 'Fallback: invalid voice_id from LLM', { character: characterKey, voiceId: voiceId });
          var bestVoice = self._fallbackMatchVoice(description || '', usedVoiceIds);
          if (bestVoice) {
            registry[characterKey] = {
              voice_id: bestVoice.voice_id,
              voice_name: bestVoice.name,
              description: description || '',
              justification: '(FALLBACK: keyword matching)'
            };
            usedVoiceIds[bestVoice.voice_id] = true;
            changed = true;
            SQ.Logger.warn('Audio', 'Fallback voice assigned', { character: characterKey, voice: bestVoice.name });
          }
        }
      };

      // Apply narrator voice
      var narratorVoice = castResult.narrator_voice || {};
      if (narratorVoice.voice_id) {
        var narratorDesc = narratorVoice.voice_description || '';
        assign('__narrator__', narratorVoice.voice_id, narratorDesc, narratorVoice.justification);
      }

      // Apply player character voice
      var playerName = (gameState && gameState.player && gameState.player.name) || '';
      var playerVoice = castResult.player_voice || {};
      if (playerName && playerVoice.voice_id) {
        assign(playerName, playerVoice.voice_id, playerVoice.voice_description || '', playerVoice.justification);
      }

      // Apply NPC voice assignments
      var assignments = castResult.voice_assignments || {};
      for (var charName in assignments) {
        if (assignments.hasOwnProperty(charName)) {
          var entry = assignments[charName];
          assign(charName, entry.voice_id, entry.voice_description || '', entry.justification || '');
        }
      }

      if (changed) {
        this._saveRegistry(registry);
      }
    },

    /**
     * Fallback: cast all unassigned speakers using keyword matching.
     * Used when the LLM casting call fails entirely.
     * @private
     */
    _fallbackCastAll: function (needsNarrator, needsPlayer, newSpeakers, gameState) {
      var registry = this._loadRegistry();
      var usedVoiceIds = {};
      for (var key in registry) {
        if (registry.hasOwnProperty(key) && registry[key].voice_id) {
          usedVoiceIds[registry[key].voice_id] = true;
        }
      }
      var changed = false;

      var assignFallback = function (characterKey, description) {
        if (registry[characterKey] && registry[characterKey].voice_id) return;
        var bestVoice = SQ.AudioDirector._fallbackMatchVoice(description, usedVoiceIds);
        if (bestVoice) {
          registry[characterKey] = {
            voice_id: bestVoice.voice_id,
            voice_name: bestVoice.name,
            description: description,
            justification: '(FALLBACK: LLM casting failed)'
          };
          usedVoiceIds[bestVoice.voice_id] = true;
          changed = true;
        }
      };

      if (needsNarrator) {
        var nGender = (gameState && gameState.narrator && gameState.narrator.voice_gender) || '';
        var nDirection = (gameState && gameState.narrator && gameState.narrator.voice_direction) || '';
        assignFallback('__narrator__', [nGender, nDirection, 'narrator, storytelling, audiobook'].filter(Boolean).join(', '));
      }

      if (needsPlayer) {
        var playerName = (gameState && gameState.player && gameState.player.name) || '';
        var pGender = (gameState && gameState.player && gameState.player.voice_gender) || '';
        var pDirection = (gameState && gameState.player && gameState.player.voice_direction) || '';
        var pArchetype = (gameState && gameState.player && gameState.player.archetype) || '';
        if (playerName) {
          assignFallback(playerName, [pGender, pDirection, pArchetype, 'protagonist, character'].filter(Boolean).join(', '));
        }
      }

      var npcs = (SQ.GameState && SQ.GameState.getNpcRoster) ? SQ.GameState.getNpcRoster() : [];
      newSpeakers.forEach(function (name) {
        var desc = 'character voice';
        for (var i = 0; i < npcs.length; i++) {
          if (npcs[i].name === name) {
            var bits = [npcs[i].role, npcs[i].motivation].filter(Boolean);
            if (bits.length > 0) desc = bits.join(', ');
            break;
          }
        }
        assignFallback(name, desc);
      });

      if (changed) {
        this._saveRegistry(registry);
      }
    },

    /**
     * Analyze a passage into coarse audio segments with speaker identification.
     * Optimized for Haiku — simple prompt, minimal schema, few-shot example.
     * Splits ONLY when the voice changes (narrator↔character, or character↔character).
     * @private
     */
    _analyzePassage: function (passage, gameState) {
      var playerName = (gameState && gameState.player && gameState.player.name) || 'The Wanderer';

      // Build known character names from registry AND NPC roster
      var registry = this._loadRegistry();
      var knownNames = Object.keys(registry).filter(function (k) {
        return k !== '__narrator__';
      });
      var npcs = (SQ.GameState && SQ.GameState.getNpcRoster) ? SQ.GameState.getNpcRoster() : [];
      npcs.forEach(function (npc) {
        if (npc.name && knownNames.indexOf(npc.name) === -1) {
          knownNames.push(npc.name);
        }
      });

      var p = '';
      p += 'You split story text into audio segments for a full-cast audiobook.\n';
      p += 'Each segment is read aloud by ONE speaker continuously.\n\n';

      p += 'RULES:\n';
      p += '- Split ONLY when the voice changes (narrator to character, or character to character).\n';
      p += '- Narration, description, and action beats (e.g. "he said, slamming his fist") = speaker "narrator".\n';
      p += '- Dialogue (words inside quotation marks) = speaker is the character speaking.\n';
      p += '- When the passage says "you say" / "you reply" / "you call out" the speaker is "' + playerName + '".\n';
      p += '- Adjacent narration lines with no voice change between them = merge into ONE narrator segment.\n';
      p += '- Adjacent dialogue lines by the SAME character = merge into ONE segment.\n';
      p += '- When a paragraph mixes dialogue and narration (e.g. "\'Hello,\' she said, stepping forward. \'How are you?\'"),\n';
      p += '  split it: dialogue goes to the character, action beats / attribution go to narrator.\n';
      p += '- Use EXACT text from the passage. Do not skip, reword, or omit anything.\n';
      p += '- Every word in the passage must appear in exactly one segment.\n\n';

      if (knownNames.length > 0) {
        p += 'KNOWN CHARACTERS (use these exact names): ' + knownNames.join(', ') + '\n';
      }
      p += 'For unnamed speakers, use short descriptive names like "Gate Guard" or "Bartender".\n\n';

      // Minimal scene context for speaker identification
      var cur = (gameState && gameState.current) || {};
      if (cur.location || cur.scene_context) {
        p += 'SCENE CONTEXT: ';
        if (cur.location) p += 'Location: ' + cur.location + '. ';
        if (cur.scene_context) p += cur.scene_context;
        p += '\n\n';
      }

      p += 'EXAMPLE:\n';
      p += 'Input:\n';
      p += 'The captain rose from his chair. "Stand down," he growled, slamming his fist on the table.\n\n';
      p += '"I won\'t say it again."\n\n';
      p += 'The room fell silent. Nobody dared to breathe.\n\n';
      p += 'After a long moment, the tension broke.\n';
      p += 'Output: {"segments": [\n';
      p += '  {"speaker": "narrator", "text": "The captain rose from his chair."},\n';
      p += '  {"speaker": "Captain", "text": "\\"Stand down,\\""},\n';
      p += '  {"speaker": "narrator", "text": "he growled, slamming his fist on the table."},\n';
      p += '  {"speaker": "Captain", "text": "\\"I won\'t say it again.\\""},\n';
      p += '  {"speaker": "narrator", "text": "The room fell silent. Nobody dared to breathe.\\n\\nAfter a long moment, the tension broke."}\n';
      p += ']}\n';
      p += 'NOTE: The last two narrator paragraphs are ONE segment because the speaker did not change.\n\n';

      p += 'Return ONLY valid JSON: {"segments": [{"speaker": "...", "text": "..."}, ...]}\n';

      var userPrompt = 'Split this passage into audio segments:\n\n' + passage;

      return SQ.API.call(SQ.PlayerConfig.getModel('voice_director'), [
        { role: 'system', content: p },
        { role: 'user', content: userPrompt }
      ], {
        temperature: 0.3,
        max_tokens: 4000,
        source: 'voice_director'
      }).then(function (response) {
        try {
          var result = SQ.API.parseJSON(response);
          // Normalize: ensure every segment has a speaker field
          if (result && result.segments) {
            result.segments = result.segments.map(function (seg) {
              if (!seg.speaker) {
                seg.speaker = (seg.type === 'dialogue' && seg.speaker) ? seg.speaker : 'narrator';
              }
              return seg;
            });

            // Merge adjacent segments with the same speaker
            if (result.segments.length > 1) {
              var merged = [result.segments[0]];
              for (var mi = 1; mi < result.segments.length; mi++) {
                var prev = merged[merged.length - 1];
                if (result.segments[mi].speaker === prev.speaker) {
                  prev.text = (prev.text || '') + '\n\n' + (result.segments[mi].text || '');
                } else {
                  merged.push(result.segments[mi]);
                }
              }
              result.segments = merged;
            }
          }
          return result;
        } catch (e) {
          SQ.Logger.warn('Audio', 'Failed to parse segmentation JSON', { error: e.message });
          return { segments: [{ speaker: 'narrator', text: passage }] };
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
      var ttsStartTime = Date.now();
      var ttsCharCount = text.length;

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
          var ttsDurationMs = Date.now() - ttsStartTime;
          var ttsCost = SQ.Pricing ? SQ.Pricing.getElevenLabsCost(ttsCharCount) : null;
          SQ.Logger.info('API', 'ElevenLabs TTS', { model: 'eleven_flash_v2_5', source: 'elevenlabs_tts', charCount: ttsCharCount, durationMs: ttsDurationMs, cost: ttsCost, byteLength: buffer.byteLength });
          if (SQ.APIToast) {
            SQ.APIToast.show({ source: 'elevenlabs_tts', model: 'eleven_flash_v2_5', durationMs: ttsDurationMs, cost: ttsCost });
          }
          if (buffer.byteLength === 0) {
            throw new Error('ElevenLabs returned empty audio');
          }
          // Track voice usage for playtester cost reporting
          if (SQ.Playtester && SQ.Playtester.isActive()) {
            SQ.Playtester.trackVoiceUsage(ttsCharCount);
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
     * Resolve voice ID and settings for a segment.
     * @private
     */
    _resolveSegmentVoice: function (seg, registry, narratorVoiceId) {
      var speaker = seg.speaker || 'narrator';
      var voiceId;
      var voiceSettings = {};

      if (speaker === 'narrator') {
        voiceId = narratorVoiceId;
        voiceSettings.stability = 0.75;
        voiceSettings.similarity_boost = 0.75;
        voiceSettings.style = 0.05;
      } else {
        var entry = registry[speaker];
        // Try case-insensitive match if exact fails
        if (!entry) {
          var speakerLower = speaker.toLowerCase();
          var keys = Object.keys(registry);
          for (var k = 0; k < keys.length; k++) {
            if (keys[k].toLowerCase() === speakerLower && keys[k] !== '__narrator__') {
              entry = registry[keys[k]];
              break;
            }
          }
        }
        voiceId = entry ? entry.voice_id : null;
        voiceSettings.stability = 0.30;
        voiceSettings.similarity_boost = 0.75;
        voiceSettings.style = 0.6;
      }

      // SAFETY NET: never silently skip — fall back to narrator voice
      if (!voiceId && narratorVoiceId) {
        SQ.Logger.warn('Audio', 'No voice for speaker, falling back to narrator', { speaker: speaker });
        voiceId = narratorVoiceId;
        voiceSettings.stability = 0.75;
        voiceSettings.similarity_boost = 0.75;
        voiceSettings.style = 0.05;
      }

      return { voiceId: voiceId, voiceSettings: voiceSettings, speaker: speaker };
    },

    /**
     * Generate audio for all segments with progressive playback.
     * Starts playing segment 0 as soon as its TTS completes, generates
     * remaining segments in the background while earlier ones play.
     * @private
     */
    _generateAllSegments: function (segments, gameState) {
      var self = this;
      _segments = [];
      _generationComplete = false;
      _segmentReadyResolvers = {};
      _totalExpectedSegments = segments.length;

      var registry = this._loadRegistry();
      var narratorEntry = registry['__narrator__'];
      var narratorVoiceId = narratorEntry ? narratorEntry.voice_id : null;

      var playbackStarted = false;

      // Helper: notify waiting playback that a segment is ready
      var notifySegmentReady = function (index) {
        if (_segmentReadyResolvers[index]) {
          _segmentReadyResolvers[index]();
          delete _segmentReadyResolvers[index];
        }
      };

      // Generate segments sequentially, but start playback after first segment
      var chain = Promise.resolve();
      segments.forEach(function (seg, i) {
        chain = chain.then(function () {
          if (_abortController && _abortController.signal.aborted) {
            throw new DOMException('Aborted', 'AbortError');
          }

          var resolved = self._resolveSegmentVoice(seg, registry, narratorVoiceId);
          if (!resolved.voiceId) {
            SQ.Logger.warn('Audio', 'No voice available, skipping segment', { speaker: resolved.speaker });
            // Push a null placeholder so indices stay aligned
            _segments.push(null);
            notifySegmentReady(i);
            return;
          }

          var text = (seg.text || '').trim();
          if (!text) {
            _segments.push(null);
            notifySegmentReady(i);
            return;
          }

          // Strip quotation marks for TTS
          var ttsText = text.replace(/^["\u201c\u201d\u2018\u2019']+|["\u201c\u201d\u2018\u2019']+$/g, '').trim();
          if (!ttsText) {
            _segments.push(null);
            notifySegmentReady(i);
            return;
          }

          return self._generateSegmentAudio(ttsText, resolved.voiceId, resolved.voiceSettings)
            .then(function (audioUrl) {
              _segments[i] = {
                audioUrl: audioUrl,
                text: text,
                speaker: resolved.speaker,
                index: i
              };
              notifySegmentReady(i);

              // Start playback as soon as segment 0 is ready
              if (!playbackStarted) {
                playbackStarted = true;
                self.showControls();
                self._setGeneratingState(false);
                self._playSegment(0);
              }
            })
            .catch(function (err) {
              SQ.Logger.warn('Audio', 'Segment TTS failed', { segment: i, speaker: resolved.speaker, error: err.message });
              _segments[i] = null;
              notifySegmentReady(i);
            });
        });
      });

      return chain.then(function () {
        _generationComplete = true;
        // Notify any waiting playback that generation is done
        for (var idx in _segmentReadyResolvers) {
          if (_segmentReadyResolvers.hasOwnProperty(idx)) {
            _segmentReadyResolvers[idx]();
          }
        }
        _segmentReadyResolvers = {};
        return _segments.some(function (s) { return s !== null; });
      });
    },

    /**
     * Wait for a segment to become available (for progressive playback).
     * Resolves immediately if the segment already exists or generation is complete.
     * @private
     */
    _waitForSegment: function (index) {
      if (_segments[index] !== undefined || _generationComplete) {
        return Promise.resolve();
      }
      return new Promise(function (resolve) {
        _segmentReadyResolvers[index] = resolve;
      });
    },

    // ========================================================
    // PLAYBACK (sequential segment player)
    // ========================================================

    /**
     * Find the next playable segment index (skipping null/failed segments).
     * @private
     */
    _nextPlayableIndex: function (fromIndex) {
      for (var i = fromIndex; i < _totalExpectedSegments; i++) {
        if (_segments[i] && _segments[i].audioUrl) return i;
        // If segment doesn't exist yet and generation isn't complete, return it
        // (caller will wait for it)
        if (_segments[i] === undefined && !_generationComplete) return i;
      }
      return -1; // no more segments
    },

    /**
     * Play a specific segment by index.
     * Supports progressive playback — waits for the segment if TTS hasn't
     * finished yet, skips null/failed segments automatically.
     * @private
     */
    _playSegment: function (index) {
      var self = this;

      // Find next playable segment (skip nulls)
      var playIndex = this._nextPlayableIndex(index);

      // No more segments to play
      if (playIndex === -1) {
        _isPlaying = false;
        _isPaused = false;
        _currentIndex = 0;
        this._updateControls();
        return;
      }

      _currentIndex = playIndex;
      _isPlaying = true;
      _isPaused = false;

      // If segment isn't ready yet, wait for it (progressive playback)
      if (!_segments[playIndex] || !_segments[playIndex].audioUrl) {
        this._updateControls();
        this._waitForSegment(playIndex).then(function () {
          // After waiting, the segment may be null (failed) — find next playable
          if (!_segments[playIndex] || !_segments[playIndex].audioUrl) {
            self._playSegment(playIndex + 1);
            return;
          }
          self._startSegmentAudio(playIndex);
        });
        return;
      }

      this._startSegmentAudio(playIndex);
    },

    /**
     * Actually start audio playback for a ready segment.
     * @private
     */
    _startSegmentAudio: function (index) {
      var self = this;
      var seg = _segments[index];

      var audio = new Audio(seg.audioUrl);
      seg.audio = audio;

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
        if (seg && seg.audioUrl) {
          try { URL.revokeObjectURL(seg.audioUrl); } catch (e) { /* ignore */ }
        }
      });
      _segments = [];
      _currentIndex = 0;
      _isPlaying = false;
      _isPaused = false;
      _generationComplete = false;
      _totalExpectedSegments = 0;
      // Resolve any waiting playback promises so they don't hang
      for (var idx in _segmentReadyResolvers) {
        if (_segmentReadyResolvers.hasOwnProperty(idx)) {
          _segmentReadyResolvers[idx]();
        }
      }
      _segmentReadyResolvers = {};
      this._updateControls();
    },

    /**
     * Stop the currently playing audio element without clearing segments.
     * @private
     */
    _stopCurrentAudio: function () {
      _segments.forEach(function (seg) {
        if (seg && seg.audio) {
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

  };

})();
