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

      // Reset validation status
      var status = document.getElementById('key-status');
      status.textContent = '';
      status.className = 'status-message';
    },

    onHide: function () {},

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
