/**
 * SQ.ImageGenerator — Illustration generation via OpenRouter image modality.
 * Combines a locked visual style prefix (from PlayerConfig) with persistent
 * character description and scene-specific prompt from the passage generator.
 *
 * Design doc Section 5: fires in parallel with text generation, fades in
 * when complete, gracefully degrades to text-only on failure.
 */
(function () {
  var IMAGE_TIMEOUT_MS = 60000; // images can take longer than text

  SQ.ImageGenerator = {
    /**
     * Generate an illustration for a passage.
     * @param {string} scenePrompt - Scene-specific illustration prompt from passage response
     * @param {object} gameState - Full game state (for character description)
     * @returns {Promise<string|null>} Base64 data URL or null on failure
     */
    generate: function (scenePrompt, gameState) {
      if (!scenePrompt) return Promise.resolve(null);
      if (!SQ.PlayerConfig.isIllustrationsEnabled()) return Promise.resolve(null);

      if (SQ.useMockData) {
        return this._mockGenerate();
      }

      var model = SQ.PlayerConfig.getModel('image');
      var fullPrompt = this._buildPrompt(scenePrompt, gameState);

      var messages = [
        {
          role: 'user',
          content: fullPrompt
        }
      ];

      return SQ.API.call(model, messages, {
        modalities: ['image'],
        temperature: 0.8,
        max_tokens: 1024,
        timeout: IMAGE_TIMEOUT_MS
      })
        .then(function (content) {
          return SQ.ImageGenerator._extractImageUrl(content);
        })
        .catch(function (err) {
          // Graceful degradation: log and return null, never block the game
          console.warn('ImageGenerator: generation failed, degrading to text-only', err.message || err);
          return null;
        });
    },

    /**
     * Build the combined illustration prompt.
     * Structure: visual style prefix + character description + scene content.
     * @private
     */
    _buildPrompt: function (scenePrompt, gameState) {
      var stylePrefix = SQ.PlayerConfig.getVisualStylePrefix();
      var parts = [];

      // 1. Locked visual style
      parts.push('Style: ' + stylePrefix + '.');

      // 2. Persistent character description
      var player = gameState && gameState.player;
      if (player) {
        var charDesc = 'Character: ' + (player.name || 'The Wanderer');
        if (player.archetype) charDesc += ', ' + player.archetype;
        parts.push(charDesc + '.');
      }

      // 3. Scene-specific content
      parts.push('Scene: ' + scenePrompt);

      // 4. Composition guidance
      parts.push('Create a single illustration. No text, no speech bubbles, no UI elements.');

      return parts.join('\n');
    },

    /**
     * Extract image data from the API response.
     * OpenRouter image modality returns content as either a base64 data URL
     * string or a structured content block with type "image".
     * @private
     */
    _extractImageUrl: function (content) {
      if (!content) return null;

      // If content is a string that starts with data:, it's already a data URL
      if (typeof content === 'string' && content.indexOf('data:') === 0) {
        return content;
      }

      // If content is a string URL
      if (typeof content === 'string' && content.indexOf('http') === 0) {
        return content;
      }

      // OpenRouter may return content as an array of content blocks
      if (Array.isArray(content)) {
        for (var i = 0; i < content.length; i++) {
          var block = content[i];
          if (block.type === 'image_url' && block.image_url && block.image_url.url) {
            return block.image_url.url;
          }
          if (block.type === 'image' && block.data) {
            return 'data:image/png;base64,' + block.data;
          }
        }
      }

      // If content is an object with image data
      if (typeof content === 'object' && content !== null) {
        if (content.url) return content.url;
        if (content.data) return 'data:image/png;base64,' + content.data;
        if (content.image_url && content.image_url.url) return content.image_url.url;
      }

      console.warn('ImageGenerator: could not extract image from response', typeof content);
      return null;
    },

    /**
     * Mock image generation for development.
     * Returns a small SVG placeholder after a simulated delay.
     * @private
     */
    _mockGenerate: function () {
      return new Promise(function (resolve) {
        setTimeout(function () {
          // Generate a simple dark SVG placeholder
          var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="384" viewBox="0 0 512 384">'
            + '<rect width="512" height="384" fill="#14141f"/>'
            + '<rect x="20" y="20" width="472" height="344" fill="none" stroke="#2a2a3a" stroke-width="2" rx="8"/>'
            + '<text x="256" y="180" text-anchor="middle" fill="#8888a0" font-family="Georgia,serif" font-size="18">Illustration</text>'
            + '<text x="256" y="210" text-anchor="middle" fill="#555" font-family="sans-serif" font-size="12">(mock mode)</text>'
            + '</svg>';
          var dataUrl = 'data:image/svg+xml;base64,' + btoa(svg);
          resolve(dataUrl);
        }, 1500); // simulate network delay
      });
    }
  };
})();
