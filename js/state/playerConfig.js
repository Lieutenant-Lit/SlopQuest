/**
 * SQ.PlayerConfig — Player configuration persistence (API key, model prefs).
 * Stored in localStorage separately from game state.
 */
(function () {
  var STORAGE_KEY = 'slopquest_player_config';
  var MOCK_KEY = 'slopquest_mock_mode';

  // ElevenLabs curated voices for fantasy narration.
  // Each voice_id is a premade ElevenLabs voice chosen for its suitability
  // to audiobook-quality multi-character narration.
  var VOICES = [
    { id: 'onwK4e9ZLuTAKqWW03F9', label: 'Daniel (deep, British)',       gender: 'masculine' },
    { id: 'nPczCjzI2devNBz1zQrb', label: 'Brian (deep, American)',       gender: 'masculine' },
    { id: '2EiwWnXFnvU5JabPnv8n', label: 'Clyde (war veteran)',          gender: 'masculine' },
    { id: 'N2lVS1w4EtoT3dr4eOWO', label: 'Callum (hoarse)',             gender: 'masculine' },
    { id: 'D38z5RcWu1voky8WS1ja', label: 'Fin (Irish, sailor)',          gender: 'masculine' },
    { id: 'ErXwobaYiN019PkySvjV', label: 'Antoni (clear, young)',        gender: 'masculine' },
    { id: 'JBFqnCBsd6RMkjVDRZzb', label: 'George (raspy, British)',      gender: 'masculine' },
    { id: 'pqHfZKP75CvOlQylNhV4', label: 'Bill (strong, American)',      gender: 'masculine' },
    { id: 'XrExE9yKIg1WjnnlVkGX', label: 'Matilda (warm)',              gender: 'feminine' },
    { id: '21m00Tcm4TlvDq8ikWAM', label: 'Rachel (calm, American)',      gender: 'feminine' },
    { id: 'ThT5KcBeYPX3keUQqHPh', label: 'Dorothy (pleasant, British)',  gender: 'feminine' },
    { id: 'pFZP5JQG7iQjIQuC4Bku', label: 'Lily (raspy, British)',        gender: 'feminine' },
    { id: 'jsCqWAovK2LkecY7zXl4', label: 'Freya (American)',             gender: 'feminine' },
    { id: 'EXAVITQu4vr4xnSDxMaL', label: 'Sarah (soft, American)',       gender: 'feminine' },
    { id: 'Xb7hH8MSUJpSbSDYk0k2', label: 'Alice (confident, British)',   gender: 'feminine' },
    { id: 'XB0fDUnXU5powFXDhCwa', label: 'Charlotte (seductive, Swedish)', gender: 'feminine' }
  ];

  var DEFAULT_CONFIG = {
    openrouter_api_key: '',
    elevenlabs_api_key: '',
    elevenlabs_model: 'eleven_multilingual_v2',
    models: {
      skeleton: 'anthropic/claude-sonnet-4',
      passage: 'anthropic/claude-sonnet-4',
      image: 'google/gemini-3.1-flash-image-preview'
    },
    visual_style_prefix: 'dark ink illustration, crosshatched, monochrome, woodcut style',
    illustrations_enabled: false,
    narration_enabled: false,
    narrator_gender: 'masculine',
    narration_speed: 1.0,
    narration_debug: false
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

    /**
     * Available TTS voices for narrator and NPC assignment.
     */
    VOICES: VOICES,

    /**
     * Check if narration debug mode is enabled.
     */
    isNarrationDebug: function () {
      var config = this.load();
      return config.narration_debug === true;
    },

    /**
     * Toggle narration debug mode.
     */
    setNarrationDebug: function (enabled) {
      var config = this.load();
      config.narration_debug = !!enabled;
      this.save(config);
    },

    /**
     * Get narration playback speed (0.5 to 2.0).
     */
    getNarrationSpeed: function () {
      var config = this.load();
      var speed = config.narration_speed;
      if (typeof speed !== 'number' || speed < 0.5 || speed > 2.0) return 1.0;
      return speed;
    },

    /**
     * Set narration playback speed.
     */
    setNarrationSpeed: function (speed) {
      var config = this.load();
      config.narration_speed = Math.max(0.5, Math.min(2.0, parseFloat(speed) || 1.0));
      this.save(config);
    },

    /**
     * Get the narrator gender preference.
     */
    getNarratorGender: function () {
      var config = this.load();
      return config.narrator_gender || DEFAULT_CONFIG.narrator_gender;
    },

    /**
     * Set the narrator gender preference.
     */
    setNarratorGender: function (gender) {
      var config = this.load();
      config.narrator_gender = gender;
      this.save(config);
    },

    /**
     * Get the narrator voice ID. Uses the LLM-generated profile from game state
     * if available, otherwise picks a default based on gender preference.
     */
    getNarratorVoice: function () {
      var gameState = SQ.GameState && SQ.GameState.get();
      if (gameState && gameState.narrator_voice_profile && gameState.narrator_voice_profile.voice) {
        return gameState.narrator_voice_profile.voice;
      }
      // Fallback: pick a default voice based on gender
      return this._defaultVoiceForGender(this.getNarratorGender());
    },

    /**
     * Get the narrator profile object { voice, style }.
     * Returns the LLM-generated profile from game state if available,
     * otherwise a basic fallback based on gender preference.
     */
    getNarratorProfile: function () {
      var gameState = SQ.GameState && SQ.GameState.get();
      if (gameState && gameState.narrator_voice_profile &&
          gameState.narrator_voice_profile.voice && gameState.narrator_voice_profile.style) {
        return gameState.narrator_voice_profile;
      }
      // Fallback
      var gender = this.getNarratorGender();
      return {
        voice: this._defaultVoiceForGender(gender),
        style: 'Speak as a skilled narrator. Use a dramatic, immersive reading voice appropriate for a story.'
      };
    },

    /**
     * Pick a default voice ID for a given gender preference.
     * @private
     */
    _defaultVoiceForGender: function (gender) {
      if (gender === 'feminine') return 'XrExE9yKIg1WjnnlVkGX'; // Matilda
      return 'onwK4e9ZLuTAKqWW03F9'; // Daniel (deep, British) — default for masculine and non-binary
    },

    /**
     * Get voice IDs that match a given gender category.
     */
    getVoicesForGender: function (gender) {
      return VOICES.filter(function (v) { return v.gender === gender; })
        .map(function (v) { return v.id; });
    },

    /**
     * Get the ElevenLabs API key.
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
     * Check if a non-empty ElevenLabs API key is stored.
     */
    hasElevenLabsApiKey: function () {
      return this.getElevenLabsApiKey().length > 0;
    },

    /**
     * Get the ElevenLabs model ID.
     */
    getElevenLabsModel: function () {
      var config = this.load();
      return config.elevenlabs_model || DEFAULT_CONFIG.elevenlabs_model;
    },

    /**
     * Set the ElevenLabs model ID.
     */
    setElevenLabsModel: function (modelId) {
      var config = this.load();
      config.elevenlabs_model = modelId;
      this.save(config);
    }
  };
})();
