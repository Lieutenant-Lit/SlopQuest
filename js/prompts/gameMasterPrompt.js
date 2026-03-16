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
     * Deliberately excludes: writing style, tone, prose instructions.
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
      p += JSON.stringify(gameState.player, null, 2) + '\n\n';

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

      p += 'PENDING CONSEQUENCES:\n';
      p += JSON.stringify(gameState.pending_consequences, null, 2) + '\n\n';

      p += 'EVENT LOG (last 20):\n';
      p += JSON.stringify(gameState.event_log.slice(-20), null, 2) + '\n';
      if (gameState.backstory_summary) {
        p += 'Backstory summary: ' + gameState.backstory_summary + '\n';
      }
      p += '\n';

      p += 'WORLD STATE FLAGS:\n';
      p += JSON.stringify(gameState.world_flags, null, 2) + '\n\n';

      // Difficulty parameters
      p += 'DIFFICULTY: ' + diffConfig.label + '\n';
      p += '- Safe choice ratio: ' + diffConfig.safe_choice_ratio + '\n';
      p += '- Consequence severity: ' + diffConfig.consequence_severity + '\n';
      p += '- Game over allowed: ' + diffConfig.allow_game_over + '\n';
      p += '- Hint transparency: ' + diffConfig.hint_transparency + '\n';
      p += '- NPC forgiveness: ' + diffConfig.npc_forgiveness + '\n';
      p += '- Allow lethal effects: ' + diffConfig.allow_lethal_effects + '\n';
      p += '- Max effect severity: ' + diffConfig.max_effect_severity + '\n';
      p += '- Healing speed: ' + diffConfig.healing_speed + '\n\n';

      // Response JSON schema
      p += 'Respond with this exact JSON structure:\n';
      p += '{\n';
      p += '  "state_updates": {\n';
      p += '    "player_changes": {\n';
      p += '      "inventory": ["full current inventory list"],\n';
      p += '      "status_effects": [\n';
      p += '        {\n';
      p += '          "id": "string — unique identifier (e.g. broken_arm_001)",\n';
      p += '          "name": "string — display name (e.g. Broken Arm)",\n';
      p += '          "description": "string — current narrative description of the condition",\n';
      p += '          "severity": "number 0.0-1.0 — how debilitating (1.0 = completely debilitating, 0.5 = significant, 0.1 = minor)",\n';
      p += '          "time_remaining": "{ days, hours, minutes, seconds } OR null if no auto-expiry",\n';
      p += '          "removal_condition": "string describing what removes this effect, OR null if timer-only",\n';
      p += '          "lethal": "boolean — if true, character dies when timer expires unresolved"\n';
      p += '        }\n';
      p += '      ],\n';
      p += '      "skills": ["full current skills list"]\n';
      p += '    },\n';
      p += '    "time_elapsed": { "days": 0, "hours": 0, "minutes": 0, "seconds": 0 },\n';
      p += '    "new_pending_consequences": [ { "id": "string", "description": "string", "trigger": "string", "severity": "string", "time_remaining": { "days": 0, "hours": 0, "minutes": 0, "seconds": 0 } } ],\n';
      p += '    "resolved_consequences": [ "ids of consequences that fired this turn" ],\n';
      p += '    "event_log_entry": "string — one-line summary of what happened",\n';
      p += '    "world_flag_changes": { "flag_name": true/false },\n';
      p += '    "relationship_changes": { "npc_or_faction_name": number_delta },\n';
      p += '    "npc_updates": { "npc_name": { "role": "string (optional)", "motivation": "string (optional)", "allegiance": "string (optional)", "secret_revealed": "boolean (optional)", "companion": "boolean (optional)", "notes": "string — brief freeform context (optional)" } },\n';
      p += '    "new_scene_context": "string — brief context for next passage",\n';
      p += '    "proximity_to_climax": "number 0.0-1.0 — REQUIRED (see PACING)",\n';
      p += '    "advance_act": "true or false — REQUIRED (see PACING)",\n';
      p += '    "game_over": false,\n';
      p += '    "story_complete": "true when Act 3 end_condition is met (see PACING)"\n';
      p += '  },\n';
      p += '  "choice_metadata": {\n';
      if (isHardOrBrutal) {
        p += '    "A": { "outcome": "advance_safe|advance_risky|severe_penalty|death|hidden_benefit", "consequence": "what happens mechanically", "narration_directive": "instructions for the Writer next turn" },\n';
        p += '    "B": { ... }, "C": { ... }, "D": { ... }\n';
      } else {
        p += '    "A": { "outcome": "advance_safe|advance_risky", "consequence": "brief mechanical note" },\n';
        p += '    "B": { ... }, "C": { ... }, "D": { ... }\n';
      }
      p += '  }\n';
      p += '}\n\n';

      // General rules
      p += 'RULES:\n';
      p += '- Respond with ONLY the JSON object — nothing before it, nothing after it\n';
      p += '- Only include player_changes, relationship_changes, world_flag_changes, new_pending_consequences, and resolved_consequences when they actually changed. Always include: time_elapsed, event_log_entry, proximity_to_climax, advance_act.\n';
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
      p += '- MINIMUM SCENES: Do NOT set advance_act to true if scenes_in_act < 3. Every act needs at least 3 scenes to develop properly.\n';
      p += '- If scenes_in_act >= target_scenes AND the act\'s end_condition is narratively close to being met, set advance_act to true.\n';
      p += '- If scenes_in_act exceeds target_scenes by 3 or more, you SHOULD set advance_act to true — the act has gone on too long. Drive the narrative forward.\n';
      p += '- When advance_act is true, also set proximity_to_climax to 1.0.\n';
      p += '- STORY COMPLETION: If the current act is Act 3 (the FINAL act) and its end_condition is met, set story_complete to true INSTEAD of advance_act. This ends the story.\n';
      p += '- When proximity_to_climax >= 0.7, your choice_metadata should steer toward the act\'s end_condition — offer choices that could trigger it.\n\n';

      // Time elapsed rules
      p += 'TIME ELAPSED — REQUIRED EVERY TURN:\n';
      p += '- You MUST include time_elapsed in state_updates to indicate how much in-game time passed during this scene.\n';
      p += '- Estimate realistically: a brief conversation = 5-15 minutes, a fight = 1-5 minutes, traveling across a city = 30-60 minutes, a journey = hours or days, sleeping/resting = 6-8 hours.\n';
      p += '- The client uses time_elapsed to advance the in-game clock and tick down status effect timers.\n\n';

      // Status effects rules
      p += 'STATUS EFFECTS — CRITICAL:\n';
      p += '- Status effects are the PRIMARY way to track injuries, conditions, and afflictions. Do NOT use health_delta.\n';
      p += '- status_effects is the FULL current list every turn (replace semantics). Include ALL active effects, adjusting severity and descriptions as appropriate.\n';
      p += '- When the character is injured, add a status effect instead of reducing health. Example: a stab wound becomes { id: "stab_wound_001", name: "Stab Wound", description: "A deep cut in your side that bleeds freely", severity: 0.8, time_remaining: { days: 5, hours: 0, minutes: 0, seconds: 0 }, lethal: false }.\n';
      p += '- Adjust severity each turn based on context: resting lowers severity, aggravation raises it, medicine/magic accelerates healing.\n';
      p += '- Severity scale: 1.0 = completely debilitating, 0.7 = severely impaired, 0.5 = significant but manageable, 0.3 = noticeable nuisance, 0.1 = almost healed.\n';
      p += '- time_remaining can be null for effects with no natural expiry (e.g. a curse that requires a specific action to remove).\n';
      p += '- removal_condition can be set for effects that need specific actions (e.g. "Find the Witch of the Moor to break this curse"). Can be combined with time_remaining.\n';
      p += '- Healing times should be genre/setting-appropriate. Consult the HEALING CONTEXT above. Realistic settings = realistic healing (broken bone: weeks, minor cut: days). Fantasy/sci-fi = faster if the setting provides healing methods.\n\n';

      // Pending consequences rules
      p += 'PENDING CONSEQUENCES:\n';
      p += '- New consequences use time_remaining ({ days, hours, minutes, seconds }) instead of scenes_remaining. Estimate how much in-game time before the consequence triggers.\n';
      p += '- The client ticks down consequence time_remaining by time_elapsed each turn.\n\n';

      // Difficulty-specific rules
      if (difficulty === 'chill') {
        p += 'CHILL MODE RULES (MANDATORY):\n';
        p += '- NEVER set game_over to true. The player cannot die on Chill.\n';
        p += '- NEVER create lethal status effects.\n';
        p += '- Maximum status effect severity: ' + diffConfig.max_effect_severity + '. Effects are inconveniences, not threats.\n';
        p += '- Effects heal quickly — reduce severity generously each turn. Minor injuries resolve within a few in-game hours.\n';
        p += '- Consequences are mild: lost items, delayed progress, NPC annoyance — never life-threatening\n';
        p += '- At least 3 of 4 choices should be advance_safe. The "risky" choice should have minor consequences.\n';
        p += '- NPCs are forgiving. Relationship penalties are small and temporary.\n';
      } else if (difficulty === 'normal') {
        p += 'NORMAL MODE RULES (MANDATORY):\n';
        p += '- NEVER set game_over to true. The player cannot die on Normal.\n';
        p += '- NEVER create lethal status effects.\n';
        p += '- Maximum status effect severity: ' + diffConfig.max_effect_severity + '. Injuries matter but are never fatal.\n';
        p += '- Healing is realistic for the setting. A serious wound takes days to heal, but the player should have opportunities to find medicine or rest.\n';
        p += '- Consequences are meaningful but recoverable: injuries, lost items, relationship damage\n';
        p += '- Approximately 2 safe and 2 risky choices per turn.\n';
        p += '- NPCs can be upset but always have a path to reconciliation.\n';
      } else if (difficulty === 'hard') {
        p += 'HARD MODE RULES (MANDATORY):\n';
        p += '- choice_metadata MUST include outcome, consequence, and narration_directive for every choice\n';
        p += '- Maintain safe_choice_ratio: approximately ' + diffConfig.safe_choice_ratio + ' of choices should be advance_safe\n';
        p += '- Lethal status effects are allowed but MUST be foreshadowed. If an effect will kill the player, there should have been clues in earlier passages.\n';
        p += '- Lethal effects must give the player at least one turn to address them (set time_remaining to allow at least one more scene).\n';
        p += '- Full severity range (0.0-1.0). Injuries are serious and heal realistically.\n';
        p += '- Pending consequences escalate fast: short time windows before they trigger.\n';
        p += '- NPCs have low forgiveness. Burning a relationship has lasting consequences.\n';
        p += '- Include at least one advance_risky or severe_penalty outcome per set of choices.\n';
      } else if (difficulty === 'brutal') {
        p += 'BRUTAL MODE RULES (MANDATORY):\n';
        p += '- choice_metadata MUST include outcome, consequence, and narration_directive for every choice\n';
        p += '- Maintain safe_choice_ratio: approximately ' + diffConfig.safe_choice_ratio + ' of choices should be advance_safe\n';
        p += '- At most 1 clearly safe choice per turn. At least 1 choice should be lethal or severely punishing.\n';
        p += '- Lethal status effects are common. Unattended wounds can worsen and become lethal.\n';
        p += '- Injuries stack — multiple status effects compound the character\'s impairment.\n';
        p += '- Healing is slow without supplies. Rest alone barely reduces severity. Medicine, magic, or proper treatment is required for meaningful recovery.\n';
        p += '- Pending consequences trigger quickly — short time windows. No grace period.\n';
        p += '- Some death choices should appear safe. The "obvious" safe choice may actually be lethal.\n';
        p += '- NPCs never forgive. One wrong interaction permanently closes that NPC\'s alliance.\n';
        p += '- Create cascading danger: if the player is already injured or burdened with status effects, make the situation worse.\n';
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

      // Opening passage — no choice was made, no penalties allowed
      if (!choiceId) {
        p += 'This is the OPENING PASSAGE. No player choice was made yet. Do not apply any negative status effects or penalties — the player has not made any choices yet. time_elapsed should reflect the scene\'s timeframe.\n\n';
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
          p += '- DEATH: set game_over to true.\n';
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
    }
  };
})();
