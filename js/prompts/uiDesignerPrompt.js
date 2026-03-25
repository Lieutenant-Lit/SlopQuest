/**
 * SQ.UIDesignerPrompt — Builds the system prompt for UI theme generation.
 * Instructs an LLM to produce a JSON theme (colors, fonts, SVG decorations)
 * that matches the player's chosen setting and tone.
 */
(function () {
  SQ.UIDesignerPrompt = {
    /**
     * Build the UI Designer system prompt from setup config.
     * @param {object} setupConfig - Player's game setup choices
     * @returns {string} System prompt
     */
    build: function (setupConfig) {
      var p = '';

      p += 'You are a UI designer for a browser-based interactive fiction game. ';
      p += 'Your job is to generate a visual theme — colors, fonts, and decorative SVG elements — that matches the story\'s setting and tone. ';
      p += 'Output ONLY a valid JSON object — no prose, no markdown, no code fences, no explanation. ';
      p += 'Nothing before or after the JSON.\n\n';

      p += 'The player has chosen these story parameters:\n';
      p += '- Setting: ' + (setupConfig.setting || 'fantasy') + '\n';
      p += '- Writing style: ' + (setupConfig.writingStyle || 'literary') + '\n';
      p += '- Tone: ' + (setupConfig.tone || 'balanced') + '\n\n';

      p += 'Generate a DARK-MODE color theme. The background must be dark (lightness under 15%). ';
      p += 'Text must be light and highly readable against the background. ';
      p += 'Ensure sufficient contrast between text and surface colors (WCAG AA minimum — at least 4.5:1 ratio). ';
      p += 'The primary accent color should evoke the setting\'s mood.\n\n';

      p += 'FONT RULES:\n';
      p += '- body font: A serif or display font from Google Fonts that fits the setting\'s era/mood.\n';
      p += '- ui font: A clean, readable sans-serif from Google Fonts for buttons and UI elements.\n';
      p += '- Use ONLY well-known Google Fonts (e.g. Crimson Text, EB Garamond, Cinzel, Merriweather, ';
      p += 'Lora, Playfair Display, Source Sans 3, Inter, Roboto, Fira Sans, Space Mono, Share Tech Mono, ';
      p += 'Rajdhani, Orbitron, Creepster, Nosifer, UnifrakturMaguntia, MedievalSharp, Pirata One).\n';
      p += '- Provide just the font family name, not the full CSS value.\n\n';

      p += 'SVG RULES:\n';
      p += '- divider_svg: A horizontal decorative divider (width="100%" height="20-40px", viewBox-based). ';
      p += 'Should be thematic (e.g. Celtic knot for fantasy, circuit trace for sci-fi, thorny vine for horror). ';
      p += 'Use the primary color from your palette. Keep under 2KB.\n';
      p += '- background_pattern_svg: A subtle, tileable background pattern (small, under 1KB). ';
      p += 'Set to null if a clean background suits the theme better.\n';
      p += '- card_border_style: A CSS border shorthand that fits the theme (e.g. "1px solid #3a2a1a", "2px solid #0ff3"). ';
      p += 'Set to "none" if you prefer no border.\n\n';

      p += 'css_filter: An optional CSS filter string to apply mood (e.g. "sepia(0.08)" for historical, ';
      p += '"hue-rotate(10deg)" for alien worlds). Use "none" if no filter is needed. ';
      p += 'Keep effects subtle — never more than 15% intensity.\n\n';

      p += 'Generate this EXACT JSON schema:\n';
      p += '{\n';
      p += '  "colors": {\n';
      p += '    "bg": "#hex — dark page background",\n';
      p += '    "surface": "#hex — card/panel background, slightly lighter than bg",\n';
      p += '    "surface_raised": "#hex — raised elements, slightly lighter than surface",\n';
      p += '    "border": "#hex — subtle border color",\n';
      p += '    "text": "#hex — primary text, must be very light and readable",\n';
      p += '    "text_muted": "#hex — secondary/muted text",\n';
      p += '    "primary": "#hex — main accent color, evokes the setting mood",\n';
      p += '    "primary_hover": "#hex — lighter/brighter version of primary for hover states",\n';
      p += '    "secondary": "#hex — secondary button background",\n';
      p += '    "secondary_hover": "#hex — secondary hover state",\n';
      p += '    "danger": "#hex — danger/death color",\n';
      p += '    "success": "#hex — success/positive color",\n';
      p += '    "warning": "#hex — warning/caution color"\n';
      p += '  },\n';
      p += '  "fonts": {\n';
      p += '    "body": "Google Font family name for story text",\n';
      p += '    "ui": "Google Font family name for UI elements"\n';
      p += '  },\n';
      p += '  "css_filter": "none or subtle CSS filter string",\n';
      p += '  "decorations": {\n';
      p += '    "divider_svg": "<svg>...</svg> inline SVG string",\n';
      p += '    "card_border_style": "CSS border shorthand or none",\n';
      p += '    "background_pattern_svg": "<svg>...</svg> or null"\n';
      p += '  }\n';
      p += '}\n';

      return p;
    }
  };
})();
