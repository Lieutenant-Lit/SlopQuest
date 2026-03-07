/**
 * SQ.Screens.Game — Main gameplay screen.
 * Displays passages (with fade-in effect), choices, status bar.
 * Handles the turn loop. Applies the full state_updates schema
 * from design doc Section 6.4.
 */
(function () {
  /** Delay (ms) between each paragraph fade-in. */
  var PARAGRAPH_STAGGER_MS = 120;

  SQ.Screens.Game = {
    /** Tracks whether the current render is the initial load (no animation). */
    _isInitialRender: true,

    init: function () {
      var self = this;

      // Choice buttons
      document.querySelectorAll('.btn-choice').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var choiceId = this.getAttribute('data-choice');
          self.makeChoice(choiceId);
        });
      });

      // Settings gear
      document.getElementById('btn-settings-gear').addEventListener('click', function () {
        SQ.showScreen('settings');
      });

      // Rewind button
      document.getElementById('btn-rewind').addEventListener('click', function () {
        SQ.showScreen('rewind');
      });

      // Cancel loading — abort in-flight API call
      document.getElementById('btn-cancel-loading').addEventListener('click', function () {
        SQ.API.abort();
        self.hideLoading();
        self._enableChoices();
      });

      // Audio playback controls
      document.getElementById('btn-audio-playpause').addEventListener('click', function () {
        SQ.AudioDirector.togglePlayPause();
      });
      document.getElementById('btn-audio-replay').addEventListener('click', function () {
        SQ.AudioDirector.replay();
      });
    },

    onShow: function () {
      this._isInitialRender = true;
      this.renderState();
    },

    onHide: function () {
      // Stop narration when navigating away
      SQ.AudioDirector.stop();
    },

    /**
     * Render the current game state to the screen.
     */
    renderState: function () {
      var state = SQ.GameState.get();
      if (!state) return;

      // Title
      document.getElementById('game-title').textContent = state.meta.title || 'SlopQuest';

      // Status bar
      this._renderStatusBar(state);

      // Illustration — show if we have a cached image URL
      if (state.illustration_image_url) {
        this._showIllustration(state.illustration_image_url, false);
      } else {
        this._hideIllustration();
      }

      // Audio controls — show if narration is enabled and we have audio
      if (state.narration_audio_url && SQ.PlayerConfig.isNarrationEnabled()) {
        SQ.AudioDirector.showControls();
      } else {
        SQ.AudioDirector.hideControls();
      }

      // Passage (with fade-in on new passages, instant on initial load/rewind)
      this._renderPassage(state.last_passage, !this._isInitialRender);
      this._isInitialRender = false;

      // Choices — hide if game over or story complete
      if (state.game_over || state.story_complete) {
        document.getElementById('choices-container').classList.add('hidden');
      } else {
        document.getElementById('choices-container').classList.remove('hidden');
        this.renderChoices(state.current_choices, !this._isInitialRender);
      }
    },

    /**
     * Render the resource/status bar.
     * Shows health, gold, provisions, and current act/scene.
     * @private
     */
    _renderStatusBar: function (state) {
      var player = state.player || {};
      var current = state.current || {};
      var resources = player.resources || {};

      // Health — update value and apply color class
      var healthEl = document.getElementById('status-health');
      var healthVal = typeof player.health === 'number' ? player.health : 100;
      healthEl.querySelector('.status-value').textContent = healthVal;
      healthEl.classList.remove('health-high', 'health-mid', 'health-low');
      if (healthVal > 60) {
        healthEl.classList.add('health-high');
      } else if (healthVal > 25) {
        healthEl.classList.add('health-mid');
      } else {
        healthEl.classList.add('health-low');
      }

      // Gold
      var goldEl = document.getElementById('status-gold');
      goldEl.querySelector('.status-value').textContent =
        typeof resources.gold === 'number' ? resources.gold : 0;

      // Provisions
      var provEl = document.getElementById('status-provisions');
      provEl.querySelector('.status-value').textContent =
        typeof resources.provisions === 'number' ? resources.provisions : 0;

      // Act / Scene
      document.getElementById('status-act').textContent = 'Act ' + (current.act || 1);
      document.getElementById('status-scene').textContent = 'Scene ' + (current.scene_number || 1);
    },

    /**
     * Render passage text into the passage container.
     * Splits on double-newlines into paragraphs.
     * If animate=true, paragraphs fade in with a staggered delay.
     * @private
     */
    _renderPassage: function (text, animate) {
      var passageEl = document.getElementById('passage-text');

      if (!text) return;

      passageEl.innerHTML = '';
      var paragraphs = text.split(/\n\n+/);

      paragraphs.forEach(function (p, i) {
        var trimmed = p.trim();
        if (!trimmed) return;

        var el = document.createElement('p');
        el.textContent = trimmed;

        if (animate) {
          el.classList.add('passage-paragraph-enter');
          // Stagger each paragraph's appearance
          setTimeout(function () {
            el.classList.add('passage-paragraph-visible');
          }, i * PARAGRAPH_STAGGER_MS);
        }

        passageEl.appendChild(el);
      });

      // Scroll passage to top when new content arrives
      passageEl.scrollTop = 0;
    },

    /**
     * Render the 4 choice buttons with label badges.
     * Uses the structured .choice-label + .choice-text spans.
     * If animate=true, choices fade in after passage paragraphs.
     */
    renderChoices: function (choices, animate) {
      var labels = ['A', 'B', 'C', 'D'];
      labels.forEach(function (id, i) {
        var btn = document.querySelector('.btn-choice[data-choice="' + id + '"]');
        var labelEl = btn.querySelector('.choice-label');
        var textEl = btn.querySelector('.choice-text');

        if (choices && choices[id]) {
          labelEl.textContent = id;
          textEl.textContent = choices[id].text;
          btn.classList.remove('hidden');
          btn.disabled = false;

          if (animate) {
            btn.classList.add('choice-enter');
            setTimeout(function () {
              btn.classList.remove('choice-enter');
            }, 50 + i * 80);
          }
        } else {
          btn.classList.add('hidden');
        }
      });
    },

    /**
     * Handle a player's choice — the core turn loop.
     * 1. Push pre-choice snapshot to history
     * 2. Call passage generator
     * 3. Apply full state_updates from response
     * 4. Check for game over / story complete
     * 5. Save and re-render
     */
    makeChoice: function (choiceId) {
      var self = this;
      var state = SQ.GameState.get();
      if (!state) return;

      // Disable choice buttons during generation
      document.querySelectorAll('.btn-choice').forEach(function (btn) {
        btn.disabled = true;
      });

      // Push pre-choice snapshot to history (never lose state)
      SQ.HistoryStack.push(
        SQ.GameState.snapshot(),
        state.last_passage,
        choiceId
      );

      self.showLoading();

      // Fire image generation in parallel if illustrations are enabled.
      // The image call uses the PREVIOUS passage's illustration_prompt since
      // we don't have the new one yet. On the first turn after the opening,
      // we use the illustration_prompt from the opening passage response.
      var imagePromise = null;
      if (SQ.PlayerConfig.isIllustrationsEnabled() && state.illustration_prompt) {
        imagePromise = SQ.ImageGenerator.generate(state.illustration_prompt, state);
      }

      SQ.PassageGenerator.generate(state, choiceId).then(function (response) {
        self.hideLoading();
        self.applyResponse(state, response);

        // Fire Audio Director for full-cast narration (parallel with image).
        // Text is already rendered by applyResponse → renderState, so audio plays
        // over visible text per design doc Section 5 progressive rendering order.
        if (SQ.PlayerConfig.isNarrationEnabled() && response.passage) {
          SQ.AudioDirector.hideControls();
          SQ.AudioDirector.generate(response.passage, state).then(function (success) {
            if (success) {
              state.narration_audio_url = 'active';
            } else {
              SQ.AudioDirector.hideControls();
            }
          });
        } else {
          SQ.AudioDirector.stop();
          SQ.AudioDirector.hideControls();
        }

        // If no image was started yet but the new response has an illustration_prompt,
        // fire image generation now (for this passage's scene).
        if (!imagePromise && SQ.PlayerConfig.isIllustrationsEnabled() && response.illustration_prompt) {
          imagePromise = SQ.ImageGenerator.generate(response.illustration_prompt, state);
        }

        // Fade illustration in when it arrives (or hide if no image call).
        // Image fades in last per design doc Section 5 progressive rendering.
        if (imagePromise) {
          self._showIllustrationLoading();
          imagePromise.then(function (imageUrl) {
            if (imageUrl) {
              state.illustration_image_url = imageUrl;
              SQ.GameState.save();
              self._showIllustration(imageUrl, true);
            } else {
              self._hideIllustration();
            }
          });
        } else {
          self._hideIllustration();
        }
      }).catch(function (err) {
        self.hideLoading();
        self._enableChoices();
        console.error('Passage generation failed:', err);

        // Show error overlay with retry callback
        SQ.ErrorOverlay.show(err, {
          onRetry: function () {
            self.makeChoice(choiceId);
          }
        });
      });
    },

    /**
     * Apply a passage response to the game state.
     * Handles the full state_updates schema from Section 6.4 / 9.2.
     */
    applyResponse: function (state, response) {
      var updates = response.state_updates || {};

      // 1. Player changes (health, resources, inventory, status_effects, skills)
      if (updates.player_changes) {
        var pc = updates.player_changes;
        if (typeof pc.health === 'number') state.player.health = pc.health;
        if (pc.resources) Object.assign(state.player.resources, pc.resources);
        if (Array.isArray(pc.inventory)) state.player.inventory = pc.inventory;
        if (Array.isArray(pc.status_effects)) state.player.status_effects = pc.status_effects;
        if (Array.isArray(pc.skills)) state.player.skills = pc.skills;
      }
      // Legacy: some responses use "player" instead of "player_changes"
      if (updates.player) {
        SQ.GameState.updatePlayer(updates.player);
      }

      // 2. New pending consequences
      if (Array.isArray(updates.new_pending_consequences)) {
        updates.new_pending_consequences.forEach(function (c) {
          state.pending_consequences.push(c);
        });
      }

      // 3. Resolved consequences — remove by id
      if (Array.isArray(updates.resolved_consequences)) {
        state.pending_consequences = state.pending_consequences.filter(function (c) {
          return updates.resolved_consequences.indexOf(c.id) === -1;
        });
      }

      // 4. Decrement scenes_remaining on all pending consequences
      state.pending_consequences.forEach(function (c) {
        if (typeof c.scenes_remaining === 'number' && c.scenes_remaining > 0) {
          c.scenes_remaining--;
        }
      });

      // 5. Event log entry
      if (updates.event_log_entry) {
        state.event_log.push(updates.event_log_entry);
      }

      // 6. World flag changes
      if (updates.world_flag_changes) {
        Object.assign(state.world_flags, updates.world_flag_changes);
      }
      // Legacy: some responses use "world_flags"
      if (updates.world_flags) {
        Object.assign(state.world_flags, updates.world_flags);
      }

      // 7. Relationship changes (deltas, not absolutes)
      if (updates.relationship_changes) {
        for (var name in updates.relationship_changes) {
          if (updates.relationship_changes.hasOwnProperty(name)) {
            var delta = updates.relationship_changes[name];
            state.relationships[name] = (state.relationships[name] || 0) + delta;
            // Clamp to -100..100
            state.relationships[name] = Math.max(-100, Math.min(100, state.relationships[name]));
          }
        }
      }
      // Legacy: some responses use "relationships" as absolute values
      if (updates.relationships) {
        Object.assign(state.relationships, updates.relationships);
      }

      // 8. Scene context update
      if (updates.new_scene_context) {
        state.current.scene_context = updates.new_scene_context;
      }
      // Legacy: some responses use "current" object
      if (updates.current) {
        SQ.GameState.updateCurrent(updates.current);
      }

      // 9. Act advancement
      if (updates.advance_act) {
        state.current.act = Math.min((state.current.act || 1) + 1, 3);
        state.current.proximity_to_climax = 0.0;
        // Load new act's locked constraints
        if (state.skeleton && Array.isArray(state.skeleton.acts)) {
          var newAct = state.skeleton.acts[state.current.act - 1];
          if (newAct && Array.isArray(newAct.locked_constraints)) {
            state.current.active_constraints = newAct.locked_constraints.slice();
          }
        }
      }

      // 10. Update passage, choices, and scene number
      state.last_passage = response.passage;
      state.current_choices = response.choices;
      state.illustration_prompt = response.illustration_prompt || '';
      state.current.scene_number = (state.current.scene_number || 0) + 1;

      // 10b. Enforce difficulty health floor (client-side safety net)
      // Don't trust the LLM to respect the floor — enforce it mechanically.
      var diffKey = (state.meta && state.meta.difficulty) || 'normal';
      var diffConfig = SQ.DifficultyConfig[diffKey] || SQ.DifficultyConfig.normal;
      if (!diffConfig.allow_game_over && state.player.health < diffConfig.health_floor) {
        state.player.health = diffConfig.health_floor;
      }

      // 10c. Prevent game_over on difficulties that don't allow it
      if (!diffConfig.allow_game_over) {
        updates.game_over = false;
      }

      // 11. Check for game over or story complete
      var isGameOver = updates.game_over || (diffConfig.allow_game_over && state.player.health <= 0);
      var isStoryComplete = updates.story_complete;

      if (isGameOver) {
        state.game_over = true;
        state.game_over_reason = updates.event_log_entry || 'The story has ended.';
        SQ.GameState.save();
        SQ.showScreen('gameover');
        return;
      }

      if (isStoryComplete) {
        state.story_complete = true;
        SQ.GameState.save();
        SQ.showScreen('gameover');
        return;
      }

      SQ.GameState.save();
      this.renderState();
    },

    /**
     * Re-enable choice buttons after an error or cancel.
     */
    _enableChoices: function () {
      document.querySelectorAll('.btn-choice').forEach(function (btn) {
        btn.disabled = false;
      });
    },

    /**
     * Show an illustration with fade-in.
     * @param {string} imageUrl - Data URL or remote URL for the image
     * @param {boolean} animate - Whether to animate the reveal
     * @private
     */
    _showIllustration: function (imageUrl, animate) {
      var container = document.getElementById('illustration-container');
      var img = document.getElementById('illustration-image');

      container.classList.remove('hidden', 'illustration-loading', 'illustration-visible');
      img.src = imageUrl;

      if (animate) {
        // Force reflow, then add visible class for CSS transition
        void container.offsetWidth;
        container.classList.add('illustration-visible');
      } else {
        container.classList.add('illustration-visible');
      }
    },

    /**
     * Show illustration container in loading state (placeholder).
     * @private
     */
    _showIllustrationLoading: function () {
      var container = document.getElementById('illustration-container');
      container.classList.remove('hidden', 'illustration-visible');
      container.classList.add('illustration-loading');
    },

    /**
     * Hide the illustration container.
     * @private
     */
    _hideIllustration: function () {
      var container = document.getElementById('illustration-container');
      container.classList.add('hidden');
      container.classList.remove('illustration-visible', 'illustration-loading');
    },

    showLoading: function () {
      document.getElementById('loading-status').textContent = 'Generating...';
      document.getElementById('loading-overlay').classList.remove('hidden');
    },

    hideLoading: function () {
      document.getElementById('loading-overlay').classList.add('hidden');
    }
  };
})();
