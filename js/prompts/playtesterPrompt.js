/**
 * SQ.PlaytesterPrompt — Builds prompts for the Agentic Playtester.
 * Two prompt pairs: per-turn decision + final report generation.
 */
(function () {
  SQ.PlaytesterPrompt = {
    /**
     * Build the system prompt for the per-turn decision call.
     * @param {string} playstyle - Free-text playstyle directive
     * @param {string} focusPrimer - What the playtester should focus on
     * @returns {string} System prompt
     */
    buildTurnSystem: function (playstyle, focusPrimer) {
      var p = '';
      p += 'You are an automated playtester for an interactive gamebook RPG called SlopQuest. ';
      p += 'You play through the game making choices and carefully observing everything for bugs, ';
      p += 'quality issues, and narrative problems.\n\n';

      p += 'PLAYSTYLE DIRECTIVE:\n';
      p += (playstyle || 'Play naturally, exploring a variety of choices.') + '\n\n';

      if (focusPrimer) {
        p += 'PRIMARY FOCUS AREA:\n';
        p += focusPrimer + '\n';
        p += 'Pay special attention to this area throughout the playtest.\n\n';
      }

      p += 'WHAT TO WATCH FOR:\n';
      p += '- State inconsistencies: inventory items appearing/disappearing without explanation, ';
      p += 'health changes that don\'t match narrative, contradictory world flags\n';
      p += '- Narrative contradictions: characters acting out of character vs their skeleton definitions, ';
      p += 'plot holes, broken continuity, forgotten NPCs or plot threads\n';
      p += '- Writing quality: repetitive phrases, tonal shifts, perspective/tense inconsistency, ';
      p += 'awkward prose, purple prose, lack of variety\n';
      p += '- Game mechanics: choices that don\'t match the narrative outcome, missing consequences, ';
      p += 'status effects not reflected in prose, relationship scores that don\'t change\n';
      p += '- Difficulty/balance: unfair deaths, too-easy encounters, consequences that feel arbitrary\n';
      p += '- Skeleton alignment: is the story following its planned act structure? Are key beats happening?\n\n';

      p += 'YOUR TASK EACH TURN:\n';
      p += '1. Read the passage and all available information carefully\n';
      p += '2. Choose one of the available choices (A, B, C, or D) based on your playstyle directive\n';
      p += '3. Update your memory journal with observations from this turn\n\n';

      p += 'MEMORY JOURNAL RULES:\n';
      p += '- Your journal is your running record of observations, bugs, quality notes, and narrative tracking\n';
      p += '- You MUST keep the total journal under 2000 tokens\n';
      p += '- Summarize older entries aggressively while keeping recent observations detailed\n';
      p += '- Always track: current narrative threads, NPC appearances, inventory changes, ';
      p += 'any issues found (with turn number)\n\n';

      p += 'OUTPUT FORMAT: Respond with ONLY a valid JSON object. No markdown, no code fences.\n';
      p += '{\n';
      p += '  "choice": "A",\n';
      p += '  "reasoning": "Brief explanation of why this choice advances the test goals",\n';
      p += '  "memory": "Your updated journal. Summarize older turns, keep recent turns detailed."\n';
      p += '}\n';

      return p;
    },

    /**
     * Build the user prompt for the per-turn decision call.
     * @param {number} turnCount - Current turn number
     * @param {number} maxTurns - Maximum turns configured
     * @param {object} skeleton - Story skeleton
     * @param {object} state - Full game state
     * @param {string} passage - Latest passage text
     * @param {object} choices - Current choices object { A: {text}, B: {text}, ... }
     * @param {string} memory - Accumulated memory journal
     * @returns {string} User prompt
     */
    buildTurnUser: function (turnCount, maxTurns, skeleton, state, passage, choices, memory) {
      var p = '';
      p += 'TURN ' + turnCount + ' of ' + maxTurns + '\n\n';

      p += 'STORY SKELETON:\n';
      p += JSON.stringify(skeleton, null, 2) + '\n\n';

      // Build state without skeleton to avoid duplication
      var stateForPrompt = {};
      for (var key in state) {
        if (state.hasOwnProperty(key) && key !== 'skeleton') {
          stateForPrompt[key] = state[key];
        }
      }
      p += 'CURRENT GAME STATE:\n';
      p += JSON.stringify(stateForPrompt, null, 2) + '\n\n';

      p += 'LATEST PASSAGE:\n';
      p += (passage || '(no passage)') + '\n\n';

      p += 'AVAILABLE CHOICES:\n';
      if (choices) {
        var letters = ['A', 'B', 'C', 'D'];
        for (var i = 0; i < letters.length; i++) {
          var letter = letters[i];
          var choice = choices[letter];
          if (choice) {
            p += letter + ': ' + (choice.text || '(no text)');
            if (choice.outcome) p += ' [outcome: ' + choice.outcome + ']';
            if (choice.consequence) p += ' [consequence: ' + choice.consequence + ']';
            p += '\n';
          }
        }
      }
      p += '\n';

      p += 'YOUR MEMORY JOURNAL:\n';
      p += (memory || 'No previous turns — this is the first turn.') + '\n\n';

      p += 'Choose a letter (A, B, C, or D) and update your journal. Respond with ONLY the JSON object.';

      return p;
    },

    /**
     * Build the system prompt for the final report generation call.
     * @param {string} focusPrimer - What the playtester was focused on
     * @returns {string} System prompt
     */
    buildReportSystem: function (focusPrimer) {
      var p = '';
      p += 'You are an expert QA playtester generating a final report after completing a playthrough ';
      p += 'of an interactive gamebook RPG called SlopQuest.\n\n';

      p += 'Analyze your accumulated observations and the final game state to produce a structured ';
      p += 'quality report. Be specific and actionable — cite turn numbers, quote specific text, ';
      p += 'and reference concrete state values when reporting issues.\n\n';

      p += 'OUTPUT FORMAT: Respond with ONLY a valid JSON object. No markdown fences.\n';
      p += '{\n';
      p += '  "report": "Full markdown report content (see structure below)"\n';
      p += '}\n\n';

      p += 'REPORT STRUCTURE (use markdown headings and bullet points):\n\n';

      p += '## Playtest Summary\n';
      p += '- Turns played, outcome (death/completion/manual stop/max turns), difficulty, story length\n';
      p += '- Brief narrative arc summary (1-2 sentences)\n\n';

      p += '## Bugs & State Issues\n';
      p += '- Any state inconsistencies, impossible states, inventory bugs, flag contradictions\n';
      p += '- Rate severity: CRITICAL / MAJOR / MINOR\n';
      p += '- Include turn numbers and specific details\n';
      p += '- If no bugs found, say so explicitly\n\n';

      p += '## Writing Quality\n';
      p += '- Prose quality and consistency of voice\n';
      p += '- Perspective/tense adherence (were there shifts?)\n';
      p += '- Repetitive phrases or patterns\n';
      p += '- Dialogue quality and character voice consistency\n';
      p += '- Passage length consistency\n\n';

      p += '## Narrative Structure\n';
      p += '- Did the story follow the skeleton\'s planned arc?\n';
      p += '- Pacing observations (too fast, too slow, well-balanced)\n';
      p += '- Act transitions — were they natural?\n';
      p += '- Character consistency with skeleton NPC definitions\n';
      p += '- Were key beats from the skeleton actually hit?\n\n';

      p += '## Game Mechanics\n';
      p += '- Choice meaningfulness (did choices have real consequences?)\n';
      p += '- Difficulty fairness\n';
      p += '- Status effect handling\n';
      p += '- Consequence system behavior\n';
      p += '- Inventory and relationship system behavior\n\n';

      if (focusPrimer) {
        p += '## Specific Focus Findings\n';
        p += '- Detailed results related to the specific focus area: ' + focusPrimer + '\n\n';
      }

      p += '## API Cost Summary\n';
      p += '- Include the cost data provided in the user prompt exactly as given\n';
      p += '- Format as a clear breakdown showing total cost, per-model costs, and average cost per turn\n';
      p += '- If voice or image costs are included, list them as separate line items\n\n';

      p += '## Overall Assessment\n';
      p += '- Summary quality rating (Excellent / Good / Fair / Poor)\n';
      p += '- Top 3 most important issues to fix\n';
      p += '- Top 3 things that worked well\n';
      p += '- Recommendations for improvement\n';

      return p;
    },

    /**
     * Build the user prompt for the final report generation call.
     * @param {string} outcome - How the playtest ended
     * @param {number} turnCount - Total turns played
     * @param {string} playstyle - Playstyle that was used
     * @param {string} focusPrimer - Focus area
     * @param {object} skeleton - Story skeleton
     * @param {object} state - Final game state
     * @param {string} memory - Full accumulated memory journal
     * @returns {string} User prompt
     */
    buildReportUser: function (outcome, turnCount, playstyle, focusPrimer, skeleton, state, memory) {
      var p = '';
      p += 'PLAYTEST COMPLETE\n\n';

      p += 'Outcome: ' + outcome + '\n';
      p += 'Turns played: ' + turnCount + '\n';
      p += 'Playstyle used: ' + (playstyle || 'natural') + '\n';
      if (focusPrimer) {
        p += 'Focus area: ' + focusPrimer + '\n';
      }
      p += '\n';

      p += 'STORY SKELETON:\n';
      p += JSON.stringify(skeleton, null, 2) + '\n\n';

      // State without skeleton
      var stateForPrompt = {};
      for (var key in state) {
        if (state.hasOwnProperty(key) && key !== 'skeleton') {
          stateForPrompt[key] = state[key];
        }
      }
      p += 'FINAL GAME STATE:\n';
      p += JSON.stringify(stateForPrompt, null, 2) + '\n\n';

      p += 'YOUR ACCUMULATED MEMORY JOURNAL:\n';
      p += (memory || '(no observations recorded)') + '\n\n';

      // Include cost data if available
      if (SQ.Playtester && SQ.Playtester.getCostSummary) {
        p += 'COST DATA:\n';
        p += SQ.Playtester.getCostSummary() + '\n\n';
      }

      p += 'Generate the structured playtest report. Respond with ONLY the JSON object.';

      return p;
    }
  };
})();
