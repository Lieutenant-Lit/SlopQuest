/**
 * SQ.AudioGenerator — TTS narration via OpenRouter audio modality.
 * Abstract interface: swap to ElevenLabs or another provider by replacing
 * the _callProvider method without changing game logic.
 *
 * Design doc Section 5: fires in parallel with text + image generation,
 * audio plays as it streams in, gracefully degrades to text-only on failure.
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
     * @param {string} passageText - The passage text to narrate
     * @returns {Promise<string|null>} Audio data URL or null on failure
     */
    generate: function (passageText) {
      if (!passageText) return Promise.resolve(null);
      if (!SQ.PlayerConfig.isNarrationEnabled()) return Promise.resolve(null);

      // Stop any in-progress narration
      this.stop();

      if (SQ.useMockData) {
        return this._mockGenerate();
      }

      return this._callProvider(passageText);
    },

    /**
     * Call the active TTS provider.
     * Currently: OpenRouter with audio modality (requires stream: true).
     * Uses its own fetch + SSE parsing since streaming is fundamentally
     * different from the non-streaming SQ.API.call path.
     * To swap providers (e.g., ElevenLabs), replace this method.
     * @private
     */
    _callProvider: function (passageText) {
      var model = SQ.PlayerConfig.getModel('audio');
      var apiKey = SQ.PlayerConfig.getApiKey();

      if (!apiKey) {
        console.warn('AudioGenerator: no API key configured');
        return Promise.resolve(null);
      }

      var body = {
        model: model,
        stream: true,
        modalities: ['text', 'audio'],
        audio: { voice: 'alloy', format: 'wav' },
        messages: [
          {
            role: 'user',
            content: 'Read the following passage aloud as a narrator. '
              + 'Use a natural, dramatic reading voice appropriate for a story. '
              + 'Do not add any commentary or extra text — just narrate:\n\n'
              + passageText
          }
        ]
      };

      var controller = new AbortController();
      var timeoutId = setTimeout(function () { controller.abort(); }, AUDIO_TIMEOUT_MS);

      return fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey,
          'HTTP-Referer': window.location.href,
          'X-Title': 'SlopQuest'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      })
        .then(function (response) {
          clearTimeout(timeoutId);

          if (!response.ok) {
            return response.text().then(function (text) {
              throw new Error('HTTP ' + response.status + ': ' + text.slice(0, 200));
            });
          }

          // Parse SSE stream and accumulate audio data chunks
          return SQ.AudioGenerator._parseSSEAudio(response);
        })
        .then(function (audioData) {
          return SQ.AudioGenerator._extractAudioUrl(audioData);
        })
        .catch(function (err) {
          clearTimeout(timeoutId);
          console.warn('AudioGenerator: generation failed, degrading to text-only.');
          console.warn('  Model:', model);
          console.warn('  Error:', err.message || err);
          if (err.code) console.warn('  Code:', err.code);
          return null;
        });
    },

    /**
     * Parse an SSE stream response and accumulate the audio data.
     * OpenRouter streams audio chunks in delta.audio.data (base64 segments).
     * Returns a synthetic message object matching the non-streaming format.
     * @private
     */
    _parseSSEAudio: function (response) {
      var reader = response.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';
      var audioChunks = [];
      var audioId = null;

      function processLines(text) {
        buffer += text;
        var lines = buffer.split('\n');
        // Keep the last partial line in the buffer
        buffer = lines.pop() || '';

        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (!line || line === 'data: [DONE]') continue;
          if (line.indexOf('data: ') !== 0) continue;

          try {
            var data = JSON.parse(line.slice(6));
            var delta = data.choices && data.choices[0] && data.choices[0].delta;
            if (!delta) continue;

            // Accumulate audio data chunks
            if (delta.audio) {
              if (delta.audio.id) audioId = delta.audio.id;
              if (delta.audio.data) {
                audioChunks.push(delta.audio.data);
              }
            }
          } catch (e) {
            // Skip malformed SSE lines
          }
        }
      }

      function read() {
        return reader.read().then(function (result) {
          if (result.done) {
            // Process any remaining buffer
            if (buffer.trim()) processLines('\n');
            return;
          }
          processLines(decoder.decode(result.value, { stream: true }));
          return read();
        });
      }

      return read().then(function () {
        if (audioChunks.length === 0) {
          return null;
        }

        // Combine all base64 audio chunks into a single audio object
        var combinedData = audioChunks.join('');
        return {
          audio: {
            id: audioId,
            data: combinedData
          }
        };
      });
    },

    /**
     * Extract audio data URL from the API response.
     * OpenRouter returns audio in message.audio or content array.
     * @private
     */
    _extractAudioUrl: function (response) {
      if (!response) return null;

      // Primary: msg.audio object (OpenRouter audio modality)
      if (response.audio) {
        if (response.audio.data) {
          return 'data:audio/wav;base64,' + response.audio.data;
        }
        if (response.audio.url) {
          return response.audio.url;
        }
      }

      // Fallback: content array with audio blocks
      var content = response.content || response;
      if (Array.isArray(content)) {
        for (var i = 0; i < content.length; i++) {
          var block = content[i];
          if (block.type === 'audio' && block.data) {
            return 'data:audio/wav;base64,' + block.data;
          }
          if (block.type === 'audio_url' && block.audio_url && block.audio_url.url) {
            return block.audio_url.url;
          }
        }
      }

      // Fallback: plain data URL
      if (typeof content === 'string' && content.indexOf('data:audio') === 0) {
        return content;
      }

      console.warn('AudioGenerator: could not extract audio from response',
        JSON.stringify(response).slice(0, 200));
      return null;
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

      _audio.play().catch(function (err) {
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
