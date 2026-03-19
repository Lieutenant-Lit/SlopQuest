/**
 * SQ.GameMasterPrompt — Builds prompts for The Game Master (mechanics LLM call).
 * The Game Master manages all game state: consequences,
 * relationships, world flags, and choice outcome metadata.
 * It does NOT write prose — that's The Writer's job.
 */
(function () {
  SQ.GameMasterPrompt = {
    /**
     * Build the system prompt for The Game Master.
     * Contains difficulty rules, current player state, and response schema.
     * Style & Tone is surfaced so the GM can create tone-appropriate consequences.
     * @param {object} gameState - Full game state
     * @returns {string} System prompt
     */
    buildSystem: function (gameState) {
      var meta = gameState.meta || {};
      var difficulty = meta.difficulty || 'normal';
      var isHardOrBrutal = difficulty === 'hard' || difficulty === 'brutal';
      var diffConfig = SQ.DifficultyConfig[difficulty] || SQ.DifficultyConfig.normal;

      var p = '';

      // Role
      p += 'You are The Game Master for an interactive gamebook. You manage all game mechanics: ';
      p += 'state updates, consequences, relationships, and choice outcome classification.\n\n';

      p += 'You do NOT write prose. A separate Writer handles narrative. ';
      p += 'You will receive The Writer\'s passage and choices, then determine the mechanical impact.\n\n';

      p += 'OUTPUT FORMAT: Respond with ONLY a valid JSON object. No markdown, no code fences, no commentary.\n\n';

      // Story skeleton — GM needs this for act advancement and constraint checking
      p += 'STORY SKELETON:\n';
      p += JSON.stringify(gameState.skeleton, null, 2) + '\n\n';

      // Full player state — GM needs all mechanical details
      p += 'CURRENT PLAYER STATE:\n';
      p += JSON.stringify(gameState.player, null, 2) + '\n\n';

      // In-game time
      var igt = (gameState.current && gameState.current.in_game_time) || null;
      p += 'IN-GAME TIME: ' + SQ.GameState.formatTime(igt) + '\n\n';

      p += 'RELATIONSHIPS:\n';
      p += JSON.stringify(gameState.relationships, null, 2) + '\n\n';

      // NPC overrides — mutable NPC data layered on top of the skeleton
      p += 'NPC OVERRIDES (mutable NPC data layered on top of skeleton — populated via npc_updates):\n';
      if (gameState.npc_overrides && Object.keys(gameState.npc_overrides).length > 0) {
        p += JSON.stringify(gameState.npc_overrides, null, 2) + '\n\n';
      } else {
        p += '(none yet — use npc_updates in your response to add or modify NPC data)\n\n';
      }

      p += 'CURRENT POSITION:\n';
      p += JSON.stringify(gameState.current, null, 2) + '\n\n';

      p += 'EVENT LOG (last 20):\n';
      p += JSON.stringify(gameState.event_log.slice(-20), null, 2) + '\n';
      if (gameState.backstory_summary) {
        p += 'Backstory summary: ' + gameState.backstory_summary + '\n';
      }
      p += '\n';

      p += 'WORLD STATE FLAGS:\n';
      p += JSON.stringify(gameState.world_flags, null, 2) + '\n\n';

      // Style & Tone — the GM needs this to create tone-appropriate consequences
      var style = (meta.writing_style || meta.tone || '').trim();
      if (style) {
        p += 'STYLE & TONE: ' + style + '\n';
        p += 'The kind of consequences you create MUST fit this tone. Read what the player wrote and match it — ';
        p += 'the same mechanical severity plays very differently depending on the story\'s voice.\n\n';
      }

      // Difficulty parameters
      p += 'DIFFICULTY: ' + diffConfig.label + '\n';
      p += '- Safe choice ratio: ' + diffConfig.safe_choice_ratio + '\n';
      p += '- Consequence severity: ' + diffConfig.consequence_severity + '\n';
      p += '- Game over allowed: ' + diffConfig.allow_game_over + '\n';
      p += '- Hint transparency: ' + diffConfig.hint_transparency + '\n';
      p += '- NPC forgiveness: ' + diffConfig.npc_forgiveness + '\n';
      p += '\n';

      // Response JSON schema
      p += 'Respond with this exact JSON structure:\n';
      p += '{\n';
      p += '  "state_updates": {\n';
      p += '    "player_changes": {\n';
      p += '      "inventory": ["full current inventory list"]\n';
      p += '    },\n';
      p += '    "time_elapsed": { "days": 0, "hours": 0, "minutes": 0, "seconds": 0 },\n';
      p += '    "event_log_entry": "string — one-line summary of what happened",\n';
      p += '    "world_flag_changes": { "flag_name": true/false },\n';
      p += '    "relationship_changes": { "npc_or_faction_name": number_delta },\n';
      p += '    "npc_updates": { "npc_name": { "role": "string (optional)", "motivation": "string (optional)", "allegiance": "string (optional)", "secret_revealed": "boolean (optional)", "companion": "boolean (optional)", "notes": "string — brief freeform context (optional)" } },\n';
      p += '    "new_scene_context": "string — brief context for next passage",\n';
      p += '    "location": "string — REQUIRED — current location name (e.g. The Docks, Castle Throne Room, A dark alley)",\n';
      p += '    "time_of_day": "string — REQUIRED — one of: dawn, morning, midday, afternoon, evening, night, midnight",\n';
      p += '    "proximity_to_climax": "number 0.0-1.0 — REQUIRED (see PACING)",\n';
      p += '    "advance_act": "true or false — REQUIRED (see PACING)",\n';
      p += '    "game_over": false,\n';
      p += '    "story_complete": "true when Act 3 end_condition is met (see PACING)"\n';
      p += '  },\n';
      p += '  "choice_metadata": {\n';
      if (isHardOrBrutal) {
        p += '    "A": { "outcome": "advance_safe|advance_risky|severe_penalty|game_over|hidden_benefit|advances_act|conclusion", "consequence": "what happens mechanically", "narration_directive": "instructions for the Writer next turn" },\n';
        p += '    "B": { ... }, "C": { ... }, "D": { ... }\n';
      } else {
        p += '    "A": { "outcome": "advance_safe|advance_risky|hidden_benefit|advances_act|conclusion", "consequence": "brief mechanical note" },\n';
        p += '    "B": { ... }, "C": { ... }, "D": { ... }\n';
      }
      p += '  }\n';
      p += '}\n\n';

      // General rules
      p += 'RULES:\n';
      p += '- Respond with ONLY the JSON object — nothing before it, nothing after it\n';
      p += '- Only include player_changes, relationship_changes, world_flag_changes, and npc_updates when they actually changed. Always include: time_elapsed, event_log_entry, proximity_to_climax, advance_act, location, time_of_day.\n';
      p += '- location: REQUIRED every turn — describe where the scene takes place (e.g. "St. Bartholomew\'s Church", "The Thames docks")\n';
      p += '- time_of_day: REQUIRED every turn — set based on in-game clock: dawn (~5-7am), morning (~7-12pm), midday (~12-1pm), afternoon (~1-5pm), evening (~5-8pm), night (~8pm-12am), midnight (~12-5am)\n';
      p += '- Relationship changes are DELTAS, not absolute values\n';
      p += '- proximity_to_climax: REQUIRED every turn — set this value in state_updates using the formula in the PACING section below\n';
      p += '- event_log_entry is required — always summarize what happened this turn\n';
      p += '- choice_metadata must classify all four choices (A, B, C, D)\n';
      p += '- CRITICAL: When a PLAYER\'S PREVIOUS CHOICE section is provided, your state_updates MUST honor the pre-classified outcome. If a choice was advance_safe, do NOT apply negative consequences or penalties. The pre-classified outcome is the single source of truth for mechanical impact.\n';
      p += '- npc_updates: include when an NPC\'s role, motivation, allegiance, or companion status changes, or when a narratively significant new NPC is introduced that the player will interact with again. For existing skeleton NPCs, use their exact name. For new NPCs, use the character\'s name as the key and include at least role and motivation. Do not create entries for one-off background characters (shopkeepers, random guards, etc.).\n\n';

      // Pacing rules
      p += 'PACING — REQUIRED:\n';
      p += '- The current act\'s target_scenes (in the skeleton) is the intended scene count for this act.\n';
      p += '- Compute scenes elapsed in this act: scene_number - act_start_scene + 1 (both values are in CURRENT POSITION above).\n';
      p += '- Set proximity_to_climax = (scenes_in_act / target_scenes), clamped to [0.0, 1.0]. Include this in state_updates EVERY turn.\n';
      p += '- MINIMUM SCENES PER ACT: The client enforces that acts cannot advance until scenes_in_act >= MAX(3, CEIL(target_scenes * 0.5)). Do not offer advances_act choices before this threshold.\n';
      p += '- CRITICAL: You MUST play through ALL THREE ACTS (1, 2, 3) in order. Never skip from Act 1 directly to Act 3. Act 2 contains the rising action and character development that makes the climax meaningful.\n';
      p += '- Do NOT set advance_act or story_complete to true on normal turns. Act advancement and story completion are now triggered by the TERMINAL CHOICE system below. Always set advance_act to false on normal turns.\n';
      p += '- If scenes_in_act exceeds target_scenes by 3 or more, you SHOULD offer an advances_act choice — the act has gone on too long.\n';
      p += '- When proximity_to_climax >= 0.7, your choice_metadata should steer toward the act\'s end_condition — offer choices that could trigger it, including advances_act choices.\n\n';

      // Terminal outcomes rules
      p += 'TERMINAL OUTCOMES — CHOICE PRE-CLASSIFICATION:\n';
      p += '- advances_act: Use when scenes_in_act >= MAX(3, CEIL(target_scenes * 0.5)) AND the choice would resolve the act\'s end_condition. At most ONE advances_act choice per set of four.\n';
      p += '- conclusion: Only valid in Act 3. Use when the choice would resolve Act 3\'s end_condition and complete the story. At most ONE conclusion choice per set of four.\n';
      if (diffConfig.allow_game_over) {
        p += '- game_over: Use when the choice leads to an irreversible failure appropriate to the tone (see STYLE & TONE above). At most ONE game_over choice per set of four.\n';
      }
      p += '- When a player selects a terminal choice, the client runs a special finale flow (GM-first, then Writer). The Writer will write a conclusive passage with NO forward-looking choices. Your choice_metadata pre-classification is the trigger.\n';
      p += '- IMPORTANT: At most ONE terminal outcome (advances_act, conclusion, or game_over) per set of four choices. The other three choices must use normal outcomes.\n\n';

      // Time elapsed rules
      p += 'TIME ELAPSED — REQUIRED EVERY TURN:\n';
      p += '- You MUST include time_elapsed in state_updates to indicate how much in-game time passed during this scene.\n';
      p += '- Estimate realistically: a brief conversation = 5-15 minutes, a fight = 1-5 minutes, traveling across a city = 30-60 minutes, a journey = hours or days, sleeping/resting = 6-8 hours.\n';
      p += '- The client uses time_elapsed to advance the in-game clock.\n\n';

      // Injury & condition tracking
      p += 'INJURY & CONDITION TRACKING:\n';
      p += '- Injuries, conditions, and ongoing threats are tracked through event_log_entry. Describe them narratively.\n';
      p += '- When something happens to the player (injury, curse, ongoing danger), describe it in event_log_entry so the Writer can reference it from the event log.\n\n';

      // Difficulty-specific rules
      if (difficulty === 'chill') {
        p += 'CHILL MODE RULES (MANDATORY):\n';
        p += '- NEVER use game_over outcome on choices. The player cannot fail on Chill.\n';
        p += '- Consequences are mild inconveniences at most. Minor setbacks resolve quickly.\n';
        p += '- At least 3 of 4 choices should be advance_safe. The "risky" choice should have minor consequences.\n';
        p += '- NPCs are forgiving. Relationship penalties are small and temporary.\n';
        p += '- You may use advances_act and conclusion outcomes when pacing conditions are met.\n';
      } else if (difficulty === 'normal') {
        p += 'NORMAL MODE RULES (MANDATORY):\n';
        p += '- NEVER use game_over outcome on choices. The player cannot fail on Normal.\n';
        p += '- Setbacks matter but are never irreversible. The player should have opportunities to recover.\n';
        p += '- Approximately 2 safe and 2 risky choices per turn.\n';
        p += '- NPCs can be upset but always have a path to reconciliation.\n';
        p += '- You may use advances_act and conclusion outcomes when pacing conditions are met.\n';
      } else if (difficulty === 'hard') {
        p += 'HARD MODE RULES (MANDATORY):\n';
        p += '- choice_metadata MUST include outcome, consequence, and narration_directive for every choice\n';
        p += '- Maintain safe_choice_ratio: approximately ' + diffConfig.safe_choice_ratio + ' of choices should be advance_safe\n';
        p += '- Consequences are serious and recovery is realistic for the setting.\n';
        p += '- NPCs have low forgiveness. Burning a relationship has lasting consequences.\n';
        p += '- Include at least one advance_risky or severe_penalty outcome per set of choices.\n';
        p += '- game_over outcomes are available — use for tone-appropriate failures. Respect the STYLE & TONE setting when deciding what failure looks like.\n';
        p += '- You may use advances_act and conclusion outcomes when pacing conditions are met.\n';
      } else if (difficulty === 'brutal') {
        p += 'BRUTAL MODE RULES (MANDATORY):\n';
        p += '- choice_metadata MUST include outcome, consequence, and narration_directive for every choice\n';
        p += '- Maintain safe_choice_ratio: approximately ' + diffConfig.safe_choice_ratio + ' of choices should be advance_safe\n';
        p += '- At most 1 clearly safe choice per turn. At least 1 choice should have critical or severely punishing consequences.\n';
        p += '- Setbacks stack and compound the character\'s problems.\n';
        p += '- Recovery is slow without effort. Active intervention is required for meaningful recovery.\n';
        p += '- Some game_over choices should appear safe. The "obvious" safe choice may actually lead to failure.\n';
        p += '- NPCs never forgive. One wrong interaction permanently closes that NPC\'s alliance.\n';
        p += '- Create cascading danger: if the player is already burdened with problems, make the situation worse.\n';
        p += '- You may use advances_act and conclusion outcomes when pacing conditions are met.\n';
      }

      return p;
    },

    /**
     * Build the user prompt for The Game Master.
     * Passes The Writer's passage and choices so the GM can determine mechanical impact.
     * @param {object} gameState - Full game state
     * @param {object} writerResponse - The Writer's response (passage + choices)
     * @returns {string} User prompt
     */
    buildUser: function (gameState, writerResponse, choiceId) {
      var p = '';

      // Opening passage — no choice was made this turn
      if (!choiceId) {
        var act = (gameState.current && gameState.current.act) || 1;
        if (act > 1) {
          p += 'This is the OPENING PASSAGE of Act ' + act + '. The previous act just concluded — the player has existing relationships and history. time_elapsed should reflect any time gap between acts.\n\n';
        } else {
          p += 'This is the OPENING PASSAGE. No player choice was made yet. Do not apply any negative consequences or penalties — the player has not made any choices yet. time_elapsed should reflect the scene\'s timeframe.\n\n';
        }
      }

      // If the player made a choice, include its pre-classified outcome so the GM honors it
      if (choiceId && gameState.current_choices && gameState.current_choices[choiceId]) {
        var choiceMeta = gameState.current_choices[choiceId];
        if (choiceMeta && choiceMeta.outcome) {
          p += 'PLAYER\'S PREVIOUS CHOICE:\n';
          p += 'The player chose option ' + choiceId + '.\n';
          p += 'Pre-classified outcome: ' + choiceMeta.outcome.toUpperCase() + '\n';
          if (choiceMeta.consequence) {
            p += 'Pre-determined consequence: "' + choiceMeta.consequence + '"\n';
          }
          if (choiceMeta.narration_directive) {
            p += 'Narration directive: "' + choiceMeta.narration_directive + '"\n';
          }
          p += '\nYour state_updates MUST be consistent with this pre-classified outcome:\n';
          p += '- ADVANCE_SAFE: No new negative consequences. No penalties.\n';
          p += '- ADVANCE_RISKY: Moderate consequences are appropriate.\n';
          p += '- SEVERE_PENALTY: Heavy consequences — serious injuries and setbacks as described.\n';
          p += '- GAME_OVER: set game_over to true — the character has failed irreversibly.\n';
          p += '- HIDDEN_BENEFIT: apply the hidden benefit described in the consequence.\n\n';
        }
      }

      p += 'The Writer produced the following passage and choices this turn.\n\n';

      p += 'PASSAGE:\n';
      p += writerResponse.passage + '\n\n';

      p += 'CHOICES PRESENTED TO PLAYER:\n';
      var choices = writerResponse.choices || {};
      var keys = ['A', 'B', 'C', 'D'];
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (choices[key]) {
          p += key + ': ' + choices[key].text + '\n';
        }
      }

      p += '\nBased on the passage and the current game state, determine:\n';
      p += '1. State updates — what changed mechanically as a result of this passage (inventory, time_elapsed)\n';
      p += '2. Choice metadata — classify each choice and predetermine its outcome for the next turn\n\n';
      p += 'Respond with ONLY the JSON object.';

      return p;
    },

    /**
     * Build the system prompt for a finale GM call.
     * Called when a player selects a terminal choice (game_over, advances_act, conclusion).
     * Returns state_updates only — no choice_metadata.
     * @param {object} gameState - Full game state
     * @param {string} terminalType - 'game_over', 'advances_act', or 'conclusion'
     * @returns {string} System prompt
     */
    buildFinaleSystem: function (gameState, terminalType) {
      var meta = gameState.meta || {};
      var difficulty = meta.difficulty || 'normal';
      var diffConfig = SQ.DifficultyConfig[difficulty] || SQ.DifficultyConfig.normal;

      var p = '';

      // Role
      p += 'You are The Game Master for an interactive gamebook. The player has selected a TERMINAL choice.\n';
      p += 'Apply the final mechanical consequences for this ' + terminalType.toUpperCase() + ' outcome.\n\n';

      p += 'OUTPUT FORMAT: Respond with ONLY a valid JSON object. No markdown, no code fences, no commentary.\n\n';

      // Context — same as buildSystem
      p += 'STORY SKELETON:\n';
      p += JSON.stringify(gameState.skeleton, null, 2) + '\n\n';

      p += 'CURRENT PLAYER STATE:\n';
      p += JSON.stringify(gameState.player, null, 2) + '\n\n';

      var igt = (gameState.current && gameState.current.in_game_time) || null;
      p += 'IN-GAME TIME: ' + SQ.GameState.formatTime(igt) + '\n\n';

      p += 'RELATIONSHIPS:\n';
      p += JSON.stringify(gameState.relationships, null, 2) + '\n\n';

      p += 'NPC OVERRIDES:\n';
      if (gameState.npc_overrides && Object.keys(gameState.npc_overrides).length > 0) {
        p += JSON.stringify(gameState.npc_overrides, null, 2) + '\n\n';
      } else {
        p += '(none)\n\n';
      }

      p += 'CURRENT POSITION:\n';
      p += JSON.stringify(gameState.current, null, 2) + '\n\n';

      p += 'EVENT LOG (last 20):\n';
      p += JSON.stringify(gameState.event_log.slice(-20), null, 2) + '\n\n';

      p += 'WORLD STATE FLAGS:\n';
      p += JSON.stringify(gameState.world_flags, null, 2) + '\n\n';

      p += 'DIFFICULTY: ' + diffConfig.label + '\n\n';

      // Response schema — state_updates only, NO choice_metadata
      p += 'Respond with this exact JSON structure:\n';
      p += '{\n';
      p += '  "state_updates": {\n';
      p += '    "player_changes": {\n';
      p += '      "inventory": ["full current inventory list"]\n';
      p += '    },\n';
      p += '    "time_elapsed": { "days": 0, "hours": 0, "minutes": 0, "seconds": 0 },\n';
      p += '    "event_log_entry": "string — one-line summary of the terminal outcome",\n';
      p += '    "world_flag_changes": { "flag_name": true/false },\n';
      p += '    "relationship_changes": { "npc_or_faction_name": number_delta },\n';
      p += '    "location": "string — current location",\n';
      p += '    "time_of_day": "string — dawn|morning|midday|afternoon|evening|night|midnight"\n';
      p += '  }\n';
      p += '}\n\n';

      p += 'RULES:\n';
      p += '- Respond with ONLY the JSON object.\n';
      p += '- Do NOT include choice_metadata — there are no choices after a terminal passage.\n';
      p += '- event_log_entry is REQUIRED — summarize what happened.\n';

      // Terminal-type specific instructions
      if (terminalType === 'game_over') {
        p += '- This is a GAME OVER. The character has failed irreversibly.\n';
        p += '- Apply the consequences of the failure. The event_log_entry should describe the failure clearly — it will be displayed as the game over reason.\n';
      } else if (terminalType === 'advances_act') {
        p += '- This COMPLETES the current act. The act\'s end_condition has been triggered.\n';
        p += '- The event_log_entry should summarize the act\'s resolution.\n';
      } else if (terminalType === 'conclusion') {
        p += '- This CONCLUDES the entire story. The Act 3 end_condition has been met.\n';
        p += '- The event_log_entry should summarize the story\'s conclusion.\n';
      }

      return p;
    },

    /**
     * Build the user prompt for a finale GM call.
     * @param {object} gameState - Full game state
     * @param {string} choiceId - Which choice was selected (A/B/C/D)
     * @param {string} terminalType - 'game_over', 'advances_act', or 'conclusion'
     * @returns {string} User prompt
     */
    buildFinaleUser: function (gameState, choiceId, terminalType) {
      var choice = gameState.current_choices && gameState.current_choices[choiceId];
      var p = 'TERMINAL CHOICE SELECTED:\n';
      p += 'The player chose option ' + choiceId;
      if (choice) {
        if (choice.text) p += ': "' + choice.text + '"';
        p += '\n';
        if (choice.outcome) p += 'Pre-classified outcome: ' + choice.outcome + '\n';
        if (choice.consequence) p += 'Pre-determined consequence: "' + choice.consequence + '"\n';
      }
      p += '\nTerminal type: ' + terminalType.toUpperCase() + '\n';
      p += '\nProvide final state_updates. No choice_metadata needed. Respond with ONLY the JSON object.';
      return p;
    }
  };
})();
