/**
 * SQ.Playtester — Agentic Playtester module.
 * Plays through the game autonomously, making one LLM call per turn to
 * decide which choice to pick and update its running memory journal.
 * After the playtest ends, generates a structured quality report.
 */
(function () {
  // Pricing per million tokens (input/output) from OpenRouter
  var MODEL_PRICING = {
    'anthropic/claude-sonnet-4':      { input: 3, output: 15 },
    'anthropic/claude-sonnet-4.5':    { input: 3, output: 15 },
    'anthropic/claude-opus-4':        { input: 15, output: 75 },
    'anthropic/claude-opus-4.5':      { input: 15, output: 75 },
    'anthropic/claude-haiku-4.5':     { input: 0.80, output: 4 },
    'google/gemini-2.5-pro':          { input: 1.25, output: 10 },
    'google/gemini-2.5-flash':        { input: 0.15, output: 0.60 },
    'google/gemini-2.0-flash-001':    { input: 0.10, output: 0.40 },
    'openai/gpt-4o':                  { input: 2.50, output: 10 },
    'openai/gpt-4o-mini':             { input: 0.15, output: 0.60 },
    'openai/o3-mini':                 { input: 1.10, output: 4.40 },
    'deepseek/deepseek-chat':         { input: 0.27, output: 1.10 },
    'deepseek/deepseek-r1':           { input: 0.55, output: 2.19 },
    'meta-llama/llama-4-maverick':    { input: 0.50, output: 1.50 },
    'meta-llama/llama-4-scout':       { input: 0.15, output: 0.40 },
    'mistralai/mistral-large-2512':   { input: 2, output: 6 },
    'mistralai/mistral-small-creative-20251216': { input: 0.10, output: 0.30 },
    'mistralai/mistral-small-3.1-24b-instruct-2503': { input: 0.10, output: 0.30 },
    'x-ai/grok-3':                    { input: 3, output: 15 },
    'x-ai/grok-3-mini':              { input: 0.30, output: 0.50 },
    'qwen/qwen3-235b-a22b-07-25':    { input: 0.50, output: 1.50 },
    'qwen/qwen3-32b-04-28':          { input: 0.10, output: 0.30 },
    'cohere/command-r-plus':          { input: 2.50, output: 10 }
  };
  var DEFAULT_PRICING = { input: 3, output: 15 };
  var ELEVENLABS_COST_PER_CHAR = 0.00030; // ~$0.30 per 1K characters

  function calcCost(modelId, promptTokens, completionTokens) {
    var pricing = MODEL_PRICING[modelId] || DEFAULT_PRICING;
    return (promptTokens * pricing.input + completionTokens * pricing.output) / 1000000;
  }

  function formatCost(dollars) {
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
      SQ.API.onUsage = function (modelId, usage, source) {
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
      SQ.API.onUsage = null;

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
      SQ.API.onUsage = null;

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
        var cost = calcCost(bucket.model, bucket.prompt_tokens, bucket.completion_tokens);
        totalCost += cost;
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
      if (t.skeleton.calls > 0) addRow('Skeleton', t.skeleton);
      if (t.playtester.calls > 0) addRow('Playtester', t.playtester);
      if (t.image.calls > 0) addRow('Image', t.image);

      if (t.voice.calls > 0) {
        var voiceCost = t.voice.characters * ELEVENLABS_COST_PER_CHAR;
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
