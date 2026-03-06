/**
 * SQ.Screens.Game — Main gameplay screen.
 * Displays passages, choices, status bar. Handles the turn loop.
 */
(function () {
  SQ.Screens.Game = {
    init: function () {
      var self = this;

      // Choice buttons
      var choiceButtons = document.querySelectorAll('.btn-choice');
      choiceButtons.forEach(function (btn) {
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
        // Split by double newlines for paragraphs
        var paragraphs = state.last_passage.split(/\n\n+/);
        paragraphs.forEach(function (p) {
          var el = document.createElement('p');
          el.textContent = p.trim();
          passageEl.appendChild(el);
        });
      }

      // Choices
      this.renderChoices(state.current_choices);
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
        } else {
          btn.classList.add('hidden');
        }
      });
    },

    /**
     * Handle a player's choice.
     */
    makeChoice: function (choiceId) {
      var self = this;
      var state = SQ.GameState.get();
      if (!state) return;

      // Push pre-choice snapshot to history
      SQ.HistoryStack.push(
        SQ.GameState.snapshot(),
        state.last_passage,
        choiceId
      );

      self.showLoading();

      SQ.PassageGenerator.generate(state, choiceId).then(function (response) {
        self.hideLoading();

        // Apply state updates
        if (response.state_updates) {
          if (response.state_updates.player) {
            SQ.GameState.updatePlayer(response.state_updates.player);
          }
          if (response.state_updates.current) {
            SQ.GameState.updateCurrent(response.state_updates.current);
          }
          if (response.state_updates.relationships) {
            Object.assign(state.relationships, response.state_updates.relationships);
          }
          if (response.state_updates.world_flags) {
            Object.assign(state.world_flags, response.state_updates.world_flags);
          }
        }

        // Update passage and choices
        state.last_passage = response.passage;
        state.current_choices = response.choices;
        state.current.scene_number = (state.current.scene_number || 0) + 1;

        // Check for game over
        if (state.game_over || (state.player.health <= 0)) {
          state.game_over = true;
          SQ.GameState.save();
          SQ.showScreen('gameover');
          return;
        }

        SQ.GameState.save();
        self.renderState();
      }).catch(function (err) {
        self.hideLoading();
        console.error('Passage generation failed:', err);
        alert('Error: ' + err.message + '\n\nYour progress is safe. Try again.');
      });
    },

    showLoading: function () {
      document.getElementById('loading-overlay').classList.remove('hidden');
    },

    hideLoading: function () {
      document.getElementById('loading-overlay').classList.add('hidden');
    }
  };
})();
