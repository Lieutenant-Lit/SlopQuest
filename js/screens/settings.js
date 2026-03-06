/**
 * SQ.Screens.Settings — API key input, model selection, validation, main menu.
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

      // Main menu buttons
      document.getElementById('btn-continue').addEventListener('click', function () {
        SQ.GameState.load();
        SQ.showScreen('game');
      });

      document.getElementById('btn-new-game').addEventListener('click', function () {
        if (SQ.GameState.exists()) {
          if (!confirm('Starting a new game will erase your current progress. Continue?')) {
            return;
          }
          SQ.GameState.clear();
          SQ.HistoryStack.clear();
        }
        SQ.showScreen('setup');
      });
    },

    onShow: function () {
      // Populate fields from saved config
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

      // Show/hide continue button
      var continueSection = document.getElementById('continue-section');
      if (SQ.GameState.exists()) {
        continueSection.classList.remove('hidden');
      } else {
        continueSection.classList.add('hidden');
      }
    },

    onHide: function () {},

    validateKey: function () {
      var keyInput = document.getElementById('api-key-input');
      var status = document.getElementById('key-status');
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

      status.textContent = 'Validating...';
      status.className = 'status-message';

      SQ.API.validateKey(key).then(function (valid) {
        if (valid) {
          SQ.PlayerConfig.setApiKey(key);
          status.textContent = 'Key validated successfully.';
          status.className = 'status-message success';
        } else {
          status.textContent = 'Invalid key. Check your OpenRouter API key.';
          status.className = 'status-message error';
        }
      });
    }
  };
})();
