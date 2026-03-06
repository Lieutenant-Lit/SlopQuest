/**
 * SQ.PlayerConfig — Player configuration persistence (API key, model prefs).
 * Stored in localStorage separately from game state.
 */
(function () {
  var STORAGE_KEY = 'slopquest_player_config';
  var MOCK_KEY = 'slopquest_mock_mode';

  var VOICES = [
    { id: 'alloy',   label: 'Alloy (neutral)' },
    { id: 'ash',     label: 'Ash (clear, male)' },
    { id: 'ballad',  label: 'Ballad (expressive)' },
    { id: 'cedar',   label: 'Cedar (warm, male)' },
    { id: 'coral',   label: 'Coral (warm, female)' },
    { id: 'echo',    label: 'Echo (resonant, male)' },
    { id: 'fable',   label: 'Fable (storyteller, male)' },
    { id: 'marin',   label: 'Marin (clear, female)' },
    { id: 'nova',    label: 'Nova (bright, female)' },
    { id: 'onyx',    label: 'Onyx (deep, male)' },
    { id: 'sage',    label: 'Sage (calm, female)' },
    { id: 'shimmer', label: 'Shimmer (cheerful, female)' },
    { id: 'verse',   label: 'Verse (versatile)' }
  ];

  var VOICE_PROFILES = [
    {
      id: 'epic_narrator',
      label: 'Epic Narrator',
      voice: 'fable',
      style: 'Voice: Deep, rich, and commanding. Tone: Dramatic and immersive, like a veteran storyteller recounting legendary events. Pacing: Measured and deliberate, with pauses before dramatic reveals. Accent: Refined British. Emotion: Gravitas and wonder.'
    },
    {
      id: 'dark_narrator',
      label: 'Dark Narrator',
      voice: 'onyx',
      style: 'Voice: Low, hushed, and foreboding. Tone: Suspenseful and noir-like, as if revealing dangerous secrets. Pacing: Slow and deliberate, with tension in every pause. Accent: Neutral, deep. Emotion: Dread and mystery.'
    },
    {
      id: 'grizzled_commander',
      label: 'Grizzled Commander',
      voice: 'onyx',
      style: 'Voice: Deep, gravelly, and authoritative. Tone: Cold, clipped, military precision. Pacing: Short, sharp sentences. No wasted words. Accent: Slight northern English gruffness. Emotion: Stoic, controlled anger simmering underneath.'
    },
    {
      id: 'rebel_leader',
      label: 'Rebel Leader',
      voice: 'coral',
      style: 'Voice: Warm but hardened by experience. Tone: Passionate and determined, someone who has seen too much. Pacing: Measured but urgent when the stakes rise. Accent: Slight Irish lilt. Emotion: Fierce conviction tempered by weariness.'
    },
    {
      id: 'mysterious_scholar',
      label: 'Mysterious Scholar',
      voice: 'sage',
      style: 'Voice: Quiet, deliberate, and slightly ethereal. Tone: Detached and contemplative, as if speaking from beyond. Pacing: Very slow and precise, every word chosen carefully. Accent: Refined, old-world. Emotion: Cold curiosity, hints of hidden knowledge.'
    },
    {
      id: 'scheming_noble',
      label: 'Scheming Noble',
      voice: 'verse',
      style: 'Voice: Smooth, refined, dripping with condescension. Tone: Theatrical and self-important. Pacing: Languid and unhurried, as if everyone else is beneath notice. Accent: Upper-class British, clipped vowels. Emotion: Barely concealed ambition and contempt.'
    },
    {
      id: 'street_urchin',
      label: 'Street Urchin',
      voice: 'nova',
      style: 'Voice: Quick, bright, and scrappy. Tone: Cheeky and streetwise, with a survival edge. Pacing: Fast and darting, words tumbling over each other. Accent: Cockney-influenced, dropped consonants. Emotion: Wary bravado masking vulnerability.'
    },
    {
      id: 'tavern_keeper',
      label: 'Tavern Keeper',
      voice: 'cedar',
      style: 'Voice: Warm, rumbling, and inviting. Tone: Casual and world-weary but kind. Pacing: Relaxed and unhurried. Accent: Warm rural English. Emotion: Gruff friendliness, someone who has heard every story.'
    },
    {
      id: 'ancient_sorcerer',
      label: 'Ancient Sorcerer',
      voice: 'echo',
      style: 'Voice: Deep, resonant, and otherworldly. Tone: Ominous and powerful, words carrying weight of centuries. Pacing: Extremely deliberate, with long dramatic pauses. Accent: Archaic, formal. Emotion: Detached menace, vast indifference.'
    },
    {
      id: 'young_squire',
      label: 'Young Squire',
      voice: 'ash',
      style: 'Voice: Clear, earnest, and youthful. Tone: Eager and slightly nervous. Pacing: Quick when excited, halting when uncertain. Accent: Neutral, clean. Emotion: Hopeful idealism, desire to prove worthy.'
    },
    {
      id: 'wise_elder',
      label: 'Wise Elder',
      voice: 'ballad',
      style: 'Voice: Weathered but melodic, carrying the weight of years. Tone: Gentle and knowing, never hurried. Pacing: Slow and rhythmic, almost musical. Accent: Soft Scottish burr. Emotion: Deep compassion and quiet sorrow.'
    },
    {
      id: 'mercenary',
      label: 'Mercenary',
      voice: 'marin',
      style: 'Voice: Cool, direct, and no-nonsense. Tone: Professional detachment, everything is transactional. Pacing: Efficient, clipped. Accent: Neutral with hard consonants. Emotion: Flat affect, occasional dry humor.'
    }
  ];

  var DEFAULT_CONFIG = {
    openrouter_api_key: '',
    models: {
      skeleton: 'anthropic/claude-sonnet-4',
      passage: 'anthropic/claude-sonnet-4',
      image: 'google/gemini-3.1-flash-image-preview',
      audio: 'openai/gpt-4o-audio-preview'
    },
    visual_style_prefix: 'dark ink illustration, crosshatched, monochrome, woodcut style',
    illustrations_enabled: false,
    narration_enabled: false,
    narrator_voice: 'fable',
    narrator_profile: 'epic_narrator'
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
     * Predefined voice profiles with style instructions for fantasy characters.
     */
    VOICE_PROFILES: VOICE_PROFILES,

    /**
     * Get the narrator voice ID.
     */
    getNarratorVoice: function () {
      var config = this.load();
      return config.narrator_voice || DEFAULT_CONFIG.narrator_voice;
    },

    /**
     * Set the narrator voice ID.
     */
    setNarratorVoice: function (voiceId) {
      var config = this.load();
      config.narrator_voice = voiceId;
      this.save(config);
    },

    /**
     * Get the narrator profile object (voice + style).
     */
    getNarratorProfile: function () {
      var config = this.load();
      var profileId = config.narrator_profile || DEFAULT_CONFIG.narrator_profile;
      for (var i = 0; i < VOICE_PROFILES.length; i++) {
        if (VOICE_PROFILES[i].id === profileId) return VOICE_PROFILES[i];
      }
      return VOICE_PROFILES[0];
    },

    /**
     * Get the narrator profile ID.
     */
    getNarratorProfileId: function () {
      var config = this.load();
      return config.narrator_profile || DEFAULT_CONFIG.narrator_profile;
    },

    /**
     * Set the narrator profile (updates both profile ID and voice).
     */
    setNarratorProfile: function (profileId) {
      var config = this.load();
      config.narrator_profile = profileId;
      // Also update the voice to match the profile's recommended voice
      for (var i = 0; i < VOICE_PROFILES.length; i++) {
        if (VOICE_PROFILES[i].id === profileId) {
          config.narrator_voice = VOICE_PROFILES[i].voice;
          break;
        }
      }
      this.save(config);
    }
  };
})();
