/**
 * SQ.PassageGenerator — Orchestrates the Writer + Game Master two-call turn flow.
 *
 * Turn sequence:
 * 1. The Writer (creative) → passage + choices (text only)
 * 2. The Game Master (mechanical) → state_updates + choice_metadata
 *
 * Returns { writerResponse, gameMasterPromise } so the UI can render the passage
 * immediately while the Game Master processes in the background.
 */
(function () {
  SQ.PassageGenerator = {
    /**
     * Generate a turn by calling The Writer, then The Game Master.
     *
     * In mock mode, returns mock data for both.
     * In live mode, calls Writer first, then fires Game Master.
     *
     * @param {object} gameState - Full game state object
     * @param {string} [choiceId] - The choice the player made (null for opening passage)
     * @returns {Promise<{ writerResponse: object, gameMasterPromise: Promise<object> }>}
     */
    generate: function (gameState, choiceId) {
      if (SQ.useMockData) {
        return SQ.MockData.generatePassage(gameState);
      }

      var self = this;
      var writerModel = SQ.PlayerConfig.getModel('passage');
      var writerSystem = SQ.WriterPrompt.buildSystem(gameState);
      var writerUser = SQ.WriterPrompt.buildUser(gameState, choiceId);

      // Phase 1: Call The Writer
      return self._attemptCall(
        writerModel, writerSystem, writerUser,
        { temperature: 0.9, max_tokens: 2000 },
        'Writer',
        function (response) { return SQ.StateValidator.validatePassageResponse(response); },
        0
      ).then(function (writerResponse) {
        // Phase 2: Fire The Game Master (returns a promise the caller can await)
        var gmModel = SQ.PlayerConfig.getModel('gamemaster');
        var gmSystem = SQ.GameMasterPrompt.buildSystem(gameState);
        var gmUser = SQ.GameMasterPrompt.buildUser(gameState, writerResponse);
        var difficulty = (gameState.meta && gameState.meta.difficulty) || 'normal';

        var gameMasterPromise = self._attemptCall(
          gmModel, gmSystem, gmUser,
          { temperature: 0.3, max_tokens: 1500 },
          'GameMaster',
          function (response) { return SQ.StateValidator.validateGameMasterResponse(response, difficulty); },
          0
        );

        return {
          writerResponse: writerResponse,
          gameMasterPromise: gameMasterPromise
        };
      });
    },

    /**
     * Generic LLM call with parse/validate and 1-retry logic.
     * Used for both Writer and Game Master calls.
     * @private
     * @param {string} model - Model ID
     * @param {string} systemPrompt - System prompt
     * @param {string} userPrompt - User prompt
     * @param {object} options - API call options (temperature, max_tokens)
     * @param {string} label - Label for logging ('Writer' or 'GameMaster')
     * @param {function} validateFn - Validation function returning { valid, errors }
     * @param {number} attempt - Current attempt number
     * @returns {Promise<object>} Parsed and validated response
     */
    _attemptCall: function (model, systemPrompt, userPrompt, options, label, validateFn, attempt) {
      var self = this;
      var messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];

      return SQ.API.call(model, messages, options)
        .then(function (raw) {
          var response;

          // Parse JSON
          try {
            response = SQ.API.parseJSON(raw);
          } catch (e) {
            console.warn(label + ': JSON parse failed (attempt ' + (attempt + 1) + ')', e.message);
            if (attempt < 1) {
              return self._attemptCall(model, systemPrompt, userPrompt, options, label, validateFn, attempt + 1);
            }
            throw new Error('The AI returned an unreadable response. Tap Retry for a fresh generation.');
          }

          // Validate
          var result = validateFn(response);
          if (!result.valid) {
            console.warn(label + ': validation failed (attempt ' + (attempt + 1) + '):', result.errors);
            if (attempt < 1) {
              return self._attemptCall(model, systemPrompt, userPrompt, options, label, validateFn, attempt + 1);
            }
            throw new Error('The AI returned an incomplete response. Errors: ' + result.errors.join(', '));
          }

          return response;
        });
    }
  };
})();
