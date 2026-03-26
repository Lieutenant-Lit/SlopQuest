/**
 * SQ.Screens.Setup — New game configuration screen.
 * Collects per-game options (setting, archetype, style/tone, perspective,
 * tense, difficulty, story length) and launches skeleton generation.
 */
(function () {
  SQ.Screens.Setup = {
    /** Tracks current selection for each single-select group. */
    _selected: {},

    init: function () {
      var self = this;

      // Continue — load saved game + history stack and jump to game screen
      document.getElementById('btn-continue').addEventListener('click', function () {
        SQ.GameState.load();
        SQ.HistoryStack.load();
        SQ.showScreen('game');
      });

      // Wire up all single-select option groups (perspective, tense, difficulty, storyLength, playtesterMaxTurns)
      document.querySelectorAll('#screen-setup .setup-options').forEach(function (group) {
        var groupName = group.getAttribute('data-group');
        group.addEventListener('click', function (e) {
          var btn = e.target.closest('.setup-option');
          if (!btn) return;
          self.selectOption(group, groupName, btn);

          // Show/hide custom max turns input
          if (groupName === 'playtesterMaxTurns') {
            var customInput = document.getElementById('setup-playtester-max-turns-custom');
            if (btn.getAttribute('data-value') === 'custom') {
              customInput.classList.remove('hidden');
              customInput.focus();
            } else {
              customInput.classList.add('hidden');
            }
          }
        });
      });

      // Wire up chip containers — clicking a chip fills its target text field
      document.querySelectorAll('#screen-setup .setup-chips').forEach(function (container) {
        var targetId = container.getAttribute('data-chip-target');
        var targetInput = document.getElementById(targetId);

        container.addEventListener('click', function (e) {
          var chip = e.target.closest('.setup-chip');
          if (!chip) return;

          // Fill text field with chip value
          targetInput.value = chip.getAttribute('data-value');

          // Highlight the clicked chip
          container.querySelectorAll('.setup-chip').forEach(function (c) {
            c.classList.remove('active');
          });
          chip.classList.add('active');
        });

        // When user types in the text field, clear chip highlights
        targetInput.addEventListener('input', function () {
          container.querySelectorAll('.setup-chip').forEach(function (c) {
            c.classList.remove('active');
          });
        });
      });

      // AI suggestion link
      document.getElementById('btn-suggest-game').addEventListener('click', function (e) {
        e.preventDefault();
        self.generateSuggestion();
      });

      // Generate Story button — confirm if overwriting a saved game
      document.getElementById('btn-start-game').addEventListener('click', function () {
        if (SQ.GameState.exists()) {
          if (!confirm('Starting a new game will erase your current progress. Continue?')) {
            return;
          }
          SQ.GameState.clear();
          SQ.HistoryStack.clear();
        }
        self.startGeneration();
      });
    },

    onShow: function () {
      // Clear UI theme only if no saved game exists (fresh setup)
      if (SQ.UIDesigner && !SQ.GameState.exists()) {
        SQ.UIDesigner.remove();
      }

      // Show Continue button only if a saved game exists
      var continueBtn = document.getElementById('btn-continue');
      if (SQ.GameState.exists()) {
        continueBtn.classList.remove('hidden');
      } else {
        continueBtn.classList.add('hidden');
      }

      // Load saved preferences or use defaults
      var prefs = null;
      try {
        var raw = localStorage.getItem('slopquest_setup_prefs');
        if (raw) prefs = JSON.parse(raw);
      } catch (e) { /* ignore */ }

      this._selected = {
        perspective: (prefs && prefs.perspective) || 'second person',
        tense: (prefs && prefs.tense) || 'present',
        difficulty: (prefs && prefs.difficulty) || 'normal',
        storyLength: (prefs && prefs.storyLength) || 'medium',
        playtesterMaxTurns: (prefs && prefs.playtesterMaxTurns) || '20'
      };

      // Activate matching option buttons
      var self = this;
      document.querySelectorAll('#screen-setup .setup-options').forEach(function (group) {
        var groupName = group.getAttribute('data-group');
        var val = self._selected[groupName];
        group.querySelectorAll('.setup-option').forEach(function (btn) {
          if (btn.getAttribute('data-value') === val) {
            btn.classList.add('active');
          } else {
            btn.classList.remove('active');
          }
        });
      });

      // Restore text inputs from saved prefs
      document.getElementById('setup-setting-text').value = (prefs && prefs.setting) || '';
      document.getElementById('setup-archetype').value = (prefs && prefs.archetype) || '';
      document.getElementById('setup-style-tone-text').value = (prefs && prefs.writingStyle) || '';

      // Highlight matching chips for restored text values
      document.querySelectorAll('#screen-setup .setup-chips').forEach(function (container) {
        var targetId = container.getAttribute('data-chip-target');
        var targetInput = document.getElementById(targetId);
        var inputVal = targetInput.value;
        container.querySelectorAll('.setup-chip').forEach(function (c) {
          if (inputVal && c.getAttribute('data-value') === inputVal) {
            c.classList.add('active');
          } else {
            c.classList.remove('active');
          }
        });
      });

      // Show/hide playtester setup card
      var playtesterCard = document.getElementById('playtester-setup-card');
      if (SQ.PlayerConfig.isPlaytesterEnabled()) {
        playtesterCard.classList.remove('hidden');
      } else {
        playtesterCard.classList.add('hidden');
      }

      // Restore playtester fields from saved prefs
      document.getElementById('setup-playtester-playstyle').value =
        (prefs && prefs.playtesterPlaystyle) || '';
      document.getElementById('setup-playtester-focus').value =
        (prefs && prefs.playtesterFocus) || '';

      // Show custom max turns input if 'custom' was selected
      var customMaxInput = document.getElementById('setup-playtester-max-turns-custom');
      if (this._selected.playtesterMaxTurns === 'custom') {
        customMaxInput.classList.remove('hidden');
        customMaxInput.value = (prefs && prefs.playtesterMaxTurnsCustom) || '';
      } else {
        customMaxInput.classList.add('hidden');
      }

      // Reset generate button
      var btn = document.getElementById('btn-start-game');
      btn.disabled = false;
      btn.textContent = 'Generate Story';
    },

    onHide: function () {},

    /**
     * Handle selecting an option in a single-select group.
     */
    selectOption: function (groupEl, groupName, btn) {
      var value = btn.getAttribute('data-value');

      // Deactivate all in group, activate clicked
      groupEl.querySelectorAll('.setup-option').forEach(function (b) {
        b.classList.remove('active');
      });
      btn.classList.add('active');

      this._selected[groupName] = value;
    },

    /**
     * Gather all form values into a setupConfig object.
     */
    gatherConfig: function () {
      var settingText = document.getElementById('setup-setting-text').value.trim();
      var styleToneText = document.getElementById('setup-style-tone-text').value.trim();

      var config = {
        setting: settingText || 'dark fantasy',
        archetype: document.getElementById('setup-archetype').value.trim() || 'wanderer',
        writingStyle: styleToneText || 'literary, dark and atmospheric',
        tone: '',
        perspective: this._selected.perspective || 'second person',
        tense: this._selected.tense || 'present',
        difficulty: this._selected.difficulty || 'normal',
        storyLength: this._selected.storyLength || 'medium'
      };

      // Add playtester config if enabled
      var playtesterPlaystyle = document.getElementById('setup-playtester-playstyle').value.trim();
      var playtesterFocus = document.getElementById('setup-playtester-focus').value.trim();
      var playtesterMaxTurnsSelection = this._selected.playtesterMaxTurns || '20';
      var playtesterMaxTurnsCustom = document.getElementById('setup-playtester-max-turns-custom').value.trim();

      if (SQ.PlayerConfig.isPlaytesterEnabled()) {
        var maxTurns = 20;
        if (playtesterMaxTurnsSelection === 'custom') {
          maxTurns = parseInt(playtesterMaxTurnsCustom, 10) || 20;
        } else {
          maxTurns = parseInt(playtesterMaxTurnsSelection, 10) || 20;
        }
        config.playtesterMaxTurns = maxTurns;
        config.playtesterPlaystyle = playtesterPlaystyle;
        config.playtesterFocusPrimer = playtesterFocus;
      }

      // Persist raw form values so onShow() can restore them next time
      try {
        localStorage.setItem('slopquest_setup_prefs', JSON.stringify({
          setting: settingText,
          archetype: document.getElementById('setup-archetype').value.trim(),
          writingStyle: styleToneText,
          perspective: this._selected.perspective,
          tense: this._selected.tense,
          difficulty: this._selected.difficulty,
          storyLength: this._selected.storyLength,
          playtesterMaxTurns: playtesterMaxTurnsSelection,
          playtesterMaxTurnsCustom: playtesterMaxTurnsCustom,
          playtesterPlaystyle: playtesterPlaystyle,
          playtesterFocus: playtesterFocus
        }));
      } catch (e) { /* localStorage full or unavailable */ }

      return config;
    },

    /**
     * Start skeleton + passage generation flow.
     * Shows loading overlay with cancel support, uses ErrorOverlay on failure.
     */
    startGeneration: function () {
      var self = this;
      var setupConfig = this.gatherConfig();
      var btn = document.getElementById('btn-start-game');
      var loadingOverlay = document.getElementById('loading-overlay');
      var loadingStatus = document.getElementById('loading-status');

      SQ.Logger.info('Setup', 'Starting new game', { config: setupConfig });

      // Disable button and show loading overlay
      btn.disabled = true;
      btn.textContent = 'Generating...';
      if (loadingStatus) loadingStatus.textContent = 'Generating story skeleton...';
      loadingOverlay.classList.remove('hidden');

      // Create new game state and clear stale audio caches
      SQ.GameState.create(setupConfig);
      SQ.HistoryStack.clear();
      SQ.AudioDirector.clearRegistry();
      SQ.AudioDirector.refreshVoices();

      // Clear previous theme before generating new one
      if (SQ.UIDesigner) {
        SQ.UIDesigner.remove();
      }

      // Fire UI Designer in parallel with skeleton (both only need setupConfig)
      if (SQ.PlayerConfig.isUiDesignerEnabled() && SQ.UIDesigner) {
        SQ.UIDesigner.generate(setupConfig).then(function (theme) {
          var state = SQ.GameState.get();
          if (state) {
            state.ui_theme = theme;
            SQ.GameState.save();
          }
          SQ.UIDesigner.apply(theme);
        }).catch(function (err) {
          SQ.Logger.warn('UIDesigner', 'Theme generation failed, using defaults', { error: err.message });
        });
      }

      // Generate skeleton, then opening passage
      SQ.SkeletonGenerator.generate(setupConfig).then(function (skeleton) {
        var state = SQ.GameState.get();
        state.skeleton = skeleton;
        state.meta.title = skeleton.title || 'Untitled Quest';
        state.player.name = skeleton.player_name || state.player.name || 'The Wanderer';
        state.world_flags = skeleton.initial_world_flags || {};

        // Populate player inventory from skeleton's starting items
        SQ.GameState.initInventoryFromSkeleton(skeleton);

        // Set initial relationships from NPC roster
        if (skeleton.npcs) {
          skeleton.npcs.forEach(function (npc) {
            state.relationships[npc.name] = npc.initial_relationship || 0;
          });
        }

        SQ.GameState.save();

        // Update status for second phase
        if (loadingStatus) loadingStatus.textContent = 'Generating opening passage...';

        // Generate opening passage
        return SQ.PassageGenerator.generate(state, null);
      }).then(function (result) {
        var state = SQ.GameState.get();

        // Push initial state to history
        SQ.HistoryStack.push(SQ.GameState.snapshot(), '', null);

        // Apply Writer response (passage + choices)
        // Note: scene_number already starts at 1 from GameState.create(),
        // so we don't increment here — the opening IS scene 1.
        var writerResponse = result.writerResponse;
        state.last_passage = writerResponse.passage;
        state.current_choices = writerResponse.choices;

        // Queue TTS narration for the opening passage (on-demand: user clicks play)
        if (SQ.PlayerConfig.isNarrationEnabled() && state.last_passage) {
          SQ.AudioDirector.prepareForPassage(state.last_passage, state);
        }

        SQ.GameState.save();

        // Show game screen immediately — don't wait for GM (mirrors makeChoice flow)
        loadingOverlay.classList.add('hidden');
        self._resetButton();
        SQ.showScreen('game');

        // Disable choices while GM processes (same as makeChoice does)
        SQ.Screens.Game._disableChoicesWithStatus('Updating game state...');

        // Let GM resolve in background
        result.gameMasterPromise.then(function (gmResponse) {
          SQ.Screens.Game.applyGameMasterResponse(state, gmResponse);
          SQ.Screens.Game._renderStatusBar(state);
          SQ.Screens.Game._renderGameStateDebug(state);
          SQ.GameState.save();

          // Check for immediate game over (unlikely on opening but be safe)
          if (state.game_over || state.story_complete) return;

          // Enable choices — GM is done
          SQ.Screens.Game._enableChoices();
          SQ.Screens.Game._hideChoiceStatus();

          // Start playtester AFTER GM finishes so scene 1 is fully visible
          if (SQ.PlayerConfig.isPlaytesterEnabled() && SQ.Playtester) {
            SQ.Playtester.start({
              maxTurns: setupConfig.playtesterMaxTurns || 20,
              playstyle: setupConfig.playtesterPlaystyle || '',
              focusPrimer: setupConfig.playtesterFocusPrimer || ''
            });
            SQ.Playtester.onTurnComplete();
          }
        }).catch(function (gmErr) {
          SQ.Logger.error('GameMaster', 'Opening GM failed', { error: gmErr.message });
          SQ.ErrorOverlay.show(gmErr, {
            onRetry: function () {
              self.startGeneration();
            }
          });
        });
      }).catch(function (err) {
        SQ.Logger.error('Setup', 'Generation failed', { error: err.message });
        loadingOverlay.classList.add('hidden');
        self._resetButton();

        // Show error overlay with retry
        SQ.ErrorOverlay.show(err, {
          onRetry: function () {
            self.startGeneration();
          }
        });
      });
    },

    /**
     * Reset the generate button to its default state.
     * @private
     */
    _resetButton: function () {
      var btn = document.getElementById('btn-start-game');
      btn.disabled = false;
      btn.textContent = 'Generate Story';
    },

    generateSuggestion: function () {
      var link = document.getElementById('btn-suggest-game');
      var spinner = document.getElementById('suggest-spinner');

      link.classList.add('disabled');
      spinner.classList.remove('hidden');

      var model = SQ.PlayerConfig.getModel('gamemaster');
      var messages = [
        {
          role: 'system',
          content: 'You are a creative game designer who suggests varied and imaginative adventure setups for a text-based RPG. ' +
            'Respond with ONLY a JSON object, no code fences or extra text.'
        },
        {
          role: 'user',
          content: 'Suggest a creative and unique adventure setup for a text-based RPG. Be wildly varied: ' +
            'sometimes draw from popular IPs and franchises (games, books, movies, anime, TV shows), ' +
            'sometimes create completely original worlds and concepts. Mix genres freely. Surprise me.\n\n' +
            'Respond with this exact JSON structure:\n' +
            '{\n' +
            '  "setting": "A 2-4 sentence vivid description of the world/universe",\n' +
            '  "character": "A 1-2 sentence description of the player character",\n' +
            '  "writingStyle": "A short description of the writing style and tone"\n' +
            '}'
        }
      ];

      SQ.API.call(model, messages, {
        temperature: 0.95,
        max_tokens: 500,
        source: 'suggestion'
      })
        .then(function (raw) {
          var result = SQ.API.parseJSON(raw);

          if (result.setting) {
            document.getElementById('setup-setting-text').value = result.setting;
          }
          if (result.character) {
            document.getElementById('setup-archetype').value = result.character;
          }
          if (result.writingStyle) {
            document.getElementById('setup-style-tone-text').value = result.writingStyle;
          }

          // Clear chip highlights since AI overwrote the text fields
          document.querySelectorAll('#screen-setup .setup-chips .setup-chip').forEach(function (c) {
            c.classList.remove('active');
          });
        })
        .catch(function (err) {
          SQ.Logger.error('Setup', 'Suggestion generation failed', { error: err.message });
        })
        .then(function () {
          link.classList.remove('disabled');
          spinner.classList.add('hidden');
        });
    }
  };
})();
