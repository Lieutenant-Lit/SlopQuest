/**
 * SQ.ErrorOverlay — In-page error display replacing alert().
 * Shows clear, non-technical messages with context-appropriate action buttons
 * per design doc Section 6.7. Never loses game state.
 */
(function () {
  var overlayEl, messageEl, actionsEl;

  SQ.ErrorOverlay = {
    /**
     * Initialize the error overlay (called once on page load).
     * Caches DOM references.
     */
    init: function () {
      overlayEl = document.getElementById('error-overlay');
      messageEl = document.getElementById('error-message');
      actionsEl = document.getElementById('error-actions');
    },

    /**
     * Show an error with context-appropriate action buttons.
     * Automatically inspects error code to determine which buttons to show.
     *
     * @param {Error} err - The error (ideally an SQ.API.APIError with .code)
     * @param {object} [callbacks] - Optional callback overrides
     * @param {function} [callbacks.onRetry] - Called when Retry is tapped
     * @param {function} [callbacks.onDismiss] - Called when Dismiss is tapped (default: just hide)
     */
    show: function (err, callbacks) {
      callbacks = callbacks || {};
      var code = err.code || '';
      var message = err.message || 'An unexpected error occurred.';
      var self = this;

      messageEl.textContent = message;
      actionsEl.innerHTML = '';

      // Determine which buttons to show based on error code
      var showRetry = true;
      var showSettings = false;

      if (code === SQ.API.ErrorCodes.AUTH_FAILED || code === SQ.API.ErrorCodes.NO_API_KEY) {
        showSettings = true;
        showRetry = false;
      } else if (code === SQ.API.ErrorCodes.MODEL_ERROR) {
        showSettings = true;
        showRetry = true;
      }

      // Retry button
      if (showRetry && callbacks.onRetry) {
        var retryBtn = document.createElement('button');
        retryBtn.className = 'btn btn-primary';
        retryBtn.textContent = 'Retry';
        retryBtn.addEventListener('click', function () {
          self.hide();
          callbacks.onRetry();
        });
        actionsEl.appendChild(retryBtn);
      }

      // Settings button (for auth and model errors)
      if (showSettings) {
        var settingsBtn = document.createElement('button');
        settingsBtn.className = 'btn btn-secondary';
        settingsBtn.textContent = 'Open Settings';
        settingsBtn.addEventListener('click', function () {
          self.hide();
          SQ.showScreen('settings');
        });
        actionsEl.appendChild(settingsBtn);
      }

      // Dismiss button (always available)
      var dismissBtn = document.createElement('button');
      dismissBtn.className = 'btn btn-link';
      dismissBtn.textContent = 'Dismiss';
      dismissBtn.addEventListener('click', function () {
        self.hide();
        if (callbacks.onDismiss) callbacks.onDismiss();
      });
      actionsEl.appendChild(dismissBtn);

      overlayEl.classList.remove('hidden');
    },

    /**
     * Hide the error overlay.
     */
    hide: function () {
      overlayEl.classList.add('hidden');
    }
  };
})();
