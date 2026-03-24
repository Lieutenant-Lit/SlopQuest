/**
 * SQ.DifficultyConfig — Difficulty tier definitions.
 * Difficulty is mechanical, not tonal. The Game Master prompt contains
 * the detailed per-tier rules; this config holds only the properties
 * that are consumed programmatically (labels, allow_game_over).
 */
(function () {
  SQ.DifficultyConfig = {
    chill: {
      label: 'Chill',
      description: 'A relaxing story experience. No game overs. Consequences are mild.',
      allow_game_over: false
    },
    normal: {
      label: 'Normal',
      description: 'A balanced adventure. Choices matter. Game over is rare but possible.',
      allow_game_over: true
    },
    hard: {
      label: 'Hard',
      description: 'High stakes. Consequences are severe and sometimes irreversible.',
      allow_game_over: true
    },
    brutal: {
      label: 'Brutal',
      description: 'Unforgiving. The world punishes carelessness. Traps exist.',
      allow_game_over: true
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
