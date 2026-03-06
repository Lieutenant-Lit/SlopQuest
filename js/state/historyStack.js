/**
 * SQ.HistoryStack — Client-side state history for the rewind system.
 * Each entry is a pre-choice snapshot: { state, passage_text, choice_made, timestamp }.
 * Persisted to localStorage so history survives browser closure (Section 6.6).
 * Unlimited rewinds on all difficulties (Section 4.2).
 */
(function () {
  var STORAGE_KEY = 'slopquest_history_stack';
  var stack = [];

  SQ.HistoryStack = {
    /**
     * Push a snapshot onto the history stack.
     * Auto-saves to localStorage after push.
     * @param {object} stateSnapshot - Deep clone of game state
     * @param {string} passageText - The passage text at this point
     * @param {string|null} choiceMade - The choice ID that led here (null for game start)
     */
    push: function (stateSnapshot, passageText, choiceMade) {
      stack.push({
        state: JSON.parse(JSON.stringify(stateSnapshot)),
        passage_text: passageText || '',
        choice_made: choiceMade || null,
        timestamp: Date.now()
      });
      this._save();
    },

    /**
     * Pop the most recent snapshot off the stack. Returns the entry or null.
     * Auto-saves after pop.
     */
    pop: function () {
      if (stack.length === 0) return null;
      var entry = stack.pop();
      this._save();
      return entry;
    },

    /**
     * Peek at the most recent snapshot without removing it.
     */
    peek: function () {
      return stack.length > 0 ? stack[stack.length - 1] : null;
    },

    /**
     * Get all entries (for timeline display). Returns a copy of the array.
     */
    getAll: function () {
      return stack.slice();
    },

    /**
     * Rewind to a specific index, discarding everything after it.
     * Returns the entry at that index, or null if invalid.
     * Auto-saves after rewind.
     */
    rewindTo: function (index) {
      if (index < 0 || index >= stack.length) return null;
      stack = stack.slice(0, index + 1);
      this._save();
      return stack[index];
    },

    /**
     * Number of entries on the stack.
     */
    length: function () {
      return stack.length;
    },

    /**
     * Clear the entire history stack from memory and localStorage.
     */
    clear: function () {
      stack = [];
      localStorage.removeItem(STORAGE_KEY);
    },

    /**
     * Save the history stack to localStorage.
     * @private
     */
    _save: function () {
      // Strip base64 media data from snapshots before persisting —
      // images and audio are large and regenerable, not worth burning localStorage quota.
      var lightweight = stack.map(function (entry) {
        if (entry.state && (entry.state.illustration_image_url || entry.state.narration_audio_url)) {
          var clone = JSON.parse(JSON.stringify(entry));
          delete clone.state.illustration_image_url;
          delete clone.state.narration_audio_url;
          return clone;
        }
        return entry;
      });
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(lightweight));
      } catch (e) {
        // localStorage still full — drop oldest entries until it fits
        while (lightweight.length > 1) {
          lightweight.shift();
          stack.shift();
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(lightweight));
            return;
          } catch (e2) {
            // keep trimming
          }
        }
        console.warn('HistoryStack: localStorage save failed after trimming', e);
      }
    },

    /**
     * Load the history stack from localStorage into memory.
     * Called on app startup when resuming a saved game.
     * @returns {boolean} True if history was loaded successfully
     */
    load: function () {
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          stack = JSON.parse(raw);
          return true;
        }
      } catch (e) {
        console.warn('HistoryStack: failed to load from localStorage', e);
      }
      stack = [];
      return false;
    }
  };
})();
