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
      if (loadingStatus) loadingStatus.textContent = 'Generating story outline...';
      loadingOverlay.classList.remove('hidden');

      // Create new game state and clear stale audio caches
      SQ.GameState.create(setupConfig);
      SQ.HistoryStack.clear();
      SQ.AudioDirector.clearRegistry();
      if (SQ.PlayerConfig.isNarrationEnabled() && SQ.PlayerConfig.hasElevenLabsApiKey()) {
        SQ.AudioDirector.refreshVoices().catch(function () {});
      }

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

    _suggestionFlavors: [
      'arctic tundra', 'amazon jungle', 'deep sea trench', 'volcanic island',
      'desert caravan route', 'neon megacity', 'cyberpunk underground', 'solarpunk utopia',
      'post-apocalyptic wasteland', 'Victorian London', 'feudal Japan', '1920s prohibition',
      'wild west frontier', 'Roman coliseum era', 'medieval kingdom', 'renaissance city-state',
      'ancient Egypt', 'noir 1940s city', 'dieselpunk metropolis', 'floating sky islands',
      'generation ship', 'lunar colony', 'Mars frontier', 'sunken city',
      'eldritch fishing village', 'haunted carnival', 'isolated arctic research station',
      'witch academy', 'plague-stricken city', 'dreamworld', 'underground fungal kingdom',
      'steampunk airship fleet', 'lost island colony', 'far-future dyson sphere',
      'interdimensional bazaar', 'fairy tale forest', 'robot wasteland', 'deep cave system',
      'prison colony', 'samurai-era coastal village',
      'orbital space station', 'asteroid belt mining rig', 'crashed starship',
      'gas giant cloud harvester', 'derelict battlestation', 'wormhole gate outpost',
      'terraforming colony', 'rogue planet drifter', 'orbital elevator',
      'sleeper-ship colony vault', 'Mongol steppe khanate', 'imperial Chinese court',
      'Mughal palace city', 'Byzantine Constantinople', 'Ottoman bazaar-city',
      'Aztec ceremonial capital', 'Mayan temple complex', 'Incan mountain citadel',
      'Mesopotamian ziggurat', 'Viking coastal longhouse', 'Polynesian voyaging fleet',
      'Silk Road oasis', 'West African trading empire', 'Iron Age hillfort',
      'neolithic ritual henge', 'Cold War spy capital', '1970s rustbelt town',
      '1980s neon coast', 'climate refugee flotilla', 'occupied resistance enclave',
      'WWII submarine', '1960s space race launch site', '90s internet underground',
      'alchemist\'s tower', 'wizard\'s wandering tower', 'dragon-patrolled mountain pass',
      'necromancer\'s kingdom', 'astral plane', 'fae court', 'underworld of the dead',
      'elemental plane of fire', 'drifting iceberg city', 'desert necropolis',
      'vampire aristocrat\'s estate', 'werewolf border village', 'giant\'s bone castle',
      'cursed monastery', 'auction house of forbidden relics', 'trans-continental luxury train',
      'traveling circus troupe', 'offshore oil rig', 'remote island lighthouse',
      'abandoned asylum', 'Himalayan high-altitude valley', 'salt flats',
      'rainforest canopy village', 'savanna trading post', 'mangrove delta',
      'city inside a giant creature', 'library outside of time'
    ],

    _suggestionPlots: [
      'heist', 'prison escape', 'rescue mission', 'murder investigation', 'treasure hunt',
      'revenge quest', 'coming-of-age', 'political uprising', 'tournament', 'pilgrimage',
      'first contact', 'courtroom trial', 'siege', 'exploration of the unknown',
      'rebellion against tyranny', 'race against time', 'wedding gone wrong', 'cooking competition',
      'monster hunt', 'inheritance dispute', 'haunting', 'disaster survival',
      'undercover infiltration', 'archaeological discovery', 'road trip', 'forbidden romance',
      'manhunt', 'merchant caravan run', 'protection contract', 'uneasy truce',
      'time loop', 'cursed transformation',
      'assassination contract', 'long con', 'smuggling run', 'gang turf war', 'kidnapping plot',
      'diplomatic mission', 'treaty negotiation', 'succession crisis', 'hostage standoff',
      'defection gone wrong', 'coup d\'état', 'arranged marriage', 'love triangle',
      'mistaken identity', 'reunion with old comrades', 'body swap', 'amnesia arc',
      'breaking an ancestral curse', 'clearing one\'s name', 'confronting the past',
      'trial of initiation', 'dungeon crawl', 'labyrinth navigation', 'lost artifact retrieval',
      'voyage across unknown seas', 'scientific expedition', 'perilous delivery', 'bounty hunt',
      'tracking a mythical creature', 'reclaiming a birthright', 'quest for a cure',
      'crossing cursed wilds', 'scaling an impossible peak', 'exorcism', 'stopping a summoning',
      'completing a forbidden ritual', 'deal with a dark power', 'prophecy fulfillment',
      'prophecy denial', 'communing with the dead', 'purifying cursed ground',
      'negotiating with a trickster spirit', 'awakening an ancient being', 'bodyguarding a ruler',
      'outrunning a natural disaster', 'surviving a contagion', 'weathering a famine',
      'evading a pursuing army', 'sheltering refugees', 'rooting out a traitor',
      'mutiny on the high seas', 'sabotage mission', 'raising an army', 'missing person case',
      'uncovering a conspiracy', 'decoding an ancient text', 'locked-room mystery',
      'tracing a strange signal', 'vouching for an accused friend', 'detective rivalry',
      'chasing a hoax', 'gambling night gone wrong', 'grand performance opening', 'magical duel',
      'confronting a doppelganger', 'infiltrating a cult', 'escaping a cult', 'trial by combat'
    ],

    generateSuggestion: function () {
      var link = document.getElementById('btn-suggest-game');
      var spinner = document.getElementById('suggest-spinner');

      link.classList.add('disabled');
      spinner.classList.remove('hidden');

      var model = SQ.PlayerConfig.getModel('suggestion');
      var hint = SQ.PlayerConfig.getSuggestionHint();

      var userPrompt;
      if (hint) {
        userPrompt = 'Suggest an adventure setup guided by this player preference: "' + hint + '". ' +
          'This may be a universe/franchise, a genre, a tone, a mood, or a stylistic reference — interpret it liberally and build the setup around it. ' +
          'Pick a specific, interesting angle rather than the most obvious one. Surprise the player.\n\n';
      } else {
        var flavor = this._suggestionFlavors[Math.floor(Math.random() * this._suggestionFlavors.length)];
        var plot = this._suggestionPlots[Math.floor(Math.random() * this._suggestionPlots.length)];
        userPrompt = 'Suggest a completely original adventure setup that fuses these two elements:\n' +
          '- Flavor: ' + flavor + '\n' +
          '- Plot: ' + plot + '\n\n' +
          'Both elements must be meaningfully present in the pitch. Commit to the unexpected juxtaposition — don\'t default to the obvious reading. ' +
          'Be creative and surprising. Do not base it on any existing franchise or IP.\n\n';
      }

      var messages = [
        {
          role: 'system',
          content: 'You are a creative game designer who suggests imaginative adventure setups for a text-based RPG. ' +
            'Be concise and punchy — this is an elevator pitch, not a synopsis. ' +
            'Respond with ONLY a JSON object, no code fences or extra text.'
        },
        {
          role: 'user',
          content: userPrompt +
            'Respond with this exact JSON structure:\n' +
            '{\n' +
            '  "setting": "1-2 punchy sentences",\n' +
            '  "character": "One sentence",\n' +
            '  "writingStyle": "A few words, like a style mashup e.g. Cormac McCarthy meets Miyazaki"\n' +
            '}'
        }
      ];

      SQ.API.call(model, messages, {
        temperature: 0.95,
        max_tokens: 250,
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
