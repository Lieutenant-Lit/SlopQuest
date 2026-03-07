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

      // Audio model selection
      document.getElementById('audio-model-select').addEventListener('change', function () {
        var customInput = document.getElementById('audio-model-custom-input');
        if (this.value === 'custom') {
          customInput.classList.remove('hidden');
          customInput.focus();
        } else {
          customInput.classList.add('hidden');
          SQ.PlayerConfig.setModel('audio', this.value);
        }
      });

      document.getElementById('audio-model-custom-input').addEventListener('change', function () {
        if (this.value.trim()) {
          SQ.PlayerConfig.setModel('audio', this.value.trim());
        }
      });

      // Narrator gender selector
      document.getElementById('narrator-gender-select').addEventListener('change', function () {
        SQ.PlayerConfig.setNarratorGender(this.value);
      });

      // Voice speed slider
      var speedSlider = document.getElementById('narration-speed-slider');
      var speedValue = document.getElementById('narration-speed-value');
      speedSlider.addEventListener('input', function () {
        speedValue.textContent = parseFloat(this.value).toFixed(1) + 'x';
      });
      speedSlider.addEventListener('change', function () {
        SQ.PlayerConfig.setNarrationSpeed(parseFloat(this.value));
      });

      // Narration debug toggle
      document.getElementById('settings-narration-debug-toggle').addEventListener('change', function () {
        SQ.PlayerConfig.setNarrationDebug(this.checked);
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

      // Set audio model selector to current value
      var currentAudioModel = SQ.PlayerConfig.getModel('audio');
      var audioSelect = document.getElementById('audio-model-select');
      var audioFound = false;
      for (var k = 0; k < audioSelect.options.length; k++) {
        if (audioSelect.options[k].value === currentAudioModel) {
          audioSelect.selectedIndex = k;
          audioFound = true;
          break;
        }
      }
      if (!audioFound && currentAudioModel) {
        audioSelect.value = 'custom';
        var audioCustomInput = document.getElementById('audio-model-custom-input');
        audioCustomInput.classList.remove('hidden');
        audioCustomInput.value = currentAudioModel;
      }

      // Set narrator gender selector
      document.getElementById('narrator-gender-select').value =
        SQ.PlayerConfig.getNarratorGender();

      // Set voice speed slider
      var savedSpeed = SQ.PlayerConfig.getNarrationSpeed();
      document.getElementById('narration-speed-slider').value = savedSpeed;
      document.getElementById('narration-speed-value').textContent = savedSpeed.toFixed(1) + 'x';

      // Set narration debug toggle
      document.getElementById('settings-narration-debug-toggle').checked =
        SQ.PlayerConfig.isNarrationDebug();

      // Character voices — show when a game is active with NPCs and narration enabled
      var charCard = document.getElementById('character-voices-card');
      var charList = document.getElementById('character-voices-list');
      var gameState = SQ.GameState.get();

      if (gameState && gameState.skeleton && gameState.skeleton.npcs &&
          gameState.skeleton.npcs.length > 0 && SQ.PlayerConfig.isNarrationEnabled()) {
        charCard.classList.remove('hidden');
        charList.innerHTML = '';

        gameState.skeleton.npcs.forEach(function (npc) {
          var entry = (gameState.npc_voices && gameState.npc_voices[npc.name]) || {};
          if (typeof entry === 'string') entry = { voice: entry, style: '' };

          var row = document.createElement('div');
          row.className = 'character-voice-row';

          var label = document.createElement('label');
          label.className = 'card-label';
          label.textContent = npc.name;

          // Voice selector
          var voiceSel = document.createElement('select');
          SQ.PlayerConfig.VOICES.forEach(function (v) {
            var opt = document.createElement('option');
            opt.value = v.id;
            opt.textContent = v.label;
            if (entry.voice === v.id) opt.selected = true;
            voiceSel.appendChild(opt);
          });

          // Style instruction textarea (editable, LLM-generated)
          var styleInput = document.createElement('textarea');
          styleInput.className = 'character-style-input';
          styleInput.rows = 2;
          styleInput.placeholder = 'Voice style instructions (accent, tone, pacing...)';
          styleInput.value = entry.style || '';

          voiceSel.addEventListener('change', function () {
            if (!gameState.npc_voices) gameState.npc_voices = {};
            if (!gameState.npc_voices[npc.name]) gameState.npc_voices[npc.name] = {};
            var e = gameState.npc_voices[npc.name];
            if (typeof e === 'string') {
              gameState.npc_voices[npc.name] = { voice: voiceSel.value, style: '' };
            } else {
              e.voice = voiceSel.value;
            }
            SQ.GameState.save();
          });

          styleInput.addEventListener('change', function () {
            if (!gameState.npc_voices) gameState.npc_voices = {};
            if (!gameState.npc_voices[npc.name]) gameState.npc_voices[npc.name] = {};
            var e = gameState.npc_voices[npc.name];
            if (typeof e === 'string') {
              gameState.npc_voices[npc.name] = { voice: e, style: styleInput.value };
            } else {
              e.style = styleInput.value;
            }
            SQ.GameState.save();
          });

          row.appendChild(label);
          row.appendChild(voiceSel);
          row.appendChild(styleInput);
          charList.appendChild(row);
        });
      } else {
        charCard.classList.add('hidden');
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
