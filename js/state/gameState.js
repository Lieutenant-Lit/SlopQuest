/**
 * SQ.GameState — Game state management and localStorage persistence.
 * Single save slot. State structure matches the design doc Section 4.
 */
(function () {
  var STORAGE_KEY = 'slopquest_game_state';

  /**
   * Convert a time object { days, hours, minutes, seconds } to total seconds.
   */
  function timeToSeconds(t) {
    if (!t) return 0;
    return ((t.days || 0) * 86400) + ((t.hours || 0) * 3600) + ((t.minutes || 0) * 60) + (t.seconds || 0);
  }

  /**
   * Convert total seconds to a time object { days, hours, minutes, seconds }.
   */
  function secondsToTime(total) {
    if (total <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
    var days = Math.floor(total / 86400);
    total -= days * 86400;
    var hours = Math.floor(total / 3600);
    total -= hours * 3600;
    var minutes = Math.floor(total / 60);
    var seconds = total - minutes * 60;
    return { days: days, hours: hours, minutes: minutes, seconds: Math.round(seconds) };
  }

  SQ.GameState = {
    /** In-memory current state. */
    _current: null,

    /**
     * Create a new game state from setup configuration.
     */
    create: function (setupConfig) {
      var diffKey = setupConfig.difficulty || 'normal';

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
          resources: {},
          inventory: [],
          status_effects: [],
          skills: []
        },
        narrator: {},
        relationships: {},
        current: {
          act: 1,
          scene_number: 1,
          location: '',
          time_of_day: '',
          in_game_time: { days: 0, hours: 0, minutes: 0, seconds: 0 },
          proximity_to_climax: 0.0,
          active_constraints: [],
          scene_context: ''
        },
        pending_consequences: [],
        current_choices: null,
        event_log: [],
        backstory_summary: '',
        world_flags: {},
        last_passage: '',
        illustration_prompt: '',
        game_over: false,
        game_over_reason: ''
      };
      return this._current;
    },

    /**
     * Populate player resources from skeleton resource_definitions.
     * Called after skeleton generation, scales base_amount by difficulty multiplier.
     */
    initResourcesFromSkeleton: function (skeleton) {
      if (!this._current || !skeleton || !skeleton.resource_definitions) return;

      var defs = skeleton.resource_definitions;
      var diffKey = this._current.meta.difficulty || 'normal';
      var diffConfig = SQ.DifficultyConfig[diffKey] || SQ.DifficultyConfig.normal;
      var multiplier = diffConfig.resource_multiplier || 1.0;

      // Store health stat metadata for UI
      this._current.meta.health_stat_name = (defs.health_stat && defs.health_stat.name) || 'Health';
      this._current.meta.health_stat_icon = (defs.health_stat && defs.health_stat.icon) || 'heart';

      // Store full resource definitions for UI rendering
      this._current.meta.resource_definitions = defs;

      // Initialize resources scaled by difficulty
      var resources = {};
      if (Array.isArray(defs.resources)) {
        for (var i = 0; i < defs.resources.length; i++) {
          var r = defs.resources[i];
          resources[r.key] = Math.round((r.base_amount || 5) * multiplier);
        }
      }
      this._current.player.resources = resources;
    },

    /**
     * Populate player inventory from skeleton starting_inventory.
     * Called after skeleton generation.
     */
    initInventoryFromSkeleton: function (skeleton) {
      if (!this._current || !skeleton) return;
      if (Array.isArray(skeleton.starting_inventory) && skeleton.starting_inventory.length > 0) {
        this._current.player.inventory = skeleton.starting_inventory.slice();
      }
    },

    /**
     * Advance the in-game clock by a time delta.
     * @param {{ days, hours, minutes, seconds }} elapsed
     */
    advanceTime: function (elapsed) {
      if (!this._current || !elapsed) return;
      var cur = this._current.current.in_game_time || { days: 0, hours: 0, minutes: 0, seconds: 0 };
      var total = timeToSeconds(cur) + timeToSeconds(elapsed);
      this._current.current.in_game_time = secondsToTime(total);
    },

    /**
     * Subtract elapsed time from a time-remaining object. Floors at zero.
     * @param {{ days, hours, minutes, seconds }} target - the time remaining
     * @param {{ days, hours, minutes, seconds }} elapsed - time to subtract
     * @returns {{ time: { days, hours, minutes, seconds }, expired: boolean }}
     */
    subtractTime: function (target, elapsed) {
      if (!target) return { time: { days: 0, hours: 0, minutes: 0, seconds: 0 }, expired: true };
      var remaining = timeToSeconds(target) - timeToSeconds(elapsed);
      return {
        time: secondsToTime(Math.max(0, remaining)),
        expired: remaining <= 0
      };
    },

    /**
     * Format an in-game time object for display.
     * @param {{ days, hours, minutes, seconds }} t
     * @returns {string} e.g. "Day 3, 14:30" or "0:05:30"
     */
    formatTime: function (t) {
      if (!t) return 'Day 1, 00:00';
      var hh = String(t.hours || 0).padStart(2, '0');
      var mm = String(t.minutes || 0).padStart(2, '0');
      return 'Day ' + ((t.days || 0) + 1) + ', ' + hh + ':' + mm;
    },

    /**
     * Format a duration for display (e.g. "2d 5h", "30m", "45s").
     * @param {{ days, hours, minutes, seconds }} t
     * @returns {string}
     */
    formatDuration: function (t) {
      if (!t) return '—';
      var parts = [];
      if (t.days) parts.push(t.days + 'd');
      if (t.hours) parts.push(t.hours + 'h');
      if (t.minutes) parts.push(t.minutes + 'm');
      if (t.seconds && !t.days && !t.hours) parts.push(t.seconds + 's');
      return parts.length ? parts.join(' ') : '0s';
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
        SQ.Logger.warn('State', 'Failed to parse stored game state', { error: e.message });
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
