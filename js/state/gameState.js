/**
 * SQ.GameState — Game state management and localStorage persistence.
 * Single save slot. State structure matches the design doc Section 4.
 */
(function () {
  var STORAGE_KEY = 'slopquest_game_state';

  SQ.GameState = {
    /** In-memory current state. */
    _current: null,

    /**
     * Create a new game state from setup configuration.
     */
    create: function (setupConfig) {
      var diffKey = setupConfig.difficulty || 'normal';
      var diffConfig = SQ.DifficultyConfig[diffKey] || SQ.DifficultyConfig.normal;
      var startResources = diffConfig.starting_resources || { gold: 10, provisions: 5 };

      this._current = {
        meta: {
          title: '',
          setting: setupConfig.setting || '',
          tone: setupConfig.tone || '',
          writing_style: setupConfig.writingStyle || '',
          perspective: setupConfig.perspective || 'second person',
          tense: setupConfig.tense || 'present',
          difficulty: diffKey,
          story_length: setupConfig.storyLength || 'medium'
        },
        skeleton: null, // populated after skeleton generation
        player: {
          name: setupConfig.characterName || 'The Wanderer',
          archetype: setupConfig.archetype || '',
          health: 100,
          resources: {
            gold: startResources.gold,
            provisions: startResources.provisions
          },
          inventory: [],
          status_effects: [],
          skills: []
        },
        relationships: {},
        current: {
          act: 1,
          scene_number: 1,
          location: '',
          time_of_day: '',
          proximity_to_climax: 0.0,
          active_constraints: [],
          scene_context: ''
        },
        pending_consequences: [],
        current_choices: null,
        event_log: [],
        backstory_summary: '',
        narrator_voice_profile: null,
        npc_voices: {},
        world_flags: {},
        last_passage: '',
        illustration_prompt: '',
        game_over: false,
        game_over_reason: ''
      };
      return this._current;
    },

    /**
     * Save current state to localStorage.
     */
    save: function () {
      if (this._current) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this._current));
      }
    },

    /**
     * Load state from localStorage into memory. Returns state or null.
     */
    load: function () {
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          this._current = JSON.parse(raw);
          return this._current;
        }
      } catch (e) {
        console.warn('GameState: failed to parse stored state', e);
      }
      return null;
    },

    /**
     * Get current in-memory state.
     */
    get: function () {
      return this._current;
    },

    /**
     * Shallow-merge updates into the current state.
     */
    update: function (changes) {
      if (!this._current) return;
      Object.assign(this._current, changes);
    },

    /**
     * Deep-merge updates into nested state sections.
     */
    updatePlayer: function (playerChanges) {
      if (!this._current || !this._current.player) return;
      Object.assign(this._current.player, playerChanges);
    },

    updateCurrent: function (currentChanges) {
      if (!this._current || !this._current.current) return;
      Object.assign(this._current.current, currentChanges);
    },

    /**
     * Clear saved game from localStorage and memory.
     */
    clear: function () {
      this._current = null;
      localStorage.removeItem(STORAGE_KEY);
    },

    /**
     * Check if a saved game exists in localStorage.
     */
    exists: function () {
      return localStorage.getItem(STORAGE_KEY) !== null;
    },

    /**
     * Create a deep clone of the current state (for history stack).
     */
    snapshot: function () {
      if (!this._current) return null;
      return JSON.parse(JSON.stringify(this._current));
    },

    /**
     * Restore state from a snapshot (e.g., after rewind).
     */
    restore: function (snapshot) {
      this._current = JSON.parse(JSON.stringify(snapshot));
    }
  };
})();
