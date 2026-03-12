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
     * Validate a skeleton response from the LLM.
     * Checks all required fields per design doc Section 2.2.
     * @param {object} skeleton - Parsed skeleton JSON
     * @param {object} setupConfig - The setup config used to generate it
     * @returns {{ valid: boolean, errors: string[] }}
     */
    validateSkeleton: function (skeleton, setupConfig) {
      var errors = [];

      if (!skeleton || typeof skeleton !== 'object') {
        return { valid: false, errors: ['Skeleton is not an object'] };
      }

      // Top-level required strings
      var requiredStrings = ['title', 'premise', 'central_question', 'ending_shape'];
      for (var i = 0; i < requiredStrings.length; i++) {
        if (typeof skeleton[requiredStrings[i]] !== 'string' || !skeleton[requiredStrings[i]]) {
          errors.push('Missing or empty: ' + requiredStrings[i]);
        }
      }

      // Setting object
      if (!skeleton.setting || typeof skeleton.setting !== 'object') {
        errors.push('Missing setting object');
      } else {
        if (!skeleton.setting.name) errors.push('Missing setting.name');
        if (!skeleton.setting.description) errors.push('Missing setting.description');
      }

      // Acts — must be array of 3
      if (!Array.isArray(skeleton.acts)) {
        errors.push('acts must be an array');
      } else {
        if (skeleton.acts.length !== 3) {
          errors.push('Expected 3 acts, got ' + skeleton.acts.length);
        }
        for (var a = 0; a < skeleton.acts.length; a++) {
          var act = skeleton.acts[a];
          if (!act.title) errors.push('Act ' + (a + 1) + ' missing title');
          if (!act.description) errors.push('Act ' + (a + 1) + ' missing description');
          if (!act.end_condition) errors.push('Act ' + (a + 1) + ' missing end_condition');
          if (typeof act.target_scenes !== 'number' || act.target_scenes < 1) {
            errors.push('Act ' + (a + 1) + ' missing or invalid target_scenes');
          }
          if (!Array.isArray(act.locked_constraints)) {
            errors.push('Act ' + (a + 1) + ' missing locked_constraints array');
          }
          if (!Array.isArray(act.key_beats)) {
            errors.push('Act ' + (a + 1) + ' missing key_beats array');
          }
        }
      }

      // NPCs — must be array with count in range for story length
      if (!Array.isArray(skeleton.npcs)) {
        errors.push('npcs must be an array');
      } else {
        if (skeleton.npcs.length === 0) {
          errors.push('npcs array is empty');
        }
        for (var n = 0; n < skeleton.npcs.length; n++) {
          var npc = skeleton.npcs[n];
          if (!npc.name) errors.push('NPC ' + (n + 1) + ' missing name');
          if (!npc.role) errors.push('NPC ' + (n + 1) + ' missing role');
          if (typeof npc.initial_relationship !== 'number') {
            errors.push('NPC ' + (n + 1) + ' (' + (npc.name || '?') + ') missing initial_relationship number');
          }
        }
      }

      // Factions
      if (!Array.isArray(skeleton.factions)) {
        errors.push('factions must be an array');
      } else if (skeleton.factions.length === 0) {
        errors.push('factions array is empty');
      }

      // World rules
      if (!Array.isArray(skeleton.world_rules)) {
        errors.push('world_rules must be an array');
      } else if (skeleton.world_rules.length === 0) {
        errors.push('world_rules array is empty');
      }

      // Initial world flags
      if (!skeleton.initial_world_flags || typeof skeleton.initial_world_flags !== 'object') {
        errors.push('Missing initial_world_flags object');
      }

      return {
        valid: errors.length === 0,
        errors: errors
      };
    },

    /**
     * Validate a Writer response from the LLM.
     * Checks passage text and choices A-D with text.
     * @param {object} response - Parsed JSON from Writer
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
    },

    /**
     * Validate a Game Master response from the LLM.
     * Checks state_updates structure and choice_metadata.
     * @param {object} response - Parsed JSON from Game Master
     * @param {string} [difficulty] - Current difficulty for metadata requirements
     * @returns {{ valid: boolean, errors: string[] }}
     */
    validateGameMasterResponse: function (response, difficulty) {
      var errors = [];

      if (!response || typeof response !== 'object') {
        return { valid: false, errors: ['Response is not an object'] };
      }

      // state_updates is required
      if (!response.state_updates || typeof response.state_updates !== 'object') {
        errors.push('Missing state_updates object');
      } else {
        // event_log_entry is required
        if (typeof response.state_updates.event_log_entry !== 'string' || !response.state_updates.event_log_entry) {
          errors.push('Missing or empty event_log_entry');
        }
      }

      // choice_metadata is required
      if (!response.choice_metadata || typeof response.choice_metadata !== 'object') {
        errors.push('Missing choice_metadata object');
      } else {
        var required = ['A', 'B', 'C', 'D'];
        var isHardOrBrutal = difficulty === 'hard' || difficulty === 'brutal';
        for (var i = 0; i < required.length; i++) {
          var key = required[i];
          if (!response.choice_metadata[key]) {
            errors.push('Missing choice_metadata.' + key);
          } else if (isHardOrBrutal) {
            if (!response.choice_metadata[key].outcome) {
              errors.push('choice_metadata.' + key + ' missing outcome (required on ' + difficulty + ')');
            }
            if (!response.choice_metadata[key].narration_directive) {
              errors.push('choice_metadata.' + key + ' missing narration_directive (required on ' + difficulty + ')');
            }
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
