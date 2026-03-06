/**
 * SQ.Screens.Rewind — Timeline rewind UI.
 * Displays state history stack. Player can rewind to any previous turn.
 */
(function () {
  SQ.Screens.Rewind = {
    init: function () {
      // Event delegation for timeline entries
      document.getElementById('rewind-timeline').addEventListener('click', function (e) {
        var entry = e.target.closest('.timeline-entry');
        if (!entry) return;
        var index = parseInt(entry.getAttribute('data-index'), 10);
        if (isNaN(index)) return;

        if (!confirm('Rewind to this turn? Everything after will be lost.')) return;

        var snapshot = SQ.HistoryStack.rewindTo(index);
        if (snapshot) {
          SQ.GameState.restore(snapshot.state);
          SQ.GameState.save();
          SQ.showScreen('game');
        }
      });
    },

    onShow: function () {
      this.renderTimeline();
    },

    onHide: function () {},

    /**
     * Render the timeline from the history stack.
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
        var div = document.createElement('div');
        div.className = 'timeline-entry';
        div.setAttribute('data-index', i);

        var turnLabel = i === 0 ? 'Game Start' : 'Turn ' + i;
        var choiceLabel = entry.choice_made ? ' — Chose ' + entry.choice_made : '';
        var location = (entry.state && entry.state.current && entry.state.current.location) || '';
        var locationLabel = location ? ' (' + location + ')' : '';

        div.innerHTML =
          '<div class="turn-number">' + turnLabel + choiceLabel + '</div>' +
          '<div>' + this.truncate(entry.passage_text, 100) + locationLabel + '</div>';

        container.appendChild(div);
      }
    },

    /**
     * Truncate text to a max length with ellipsis.
     */
    truncate: function (text, maxLen) {
      if (!text) return '(no passage)';
      if (text.length <= maxLen) return text;
      return text.substring(0, maxLen) + '...';
    }
  };
})();
