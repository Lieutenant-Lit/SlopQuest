/**
 * SQ.Playtester — Agentic Playtester module.
 * Plays through the game autonomously, making one LLM call per turn to
 * decide which choice to pick and update its running memory journal.
 * After the playtest ends, generates a structured quality report.
 */
(function () {
  SQ.Playtester = {
    // --- State ---
    _active: false,
    _memory: '',
    _turnCount: 0,
    _maxTurns: 20,
    _playstyle: '',
    _focusPrimer: '',
    _report: null,
    _reportPromise: null,
    _stopped: false,

    // --- Lifecycle ---

    /**
     * Start an automated playtest session.
     * @param {object} config - { maxTurns, playstyle, focusPrimer }
     */
    start: function (config) {
      this._active = true;
      this._stopped = false;
      this._memory = '';
      this._turnCount = 0;
      this._maxTurns = config.maxTurns || 20;
      this._playstyle = config.playstyle || '';
      this._focusPrimer = config.focusPrimer || '';
      this._report = null;
      this._reportPromise = null;

      SQ.Logger.info('Playtester', 'Playtest started', {
        maxTurns: this._maxTurns,
        playstyle: this._playstyle,
        focusPrimer: this._focusPrimer
      });

      // Show the end-playtest button
      var btn = document.getElementById('btn-end-playtest');
      if (btn) btn.classList.remove('hidden');

      // Show turn counter
      this._updateTurnCounter();
    },

    /**
     * Stop the playtest (manual termination or max turns).
     * Generates the final report and navigates to game over screen.
     * @param {string} [reason] - Why the playtest stopped
     * @param {object} [opts] - Options
     * @param {boolean} [opts.skipNav] - Skip navigation to gameover (used when already transitioning)
     */
    stop: function (reason, opts) {
      if (this._stopped) return;
      this._stopped = true;
      this._active = false;

      var stopReason = reason || 'manual_stop';
      opts = opts || {};

      SQ.Logger.info('Playtester', 'Playtest stopped', {
        turnCount: this._turnCount,
        reason: stopReason
      });

      // Hide the end-playtest button and turn counter
      var btn = document.getElementById('btn-end-playtest');
      if (btn) btn.classList.add('hidden');
      var counter = document.getElementById('playtester-turn-counter');
      if (counter) counter.classList.add('hidden');

      this.generateReport(stopReason);

      // Navigate to gameover screen so the report panel is visible
      if (!opts.skipNav) {
        SQ.showScreen('gameover');
      }
    },

    /**
     * Check if a playtest is currently running.
     * @returns {boolean}
     */
    isActive: function () {
      return this._active;
    },

    /**
     * Get the generated report, or null if not yet available.
     * @returns {string|null}
     */
    getReport: function () {
      return this._report;
    },

    /**
     * Get the report promise for async waiting.
     * @returns {Promise|null}
     */
    getReportPromise: function () {
      return this._reportPromise;
    },

    // --- Turn Loop ---

    /**
     * Called by game.js after each turn fully resolves (Writer + GM done, choices enabled).
     * Drives the auto-play loop.
     */
    onTurnComplete: function () {
      if (!this._active) return;

      var state = SQ.GameState.get();
      if (!state) return;

      // Check for natural game end
      if (state.game_over || state.story_complete) {
        this._onGameEnd(state.game_over ? 'game_over' : 'story_complete');
        return;
      }

      // Check max turns
      if (this._turnCount >= this._maxTurns) {
        SQ.Logger.info('Playtester', 'Max turns reached', { turnCount: this._turnCount });
        this.stop('max_turns_reached');
        return;
      }

      // Proceed with next decision
      this._decideAndAct();
    },

    /**
     * Make an LLM call to decide the next choice and update memory.
     * @private
     */
    _decideAndAct: function (retryCount) {
      retryCount = retryCount || 0;
      var self = this;
      var state = SQ.GameState.get();
      if (!state) return;

      var skeleton = state.skeleton || {};
      var passage = state.last_passage || '';
      var choices = state.current_choices || {};
      var model = SQ.PlayerConfig.getModel('playtester');

      var systemPrompt = SQ.PlaytesterPrompt.buildTurnSystem(this._playstyle, this._focusPrimer);
      var userPrompt = SQ.PlaytesterPrompt.buildTurnUser(
        this._turnCount + 1, this._maxTurns,
        skeleton, state, passage, choices, this._memory
      );

      var messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];

      SQ.Logger.info('Playtester', 'Deciding turn ' + (this._turnCount + 1));

      SQ.API.call(model, messages, { temperature: 0.4, max_tokens: 1500 })
        .then(function (raw) {
          if (!self._active) return; // Stopped while waiting

          var response;
          try {
            response = SQ.API.parseJSON(raw);
          } catch (e) {
            throw new Error('Failed to parse playtester response: ' + e.message);
          }

          // Validate choice
          var choiceLetter = (response.choice || '').toUpperCase();
          var validChoices = ['A', 'B', 'C', 'D'];
          var availableChoices = [];
          for (var i = 0; i < validChoices.length; i++) {
            if (choices[validChoices[i]]) {
              availableChoices.push(validChoices[i]);
            }
          }

          if (availableChoices.indexOf(choiceLetter) === -1) {
            SQ.Logger.warn('Playtester', 'Invalid choice "' + choiceLetter + '", falling back to first available');
            choiceLetter = availableChoices[0] || 'A';
          }

          // Update memory
          if (response.memory) {
            self._memory = response.memory;
          }

          self._turnCount++;
          self._updateTurnCounter();

          SQ.Logger.info('Playtester', 'Turn ' + self._turnCount + ' decision', {
            choice: choiceLetter,
            reasoning: response.reasoning || ''
          });

          // Trigger the next turn through the normal game loop
          SQ.Screens.Game.makeChoice(choiceLetter);
        })
        .catch(function (err) {
          SQ.Logger.error('Playtester', 'Decision failed', { error: err.message, turn: self._turnCount + 1 });

          if (retryCount < 1) {
            SQ.Logger.info('Playtester', 'Retrying decision...');
            self._decideAndAct(1);
            return;
          }

          // Give up — append error to memory and generate report
          self._memory += '\n\n[TURN ' + (self._turnCount + 1) + ': LLM call failed — ' + err.message + '. Playtest terminated early.]';
          self.stop('error: ' + err.message);
        });
    },

    // --- Game End ---

    /**
     * Called when the game ends naturally (game over or story complete).
     * @param {string} reason - 'game_over' or 'story_complete'
     * @private
     */
    _onGameEnd: function (reason) {
      if (this._stopped) return;
      this._active = false;
      this._stopped = true;

      SQ.Logger.info('Playtester', 'Game ended naturally', {
        reason: reason,
        turnCount: this._turnCount
      });

      var btn = document.getElementById('btn-end-playtest');
      if (btn) btn.classList.add('hidden');
      var counter = document.getElementById('playtester-turn-counter');
      if (counter) counter.classList.add('hidden');

      // Don't navigate here — game.js handles the gameover navigation
      this.generateReport(reason);
    },

    // --- Report Generation ---

    /**
     * Generate the final playtest report via LLM call.
     * @param {string} outcome - How the playtest ended
     * @returns {Promise<string>} The report markdown
     */
    generateReport: function (outcome) {
      var self = this;
      var state = SQ.GameState.get();
      var skeleton = (state && state.skeleton) || {};
      var model = SQ.PlayerConfig.getModel('playtester');

      var systemPrompt = SQ.PlaytesterPrompt.buildReportSystem(this._focusPrimer);
      var userPrompt = SQ.PlaytesterPrompt.buildReportUser(
        outcome, this._turnCount, this._playstyle, this._focusPrimer,
        skeleton, state || {}, this._memory
      );

      var messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];

      SQ.Logger.info('Playtester', 'Generating report...', { outcome: outcome });

      this._reportPromise = SQ.API.call(model, messages, { temperature: 0.3, max_tokens: 4000 })
        .then(function (raw) {
          var response;
          try {
            response = SQ.API.parseJSON(raw);
            self._report = response.report || raw;
          } catch (e) {
            // If JSON parse fails, use the raw text as the report
            self._report = (typeof raw === 'string') ? raw : JSON.stringify(raw);
          }

          SQ.Logger.info('Playtester', 'Report generated', { length: self._report.length });

          // If we're on the gameover screen, trigger re-render of report panel
          self._showReportIfOnGameOver();

          return self._report;
        })
        .catch(function (err) {
          SQ.Logger.error('Playtester', 'Report generation failed', { error: err.message });

          // Retry once
          return SQ.API.call(model, messages, { temperature: 0.3, max_tokens: 4000 })
            .then(function (raw) {
              var response;
              try {
                response = SQ.API.parseJSON(raw);
                self._report = response.report || raw;
              } catch (e) {
                self._report = (typeof raw === 'string') ? raw : JSON.stringify(raw);
              }
              self._showReportIfOnGameOver();
              return self._report;
            })
            .catch(function (retryErr) {
              // Fallback: raw memory dump
              self._report = '## Report Generation Failed\n\n';
              self._report += 'The playtester completed ' + self._turnCount + ' turns but the report LLM call failed.\n\n';
              self._report += 'Error: ' + retryErr.message + '\n\n';
              self._report += '## Raw Memory Journal\n\n';
              self._report += self._memory || '(no observations recorded)';

              self._showReportIfOnGameOver();
              return self._report;
            });
        });

      return this._reportPromise;
    },

    /**
     * If the gameover screen is currently visible, show the report panel.
     * @private
     */
    _showReportIfOnGameOver: function () {
      var gameoverScreen = document.getElementById('screen-gameover');
      if (gameoverScreen && gameoverScreen.classList.contains('active')) {
        if (SQ.Screens.GameOver && SQ.Screens.GameOver._renderReport) {
          SQ.Screens.GameOver._renderReport();
        }
      }
    },

    /**
     * Update the turn counter display on the game screen.
     * @private
     */
    _updateTurnCounter: function () {
      var counter = document.getElementById('playtester-turn-counter');
      if (counter) {
        counter.textContent = 'Playtest: Turn ' + this._turnCount + ' / ' + this._maxTurns;
        counter.classList.remove('hidden');
      }
    }
  };
})();
