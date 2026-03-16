/**
 * SQ.Screens.Rewind — Timeline rewind UI.
 * Displays the state history stack. Player can rewind to any previous turn.
 * Unlimited rewinds on all difficulties per Section 4.2.
 * After rewind, the player returns to the game screen at the restored state
 * and the LLM generates a fresh passage (non-deterministic).
 */
(function () {
  /** Index the player selected to rewind to. */
  var _pendingIndex = null;

  SQ.Screens.Rewind = {
    init: function () {
      var self = this;

      // Event delegation for timeline entries
      document.getElementById('rewind-timeline').addEventListener('click', function (e) {
        var entry = e.target.closest('.timeline-entry');
        if (!entry) return;
        var index = parseInt(entry.getAttribute('data-index'), 10);
        if (isNaN(index)) return;

        self._showConfirm(index);
      });

      // Confirm rewind
      document.getElementById('btn-rewind-confirm').addEventListener('click', function () {
        if (_pendingIndex === null) return;
        self._executeRewind(_pendingIndex);
      });

      // Cancel rewind
      document.getElementById('btn-rewind-cancel').addEventListener('click', function () {
        self._hideConfirm();
      });
    },

    onShow: function () {
      this._hideConfirm();
      this.renderTimeline();
    },

    onHide: function () {
      this._hideConfirm();
    },

    /**
     * Render the timeline from the history stack.
     * Each entry shows: scene number, location, choice made, and a passage snippet.
     */
    renderTimeline: function () {
      var container = document.getElementById('rewind-timeline');
      var entries = SQ.HistoryStack.getAll();

      if (entries.length === 0) {
        container.innerHTML = '<p class="placeholder-text">No history yet.</p>';
        return;
      }

      container.innerHTML = '';

      // Render in reverse order (most recent first)
      for (var i = entries.length - 1; i >= 0; i--) {
        var entry = entries[i];
        var state = entry.state || {};
        var current = state.current || {};
        var isMostRecent = (i === entries.length - 1);

        var div = document.createElement('div');
        div.className = 'timeline-entry' + (isMostRecent ? ' timeline-entry-current' : '');
        div.setAttribute('data-index', i);

        // Turn label
        var turnLabel = i === 0 ? 'Start' : 'Turn ' + i;

        // Scene / Act info
        var sceneInfo = 'Act ' + (current.act || 1) + ', Scene ' + (current.scene_number || 1);

        // Location
        var location = current.location || '';

        // Choice made
        var choiceLabel = '';
        if (entry.choice_made) {
          choiceLabel = 'Chose ' + entry.choice_made;
        }

        // Build the entry HTML
        var metaLine = '<span class="timeline-turn">' + turnLabel + '</span>';
        metaLine += '<span class="timeline-scene">' + sceneInfo + '</span>';
        if (location) {
          metaLine += '<span class="timeline-location">' + this._escapeHtml(location) + '</span>';
        }

        var html = '<div class="timeline-meta">' + metaLine + '</div>';

        if (choiceLabel) {
          html += '<div class="timeline-choice">' + choiceLabel + '</div>';
        }

        // Passage snippet
        var snippet = this._truncate(entry.passage_text, 120);
        html += '<div class="timeline-snippet">' + this._escapeHtml(snippet) + '</div>';

        if (isMostRecent) {
          html += '<div class="timeline-current-badge">Current</div>';
        }

        div.innerHTML = html;
        container.appendChild(div);
      }
    },

    /**
     * Show the inline rewind confirmation for a given index.
     * @private
     */
    _showConfirm: function (index) {
      _pendingIndex = index;

      var entries = SQ.HistoryStack.getAll();
      var discardCount = entries.length - 1 - index;
      var turnLabel = index === 0 ? 'the start' : 'Turn ' + index;
      var msg = 'Rewind to ' + turnLabel + '?';
      if (discardCount > 0) {
        msg += ' ' + discardCount + ' turn' + (discardCount === 1 ? '' : 's') + ' will be discarded.';
      }

      document.getElementById('rewind-confirm-text').textContent = msg;
      document.getElementById('rewind-confirm').classList.remove('hidden');

      // Highlight the selected entry
      document.querySelectorAll('.timeline-entry').forEach(function (el) {
        el.classList.remove('timeline-entry-selected');
      });
      var selected = document.querySelector('.timeline-entry[data-index="' + index + '"]');
      if (selected) selected.classList.add('timeline-entry-selected');
    },

    /**
     * Hide the inline rewind confirmation.
     * @private
     */
    _hideConfirm: function () {
      _pendingIndex = null;
      document.getElementById('rewind-confirm').classList.add('hidden');
      document.querySelectorAll('.timeline-entry').forEach(function (el) {
        el.classList.remove('timeline-entry-selected');
      });
    },

    /**
     * Execute the rewind: restore state, save, navigate to game screen.
     * @private
     */
    _executeRewind: function (index) {
      var currentState = SQ.GameState.get();
      var snapshot = SQ.HistoryStack.rewindTo(index);
      if (snapshot) {
        var restoredCurrent = (snapshot.state && snapshot.state.current) || {};
        SQ.Logger.info('Game', 'Rewind executed', {
          targetIndex: index,
          fromScene: currentState ? currentState.current.scene_number : undefined,
          fromAct: currentState ? currentState.current.act : undefined,
          toScene: restoredCurrent.scene_number,
          toAct: restoredCurrent.act
        });
        SQ.GameState.restore(snapshot.state);
        SQ.GameState.save();
        SQ.showScreen('game');
      }
      this._hideConfirm();
    },

    /**
     * Truncate text to a max length with ellipsis.
     * @private
     */
    _truncate: function (text, maxLen) {
      if (!text) return '(no passage)';
      if (text.length <= maxLen) return text;
      return text.substring(0, maxLen) + '...';
    },

    /**
     * Escape HTML special characters.
     * @private
     */
    _escapeHtml: function (str) {
      var div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }
  };
})();
