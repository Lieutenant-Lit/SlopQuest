/**
 * SQ.Screens.GameOver — Death and story completion screens.
 * Per Section 6.5:
 * - Death: show death passage + rewind timeline. Save preserved in localStorage.
 * - Story complete: show final passage + stats + event log. Clear save from localStorage.
 */
(function () {
  SQ.Screens.GameOver = {
    init: function () {
      document.getElementById('btn-rewind-from-death').addEventListener('click', function () {
        SQ.showScreen('rewind');
      });

      document.getElementById('btn-new-game-from-death').addEventListener('click', function () {
        SQ.GameState.clear();
        SQ.HistoryStack.clear();
        SQ.showScreen('setup');
      });
    },

    onShow: function () {
      var state = SQ.GameState.get();
      if (!state) return;

      var isDeath = state.game_over && !state.story_complete;
      var isComplete = !!state.story_complete;

      // Set title
      var titleEl = document.getElementById('gameover-title');
      if (isComplete) {
        titleEl.textContent = 'Story Complete';
      } else if (isDeath) {
        titleEl.textContent = 'You Died';
      } else {
        titleEl.textContent = 'Game Over';
      }

      // Render passage
      this._renderPassage(state.last_passage);

      // Render stats
      this._renderStats(state, isDeath, isComplete);

      // Render key choices from event log (story completion only)
      this._renderEventLog(state, isComplete);

      // Configure buttons
      this._configureButtons(isDeath, isComplete);

      // On story completion, clear the saved game from localStorage
      // (but not on death — player can close and resume at death screen)
      if (isComplete) {
        SQ.GameState.clear();
        SQ.HistoryStack.clear();
      }
    },

    onHide: function () {},

    /**
     * Render the death/ending passage text.
     * @private
     */
    _renderPassage: function (text) {
      var passageEl = document.getElementById('gameover-passage');
      passageEl.innerHTML = '';

      if (!text) {
        var p = document.createElement('p');
        p.textContent = 'The story has ended.';
        passageEl.appendChild(p);
        return;
      }

      var paragraphs = text.split(/\n\n+/);
      paragraphs.forEach(function (p) {
        var trimmed = p.trim();
        if (!trimmed) return;
        var el = document.createElement('p');
        el.textContent = trimmed;
        passageEl.appendChild(el);
      });
    },

    /**
     * Render stats summary.
     * @private
     */
    _renderStats: function (state, isDeath, isComplete) {
      var statsEl = document.getElementById('gameover-stats');
      var totalTurns = SQ.HistoryStack.length();
      var lines = [];

      // Death reason (death only)
      if (isDeath) {
        var reason = state.game_over_reason || 'You have fallen.';
        lines.push('<div class="gameover-reason">' + this._escape(reason) + '</div>');
      }

      // Stats grid
      lines.push('<div class="gameover-stats-grid">');

      lines.push(this._statItem('Turns', totalTurns));
      lines.push(this._statItem('Act', state.current.act || '?'));
      lines.push(this._statItem('Scene', state.current.scene_number || '?'));
      if (state.current && state.current.in_game_time) {
        lines.push(this._statItem('Time', SQ.GameState.formatTime(state.current.in_game_time)));
      }

      if (isComplete) {
        // Difficulty and story length
        lines.push(this._statItem('Difficulty', this._capitalize(state.meta.difficulty || 'normal')));
        lines.push(this._statItem('Length', this._capitalize(state.meta.story_length || 'medium')));
      }

      lines.push('</div>');

      statsEl.innerHTML = lines.join('');
    },

    /**
     * Render key choices from the event log (story completion only).
     * @private
     */
    _renderEventLog: function (state, isComplete) {
      var logEl = document.getElementById('gameover-event-log');

      if (!isComplete || !state.event_log || state.event_log.length === 0) {
        logEl.classList.add('hidden');
        return;
      }

      logEl.classList.remove('hidden');
      var html = '<h2>Key Moments</h2><ul>';

      // Show up to 10 most significant entries from the event log
      var entries = state.event_log;
      var displayed = entries.slice(-10);

      for (var i = 0; i < displayed.length; i++) {
        html += '<li>' + this._escape(displayed[i]) + '</li>';
      }

      html += '</ul>';
      logEl.innerHTML = html;
    },

    /**
     * Configure which buttons are visible and their styling.
     * Death: Rewind is primary, New Game is secondary.
     * Completion: New Game is primary, Rewind is hidden.
     * @private
     */
    _configureButtons: function (isDeath, isComplete) {
      var rewindBtn = document.getElementById('btn-rewind-from-death');
      var newGameBtn = document.getElementById('btn-new-game-from-death');

      if (isComplete) {
        // Story complete — no rewind (save already cleared), New Game is primary
        rewindBtn.classList.add('hidden');
        newGameBtn.className = 'btn btn-primary btn-large';
        newGameBtn.textContent = 'New Game';
      } else {
        // Death — Rewind is primary action
        if (SQ.HistoryStack.length() > 0) {
          rewindBtn.classList.remove('hidden');
          rewindBtn.className = 'btn btn-primary btn-large';
        } else {
          rewindBtn.classList.add('hidden');
        }
        newGameBtn.className = 'btn btn-secondary btn-large';
        newGameBtn.textContent = 'New Game';
      }
    },

    /**
     * Build a single stat item HTML string.
     * @private
     */
    _statItem: function (label, value) {
      return '<div class="stat-item">' +
        '<span class="stat-value">' + this._escape(String(value)) + '</span>' +
        '<span class="stat-label">' + this._escape(label) + '</span>' +
        '</div>';
    },

    /**
     * Capitalize first letter.
     * @private
     */
    _capitalize: function (str) {
      if (!str) return '';
      return str.charAt(0).toUpperCase() + str.slice(1);
    },

    /**
     * Escape HTML special characters.
     * @private
     */
    _escape: function (str) {
      var div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }
  };
})();
