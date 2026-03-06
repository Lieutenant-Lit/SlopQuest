/**
 * SQ.StateValidator — Validate game state object integrity.
 * Placeholder — validates basic structure only.
 */
(function () {
  SQ.StateValidator = {
    /**
     * Validate that a state object has all required top-level fields.
     * @param {object} state
     * @returns {{ valid: boolean, errors: string[] }}
     */
    validate: function (state) {
      var errors = [];

      if (!state || typeof state !== 'object') {
        return { valid: false, errors: ['State is not an object'] };
      }

      var requiredFields = ['meta', 'player', 'relationships', 'current', 'pending_consequences', 'event_log', 'world_flags'];
      for (var i = 0; i < requiredFields.length; i++) {
        if (!(requiredFields[i] in state)) {
          errors.push('Missing required field: ' + requiredFields[i]);
        }
      }

      if (state.meta) {
        if (!state.meta.difficulty) errors.push('Missing meta.difficulty');
        if (!state.meta.story_length) errors.push('Missing meta.story_length');
      }

      if (state.player) {
        if (typeof state.player.health !== 'number') errors.push('player.health must be a number');
        if (!state.player.name) errors.push('Missing player.name');
      }

      if (state.current) {
        if (typeof state.current.act !== 'number') errors.push('current.act must be a number');
        if (typeof state.current.scene_number !== 'number') errors.push('current.scene_number must be a number');
      }

      return {
        valid: errors.length === 0,
        errors: errors
      };
    },

    /**
     * Validate a passage response from the LLM.
     * @param {object} response - Parsed JSON from passage generation
     * @returns {{ valid: boolean, errors: string[] }}
     */
    validatePassageResponse: function (response) {
      var errors = [];

      if (!response || typeof response !== 'object') {
        return { valid: false, errors: ['Response is not an object'] };
      }

      if (typeof response.passage !== 'string' || response.passage.length === 0) {
        errors.push('Missing or empty passage text');
      }

      if (!response.choices || typeof response.choices !== 'object') {
        errors.push('Missing choices object');
      } else {
        var required = ['A', 'B', 'C', 'D'];
        for (var i = 0; i < required.length; i++) {
          if (!response.choices[required[i]]) {
            errors.push('Missing choice ' + required[i]);
          } else if (!response.choices[required[i]].text) {
            errors.push('Choice ' + required[i] + ' missing text');
          }
        }
      }

      return {
        valid: errors.length === 0,
        errors: errors
      };
    }
  };
})();
