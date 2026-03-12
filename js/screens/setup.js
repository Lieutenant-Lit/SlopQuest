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

      // Wire up all single-select option groups (perspective, tense, difficulty, storyLength)
      document.querySelectorAll('#screen-setup .setup-options').forEach(function (group) {
        var groupName = group.getAttribute('data-group');
        group.addEventListener('click', function (e) {
          var btn = e.target.closest('.setup-option');
          if (!btn) return;
          self.selectOption(group, groupName, btn);
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

      // Generate Story button
      document.getElementById('btn-start-game').addEventListener('click', function () {
        self.startGeneration();
      });
    },

    onShow: function () {
      // Reset single-select defaults
      this._selected = {
        perspective: 'second person',
        tense: 'present',
        difficulty: 'normal',
        storyLength: 'medium'
      };

      // Reset visual state — activate default options
      var self = this;
      document.querySelectorAll('#screen-setup .setup-options').forEach(function (group) {
        var groupName = group.getAttribute('data-group');
        var defaultVal = self._selected[groupName];
        group.querySelectorAll('.setup-option').forEach(function (btn) {
          if (btn.getAttribute('data-value') === defaultVal) {
            btn.classList.add('active');
          } else {
            btn.classList.remove('active');
          }
        });
      });

      // Clear text inputs
      document.getElementById('setup-setting-text').value = '';
      document.getElementById('setup-archetype').value = '';
      document.getElementById('setup-name').value = '';
      document.getElementById('setup-style-tone-text').value = '';

      // Clear chip highlights
      document.querySelectorAll('#screen-setup .setup-chip').forEach(function (c) {
        c.classList.remove('active');
      });

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

      return {
        setting: settingText || 'dark fantasy',
        archetype: document.getElementById('setup-archetype').value.trim() || 'wanderer',
        writingStyle: styleToneText || 'literary',
        tone: styleToneText || 'dark and gritty',
        perspective: this._selected.perspective || 'second person',
        tense: this._selected.tense || 'present',
        difficulty: this._selected.difficulty || 'normal',
        storyLength: this._selected.storyLength || 'medium',
        characterName: document.getElementById('setup-name').value.trim() || 'The Wanderer'
      };
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

      // Generate skeleton, then opening passage
      SQ.SkeletonGenerator.generate(setupConfig).then(function (skeleton) {
        var state = SQ.GameState.get();
        state.skeleton = skeleton;
        state.meta.title = skeleton.title || 'Untitled Quest';
        state.world_flags = skeleton.initial_world_flags || {};

        // Populate player resources from skeleton's genre-specific definitions
        SQ.GameState.initResourcesFromSkeleton(skeleton);

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
        var writerResponse = result.writerResponse;
        state.last_passage = writerResponse.passage;
        state.current_choices = writerResponse.choices;
        state.current.scene_number = (state.current.scene_number || 0) + 1;

        // Queue TTS narration for the opening passage (on-demand: user clicks play)
        if (SQ.PlayerConfig.isNarrationEnabled() && state.last_passage) {
          SQ.AudioDirector.prepareForPassage(state.last_passage, state);
        }

        SQ.GameState.save();

        // Wait for Game Master to apply state updates before showing the game
        return result.gameMasterPromise.then(function (gmResponse) {
          SQ.Screens.Game.applyGameMasterResponse(state, gmResponse);
          SQ.GameState.save();
        });
      }).then(function () {
        loadingOverlay.classList.add('hidden');
        self._resetButton();
        SQ.showScreen('game');
      }).catch(function (err) {
        console.error('Setup: generation failed', err);
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
    }
  };
})();
