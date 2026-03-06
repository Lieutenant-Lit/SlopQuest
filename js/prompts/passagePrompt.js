/**
 * SQ.PassagePrompt — Builds system and user prompts for passage generation.
 * Based on design doc Section 9.2 prompt template.
 */
(function () {
  SQ.PassagePrompt = {
    /**
     * Build the system prompt for passage generation.
     * Contains the full story context and response format specification.
     * @param {object} gameState - Full game state
     * @returns {string} System prompt
     */
    buildSystem: function (gameState) {
      var meta = gameState.meta || {};
      var difficulty = meta.difficulty || 'normal';
      var isHardOrBrutal = difficulty === 'hard' || difficulty === 'brutal';

      var p = '';

      p += 'You are the narrator of an interactive gamebook. You write vivid, engaging prose in ';
      p += (meta.perspective || 'second person') + ' perspective, ';
      p += (meta.tense || 'present') + ' tense, with a ';
      p += (meta.writing_style || 'literary') + ' style and ';
      p += (meta.tone || 'dark and atmospheric') + ' tone.\n\n';

      p += 'OUTPUT FORMAT: Respond with ONLY a valid JSON object. No markdown, no code fences, no prose outside the JSON. ';
      p += 'The passage text goes inside the "passage" field as a string. Nothing before or after the JSON.\n\n';

      // Story skeleton
      p += 'STORY SKELETON:\n';
      p += JSON.stringify(gameState.skeleton, null, 2) + '\n\n';

      // Current game state sections
      p += 'CURRENT PLAYER STATE:\n';
      p += JSON.stringify(gameState.player, null, 2) + '\n\n';

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

      // Difficulty parameters
      var diffConfig = SQ.DifficultyConfig[difficulty] || SQ.DifficultyConfig.normal;
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
      p += '  "passage": "string — the narrative passage, 150-300 words",\n';
      p += '  "illustration_prompt": "string — a concise visual description of the key moment for image generation",\n';
      p += '  "state_updates": {\n';
      p += '    "player_changes": { "health": number, "resources": {...}, "inventory": [...], "status_effects": [...], "skills": [...] },\n';
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
      p += '  "choices": {\n';
      p += '    "A": { "text": "string — choice description shown to player"';
      if (isHardOrBrutal) {
        p += ',\n           "outcome": "string — advance_safe|advance_risky|severe_penalty|death|hidden_benefit"';
        p += ',\n           "consequence": "string — what happens mechanically"';
        p += ',\n           "narration_directive": "string — narration instructions for next turn"';
      }
      p += ' },\n';
      p += '    "B": { ... }, "C": { ... }, "D": { ... }\n';
      p += '  }\n';
      p += '}\n\n';

      // Rules
      p += 'RULES:\n';
      p += '- Respond with ONLY the JSON object — nothing before it, nothing after it\n';
      p += '- Stay consistent with the skeleton\'s locked constraints for the current act\n';
      p += '- Reference and advance pending consequences when their triggers are met\n';
      p += '- Keep the passage between 150-300 words\n';
      p += '- All four choices should feel plausible and interesting\n';
      p += '- Never reveal information the skeleton marks as hidden/secret unless the act\'s end condition has been met\n';
      p += '- Decrement scenes_remaining on all pending consequences\n';
      p += '- Update proximity_to_climax based on how close the act\'s end condition is\n';
      p += '- Only include changed fields in state_updates (omit unchanged fields)\n';
      p += '- Only include player_changes fields that actually changed\n';

      // Tier-specific passage rules
      if (difficulty === 'chill') {
        p += '\nCHILL MODE RULES (MANDATORY):\n';
        p += '- NEVER set game_over to true. The player cannot die on Chill.\n';
        p += '- NEVER reduce health below ' + diffConfig.health_floor + '. If a consequence would reduce health below ' + diffConfig.health_floor + ', clamp it to ' + diffConfig.health_floor + '.\n';
        p += '- Maximum health penalty per turn: ' + diffConfig.max_health_penalty + ' points\n';
        p += '- Consequences are mild: lost items, delayed progress, NPC annoyance — never life-threatening\n';
        p += '- Include at least 3 clearly safe choices out of 4. The "risky" choice should have minor consequences at most.\n';
        p += '- Resources are generous. Include opportunities to gain gold/provisions regularly.\n';
        p += '- When resources run low, have NPCs offer help or make resources easy to find.\n';
        p += '- Hints should be obvious. If a choice is suboptimal, make the warning clear in the choice text.\n';
        p += '- NPCs are forgiving. Even if the player makes mistakes, NPCs come around quickly.\n';
      } else if (difficulty === 'normal') {
        p += '\nNORMAL MODE RULES (MANDATORY):\n';
        p += '- NEVER set game_over to true. The player cannot die on Normal.\n';
        p += '- NEVER reduce health below ' + diffConfig.health_floor + '. Clamp health to ' + diffConfig.health_floor + ' minimum.\n';
        p += '- Maximum health penalty per turn: ' + diffConfig.max_health_penalty + ' points\n';
        p += '- Consequences are meaningful but recoverable: health loss, resource costs, relationship damage\n';
        p += '- Approximately 2 safe and 2 risky choices per turn. Risky choices should have bigger rewards.\n';
        p += '- Resources drain at a moderate rate. Include periodic opportunities to gain resources.\n';
        p += '- Hints are moderate: choice text should give reasonable context without spelling out outcomes.\n';
        p += '- NPCs can be upset but always have a path to reconciliation.\n';
      } else if (difficulty === 'hard') {
        p += '\nHARD MODE RULES (MANDATORY):\n';
        p += '- Include outcome, consequence, and narration_directive on every choice\n';
        p += '- Maintain safe_choice_ratio: approximately ' + diffConfig.safe_choice_ratio + ' of choices should be advance_safe\n';
        p += '- Death is possible but MUST be foreshadowed. If a choice is lethal, there should have been clues in earlier passages.\n';
        p += '- Maximum health penalty per turn: ' + diffConfig.max_health_penalty + ' points (except for death outcomes)\n';
        p += '- Resources are scarce. Gaining resources should require effort or trade-offs.\n';
        p += '- Pending consequences escalate fast: 1-2 scenes before they trigger.\n';
        p += '- Hints are subtle: the information is available but not highlighted. Attentive players will see the warnings.\n';
        p += '- NPCs have low forgiveness. Burning a relationship has lasting mechanical consequences.\n';
        p += '- Include at least one advance_risky or severe_penalty outcome per set of choices.\n';
      } else if (difficulty === 'brutal') {
        p += '\nBRUTAL MODE RULES (MANDATORY):\n';
        p += '- Include outcome, consequence, and narration_directive on every choice\n';
        p += '- Maintain safe_choice_ratio: approximately ' + diffConfig.safe_choice_ratio + ' of choices should be advance_safe\n';
        p += '- At most 1 clearly safe choice per turn. At least 1 choice should be lethal or severely punishing.\n';
        p += '- Health penalties are large: ' + diffConfig.max_health_penalty + ' point maximum. A bad choice can kill from full health.\n';
        p += '- Resources drain aggressively. Every passage should cost something — provisions, gold, health, or relationships.\n';
        p += '- Pending consequences trigger immediately (0-1 scenes). No grace period.\n';
        p += '- Hints are cryptic. The player must interpret subtle clues from world state, NPC behavior, and earlier events.\n';
        p += '- Some death choices should appear safe. Use trap logic — the "obvious" safe choice is actually the lethal one.\n';
        p += '- Death narration must be vivid and final. No softening, no "barely survived", no last-minute saves.\n';
        p += '- NPCs never forgive. One wrong interaction permanently closes that NPC\'s alliance.\n';
        p += '- Create cascading danger: if the player is already wounded or low on resources, make the situation worse, not easier.\n';
      }

      return p;
    },

    /**
     * Build the user prompt for passage generation.
     * Contains the player's choice and any outcome directives.
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

        // On Hard/Brutal, include predetermined outcome directives
        if (choice.outcome) {
          p += '\n\nOUTCOME CLASSIFICATION: ' + choice.outcome.toUpperCase();
          if (choice.consequence) p += '\nConsequence: ' + choice.consequence;
          if (choice.narration_directive) {
            p += '\nNARRATION DIRECTIVE: ' + choice.narration_directive;
            p += '\nYou MUST narrate this outcome exactly as classified. Do not soften, alter, or provide alternatives to the predetermined outcome.';
          }

          // Death-specific instruction
          if (choice.outcome === 'death') {
            p += '\n\nThe character DIES here. Narrate the death vividly and definitively. Do not offer survival, last-minute rescues, or "barely alive" outcomes. Set game_over to true in state_updates.';
          }
        }
      }

      p += '\n\nGenerate the next passage and four new choices. Respond with ONLY the JSON object.';
      return p;
    }
  };
})();
