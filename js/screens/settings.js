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

      // Model selection — show/hide custom input
      document.getElementById('model-select').addEventListener('change', function () {
        var customInput = document.getElementById('model-custom-input');
        if (this.value === 'custom') {
          customInput.classList.remove('hidden');
          customInput.focus();
        } else {
          customInput.classList.add('hidden');
          SQ.PlayerConfig.setModel('skeleton', this.value);
          SQ.PlayerConfig.setModel('passage', this.value);
        }
      });

      document.getElementById('model-custom-input').addEventListener('change', function () {
        if (this.value.trim()) {
          SQ.PlayerConfig.setModel('skeleton', this.value.trim());
          SQ.PlayerConfig.setModel('passage', this.value.trim());
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

      // ElevenLabs API key validation
      document.getElementById('btn-validate-elevenlabs').addEventListener('click', function () {
        self.validateElevenLabsKey();
      });

      // Save & continue to main menu
      document.getElementById('btn-save-settings').addEventListener('click', function () {
        SQ.showScreen('mainmenu');
      });
    },

    onShow: function () {
      // Populate API key field from saved config
      var apiKey = SQ.PlayerConfig.getApiKey();
      var keyInput = document.getElementById('api-key-input');
      if (apiKey) {
        keyInput.value = apiKey;
      }

      // Set model selector to current value
      var currentModel = SQ.PlayerConfig.getModel('skeleton');
      var select = document.getElementById('model-select');
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
        var customInput = document.getElementById('model-custom-input');
        customInput.classList.remove('hidden');
        customInput.value = currentModel;
      }

      // Hide back button if no API key yet (first-time user)
      var backBtn = document.querySelector('#screen-settings .btn-back');
      if (backBtn) {
        if (SQ.PlayerConfig.hasApiKey() || SQ.useMockData) {
          backBtn.classList.remove('hidden');
        } else {
          backBtn.classList.add('hidden');
        }
      }

      // Set illustrations toggle state
      document.getElementById('settings-illustrations-toggle').checked =
        SQ.PlayerConfig.isIllustrationsEnabled();

      // Set image model selector to current value
      var currentImageModel = SQ.PlayerConfig.getModel('image');
      var imageSelect = document.getElementById('image-model-select');
      var imageFound = false;
      for (var j = 0; j < imageSelect.options.length; j++) {
        if (imageSelect.options[j].value === currentImageModel) {
          imageSelect.selectedIndex = j;
          imageFound = true;
          break;
        }
      }
      if (!imageFound && currentImageModel) {
        imageSelect.value = 'custom';
        var imageCustomInput = document.getElementById('image-model-custom-input');
        imageCustomInput.classList.remove('hidden');
        imageCustomInput.value = currentImageModel;
      }

      // Set narration toggle state
      document.getElementById('settings-narration-toggle').checked =
        SQ.PlayerConfig.isNarrationEnabled();

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
