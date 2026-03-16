/**
 * SQ.DifficultyConfig — Difficulty parameter tables from design doc Section 3.
 * Difficulty is mechanical, not tonal. These parameters constrain how
 * forgiving the world is; the prose tone stays consistent.
 */
(function () {
  SQ.DifficultyConfig = {
    chill: {
      label: 'Chill',
      description: 'A relaxing story experience. No game overs, obvious hints.',
      safe_choice_ratio: 0.75,
      consequence_severity: 'mild',
      allow_game_over: false,
      game_over_frequency: 'never',
      hint_transparency: 'obvious',
      relationship_decay_rate: 'slow',
      pending_consequence_speed: 'slow',
      recovery_paths: 'always available',
      npc_forgiveness: 'high',
      allow_lethal_effects: false,
      max_effect_severity: 0.5,
      healing_speed: 'fast'
    },
    normal: {
      label: 'Normal',
      description: 'A balanced adventure. Choices have consequences but recovery is usually possible.',
      safe_choice_ratio: 0.50,
      consequence_severity: 'moderate',
      allow_game_over: false,
      game_over_frequency: 'never',
      hint_transparency: 'moderate',
      relationship_decay_rate: 'normal',
      pending_consequence_speed: 'normal',
      recovery_paths: 'usually available',
      npc_forgiveness: 'moderate',
      allow_lethal_effects: false,
      max_effect_severity: 0.8,
      healing_speed: 'normal'
    },
    hard: {
      label: 'Hard',
      description: 'A challenging experience. Death is possible. Consequences hit fast and hard.',
      safe_choice_ratio: 0.35,
      consequence_severity: 'severe',
      allow_game_over: true,
      game_over_frequency: 'rare',
      hint_transparency: 'subtle',
      relationship_decay_rate: 'fast',
      pending_consequence_speed: 'fast',
      recovery_paths: 'sometimes available',
      npc_forgiveness: 'low',
      allow_lethal_effects: true,
      max_effect_severity: 1.0,
      healing_speed: 'realistic'
    },
    brutal: {
      label: 'Brutal',
      description: 'Lethal and unforgiving. Death is common, clues are cryptic, and NPCs hold grudges.',
      safe_choice_ratio: 0.25,
      consequence_severity: 'lethal',
      allow_game_over: true,
      game_over_frequency: 'common',
      hint_transparency: 'cryptic',
      relationship_decay_rate: 'aggressive',
      pending_consequence_speed: 'immediate',
      recovery_paths: 'rarely available',
      npc_forgiveness: 'none',
      allow_lethal_effects: true,
      max_effect_severity: 1.0,
      healing_speed: 'slow'
    }
  };

  /**
   * Story length configuration from design doc Section 3.3.
   */
  SQ.StoryLengthConfig = {
    short: {
      label: 'Short',
      description: '15-20 turns, ~20-30 minutes',
      total_turns: { min: 15, max: 20 },
      turns_per_act: { min: 5, max: 7 },
      faction_count: { min: 1, max: 2 },
      subplot_threads: { min: 0, max: 1 },
      max_pending_consequences: 3
    },
    medium: {
      label: 'Medium',
      description: '30-40 turns, ~45-75 minutes',
      total_turns: { min: 30, max: 40 },
      turns_per_act: { min: 10, max: 13 },
      faction_count: { min: 2, max: 3 },
      subplot_threads: { min: 1, max: 2 },
      max_pending_consequences: 7
    },
    long: {
      label: 'Long',
      description: '50-70 turns, ~90-150 minutes',
      total_turns: { min: 50, max: 70 },
      turns_per_act: { min: 17, max: 23 },
      faction_count: { min: 3, max: 4 },
      subplot_threads: { min: 2, max: 4 },
      max_pending_consequences: 12
    }
  };
})();
