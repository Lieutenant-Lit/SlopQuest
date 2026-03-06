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

          // Auto-assign voice profiles to NPCs based on their role
          var roleHints = {
            'captain': 'grizzled_commander', 'guard': 'grizzled_commander',
            'commander': 'grizzled_commander', 'knight': 'grizzled_commander',
            'soldier': 'grizzled_commander', 'warrior': 'grizzled_commander',
            'ally': 'rebel_leader', 'resistance': 'rebel_leader',
            'rebel': 'rebel_leader', 'leader': 'rebel_leader',
            'scholar': 'mysterious_scholar', 'archivist': 'mysterious_scholar',
            'keeper': 'mysterious_scholar', 'librarian': 'mysterious_scholar',
            'mage': 'ancient_sorcerer', 'sorcerer': 'ancient_sorcerer',
            'wizard': 'ancient_sorcerer', 'witch': 'ancient_sorcerer',
            'noble': 'scheming_noble', 'lord': 'scheming_noble',
            'lady': 'scheming_noble', 'duke': 'scheming_noble',
            'urchin': 'street_urchin', 'thief': 'street_urchin',
            'rogue': 'street_urchin', 'broker': 'street_urchin',
            'elder': 'wise_elder', 'mentor': 'wise_elder',
            'squire': 'young_squire', 'apprentice': 'young_squire',
            'mercenary': 'mercenary', 'assassin': 'mercenary',
            'tavern': 'tavern_keeper', 'innkeep': 'tavern_keeper'
          };
          var profiles = SQ.PlayerConfig.VOICE_PROFILES;
          // Filter out narrator-only profiles for NPC assignment
          var npcProfiles = profiles.filter(function (p) {
            return p.id !== 'epic_narrator' && p.id !== 'dark_narrator';
          });
          var usedProfileIds = {};

          skeleton.npcs.forEach(function (npc) {
            var roleLower = (npc.role || '').toLowerCase();
            var nameLower = (npc.name || '').toLowerCase();
            var matched = null;

            // Try keyword matching on NPC role and name
            var words = Object.keys(roleHints);
            for (var w = 0; w < words.length; w++) {
              if (roleLower.indexOf(words[w]) !== -1 || nameLower.indexOf(words[w]) !== -1) {
                var profileId = roleHints[words[w]];
                if (!usedProfileIds[profileId]) {
                  matched = profileId;
                  break;
                }
              }
            }

            // Fallback: pick first unused NPC profile
            if (!matched) {
              for (var p = 0; p < npcProfiles.length; p++) {
                if (!usedProfileIds[npcProfiles[p].id]) {
                  matched = npcProfiles[p].id;
                  break;
                }
              }
            }

            // Last resort: cycle through profiles
            if (!matched) {
              matched = npcProfiles[Object.keys(usedProfileIds).length % npcProfiles.length].id;
            }

            usedProfileIds[matched] = true;

            // Find the full profile and store voice + style + profileId
            for (var q = 0; q < profiles.length; q++) {
              if (profiles[q].id === matched) {
                state.npc_voices[npc.name] = {
                  voice: profiles[q].voice,
                  style: profiles[q].style,
                  profileId: profiles[q].id
                };
                break;
              }
            }
          });
        }

        SQ.GameState.save();

        // Update status for second phase
        if (loadingStatus) loadingStatus.textContent = 'Generating opening passage...';

        // Generate opening passage
        return SQ.PassageGenerator.generate(state, null);
      }).then(function (passageResponse) {
        var state = SQ.GameState.get();

        // Push initial state to history
        SQ.HistoryStack.push(SQ.GameState.snapshot(), '', null);

        // Apply passage response
        state.last_passage = passageResponse.passage;
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
