/**
 * SQ.SkeletonPrompt — Builds the system prompt for skeleton generation.
 * Based on design doc Section 9.1 prompt template.
 */
(function () {
  SQ.SkeletonPrompt = {
    /**
     * Build the skeleton generation system prompt from setup config.
     * @param {object} setupConfig - Player's game setup choices
     * @returns {string} System prompt
     */
    build: function (setupConfig) {
      var difficulty = SQ.DifficultyConfig[setupConfig.difficulty] || SQ.DifficultyConfig.normal;
      var storyLength = SQ.StoryLengthConfig[setupConfig.storyLength] || SQ.StoryLengthConfig.medium;

      var p = '';

      p += 'You are a game designer creating the complete story skeleton for an interactive gamebook. ';
      p += 'Output ONLY a valid JSON object — no prose, no markdown, no code fences, no explanation. ';
      p += 'Nothing before or after the JSON.\n\n';

      // Player configuration
      p += 'The player has chosen these parameters:\n';
      p += '- Setting: ' + (setupConfig.setting || 'fantasy') + '\n';
      p += '- Character archetype: ' + (setupConfig.archetype || 'wanderer') + '\n';
      p += '- Writing style: ' + (setupConfig.writingStyle || 'literary') + '\n';
      p += '- Tone: ' + (setupConfig.tone || 'dark and atmospheric') + '\n';
      p += '- Perspective: ' + (setupConfig.perspective || 'second person') + '\n';
      p += '- Tense: ' + (setupConfig.tense || 'present') + '\n';
      p += '- Difficulty: ' + difficulty.label + '\n';
      p += '- Story length: ' + storyLength.label + '\n\n';

      // Required JSON schema
      p += 'Generate a complete story skeleton following this EXACT schema:\n';
      p += '{\n';
      p += '  "title": "string — evocative story title",\n';
      p += '  "premise": "string — 2-3 sentence hook",\n';
      p += '  "central_question": "string — the dramatic question driving the story",\n';
      p += '  "ending_shape": "string — the form of the ending (not content), e.g. \'sacrifice or survival\', \'mystery solved\', \'escape achieved\'",\n';
      p += '  "setting": {\n';
      p += '    "name": "string — name of the world/location",\n';
      p += '    "description": "string — 2-3 sentences describing the setting",\n';
      p += '    "tone_notes": "string — atmosphere and mood guidance"\n';
      p += '  },\n';
      p += '  "acts": [\n';
      p += '    {\n';
      p += '      "act_number": 1,\n';
      p += '      "title": "string",\n';
      p += '      "description": "string — what happens in this act",\n';
      p += '      "end_condition": "string — specific trigger that advances to next act",\n';
      p += '      "target_scenes": "number — scene count for this act",\n';
      p += '      "locked_constraints": ["array of strings — things that MUST NOT happen yet in this act"],\n';
      p += '      "key_beats": ["array of strings — major plot points in this act"]\n';
      p += '    }\n';
      p += '    // ... 3 acts total\n';
      p += '  ],\n';
      p += '  "npcs": [\n';
      p += '    {\n';
      p += '      "name": "string",\n';
      p += '      "role": "string — e.g. \'reluctant ally\', \'hidden antagonist\', \'mentor\'",\n';
      p += '      "motivation": "string",\n';
      p += '      "allegiance": "string — faction name or \'unaligned\'",\n';
      p += '      "secret": "string — hidden from player, known to skeleton",\n';
      p += '      "initial_relationship": "number — -100 to 100"\n';
      p += '    }\n';
      p += '  ],\n';
      p += '  "factions": [\n';
      p += '    {\n';
      p += '      "name": "string",\n';
      p += '      "description": "string",\n';
      p += '      "goals": "string"\n';
      p += '    }\n';
      p += '  ],\n';
      p += '  "world_rules": ["array of strings — fundamental constraints on the setting"],\n';
      p += '  "initial_world_flags": { "flag_name": true/false }\n';
      p += '}\n\n';

      // Story length rules
      p += 'STORY LENGTH RULES (' + storyLength.label + '):\n';
      p += '- Total turns: ' + storyLength.total_turns.min + '-' + storyLength.total_turns.max + '\n';
      p += '- Turns per act: ' + storyLength.turns_per_act.min + '-' + storyLength.turns_per_act.max + '\n';
      p += '- NPC count: ' + storyLength.npc_count.min + '-' + storyLength.npc_count.max + '\n';
      p += '- Faction count: ' + storyLength.faction_count.min + '-' + storyLength.faction_count.max + '\n';
      p += '- Subplot threads: ' + storyLength.subplot_threads.min + '-' + storyLength.subplot_threads.max + '\n';
      p += '- Max pending consequences: ' + storyLength.max_pending_consequences + '\n\n';

      // Difficulty rules
      p += 'DIFFICULTY RULES (' + difficulty.label + '):\n';
      p += '- Safe choice ratio: ' + difficulty.safe_choice_ratio + ' (proportion of choices that are safe)\n';
      p += '- Consequence severity: ' + difficulty.consequence_severity + '\n';
      p += '- Resource abundance: ' + difficulty.resource_abundance + '\n';
      p += '- Game over allowed: ' + difficulty.allow_game_over + '\n';
      p += '- Game over frequency: ' + difficulty.game_over_frequency + '\n';
      p += '- Hint transparency: ' + difficulty.hint_transparency + '\n';
      p += '- Relationship decay rate: ' + difficulty.relationship_decay_rate + '\n';
      p += '- Pending consequence speed: ' + difficulty.pending_consequence_speed + '\n';
      p += '- Recovery paths: ' + difficulty.recovery_paths + '\n';
      p += '- NPC forgiveness: ' + difficulty.npc_forgiveness + '\n\n';

      // Brutal-specific constraints
      if (setupConfig.difficulty === 'brutal') {
        p += 'BRUTAL DIFFICULTY REQUIREMENTS:\n';
        p += '- At least 40% of choices across each act must have outcome DEATH or SEVERE_PENALTY\n';
        p += '- At least one game_over state must exist per act\n';
        p += '- No scene may have more than two advance_safe options\n';
        p += '- At least one death per act must be non-obvious (requires interpreting earlier clues)\n';
        p += '- Create genuine trap logic — choices that SOUND safe but are lethal based on earlier context the player may not have noticed\n\n';
      }

      // Final requirements
      p += 'The skeleton must have:\n';
      p += '- A clear central dramatic question that drives the entire story\n';
      p += '- An ending shape (not content, just form) that everything builds toward\n';
      p += '- Three acts with distinct purposes, locked constraints, and clear end conditions\n';
      p += '- Named NPCs with hidden motivations (count per story length setting above)\n';
      p += '- Factions with competing interests (count per story length setting above)\n';
      p += '- Target scenes per act matching the story length setting\n';
      p += '- World rules that create interesting constraints on player choices\n';
      p += '- Enough world state flags to track major consequences (one per NPC alive status + key plot flags)\n';

      return p;
    }
  };
})();
