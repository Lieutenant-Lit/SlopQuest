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

      // Settings gear
      document.getElementById('btn-settings-gear').addEventListener('click', function () {
        SQ.showScreen('settings');
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

      // Audio playback controls
      document.getElementById('btn-audio-playpause').addEventListener('click', function () {
        SQ.AudioDirector.togglePlayPause();
      });
      document.getElementById('btn-audio-replay').addEventListener('click', function () {
        SQ.AudioDirector.replay();
      });

      // Audio debug overlay
      document.addEventListener('audiodebug', function (e) {
        if (SQ.PlayerConfig.isAudioDebugEnabled()) {
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
    },

    onShow: function () {
      this._isInitialRender = true;
      this.renderState();
    },

    onHide: function () {
      SQ.AudioDirector.stop();
      var debugPanel = document.getElementById('audio-debug-panel');
      if (debugPanel) debugPanel.classList.add('hidden');
      var gsDebug = document.getElementById('gamestate-debug-panel');
      if (gsDebug) gsDebug.classList.add('hidden');
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

      // Audio controls — show if narration is enabled and audio is pending or active
      if (SQ.PlayerConfig.isNarrationEnabled() && SQ.AudioDirector.hasPendingOrActive()) {
        SQ.AudioDirector.showControls();
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
      } else {
        document.getElementById('choices-container').classList.remove('hidden');
        this.renderChoices(state.current_choices, !this._isInitialRender);
        this._hideChoiceStatus();
      }

      // Game state debug panel
      this._renderGameStateDebug(state);
    },

    /**
     * Render the resource/status bar.
     * Shows health and current act/scene.
     * @private
     */
    _renderStatusBar: function (state) {
      var player = state.player || {};
      var current = state.current || {};

      // Health — update value and apply color class
      var healthEl = document.getElementById('status-health');
      var healthVal = typeof player.health === 'number' ? player.health : 100;
      healthEl.querySelector('.status-value').textContent = healthVal;
      healthEl.classList.remove('health-high', 'health-mid', 'health-low');
      if (healthVal > 60) {
        healthEl.classList.add('health-high');
      } else if (healthVal > 25) {
        healthEl.classList.add('health-mid');
      } else {
        healthEl.classList.add('health-low');
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

      // Scroll passage to top when new content arrives
      passageEl.scrollTop = 0;
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

        }).catch(function (err) {
          console.error('Game Master failed:', err);

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
                { temperature: 0.3, max_tokens: 1500 },
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
              }).catch(function (retryErr) {
                console.error('Game Master retry failed:', retryErr);
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
        console.error('Writer generation failed:', err);

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

      // 1. Player changes (health, resources, inventory, status_effects, skills)
      if (updates.player_changes) {
        var pc = updates.player_changes;
        if (typeof pc.health === 'number') state.player.health = pc.health;
        if (pc.resources) Object.assign(state.player.resources, pc.resources);
        if (Array.isArray(pc.inventory)) state.player.inventory = pc.inventory;
        if (Array.isArray(pc.status_effects)) state.player.status_effects = pc.status_effects;
        if (Array.isArray(pc.skills)) state.player.skills = pc.skills;
      }

      // 2. New pending consequences
      if (Array.isArray(updates.new_pending_consequences)) {
        updates.new_pending_consequences.forEach(function (c) {
          state.pending_consequences.push(c);
        });
      }

      // 3. Resolved consequences — remove by id
      if (Array.isArray(updates.resolved_consequences)) {
        state.pending_consequences = state.pending_consequences.filter(function (c) {
          return updates.resolved_consequences.indexOf(c.id) === -1;
        });
      }

      // 4. Decrement scenes_remaining on all pending consequences
      state.pending_consequences.forEach(function (c) {
        if (typeof c.scenes_remaining === 'number' && c.scenes_remaining > 0) {
          c.scenes_remaining--;
        }
      });

      // 5. Event log entry
      if (updates.event_log_entry) {
        state.event_log.push(updates.event_log_entry);
      }

      // 6. World flag changes
      if (updates.world_flag_changes) {
        Object.assign(state.world_flags, updates.world_flag_changes);
      }

      // 7. Relationship changes (deltas, not absolutes)
      if (updates.relationship_changes) {
        for (var name in updates.relationship_changes) {
          if (updates.relationship_changes.hasOwnProperty(name)) {
            var delta = updates.relationship_changes[name];
            state.relationships[name] = (state.relationships[name] || 0) + delta;
            state.relationships[name] = Math.max(-100, Math.min(100, state.relationships[name]));
          }
        }
      }

      // 8. Scene context update
      if (updates.new_scene_context) {
        state.current.scene_context = updates.new_scene_context;
      }

      // 9. Act advancement
      if (updates.advance_act) {
        state.current.act = Math.min((state.current.act || 1) + 1, 3);
        state.current.proximity_to_climax = 0.0;
        if (state.skeleton && Array.isArray(state.skeleton.acts)) {
          var newAct = state.skeleton.acts[state.current.act - 1];
          if (newAct && Array.isArray(newAct.locked_constraints)) {
            state.current.active_constraints = newAct.locked_constraints.slice();
          }
        }
      }

      // 10. Merge choice metadata (outcome, consequence, narration_directive)
      if (gmResponse.choice_metadata) {
        var keys = ['A', 'B', 'C', 'D'];
        for (var i = 0; i < keys.length; i++) {
          var k = keys[i];
          if (gmResponse.choice_metadata[k] && state.current_choices[k]) {
            Object.assign(state.current_choices[k], gmResponse.choice_metadata[k]);
          }
        }
      }

      // 11. Enforce difficulty health floor (client-side safety net)
      var diffKey = (state.meta && state.meta.difficulty) || 'normal';
      var diffConfig = SQ.DifficultyConfig[diffKey] || SQ.DifficultyConfig.normal;
      if (!diffConfig.allow_game_over && state.player.health < diffConfig.health_floor) {
        state.player.health = diffConfig.health_floor;
      }

      // 12. Prevent game_over on difficulties that don't allow it
      if (!diffConfig.allow_game_over) {
        updates.game_over = false;
      }

      // 13. Check for game over or story complete
      var isGameOver = updates.game_over || (diffConfig.allow_game_over && state.player.health <= 0);
      var isStoryComplete = updates.story_complete;

      if (isGameOver) {
        state.game_over = true;
        state.game_over_reason = updates.event_log_entry || 'The story has ended.';
        SQ.GameState.save();
        SQ.showScreen('gameover');
        return;
      }

      if (isStoryComplete) {
        state.story_complete = true;
        SQ.GameState.save();
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
      var player = state.player || {};
      var current = state.current || {};
      var resources = player.resources || {};

      // 1. Player
      var playerBody = '';
      var healthVal = typeof player.health === 'number' ? player.health : 100;
      var healthColor = healthVal > 60 ? 'var(--color-success)' : healthVal > 25 ? 'var(--color-warning)' : 'var(--color-danger)';
      playerBody += self._gsdRow('Health', healthVal + ' <span class="gsd-health-bar" style="width:' + healthVal + 'px;background:' + healthColor + '"></span>');
      playerBody += self._gsdRow('Gold', typeof resources.gold === 'number' ? resources.gold : '—');
      playerBody += self._gsdRow('Provisions', typeof resources.provisions === 'number' ? resources.provisions : '—');
      if (player.inventory && player.inventory.length) {
        playerBody += self._gsdRow('Inventory', self._gsdList(player.inventory));
      }
      if (player.status_effects && player.status_effects.length) {
        playerBody += self._gsdRow('Status', self._gsdList(player.status_effects));
      }
      if (player.skills && player.skills.length) {
        playerBody += self._gsdRow('Skills', self._gsdList(player.skills));
      }
      html += self._gsdSection('Player', playerBody, false);

      // 2. Position
      var posBody = '';
      posBody += self._gsdRow('Act / Scene', 'Act ' + (current.act || 1) + ' / Scene ' + (current.scene_number || 1));
      if (current.location) posBody += self._gsdRow('Location', self._esc(current.location));
      if (current.time_of_day) posBody += self._gsdRow('Time', self._esc(current.time_of_day));
      if (current.scene_context) posBody += self._gsdRow('Context', self._esc(current.scene_context));
      if (typeof current.proximity_to_climax === 'number') posBody += self._gsdRow('Climax proximity', current.proximity_to_climax);
      if (current.active_constraints && current.active_constraints.length) {
        posBody += self._gsdRow('Constraints', self._gsdList(current.active_constraints));
      }
      html += self._gsdSection('Position', posBody, false);

      // 3. Relationships
      var rels = state.relationships || {};
      var relNames = Object.keys(rels);
      if (relNames.length) {
        var relBody = '';
        relNames.forEach(function (name) {
          var val = rels[name];
          var cls = val > 0 ? 'gsd-rel-pos' : val < 0 ? 'gsd-rel-neg' : 'gsd-rel-zero';
          var sign = val > 0 ? '+' : '';
          relBody += self._gsdRow(self._esc(name), '<span class="' + cls + '">' + sign + val + '</span>');
        });
        html += self._gsdSection('Relationships', relBody, false);
      }

      // 4. Choices + metadata
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
      html += self._gsdSection('Choices', choiceBody, false);

      // 5. Pending Consequences
      var pcs = state.pending_consequences || [];
      if (pcs.length) {
        var pcBody = '';
        pcs.forEach(function (c) {
          pcBody += '<div class="gsd-row" style="flex-wrap:wrap">';
          pcBody += '<span class="gsd-label">' + self._esc(c.id || '?') + '</span>';
          pcBody += '<span class="gsd-value">' + self._esc(c.description || '');
          if (c.severity) pcBody += ' ' + self._gsdTag(c.severity, c.severity === 'lethal' ? 'danger' : c.severity === 'severe' ? 'risky' : 'muted');
          if (typeof c.scenes_remaining === 'number') pcBody += ' <span style="opacity:0.6">(' + c.scenes_remaining + ' scenes)</span>';
          pcBody += '</span></div>';
        });
        html += self._gsdSection('Pending Consequences', pcBody, false);
      }

      // 6. World Flags
      var flags = state.world_flags || {};
      var flagKeys = Object.keys(flags);
      if (flagKeys.length) {
        var flagBody = '';
        flagKeys.forEach(function (f) {
          var dotCls = flags[f] ? 'gsd-dot-on' : 'gsd-dot-off';
          flagBody += self._gsdRow('<span class="gsd-dot ' + dotCls + '"></span>' + self._esc(f), flags[f] ? 'true' : 'false');
        });
        html += self._gsdSection('World Flags', flagBody, true);
      }

      // 7. Event Log (last 5)
      var log = (state.event_log || []).slice(-5);
      if (log.length) {
        var logBody = '<ol class="gsd-list" style="list-style:decimal">';
        log.forEach(function (entry) {
          logBody += '<li>' + self._esc(typeof entry === 'string' ? entry : JSON.stringify(entry)) + '</li>';
        });
        logBody += '</ol>';
        html += self._gsdSection('Event Log (last 5)', logBody, true);
      }

      // 8. Skeleton (collapsed by default)
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
        var name = (seg.type === 'dialogue' && seg.speaker) ? seg.speaker : 'Narrator';
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
        var needle = (seg.text || '').trim();
        if (!needle) return;
        var speaker = (seg.speaker === 'Narrator') ? null : seg.speaker;
        var match = self._findSegmentInText(needle, fullText, cursor);
        if (match) {
          ranges.push({ start: match.start, end: match.end, speaker: speaker });
          cursor = match.end;
        }
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
