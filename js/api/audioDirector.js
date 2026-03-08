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
        console.warn('AudioDirector: no ElevenLabs API key configured');
        return Promise.resolve(false);
      }

      _abortController = new AbortController();
      var self = this;

      return this._ensureVoicesLoaded()
        .then(function () {
          return self._analyzePassage(passage, gameState);
        })
        .then(function (audioScript) {
          if (!audioScript || !audioScript.segments || audioScript.segments.length === 0) {
            console.warn('AudioDirector: LLM returned empty audio script');
            return false;
          }
          _lastAnalysisSegments = audioScript.segments;
          return self._generateAllSegments(audioScript.segments, gameState);
        })
        .then(function (success) {
          // Fire debug event AFTER voice assignment so registry has actual voices
          if (_lastAnalysisSegments) {
            _lastAnalysis = {
              segments: _lastAnalysisSegments,
              ttsSegments: _segments.map(function (s) {
                return { text: s.text, speaker: s.speaker, index: s.index };
              }),
              registry: self._loadRegistry()
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
          console.warn('AudioDirector: generation failed, degrading to text-only.');
          console.warn('  Error:', err.message || err);
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
     * Analyze a passage using Claude Sonnet to produce an audio script.
     * Splits the passage into narration and dialogue segments,
     * identifies speakers, and provides voice descriptions for new characters.
     * @private
     */
    _analyzePassage: function (passage, gameState) {
      var registry = this._loadRegistry();
      var knownCharacters = Object.keys(registry).filter(function (k) {
        return k !== '__narrator__';
      });

      // Identify the player character for voice assignment
      var playerName = '';
      var playerVoiceGender = '';
      if (gameState && gameState.player) {
        playerName = gameState.player.name || 'The Wanderer';
        playerVoiceGender = gameState.player.voice_gender || '';
      }

      var systemPrompt = [
        'You are an Audio Director for an interactive narrative game.',
        'Your job is to break a story passage into audio segments for a full-cast audio play.',
        '',
        'For each segment, identify whether it is:',
        '- "narration": descriptive text read by the narrator',
        '- "dialogue": spoken lines by a specific character',
        '',
        'CRITICAL RULES:',
        '- EVERY sentence in the passage MUST appear in exactly one segment. Do NOT skip or omit any text.',
        '- Action beats and narrative between dialogue (e.g., "she says", "he mutters", "you say to the crowd",',
        '  "you call out cheerfully, continuing your approach") are NARRATION segments. NEVER skip them.',
        '  Every phrase between dialogue quotes must be captured as a narration segment.',
        '- Preserve the EXACT text from the passage. Do not paraphrase or alter wording.',
        '- For dialogue, include the EXACT text from the passage INCLUDING quotation marks.',
        '  The system will strip quotes automatically before sending to the voice actor.',
        '- IMPORTANT: Action beats between dialogue lines (e.g., "she says, wiping her hands",',
        '  "he mutters darkly", "you call out cheerfully") MUST be their own narration segments.',
        '  Do NOT merge them into dialogue or skip them.',
        '',
        'The PLAYER CHARACTER is named "' + playerName + '". When the passage describes the player character',
        'speaking (e.g., "you say", "you call out", "you reply"), use speaker name "' + playerName + '" for their dialogue.',
        '',
        'For other dialogue segments, identify the speaker name exactly as it appears in the text.',
        'For unnamed characters (e.g., "a guard", "the bartender"), use a descriptive identifier',
        'like "Gate Guard" or "Bartender" — be specific enough to distinguish different unnamed NPCs.',
        '',
        'For NEW characters not in the known characters list, provide a voice_description with:',
        '- gender (male/female/neutral)',
        '- approximate age (young/middle-aged/old)',
        '- vocal quality (gruff, smooth, raspy, warm, cold, high-pitched, deep, etc.)',
        '- accent if apparent from the character or setting (british, irish, southern, etc.)',
        '- emotional tone for this line (angry, calm, amused, fearful, etc.)',
        '',
        'Known characters (already have assigned voices): ' + (knownCharacters.length > 0 ? knownCharacters.join(', ') : 'none yet'),
        '',
        'Respond with ONLY valid JSON in this format:',
        '{',
        '  "segments": [',
        '    { "type": "narration", "text": "The guard stepped forward." },',
        '    { "type": "dialogue", "speaker": "Gate Guard", "text": "\\\"Halt! Who goes there?\\\"", "voice_description": "gruff male, middle-aged, authoritative, stern" },',
        '    { "type": "narration", "text": "he barked, leveling his spear." },',
        '    { "type": "narration", "text": "You raised your hands slowly." },',
        '    { "type": "dialogue", "speaker": "' + playerName + '", "text": "\\\"Easy now. I mean no trouble.\\\"" }',
        '  ]',
        '}'
      ].join('\n');

      var userPrompt = 'Break this passage into audio segments:\n\n' + passage;

      // Add game state context for better character identification and voice casting
      if (gameState && gameState.meta) {
        var meta = gameState.meta;
        if (meta.setting) userPrompt += '\n\nSetting: ' + meta.setting;
        if (meta.tone) userPrompt += '\nTone: ' + meta.tone;
      }
      if (gameState && gameState.current) {
        userPrompt += '\nScene context: ' + (gameState.current.scene_context || 'unknown');
        userPrompt += '\nLocation: ' + (gameState.current.location || 'unknown');
      }
      if (playerName) {
        userPrompt += '\nPlayer character: ' + playerName;
      }

      // Include NPC roster so the LLM can generate informed voice descriptions
      if (gameState && gameState.skeleton && gameState.skeleton.npcs) {
        var npcList = gameState.skeleton.npcs.map(function (npc) {
          var parts = [npc.name + ': ' + (npc.role || 'unknown role')];
          if (npc.allegiance) parts.push('(' + npc.allegiance + ')');
          return '- ' + parts.join(' ');
        }).join('\n');
        if (npcList) {
          userPrompt += '\n\nNPC roster (use for voice casting):\n' + npcList;
        }
      }

      return SQ.API.call(ANALYSIS_MODEL, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], {
        temperature: 0.3,
        max_tokens: 2000
      }).then(function (response) {
        try {
          return SQ.API.parseJSON(response);
        } catch (e) {
          console.warn('AudioDirector: failed to parse audio script JSON', e);
          // Fallback: treat entire passage as narration
          return {
            segments: [{ type: 'narration', text: passage }]
          };
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
        console.warn('AudioDirector: failed to load voice registry', e);
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
     * Assign a voice to a character. If already assigned, returns existing.
     * Uses voice_description to match the best available ElevenLabs voice.
     * @param {string} characterKey - Character name or "__narrator__"
     * @param {string} [description] - Voice description from LLM
     * @returns {string} voice_id
     * @private
     */
    _assignVoice: function (characterKey, description) {
      var registry = this._loadRegistry();

      // Already assigned? Validate voice is still in available list
      if (registry[characterKey] && registry[characterKey].voice_id) {
        var cachedId = registry[characterKey].voice_id;
        var stillAvailable = !_availableVoices || _availableVoices.some(function (v) {
          return v.voice_id === cachedId;
        });
        if (stillAvailable) return cachedId;
        // Voice filtered out (e.g. premade voice disabled) — reassign below
        console.log('AudioDirector: reassigning ' + characterKey + ' (voice no longer available)');
      }

      if (!_availableVoices || _availableVoices.length === 0) {
        console.warn('AudioDirector: no voices available for assignment');
        return null;
      }

      // Find voices already assigned to avoid duplicates when possible
      var usedVoiceIds = {};
      for (var key in registry) {
        if (registry.hasOwnProperty(key) && registry[key].voice_id) {
          usedVoiceIds[registry[key].voice_id] = true;
        }
      }

      // Try to match by description
      var bestVoice = this._matchVoice(description, usedVoiceIds);

      registry[characterKey] = {
        voice_id: bestVoice.voice_id,
        voice_name: bestVoice.name,
        description: description || ''
      };
      this._saveRegistry(registry);

      return bestVoice.voice_id;
    },

    /**
     * Score a single voice against a description.
     * @param {object} voice - ElevenLabs voice object
     * @param {string} desc - Lowercased voice description
     * @param {object} usedVoiceIds - Map of voice_id → true for already-assigned voices
     * @returns {number} Score (higher is better)
     * @private
     */
    _scoreOneVoice: function (voice, desc, usedVoiceIds) {
      var score = 0;
      var labels = (voice.labels || {});
      var voiceGender = (labels.gender || '').toLowerCase();
      var voiceAge = (labels.age || '').toLowerCase();
      var voiceDesc = (labels.description || '').toLowerCase();
      var voiceUseCase = (labels.use_case || '').toLowerCase();
      var voiceAccent = (labels.accent || '').toLowerCase();

      // Gender detection — only actual gender terms, not vocal qualities
      var wantsFemale = /\b(female|woman|girl|she|her)\b/.test(desc);
      var wantsMale = /\b(male|man|boy|he|him)\b/.test(desc);

      // Gender matching (strong signal)
      if (wantsFemale && voiceGender === 'female') score += 8;
      if (wantsMale && voiceGender === 'male') score += 8;
      if (wantsFemale && voiceGender === 'male') score -= 8;
      if (wantsMale && voiceGender === 'female') score -= 8;

      // Age matching
      if (/\b(young|youth)\b/.test(desc) && /young/.test(voiceAge)) score += 3;
      if (/\b(old|elderly|aged)\b/.test(desc) && /old/.test(voiceAge)) score += 3;
      if (/\bmiddle.aged\b/.test(desc) && /middle/.test(voiceAge)) score += 3;

      // Accent matching
      var accentTerms = [
        'british', 'american', 'irish', 'scottish', 'australian',
        'french', 'german', 'italian', 'spanish', 'russian',
        'indian', 'african', 'southern', 'transatlantic', 'midwestern'
      ];
      accentTerms.forEach(function (accent) {
        var re = new RegExp('\\b' + accent + '\\b');
        if (re.test(desc) && re.test(voiceAccent)) score += 4;
      });

      // Vocal quality matching
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

      // Use-case matching (max +3)
      var isNarrator = (desc === '' || /narrat|story|audiobook/.test(desc));
      var isCharacter = (desc !== '' && !/narrat|story|audiobook/.test(desc));

      if (isNarrator && /narrat|story|audiobook/.test(voiceUseCase)) {
        score += 3;
      }
      if (isCharacter && /character|animated|gaming/.test(voiceUseCase)) {
        score += 3;
      }
      if (isCharacter && /conversat/.test(voiceUseCase)) {
        score += 1;
      }

      // Word overlap: shared words between LLM description and voice labels
      var voiceText = [voiceDesc, voiceUseCase, voiceAccent].join(' ');
      var descWords = desc.split(/[\s,]+/).filter(function (w) { return w.length > 3; });
      descWords.forEach(function (word) {
        if (voiceText.indexOf(word) !== -1) score += 1;
      });

      // Penalty for already-used voices (prefer unique assignments)
      if (usedVoiceIds[voice.voice_id]) score -= 8;

      return score;
    },

    /**
     * Match a voice description to the best available ElevenLabs voice.
     * Attempts to avoid reusing voices already assigned to other characters.
     * @private
     */
    _matchVoice: function (description, usedVoiceIds) {
      if (!_availableVoices || _availableVoices.length === 0) return null;

      var desc = (description || '').toLowerCase();
      var self = this;

      var scored = _availableVoices.map(function (voice) {
        return { voice: voice, score: self._scoreOneVoice(voice, desc, usedVoiceIds) };
      });

      // Sort by score descending
      scored.sort(function (a, b) { return b.score - a.score; });

      console.log('AudioDirector: voice match for "' + description + '":',
        scored.slice(0, 3).map(function (s) { return s.voice.name + ' (' + s.score + ')'; }).join(', '));

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

          console.log('AudioDirector: loaded ' + _availableVoices.length + ' voices from ElevenLabs');
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
          console.log('AudioDirector: segment audio buffer size:', buffer.byteLength);
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

      // Identify the player character for voice assignment
      var playerName = (gameState && gameState.player && gameState.player.name) || '';
      var playerVoiceGender = (gameState && gameState.player && gameState.player.voice_gender) || '';
      var playerVoiceDirection = (gameState && gameState.player && gameState.player.voice_direction) || '';

      // Build voice description from player's setup preferences
      var playerVoiceDesc = [playerVoiceGender, playerVoiceDirection, 'protagonist'].filter(Boolean).join(', ');

      // Build narrator voice description from setup preferences
      var narratorGender = (gameState && gameState.narrator && gameState.narrator.voice_gender) || '';
      var narratorDirection = (gameState && gameState.narrator && gameState.narrator.voice_direction) || '';
      var narratorDesc = [narratorGender, narratorDirection, 'narrator, storytelling'].filter(Boolean).join(', ');

      // Pre-assign all voices before generating
      segments.forEach(function (seg) {
        if (seg.type === 'dialogue' && seg.speaker) {
          // Use the player's voice preference if this is the player character
          if (playerName && seg.speaker === playerName) {
            self._assignVoice(seg.speaker, playerVoiceDesc || seg.voice_description || '');
          } else {
            self._assignVoice(seg.speaker, seg.voice_description || '');
          }
        }
      });
      // Assign narrator voice with user preferences
      this._assignVoice('__narrator__', narratorDesc);

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
            var entry = registry[seg.speaker];
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
            console.warn('AudioDirector: no voice assigned for', speaker);
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
              console.warn('AudioDirector: segment ' + i + ' failed:', err.message);
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
          console.warn('AudioDirector: playback error on segment', index);
          self._playSegment(index + 1);
        }
      });

      audio.play().catch(function (err) {
        console.warn('AudioDirector: autoplay blocked', err.message);
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
