/**
 * SQ.Pricing — Real-time model pricing from OpenRouter.
 * Fetches pricing data from the public /api/v1/models endpoint and caches
 * in memory for the session. Falls back gracefully if the fetch fails.
 */
(function () {
  var MODELS_URL = 'https://openrouter.ai/api/v1/models';
  // ElevenLabs cost per character by model (Pro plan overage rates as estimate)
  var ELEVENLABS_RATES = {
    'eleven_flash_v2_5': 0.00012,   // ~$0.12/1K chars (0.5 credits)
    'eleven_turbo_v2_5': 0.00012,   // ~$0.12/1K chars (0.5 credits)
    'eleven_v3': 0.00024            // ~$0.24/1K chars (1 credit)
  };

  // In-memory cache: { modelId: { prompt: costPerToken, completion: costPerToken } }
  var _cache = null;
  var _fetchPromise = null;
  var _ready = false;

  SQ.Pricing = {
    /**
     * Fetch model pricing from OpenRouter and cache in memory.
     * Safe to call multiple times — deduplicates concurrent fetches.
     * @returns {Promise<void>}
     */
    init: function () {
      if (_ready) return Promise.resolve();
      if (_fetchPromise) return _fetchPromise;

      _fetchPromise = fetch(MODELS_URL)
        .then(function (response) {
          if (!response.ok) throw new Error('HTTP ' + response.status);
          return response.json();
        })
        .then(function (data) {
          _cache = {};
          var models = data.data || data;
          if (Array.isArray(models)) {
            models.forEach(function (m) {
              if (m.id && m.pricing) {
                _cache[m.id] = {
                  prompt: parseFloat(m.pricing.prompt) || 0,
                  completion: parseFloat(m.pricing.completion) || 0
                };
              }
            });
          }
          _ready = true;
          SQ.Logger.info('Pricing', 'Loaded pricing for ' + Object.keys(_cache).length + ' models');
        })
        .catch(function (err) {
          SQ.Logger.warn('Pricing', 'Failed to fetch model pricing', { error: err.message });
          _cache = null;
          _ready = false;
          _fetchPromise = null;
        });

      return _fetchPromise;
    },

    /**
     * Calculate cost for an OpenRouter API call.
     * @param {string} modelId - e.g. 'anthropic/claude-sonnet-4'
     * @param {number} promptTokens
     * @param {number} completionTokens
     * @returns {number|null} Dollar cost, or null if pricing unavailable
     */
    getCost: function (modelId, promptTokens, completionTokens) {
      if (!_cache || !_cache[modelId]) return null;
      var p = _cache[modelId];
      return (promptTokens * p.prompt) + (completionTokens * p.completion);
    },

    /**
     * Calculate cost for an ElevenLabs TTS call.
     * @param {number} charCount - Number of characters synthesized
     * @returns {number} Dollar cost
     */
    getElevenLabsCost: function (charCount, model) {
      var rate = (model && ELEVENLABS_RATES[model]) || ELEVENLABS_RATES['eleven_flash_v2_5'];
      return charCount * rate;
    },

    /**
     * Check if pricing data has been loaded.
     * @returns {boolean}
     */
    isReady: function () {
      return _ready;
    },

    /**
     * Strip provider prefix from model ID for display.
     * e.g. 'anthropic/claude-sonnet-4' -> 'claude-sonnet-4'
     * @param {string} modelId
     * @returns {string}
     */
    shortModelName: function (modelId) {
      if (!modelId) return 'unknown';
      var idx = modelId.indexOf('/');
      return idx >= 0 ? modelId.substring(idx + 1) : modelId;
    }
  };
})();
