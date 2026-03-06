/**
 * SQ.PlayerConfig — Player configuration persistence (API key, model prefs).
 * Stored in localStorage separately from game state.
 */
(function () {
  var STORAGE_KEY = 'slopquest_player_config';
  var MOCK_KEY = 'slopquest_mock_mode';

  var DEFAULT_CONFIG = {
    openrouter_api_key: '',
    models: {
      skeleton: 'anthropic/claude-sonnet-4',
      passage: 'anthropic/claude-sonnet-4',
      image: 'google/gemini-3.1-flash-image-preview',
      audio: 'openai/gpt-4o-audio-preview'
    },
    visual_style_prefix: 'dark ink illustration, crosshatched, monochrome, woodcut style',
    illustrations_enabled: false
  };

  // Mock mode flag — default true for development
  SQ.useMockData = localStorage.getItem(MOCK_KEY) !== 'false';

  SQ.PlayerConfig = {
    /**
     * Load config from localStorage. Returns config object or default.
     */
    load: function () {
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          return JSON.parse(raw);
        }
      } catch (e) {
        console.warn('PlayerConfig: failed to parse stored config', e);
      }
      return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    },

    /**
     * Save config object to localStorage.
     */
    save: function (config) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    },

    /**
     * Get the stored API key, or empty string.
     */
    getApiKey: function () {
      return this.load().openrouter_api_key || '';
    },

    /**
     * Set and persist the API key.
     */
    setApiKey: function (key) {
      var config = this.load();
      config.openrouter_api_key = key;
      this.save(config);
    },

    /**
     * Get model ID for a given type: 'skeleton', 'passage', 'image', 'audio'.
     */
    getModel: function (type) {
      var config = this.load();
      return (config.models && config.models[type]) || DEFAULT_CONFIG.models[type];
    },

    /**
     * Set model ID for a given type.
     */
    setModel: function (type, modelId) {
      var config = this.load();
      if (!config.models) config.models = {};
      config.models[type] = modelId;
      this.save(config);
    },

    /**
     * Toggle mock data mode and persist the setting.
     */
    setMockMode: function (enabled) {
      SQ.useMockData = enabled;
      localStorage.setItem(MOCK_KEY, enabled ? 'true' : 'false');
    },

    /**
     * Check if we have a non-empty API key stored.
     */
    hasApiKey: function () {
      return this.getApiKey().length > 0;
    },

    /**
     * Get the locked visual style prefix for image generation.
     */
    getVisualStylePrefix: function () {
      var config = this.load();
      return config.visual_style_prefix || DEFAULT_CONFIG.visual_style_prefix;
    },

    /**
     * Set the visual style prefix.
     */
    setVisualStylePrefix: function (prefix) {
      var config = this.load();
      config.visual_style_prefix = prefix;
      this.save(config);
    },

    /**
     * Check if illustrations are enabled.
     */
    isIllustrationsEnabled: function () {
      var config = this.load();
      return config.illustrations_enabled === true;
    },

    /**
     * Toggle illustrations on/off.
     */
    setIllustrationsEnabled: function (enabled) {
      var config = this.load();
      config.illustrations_enabled = !!enabled;
      this.save(config);
    }
  };
})();
