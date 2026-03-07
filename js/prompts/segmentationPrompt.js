/**
 * SQ.SegmentationPrompt — Builds prompts for splitting a passage into
 * speaker-attributed narration segments.
 *
 * This runs as a SEPARATE API call from passage generation so the LLM
 * can focus on one task at a time: write a good passage first, then
 * decompose it into segments for multi-voice TTS narration.
 */
(function () {
  SQ.SegmentationPrompt = {
    /**
     * Build the system prompt for segmentation.
     * @returns {string}
     */
    buildSystem: function () {
      var p = '';
      p += 'You are a text segmentation tool. Your job is to split a narrative passage into sequential segments for multi-voice text-to-speech narration.\n\n';

      p += 'OUTPUT FORMAT: Respond with ONLY a valid JSON object. No markdown, no code fences, no commentary.\n\n';

      p += 'Respond with this exact JSON structure:\n';
      p += '{\n';
      p += '  "segments": [\n';
      p += '    { "speaker": "string|null", "text": "string" }\n';
      p += '  ]\n';
      p += '}\n\n';

      p += 'RULES:\n';
      p += '- Split the passage at EVERY dialogue boundary (quoted speech).\n';
      p += '- Each quoted speech ("...") gets its OWN segment with the speaker\'s name.\n';
      p += '- ALL text between quotes (narrator prose, attribution, action, description) gets its own segment with speaker: null.\n';
      p += '- NEVER combine multiple quotes into one segment if there is narrator text between them.\n';
      p += '- The concatenation of all segment texts must EXACTLY equal the original passage — no text added, removed, or reordered.\n';
      p += '- Use the character names provided. If a quote cannot be attributed to a known character, use speaker: null.\n';
      p += '- Preserve all whitespace and newlines exactly as they appear in the original.\n';

      return p;
    },

    /**
     * Build the user prompt for segmentation.
     * @param {string} passageText - The passage to segment
     * @param {Array} knownCharacters - Character names from the game state
     * @returns {string}
     */
    buildUser: function (passageText, knownCharacters) {
      var p = 'Segment the following passage for multi-voice narration.\n\n';

      if (knownCharacters && knownCharacters.length > 0) {
        p += 'Known characters: ' + knownCharacters.join(', ') + '\n\n';
      }

      p += 'PASSAGE:\n' + passageText;

      return p;
    }
  };
})();
