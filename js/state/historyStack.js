/**
 * SQ.HistoryStack — Client-side state history for the rewind system.
 * Each entry is a pre-choice snapshot: { state, passage_text, choice_made }.
 * Stored in memory only (not localStorage — can be large).
 */
(function () {
  var stack = [];

  SQ.HistoryStack = {
    /**
     * Push a snapshot onto the history stack.
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
    },

    /**
     * Pop the most recent snapshot off the stack. Returns the entry or null.
     */
    pop: function () {
      return stack.length > 0 ? stack.pop() : null;
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
     */
    rewindTo: function (index) {
      if (index < 0 || index >= stack.length) return null;
      stack = stack.slice(0, index + 1);
      return stack[index];
    },

    /**
     * Number of entries on the stack.
     */
    length: function () {
      return stack.length;
    },

    /**
     * Clear the entire history stack.
     */
    clear: function () {
      stack = [];
    }
  };
})();
