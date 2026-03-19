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
      threat_timer_pressure: 'relaxed',
      recovery_paths: 'always available',
      npc_forgiveness: 'high'
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
      threat_timer_pressure: 'moderate',
      recovery_paths: 'usually available',
      npc_forgiveness: 'moderate'
    },
    hard: {
      label: 'Hard',
      description: 'High stakes. Consequences are serious and sometimes irreversible.',
      safe_choice_ratio: 0.35,
      consequence_severity: 'severe',
      allow_game_over: true,
      game_over_frequency: 'rare',
      hint_transparency: 'subtle',
      relationship_decay_rate: 'fast',
      threat_timer_pressure: 'urgent',
      recovery_paths: 'sometimes available',
      npc_forgiveness: 'low'
    },
    brutal: {
      label: 'Brutal',
      description: 'Unforgiving. Critical consequences are common, recovery is rare.',
      safe_choice_ratio: 0.25,
      consequence_severity: 'critical',
      allow_game_over: true,
      game_over_frequency: 'common',
      hint_transparency: 'cryptic',
      relationship_decay_rate: 'aggressive',
      threat_timer_pressure: 'immediate',
      recovery_paths: 'rarely available',
      npc_forgiveness: 'none'
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
      subplot_threads: { min: 0, max: 1 }
    },
    medium: {
      label: 'Medium',
      description: '30-40 turns, ~45-75 minutes',
      total_turns: { min: 30, max: 40 },
      turns_per_act: { min: 10, max: 13 },
      faction_count: { min: 2, max: 3 },
      subplot_threads: { min: 1, max: 2 }
    },
    long: {
      label: 'Long',
      description: '50-70 turns, ~90-150 minutes',
      total_turns: { min: 50, max: 70 },
      turns_per_act: { min: 17, max: 23 },
      faction_count: { min: 3, max: 4 },
      subplot_threads: { min: 2, max: 4 }
    }
  };
})();
