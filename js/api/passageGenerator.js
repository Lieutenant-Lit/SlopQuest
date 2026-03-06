/**
 * SQ.PassageGenerator — Generates narrative passages each turn.
 * Sends full state object to LLM, receives passage + choices + state updates.
 */
(function () {
  SQ.PassageGenerator = {
    /**
     * Generate a passage based on current game state and the player's choice.
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

      var messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];

      return SQ.API.call(model, messages, { temperature: 0.9, max_tokens: 2000 })
        .then(function (raw) {
          var response = SQ.API.parseJSON(raw);
          var validation = SQ.StateValidator.validatePassageResponse(response);
          if (!validation.valid) {
            console.warn('Passage response validation errors:', validation.errors);
          }
          return response;
        });
    }
  };
})();
