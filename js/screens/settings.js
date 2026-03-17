/**
 * SQ.Screens.Settings — API key input, model selection, validation.
 * First screen for new players. Accessible from main menu via Settings button.
 */
(function () {
  SQ.Screens.Settings = {
    init: function () {
      var self = this;

      // API key validation
      document.getElementById('btn-validate-key').addEventListener('click', function () {
        self.validateKey();
      });

      // Writer model selection
      document.getElementById('writer-model-select').addEventListener('change', function () {
        var customInput = document.getElementById('writer-model-custom-input');
        if (this.value === 'custom') {
          customInput.classList.remove('hidden');
          customInput.focus();
        } else {
          customInput.classList.add('hidden');
          SQ.PlayerConfig.setModel('passage', this.value);
        }
      });

      document.getElementById('writer-model-custom-input').addEventListener('change', function () {
        if (this.value.trim()) {
          SQ.PlayerConfig.setModel('passage', this.value.trim());
        }
      });

      // Game Master model selection
      document.getElementById('gm-model-select').addEventListener('change', function () {
        var customInput = document.getElementById('gm-model-custom-input');
        if (this.value === 'custom') {
          customInput.classList.remove('hidden');
          customInput.focus();
        } else {
          customInput.classList.add('hidden');
          SQ.PlayerConfig.setModel('skeleton', this.value);
          SQ.PlayerConfig.setModel('gamemaster', this.value);
        }
      });

      document.getElementById('gm-model-custom-input').addEventListener('change', function () {
        if (this.value.trim()) {
          SQ.PlayerConfig.setModel('skeleton', this.value.trim());
          SQ.PlayerConfig.setModel('gamemaster', this.value.trim());
        }
      });

      // Illustrations toggle
      document.getElementById('settings-illustrations-toggle').addEventListener('change', function () {
        SQ.PlayerConfig.setIllustrationsEnabled(this.checked);
      });

      // Image model selection
      document.getElementById('image-model-select').addEventListener('change', function () {
        var customInput = document.getElementById('image-model-custom-input');
        if (this.value === 'custom') {
          customInput.classList.remove('hidden');
          customInput.focus();
        } else {
          customInput.classList.add('hidden');
          SQ.PlayerConfig.setModel('image', this.value);
        }
      });

      document.getElementById('image-model-custom-input').addEventListener('change', function () {
        if (this.value.trim()) {
          SQ.PlayerConfig.setModel('image', this.value.trim());
        }
      });

      // Narration toggle
      document.getElementById('settings-narration-toggle').addEventListener('change', function () {
        SQ.PlayerConfig.setNarrationEnabled(this.checked);
      });

      // Disable default voices toggle
      document.getElementById('settings-disable-default-voices').addEventListener('change', function () {
        SQ.PlayerConfig.setDisableDefaultVoicesEnabled(this.checked);
        SQ.AudioDirector.refreshVoices();
      });

      // Audio debug toggle
      document.getElementById('settings-audio-debug-toggle').addEventListener('change', function () {
        SQ.PlayerConfig.setAudioDebugEnabled(this.checked);
      });

      // Game state debug toggle
      document.getElementById('settings-gamestate-debug-toggle').addEventListener('change', function () {
        SQ.PlayerConfig.setGameStateDebugEnabled(this.checked);
      });

      // Logging toggle
      document.getElementById('settings-log-toggle').addEventListener('change', function () {
        SQ.PlayerConfig.setLoggingEnabled(this.checked);
      });

      // Playtester toggle
      document.getElementById('settings-playtester-toggle').addEventListener('change', function () {
        SQ.PlayerConfig.setPlaytesterEnabled(this.checked);
        var modelSection = document.getElementById('playtester-model-section');
        if (this.checked) {
          modelSection.classList.remove('hidden');
        } else {
          modelSection.classList.add('hidden');
        }
      });

      // Playtester model selection
      document.getElementById('playtester-model-select').addEventListener('change', function () {
        var customInput = document.getElementById('playtester-model-custom-input');
        if (this.value === 'custom') {
          customInput.classList.remove('hidden');
          customInput.focus();
        } else {
          customInput.classList.add('hidden');
          SQ.PlayerConfig.setModel('playtester', this.value);
        }
      });

      document.getElementById('playtester-model-custom-input').addEventListener('change', function () {
        if (this.value.trim()) {
          SQ.PlayerConfig.setModel('playtester', this.value.trim());
        }
      });

      // View logs button
      document.getElementById('btn-view-logs').addEventListener('click', function () {
        SQ.LogViewer.show();
      });

      // ElevenLabs API key validation
      document.getElementById('btn-validate-elevenlabs').addEventListener('click', function () {
        self.validateElevenLabsKey();
      });

      // Back button — return to previous screen (or mainmenu as fallback)
      document.getElementById('btn-settings-back').addEventListener('click', function () {
        var target = SQ._previousScreen || 'mainmenu';
        // Don't navigate back to settings itself
        if (target === 'settings') target = 'mainmenu';
        SQ.showScreen(target);
      });
    },

    onShow: function () {
      // Populate API key field from saved config
      var apiKey = SQ.PlayerConfig.getApiKey();
      var keyInput = document.getElementById('api-key-input');
      if (apiKey) {
        keyInput.value = apiKey;
      }

      // Set writer model selector to current value
      this._syncModelSelect('writer-model-select', 'writer-model-custom-input', SQ.PlayerConfig.getModel('passage'));

      // Set GM model selector to current value
      this._syncModelSelect('gm-model-select', 'gm-model-custom-input', SQ.PlayerConfig.getModel('gamemaster'));

      // Hide back button if no API key yet and no previous screen (first-time user)
      var backBtn = document.getElementById('btn-settings-back');
      if (backBtn) {
        if (SQ.PlayerConfig.hasApiKey() || SQ.useMockData || SQ._previousScreen) {
          backBtn.classList.remove('hidden');
        } else {
          backBtn.classList.add('hidden');
        }
      }

      // Set illustrations toggle state
      document.getElementById('settings-illustrations-toggle').checked =
        SQ.PlayerConfig.isIllustrationsEnabled();

      // Set image model selector to current value
      this._syncModelSelect('image-model-select', 'image-model-custom-input', SQ.PlayerConfig.getModel('image'));

      // Set narration toggle state
      document.getElementById('settings-narration-toggle').checked =
        SQ.PlayerConfig.isNarrationEnabled();

      // Set disable default voices toggle state
      document.getElementById('settings-disable-default-voices').checked =
        SQ.PlayerConfig.isDisableDefaultVoicesEnabled();

      // Set audio debug toggle state
      document.getElementById('settings-audio-debug-toggle').checked =
        SQ.PlayerConfig.isAudioDebugEnabled();

      document.getElementById('settings-gamestate-debug-toggle').checked =
        SQ.PlayerConfig.isGameStateDebugEnabled();

      // Set logging toggle state
      document.getElementById('settings-log-toggle').checked =
        SQ.PlayerConfig.isLoggingEnabled();

      // Set playtester toggle state and model selector
      var playtesterEnabled = SQ.PlayerConfig.isPlaytesterEnabled();
      document.getElementById('settings-playtester-toggle').checked = playtesterEnabled;
      var playtesterModelSection = document.getElementById('playtester-model-section');
      if (playtesterEnabled) {
        playtesterModelSection.classList.remove('hidden');
      } else {
        playtesterModelSection.classList.add('hidden');
      }

      this._syncModelSelect('playtester-model-select', 'playtester-model-custom-input', SQ.PlayerConfig.getModel('playtester'));

      // Populate ElevenLabs key field
      var elevenLabsKey = SQ.PlayerConfig.getElevenLabsApiKey();
      var elevenLabsInput = document.getElementById('elevenlabs-key-input');
      if (elevenLabsKey) {
        elevenLabsInput.value = elevenLabsKey;
      }

      // Reset validation statuses
      var status = document.getElementById('key-status');
      status.textContent = '';
      status.className = 'status-message';

      var elevenLabsStatus = document.getElementById('elevenlabs-key-status');
      elevenLabsStatus.textContent = '';
      elevenLabsStatus.className = 'status-message';
    },

    onHide: function () {},

    /**
     * Sync a model <select> + custom input to a stored model value.
     * @private
     */
    _syncModelSelect: function (selectId, customInputId, currentModel) {
      var select = document.getElementById(selectId);
      var customInput = document.getElementById(customInputId);
      var found = false;
      for (var i = 0; i < select.options.length; i++) {
        if (select.options[i].value === currentModel) {
          select.selectedIndex = i;
          found = true;
          break;
        }
      }
      if (!found && currentModel) {
        select.value = 'custom';
        customInput.classList.remove('hidden');
        customInput.value = currentModel;
      } else {
        customInput.classList.add('hidden');
      }
    },

    validateElevenLabsKey: function () {
      var keyInput = document.getElementById('elevenlabs-key-input');
      var status = document.getElementById('elevenlabs-key-status');
      var btn = document.getElementById('btn-validate-elevenlabs');
      var key = keyInput.value.trim();

      if (!key) {
        status.textContent = 'Please enter an ElevenLabs API key.';
        status.className = 'status-message error';
        return;
      }

      if (SQ.useMockData) {
        SQ.PlayerConfig.setElevenLabsApiKey(key);
        status.textContent = 'Key saved (mock mode — no validation).';
        status.className = 'status-message success';
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Validating...';
      status.textContent = 'Checking key with ElevenLabs...';
      status.className = 'status-message';

      // Validate using /v1/voices (not /v1/user) because restricted API keys
      // may not have User read permission but will have Voices access.
      fetch('https://api.elevenlabs.io/v1/voices', {
        method: 'GET',
        headers: { 'xi-api-key': key }
      })
        .then(function (response) {
          if (response.ok) {
            SQ.PlayerConfig.setElevenLabsApiKey(key);
            // Refresh voice cache with new key
            SQ.AudioDirector.refreshVoices();
            return response.json().then(function (data) {
              var voiceCount = (data.voices && data.voices.length) || 0;
              status.textContent = 'Key validated successfully. ' + voiceCount + ' voices available.';
              status.className = 'status-message success';
            });
          } else {
            return response.text().then(function (body) {
              var detail = '';
              try {
                var json = JSON.parse(body);
                detail = (json.detail && json.detail.message) ? json.detail.message : JSON.stringify(json.detail || json);
              } catch (e) {
                detail = body;
              }
              status.textContent = 'ElevenLabs error (HTTP ' + response.status + '): ' + detail;
              status.className = 'status-message error';
            });
          }
        })
        .catch(function () {
          status.textContent = 'Network error — could not reach ElevenLabs. Try again.';
          status.className = 'status-message error';
        })
        .then(function () {
          btn.disabled = false;
          btn.textContent = 'Validate Key';
        });
    },

    validateKey: function () {
      var keyInput = document.getElementById('api-key-input');
      var status = document.getElementById('key-status');
      var btn = document.getElementById('btn-validate-key');
      var key = keyInput.value.trim();

      if (!key) {
        status.textContent = 'Please enter an API key.';
        status.className = 'status-message error';
        return;
      }

      // In mock mode, accept any key
      if (SQ.useMockData) {
        SQ.PlayerConfig.setApiKey(key);
        status.textContent = 'Key saved (mock mode — no validation).';
        status.className = 'status-message success';
        return;
      }

      // Disable button and show validating state
      btn.disabled = true;
      btn.textContent = 'Validating...';
      status.textContent = 'Checking key with OpenRouter...';
      status.className = 'status-message';

      SQ.API.validateKey(key)
        .then(function (valid) {
          if (valid) {
            SQ.PlayerConfig.setApiKey(key);
            status.textContent = 'Key validated successfully.';
            status.className = 'status-message success';
          } else {
            status.textContent = 'Invalid key. Check your OpenRouter API key.';
            status.className = 'status-message error';
          }
        })
        .catch(function () {
          status.textContent = 'Network error — could not reach OpenRouter. Try again.';
          status.className = 'status-message error';
        })
        .then(function () {
          // Always re-enable the button (finally equivalent)
          btn.disabled = false;
          btn.textContent = 'Validate Key';
        });
    }
  };
})();
