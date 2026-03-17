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
        { temperature: 0.9, max_tokens: 2000, source: 'writer' },
        'Writer',
        function (response) { return SQ.StateValidator.validatePassageResponse(response); },
        0
      ).then(function (writerResponse) {
        // Phase 2: Fire The Game Master (returns a promise the caller can await)
        var gmModel = SQ.PlayerConfig.getModel('gamemaster');
        var gmSystem = SQ.GameMasterPrompt.buildSystem(gameState);
        var gmUser = SQ.GameMasterPrompt.buildUser(gameState, writerResponse, choiceId);
        var difficulty = (gameState.meta && gameState.meta.difficulty) || 'normal';

        var gameMasterPromise = self._attemptCall(
          gmModel, gmSystem, gmUser,
          { temperature: 0.3, max_tokens: 1500, source: 'gamemaster' },
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
     * Generate a finale turn for a terminal choice (game_over, advances_act, conclusion).
     * Flow is reversed: GM-first (resolve state), then Writer (conclusive passage, no choices).
     *
     * @param {object} gameState - Full game state object
     * @param {string} choiceId - The terminal choice selected (A/B/C/D)
     * @param {string} terminalType - 'game_over', 'advances_act', or 'conclusion'
     * @returns {Promise<{ gmResponse: object, writerResponse: object, terminalType: string }>}
     */
    generateFinale: function (gameState, choiceId, terminalType) {
      if (SQ.useMockData) {
        // Mock: return a simple finale response
        return Promise.resolve({
          gmResponse: {
            state_updates: {
              event_log_entry: 'Terminal outcome: ' + terminalType,
              time_elapsed: { days: 0, hours: 0, minutes: 5, seconds: 0 },
              location: (gameState.current && gameState.current.location) || 'Unknown',
              time_of_day: (gameState.current && gameState.current.time_of_day) || 'night'
            }
          },
          writerResponse: {
            passage: 'The story reaches its ' + terminalType.replace(/_/g, ' ') + '. [Mock finale passage]'
          },
          terminalType: terminalType
        });
      }

      var self = this;

      // Phase 1: Call GM-finale (resolve state first)
      var gmModel = SQ.PlayerConfig.getModel('gamemaster');
      var gmSystem = SQ.GameMasterPrompt.buildFinaleSystem(gameState, terminalType);
      var gmUser = SQ.GameMasterPrompt.buildFinaleUser(gameState, choiceId, terminalType);

      return self._attemptCall(
        gmModel, gmSystem, gmUser,
        { temperature: 0.3, max_tokens: 1500, source: 'gamemaster' },
        'GameMaster-Finale',
        function (response) { return SQ.StateValidator.validateFinaleGMResponse(response); },
        0
      ).then(function (gmResponse) {
        // Phase 2: Call Writer-finale (conclusive passage, no choices)
        var writerModel = SQ.PlayerConfig.getModel('passage');
        var writerSystem = SQ.WriterPrompt.buildFinaleSystem(gameState, terminalType);
        var writerUser = SQ.WriterPrompt.buildFinaleUser(gameState, choiceId, terminalType, gmResponse);

        return self._attemptCall(
          writerModel, writerSystem, writerUser,
          { temperature: 0.9, max_tokens: 2000, source: 'writer' },
          'Writer-Finale',
          function (response) { return SQ.StateValidator.validateFinaleWriterResponse(response); },
          0
        ).then(function (writerResponse) {
          return {
            gmResponse: gmResponse,
            writerResponse: writerResponse,
            terminalType: terminalType
          };
        });
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

      if (attempt === 0) {
        SQ.Logger.info(label, 'Calling LLM', { model: model, temperature: options.temperature });
        SQ.Logger.infoFull(label, 'System prompt', { prompt: systemPrompt });
        SQ.Logger.infoFull(label, 'User prompt', { prompt: userPrompt });
      }

      return SQ.API.call(model, messages, options)
        .then(function (raw) {
          var response;

          // Repair common LLM JSON errors before parsing
          if (typeof raw === 'string') {
            raw = raw.replace(/:\s*\+(\d)/g, ': $1');  // +5 → 5
          }

          // Parse JSON
          try {
            response = SQ.API.parseJSON(raw);
          } catch (e) {
            SQ.Logger.warn(label, 'JSON parse failed (attempt ' + (attempt + 1) + ')', { attempt: attempt, error: e.message, rawPreview: typeof raw === 'string' ? raw.substring(0, 500) : '' });
            if (attempt < 1) {
              return self._attemptCall(model, systemPrompt, userPrompt, options, label, validateFn, attempt + 1);
            }
            throw new Error('The AI returned an unreadable response. Tap Retry for a fresh generation.');
          }

          // Validate
          var result = validateFn(response);
          if (!result.valid) {
            SQ.Logger.warn(label, 'Validation failed (attempt ' + (attempt + 1) + ')', { attempt: attempt, errors: result.errors });
            if (attempt < 1) {
              return self._attemptCall(model, systemPrompt, userPrompt, options, label, validateFn, attempt + 1);
            }
            throw new Error('The AI returned an incomplete response. Errors: ' + result.errors.join(', '));
          }

          if (label === 'GameMaster') {
            var _gmOk = { event: response.state_updates && response.state_updates.event_log_entry };
            if (response.state_updates && response.state_updates.game_over) _gmOk.gameOver = true;
            if (response.state_updates && response.state_updates.story_complete) _gmOk.storyComplete = true;
            SQ.Logger.info(label, 'Response OK', _gmOk);
          } else {
            SQ.Logger.info(label, 'Response OK', {
              passagePreview: response.passage ? response.passage.substring(0, 100) : undefined,
              choiceCount: response.choices ? Object.keys(response.choices).length : undefined
            });
          }
          SQ.Logger.infoFull(label, 'Full response', response);

          return response;
        });
    }
  };
})();
