/**
 * SQ.Screens.Game — Main gameplay screen.
 * Displays passages, choices, status bar. Handles the turn loop.
 * Applies the full state_updates schema from design doc Section 6.4.
 */
(function () {
  SQ.Screens.Game = {
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

      // Cancel loading
      document.getElementById('btn-cancel-loading').addEventListener('click', function () {
        self.hideLoading();
      });
    },

    onShow: function () {
      this.renderState();
    },

    onHide: function () {},

    /**
     * Render the current game state to the screen.
     */
    renderState: function () {
      var state = SQ.GameState.get();
      if (!state) return;

      // Title
      document.getElementById('game-title').textContent = state.meta.title || 'SlopQuest';

      // Status bar
      document.getElementById('status-health').textContent = 'HP: ' + (state.player.health || 0);
      document.getElementById('status-act').textContent = 'Act ' + (state.current.act || 1);
      document.getElementById('status-scene').textContent = 'Scene ' + (state.current.scene_number || 1);

      // Passage
      var passageEl = document.getElementById('passage-text');
      if (state.last_passage) {
        passageEl.innerHTML = '';
        var paragraphs = state.last_passage.split(/\n\n+/);
        paragraphs.forEach(function (p) {
          var el = document.createElement('p');
          el.textContent = p.trim();
          passageEl.appendChild(el);
        });
      }

      // Choices — hide if game over or story complete
      if (state.game_over || state.story_complete) {
        document.getElementById('choices-container').classList.add('hidden');
      } else {
        document.getElementById('choices-container').classList.remove('hidden');
        this.renderChoices(state.current_choices);
      }
    },

    /**
     * Render the 4 choice buttons.
     */
    renderChoices: function (choices) {
      var labels = ['A', 'B', 'C', 'D'];
      labels.forEach(function (id) {
        var btn = document.querySelector('.btn-choice[data-choice="' + id + '"]');
        if (choices && choices[id]) {
          btn.textContent = id + '. ' + choices[id].text;
          btn.classList.remove('hidden');
          btn.disabled = false;
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

      SQ.PassageGenerator.generate(state, choiceId).then(function (response) {
        self.hideLoading();
        self.applyResponse(state, response);
      }).catch(function (err) {
        self.hideLoading();
        // Re-enable choices so player can retry
        document.querySelectorAll('.btn-choice').forEach(function (btn) {
          btn.disabled = false;
        });
        console.error('Passage generation failed:', err);
        alert('Error: ' + err.message + '\n\nYour progress is safe. Try again.');
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

      // 11. Check for game over or story complete
      var isGameOver = updates.game_over || (state.player.health <= 0);
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

    showLoading: function () {
      document.getElementById('loading-overlay').classList.remove('hidden');
    },

    hideLoading: function () {
      document.getElementById('loading-overlay').classList.add('hidden');
    }
  };
})();
