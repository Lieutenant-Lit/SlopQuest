/**
 * SQ.SkeletonGenerator — Generates the story skeleton (full story structure).
 * The most important single API call in the game.
 */
(function () {
  SQ.SkeletonGenerator = {
    /**
     * Generate a story skeleton from setup configuration.
     * @param {object} setupConfig - Player's game setup choices
     * @returns {Promise<object>} The skeleton JSON
     */
    generate: function (setupConfig) {
      if (SQ.useMockData) {
        return SQ.MockData.generateSkeleton(setupConfig);
      }

      var model = SQ.PlayerConfig.getModel('skeleton');
      var systemPrompt = SQ.SkeletonPrompt.build(setupConfig);

      var messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Generate the story skeleton now. Respond with ONLY the JSON object.' }
      ];

      return SQ.API.call(model, messages, { temperature: 0.8, max_tokens: 4000 })
        .then(function (raw) {
          var skeleton = SQ.API.parseJSON(raw);
          // TODO: validate skeleton structure
          return skeleton;
        });
    }
  };
})();
