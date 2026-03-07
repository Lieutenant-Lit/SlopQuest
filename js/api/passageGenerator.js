/**
 * SQ.PassageGenerator — Generates narrative passages each turn.
 * Sends full state object to LLM, receives passage + choices + state updates.
 * Retries once on malformed JSON per design doc Section 6.4/6.7.
 *
 * Narration segmentation is handled by a separate generateSegments() call
 * so the passage LLM can focus on writing quality prose and game state,
 * while segmentation is a simple decomposition task.
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
    },

    /**
     * Generate narration segments for a passage in a separate API call.
     * Returns an array of {speaker, text} segments for multi-voice TTS.
     * Fails gracefully — returns null on error (audio falls back to single-voice).
     *
     * @param {string} passageText - The passage to segment
     * @param {object} gameState - Game state (used to extract known character names)
     * @returns {Promise<Array|null>} Segments array or null on failure
     */
    generateSegments: function (passageText, gameState) {
      if (!passageText) return Promise.resolve(null);

      if (SQ.useMockData) {
        return SQ.MockData.generateSegments(passageText);
      }

      // Collect known character names from skeleton NPCs and npc_voices
      var knownCharacters = [];
      if (gameState && gameState.skeleton && Array.isArray(gameState.skeleton.npcs)) {
        gameState.skeleton.npcs.forEach(function (npc) {
          if (npc.name) knownCharacters.push(npc.name);
        });
      }
      if (gameState && gameState.npc_voices) {
        Object.keys(gameState.npc_voices).forEach(function (name) {
          if (knownCharacters.indexOf(name) === -1) knownCharacters.push(name);
        });
      }

      var model = SQ.PlayerConfig.getModel('passage');
      var systemPrompt = SQ.SegmentationPrompt.buildSystem();
      var userPrompt = SQ.SegmentationPrompt.buildUser(passageText, knownCharacters);

      var messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];

      return SQ.API.call(model, messages, { temperature: 0.3, max_tokens: 2000 })
        .then(function (raw) {
          var parsed = SQ.API.parseJSON(raw);
          if (parsed && Array.isArray(parsed.segments) && parsed.segments.length > 0) {
            return parsed.segments;
          }
          console.warn('PassageGenerator: segmentation returned no segments');
          return null;
        })
        .catch(function (err) {
          console.warn('PassageGenerator: segmentation failed, falling back to single-voice.', err.message || err);
          return null;
        });
    }
  };
})();
