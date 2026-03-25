/**
 * SQ.Logger — Structured, persistent logging system.
 *
 * Stores timestamped log entries in localStorage as a ring buffer.
 * Always mirrors to browser console. Persistence controlled by
 * PlayerConfig.isLoggingEnabled().
 *
 * Usage:
 *   SQ.Logger.info('Writer', 'Response OK', { preview: '...' });
 *   SQ.Logger.warn('API', 'Rate limited', { status: 429 });
 *   SQ.Logger.error('GameMaster', 'Parse failed', { raw: '...' });
 */
(function () {
  var STORAGE_KEY = 'slopquest_logs';
  var MAX_ENTRIES = 500;
  var MAX_BYTES = 2 * 1024 * 1024; // 2 MB

  /** In-memory log buffer, loaded from localStorage on first access. */
  var _entries = null;
  var _loaded = false;

  function _load() {
    if (_loaded) return;
    _loaded = true;
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        _entries = JSON.parse(raw);
        if (!Array.isArray(_entries)) _entries = [];
      } else {
        _entries = [];
      }
    } catch (e) {
      _entries = [];
    }
  }

  function _persist() {
    if (!SQ.PlayerConfig || !SQ.PlayerConfig.isLoggingEnabled()) return;
    try {
      var json = JSON.stringify(_entries);
      // Size guard: trim oldest 25% if over budget
      while (json.length > MAX_BYTES && _entries.length > 10) {
        var trimCount = Math.max(1, Math.floor(_entries.length * 0.25));
        _entries.splice(0, trimCount);
        json = JSON.stringify(_entries);
      }
      localStorage.setItem(STORAGE_KEY, json);
    } catch (e) {
      // localStorage full or unavailable — silently drop
    }
  }

  /**
   * Clip data values to prevent bloat. Truncates long strings,
   * limits array lengths, keeps objects shallow.
   */
  function _clip(data) {
    if (data === undefined || data === null) return undefined;
    if (typeof data === 'string') {
      return data.length > 1000 ? data.substring(0, 1000) + '...[clipped]' : data;
    }
    if (typeof data !== 'object') return data;
    if (Array.isArray(data)) {
      var arr = data.slice(0, 20);
      for (var i = 0; i < arr.length; i++) {
        arr[i] = _clip(arr[i]);
      }
      if (data.length > 20) arr.push('...[' + (data.length - 20) + ' more]');
      return arr;
    }
    var out = {};
    var keys = Object.keys(data);
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      var val = data[key];
      if (typeof val === 'string') {
        out[key] = val.length > 500 ? val.substring(0, 500) + '...[clipped]' : val;
      } else if (typeof val === 'object' && val !== null) {
        // One level deep only — stringify nested objects
        try {
          var s = JSON.stringify(val);
          out[key] = s.length > 500 ? s.substring(0, 500) + '...[clipped]' : val;
        } catch (e) {
          out[key] = '[unserializable]';
        }
      } else {
        out[key] = val;
      }
    }
    return out;
  }

  function _log(level, category, message, data, skipClip) {
    _load();

    var entry = {
      ts: new Date().toISOString(),
      level: level,
      cat: category,
      msg: message
    };
    if (data !== undefined) {
      entry.data = skipClip ? data : _clip(data);
    }

    // Ring buffer — drop oldest if full
    _entries.push(entry);
    if (_entries.length > MAX_ENTRIES) {
      _entries.splice(0, _entries.length - MAX_ENTRIES);
    }

    _persist();

    // Mirror to browser console
    var prefix = '[' + category + '] ';
    if (level === 'error') {
      console.error(prefix + message, data !== undefined ? data : '');
    } else if (level === 'warn') {
      console.warn(prefix + message, data !== undefined ? data : '');
    } else {
      console.log(prefix + message, data !== undefined ? data : '');
    }
  }

  SQ.Logger = {
    info: function (category, message, data) {
      _log('info', category, message, data);
    },

    /** Log at info level without clipping data (for large structured objects like skeletons). */
    infoFull: function (category, message, data) {
      var snapshot;
      try { snapshot = JSON.parse(JSON.stringify(data)); } catch (e) { snapshot = data; }
      _log('info', category, message, snapshot, true);
    },

    warn: function (category, message, data) {
      _log('warn', category, message, data);
    },

    error: function (category, message, data) {
      _log('error', category, message, data);
    },

    /**
     * Get log entries, optionally filtered.
     * @param {object} [filter] - { level: string, category: string }
     * @returns {Array} Log entries
     */
    getEntries: function (filter) {
      _load();
      if (!filter) return _entries.slice();
      return _entries.filter(function (e) {
        if (filter.level && e.level !== filter.level) return false;
        if (filter.category && e.cat !== filter.category) return false;
        return true;
      });
    },

    /**
     * Get all unique categories present in current logs.
     * @returns {Array<string>}
     */
    getCategories: function () {
      _load();
      var cats = {};
      for (var i = 0; i < _entries.length; i++) {
        cats[_entries[i].cat] = true;
      }
      return Object.keys(cats).sort();
    },

    /**
     * Export all logs as a JSON string.
     * @returns {string}
     */
    exportJSON: function () {
      _load();
      return JSON.stringify(_entries, null, 2);
    },

    /**
     * Clear all stored logs.
     */
    clear: function () {
      _entries = [];
      _loaded = true;
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {
        // ignore
      }
    }
  };
})();
