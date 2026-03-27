/**
 * SQ.APIToast — Lightweight toast notifications for API call tracking.
 * Shows small, auto-dismissing notifications in the top-left corner
 * with component name, model, duration, and cost.
 */
(function () {
  var DISMISS_MS = 6000;
  var FADE_MS = 400;

  var SOURCE_LABELS = {
    writer: 'Writer',
    gamemaster: 'GM',
    ui_designer: 'UI Designer',
    voice_director: 'Voice Director',
    skeleton: 'Story Outline',
    playtester: 'Playtester',
    elevenlabs_tts: 'Voice TTS'
  };

  function getContainer() {
    var el = document.getElementById('api-toast-container');
    if (!el) {
      el = document.createElement('div');
      el.id = 'api-toast-container';
      document.body.appendChild(el);
    }
    return el;
  }

  function formatDuration(ms) {
    if (ms < 1000) return ms + 'ms';
    return (ms / 1000).toFixed(1) + 's';
  }

  function formatCost(dollars) {
    if (dollars === null || dollars === undefined) return 'N/A';
    if (dollars < 0.0001) return '<$0.0001';
    if (dollars < 0.01) return '$' + dollars.toFixed(4);
    return '$' + dollars.toFixed(3);
  }

  SQ.APIToast = {
    /**
     * Show an API notification toast.
     * @param {object} info
     * @param {string} info.source - Internal source key (e.g. 'writer', 'gamemaster')
     * @param {string} info.model - Model ID (will be shortened for display)
     * @param {number} info.durationMs - Call duration in milliseconds
     * @param {number|null} info.cost - Dollar cost, or null if unavailable
     */
    show: function (info) {
      if (!SQ.PlayerConfig.isApiNotificationsEnabled()) return;

      var container = getContainer();

      var label = SOURCE_LABELS[info.source] || info.source || 'Unknown';
      var model = SQ.Pricing.shortModelName(info.model);
      var duration = formatDuration(info.durationMs);
      var cost = formatCost(info.cost);

      var toast = document.createElement('div');
      toast.className = 'api-toast';
      toast.textContent = label + ' \u00b7 ' + model + ' \u00b7 ' + duration + ' \u00b7 ' + cost;

      container.appendChild(toast);

      // Force reflow then add visible class for enter animation
      toast.offsetHeight; // eslint-disable-line no-unused-expressions
      toast.classList.add('api-toast--visible');

      // Auto-dismiss
      setTimeout(function () {
        toast.classList.remove('api-toast--visible');
        setTimeout(function () {
          if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, FADE_MS);
      }, DISMISS_MS);
    }
  };
})();
