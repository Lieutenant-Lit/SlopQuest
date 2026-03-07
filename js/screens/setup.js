/**
 * SQ.Screens.Setup — New game configuration screen.
 * Collects per-game options (setting, archetype, style, tone, perspective,
 * tense, difficulty, story length) and launches skeleton generation.
 */
(function () {
  SQ.Screens.Setup = {
    /** Tracks current selection for each single-select group. */
    _selected: {},

    init: function () {
      var self = this;

      // Wire up all single-select option groups
      document.querySelectorAll('#screen-setup .setup-options').forEach(function (group) {
        var groupName = group.getAttribute('data-group');
        group.addEventListener('click', function (e) {
          var btn = e.target.closest('.setup-option');
          if (!btn) return;
          self.selectOption(group, groupName, btn);
        });
      });

      // Illustrations toggle — persist immediately
      document.getElementById('setup-illustrations-toggle').addEventListener('change', function () {
        SQ.PlayerConfig.setIllustrationsEnabled(this.checked);
      });

      // Narration toggle — persist immediately
      document.getElementById('setup-narration-toggle').addEventListener('change', function () {
        SQ.PlayerConfig.setNarrationEnabled(this.checked);
      });

      // Generate Story button
      document.getElementById('btn-start-game').addEventListener('click', function () {
        self.startGeneration();
      });
    },

    onShow: function () {
      // Reset to defaults
      this._selected = {
        setting: 'dark fantasy',
        writingStyle: 'literary',
        tone: 'dark and gritty',
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
      document.getElementById('setup-archetype').value = '';
      document.getElementById('setup-name').value = '';
      var customInput = document.getElementById('setup-setting-custom');
      customInput.value = '';
      customInput.classList.add('hidden');

      // Set illustrations toggle to saved preference
      document.getElementById('setup-illustrations-toggle').checked =
        SQ.PlayerConfig.isIllustrationsEnabled();

      // Set narration toggle to saved preference
      document.getElementById('setup-narration-toggle').checked =
        SQ.PlayerConfig.isNarrationEnabled();

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

      // Special: show/hide custom setting input
      if (groupName === 'setting') {
        var customInput = document.getElementById('setup-setting-custom');
        if (value === 'custom') {
          customInput.classList.remove('hidden');
          customInput.focus();
        } else {
          customInput.classList.add('hidden');
        }
      }
    },

    /**
     * Gather all form values into a setupConfig object.
     */
    gatherConfig: function () {
      var setting = this._selected.setting || 'dark fantasy';
      if (setting === 'custom') {
        setting = document.getElementById('setup-setting-custom').value.trim() || 'fantasy';
      }

      return {
        setting: setting,
        archetype: document.getElementById('setup-archetype').value.trim() || 'wanderer',
        writingStyle: this._selected.writingStyle || 'literary',
        tone: this._selected.tone || 'dark and gritty',
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

      // Create new game state
      SQ.GameState.create(setupConfig);
      SQ.HistoryStack.clear();

      // Generate skeleton, then opening passage
      SQ.SkeletonGenerator.generate(setupConfig).then(function (skeleton) {
        var state = SQ.GameState.get();
        state.skeleton = skeleton;
        state.meta.title = skeleton.title || 'Untitled Quest';
        state.world_flags = skeleton.initial_world_flags || {};

        // Set initial relationships from NPC roster
        if (skeleton.npcs) {
          skeleton.npcs.forEach(function (npc) {
            state.relationships[npc.name] = npc.initial_relationship || 0;
          });

        }

        SQ.GameState.save();

        // Generate voice profiles for narrator + NPCs via LLM (parallel with passage gen)
        var voiceProfilePromise = Promise.resolve({ narrator: null, npcs: {} });
        if (SQ.PlayerConfig.isNarrationEnabled()) {
          if (loadingStatus) loadingStatus.textContent = 'Casting voices...';
          voiceProfilePromise = SQ.VoiceProfileGenerator.generate(skeleton, state.meta);
        }

        // Update status for second phase
        if (loadingStatus) loadingStatus.textContent = 'Generating opening passage...';

        // Generate opening passage (parallel with voice profiles)
        var passagePromise = SQ.PassageGenerator.generate(state, null);

        return Promise.all([passagePromise, voiceProfilePromise]).then(function (results) {
          return { passageResponse: results[0], voiceProfiles: results[1] };
        });
      }).then(function (combined) {
        var passageResponse = combined.passageResponse;
        var voiceProfiles = combined.voiceProfiles;
        var state = SQ.GameState.get();

        // Apply LLM-generated narrator voice profile
        if (voiceProfiles.narrator) {
          state.narrator_voice_profile = voiceProfiles.narrator;
        }

        // Apply LLM-generated NPC voice profiles
        if (voiceProfiles.npcs) {
          var npcKeys = Object.keys(voiceProfiles.npcs);
          for (var vp = 0; vp < npcKeys.length; vp++) {
            state.npc_voices[npcKeys[vp]] = voiceProfiles.npcs[npcKeys[vp]];
          }
        }

        // Push initial state to history
        SQ.HistoryStack.push(SQ.GameState.snapshot(), '', null);

        // Apply passage response
        state.last_passage = passageResponse.passage;
        state.narration_segments = passageResponse.narration_segments || null;
        state.current_choices = passageResponse.choices;
        state.illustration_prompt = passageResponse.illustration_prompt || '';
        if (passageResponse.state_updates) {
          if (passageResponse.state_updates.current) {
            SQ.GameState.updateCurrent(passageResponse.state_updates.current);
          }
        }

        // Fire image generation for the opening scene (non-blocking)
        if (SQ.PlayerConfig.isIllustrationsEnabled() && state.illustration_prompt) {
          SQ.ImageGenerator.generate(state.illustration_prompt, state).then(function (imageUrl) {
            if (imageUrl) {
              state.illustration_image_url = imageUrl;
              SQ.GameState.save();
              // If game screen is already showing, display the illustration
              var container = document.getElementById('illustration-container');
              if (container && !container.closest('.screen.active')) return;
              SQ.Screens.Game._showIllustration(imageUrl, true);
            }
          });
        }

        // Fire TTS narration for the opening passage (non-blocking)
        if (SQ.PlayerConfig.isNarrationEnabled() && state.last_passage) {
          SQ.AudioGenerator.generate(
            state.last_passage,
            passageResponse.narration_segments || null,
            state.npc_voices
          ).then(function (audioUrl) {
            if (audioUrl) {
              state.narration_audio_url = audioUrl;
              SQ.AudioGenerator.showControls();
              SQ.AudioGenerator.play(audioUrl);
            }
          });
        }

        SQ.GameState.save();
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
