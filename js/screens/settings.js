/**
 * SQ.Screens.Settings — API key input, model selection, validation.
 * First screen for new players. Accessible from main menu via Settings button.
 */
(function () {
  var MODEL_INFO = {
    'anthropic/claude-sonnet-4': {
      desc: 'Anthropic\'s workhorse model. Excellent creative writing with strong instruction-following and reliable JSON output. The best balance of quality and cost for most players.',
      cost: '~$0.01–0.03'
    },
    'anthropic/claude-sonnet-4.5': {
      desc: 'Newest Sonnet with improved prose quality, deeper reasoning, and better character voice consistency. Slightly pricier than Sonnet 4 but noticeably better writing.',
      cost: '~$0.02–0.05'
    },
    'anthropic/claude-opus-4': {
      desc: 'Anthropic\'s premium model. Exceptional nuance, complex character development, and literary-quality prose. Best for players who want top-tier narrative quality and don\'t mind the cost.',
      cost: '~$0.10–0.30'
    },
    'anthropic/claude-opus-4.5': {
      desc: 'The most capable Claude model available. Produces the richest prose, most coherent long-form narratives, and most creative plot developments. Significantly more expensive.',
      cost: '~$0.15–0.45'
    },
    'anthropic/claude-haiku-4.5': {
      desc: 'Fast, cheap, and surprisingly capable. Great for the Game Master role where structured JSON output matters more than prose. Responds in under a second.',
      cost: '~$0.002–0.005'
    },
    'google/gemini-2.5-pro': {
      desc: 'Google\'s flagship model. Strong reasoning with good creative writing. Handles long context well, making it solid for complex story states. Competitive pricing.',
      cost: '~$0.01–0.03'
    },
    'google/gemini-2.5-flash': {
      desc: 'Google\'s fast and affordable model. Decent writing quality at a fraction of the cost. Good choice for budget-conscious players who still want reasonable quality.',
      cost: '~$0.001–0.004'
    },
    'google/gemini-2.0-flash-001': {
      desc: 'Previous-generation Flash model. Very cheap but noticeably less capable than 2.5 Flash. May produce simpler prose and occasionally miss story details.',
      cost: '~$0.001–0.003'
    },
    'openai/gpt-4o': {
      desc: 'OpenAI\'s versatile flagship. Solid creative writing with a distinctive voice. Good at following complex game state instructions. Reliable all-around choice.',
      cost: '~$0.01–0.03'
    },
    'openai/gpt-4o-mini': {
      desc: 'Lightweight GPT-4o variant. Decent quality at low cost, but may produce less varied prose and simpler narrative choices compared to the full model.',
      cost: '~$0.001–0.004'
    },
    'openai/o3-mini': {
      desc: 'OpenAI\'s reasoning model. Thinks through problems methodically, which helps with game mechanics but can make responses slower. Prose tends to be functional rather than literary.',
      cost: '~$0.01–0.04'
    },
    'deepseek/deepseek-chat': {
      desc: 'Powerful open-weight model at rock-bottom pricing. Surprisingly good creative writing for the cost. Occasional formatting quirks but excellent value overall.',
      cost: '~$0.001–0.003'
    },
    'deepseek/deepseek-r1': {
      desc: 'DeepSeek\'s reasoning model. Very thorough and analytical, great for the Game Master role. Can be verbose and slower, but catches state inconsistencies well.',
      cost: '~$0.005–0.02'
    },
    'meta-llama/llama-4-maverick': {
      desc: 'Meta\'s large Llama 4 model. Creative and expressive writing with a good sense of pacing. Open-weight model available at competitive pricing through OpenRouter.',
      cost: '~$0.002–0.006'
    },
    'meta-llama/llama-4-scout': {
      desc: 'Smaller Llama 4 model. Fast and cost-effective with decent creative output. Good budget option, though complex narratives may feel less polished than larger models.',
      cost: '~$0.001–0.003'
    },
    'mistralai/mistral-large-2512': {
      desc: 'Mistral\'s flagship model. Strong multilingual support and good instruction-following. Produces clean, readable prose with reliable structured output.',
      cost: '~$0.008–0.024'
    },
    'mistralai/mistral-small-creative-20251216': {
      desc: 'Specifically tuned for creative writing tasks. Compact and fast with a distinctive literary voice. Great budget Writer pick if you want stylistic flair.',
      cost: '~$0.001–0.003'
    },
    'mistralai/mistral-small-3.1-24b-instruct-2503': {
      desc: 'Small instruction-tuned model optimized for structured tasks. Quick and cheap — a solid Game Master pick. Less suited for creative prose writing.',
      cost: '~$0.001–0.003'
    },
    'x-ai/grok-3': {
      desc: 'xAI\'s flagship model. Known for a witty, slightly irreverent tone. Strong reasoning and good at complex game state management. Produces engaging, distinctive prose.',
      cost: '~$0.01–0.03'
    },
    'x-ai/grok-3-mini': {
      desc: 'Lighter Grok model. Retains some of the witty character at a lower price point. Good for Game Master duties, less reliable for extended creative passages.',
      cost: '~$0.003–0.01'
    },
    'qwen/qwen3-235b-a22b-07-25': {
      desc: 'Alibaba\'s large Qwen model. Competitive open-weight option with strong multilingual capabilities. Good creative writing and solid JSON output at reasonable cost.',
      cost: '~$0.002–0.006'
    },
    'qwen/qwen3-32b-04-28': {
      desc: 'Smaller Qwen model. Budget-friendly with surprisingly good results for its size. May struggle with very complex narrative branching but handles simple games well.',
      cost: '~$0.001–0.002'
    },
    'cohere/command-r-plus': {
      desc: 'Cohere\'s top model. Excellent at following structured instructions, which helps with game state management. Prose quality is solid but may feel less creative than Anthropic or OpenAI models.',
      cost: '~$0.01–0.03'
    }
  };

  function updateModelDesc(descId, modelId) {
    var el = document.getElementById(descId);
    if (!el) return;
    var info = MODEL_INFO[modelId];
    if (info) {
      el.textContent = info.desc + ' Est. ' + info.cost + '/turn.';
    } else {
      el.textContent = 'Custom model — no cost estimate available.';
    }
  }
  SQ.Screens.Settings = {
    init: function () {
      var self = this;

      // API key validation
      document.getElementById('btn-validate-key').addEventListener('click', function () {
        self.validateKey();
      });

      // Story Outline model selection
      document.getElementById('outline-model-select').addEventListener('change', function () {
        var customInput = document.getElementById('outline-model-custom-input');
        if (this.value === 'custom') {
          customInput.classList.remove('hidden');
          customInput.focus();
        } else {
          customInput.classList.add('hidden');
          SQ.PlayerConfig.setModel('skeleton', this.value);
        }
        updateModelDesc('outline-model-desc', this.value);
      });

      document.getElementById('outline-model-custom-input').addEventListener('change', function () {
        if (this.value.trim()) {
          SQ.PlayerConfig.setModel('skeleton', this.value.trim());
          updateModelDesc('outline-model-desc', this.value.trim());
        }
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
        updateModelDesc('writer-model-desc', this.value);
      });

      document.getElementById('writer-model-custom-input').addEventListener('change', function () {
        if (this.value.trim()) {
          SQ.PlayerConfig.setModel('passage', this.value.trim());
          updateModelDesc('writer-model-desc', this.value.trim());
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
          SQ.PlayerConfig.setModel('gamemaster', this.value);
        }
        updateModelDesc('gm-model-desc', this.value);
      });

      document.getElementById('gm-model-custom-input').addEventListener('change', function () {
        if (this.value.trim()) {
          SQ.PlayerConfig.setModel('gamemaster', this.value.trim());
          updateModelDesc('gm-model-desc', this.value.trim());
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
        var modelSection = document.getElementById('voice-director-model-section');
        if (this.checked) {
          modelSection.classList.remove('hidden');
        } else {
          modelSection.classList.add('hidden');
        }
      });

      // Voice Director model selection
      document.getElementById('voice-director-model-select').addEventListener('change', function () {
        var customInput = document.getElementById('voice-director-model-custom-input');
        if (this.value === 'custom') {
          customInput.classList.remove('hidden');
          customInput.focus();
        } else {
          customInput.classList.add('hidden');
          SQ.PlayerConfig.setModel('voice_director', this.value);
        }
      });

      document.getElementById('voice-director-model-custom-input').addEventListener('change', function () {
        if (this.value.trim()) {
          SQ.PlayerConfig.setModel('voice_director', this.value.trim());
        }
      });

      // Disable default voices toggle
      document.getElementById('settings-disable-default-voices').addEventListener('change', function () {
        SQ.PlayerConfig.setDisableDefaultVoicesEnabled(this.checked);
        SQ.AudioDirector.refreshVoices();
      });

      // Narration dry run toggle
      document.getElementById('settings-narration-dry-run').addEventListener('change', function () {
        SQ.PlayerConfig.setNarrationDryRunEnabled(this.checked);
      });

      // TTS mode selection
      document.getElementById('settings-tts-mode').addEventListener('change', function () {
        SQ.PlayerConfig.setTtsMode(this.value);
      });

      // Audio debug toggle
      document.getElementById('settings-audio-debug-toggle').addEventListener('change', function () {
        SQ.PlayerConfig.setAudioDebugEnabled(this.checked);
      });

      // Game state debug toggle
      document.getElementById('settings-gamestate-debug-toggle').addEventListener('change', function () {
        SQ.PlayerConfig.setGameStateDebugEnabled(this.checked);
      });

      // UI Designer debug toggle
      document.getElementById('settings-uidesigner-debug-toggle').addEventListener('change', function () {
        SQ.PlayerConfig.setUiDesignerDebugEnabled(this.checked);
      });

      // API notifications toggle
      document.getElementById('settings-api-notifications-toggle').addEventListener('change', function () {
        SQ.PlayerConfig.setApiNotificationsEnabled(this.checked);
      });

      // Logging toggle
      document.getElementById('settings-log-toggle').addEventListener('change', function () {
        SQ.PlayerConfig.setLoggingEnabled(this.checked);
      });

      // UI Designer toggle
      document.getElementById('settings-ui-designer-toggle').addEventListener('change', function () {
        SQ.PlayerConfig.setUiDesignerEnabled(this.checked);
        var modelSection = document.getElementById('ui-designer-model-section');
        if (this.checked) {
          modelSection.classList.remove('hidden');
        } else {
          modelSection.classList.add('hidden');
        }
      });

      // UI Designer model selection
      document.getElementById('ui-designer-model-select').addEventListener('change', function () {
        var customInput = document.getElementById('ui-designer-model-custom-input');
        if (this.value === 'custom') {
          customInput.classList.remove('hidden');
          customInput.focus();
        } else {
          customInput.classList.add('hidden');
          SQ.PlayerConfig.setModel('ui_designer', this.value);
        }
      });

      document.getElementById('ui-designer-model-custom-input').addEventListener('change', function () {
        if (this.value.trim()) {
          SQ.PlayerConfig.setModel('ui_designer', this.value.trim());
        }
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

      // GitHub token for log push
      document.getElementById('github-token-input').addEventListener('change', function () {
        SQ.PlayerConfig.setGithubToken(this.value.trim());
      });

      // View logs button
      document.getElementById('btn-view-logs').addEventListener('click', function () {
        SQ.LogViewer.show();
      });

      // ElevenLabs API key validation
      document.getElementById('btn-validate-elevenlabs').addEventListener('click', function () {
        self.validateElevenLabsKey();
      });

      // Back button — return to previous screen (or setup as fallback)
      document.getElementById('btn-settings-back').addEventListener('click', function () {
        var target = SQ._previousScreen || 'setup';
        // Don't navigate back to settings itself
        if (target === 'settings') target = 'setup';
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

      // Set story outline model selector to current value
      var outlineModel = SQ.PlayerConfig.getModel('skeleton');
      this._syncModelSelect('outline-model-select', 'outline-model-custom-input', outlineModel);
      updateModelDesc('outline-model-desc', outlineModel);

      // Set writer model selector to current value
      var writerModel = SQ.PlayerConfig.getModel('passage');
      this._syncModelSelect('writer-model-select', 'writer-model-custom-input', writerModel);
      updateModelDesc('writer-model-desc', writerModel);

      // Set GM model selector to current value
      var gmModel = SQ.PlayerConfig.getModel('gamemaster');
      this._syncModelSelect('gm-model-select', 'gm-model-custom-input', gmModel);
      updateModelDesc('gm-model-desc', gmModel);

      // Hide back button if no API key yet and no previous screen (first-time user)
      var backBtn = document.getElementById('btn-settings-back');
      if (backBtn) {
        if (SQ.PlayerConfig.hasApiKey() || SQ._previousScreen) {
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

      // Set narration toggle state and model selector
      var narrationEnabled = SQ.PlayerConfig.isNarrationEnabled();
      document.getElementById('settings-narration-toggle').checked = narrationEnabled;
      var voiceDirectorModelSection = document.getElementById('voice-director-model-section');
      if (narrationEnabled) {
        voiceDirectorModelSection.classList.remove('hidden');
      } else {
        voiceDirectorModelSection.classList.add('hidden');
      }
      this._syncModelSelect('voice-director-model-select', 'voice-director-model-custom-input', SQ.PlayerConfig.getModel('voice_director'));

      // Set disable default voices toggle state
      document.getElementById('settings-disable-default-voices').checked =
        SQ.PlayerConfig.isDisableDefaultVoicesEnabled();

      // Set narration dry run toggle state
      document.getElementById('settings-narration-dry-run').checked =
        SQ.PlayerConfig.isNarrationDryRunEnabled();

      // Set TTS mode selector
      document.getElementById('settings-tts-mode').value = SQ.PlayerConfig.getTtsMode();

      // Set audio debug toggle state
      document.getElementById('settings-audio-debug-toggle').checked =
        SQ.PlayerConfig.isAudioDebugEnabled();

      document.getElementById('settings-gamestate-debug-toggle').checked =
        SQ.PlayerConfig.isGameStateDebugEnabled();

      document.getElementById('settings-uidesigner-debug-toggle').checked =
        SQ.PlayerConfig.isUiDesignerDebugEnabled();

      // Set API notifications toggle state
      document.getElementById('settings-api-notifications-toggle').checked =
        SQ.PlayerConfig.isApiNotificationsEnabled();

      // Set logging toggle state
      document.getElementById('settings-log-toggle').checked =
        SQ.PlayerConfig.isLoggingEnabled();

      // Set UI Designer toggle state and model selector
      var uiDesignerEnabled = SQ.PlayerConfig.isUiDesignerEnabled();
      document.getElementById('settings-ui-designer-toggle').checked = uiDesignerEnabled;
      var uiDesignerModelSection = document.getElementById('ui-designer-model-section');
      if (uiDesignerEnabled) {
        uiDesignerModelSection.classList.remove('hidden');
      } else {
        uiDesignerModelSection.classList.add('hidden');
      }
      this._syncModelSelect('ui-designer-model-select', 'ui-designer-model-custom-input', SQ.PlayerConfig.getModel('ui_designer'));

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

      // Populate GitHub token field
      var githubToken = SQ.PlayerConfig.getGithubToken();
      var githubInput = document.getElementById('github-token-input');
      if (githubToken) {
        githubInput.value = githubToken;
      }

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
