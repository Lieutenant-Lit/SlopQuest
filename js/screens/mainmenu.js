/**
 * SQ.Screens.MainMenu — Main menu: Continue / New Game / Settings.
 * Shown after settings are configured. Hub screen for the game.
 */
(function () {
  SQ.Screens.MainMenu = {
    init: function () {
      // Continue — load saved game + history stack and jump to game screen
      document.getElementById('btn-continue').addEventListener('click', function () {
        SQ.GameState.load();
        SQ.HistoryStack.load();
        SQ.showScreen('game');
      });

      // New Game — warn if game in progress, then go to setup
      document.getElementById('btn-new-game').addEventListener('click', function () {
        if (SQ.GameState.exists()) {
          if (!confirm('Starting a new game will erase your current progress. Continue?')) {
            return;
          }
          SQ.GameState.clear();
          SQ.HistoryStack.clear();
        }
        SQ.showScreen('setup');
      });

      // Settings — navigate to settings screen
      document.getElementById('btn-open-settings').addEventListener('click', function () {
        SQ.showScreen('settings');
      });
    },

    onShow: function () {
      // Show Continue button only if a saved game exists
      var continueBtn = document.getElementById('btn-continue');
      if (SQ.GameState.exists()) {
        continueBtn.classList.remove('hidden');
      } else {
        continueBtn.classList.add('hidden');
      }
    },

    onHide: function () {}
  };
})();
