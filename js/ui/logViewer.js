/**
 * SQ.LogViewer — In-app log viewer panel.
 * Shows persistent logs from SQ.Logger with filtering and export.
 */
(function () {
  SQ.LogViewer = {
    init: function () {
      var self = this;

      document.getElementById('btn-log-close').addEventListener('click', function () {
        self.hide();
      });

      document.getElementById('btn-log-export').addEventListener('click', function () {
        self._export();
      });

      document.getElementById('btn-log-clear').addEventListener('click', function () {
        SQ.Logger.clear();
        self._render();
      });

      document.getElementById('log-filter-level').addEventListener('change', function () {
        self._render();
      });

      document.getElementById('log-filter-category').addEventListener('change', function () {
        self._render();
      });
    },

    show: function () {
      var panel = document.getElementById('log-viewer');
      panel.classList.remove('hidden');
      this._populateCategoryFilter();
      this._render();
    },

    hide: function () {
      document.getElementById('log-viewer').classList.add('hidden');
    },

    _populateCategoryFilter: function () {
      var select = document.getElementById('log-filter-category');
      var current = select.value;
      // Keep the "All Categories" option, replace the rest
      while (select.options.length > 1) {
        select.remove(1);
      }
      var cats = SQ.Logger.getCategories();
      for (var i = 0; i < cats.length; i++) {
        var opt = document.createElement('option');
        opt.value = cats[i];
        opt.textContent = cats[i];
        select.appendChild(opt);
      }
      // Restore selection if still valid
      select.value = current;
    },

    _getFilter: function () {
      var filter = {};
      var level = document.getElementById('log-filter-level').value;
      var cat = document.getElementById('log-filter-category').value;
      if (level) filter.level = level;
      if (cat) filter.category = cat;
      return filter;
    },

    _render: function () {
      var container = document.getElementById('log-entries');
      var filter = this._getFilter();
      var entries = SQ.Logger.getEntries(filter);

      if (entries.length === 0) {
        container.innerHTML = '<div class="log-empty">No log entries' +
          (filter.level || filter.category ? ' matching filter' : '') + '.</div>';
        return;
      }

      var html = '';
      for (var i = entries.length - 1; i >= 0; i--) {
        var e = entries[i];
        var time = e.ts ? e.ts.substring(11, 23) : '??:??:??.???';
        var levelClass = 'log-level-' + e.level;

        html += '<div class="log-entry">';
        html += '<span class="log-time">' + time + '</span>';
        html += '<span class="log-badge ' + levelClass + '">' + e.level.toUpperCase() + '</span>';
        html += '<span class="log-cat">' + this._esc(e.cat) + '</span>';
        html += '<span class="log-msg">' + this._esc(e.msg) + '</span>';

        if (e.data !== undefined) {
          var dataStr;
          try {
            dataStr = JSON.stringify(e.data, null, 2);
          } catch (err) {
            dataStr = String(e.data);
          }
          html += '<pre class="log-entry-data">' + this._esc(dataStr) + '</pre>';
        }

        html += '</div>';
      }

      container.innerHTML = html;
    },

    _esc: function (str) {
      if (!str) return '';
      var div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    },

    _export: function () {
      var json = SQ.Logger.exportJSON();
      var blob = new Blob([json], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      var ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      a.href = url;
      a.download = 'slopquest-logs-' + ts + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };
})();
