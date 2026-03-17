/**
 * SQ.WriterPrompt — Builds prompts for The Writer (creative narrative LLM call).
 * The Writer is focused purely on prose: passage text and choice descriptions.
 * It does NOT handle game mechanics, state updates, or difficulty rules.
 */
(function () {
  SQ.WriterPrompt = {
    /**
     * Build the system prompt for The Writer.
     * Contains story context, writing style, and response schema.
     * Deliberately excludes: difficulty parameters, resource values, health numbers,
     * state_updates schema — those belong to The Game Master.
     * @param {object} gameState - Full game state
     * @returns {string} System prompt
     */
    buildSystem: function (gameState) {
      var meta = gameState.meta || {};
      var p = '';

      // Role and style
      p += 'You are The Writer for an interactive gamebook. You write vivid, engaging prose in ';
      p += (meta.perspective || 'second person') + ' perspective, ';
      p += (meta.tense || 'present') + ' tense, with a ';
      p += (meta.writing_style || 'literary') + ' style and ';
      p += (meta.tone || 'dark and atmospheric') + ' tone.\n\n';

      p += 'Your ONLY job is to write the narrative passage and four player choices. ';
      p += 'You do NOT manage game state, health, resources, or mechanics — a separate Game Master handles that.\n\n';

      p += 'OUTPUT FORMAT: Respond with ONLY a valid JSON object. No markdown, no code fences, no prose outside the JSON.\n\n';

      // Story skeleton
      p += 'STORY SKELETON:\n';
      p += JSON.stringify(gameState.skeleton, null, 2) + '\n\n';

      // Scene context — what the Writer needs for narrative continuity
      p += 'CURRENT POSITION:\n';
      p += JSON.stringify(gameState.current, null, 2) + '\n\n';

      // Pacing context — give the Writer explicit act-level guidance
      if (gameState.skeleton && Array.isArray(gameState.skeleton.acts)) {
        var actIndex = (gameState.current.act || 1) - 1;
        var currentAct = gameState.skeleton.acts[actIndex];
        if (currentAct) {
          var actStartScene = gameState.current.act_start_scene || 1;
          var scenesInAct = (gameState.current.scene_number || 1) - actStartScene + 1;
          var target = currentAct.target_scenes || 10;
          var proximity = gameState.current.proximity_to_climax || 0.0;

          p += 'CURRENT ACT PACING:\n';
          p += '- Act ' + (actIndex + 1) + ': "' + currentAct.title + '"\n';
          p += '- End condition: ' + currentAct.end_condition + '\n';
          p += '- Key beats: ' + JSON.stringify(currentAct.key_beats) + '\n';
          p += '- Scenes in this act: ' + scenesInAct + ' of ~' + target + ' target\n';
          p += '- Proximity to climax: ' + proximity.toFixed(2) + '\n';
          if (proximity >= 0.7 && actIndex === 2) {
            p += '- PACING DIRECTIVE: This is the FINAL ACT and the story climax is IMMINENT. Build urgency. Drive toward the end condition: "' + currentAct.end_condition + '".\n';
            p += '- The next scene MUST directly advance toward or trigger the end condition. Do not introduce new subplots.\n';
          } else if (proximity >= 0.7) {
            p += '- PACING DIRECTIVE: The act climax is IMMINENT. Build urgency. Drive toward the end condition: "' + currentAct.end_condition + '". Choices should relate to the approaching climax.\n';
            p += '- The next scene MUST directly advance toward or trigger the end condition. Do not introduce new subplots or social scenes.\n';
          } else if (proximity >= 0.4) {
            p += '- PACING DIRECTIVE: The act is past the midpoint. Begin building toward the end condition. Weave in remaining key beats.\n';
          } else if (scenesInAct <= 2 && actIndex === 0) {
            p += '- PACING DIRECTIVE: This is the story opening. Establish the setting and situation, then move directly into the first key event or confrontation. Do NOT spend multiple scenes on mundane setup, registration, or preparation.\n';
          }
          p += '\n';
        }
      }

      // Characters and relationships (for consistent character voices)
      p += 'RELATIONSHIPS:\n';
      p += JSON.stringify(gameState.relationships, null, 2) + '\n\n';

      // NPC roster — merged skeleton NPCs + overrides + dynamic NPCs
      var allNpcs = SQ.GameState.getNpcRoster();
      if (allNpcs.length > 0) {
        var companions = allNpcs.filter(function (npc) {
          if (npc.companion) return true;
          var role = (npc.role || '').toLowerCase();
          return role.indexOf('companion') !== -1 ||
                 role.indexOf('party member') !== -1 ||
                 role.indexOf('traveling companion') !== -1 ||
                 role.indexOf('sidekick') !== -1 ||
                 role.indexOf('squire') !== -1 ||
                 role.indexOf('crew') !== -1 ||
                 role.indexOf('first mate') !== -1 ||
                 role.indexOf('crewmate') !== -1;
        });
        if (companions.length > 0) {
          p += 'COMPANIONS (present in every scene unless narratively separated):\n';
          companions.forEach(function (c) {
            var rel = gameState.relationships[c.name];
            p += '- ' + c.name + ' (' + c.role + ')';
            if (typeof rel === 'number') {
              p += ' [relationship: ' + rel + ']';
            }
            p += '\n';
          });
          p += 'These characters travel with the protagonist. Include them in scenes — they can speak, react, assist, or complicate situations. They are NOT background characters.\n\n';
        }

        // Full NPC roster for context
        var nonCompanions = allNpcs.filter(function (npc) {
          return companions.indexOf(npc) === -1;
        });
        if (nonCompanions.length > 0) {
          p += 'KNOWN NPCs:\n';
          nonCompanions.forEach(function (npc) {
            var rel = gameState.relationships[npc.name];
            p += '- ' + npc.name + ' (' + npc.role + ')';
            if (typeof rel === 'number') {
              p += ' [relationship: ' + rel + ']';
            }
            if (npc.notes) {
              p += ' — ' + npc.notes;
            }
            p += '\n';
          });
          p += '\n';

          // NPC introduction directives — nudge Writer to introduce key NPCs
          if (gameState.current) {
            var proximity = gameState.current.proximity_to_climax || 0;
            var eventLogText = (gameState.event_log || []).join(' ').toLowerCase();
            var unintroducedKey = [];

            nonCompanions.forEach(function (npc) {
              var role = (npc.role || '').toLowerCase();
              var isKeyNpc = role.indexOf('antagonist') !== -1 ||
                             role.indexOf('ally') !== -1 ||
                             role.indexOf('mentor') !== -1 ||
                             role.indexOf('rival') !== -1 ||
                             role.indexOf('villain') !== -1 ||
                             role.indexOf('love interest') !== -1 ||
                             role.indexOf('quest giver') !== -1;
              if (isKeyNpc && eventLogText.indexOf(npc.name.toLowerCase()) === -1) {
                unintroducedKey.push(npc);
              }
            });

            if (unintroducedKey.length > 0) {
              p += 'NPC INTRODUCTION DIRECTIVES:\n';
              if (proximity >= 0.5) {
                p += 'The following key NPCs have NOT yet appeared and MUST be introduced soon — the act is past its midpoint:\n';
              } else if (proximity >= 0.3) {
                p += 'The following key NPCs have not yet appeared. Consider introducing one of them in this scene:\n';
              } else {
                p += 'These key NPCs should be introduced during this act. Look for natural opportunities:\n';
              }
              unintroducedKey.forEach(function (npc) {
                p += '- ' + npc.name + ' (' + npc.role + ')';
                if (npc.motivation) p += ' — motivation: ' + npc.motivation;
                p += '\n';
              });
              if (proximity >= 0.5) {
                p += 'If you do not introduce them now, the story will lack the character dynamics needed for the climax.\n';
              }
              p += '\n';
            }
          }
        }
      }

      // Event log for continuity
      p += 'EVENT LOG (last 20):\n';
      p += JSON.stringify(gameState.event_log.slice(-20), null, 2) + '\n';
      if (gameState.backstory_summary) {
        p += 'Backstory summary: ' + gameState.backstory_summary + '\n';
      }
      p += '\n';

      // Player identity (for writing, not mechanics)
      p += 'PLAYER CHARACTER:\n';
      p += '- Name: ' + (gameState.player.name || 'the protagonist') + '\n';
      p += '- Archetype: ' + (gameState.player.archetype || 'adventurer') + '\n\n';

      // Status effects — Writer needs to know what the character is dealing with
      if (gameState.player.status_effects && gameState.player.status_effects.length > 0) {
        p += 'ACTIVE STATUS EFFECTS (weave these into the narrative naturally):\n';
        gameState.player.status_effects.forEach(function (effect) {
          if (typeof effect === 'object' && effect.name) {
            p += '- ' + effect.name;
            if (typeof effect.severity === 'number') {
              if (effect.severity >= 0.7) p += ' (severe)';
              else if (effect.severity >= 0.4) p += ' (moderate)';
              else p += ' (minor)';
            }
            if (effect.description) p += ': ' + effect.description;
            if (effect.time_remaining) p += ' [' + SQ.GameState.formatDuration(effect.time_remaining) + ' remaining]';
            p += '\n';
          } else if (typeof effect === 'string') {
            p += '- ' + effect + '\n';
          }
        });
        p += 'Show these conditions affecting the character physically and emotionally. A broken arm should hurt when used. Poison should cause visible symptoms. Do NOT include mechanical numbers.\n\n';
      }

      // In-game time awareness
      var igt = (gameState.current && gameState.current.in_game_time) || null;
      if (igt) {
        p += 'IN-GAME TIME: ' + SQ.GameState.formatTime(igt) + '\n';
        p += 'Use this for natural time references (time of day, how long since events, etc.).\n\n';
      }

      // Pending consequences — Writer needs to know what's looming for narrative hooks
      if (gameState.pending_consequences && gameState.pending_consequences.length > 0) {
        p += 'ACTIVE NARRATIVE THREADS (pending consequences to weave into the story):\n';
        p += JSON.stringify(gameState.pending_consequences, null, 2) + '\n\n';
      }

      // Response schema — passage + choices only
      p += 'Respond with this exact JSON structure:\n';
      p += '{\n';
      p += '  "passage": "string — the narrative passage, 150-300 words",\n';
      p += '  "choices": {\n';
      p += '    "A": { "text": "string — choice description shown to player" },\n';
      p += '    "B": { "text": "..." },\n';
      p += '    "C": { "text": "..." },\n';
      p += '    "D": { "text": "..." }\n';
      p += '  }\n';
      p += '}\n\n';

      // Writing rules
      p += 'RULES:\n';
      p += '- Respond with ONLY the JSON object — nothing before it, nothing after it\n';
      p += '- Stay consistent with the skeleton\'s locked constraints for the current act\n';
      p += '- Keep the passage between 150-300 words\n';
      p += '- All four choices should feel plausible and interesting\n';
      p += '- Never reveal information the skeleton marks as hidden/secret unless the act\'s end condition has been met\n';
      p += '- Weave pending consequences into the narrative naturally when their triggers are near\n';
      p += '- Focus on prose quality, atmosphere, character voice, and dramatic tension\n';
      p += '- Do NOT include state_updates, health numbers, or mechanical data in your response\n';
      p += '- Pace the story toward the current act\'s end condition. Check the CURRENT ACT PACING section for scene count and proximity\n';
      p += '- When proximity_to_climax >= 0.8, your passage should feel like it\'s approaching a climax or turning point — increase urgency and stakes\n';
      p += '- Introduce key NPCs (antagonists, allies, mentors) naturally throughout each act. Do not wait until the climax to introduce important characters. Check the NPC INTRODUCTION DIRECTIVES section if present.\n';

      return p;
    },

    /**
     * Build the user prompt for The Writer.
     * Contains the player's choice and any outcome directives from The Game Master.
     * @param {object} gameState - Full game state
     * @param {string|null} choiceId - The choice the player made, or null for opening
     * @returns {string} User prompt
     */
    buildUser: function (gameState, choiceId) {
      if (!choiceId) {
        return 'Generate the opening passage for this story. Set the scene, establish the protagonist\'s situation, and present the first four choices. Respond with ONLY the JSON object.';
      }

      var choice = gameState.current_choices && gameState.current_choices[choiceId];
      var p = 'The player chose option ' + choiceId + '.';

      if (choice) {
        if (choice.text) p += '\nChoice text: "' + choice.text + '"';

        // On Hard/Brutal, the Game Master's directives from the previous turn
        // tell the Writer exactly how to narrate the outcome
        if (choice.outcome) {
          p += '\n\nOUTCOME CLASSIFICATION: ' + choice.outcome.toUpperCase();
          if (choice.consequence) p += '\nConsequence: ' + choice.consequence;
          if (choice.narration_directive) {
            p += '\nNARRATION DIRECTIVE: ' + choice.narration_directive;
            p += '\nYou MUST narrate this outcome exactly as classified. Do not soften, alter, or provide alternatives to the predetermined outcome.';
          }

          // Game over instruction (death, failure, etc.)
          if (choice.outcome === 'game_over') {
            p += '\n\nThe character has FAILED irreversibly. Narrate the failure vividly and definitively. Do not offer survival, last-minute rescues, or recovery.';
          }
        }
      }

      p += '\n\nGenerate the next passage and four new choices. Respond with ONLY the JSON object.';
      return p;
    },

    /**
     * Build the system prompt for a finale Writer call.
     * Called after the finale GM has resolved state — the Writer writes a conclusive passage with NO choices.
     * @param {object} gameState - Full game state
     * @param {string} terminalType - 'game_over', 'advances_act', or 'conclusion'
     * @returns {string} System prompt
     */
    buildFinaleSystem: function (gameState, terminalType) {
      var meta = gameState.meta || {};
      var p = '';

      // Role and style (same as normal)
      p += 'You are The Writer for an interactive gamebook. You write vivid, engaging prose in ';
      p += (meta.perspective || 'second person') + ' perspective, ';
      p += (meta.tense || 'present') + ' tense, with a ';
      p += (meta.writing_style || 'literary') + ' style and ';
      p += (meta.tone || 'dark and atmospheric') + ' tone.\n\n';

      // Terminal-type specific role
      if (terminalType === 'game_over') {
        p += 'You are writing the FINAL passage of the character\'s journey. The character has FAILED IRREVERSIBLY.\n';
        p += 'This could be death, permanent loss, catastrophic failure, or any genre-appropriate ending. ';
        p += 'Narrate the failure vividly and definitively. No escape, no survival, no continuation.\n\n';
      } else if (terminalType === 'advances_act') {
        p += 'You are writing the FINAL passage of the current act. The act\'s end condition has been triggered.\n';
        p += 'Write a satisfying conclusion to this chapter of the story. Resolve the act\'s central conflict. ';
        p += 'End with a sense of closure for this chapter while leaving narrative threads for the next act. ';
        p += 'Do NOT set up immediate next steps — a transition prompt will handle moving to the next act.\n\n';
      } else if (terminalType === 'conclusion') {
        p += 'You are writing the FINAL passage of the ENTIRE STORY. The story\'s ultimate end condition has been met.\n';
        p += 'Provide definitive narrative closure. Resolve character arcs. Reflect on the journey. ';
        p += 'End with a strong final image or moment that feels earned and satisfying.\n\n';
      }

      p += 'OUTPUT FORMAT: Respond with ONLY a valid JSON object. No markdown, no code fences, no prose outside the JSON.\n\n';

      // Story skeleton
      p += 'STORY SKELETON:\n';
      p += JSON.stringify(gameState.skeleton, null, 2) + '\n\n';

      // Scene context
      p += 'CURRENT POSITION:\n';
      p += JSON.stringify(gameState.current, null, 2) + '\n\n';

      // Relationships
      p += 'RELATIONSHIPS:\n';
      p += JSON.stringify(gameState.relationships, null, 2) + '\n\n';

      // NPC roster
      var allNpcs = SQ.GameState.getNpcRoster();
      if (allNpcs.length > 0) {
        p += 'KNOWN NPCs:\n';
        allNpcs.forEach(function (npc) {
          var rel = gameState.relationships[npc.name];
          p += '- ' + npc.name + ' (' + npc.role + ')';
          if (typeof rel === 'number') p += ' [relationship: ' + rel + ']';
          if (npc.notes) p += ' — ' + npc.notes;
          p += '\n';
        });
        p += '\n';
      }

      // Event log for continuity
      p += 'EVENT LOG (last 20):\n';
      p += JSON.stringify(gameState.event_log.slice(-20), null, 2) + '\n\n';

      // Player identity
      p += 'PLAYER CHARACTER:\n';
      p += '- Name: ' + (gameState.player.name || 'the protagonist') + '\n';
      p += '- Archetype: ' + (gameState.player.archetype || 'adventurer') + '\n\n';

      // Status effects
      if (gameState.player.status_effects && gameState.player.status_effects.length > 0) {
        p += 'ACTIVE STATUS EFFECTS:\n';
        gameState.player.status_effects.forEach(function (effect) {
          if (typeof effect === 'object' && effect.name) {
            p += '- ' + effect.name;
            if (effect.description) p += ': ' + effect.description;
            p += '\n';
          }
        });
        p += '\n';
      }

      // Response schema — passage ONLY, NO choices
      p += 'Respond with this exact JSON structure:\n';
      p += '{\n';
      p += '  "passage": "string — the conclusive narrative passage, 200-400 words"\n';
      p += '}\n\n';

      p += 'RULES:\n';
      p += '- Respond with ONLY the JSON object — nothing before it, nothing after it\n';
      p += '- Write 200-400 words — longer than normal to provide a satisfying conclusion\n';
      p += '- Do NOT include a "choices" field — this is a terminal passage with no choices\n';
      p += '- Focus on prose quality, emotional resonance, and narrative closure\n';
      p += '- Do NOT include state_updates, health numbers, or mechanical data\n';

      return p;
    },

    /**
     * Build the user prompt for a finale Writer call.
     * @param {object} gameState - Full game state
     * @param {string} choiceId - Which choice was selected (A/B/C/D)
     * @param {string} terminalType - 'game_over', 'advances_act', or 'conclusion'
     * @param {object} gmResponse - The finale GM response (for event_log_entry context)
     * @returns {string} User prompt
     */
    buildFinaleUser: function (gameState, choiceId, terminalType, gmResponse) {
      var choice = gameState.current_choices && gameState.current_choices[choiceId];
      var p = 'The player chose option ' + choiceId + '.';
      if (choice && choice.text) p += '\nChoice text: "' + choice.text + '"';

      p += '\n\nTERMINAL TYPE: ' + terminalType.toUpperCase();

      if (gmResponse && gmResponse.state_updates && gmResponse.state_updates.event_log_entry) {
        p += '\nGAME MASTER SUMMARY: ' + gmResponse.state_updates.event_log_entry;
      }

      p += '\n\nWrite the final passage. No choices needed. Respond with ONLY the JSON object: { "passage": "..." }';
      return p;
    }
  };
})();
