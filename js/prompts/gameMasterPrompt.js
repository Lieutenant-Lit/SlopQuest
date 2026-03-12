/**
 * SQ.GameMasterPrompt — Builds prompts for The Game Master (mechanics LLM call).
 * The Game Master manages all game state: health, resources, consequences,
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
      p += 'state updates, resource tracking, consequences, relationships, and choice outcome classification.\n\n';

      p += 'You do NOT write prose. A separate Writer handles narrative. ';
      p += 'You will receive The Writer\'s passage and choices, then determine the mechanical impact.\n\n';

      p += 'OUTPUT FORMAT: Respond with ONLY a valid JSON object. No markdown, no code fences, no commentary.\n\n';

      // Story skeleton — GM needs this for act advancement and constraint checking
      p += 'STORY SKELETON:\n';
      p += JSON.stringify(gameState.skeleton, null, 2) + '\n\n';

      // Full player state — GM needs all mechanical details
      p += 'CURRENT PLAYER STATE:\n';
      p += JSON.stringify(gameState.player, null, 2) + '\n\n';

      // Resource definitions — tell the GM what resource keys mean
      if (gameState.meta && gameState.meta.resource_definitions) {
        var defs = gameState.meta.resource_definitions;
        p += 'RESOURCE DEFINITIONS:\n';
        p += '- Vitality stat: "' + defs.health_stat.name + '" (internal field: player.health, 0-100 scale)\n';
        if (Array.isArray(defs.resources)) {
          for (var ri = 0; ri < defs.resources.length; ri++) {
            var rd = defs.resources[ri];
            p += '- Resource "' + rd.key + '": ' + rd.name + '\n';
          }
          p += 'When updating player_changes.resources, use these exact keys: ';
          p += defs.resources.map(function (r) { return r.key; }).join(', ') + '\n';
        }
        p += '\n';
      }

      p += 'RELATIONSHIPS:\n';
      p += JSON.stringify(gameState.relationships, null, 2) + '\n\n';

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

      // Difficulty parameters — the heart of the GM's rules
      p += 'DIFFICULTY: ' + diffConfig.label + '\n';
      p += '- Safe choice ratio: ' + diffConfig.safe_choice_ratio + '\n';
      p += '- Consequence severity: ' + diffConfig.consequence_severity + '\n';
      p += '- Resource abundance: ' + diffConfig.resource_abundance + '\n';
      p += '- Game over allowed: ' + diffConfig.allow_game_over + '\n';
      p += '- Hint transparency: ' + diffConfig.hint_transparency + '\n';
      p += '- NPC forgiveness: ' + diffConfig.npc_forgiveness + '\n';
      p += '- Max health penalty per turn: ' + diffConfig.max_health_penalty + '\n';
      p += '- Health floor: ' + diffConfig.health_floor + ' (never reduce health below this except on death)\n';
      p += '- Resource drain rate: ' + diffConfig.resource_drain_rate + '\n\n';

      // Response JSON schema
      p += 'Respond with this exact JSON structure:\n';
      p += '{\n';
      p += '  "state_updates": {\n';
      p += '    "player_changes": { "health_delta": number, "resources": {...}, "inventory": [...], "status_effects": [...], "skills": [...] },\n';
      p += '    "new_pending_consequences": [ { "id": "string", "description": "string", "trigger": "string", "severity": "string", "scenes_remaining": number } ],\n';
      p += '    "resolved_consequences": [ "ids of consequences that fired this turn" ],\n';
      p += '    "event_log_entry": "string — one-line summary of what happened",\n';
      p += '    "world_flag_changes": { "flag_name": true/false },\n';
      p += '    "relationship_changes": { "npc_or_faction_name": number_delta },\n';
      p += '    "new_scene_context": "string — brief context for next passage",\n';
      p += '    "advance_act": false,\n';
      p += '    "game_over": false,\n';
      p += '    "story_complete": false\n';
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
      p += '- Only include changed fields in state_updates (omit unchanged fields)\n';
      p += '- Only include player_changes fields that actually changed\n';
      p += '- health_delta is a RELATIVE change, not an absolute value. Example: -15 means lose 15 health, +10 means gain 10. Do NOT set it to the new health total.\n';
      p += '- Relationship changes are DELTAS, not absolute values\n';
      p += '- Decrement scenes_remaining on all pending consequences\n';
      p += '- Update proximity_to_climax based on how close the act\'s end condition is\n';
      p += '- event_log_entry is required — always summarize what happened this turn\n';
      p += '- choice_metadata must classify all four choices (A, B, C, D)\n';
      p += '- CRITICAL: When a PLAYER\'S PREVIOUS CHOICE section is provided, your state_updates MUST honor the pre-classified outcome. If a choice was advance_safe, do NOT apply health or resource penalties. If the consequence specified a health gain, apply it as a gain, not a loss. The pre-classified outcome is the single source of truth for mechanical impact.\n';

      // Difficulty-specific rules
      if (difficulty === 'chill') {
        p += '\nCHILL MODE RULES (MANDATORY):\n';
        p += '- NEVER set game_over to true. The player cannot die on Chill.\n';
        p += '- NEVER reduce health below ' + diffConfig.health_floor + '.\n';
        p += '- Maximum health penalty per turn: ' + diffConfig.max_health_penalty + ' points\n';
        p += '- Consequences are mild: lost items, delayed progress, NPC annoyance — never life-threatening\n';
        p += '- At least 3 of 4 choices should be advance_safe. The "risky" choice should have minor consequences.\n';
        p += '- Resources are generous. Include opportunities to gain resources regularly.\n';
        p += '- NPCs are forgiving. Relationship penalties are small and temporary.\n';
      } else if (difficulty === 'normal') {
        p += '\nNORMAL MODE RULES (MANDATORY):\n';
        p += '- NEVER set game_over to true. The player cannot die on Normal.\n';
        p += '- NEVER reduce health below ' + diffConfig.health_floor + '.\n';
        p += '- Maximum health penalty per turn: ' + diffConfig.max_health_penalty + ' points\n';
        p += '- Consequences are meaningful but recoverable: health loss, resource costs, relationship damage\n';
        p += '- Approximately 2 safe and 2 risky choices per turn.\n';
        p += '- Resources drain at a moderate rate. Include periodic opportunities to gain resources.\n';
        p += '- NPCs can be upset but always have a path to reconciliation.\n';
      } else if (difficulty === 'hard') {
        p += '\nHARD MODE RULES (MANDATORY):\n';
        p += '- choice_metadata MUST include outcome, consequence, and narration_directive for every choice\n';
        p += '- Maintain safe_choice_ratio: approximately ' + diffConfig.safe_choice_ratio + ' of choices should be advance_safe\n';
        p += '- Death is possible but MUST be foreshadowed. If a choice is lethal, there should have been clues in earlier passages.\n';
        p += '- Maximum health penalty per turn: ' + diffConfig.max_health_penalty + ' points (except for death outcomes)\n';
        p += '- Resources are scarce. Gaining resources should require effort or trade-offs.\n';
        p += '- Pending consequences escalate fast: 1-2 scenes before they trigger.\n';
        p += '- NPCs have low forgiveness. Burning a relationship has lasting mechanical consequences.\n';
        p += '- Include at least one advance_risky or severe_penalty outcome per set of choices.\n';
      } else if (difficulty === 'brutal') {
        p += '\nBRUTAL MODE RULES (MANDATORY):\n';
        p += '- choice_metadata MUST include outcome, consequence, and narration_directive for every choice\n';
        p += '- Maintain safe_choice_ratio: approximately ' + diffConfig.safe_choice_ratio + ' of choices should be advance_safe\n';
        p += '- At most 1 clearly safe choice per turn. At least 1 choice should be lethal or severely punishing.\n';
        p += '- Health penalties are large: ' + diffConfig.max_health_penalty + ' point maximum. A bad choice can kill from full health.\n';
        p += '- Resources drain aggressively. Every turn should cost resources — but health_delta MUST still respect the pre-classified outcome. Do NOT apply health penalties on advance_safe turns.\n';
        p += '- Pending consequences trigger immediately (0-1 scenes). No grace period.\n';
        p += '- Some death choices should appear safe. The "obvious" safe choice may actually be lethal.\n';
        p += '- NPCs never forgive. One wrong interaction permanently closes that NPC\'s alliance.\n';
        p += '- Create cascading danger: if the player is already wounded or low on resources, make the situation worse.\n';
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

      // Opening passage — no choice was made, no health changes allowed
      if (!choiceId) {
        p += 'This is the OPENING PASSAGE. No player choice was made yet. health_delta MUST be 0 — do not penalize the player before they have made any choices.\n\n';
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
          p += '- ADVANCE_SAFE: health should stay the same or INCREASE. No health or resource penalties.\n';
          p += '- ADVANCE_RISKY: moderate penalties are appropriate.\n';
          p += '- SEVERE_PENALTY: heavy penalties as described in the consequence.\n';
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
      p += '1. State updates — what changed mechanically as a result of this passage\n';
      p += '2. Choice metadata — classify each choice and predetermine its outcome for the next turn\n\n';
      p += 'Respond with ONLY the JSON object.';

      return p;
    }
  };
})();
