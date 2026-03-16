/**
 * SQ.SkeletonGenerator — Generates the story skeleton (full story structure).
 * The most important single API call in the game.
 * Includes validation and retry logic (max 2 retries) for malformed responses.
 */
(function () {
  var MAX_RETRIES = 2;

  SQ.SkeletonGenerator = {
    /**
     * Generate a story skeleton from setup configuration.
     * In mock mode, returns hardcoded skeleton immediately.
     * In live mode, calls OpenRouter and validates the response.
     * Retries up to MAX_RETRIES times on malformed JSON or validation failure.
     *
     * @param {object} setupConfig - Player's game setup choices
     * @returns {Promise<object>} The skeleton JSON
     */
    generate: function (setupConfig) {
      if (SQ.useMockData) {
        return SQ.MockData.generateSkeleton(setupConfig);
      }

      var model = SQ.PlayerConfig.getModel('skeleton');
      var systemPrompt = SQ.SkeletonPrompt.build(setupConfig);
      var userMsg = 'Generate the story skeleton now. Respond with ONLY the JSON object, no code fences.';

      return this._attemptGeneration(model, systemPrompt, userMsg, setupConfig, 0);
    },

    /**
     * Attempt skeleton generation with retry logic.
     * @private
     */
    _attemptGeneration: function (model, systemPrompt, userMsg, setupConfig, attempt) {
      var self = this;
      var messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMsg }
      ];

      return SQ.API.call(model, messages, {
        temperature: 0.8,
        max_tokens: 8000,
        timeout: 90000
      })
        .then(function (raw) {
          return self._parseAndValidate(raw, setupConfig, model, systemPrompt, userMsg, attempt);
        });
    },

    /**
     * Parse raw response, strip code fences, validate, retry if needed.
     * @private
     */
    _parseAndValidate: function (raw, setupConfig, model, systemPrompt, userMsg, attempt) {
      var self = this;
      var skeleton;

      // Parse JSON (SQ.API.parseJSON already strips code fences)
      try {
        skeleton = SQ.API.parseJSON(raw);
      } catch (e) {
        SQ.Logger.warn('Skeleton', 'JSON parse failed (attempt ' + (attempt + 1) + ')', { attempt: attempt, error: e.message, rawPreview: typeof raw === 'string' ? raw.substring(0, 500) : '' });
        if (attempt < MAX_RETRIES) {
          return self._attemptGeneration(model, systemPrompt, userMsg, setupConfig, attempt + 1);
        }
        throw new Error('The AI returned unreadable JSON after ' + (MAX_RETRIES + 1) + ' attempts. Try again, or switch models in Settings.');
      }

      // Validate structure
      var result = SQ.StateValidator.validateSkeleton(skeleton, setupConfig);
      if (!result.valid) {
        SQ.Logger.warn('Skeleton', 'Validation failed (attempt ' + (attempt + 1) + ')', { attempt: attempt, errors: result.errors });
        if (attempt < MAX_RETRIES) {
          return self._attemptGeneration(model, systemPrompt, userMsg, setupConfig, attempt + 1);
        }
        throw new Error('The AI returned an incomplete skeleton after ' + (MAX_RETRIES + 1) + ' attempts. Errors: ' + result.errors.join(', '));
      }

      SQ.Logger.info('Skeleton', 'Generated OK', {
        title: skeleton.title,
        acts: skeleton.acts ? skeleton.acts.length : 0,
        npcs: (skeleton.npcs || []).map(function (n) {
          return n.name + ' (' + n.role + (n.companion ? ', companion' : '') + ')';
        })
      });
      SQ.Logger.infoFull('Skeleton', 'Full skeleton', skeleton);

      return skeleton;
    }
  };
})();
