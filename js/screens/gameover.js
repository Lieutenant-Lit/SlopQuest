/**
 * SQ.Screens.GameOver — Death and story completion screens.
 * Per Section 6.5:
 * - Death: show death passage + rewind timeline. Save preserved in localStorage.
 * - Story complete: show final passage + stats + event log. Clear save from localStorage.
 */
(function () {
  SQ.Screens.GameOver = {
    init: function () {
      document.getElementById('btn-rewind-from-death').addEventListener('click', function () {
        SQ.showScreen('rewind');
      });

      document.getElementById('btn-new-game-from-death').addEventListener('click', function () {
        SQ.GameState.clear();
        SQ.HistoryStack.clear();
        SQ.showScreen('setup');
      });

      // Playtest report buttons
      document.getElementById('btn-copy-report').addEventListener('click', function () {
        var report = SQ.Playtester && SQ.Playtester.getReport();
        if (report && navigator.clipboard) {
          navigator.clipboard.writeText(report).then(function () {
            var btn = document.getElementById('btn-copy-report');
            btn.textContent = 'Copied!';
            setTimeout(function () { btn.textContent = 'Copy to Clipboard'; }, 2000);
          });
        }
      });

      document.getElementById('btn-download-report').addEventListener('click', function () {
        var report = SQ.Playtester && SQ.Playtester.getReport();
        if (!report) return;

        var blob = new Blob([report], { type: 'text/markdown' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'playtest-report-' + new Date().toISOString().slice(0, 10) + '.md';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    },

    onShow: function () {
      var state = SQ.GameState.get();
      if (!state) return;

      var isDeath = state.game_over && !state.story_complete;
      var isComplete = !!state.story_complete;

      // Set title
      var titleEl = document.getElementById('gameover-title');
      if (isComplete) {
        titleEl.textContent = 'Story Complete';
      } else if (isDeath) {
        titleEl.textContent = 'Game Over';
      } else {
        titleEl.textContent = 'Game Over';
      }

      // Render passage
      this._renderPassage(state.last_passage);

      // Render stats
      this._renderStats(state, isDeath, isComplete);

      // Render key choices from event log (story completion only)
      this._renderEventLog(state, isComplete);

      // Configure buttons
      this._configureButtons(isDeath, isComplete);

      // Handle playtest report
      this._renderReport();

      // On story completion, clear the saved game from localStorage
      // (but not on death — player can close and resume at death screen)
      if (isComplete) {
        SQ.GameState.clear();
        SQ.HistoryStack.clear();
        if (SQ.UIDesigner) {
          SQ.UIDesigner.remove();
        }
      }
    },

    onHide: function () {},

    /**
     * Render the playtest report panel if a report is available or pending.
     * Can be called externally by Playtester when report generation completes.
     * @private
     */
    _renderReport: function () {
      var panel = document.getElementById('playtest-report-panel');
      var contentEl = document.getElementById('playtest-report-content');
      if (!panel || !contentEl) return;

      if (!SQ.Playtester) {
        panel.classList.add('hidden');
        return;
      }

      var report = SQ.Playtester.getReport();

      if (report) {
        // Report is ready — render it
        contentEl.innerHTML = this._renderMarkdown(report);
        panel.classList.remove('hidden');
      } else if (SQ.Playtester.getReportPromise()) {
        // Report is being generated — show spinner
        contentEl.innerHTML = '<div class="playtest-report-loading"><div class="spinner"></div><p>Generating playtest report...</p></div>';
        panel.classList.remove('hidden');

        // Wait for report to finish, then re-render
        var self = this;
        SQ.Playtester.getReportPromise().then(function () {
          self._renderReport();
        });
      } else {
        panel.classList.add('hidden');
      }
    },

    /**
     * Simple markdown to HTML converter for the playtest report.
     * Handles: headings, bold, bullet lists, paragraphs.
     * @private
     */
    _renderMarkdown: function (md) {
      if (!md) return '';
      var lines = md.split('\n');
      var html = '';
      var inList = false;

      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];

        // Headings
        if (line.match(/^### /)) {
          if (inList) { html += '</ul>'; inList = false; }
          html += '<h3>' + this._escape(line.slice(4)) + '</h3>';
        } else if (line.match(/^## /)) {
          if (inList) { html += '</ul>'; inList = false; }
          html += '<h2>' + this._escape(line.slice(3)) + '</h2>';
        } else if (line.match(/^# /)) {
          if (inList) { html += '</ul>'; inList = false; }
          html += '<h1>' + this._escape(line.slice(2)) + '</h1>';
        }
        // Bullet lists
        else if (line.match(/^\s*[-*] /)) {
          if (!inList) { html += '<ul>'; inList = true; }
          var content = line.replace(/^\s*[-*] /, '');
          html += '<li>' + this._formatInline(content) + '</li>';
        }
        // Empty line
        else if (line.trim() === '') {
          if (inList) { html += '</ul>'; inList = false; }
        }
        // Paragraph text
        else {
          if (inList) { html += '</ul>'; inList = false; }
          html += '<p>' + this._formatInline(line) + '</p>';
        }
      }

      if (inList) html += '</ul>';
      return html;
    },

    /**
     * Format inline markdown: **bold**, *italic*, `code`.
     * @private
     */
    _formatInline: function (text) {
      var escaped = this._escape(text);
      // Bold
      escaped = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      // Italic
      escaped = escaped.replace(/\*(.+?)\*/g, '<em>$1</em>');
      // Inline code
      escaped = escaped.replace(/`(.+?)`/g, '<code>$1</code>');
      return escaped;
    },

    /**
     * Render the death/ending passage text.
     * @private
     */
    _renderPassage: function (text) {
      var passageEl = document.getElementById('gameover-passage');
      passageEl.innerHTML = '';

      if (!text) {
        var p = document.createElement('p');
        p.textContent = 'The story has ended.';
        passageEl.appendChild(p);
        return;
      }

      var paragraphs = text.split(/\n\n+/);
      paragraphs.forEach(function (p) {
        var trimmed = p.trim();
        if (!trimmed) return;
        var el = document.createElement('p');
        el.textContent = trimmed;
        passageEl.appendChild(el);
      });
    },

    /**
     * Render stats summary.
     * @private
     */
    _renderStats: function (state, isDeath, isComplete) {
      var statsEl = document.getElementById('gameover-stats');
      var totalTurns = SQ.HistoryStack.length();
      var lines = [];

      // Death reason (death only)
      if (isDeath) {
        var reason = state.game_over_reason || 'You have fallen.';
        lines.push('<div class="gameover-reason">' + this._escape(reason) + '</div>');
      }

      // Stats grid
      lines.push('<div class="gameover-stats-grid">');

      lines.push(this._statItem('Turns', totalTurns));
      lines.push(this._statItem('Act', state.current.act || '?'));
      lines.push(this._statItem('Scene', state.current.scene_number || '?'));
      if (state.current && state.current.in_game_time) {
        lines.push(this._statItem('Time', SQ.GameState.formatTime(state.current.in_game_time)));
      }

      if (isComplete) {
        // Difficulty and story length
        lines.push(this._statItem('Difficulty', this._capitalize(state.meta.difficulty || 'normal')));
        lines.push(this._statItem('Length', this._capitalize(state.meta.story_length || 'medium')));
      }

      lines.push('</div>');

      statsEl.innerHTML = lines.join('');
    },

    /**
     * Render key choices from the event log (story completion only).
     * @private
     */
    _renderEventLog: function (state, isComplete) {
      var logEl = document.getElementById('gameover-event-log');

      if (!isComplete || !state.event_log || state.event_log.length === 0) {
        logEl.classList.add('hidden');
        return;
      }

      logEl.classList.remove('hidden');
      var html = '<h2>Key Moments</h2><ul>';

      // Show up to 10 most significant entries from the event log
      var entries = state.event_log;
      var displayed = entries.slice(-10);

      for (var i = 0; i < displayed.length; i++) {
        html += '<li>' + this._escape(displayed[i]) + '</li>';
      }

      html += '</ul>';
      logEl.innerHTML = html;
    },

    /**
     * Configure which buttons are visible and their styling.
     * Death: Rewind is primary, New Game is secondary.
     * Completion: New Game is primary, Rewind is hidden.
     * @private
     */
    _configureButtons: function (isDeath, isComplete) {
      var rewindBtn = document.getElementById('btn-rewind-from-death');
      var newGameBtn = document.getElementById('btn-new-game-from-death');

      // During playtester runs, always show New Game as primary
      var isPlaytest = SQ.Playtester && (SQ.Playtester.getReport() || SQ.Playtester.getReportPromise());

      if (isComplete || isPlaytest) {
        rewindBtn.classList.add('hidden');
        newGameBtn.className = 'btn btn-primary btn-large';
        newGameBtn.textContent = isPlaytest ? 'New Playtest' : 'New Game';
      } else {
        // Death — Rewind is primary action
        if (SQ.HistoryStack.length() > 0) {
          rewindBtn.classList.remove('hidden');
          rewindBtn.className = 'btn btn-primary btn-large';
        } else {
          rewindBtn.classList.add('hidden');
        }
        newGameBtn.className = 'btn btn-secondary btn-large';
        newGameBtn.textContent = 'New Game';
      }
    },

    /**
     * Build a single stat item HTML string.
     * @private
     */
    _statItem: function (label, value) {
      return '<div class="stat-item">' +
        '<span class="stat-value">' + this._escape(String(value)) + '</span>' +
        '<span class="stat-label">' + this._escape(label) + '</span>' +
        '</div>';
    },

    /**
     * Capitalize first letter.
     * @private
     */
    _capitalize: function (str) {
      if (!str) return '';
      return str.charAt(0).toUpperCase() + str.slice(1);
    },

    /**
     * Escape HTML special characters.
     * @private
     */
    _escape: function (str) {
      var div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }
  };
})();
