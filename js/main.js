/**
 * SQ.main — Entry point, screen routing.
 * Must be loaded last (depends on all other modules).
 */
(function () {
  var SCREEN_IDS = ['settings', 'setup', 'game', 'rewind', 'gameover'];

  /**
   * Switch to a screen by ID. Hides all screens, shows the target,
   * and calls onShow/onHide lifecycle hooks.
   */
  SQ.showScreen = function (screenId) {
    // Track which screen we're leaving so settings can return to it
    var currentActive = document.querySelector('.screen.active');
    if (currentActive) {
      var currentId = currentActive.id.replace('screen-', '');
      if (currentId !== screenId) {
        SQ._previousScreen = currentId;
      }
    }

    // Map screen IDs to their Screen objects
    var screenMap = {
      settings: SQ.Screens.Settings,
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
   * Initialize the application.
   */
  SQ.init = function () {
    // Initialize all screens
    var screenMap = {
      settings: SQ.Screens.Settings,
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

    // Wire up back buttons (skip settings back — it has its own handler)
    document.querySelectorAll('.btn-back[data-target]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = this.getAttribute('data-target');
        if (target) SQ.showScreen(target);
      });
    });

    // Wire up all settings gear icons (class-based, present on every non-settings screen)
    document.querySelectorAll('.btn-settings-gear').forEach(function (btn) {
      btn.addEventListener('click', function () {
        SQ.showScreen('settings');
      });
    });

    // Restore UI theme from saved game if available
    if (SQ.GameState.exists() && SQ.UIDesigner) {
      SQ.GameState.load();
      var state = SQ.GameState.get();
      if (state && state.ui_theme) {
        SQ.UIDesigner.apply(state.ui_theme);
      }
    }

    // Determine starting screen:
    // If player has a valid API key, go to setup.
    // Otherwise show settings for first-time setup.
    if (SQ.PlayerConfig.hasApiKey()) {
      SQ.showScreen('setup');
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
