/**
 * SQ.Screens.Game — Main gameplay screen.
 * Displays passages (with fade-in effect), choices, status bar.
 * Handles the turn loop. Applies the full state_updates schema
 * from design doc Section 6.4.
 */
(function () {
  /** Delay (ms) between each paragraph fade-in. */
  var PARAGRAPH_STAGGER_MS = 120;

  /** Audio debug color palette for dark theme. */
  var DEBUG_COLORS = [
    '#7c6ff0', '#e06070', '#40b8d0', '#e0a030',
    '#60c870', '#d080e0', '#e08050', '#50a0e0'
  ];
  var DEBUG_NARRATION_COLOR = '#6a6a80';
  var _debugColorMap = {};

  SQ.Screens.Game = {
    /** Tracks whether the current render is the initial load (no animation). */
    _isInitialRender: true,

    init: function () {
      var self = this;

      // Choice buttons
      document.querySelectorAll('.btn-choice').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var choiceId = this.getAttribute('data-choice');
          self.makeChoice(choiceId);
        });
      });

      // Rewind button
      document.getElementById('btn-rewind').addEventListener('click', function () {
        SQ.showScreen('rewind');
      });

      // Cancel loading — abort in-flight API call
      document.getElementById('btn-cancel-loading').addEventListener('click', function () {
        SQ.API.abort();
        self.hideLoading();
        self._enableChoices();
      });

      // End playtest button
      document.getElementById('btn-end-playtest').addEventListener('click', function () {
        if (SQ.Playtester && SQ.Playtester.isActive()) {
          SQ.Playtester.stop();
        }
      });

      // Audio playback controls
      document.getElementById('btn-audio-playpause').addEventListener('click', function () {
        SQ.AudioDirector.togglePlayPause();
      });
      document.getElementById('btn-audio-replay').addEventListener('click', function () {
        SQ.AudioDirector.replay();
      });

      // Audio debug overlay — show on debug toggle OR dry-run mode
      document.addEventListener('audiodebug', function (e) {
        if (SQ.PlayerConfig.isAudioDebugEnabled() || SQ.PlayerConfig.isNarrationDryRunEnabled()) {
          self._renderAudioDebug(e.detail);
        }
      });
      document.getElementById('audio-debug-header').addEventListener('click', function () {
        document.getElementById('audio-debug-panel').classList.toggle('collapsed');
      });

      // Game state debug overlay
      document.getElementById('gamestate-debug-header').addEventListener('click', function () {
        document.getElementById('gamestate-debug-panel').classList.toggle('collapsed');
      });
      // Delegated click handler for collapsible sub-sections inside the debug panel
      document.getElementById('gamestate-debug-content').addEventListener('click', function (e) {
        var header = e.target.closest('.gsd-section-header');
        if (header) {
          header.parentElement.classList.toggle('collapsed');
        }
      });

      // UI Designer debug overlay
      document.getElementById('uidesigner-debug-header').addEventListener('click', function () {
        document.getElementById('uidesigner-debug-panel').classList.toggle('collapsed');
      });
      document.getElementById('uidesigner-debug-content').addEventListener('click', function (e) {
        var header = e.target.closest('.gsd-section-header');
        if (header) {
          header.parentElement.classList.toggle('collapsed');
        }
      });
    },

    onShow: function () {
      this._isInitialRender = true;
      this.renderState();

      // Show/hide playtester UI elements
      var endBtn = document.getElementById('btn-end-playtest');
      var turnCounter = document.getElementById('playtester-turn-counter');
      if (SQ.Playtester && SQ.Playtester.isActive()) {
        if (endBtn) endBtn.classList.remove('hidden');
        if (turnCounter) turnCounter.classList.remove('hidden');
      } else {
        if (endBtn) endBtn.classList.add('hidden');
        if (turnCounter) turnCounter.classList.add('hidden');
      }
    },

    onHide: function () {
      SQ.AudioDirector.stop();
      var debugPanel = document.getElementById('audio-debug-panel');
      if (debugPanel) debugPanel.classList.add('hidden');
      var gsDebug = document.getElementById('gamestate-debug-panel');
      if (gsDebug) gsDebug.classList.add('hidden');

      // Stop playtester if navigating away (skip nav since we're already transitioning)
      if (SQ.Playtester && SQ.Playtester.isActive()) {
        SQ.Playtester.stop('navigated_away', { skipNav: true });
      }
    },

    /**
     * Render the current game state to the screen.
     */
    renderState: function () {
      var state = SQ.GameState.get();
      if (!state) return;

      // Title
      document.getElementById('game-title').textContent = state.meta.title || 'SlopQuest';

      // Status bar
      this._renderStatusBar(state);

      // Illustrations temporarily disabled
      this._hideIllustration();

      // Audio controls — show if narration is enabled
      if (SQ.PlayerConfig.isNarrationEnabled()) {
        if (!SQ.AudioDirector.hasPendingOrActive() && state.last_passage) {
          // Re-queue passage for narration on game resume
          SQ.AudioDirector.prepareForPassage(state.last_passage, state);
        }
        if (SQ.AudioDirector.hasPendingOrActive()) {
          SQ.AudioDirector.showControls();
        }
      } else {
        SQ.AudioDirector.hideControls();
      }

      // Hide audio debug panel until next analysis
      var debugPanel = document.getElementById('audio-debug-panel');
      if (debugPanel) debugPanel.classList.add('hidden');

      // Passage (with fade-in on new passages, instant on initial load/rewind)
      this._renderPassage(state.last_passage, !this._isInitialRender);
      this._isInitialRender = false;

      // Choices — hide if game over or story complete
      if (state.game_over || state.story_complete) {
        document.getElementById('choices-container').classList.add('hidden');
      } else if (!state.current_choices) {
        // Legacy: saved game with no choices (e.g. old act-transition save) — regenerate
        this.makeChoice(null);
      } else {
        document.getElementById('choices-container').classList.remove('hidden');
        document.querySelectorAll('.btn-choice').forEach(function (btn) {
          btn.classList.remove('hidden');
        });
        this.renderChoices(state.current_choices, !this._isInitialRender);
        this._hideChoiceStatus();
      }

      // Debug panels
      this._renderGameStateDebug(state);
      this._renderUiDesignerDebug(state);
    },

    /**
     * Render the resource/status bar.
     * Shows health and current act/scene.
     * @private
     */
    _renderStatusBar: function (state) {
      var player = state.player || {};
      var current = state.current || {};
      var meta = state.meta || {};

      // In-game time
      var timeEl = document.getElementById('status-time');
      if (timeEl) {
        var igt = current.in_game_time;
        timeEl.textContent = SQ.GameState.formatTime(igt);
      }

      // Act / Scene
      document.getElementById('status-act').textContent = 'Act ' + (current.act || 1);
      document.getElementById('status-scene').textContent = 'Scene ' + (current.scene_number || 1);
    },

    /**
     * Render passage text into the passage container.
     * Splits on double-newlines into paragraphs.
     * If animate=true, paragraphs fade in with a staggered delay.
     * @private
     */
    _renderPassage: function (text, animate) {
      var passageEl = document.getElementById('passage-text');

      if (!text) return;

      passageEl.innerHTML = '';
      var paragraphs = text.split(/\n\n+/);

      paragraphs.forEach(function (p, i) {
        var trimmed = p.trim();
        if (!trimmed) return;

        var el = document.createElement('p');
        el.textContent = trimmed;

        if (animate) {
          el.classList.add('passage-paragraph-enter');
          // Stagger each paragraph's appearance
          setTimeout(function () {
            el.classList.add('passage-paragraph-visible');
          }, i * PARAGRAPH_STAGGER_MS);
        }

        passageEl.appendChild(el);
      });

      // Scroll passage and page to top when new content arrives
      passageEl.scrollTop = 0;
      window.scrollTo(0, 0);
    },

    /**
     * Render the 4 choice buttons with label badges.
     * Uses the structured .choice-label + .choice-text spans.
     * If animate=true, choices fade in after passage paragraphs.
     */
    renderChoices: function (choices, animate) {
      var labels = ['A', 'B', 'C', 'D'];
      labels.forEach(function (id, i) {
        var btn = document.querySelector('.btn-choice[data-choice="' + id + '"]');
        var labelEl = btn.querySelector('.choice-label');
        var textEl = btn.querySelector('.choice-text');

        if (choices && choices[id]) {
          labelEl.textContent = id;
          textEl.textContent = choices[id].text;
          btn.classList.remove('hidden');
          btn.disabled = false;

          if (animate) {
            btn.classList.add('choice-enter');
            setTimeout(function () {
              btn.classList.remove('choice-enter');
            }, 50 + i * 80);
          }
        } else {
          btn.classList.add('hidden');
        }
      });
    },

    /**
     * Handle a player's choice — the core turn loop.
     *
     * Two-phase flow:
     * 1. Writer call → render passage + greyed-out choices immediately
     * 2. Game Master call → apply state updates, enable choices
     *
     * Choices are DISABLED until the Game Master finishes. The game must never
     * advance to the next turn before state is updated and consequences determined.
     */
    makeChoice: function (choiceId) {
      var self = this;
      var state = SQ.GameState.get();
      if (!state) return;

      // Log the player's choice
      var _choiceObj = state.current_choices && state.current_choices[choiceId];
      SQ.Logger.info('Game', 'Choice made', {
        choiceId: choiceId,
        choiceText: _choiceObj ? (_choiceObj.text || _choiceObj.label) : undefined,
        scene: state.current.scene_number,
        act: state.current.act
      });

      // Disable choice buttons during generation
      document.querySelectorAll('.btn-choice').forEach(function (btn) {
        btn.disabled = true;
      });

      // Push pre-choice snapshot to history (never lose state)
      SQ.HistoryStack.push(
        SQ.GameState.snapshot(),
        state.last_passage,
        choiceId
      );
      SQ.Logger.info('Game', 'History snapshot saved', {
        scene: state.current.scene_number,
        act: state.current.act,
        historyDepth: SQ.HistoryStack.length()
      });

      // Check for terminal choice (game_over, conclusion)
      var terminalType = self._getTerminalType(choiceId, state);
      if (terminalType) {
        self._handleTerminalChoice(choiceId, state, terminalType);
        return;
      }

      self.showLoading();

      // Hide illustrations (disabled for this phase)
      self._hideIllustration();

      SQ.PassageGenerator.generate(state, choiceId).then(function (result) {
        // Phase 1: Writer response is ready — render passage immediately
        var writerResponse = result.writerResponse;
        self.hideLoading();

        // Apply Writer response (passage + choices text + scene number)
        self.applyWriterResponse(state, writerResponse);

        // Render passage with animation
        self._renderPassage(state.last_passage, true);

        // Show choices but DISABLED with "Updating game state..." status
        self.renderChoices(state.current_choices, true);
        self._disableChoicesWithStatus('Updating game state...');

        // Update status bar (scene number incremented)
        self._renderStatusBar(state);

        // Debug panel — show state after Writer (before GM)
        self._renderGameStateDebug(state);

        // Queue Audio Director for on-demand narration
        if (SQ.PlayerConfig.isNarrationEnabled() && writerResponse.passage) {
          SQ.AudioDirector.prepareForPassage(writerResponse.passage, state);
        } else {
          SQ.AudioDirector.stop();
          SQ.AudioDirector.hideControls();
        }

        // Phase 2: Wait for Game Master response
        result.gameMasterPromise.then(function (gmResponse) {
          // Apply Game Master state updates
          self.applyGameMasterResponse(state, gmResponse);

          // Re-render status bar (health may have changed)
          self._renderStatusBar(state);

          // Debug panel — update with GM state changes + choice metadata
          self._renderGameStateDebug(state);

          // Check for game over / story complete (handled inside applyGameMasterResponse)
          if (state.game_over || state.story_complete) {
            return; // Already navigated to gameover screen
          }

          // Enable choices — Game Master is done
          self._enableChoices();
          self._hideChoiceStatus();

          // Playtester auto-play hook
          if (SQ.Playtester && SQ.Playtester.isActive()) {
            SQ.Playtester.onTurnComplete();
          }

        }).catch(function (err) {
          SQ.Logger.error('GameMaster', 'Generation failed', { error: err.message });

          // Show error overlay — choices remain disabled
          SQ.ErrorOverlay.show(err, {
            onRetry: function () {
              // Retry the Game Master call only
              var gmModel = SQ.PlayerConfig.getModel('gamemaster');
              var gmSystem = SQ.GameMasterPrompt.buildSystem(state);
              var gmUser = SQ.GameMasterPrompt.buildUser(state, writerResponse);
              var difficulty = (state.meta && state.meta.difficulty) || 'normal';

              SQ.PassageGenerator._attemptCall(
                gmModel, gmSystem, gmUser,
                { temperature: 0.3, max_tokens: 2500 },
                'GameMaster',
                function (r) { return SQ.StateValidator.validateGameMasterResponse(r, difficulty); },
                0
              ).then(function (gmResponse) {
                SQ.ErrorOverlay.hide();
                self.applyGameMasterResponse(state, gmResponse);
                self._renderStatusBar(state);
                self._renderGameStateDebug(state);
                if (state.game_over || state.story_complete) return;
                self._enableChoices();
                self._hideChoiceStatus();

                // Playtester auto-play hook (GM retry path)
                if (SQ.Playtester && SQ.Playtester.isActive()) {
                  SQ.Playtester.onTurnComplete();
                }
              }).catch(function (retryErr) {
                SQ.Logger.error('GameMaster', 'Retry failed', { error: retryErr.message });
                SQ.ErrorOverlay.show(retryErr, {
                  onRetry: function () {
                    self.makeChoice(choiceId);
                  }
                });
              });
            }
          });
        });

      }).catch(function (err) {
        // Writer call failed — full retry
        self.hideLoading();
        self._enableChoices();
        SQ.Logger.error('Writer', 'Generation failed', { error: err.message });

        SQ.ErrorOverlay.show(err, {
          onRetry: function () {
            self.makeChoice(choiceId);
          }
        });
      });
    },

    /**
     * Apply The Writer's response to game state.
     * Updates passage, choices (text only), and increments scene number.
     */
    applyWriterResponse: function (state, writerResponse) {
      state.last_passage = writerResponse.passage;
      state.current_choices = writerResponse.choices;
      state.current.scene_number = (state.current.scene_number || 0) + 1;
      SQ.GameState.save();
    },

    /**
     * Apply The Game Master's response to game state.
     * Handles the full state_updates schema and choice metadata.
     */
    applyGameMasterResponse: function (state, gmResponse) {
      var updates = gmResponse.state_updates || {};

      // Apply shared state updates (steps 1-11b)
      this._applyStateUpdates(state, updates);

      // 12. Merge choice metadata (outcome, consequence, narration_directive)
      if (gmResponse.choice_metadata && state.current_choices) {
        var keys = ['A', 'B', 'C', 'D'];
        for (var i = 0; i < keys.length; i++) {
          var k = keys[i];
          if (gmResponse.choice_metadata[k] && state.current_choices[k]) {
            Object.assign(state.current_choices[k], gmResponse.choice_metadata[k]);
          }
        }
      }

      // 12b. Guard terminal outcome pre-classifications
      if (state.current_choices) {
        var diffKey = (state.meta && state.meta.difficulty) || 'normal';
        var diffConfig = SQ.DifficultyConfig[diffKey] || SQ.DifficultyConfig.normal;
        var guardKeys = ['A', 'B', 'C', 'D'];

        for (var g = 0; g < guardKeys.length; g++) {
          var gk = guardKeys[g];
          var ch = state.current_choices[gk];
          if (!ch || !ch.outcome) continue;

          // Guard: game_over only on difficulties that allow it
          if (ch.outcome === 'game_over' && !diffConfig.allow_game_over) {
            SQ.Logger.warn('Game', 'Stripped game_over outcome on ' + diffKey, { choice: gk });
            ch.outcome = 'advance_risky';
          }

          // Guard: advances_act only when minimum scene count met
          if (ch.outcome === 'advances_act') {
            var scenesInAct = (state.current.scene_number || 1) - (state.current.act_start_scene || 1) + 1;
            var actIdx = (state.current.act || 1) - 1;
            var tgtScenes = 10;
            if (state.skeleton && Array.isArray(state.skeleton.acts) && state.skeleton.acts[actIdx]) {
              tgtScenes = state.skeleton.acts[actIdx].target_scenes || 10;
            }
            var minRequired = Math.max(3, Math.ceil(tgtScenes * 0.5));
            if (scenesInAct < minRequired) {
              SQ.Logger.warn('Game', 'Stripped premature advances_act outcome', { choice: gk, scenesInAct: scenesInAct, minRequired: minRequired });
              ch.outcome = 'advance_safe';
            }
          }

          // Guard: conclusion only valid in Act 3
          if (ch.outcome === 'conclusion' && (state.current.act || 1) < 3) {
            SQ.Logger.warn('Game', 'Stripped premature conclusion outcome', { choice: gk, act: state.current.act });
            ch.outcome = 'advance_safe';
          }
        }
      }

      // Log GM state updates — build object conditionally to avoid undefined noise
      var _gmLog = {};
      var timeElapsed = updates.time_elapsed || null;
      if (timeElapsed) _gmLog.time = SQ.GameState.formatDuration(timeElapsed);
      if (updates.relationship_changes) {
        var _rc = [];
        for (var _rn in updates.relationship_changes) {
          if (updates.relationship_changes.hasOwnProperty(_rn)) {
            var _rd = updates.relationship_changes[_rn];
            _rc.push(_rn + ': ' + (_rd > 0 ? '+' : '') + _rd);
          }
        }
        if (_rc.length) _gmLog.relationships = _rc.join(', ');
      }
      if (updates.game_over) _gmLog.gameOver = true;
      if (updates.story_complete) _gmLog.storyComplete = true;
      if (typeof updates.proximity_to_climax === 'number') _gmLog.proximity = updates.proximity_to_climax;
      if (updates.advance_act) _gmLog.advanceAct = true;
      if (updates.npc_updates && Object.keys(updates.npc_updates).length) {
        _gmLog.npcUpdates = updates.npc_updates;
      }
      _gmLog.choices = gmResponse.choice_metadata;
      _gmLog.event = updates.event_log_entry;
      SQ.Logger.info('GameMaster', 'Applied state updates', _gmLog);

      // Prevent game_over on difficulties that don't allow it
      var diffKey = (state.meta && state.meta.difficulty) || 'normal';
      var diffConfig = SQ.DifficultyConfig[diffKey] || SQ.DifficultyConfig.normal;
      if (!diffConfig.allow_game_over) {
        updates.game_over = false;
      }

      // 16. Check for game over or story complete
      var isGameOver = updates.game_over;
      var isStoryComplete = updates.story_complete;

      // Guard: story_complete only valid in Act 3
      if (isStoryComplete && (state.current.act || 1) < 3) {
        SQ.Logger.warn('Game', 'Blocked premature story_complete', {
          act: state.current.act,
          scene: state.current.scene_number
        });
        isStoryComplete = false;
        updates.story_complete = false;
      }

      if (isGameOver) {
        SQ.Logger.info('Game', 'Game over', {
          reason: updates.event_log_entry,
          scene: state.current.scene_number,
          act: state.current.act
        });
        state.game_over = true;
        state.game_over_reason = updates.event_log_entry || 'The story has ended.';
        SQ.GameState.save();
        if (SQ.Playtester && SQ.Playtester.isActive()) {
          SQ.Playtester._onGameEnd('game_over');
        }
        SQ.showScreen('gameover');
        return;
      }

      if (isStoryComplete) {
        SQ.Logger.info('Game', 'Story complete', {
          scene: state.current.scene_number,
          act: state.current.act
        });
        state.story_complete = true;
        SQ.GameState.save();
        if (SQ.Playtester && SQ.Playtester.isActive()) {
          SQ.Playtester._onGameEnd('story_complete');
        }
        SQ.showScreen('gameover');
        return;
      }

      SQ.GameState.save();
    },

    /**
     * Re-enable choice buttons after Game Master completes.
     */
    _enableChoices: function () {
      document.querySelectorAll('.btn-choice').forEach(function (btn) {
        btn.disabled = false;
      });
    },

    /**
     * Disable choices and show a status message (e.g., "Updating game state...").
     * @param {string} message - Status text to display
     * @private
     */
    _disableChoicesWithStatus: function (message) {
      document.querySelectorAll('.btn-choice').forEach(function (btn) {
        btn.disabled = true;
      });
      var statusEl = document.getElementById('gm-status');
      if (statusEl) {
        statusEl.textContent = message;
        statusEl.classList.remove('hidden');
      }
    },

    /**
     * Hide the Game Master status message.
     * @private
     */
    _hideChoiceStatus: function () {
      var statusEl = document.getElementById('gm-status');
      if (statusEl) {
        statusEl.classList.add('hidden');
      }
    },

    /**
     * Apply shared state_updates to game state.
     * Extracted from applyGameMasterResponse — used by both normal and finale flows.
     * Handles: player changes, time, event log,
     * world flags, relationships, NPCs, location, act advancement, proximity.
     * @param {object} state - Game state to mutate
     * @param {object} updates - The state_updates object from GM response
     * @private
     */
    _applyStateUpdates: function (state, updates) {
      var timeElapsed = updates.time_elapsed || null;

      // 1. Player changes (inventory — replace semantics)
      if (updates.player_changes) {
        var pc = updates.player_changes;
        if (Array.isArray(pc.inventory)) state.player.inventory = pc.inventory;
      }

      // 2. Advance in-game clock
      if (timeElapsed) {
        SQ.GameState.advanceTime(timeElapsed);
      }

      // 4. Event log entry
      if (updates.event_log_entry) {
        state.event_log.push(updates.event_log_entry);
      }

      // 8. World flag changes
      if (updates.world_flag_changes) {
        Object.assign(state.world_flags, updates.world_flag_changes);
      }

      // 9. Relationship changes (deltas, not absolutes)
      if (updates.relationship_changes) {
        for (var name in updates.relationship_changes) {
          if (updates.relationship_changes.hasOwnProperty(name)) {
            var delta = updates.relationship_changes[name];
            state.relationships[name] = (state.relationships[name] || 0) + delta;
            state.relationships[name] = Math.max(-100, Math.min(100, state.relationships[name]));
          }
        }
      }

      // 9b. NPC overrides (merge updates into mutable NPC layer)
      if (updates.npc_updates) {
        if (!state.npc_overrides) state.npc_overrides = {};
        for (var npcName in updates.npc_updates) {
          if (updates.npc_updates.hasOwnProperty(npcName)) {
            if (!state.npc_overrides[npcName]) {
              state.npc_overrides[npcName] = {};
            }
            Object.assign(state.npc_overrides[npcName], updates.npc_updates[npcName]);
          }
        }
      }

      // 10. Scene context update
      if (updates.new_scene_context) {
        state.current.scene_context = updates.new_scene_context;
      }

      // 10b. Location and time of day
      if (updates.location) {
        state.current.location = updates.location;
      }
      if (updates.time_of_day) {
        state.current.time_of_day = updates.time_of_day;
      }

      // 11. Act advancement — with client-side guards
      if (updates.advance_act) {
        var scenesInAct = (state.current.scene_number || 1) - (state.current.act_start_scene || 1) + 1;
        var currentActIndex = (state.current.act || 1) - 1;
        var targetScenes = 10;
        if (state.skeleton && Array.isArray(state.skeleton.acts) && state.skeleton.acts[currentActIndex]) {
          targetScenes = state.skeleton.acts[currentActIndex].target_scenes || 10;
        }
        var minScenes = Math.max(3, Math.ceil(targetScenes * 0.5));

        if (scenesInAct < minScenes) {
          SQ.Logger.warn('Game', 'Blocked premature act advancement', {
            act: state.current.act,
            scenesInAct: scenesInAct,
            minRequired: minScenes,
            targetScenes: targetScenes
          });
          if (typeof updates.proximity_to_climax === 'number' && updates.proximity_to_climax >= 1.0) {
            updates.proximity_to_climax = 0.85;
          }
          updates.advance_act = false;
        } else {
          state.current.act = Math.min((state.current.act || 1) + 1, 3);
          state.current.proximity_to_climax = 0.0;
          state.current.act_start_scene = state.current.scene_number;
          if (state.skeleton && Array.isArray(state.skeleton.acts)) {
            var newAct = state.skeleton.acts[state.current.act - 1];
            if (newAct && Array.isArray(newAct.locked_constraints)) {
              state.current.active_constraints = newAct.locked_constraints.slice();
            }
          }
          SQ.Logger.info('Game', 'Act advanced', {
            newAct: state.current.act,
            scene: state.current.scene_number,
            scenesInPreviousAct: scenesInAct,
            constraints: state.current.active_constraints
          });
        }
      }

      // 11b. Apply proximity_to_climax from GM (skip if act just advanced — reset takes precedence)
      if (!updates.advance_act && typeof updates.proximity_to_climax === 'number') {
        state.current.proximity_to_climax = Math.max(0, Math.min(1, updates.proximity_to_climax));
      }
    },

    /**
     * Check if a choice has a terminal outcome type.
     * @param {string} choiceId - A/B/C/D
     * @param {object} state - Game state
     * @returns {string|null} Terminal type or null
     * @private
     */
    _getTerminalType: function (choiceId, state) {
      var choice = state.current_choices && state.current_choices[choiceId];
      if (!choice || !choice.outcome) return null;
      var outcome = choice.outcome;
      if (outcome === 'game_over' || outcome === 'conclusion') {
        return outcome;
      }
      return null;
    },

    /**
     * Handle a terminal choice: GM-finale then Writer-finale, no forward choices.
     * @param {string} choiceId - A/B/C/D
     * @param {object} state - Game state
     * @param {string} terminalType - 'game_over' or 'conclusion'
     * @private
     */
    _handleTerminalChoice: function (choiceId, state, terminalType) {
      var self = this;

      SQ.Logger.info('Game', 'Terminal choice selected', {
        choiceId: choiceId,
        terminalType: terminalType,
        scene: state.current.scene_number,
        act: state.current.act
      });

      self.showLoading();
      self._hideIllustration();

      SQ.PassageGenerator.generateFinale(state, choiceId, terminalType).then(function (result) {
        self.hideLoading();

        // Apply GM finale state updates (no choice_metadata)
        self._applyStateUpdates(state, result.gmResponse.state_updates || {});

        // Store finale passage and clear choices
        state.last_passage = result.writerResponse.passage;
        state.current_choices = null;
        SQ.GameState.save();

        // Render the finale passage
        self._renderPassage(state.last_passage, true);

        // Hide choice buttons
        document.querySelectorAll('.btn-choice').forEach(function (btn) {
          btn.classList.add('hidden');
        });

        // Update status bar and debug panel
        self._renderStatusBar(state);
        self._renderGameStateDebug(state);

        // Audio narration
        if (SQ.PlayerConfig.isNarrationEnabled() && result.writerResponse.passage) {
          SQ.AudioDirector.prepareForPassage(result.writerResponse.passage, state);
        }

        // Route to appropriate UI transition
        if (terminalType === 'game_over') {
          state.game_over = true;
          state.game_over_reason = (result.gmResponse.state_updates && result.gmResponse.state_updates.event_log_entry) || 'The story has ended.';
          SQ.GameState.save();
          if (SQ.Playtester && SQ.Playtester.isActive()) {
            SQ.Playtester._onGameEnd('game_over');
          }
          // Navigate to gameover after reading delay handled by gameover screen
          SQ.showScreen('gameover');

        } else if (terminalType === 'conclusion') {
          state.story_complete = true;
          SQ.GameState.save();
          if (SQ.Playtester && SQ.Playtester.isActive()) {
            SQ.Playtester._onGameEnd('story_complete');
          }
          SQ.showScreen('gameover');
        }

      }).catch(function (err) {
        self.hideLoading();
        self._enableChoices();
        SQ.Logger.error('Finale', 'Generation failed', { error: err.message });
        SQ.ErrorOverlay.show(err, {
          onRetry: function () {
            self._handleTerminalChoice(choiceId, state, terminalType);
          }
        });
      });
    },

    /**
     * Render the game state debug panel if enabled.
     * Shows formatted sections for player, position, choices, skeleton, etc.
     * Called after Writer response, after GM response, and on renderState (load/rewind).
     * @param {object} state - Current game state
     * @private
     */
    _renderGameStateDebug: function (state) {
      var panel = document.getElementById('gamestate-debug-panel');
      if (!panel) return;

      if (!SQ.PlayerConfig.isGameStateDebugEnabled()) {
        panel.classList.add('hidden');
        return;
      }

      panel.classList.remove('hidden');
      var self = this;
      var html = '';
      var meta = state.meta || {};
      var player = state.player || {};
      var current = state.current || {};

      // 1. Meta
      var metaBody = '';
      metaBody += self._gsdRow('Title', self._esc(meta.title || '—'));
      metaBody += self._gsdRow('Setting', self._esc(meta.setting || '—'));
      metaBody += self._gsdRow('Style &amp; Tone', self._esc(meta.writing_style || meta.tone || '—'));
      metaBody += self._gsdRow('Perspective', self._esc(meta.perspective || '—'));
      metaBody += self._gsdRow('Tense', self._esc(meta.tense || '—'));
      metaBody += self._gsdRow('Difficulty', self._esc(meta.difficulty || '—'));
      metaBody += self._gsdRow('Story Length', self._esc(meta.story_length || '—'));
      html += self._gsdSection('Meta', metaBody, false);

      // 2. Game Status
      var statusBody = '';
      var goClass = state.game_over ? 'gsd-dot-off' : 'gsd-dot-on';
      statusBody += self._gsdRow('game_over', '<span class="gsd-dot ' + goClass + '"></span>' + (state.game_over ? 'true' : 'false'));
      if (state.game_over_reason) statusBody += self._gsdRow('game_over_reason', self._esc(state.game_over_reason));
      if ('story_complete' in state) {
        var scClass = state.story_complete ? 'gsd-dot-on' : 'gsd-dot-off';
        statusBody += self._gsdRow('story_complete', '<span class="gsd-dot ' + scClass + '"></span>' + (state.story_complete ? 'true' : 'false'));
      }
      if (state.last_passage) {
        var preview = state.last_passage.length > 120 ? state.last_passage.substring(0, 120) + '...' : state.last_passage;
        statusBody += self._gsdRow('last_passage', self._esc(preview));
      }
      if (state.illustration_prompt) statusBody += self._gsdRow('illustration_prompt', self._esc(state.illustration_prompt));
      html += self._gsdSection('Game Status', statusBody, false);

      // 3. Player
      var playerBody = '';
      playerBody += self._gsdRow('Name', self._esc(player.name || '—'));
      playerBody += self._gsdRow('Archetype', self._esc(player.archetype || '—'));
      if (player.inventory && player.inventory.length) {
        playerBody += self._gsdRow('Inventory', self._gsdList(player.inventory));
      } else {
        playerBody += self._gsdRow('Inventory', '[]');
      }
      html += self._gsdSection('Player', playerBody, false);

      // 4. Position
      var posBody = '';
      posBody += self._gsdRow('Act / Scene', 'Act ' + (current.act || 1) + ' / Scene ' + (current.scene_number || 1));
      posBody += self._gsdRow('Location', self._esc(current.location || '—'));
      posBody += self._gsdRow('Time of Day', self._esc(current.time_of_day || '—'));
      posBody += self._gsdRow('In-Game Time', SQ.GameState.formatTime(current.in_game_time));
      posBody += self._gsdRow('Context', self._esc(current.scene_context || '—'));
      posBody += self._gsdRow('Climax Proximity', typeof current.proximity_to_climax === 'number' ? current.proximity_to_climax : '—');
      if (current.active_constraints && current.active_constraints.length) {
        posBody += self._gsdRow('Constraints', self._gsdList(current.active_constraints));
      } else {
        posBody += self._gsdRow('Constraints', '[]');
      }
      html += self._gsdSection('Position', posBody, false);

      // 6. Relationships
      var rels = state.relationships || {};
      var relNames = Object.keys(rels);
      var relBody = '';
      if (relNames.length) {
        relNames.forEach(function (name) {
          var val = rels[name];
          var cls = val > 0 ? 'gsd-rel-pos' : val < 0 ? 'gsd-rel-neg' : 'gsd-rel-zero';
          var sign = val > 0 ? '+' : '';
          relBody += self._gsdRow(self._esc(name), '<span class="' + cls + '">' + sign + val + '</span>');
        });
      } else {
        relBody = '<div class="gsd-row"><span class="gsd-value" style="opacity:0.5">(none)</span></div>';
      }
      html += self._gsdSection('Relationships', relBody, false);

      // 6b. NPC Roster (live merged data from skeleton + overrides)
      var roster = SQ.GameState.getNpcRoster();
      var overrides = state.npc_overrides || {};
      var rosterBody = '';
      if (roster.length) {
        roster.forEach(function (npc) {
          rosterBody += '<div style="padding:3px 0;border-top:1px solid rgba(42,42,58,0.3)">';
          rosterBody += '<strong>' + self._esc(npc.name || '?') + '</strong> — ' + self._esc(npc.role || '');
          rosterBody += ' ' + self._gsdTag(npc.source, 'info');
          if (npc.source === 'skeleton' && overrides[npc.name]) {
            rosterBody += ' ' + self._gsdTag('modified', 'risky');
          }
          rosterBody += '<br>';
          var compDot = npc.companion ? 'gsd-dot-on' : 'gsd-dot-off';
          rosterBody += '<span class="gsd-label">Companion:</span> <span class="gsd-dot ' + compDot + '"></span>' + (npc.companion ? 'yes' : 'no') + '<br>';
          if (npc.motivation) rosterBody += '<span class="gsd-label">Motivation:</span> ' + self._esc(npc.motivation) + '<br>';
          if (npc.allegiance) rosterBody += '<span class="gsd-label">Allegiance:</span> ' + self._esc(npc.allegiance) + '<br>';
          if (npc.secret) {
            rosterBody += '<span class="gsd-label">Secret:</span> <em>' + self._esc(npc.secret) + '</em>';
            if (npc.secret_revealed) rosterBody += ' ' + self._gsdTag('revealed', 'danger');
            rosterBody += '<br>';
          }
          if (npc.notes) rosterBody += '<span class="gsd-label">Notes:</span> ' + self._esc(npc.notes) + '<br>';
          rosterBody += '</div>';
        });
      } else {
        rosterBody = '<div class="gsd-row"><span class="gsd-value" style="opacity:0.5">(none)</span></div>';
      }
      html += self._gsdSection('NPC Roster', rosterBody, false);

      // 7. Choices + metadata
      var choices = state.current_choices || {};
      var choiceKeys = ['A', 'B', 'C', 'D'];
      var choiceBody = '';
      for (var ci = 0; ci < choiceKeys.length; ci++) {
        var ck = choiceKeys[ci];
        var ch = choices[ck];
        if (!ch) continue;
        choiceBody += '<div class="gsd-choice">';
        choiceBody += '<div class="gsd-choice-header">';
        choiceBody += '<span class="gsd-choice-letter">' + ck + '</span>';
        choiceBody += '<span class="gsd-choice-text">' + self._esc(ch.text || '') + '</span>';
        choiceBody += '</div>';
        if (ch.outcome) {
          choiceBody += '<div class="gsd-choice-meta">';
          choiceBody += self._gsdTag(ch.outcome, self._gsdOutcomeType(ch.outcome));
          if (ch.consequence) choiceBody += ' ' + self._esc(ch.consequence);
          choiceBody += '</div>';
          if (ch.narration_directive) {
            choiceBody += '<div class="gsd-choice-meta">Directive: ' + self._esc(ch.narration_directive) + '</div>';
          }
        } else {
          choiceBody += '<div class="gsd-pending">[awaiting Game Master]</div>';
        }
        choiceBody += '</div>';
      }
      if (!choiceBody) choiceBody = '<div class="gsd-row"><span class="gsd-value" style="opacity:0.5">(none)</span></div>';
      html += self._gsdSection('Choices', choiceBody, false);

      // 8. World Flags
      var flags = state.world_flags || {};
      var flagKeys = Object.keys(flags);
      var flagBody = '';
      if (flagKeys.length) {
        flagKeys.forEach(function (f) {
          var dotCls = flags[f] ? 'gsd-dot-on' : 'gsd-dot-off';
          flagBody += self._gsdRow('<span class="gsd-dot ' + dotCls + '"></span>' + self._esc(f), flags[f] ? 'true' : 'false');
        });
      } else {
        flagBody = '<div class="gsd-row"><span class="gsd-value" style="opacity:0.5">(none)</span></div>';
      }
      html += self._gsdSection('World Flags', flagBody, true);

      // 10. Event Log (full)
      var log = state.event_log || [];
      var logBody = '';
      if (log.length) {
        logBody = '<ol class="gsd-list" style="list-style:decimal">';
        log.forEach(function (entry) {
          logBody += '<li>' + self._esc(typeof entry === 'string' ? entry : JSON.stringify(entry)) + '</li>';
        });
        logBody += '</ol>';
      } else {
        logBody = '<div class="gsd-row"><span class="gsd-value" style="opacity:0.5">(empty)</span></div>';
      }
      html += self._gsdSection('Event Log', logBody, true);

      // 11. Backstory Summary
      var bsBody = state.backstory_summary
        ? self._gsdRow('Summary', self._esc(state.backstory_summary))
        : '<div class="gsd-row"><span class="gsd-value" style="opacity:0.5">(empty)</span></div>';
      html += self._gsdSection('Backstory Summary', bsBody, true);

      // 12. Skeleton (collapsed by default)
      var skel = state.skeleton;
      if (skel) {
        var skelBody = '';
        if (skel.premise) skelBody += self._gsdRow('Premise', self._esc(skel.premise));
        if (skel.central_question) skelBody += self._gsdRow('Central Question', self._esc(skel.central_question));
        if (skel.ending_shape) skelBody += self._gsdRow('Ending Shape', self._esc(skel.ending_shape));

        if (skel.setting) {
          skelBody += self._gsdRow('Setting', '<strong>' + self._esc(skel.setting.name || '') + '</strong> — ' + self._esc(skel.setting.description || ''));
          if (skel.setting.tone_notes) skelBody += self._gsdRow('Tone', self._esc(skel.setting.tone_notes));
        }

        // Acts
        if (Array.isArray(skel.acts)) {
          skel.acts.forEach(function (act) {
            var actHtml = '';
            actHtml += self._gsdRow('Description', self._esc(act.description || ''));
            actHtml += self._gsdRow('End Condition', self._esc(act.end_condition || ''));
            actHtml += self._gsdRow('Target Scenes', act.target_scenes || '?');
            if (act.locked_constraints && act.locked_constraints.length) {
              actHtml += self._gsdRow('Constraints', self._gsdList(act.locked_constraints));
            }
            if (act.key_beats && act.key_beats.length) {
              actHtml += self._gsdRow('Key Beats', self._gsdList(act.key_beats));
            }
            skelBody += self._gsdSection('Act ' + (act.act_number || '?') + ': ' + self._esc(act.title || ''), actHtml, true);
          });
        }

        // NPCs
        if (Array.isArray(skel.npcs) && skel.npcs.length) {
          var npcHtml = '';
          skel.npcs.forEach(function (npc) {
            npcHtml += '<div style="padding:3px 0;border-top:1px solid rgba(42,42,58,0.3)">';
            npcHtml += '<strong>' + self._esc(npc.name || '?') + '</strong> — ' + self._esc(npc.role || '') + '<br>';
            if (npc.motivation) npcHtml += '<span class="gsd-label">Motivation:</span> ' + self._esc(npc.motivation) + '<br>';
            if (npc.allegiance) npcHtml += '<span class="gsd-label">Allegiance:</span> ' + self._esc(npc.allegiance) + '<br>';
            if (npc.secret) npcHtml += '<span class="gsd-label">Secret:</span> <em>' + self._esc(npc.secret) + '</em><br>';
            npcHtml += '</div>';
          });
          skelBody += self._gsdSection('NPCs', npcHtml, true);
        }

        // Factions
        if (Array.isArray(skel.factions) && skel.factions.length) {
          var facHtml = '';
          skel.factions.forEach(function (fac) {
            facHtml += self._gsdRow(self._esc(fac.name || '?'), self._esc(fac.description || '') + (fac.goals ? ' — Goals: ' + self._esc(fac.goals) : ''));
          });
          skelBody += self._gsdSection('Factions', facHtml, true);
        }

        // World Rules
        if (Array.isArray(skel.world_rules) && skel.world_rules.length) {
          skelBody += self._gsdRow('World Rules', self._gsdList(skel.world_rules));
        }

        html += self._gsdSection('Skeleton', skelBody, true);
      }

      var contentEl = document.getElementById('gamestate-debug-content');
      if (contentEl) {
        contentEl.innerHTML = html;
      }
    },

    // -- Debug panel helpers --

    _gsdSection: function (title, bodyHtml, collapsed) {
      return '<div class="gsd-section' + (collapsed ? ' collapsed' : '') + '">'
        + '<div class="gsd-section-header">'
        + '<span class="gsd-section-arrow">&#9660;</span>'
        + title
        + '</div>'
        + '<div class="gsd-section-body">' + bodyHtml + '</div>'
        + '</div>';
    },

    _gsdRow: function (label, value) {
      return '<div class="gsd-row"><span class="gsd-label">' + label + '</span><span class="gsd-value">' + value + '</span></div>';
    },

    _gsdTag: function (text, type) {
      return '<span class="gsd-tag gsd-tag-' + type + '">' + this._esc(text) + '</span>';
    },

    _gsdList: function (items) {
      if (!items || !items.length) return '—';
      var self = this;
      var html = '<ul class="gsd-list">';
      items.forEach(function (item) {
        html += '<li>' + self._esc(typeof item === 'string' ? item : JSON.stringify(item)) + '</li>';
      });
      html += '</ul>';
      return html;
    },

    _gsdOutcomeType: function (outcome) {
      if (!outcome) return 'muted';
      if (outcome === 'advance_safe') return 'safe';
      if (outcome === 'advance_risky') return 'risky';
      if (outcome === 'death' || outcome === 'severe_penalty') return 'danger';
      if (outcome === 'hidden_benefit') return 'info';
      return 'muted';
    },

    /**
     * Render the UI Designer debug panel showing the active theme.
     * @private
     */
    _renderUiDesignerDebug: function (state) {
      var panel = document.getElementById('uidesigner-debug-panel');
      if (!panel) return;

      if (!SQ.PlayerConfig.isUiDesignerDebugEnabled()) {
        panel.classList.add('hidden');
        return;
      }

      var theme = state.ui_theme;
      if (!theme) {
        panel.classList.add('hidden');
        return;
      }

      panel.classList.remove('hidden');
      var self = this;
      var html = '';

      // Colors
      var colorsBody = '';
      if (theme.colors) {
        Object.keys(theme.colors).forEach(function (key) {
          var hex = theme.colors[key] || '—';
          var swatch = hex !== '—'
            ? '<span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:' + self._esc(hex) + ';vertical-align:middle;margin-right:4px;border:1px solid rgba(255,255,255,0.2);"></span>'
            : '';
          colorsBody += self._gsdRow(key, swatch + self._esc(hex));
        });
      }
      html += self._gsdSection('Colors', colorsBody, false);

      // Fonts
      var fontsBody = '';
      if (theme.fonts) {
        fontsBody += self._gsdRow('Title', self._esc(theme.fonts.title || '—'));
        fontsBody += self._gsdRow('Body', self._esc(theme.fonts.body || '—'));
        fontsBody += self._gsdRow('UI', self._esc(theme.fonts.ui || '—'));
      }
      html += self._gsdSection('Fonts', fontsBody, false);

      // Glow & Filter
      var effectsBody = '';
      effectsBody += self._gsdRow('Glow', self._esc(theme.glow_color || 'none'));
      effectsBody += self._gsdRow('CSS Filter', self._esc(theme.css_filter || 'none'));
      html += self._gsdSection('Effects', effectsBody, false);

      // Decorations
      var decoBody = '';
      var deco = theme.decorations || {};
      decoBody += self._gsdRow('Side Border SVG', deco.side_border_svg ? self._gsdTag('present', 'safe') : self._gsdTag('none', 'muted'));
      decoBody += self._gsdRow('Header Decoration', deco.header_decoration_svg ? self._gsdTag('present', 'safe') : self._gsdTag('none', 'muted'));
      decoBody += self._gsdRow('Divider SVG', deco.divider_svg ? self._gsdTag('present', 'safe') : self._gsdTag('none', 'muted'));
      decoBody += self._gsdRow('Background Pattern', deco.background_pattern_svg ? self._gsdTag('present', 'safe') : self._gsdTag('none', 'muted'));
      decoBody += self._gsdRow('Choice Icon Shape', self._esc(deco.choice_icon_shape || 'default'));
      decoBody += self._gsdRow('Card Border', self._esc(deco.card_border_style || 'none'));
      decoBody += self._gsdRow('Header Border', self._esc(deco.header_border_style || 'none'));
      html += self._gsdSection('Decorations', decoBody, false);

      // Raw JSON
      var rawBody = '<pre style="white-space:pre-wrap;word-break:break-word;padding:6px;margin:0;font-size:0.6875rem;">' + self._esc(JSON.stringify(theme, null, 2)) + '</pre>';
      html += self._gsdSection('Raw Theme JSON', rawBody, true);

      var contentEl = document.getElementById('uidesigner-debug-content');
      if (contentEl) {
        contentEl.innerHTML = html;
      }
    },

    _esc: function (str) {
      if (typeof str !== 'string') return String(str);
      var div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    },

    /**
     * Show an illustration with fade-in.
     * @param {string} imageUrl - Data URL or remote URL for the image
     * @param {boolean} animate - Whether to animate the reveal
     * @private
     */
    _showIllustration: function (imageUrl, animate) {
      var container = document.getElementById('illustration-container');
      var img = document.getElementById('illustration-image');

      container.classList.remove('hidden', 'illustration-loading', 'illustration-visible');
      img.src = imageUrl;

      if (animate) {
        // Force reflow, then add visible class for CSS transition
        void container.offsetWidth;
        container.classList.add('illustration-visible');
      } else {
        container.classList.add('illustration-visible');
      }
    },

    /**
     * Show illustration container in loading state (placeholder).
     * @private
     */
    _showIllustrationLoading: function () {
      var container = document.getElementById('illustration-container');
      container.classList.remove('hidden', 'illustration-visible');
      container.classList.add('illustration-loading');
    },

    /**
     * Hide the illustration container.
     * @private
     */
    _hideIllustration: function () {
      var container = document.getElementById('illustration-container');
      container.classList.add('hidden');
      container.classList.remove('illustration-visible', 'illustration-loading');
    },

    // ========================================================
    // AUDIO DEBUG OVERLAY
    // ========================================================

    _getDebugColor: function (speaker) {
      if (!speaker || speaker === 'Narrator') return DEBUG_NARRATION_COLOR;
      if (_debugColorMap[speaker]) return _debugColorMap[speaker];
      var idx = Object.keys(_debugColorMap).length;
      _debugColorMap[speaker] = DEBUG_COLORS[idx % DEBUG_COLORS.length];
      return _debugColorMap[speaker];
    },

    _escapeHtml: function (str) {
      var div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    },

    _renderAudioDebug: function (detail) {
      var panel = document.getElementById('audio-debug-panel');
      var castEl = document.getElementById('audio-debug-cast');
      if (!panel || !castEl) return;

      var segments = detail.segments || [];
      var registry = detail.registry || {};

      // Build voice catalog lookup by voice_id
      var voiceCatalog = {};
      (detail.availableVoices || []).forEach(function (v) {
        voiceCatalog[v.voice_id] = v;
      });

      _debugColorMap = {};

      // Collect unique speakers in appearance order
      var speakers = [];
      var seen = {};
      segments.forEach(function (seg) {
        // Support both old format (type+speaker) and new format (speaker only)
        var name;
        if (seg.speaker) {
          name = (seg.speaker === 'narrator') ? 'Narrator' : seg.speaker;
        } else {
          name = (seg.type === 'dialogue' && seg.speaker) ? seg.speaker : 'Narrator';
        }
        if (!seen[name]) {
          seen[name] = true;
          speakers.push(name);
        }
      });

      // Build cast list
      castEl.innerHTML = '';
      var self = this;
      speakers.forEach(function (name) {
        var color = self._getDebugColor(name);
        var regKey = (name === 'Narrator') ? '__narrator__' : name;
        var entry = registry[regKey] || {};

        var row = document.createElement('div');
        row.className = 'audio-debug-character';

        var dot = document.createElement('span');
        dot.className = 'audio-debug-color-dot';
        dot.style.backgroundColor = color;

        var info = document.createElement('div');
        info.className = 'audio-debug-character-info';

        var nameEl = document.createElement('span');
        nameEl.className = 'audio-debug-character-name';
        nameEl.textContent = name;
        nameEl.style.color = color;
        info.appendChild(nameEl);

        if (entry.voice_name) {
          var voiceEl = document.createElement('span');
          voiceEl.className = 'audio-debug-voice-name';
          voiceEl.textContent = 'Voice: ' + entry.voice_name;
          info.appendChild(voiceEl);
        }

        if (entry.description) {
          var descEl = document.createElement('span');
          descEl.className = 'audio-debug-voice-desc';
          descEl.textContent = 'Casting: ' + entry.description;
          info.appendChild(descEl);
        }

        // Show the ElevenLabs voice catalog entry for the chosen voice
        if (entry.voice_id && voiceCatalog[entry.voice_id]) {
          var catVoice = voiceCatalog[entry.voice_id];
          var catLabels = catVoice.labels || {};
          var catParts = [];
          if (catVoice.name) catParts.push('"' + catVoice.name + '"');
          var traits = [catLabels.gender, catLabels.age, catLabels.accent].filter(Boolean).join(', ');
          if (traits) catParts.push(traits);
          if (catLabels.use_case) catParts.push(catLabels.use_case);
          var catStr = catParts.join(' | ');
          if (catStr) {
            var catEl = document.createElement('span');
            catEl.className = 'audio-debug-voice-desc';
            catEl.textContent = 'Catalog: ' + catStr;
            info.appendChild(catEl);
          }
          // Show the full ElevenLabs voice description blurb
          if (catVoice.description) {
            var blurbEl = document.createElement('span');
            blurbEl.className = 'audio-debug-voice-desc';
            blurbEl.textContent = 'ElevenLabs: ' + catVoice.description;
            info.appendChild(blurbEl);
          }
        }

        // Show LLM casting justification
        if (entry.justification) {
          var justEl = document.createElement('span');
          justEl.className = 'audio-debug-voice-desc';
          justEl.textContent = 'Justification: ' + entry.justification;
          info.appendChild(justEl);
        }

        // Show voice_description from LLM analysis for dialogue speakers
        var llmDesc = null;
        segments.forEach(function (seg) {
          if (seg.speaker === name && seg.voice_description && !llmDesc) {
            llmDesc = seg.voice_description;
          }
        });
        if (llmDesc && llmDesc !== (entry.description || '')) {
          var llmEl = document.createElement('span');
          llmEl.className = 'audio-debug-voice-desc';
          llmEl.textContent = 'LLM requested: ' + llmDesc;
          info.appendChild(llmEl);
        }

        row.appendChild(dot);
        row.appendChild(info);
        castEl.appendChild(row);
      });

      // Render segment list
      var segEl = document.getElementById('audio-debug-segments');
      if (segEl) {
        segEl.innerHTML = '';
        var segTitle = document.createElement('div');
        segTitle.className = 'audio-debug-segments-title';
        segTitle.textContent = 'Segments (' + segments.length + ')';
        segEl.appendChild(segTitle);

        var TRUNCATE_LEN = 200;

        segments.forEach(function (seg, i) {
          var segSpeaker;
          if (seg.speaker) {
            segSpeaker = (seg.speaker === 'narrator') ? 'Narrator' : seg.speaker;
          } else {
            segSpeaker = (seg.type === 'dialogue' && seg.speaker) ? seg.speaker : 'Narrator';
          }
          var segText = (seg.text || '').trim();
          var segColor = self._getDebugColor(segSpeaker === 'Narrator' ? null : segSpeaker);

          var row = document.createElement('div');
          row.className = 'audio-debug-segment-row';

          var header = document.createElement('div');
          header.className = 'audio-debug-segment-header';

          var indexSpan = document.createElement('span');
          indexSpan.className = 'audio-debug-segment-index';
          indexSpan.textContent = '[' + i + ']';
          header.appendChild(indexSpan);

          var nameSpan = document.createElement('span');
          nameSpan.style.color = segColor;
          nameSpan.textContent = segSpeaker;
          header.appendChild(nameSpan);

          var charsSpan = document.createElement('span');
          charsSpan.className = 'audio-debug-segment-chars';
          charsSpan.textContent = '(' + segText.length + ' chars)';
          header.appendChild(charsSpan);

          row.appendChild(header);

          var textEl = document.createElement('div');
          textEl.className = 'audio-debug-segment-text';
          var isTruncated = segText.length > TRUNCATE_LEN;
          textEl.textContent = isTruncated ? segText.substring(0, TRUNCATE_LEN) + '...' : segText;
          if (isTruncated) {
            textEl.classList.add('truncated');
            textEl.addEventListener('click', (function (fullText, el) {
              return function () {
                if (el.classList.contains('truncated')) {
                  el.textContent = fullText;
                  el.classList.remove('truncated');
                } else {
                  el.textContent = fullText.substring(0, TRUNCATE_LEN) + '...';
                  el.classList.add('truncated');
                }
              };
            })(segText, textEl));
          }
          row.appendChild(textEl);

          // Render TTS call preview if available
          if (detail.ttsPreview && detail.ttsPreview[i]) {
            var preview = detail.ttsPreview[i];

            var voiceLine = document.createElement('div');
            voiceLine.className = 'audio-debug-voice-desc';
            voiceLine.textContent = 'Voice: ' + preview.voiceName + ' | Mode: ' + preview.mode;
            row.appendChild(voiceLine);

            if (preview.previousText) {
              var prevLine = document.createElement('div');
              prevLine.className = 'audio-debug-voice-desc';
              prevLine.textContent = 'previous_text: ' + preview.previousText;
              row.appendChild(prevLine);
            }

            if (preview.nextText) {
              var nextLine = document.createElement('div');
              nextLine.className = 'audio-debug-voice-desc';
              nextLine.textContent = 'next_text: ' + preview.nextText;
              row.appendChild(nextLine);
            }
          }

          segEl.appendChild(row);
        });
      }

      panel.classList.remove('hidden');
      this._highlightPassage(detail.ttsSegments || []);
    },

    _highlightPassage: function (ttsSegments) {
      var state = SQ.GameState.get();
      if (!state || !state.last_passage) return;

      var fullText = state.last_passage;
      var self = this;

      // Build ranges from actual TTS segments (exact text sent to ElevenLabs)
      var ranges = [];
      var cursor = 0;
      ttsSegments.forEach(function (seg) {
        var text = (seg.text || '').trim();
        if (!text) return;
        var speaker = (seg.speaker === 'Narrator' || seg.speaker === 'narrator') ? null : seg.speaker;
        // Split merged segments on paragraph breaks to match each part individually
        var parts = text.split(/\n\n+/);
        parts.forEach(function (part) {
          var needle = part.trim();
          if (!needle) return;
          var match = self._findSegmentInText(needle, fullText, cursor);
          if (match) {
            ranges.push({ start: match.start, end: match.end, speaker: speaker });
            cursor = match.end;
          }
        });
      });

      // Build the full highlighted HTML
      var html = '';
      var pos = 0;
      ranges.forEach(function (r) {
        if (r.start > pos) {
          html += self._escapeHtml(fullText.substring(pos, r.start));
        }
        var color = self._getDebugColor(r.speaker);
        var speakerAttr = self._escapeHtml(r.speaker || 'Narrator');
        html += '<span data-speaker="' + speakerAttr + '" style="color:' + color + '">';
        html += self._escapeHtml(fullText.substring(Math.max(r.start, pos), r.end));
        html += '</span>';
        pos = r.end;
      });
      if (pos < fullText.length) {
        html += self._escapeHtml(fullText.substring(pos));
      }

      // Split on double newlines to preserve paragraph structure
      var passageEl = document.getElementById('passage-text');
      passageEl.innerHTML = '';
      var parts = html.split(/\n\n+/);
      parts.forEach(function (part) {
        var trimmed = part.trim();
        if (!trimmed) return;
        var el = document.createElement('p');
        el.innerHTML = trimmed;
        passageEl.appendChild(el);
      });
    },

    _findSegmentInText: function (needle, text, startFrom) {
      var start = startFrom || 0;

      // Direct match — segments now preserve exact passage text including quotes
      var idx = text.indexOf(needle, start);
      if (idx !== -1) return { start: idx, end: idx + needle.length };

      // Fuzzy fallback: match first 40 chars
      if (needle.length > 40) {
        var short = needle.substring(0, 40);
        idx = text.indexOf(short, start);
        if (idx !== -1) return { start: idx, end: Math.min(idx + needle.length, text.length) };
      }

      return null;
    },

    showLoading: function () {
      document.getElementById('loading-status').textContent = 'Generating...';
      document.getElementById('loading-overlay').classList.remove('hidden');
    },

    hideLoading: function () {
      document.getElementById('loading-overlay').classList.add('hidden');
    }
  };
})();
