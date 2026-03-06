/**
 * SQ.PassagePrompt — Builds system and user prompts for passage generation.
 * Based on design doc Section 9 prompt templates.
 */
(function () {
  SQ.PassagePrompt = {
    /**
     * Build the system prompt for passage generation.
     * @param {object} gameState - Full game state
     * @returns {string} System prompt
     */
    buildSystem: function (gameState) {
      var meta = gameState.meta || {};
      var difficulty = SQ.DifficultyConfig[meta.difficulty] || SQ.DifficultyConfig.normal;

      var prompt = 'You are the narrator of an interactive gamebook RPG.\n\n';

      prompt += '## Writing Parameters\n';
      prompt += '- Perspective: ' + (meta.perspective || 'second person') + '\n';
      prompt += '- Tense: ' + (meta.tense || 'present') + '\n';
      prompt += '- Writing style: ' + (meta.writing_style || 'literary') + '\n';
      prompt += '- Tone: ' + (meta.tone || 'dark and atmospheric') + '\n\n';

      prompt += '## Story Skeleton\n';
      prompt += JSON.stringify(gameState.skeleton, null, 2) + '\n\n';

      prompt += '## Current Player State\n';
      prompt += JSON.stringify(gameState.player, null, 2) + '\n\n';

      prompt += '## Relationships\n';
      prompt += JSON.stringify(gameState.relationships, null, 2) + '\n\n';

      prompt += '## Current Position\n';
      prompt += JSON.stringify(gameState.current, null, 2) + '\n\n';

      prompt += '## Pending Consequences\n';
      prompt += JSON.stringify(gameState.pending_consequences, null, 2) + '\n\n';

      prompt += '## Event Log\n';
      prompt += JSON.stringify(gameState.event_log.slice(-20), null, 2) + '\n';
      if (gameState.backstory_summary) {
        prompt += 'Backstory summary: ' + gameState.backstory_summary + '\n';
      }
      prompt += '\n';

      prompt += '## World State Flags\n';
      prompt += JSON.stringify(gameState.world_flags, null, 2) + '\n\n';

      if (gameState.current_choices) {
        prompt += '## Predetermined Choice Outcomes (Hard/Brutal)\n';
        prompt += JSON.stringify(gameState.current_choices, null, 2) + '\n\n';
      }

      prompt += '## Response Format\n';
      prompt += 'Respond with ONLY a JSON object containing:\n';
      prompt += '- passage: string (150-300 words of narrative)\n';
      prompt += '- illustration_prompt: string (concise visual description)\n';
      prompt += '- state_updates: object with any changed fields (player, relationships, current, world_flags, pending_consequences, event_log entries)\n';
      prompt += '- choices: { A: { text, outcome, consequence }, B: {...}, C: {...}, D: {...} }\n\n';

      prompt += 'Rules:\n';
      prompt += '- Respond with ONLY the JSON object — nothing before it, nothing after it\n';
      prompt += '- Stay consistent with the skeleton\'s locked constraints\n';
      prompt += '- Reference and advance pending consequences when their triggers are met\n';
      prompt += '- Keep the passage between 150-300 words\n';
      prompt += '- All four choices should feel plausible and interesting\n';
      prompt += '- Decrement scenes_remaining on all pending consequences\n';

      return prompt;
    },

    /**
     * Build the user prompt for passage generation.
     * @param {object} gameState - Full game state
     * @param {string|null} choiceId - The choice the player made, or null for opening
     * @returns {string} User prompt
     */
    buildUser: function (gameState, choiceId) {
      if (!choiceId) {
        return 'Generate the opening passage for this story. Set the scene and present the first four choices.';
      }

      var choice = gameState.current_choices && gameState.current_choices[choiceId];
      var prompt = 'The player chose option ' + choiceId + '.';

      if (choice) {
        if (choice.text) prompt += '\nChoice text: "' + choice.text + '"';
        if (choice.outcome) prompt += '\nOutcome classification: ' + choice.outcome.toUpperCase();
        if (choice.consequence) prompt += '\nConsequence: ' + choice.consequence;
        if (choice.narration_directive) prompt += '\nNarration directive: ' + choice.narration_directive;
      }

      prompt += '\n\nGenerate the next passage and four new choices.';
      return prompt;
    }
  };
})();
