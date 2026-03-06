/**
 * SQ.SkeletonPrompt — Builds the system prompt for skeleton generation.
 * Based on design doc Section 9 prompt templates.
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

      var prompt = 'You are a game designer creating the story skeleton for an interactive gamebook RPG.\n\n';

      prompt += '## Player Configuration\n';
      prompt += '- Setting: ' + (setupConfig.setting || 'fantasy') + '\n';
      prompt += '- Character archetype: ' + (setupConfig.archetype || 'wanderer') + '\n';
      prompt += '- Writing style: ' + (setupConfig.writingStyle || 'literary') + '\n';
      prompt += '- Tone: ' + (setupConfig.tone || 'dark and atmospheric') + '\n';
      prompt += '- Difficulty: ' + difficulty.label + '\n';
      prompt += '- Story length: ' + storyLength.label + '\n\n';

      prompt += '## Story Length Parameters\n';
      prompt += '- Total turns: ' + storyLength.total_turns.min + '-' + storyLength.total_turns.max + '\n';
      prompt += '- Turns per act: ' + storyLength.turns_per_act.min + '-' + storyLength.turns_per_act.max + '\n';
      prompt += '- NPC count: ' + storyLength.npc_count.min + '-' + storyLength.npc_count.max + '\n';
      prompt += '- Faction count: ' + storyLength.faction_count.min + '-' + storyLength.faction_count.max + '\n';
      prompt += '- Subplot threads: ' + storyLength.subplot_threads.min + '-' + storyLength.subplot_threads.max + '\n\n';

      prompt += '## Difficulty Parameters\n';
      prompt += '- Safe choice ratio: ' + difficulty.safe_choice_ratio + '\n';
      prompt += '- Consequence severity: ' + difficulty.consequence_severity + '\n';
      prompt += '- Game over allowed: ' + difficulty.allow_game_over + '\n';
      prompt += '- Game over frequency: ' + difficulty.game_over_frequency + '\n';
      prompt += '- Hint transparency: ' + difficulty.hint_transparency + '\n';
      prompt += '- NPC forgiveness: ' + difficulty.npc_forgiveness + '\n\n';

      if (setupConfig.difficulty === 'brutal') {
        prompt += '## BRUTAL DIFFICULTY CONSTRAINTS\n';
        prompt += '- At least 40% of choices across each act must have outcome "death" or "severe_penalty"\n';
        prompt += '- At least one game_over state must exist per act\n';
        prompt += '- No scene may have more than two "advance_safe" options\n';
        prompt += '- At least one death per act must be non-obvious (requires interpreting earlier clues)\n\n';
      }

      prompt += '## Required JSON Structure\n';
      prompt += 'Respond with ONLY a JSON object containing:\n';
      prompt += '- title: string\n';
      prompt += '- premise: string (1-2 sentences)\n';
      prompt += '- central_question: string\n';
      prompt += '- ending_shape: string (how the story can conclude)\n';
      prompt += '- setting: { name, description, tone_notes }\n';
      prompt += '- acts: array of 3 acts, each with { act_number, title, description, end_condition, target_scenes, locked_constraints[], key_beats[] }\n';
      prompt += '- npcs: array of { name, role, motivation, allegiance, secret, initial_relationship }\n';
      prompt += '- factions: array of { name, description, goals }\n';
      prompt += '- world_rules: array of strings\n';
      prompt += '- initial_world_flags: object of boolean flags\n\n';

      prompt += 'Respond with ONLY the JSON object. No prose, no explanation, no markdown code fences.';

      return prompt;
    }
  };
})();
