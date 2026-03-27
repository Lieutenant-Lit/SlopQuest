/**
 * SQ.Playtester — Agentic Playtester module.
 * Plays through the game autonomously, making one LLM call per turn to
 * decide which choice to pick and update its running memory journal.
 * After the playtest ends, generates a structured quality report.
 */
(function () {
  function formatCost(dollars) {
    if (dollars === null || dollars === undefined) return '?';
    if (dollars < 0.001) return '<$0.001';
    if (dollars < 0.01) return '$' + dollars.toFixed(4);
    return '$' + dollars.toFixed(3);
  }
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
    _costTracker: null,

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

      // Initialize cost tracking
      this._costTracker = {
        writer:     { model: '', calls: 0, prompt_tokens: 0, completion_tokens: 0 },
        gamemaster: { model: '', calls: 0, prompt_tokens: 0, completion_tokens: 0 },
        skeleton:   { model: '', calls: 0, prompt_tokens: 0, completion_tokens: 0 },
        image:      { model: '', calls: 0, prompt_tokens: 0, completion_tokens: 0 },
        voice:      { calls: 0, characters: 0 },
        playtester: { model: '', calls: 0, prompt_tokens: 0, completion_tokens: 0 }
      };

      // Subscribe to API usage events
      var self = this;
      this._usageListener = function (modelId, usage, source) {
        if (!self._costTracker) return;
        var pt = usage.prompt_tokens || 0;
        var ct = usage.completion_tokens || 0;

        // Categorize by source label (threaded through API call options)
        var bucket;
        switch (source) {
          case 'writer':     bucket = self._costTracker.writer; break;
          case 'gamemaster': bucket = self._costTracker.gamemaster; break;
          case 'skeleton':   bucket = self._costTracker.skeleton; break;
          case 'image':      bucket = self._costTracker.image; break;
          case 'playtester': bucket = self._costTracker.playtester; break;
          default:           bucket = self._costTracker.gamemaster; break;
        }

        bucket.model = modelId;
        bucket.calls++;
        bucket.prompt_tokens += pt;
        bucket.completion_tokens += ct;
      };
      SQ.API.addUsageListener(this._usageListener);

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

      // Unsubscribe from usage events (but keep tracker data for the report)
      if (this._usageListener) {
        SQ.API.removeUsageListener(this._usageListener);
        this._usageListener = null;
      }

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

      SQ.API.call(model, messages, { temperature: 0.4, max_tokens: 1500, source: 'playtester' })
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
      if (this._usageListener) {
        SQ.API.removeUsageListener(this._usageListener);
        this._usageListener = null;
      }

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

      this._reportPromise = SQ.API.call(model, messages, { temperature: 0.3, max_tokens: 4000, source: 'playtester' })
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
          return SQ.API.call(model, messages, { temperature: 0.3, max_tokens: 4000, source: 'playtester' })
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
     * Track voice (ElevenLabs TTS) character usage during a playtest.
     * Called by audioDirector after each successful TTS segment.
     * @param {number} charCount - Number of characters synthesized
     */
    trackVoiceUsage: function (charCount) {
      if (!this._costTracker) return;
      this._costTracker.voice.calls++;
      this._costTracker.voice.characters += charCount;
    },

    /**
     * Build a formatted cost summary string from accumulated usage data.
     * @returns {string} Markdown-formatted cost breakdown
     */
    getCostSummary: function () {
      if (!this._costTracker) return 'No cost data available.';

      var t = this._costTracker;
      var turns = this._turnCount || 1;
      var totalCost = 0;
      var totalInput = 0;
      var totalOutput = 0;
      var totalCalls = 0;

      // Collect rows
      var rows = [];

      function addRow(label, bucket) {
        var cost = SQ.Pricing ? SQ.Pricing.getCost(bucket.model, bucket.prompt_tokens, bucket.completion_tokens) : null;
        totalCost += cost || 0;
        totalInput += bucket.prompt_tokens;
        totalOutput += bucket.completion_tokens;
        totalCalls += bucket.calls;
        rows.push({
          label: label,
          model: bucket.model,
          calls: bucket.calls,
          input: bucket.prompt_tokens,
          output: bucket.completion_tokens,
          cost: cost
        });
      }

      if (t.writer.calls > 0) addRow('Writer', t.writer);
      if (t.gamemaster.calls > 0) addRow('Game Master', t.gamemaster);
      if (t.skeleton.calls > 0) addRow('Story Outline', t.skeleton);
      if (t.playtester.calls > 0) addRow('Playtester', t.playtester);
      if (t.image.calls > 0) addRow('Image', t.image);

      if (t.voice.calls > 0) {
        var voiceCost = SQ.Pricing ? SQ.Pricing.getElevenLabsCost(t.voice.characters) : 0;
        totalCost += voiceCost;
        rows.push({
          label: 'Voice (TTS)',
          model: 'ElevenLabs',
          calls: t.voice.calls,
          input: t.voice.characters,
          output: 0,
          cost: voiceCost,
          isVoice: true
        });
      }

      // Build summary lines
      var s = '';
      s += 'Total: ' + formatCost(totalCost) + ' over ' + turns + ' turns';
      s += ' (' + formatCost(totalCost / turns) + '/turn avg)\n\n';

      rows.forEach(function (r) {
        s += '- ' + r.label + ' (' + r.model + '): ';
        s += r.calls + ' calls, ';
        if (r.isVoice) {
          s += r.input.toLocaleString() + ' chars, ';
        } else {
          s += r.input.toLocaleString() + ' in / ' + r.output.toLocaleString() + ' out tokens, ';
        }
        s += formatCost(r.cost) + '\n';
      });

      return s;
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
