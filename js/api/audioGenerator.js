/**
 * SQ.AudioGenerator — TTS narration via OpenRouter audio modality.
 * Abstract interface: swap to ElevenLabs or another provider by replacing
 * the _callProvider method without changing game logic.
 *
 * Supports multi-voice narration: when narration_segments are provided,
 * each segment is generated in parallel with its assigned voice, then
 * all PCM16 buffers are stitched together into a single WAV file.
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

      // If we have valid segments with multiple speakers, use multi-voice path
      if (segments && segments.length > 0 && this._hasMultipleVoices(segments, npcVoices)) {
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
     * Check if segments actually use more than one voice.
     * @private
     */
    _hasMultipleVoices: function (segments, npcVoices) {
      var narratorVoice = SQ.PlayerConfig.getNarratorVoice();
      var voices = {};
      voices[narratorVoice] = true;
      for (var i = 0; i < segments.length; i++) {
        var speaker = segments[i].speaker;
        if (speaker && npcVoices && npcVoices[speaker]) {
          var v = this._resolveVoice(npcVoices[speaker]) || narratorVoice;
          voices[v] = true;
        }
      }
      return Object.keys(voices).length > 1;
    },

    /**
     * Generate audio for multiple segments in parallel, then stitch PCM16 buffers.
     * @private
     */
    _generateMultiVoice: function (segments, npcVoices) {
      var narratorProfile = SQ.PlayerConfig.getNarratorProfile();
      var self = this;

      // Build parallel requests for each segment
      var promises = segments.map(function (seg) {
        var voice = narratorProfile.voice;
        var style = narratorProfile.style;
        if (seg.speaker && npcVoices && npcVoices[seg.speaker]) {
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
     * Fetch raw PCM16 audio data for a text segment with a given voice and style.
     * This is the core API call — returns a Uint8Array of PCM16 bytes.
     * @param {string} text - Text to narrate
     * @param {string} voice - OpenAI voice ID
     * @param {string|null} style - Style instruction for voice characterization
     * @returns {Promise<Uint8Array|null>}
     * @private
     */
    _fetchPcm16: function (text, voice, style) {
      var model = SQ.PlayerConfig.getModel('audio');
      var apiKey = SQ.PlayerConfig.getApiKey();

      if (!apiKey) {
        console.warn('AudioGenerator: no API key configured');
        return Promise.resolve(null);
      }

      var messages = [];
      if (style) {
        messages.push({
          role: 'system',
          content: style + '\nDo not add any commentary or extra text. Just read the passage aloud.'
        });
      }
      messages.push({
        role: 'user',
        content: 'Read the following passage aloud. '
          + 'Use a natural, dramatic reading voice appropriate for a story. '
          + 'Do not add any commentary or extra text — just narrate:\n\n'
          + text
      });

      var body = {
        model: model,
        stream: true,
        modalities: ['text', 'audio'],
        audio: { voice: voice || 'alloy', format: 'pcm16' },
        messages: messages
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
            return response.text().then(function (respText) {
              throw new Error('HTTP ' + response.status + ': ' + respText.slice(0, 200));
            });
          }

          return SQ.AudioGenerator._parseSSEPcm16(response);
        })
        .catch(function (err) {
          clearTimeout(timeoutId);
          console.warn('AudioGenerator: segment fetch failed.');
          console.warn('  Voice:', voice);
          console.warn('  Error:', err.message || err);
          return null;
        });
    },

    /**
     * Parse an SSE stream response and return raw PCM16 bytes (Uint8Array).
     * @private
     */
    _parseSSEPcm16: function (response) {
      var reader = response.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';
      var audioChunks = [];

      function processLines(text) {
        buffer += text;
        var lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (!line || line === 'data: [DONE]') continue;
          if (line.indexOf('data: ') !== 0) continue;

          try {
            var data = JSON.parse(line.slice(6));
            var delta = data.choices && data.choices[0] && data.choices[0].delta;
            if (!delta) continue;

            if (delta.audio && delta.audio.data) {
              audioChunks.push(delta.audio.data);
            }
          } catch (e) {
            // Skip malformed SSE lines
          }
        }
      }

      function read() {
        return reader.read().then(function (result) {
          if (result.done) {
            if (buffer.trim()) processLines('\n');
            return;
          }
          processLines(decoder.decode(result.value, { stream: true }));
          return read();
        });
      }

      return read().then(function () {
        if (audioChunks.length === 0) return null;

        // Decode all base64 PCM16 chunks into a single Uint8Array
        var arrays = audioChunks.map(function (chunk) {
          var binary = atob(chunk);
          var bytes = new Uint8Array(binary.length);
          for (var j = 0; j < binary.length; j++) {
            bytes[j] = binary.charCodeAt(j);
          }
          return bytes;
        });

        var totalLength = 0;
        for (var k = 0; k < arrays.length; k++) totalLength += arrays[k].length;
        var pcmData = new Uint8Array(totalLength);
        var offset = 0;
        for (var m = 0; m < arrays.length; m++) {
          pcmData.set(arrays[m], offset);
          offset += arrays[m].length;
        }

        return pcmData;
      });
    },

    /**
     * Wrap raw PCM16 (signed 16-bit little-endian) data in a WAV container.
     * @param {Uint8Array} pcmData - Raw PCM16 audio bytes
     * @param {number} sampleRate - Sample rate (OpenAI audio uses 24000 Hz)
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
