/**
 * SQ.PassageGenerator — Generates narrative passages each turn.
 * Sends full state object to LLM, receives passage + choices + state updates.
 * Retries once on malformed JSON per design doc Section 6.4/6.7.
 */
(function () {
  SQ.PassageGenerator = {
    /**
     * Generate a passage based on current game state and the player's choice.
     * In mock mode, returns from the hardcoded passage cycle.
     * In live mode, calls OpenRouter with retry-once on malformed JSON.
     *
     * @param {object} gameState - Full game state object
     * @param {string} [choiceId] - The choice the player made (null for opening passage)
     * @returns {Promise<object>} Passage response with text, choices, state_updates
     */
    generate: function (gameState, choiceId) {
      if (SQ.useMockData) {
        return SQ.MockData.generatePassage(gameState);
      }

      var model = SQ.PlayerConfig.getModel('passage');
      var systemPrompt = SQ.PassagePrompt.buildSystem(gameState);
      var userPrompt = SQ.PassagePrompt.buildUser(gameState, choiceId);

      return this._attemptGeneration(model, systemPrompt, userPrompt, 0);
    },

    /**
     * Attempt passage generation with retry on parse/validation failure.
     * @private
     */
    _attemptGeneration: function (model, systemPrompt, userPrompt, attempt) {
      var self = this;
      var messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];

      return SQ.API.call(model, messages, { temperature: 0.9, max_tokens: 2000 })
        .then(function (raw) {
          return self._parseAndValidate(raw, model, systemPrompt, userPrompt, attempt);
        });
    },

    /**
     * Parse raw response, validate, retry once if needed.
     * @private
     */
    _parseAndValidate: function (raw, model, systemPrompt, userPrompt, attempt) {
      var self = this;
      var response;

      // Parse JSON (SQ.API.parseJSON strips code fences)
      try {
        response = SQ.API.parseJSON(raw);
      } catch (e) {
        console.warn('PassageGenerator: JSON parse failed (attempt ' + (attempt + 1) + ')', e.message);
        if (attempt < 1) {
          return self._attemptGeneration(model, systemPrompt, userPrompt, attempt + 1);
        }
        throw new Error('The AI returned an unreadable response. Tap Retry for a fresh generation.');
      }

      // Validate structure
      var result = SQ.StateValidator.validatePassageResponse(response);
      if (!result.valid) {
        console.warn('PassageGenerator: validation failed (attempt ' + (attempt + 1) + '):', result.errors);
        if (attempt < 1) {
          return self._attemptGeneration(model, systemPrompt, userPrompt, attempt + 1);
        }
        throw new Error('The AI returned an incomplete response. Errors: ' + result.errors.join(', '));
      }

      return response;
    }
  };
})();
