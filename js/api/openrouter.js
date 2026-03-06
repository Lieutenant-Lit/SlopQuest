/**
 * SQ.API — Base API client for OpenRouter.
 * All API calls go through here. Checks SQ.useMockData to decide
 * whether to hit the real API or return mock data.
 */
(function () {
  var BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';
  var TIMEOUT_MS = 30000;

  SQ.API = {
    /**
     * Make a chat completion call to OpenRouter.
     * @param {string} model - Model ID (e.g., 'anthropic/claude-sonnet-4')
     * @param {Array} messages - Array of { role, content } message objects
     * @param {object} [options] - Additional options (modalities, temperature, etc.)
     * @returns {Promise<object>} Parsed response content
     */
    call: function (model, messages, options) {
      var apiKey = SQ.PlayerConfig.getApiKey();
      if (!apiKey) {
        return Promise.reject(new Error('No API key configured. Set your key in Settings.'));
      }

      options = options || {};
      var controller = new AbortController();
      var timeoutId = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);

      var body = {
        model: model,
        messages: messages
      };

      if (options.modalities) body.modalities = options.modalities;
      if (options.temperature !== undefined) body.temperature = options.temperature;
      if (options.max_tokens) body.max_tokens = options.max_tokens;

      return fetch(BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey,
          'HTTP-Referer': window.location.href,
          'X-Title': 'SlopQuest'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      })
        .then(function (response) {
          clearTimeout(timeoutId);

          if (response.status === 401 || response.status === 403) {
            throw new Error('API key rejected. Check your key in Settings.');
          }
          if (response.status === 402) {
            throw new Error('OpenRouter account has insufficient credits. Add funds and try again.');
          }
          if (response.status === 429) {
            throw new Error('Rate limited. Please wait a moment and try again.');
          }
          if (response.status >= 500) {
            throw new Error('The AI model returned an error. Try again, or switch models in Settings.');
          }
          if (!response.ok) {
            throw new Error('API request failed with status ' + response.status);
          }

          return response.json();
        })
        .then(function (data) {
          if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            throw new Error('Unexpected API response format');
          }
          return data.choices[0].message.content;
        })
        .catch(function (err) {
          clearTimeout(timeoutId);
          if (err.name === 'AbortError') {
            throw new Error('Response is taking too long. Please try again.');
          }
          throw err;
        });
    },

    /**
     * Validate an API key with a lightweight test call.
     * @param {string} apiKey - The key to validate
     * @returns {Promise<boolean>} True if valid
     */
    validateKey: function (apiKey) {
      return fetch(BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey,
          'HTTP-Referer': window.location.href,
          'X-Title': 'SlopQuest'
        },
        body: JSON.stringify({
          model: 'anthropic/claude-sonnet-4',
          messages: [{ role: 'user', content: 'Say "ok"' }],
          max_tokens: 5
        })
      })
        .then(function (response) {
          return response.ok;
        })
        .catch(function () {
          return false;
        });
    },

    /**
     * Parse a JSON string from an LLM response.
     * Strips markdown code fences if present.
     * @param {string} raw - Raw response string
     * @returns {object} Parsed JSON
     */
    parseJSON: function (raw) {
      if (typeof raw !== 'string') return raw;
      // Strip markdown code fences
      var cleaned = raw.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      return JSON.parse(cleaned);
    }
  };
})();
