/**
 * SQ.main — Entry point, screen routing, dev toggle.
 * Must be loaded last (depends on all other modules).
 */
(function () {
  var SCREEN_IDS = ['settings', 'mainmenu', 'setup', 'game', 'rewind', 'gameover'];

  /**
   * Switch to a screen by ID. Hides all screens, shows the target,
   * and calls onShow/onHide lifecycle hooks.
   */
  SQ.showScreen = function (screenId) {
    // Map screen IDs to their Screen objects
    var screenMap = {
      settings: SQ.Screens.Settings,
      mainmenu: SQ.Screens.MainMenu,
      setup: SQ.Screens.Setup,
      game: SQ.Screens.Game,
      rewind: SQ.Screens.Rewind,
      gameover: SQ.Screens.GameOver
    };

    SCREEN_IDS.forEach(function (id) {
      var el = document.getElementById('screen-' + id);
      if (!el) return;

      if (id === screenId) {
        el.classList.add('active');
        if (screenMap[id] && screenMap[id].onShow) {
          screenMap[id].onShow();
        }
      } else {
        if (el.classList.contains('active')) {
          el.classList.remove('active');
          if (screenMap[id] && screenMap[id].onHide) {
            screenMap[id].onHide();
          }
        }
      }
    });
  };

  /**
   * Update the dev toggle button appearance.
   */
  function updateDevToggle() {
    var btn = document.getElementById('btn-dev-toggle');
    if (!btn) return;
    if (SQ.useMockData) {
      btn.textContent = 'MOCK';
      btn.classList.remove('live');
    } else {
      btn.textContent = 'LIVE';
      btn.classList.add('live');
    }
  }

  /**
   * Initialize the application.
   */
  SQ.init = function () {
    // Initialize all screens
    var screenMap = {
      settings: SQ.Screens.Settings,
      mainmenu: SQ.Screens.MainMenu,
      setup: SQ.Screens.Setup,
      game: SQ.Screens.Game,
      rewind: SQ.Screens.Rewind,
      gameover: SQ.Screens.GameOver
    };

    SCREEN_IDS.forEach(function (id) {
      if (screenMap[id] && screenMap[id].init) {
        screenMap[id].init();
      }
    });

    // Initialize error overlay
    if (SQ.ErrorOverlay && SQ.ErrorOverlay.init) {
      SQ.ErrorOverlay.init();
    }

    // Initialize log viewer
    if (SQ.LogViewer && SQ.LogViewer.init) {
      SQ.LogViewer.init();
    }

    // Wire up back buttons
    document.querySelectorAll('.btn-back').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = this.getAttribute('data-target');
        if (target) SQ.showScreen(target);
      });
    });

    // Wire up dev toggle
    var devToggle = document.getElementById('btn-dev-toggle');
    if (devToggle) {
      devToggle.addEventListener('click', function () {
        SQ.PlayerConfig.setMockMode(!SQ.useMockData);
        updateDevToggle();
      });
      updateDevToggle();
    }

    // Determine starting screen:
    // If player has a valid API key (or mock mode is on), skip to main menu.
    // Otherwise show settings for first-time setup.
    if (SQ.PlayerConfig.hasApiKey() || SQ.useMockData) {
      SQ.showScreen('mainmenu');
    } else {
      SQ.showScreen('settings');
    }
  };

  // Boot on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', SQ.init);
  } else {
    SQ.init();
  }
})();
