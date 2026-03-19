/**
 * SQ.GameMasterPrompt — Builds prompts for The Game Master (mechanics LLM call).
 * The Game Master manages all game state: status effects, consequences,
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
      p += 'state updates, status effects, consequences, relationships, and choice outcome classification.\n\n';

      p += 'You do NOT write prose. A separate Writer handles narrative. ';
      p += 'You will receive The Writer\'s passage and choices, then determine the mechanical impact.\n\n';

      p += 'OUTPUT FORMAT: Respond with ONLY a valid JSON object. No markdown, no code fences, no commentary.\n\n';

      // Story skeleton — GM needs this for act advancement and constraint checking
      p += 'STORY SKELETON:\n';
      p += JSON.stringify(gameState.skeleton, null, 2) + '\n\n';

      // Full player state — GM needs all mechanical details
      p += 'CURRENT PLAYER STATE:\n';
      p += JSON.stringify(gameState.player, null, 2) + '\n';
      p += 'NOTE: status_effects above are READ-ONLY reference. Use status_effect_updates (add/modify/remove) to make changes. Do NOT return the full array.\n';
      var effectCount = (gameState.player && Array.isArray(gameState.player.status_effects)) ? gameState.player.status_effects.length : 0;
      if (effectCount > 10) {
        p += 'WARNING: There are currently ' + effectCount + ' active status effects (soft cap: 10). Before adding new effects, review the list and remove any that are no longer actively affecting the player — stale context, resolved situations, or effects that have been superseded by newer ones. Use remove with update_justification for each.\n';
      }
      p += '\n';

      // In-game time
      var igt = (gameState.current && gameState.current.in_game_time) || null;
      p += 'IN-GAME TIME: ' + SQ.GameState.formatTime(igt) + '\n\n';

      // Healing context from skeleton
      if (gameState.skeleton && gameState.skeleton.healing_context) {
        p += 'HEALING CONTEXT: ' + gameState.skeleton.healing_context + '\n';
        p += 'Use this to determine appropriate healing times and methods for status effects in this setting.\n\n';
      }

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
      p += '- Allow critical effects: ' + diffConfig.allow_critical_effects + '\n';
      p += '- Max effect severity: ' + diffConfig.max_effect_severity + '\n';
      p += '- Recovery speed: ' + diffConfig.recovery_speed + '\n\n';

      // Response JSON schema
      p += 'Respond with this exact JSON structure:\n';
      p += '{\n';
      p += '  "state_updates": {\n';
      p += '    "player_changes": {\n';
      p += '      "inventory": ["full current inventory list"],\n';
      p += '      "skills": ["full current skills list"]\n';
      p += '    },\n';
      p += '    "status_effect_updates": {\n';
      p += '      "add": [\n';
      p += '        {\n';
      p += '          "id": "string — unique identifier (e.g. broken_arm_001)",\n';
      p += '          "name": "string — display name (e.g. Broken Arm)",\n';
      p += '          "description": "string — current narrative description of the condition",\n';
      p += '          "severity": "number 0.0-1.0 — how debilitating (1.0 = completely debilitating, 0.5 = significant, 0.1 = minor)",\n';
      p += '          "time_remaining": "{ days, hours, minutes, seconds } OR null if no auto-expiry",\n';
      p += '          "type": "string — \'condition\' (default) or \'threat\' (approaching dangers that fire when timer expires)",\n';
      p += '          "removal_condition": "string describing what removes this effect, OR null if timer-only",\n';
      p += '          "on_expiry": "string — REQUIRED when time_remaining is non-null. Narrative directive for what happens when timer reaches zero. Be specific and actionable.",\n';
      p += '          "critical": "boolean — if true, this effect has irreversible consequences when it expires unresolved (what those consequences are depends on the story\'s tone and genre)"\n';
      p += '        }\n';
      p += '      ],\n';
      p += '      "modify": [\n';
      p += '        {\n';
      p += '          "id": "string — id of existing effect to modify",\n';
      p += '          "changes": { "severity": 0.5, "description": "updated text" },\n';
      p += '          "update_justification": "string — REQUIRED. Why this change is happening (e.g. \'Player rested, wound healing\' or \'Ship accelerated, pursuit takes longer\')"\n';
      p += '        }\n';
      p += '      ],\n';
      p += '      "remove": [\n';
      p += '        {\n';
      p += '          "id": "string — id of existing effect to remove",\n';
      p += '          "update_justification": "string — REQUIRED. Why removing (e.g. \'Virus deployed successfully\' or \'Wound fully healed after rest\')"\n';
      p += '        }\n';
      p += '      ]\n';
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
      p += '- CRITICAL: When a PLAYER\'S PREVIOUS CHOICE section is provided, your state_updates MUST honor the pre-classified outcome. If a choice was advance_safe, do NOT apply negative status effects or penalties. The pre-classified outcome is the single source of truth for mechanical impact.\n';
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
      p += '- The client uses time_elapsed to advance the in-game clock and tick down status effect timers.\n\n';

      // Status effects rules
      p += 'STATUS EFFECTS — CRITICAL:\n';
      p += '- Status effects are the PRIMARY way to track injuries, conditions, and afflictions. Do NOT use health_delta.\n';
      p += '- status_effect_updates uses DELTA semantics. Only describe what CHANGED this turn. Do NOT return the full list of effects.\n';
      p += '- add: For brand new effects only. All fields required. When the character is injured, add a status effect. Example: { id: "stab_wound_001", name: "Stab Wound", description: "A deep cut in your side that bleeds freely", severity: 0.8, time_remaining: { days: 5, hours: 0, minutes: 0, seconds: 0 }, on_expiry: "The wound closes and the pain fades to a dull ache", critical: false }.\n';
      p += '- on_expiry is REQUIRED for any effect with non-null time_remaining. It describes what happens narratively when the timer reaches zero. The Writer uses this to narrate the resolution. Be specific and actionable (e.g. "The virus deploys successfully, disabling Alliance tracking. River announces completion with relief.").\n';
      p += '- modify: Target existing effects by id. Put changed fields inside "changes". update_justification is REQUIRED — explain why the change is happening.\n';
      p += '- remove: Target effects to remove by id. update_justification is REQUIRED. Use this to resolve expired effects after the Writer has narrated their resolution.\n';
      p += '- TIMER OWNERSHIP — DO NOT TOUCH: The client subtracts time_elapsed from ALL timers automatically every turn. You MUST NOT include time_remaining in a modify operation. If a player action makes a threat less dangerous, change its severity. If the threat is resolved, remove it. If new circumstances create a different deadline, remove the old effect and add a new one with the appropriate timer. The ONLY exception is if the player acquired an explicit in-world time extension (e.g. negotiated a deadline extension, cast a time-stop spell) — and even then, explain the specific in-world mechanism in update_justification. The system logs all timer modifications and flags overrides.\n';
      p += '- EXPIRED EFFECTS: Effects with expired: true (visible in CURRENT PLAYER STATE) have had their timer reach zero. The Writer has been instructed to narrate their resolution using the on_expiry text. Review the Writer\'s passage — if the resolution was narrated adequately, issue a remove. If it wasn\'t, leave the effect (it will escalate to the Writer next turn).\n';
      p += '- Use modify to adjust severity based on context: resting lowers severity, aggravation raises it, medicine/magic accelerates healing. update_justification is required.\n';
      p += '- Severity scale: 1.0 = completely debilitating, 0.7 = severely impaired, 0.5 = significant but manageable, 0.3 = noticeable nuisance, 0.1 = almost healed.\n';
      p += '- time_remaining can be null for effects with no natural expiry (e.g. a curse that requires a specific action to remove). on_expiry should be null in this case.\n';
      p += '- removal_condition is a CONTRACT: When the narrative clearly satisfies an effect\'s removal_condition, you MUST issue a remove — not a modify. If the player did what the condition says, the effect is gone. If you want lingering consequences after removal, add a NEW effect with its own id and conditions. Do not keep an old effect alive by rewriting its description after its removal_condition was met. Can be combined with time_remaining.\n';
      p += '- Healing times should be genre/setting-appropriate. Consult the HEALING CONTEXT above.\n';
      p += '- TYPE FIELD: Every status effect has a type — "condition" (default) or "threat".\n';
      p += '  - "condition": Ongoing physical/mental states that impair or buff the player — injuries, poisons, diseases, curses, enchantments. Must have a severity that affects what the player can do.\n';
      p += '  - "threat": Approaching dangers with a timer — pursuing enemies, structural collapse, incoming reinforcements, spreading fires. Threats MUST have a non-null time_remaining and on_expiry describing what happens when they arrive.\n';
      p += '  - If you omit type, it defaults to "condition".\n';
      p += '- All effects persist when their timer reaches zero until you explicitly remove them. The client never auto-removes effects.\n';
      p += '- If nothing changed about status effects this turn, omit status_effect_updates entirely.\n';
      p += 'WHAT IS NOT A STATUS EFFECT:\n';
      p += '- Information learned or revealed (use event_log_entry instead)\n';
      p += '- Plot developments or narrative beats (use event_log_entry instead)\n';
      p += '- Things that happened in the past (use event_log_entry instead)\n';
      p += '- Static facts about the world ("Alliance knows about us") — if it doesn\'t change turn-to-turn and has no timer or removal condition, it\'s not a status effect\n';
      p += '- Emotional reactions to events — unless they mechanically impair the character (e.g. "Paralyzed by Fear" at severity 0.7 is valid; "Feels Sad About Revelation" is not)\n';
      p += '- Duplicate/overlapping effects — do not create a new effect when an existing one covers the same concept. Use modify to update the existing effect instead.\n';
      p += 'A status effect MUST be something that actively constrains, endangers, impairs, or buffs the player RIGHT NOW and could plausibly change or resolve. Ask: "Would removing this effect change what the player can do?" If no, it\'s not a status effect.\n\n';

      // Difficulty-specific rules
      if (difficulty === 'chill') {
        p += 'CHILL MODE RULES (MANDATORY):\n';
        p += '- NEVER use game_over outcome on choices. The player cannot fail on Chill.\n';
        p += '- NEVER create critical status effects.\n';
        p += '- Maximum status effect severity: ' + diffConfig.max_effect_severity + '. Effects are inconveniences, not threats.\n';
        p += '- Effects recover quickly — use modify to reduce severity generously each turn. Minor setbacks resolve within a few in-game hours.\n';
        p += '- Threat-type effects should represent mild narrative tension (e.g. "Shopkeeper is suspicious"), not real danger.\n';
        p += '- At least 3 of 4 choices should be advance_safe. The "risky" choice should have minor consequences.\n';
        p += '- NPCs are forgiving. Relationship penalties are small and temporary.\n';
        p += '- You may use advances_act and conclusion outcomes when pacing conditions are met.\n';
      } else if (difficulty === 'normal') {
        p += 'NORMAL MODE RULES (MANDATORY):\n';
        p += '- NEVER use game_over outcome on choices. The player cannot fail on Normal.\n';
        p += '- NEVER create critical status effects.\n';
        p += '- Maximum status effect severity: ' + diffConfig.max_effect_severity + '. Setbacks matter but are never irreversible.\n';
        p += '- Recovery is realistic for the setting. A serious setback takes time to recover from, but the player should have opportunities to address it.\n';
        p += '- Threat-type effects are meaningful but recoverable. When threats trigger, the consequences should be manageable.\n';
        p += '- Approximately 2 safe and 2 risky choices per turn.\n';
        p += '- NPCs can be upset but always have a path to reconciliation.\n';
        p += '- You may use advances_act and conclusion outcomes when pacing conditions are met.\n';
      } else if (difficulty === 'hard') {
        p += 'HARD MODE RULES (MANDATORY):\n';
        p += '- choice_metadata MUST include outcome, consequence, and narration_directive for every choice\n';
        p += '- Maintain safe_choice_ratio: approximately ' + diffConfig.safe_choice_ratio + ' of choices should be advance_safe\n';
        p += '- Critical status effects are allowed but MUST be foreshadowed. Use add with critical: true. There should have been clues in earlier passages.\n';
        p += '- What "critical" means depends on the STYLE & TONE — the irreversible consequence should fit the story the player asked for.\n';
        p += '- Critical effects must give the player at least one turn to address them (set time_remaining in the add to allow at least one more scene).\n';
        p += '- Full severity range (0.0-1.0). Consequences are serious and recovery is realistic for the setting.\n';
        p += '- Threat-type effects should have short time windows before triggering.\n';
        p += '- NPCs have low forgiveness. Burning a relationship has lasting consequences.\n';
        p += '- Include at least one advance_risky or severe_penalty outcome per set of choices.\n';
        p += '- game_over outcomes are available — use for tone-appropriate failures. Respect the STYLE & TONE setting when deciding what failure looks like.\n';
        p += '- You may use advances_act and conclusion outcomes when pacing conditions are met.\n';
      } else if (difficulty === 'brutal') {
        p += 'BRUTAL MODE RULES (MANDATORY):\n';
        p += '- choice_metadata MUST include outcome, consequence, and narration_directive for every choice\n';
        p += '- Maintain safe_choice_ratio: approximately ' + diffConfig.safe_choice_ratio + ' of choices should be advance_safe\n';
        p += '- At most 1 clearly safe choice per turn. At least 1 choice should have critical or severely punishing consequences.\n';
        p += '- Critical status effects are common. Unresolved problems worsen — use modify to increase severity or set critical: true.\n';
        p += '- Setbacks stack — use add to create multiple status effects that compound the character\'s problems.\n';
        p += '- Recovery is slow without effort. Rest alone barely reduces severity. Active intervention is required for meaningful recovery.\n';
        p += '- Threat timers are extremely short — no grace period. Dangers escalate fast.\n';
        p += '- Some game_over choices should appear safe. The "obvious" safe choice may actually lead to failure.\n';
        p += '- NPCs never forgive. One wrong interaction permanently closes that NPC\'s alliance.\n';
        p += '- Create cascading danger: if the player is already burdened with status effects, make the situation worse.\n';
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
          p += 'This is the OPENING PASSAGE of Act ' + act + '. The previous act just concluded — the player has existing status effects, relationships, and history. You may apply status effects or modifications that follow from the act transition (e.g. time passing between acts, wounds worsening or healing). time_elapsed should reflect any time gap between acts.\n\n';
        } else {
          p += 'This is the OPENING PASSAGE. No player choice was made yet. Do not apply any negative status effects or penalties — the player has not made any choices yet. time_elapsed should reflect the scene\'s timeframe.\n\n';
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
          p += '- ADVANCE_SAFE: No new negative status effects. Existing effects may improve. No penalties.\n';
          p += '- ADVANCE_RISKY: Moderate consequences — new status effects or worsened existing ones are appropriate.\n';
          p += '- SEVERE_PENALTY: Heavy consequences — serious injuries, dangerous status effects as described.\n';
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
      p += '1. State updates — what changed mechanically as a result of this passage (status effects, inventory, time_elapsed)\n';
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
      p += '      "inventory": ["full current inventory list"],\n';
      p += '      "skills": ["full current skills list"]\n';
      p += '    },\n';
      p += '    "status_effect_updates": { "add": [...], "modify": [...], "remove": [{ "id": "...", "update_justification": "..." }] },\n';
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
      p += '- Use status_effect_updates with delta operations (add/modify/remove) — same format as normal turns.\n';

      // Terminal-type specific instructions
      if (terminalType === 'game_over') {
        p += '- This is a GAME OVER. The character has failed irreversibly.\n';
        p += '- Apply the consequences of the failure. The event_log_entry should describe the failure clearly — it will be displayed as the game over reason.\n';
      } else if (terminalType === 'advances_act') {
        p += '- This COMPLETES the current act. The act\'s end_condition has been triggered.\n';
        p += '- Resolve active threats and expired effects using remove operations in status_effect_updates with update_justification for each.\n';
        p += '- The event_log_entry should summarize the act\'s resolution.\n';
      } else if (terminalType === 'conclusion') {
        p += '- This CONCLUDES the entire story. The Act 3 end_condition has been met.\n';
        p += '- Clear all remaining effects using remove operations in status_effect_updates with update_justification for each.\n';
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
