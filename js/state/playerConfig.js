/**
 * SQ.PlayerConfig — Player configuration persistence (API key, model prefs).
 * Stored in localStorage separately from game state.
 */
(function () {
  var STORAGE_KEY = 'slopquest_player_config';

  var DEFAULT_CONFIG = {
    openrouter_api_key: '',
    elevenlabs_api_key: '',
    models: {
      skeleton: 'anthropic/claude-sonnet-4',
      passage: 'anthropic/claude-sonnet-4',
      gamemaster: 'anthropic/claude-sonnet-4',
      image: 'google/gemini-3.1-flash-image-preview',
      playtester: 'anthropic/claude-sonnet-4',
      ui_designer: 'anthropic/claude-haiku-4.5'
    },
    visual_style_prefix: 'dark ink illustration, crosshatched, monochrome, woodcut style',
    illustrations_enabled: false,
    narration_enabled: false,
    audio_debug_enabled: false,
    game_state_debug_enabled: false,
    disable_default_voices: false,
    logging_enabled: false,
    playtester_enabled: false,
    ui_designer_enabled: true,
    github_token: ''
  };

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
        if (SQ.Logger) { SQ.Logger.warn('Config', 'Failed to parse stored config', { error: e.message }); }
        else { console.warn('PlayerConfig: failed to parse stored config', e); }
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
     * Get the stored ElevenLabs API key, or empty string.
     */
    getElevenLabsApiKey: function () {
      return this.load().elevenlabs_api_key || '';
    },

    /**
     * Set and persist the ElevenLabs API key.
     */
    setElevenLabsApiKey: function (key) {
      var config = this.load();
      config.elevenlabs_api_key = key;
      this.save(config);
    },

    /**
     * Check if we have a non-empty ElevenLabs API key stored.
     */
    hasElevenLabsApiKey: function () {
      return this.getElevenLabsApiKey().length > 0;
    },

    /**
     * Get model ID for a given type: 'skeleton', 'passage', 'image'.
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
    },

    /**
     * Check if voice narration is enabled.
     */
    isNarrationEnabled: function () {
      var config = this.load();
      return config.narration_enabled === true;
    },

    /**
     * Toggle voice narration on/off.
     */
    setNarrationEnabled: function (enabled) {
      var config = this.load();
      config.narration_enabled = !!enabled;
      this.save(config);
    },

    isAudioDebugEnabled: function () {
      var config = this.load();
      return config.audio_debug_enabled === true;
    },

    setAudioDebugEnabled: function (enabled) {
      var config = this.load();
      config.audio_debug_enabled = !!enabled;
      this.save(config);
    },

    isGameStateDebugEnabled: function () {
      var config = this.load();
      return config.game_state_debug_enabled === true;
    },

    setGameStateDebugEnabled: function (enabled) {
      var config = this.load();
      config.game_state_debug_enabled = !!enabled;
      this.save(config);
    },

    isUiDesignerDebugEnabled: function () {
      var config = this.load();
      return config.ui_designer_debug_enabled === true;
    },

    setUiDesignerDebugEnabled: function (enabled) {
      var config = this.load();
      config.ui_designer_debug_enabled = !!enabled;
      this.save(config);
    },

    isDisableDefaultVoicesEnabled: function () {
      var config = this.load();
      return config.disable_default_voices === true;
    },

    setDisableDefaultVoicesEnabled: function (enabled) {
      var config = this.load();
      config.disable_default_voices = !!enabled;
      this.save(config);
    },

    isLoggingEnabled: function () {
      var config = this.load();
      return config.logging_enabled === true;
    },

    setLoggingEnabled: function (enabled) {
      var config = this.load();
      config.logging_enabled = !!enabled;
      this.save(config);
    },

    isPlaytesterEnabled: function () {
      var config = this.load();
      return config.playtester_enabled === true;
    },

    setPlaytesterEnabled: function (enabled) {
      var config = this.load();
      config.playtester_enabled = !!enabled;
      this.save(config);
    },

    isUiDesignerEnabled: function () {
      var config = this.load();
      return config.ui_designer_enabled === true;
    },

    setUiDesignerEnabled: function (enabled) {
      var config = this.load();
      config.ui_designer_enabled = !!enabled;
      this.save(config);
    },

    getGithubToken: function () {
      return this.load().github_token || '';
    },

    setGithubToken: function (token) {
      var config = this.load();
      config.github_token = token;
      this.save(config);
    }
  };
})();
