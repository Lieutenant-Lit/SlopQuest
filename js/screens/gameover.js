/**
 * SQ.Screens.GameOver — Death and story completion screens.
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

      // Display the death/ending passage
      var passageEl = document.getElementById('gameover-passage');
      if (state.last_passage) {
        passageEl.innerHTML = '';
        var paragraphs = state.last_passage.split(/\n\n+/);
        paragraphs.forEach(function (p) {
          var el = document.createElement('p');
          el.textContent = p.trim();
          passageEl.appendChild(el);
        });
      }

      // Display stats
      var statsEl = document.getElementById('gameover-stats');
      var totalTurns = SQ.HistoryStack.length();
      var reason = state.game_over_reason || (state.player.health <= 0 ? 'You have died.' : 'Your story has ended.');

      statsEl.innerHTML =
        '<p><strong>' + reason + '</strong></p>' +
        '<p>Turns taken: ' + totalTurns + '</p>' +
        '<p>Final act: ' + (state.current.act || '?') + '</p>' +
        '<p>Final scene: ' + (state.current.scene_number || '?') + '</p>';

      // Hide rewind button if no history
      var rewindBtn = document.getElementById('btn-rewind-from-death');
      if (SQ.HistoryStack.length() > 0) {
        rewindBtn.classList.remove('hidden');
      } else {
        rewindBtn.classList.add('hidden');
      }
    },

    onHide: function () {}
  };
})();
