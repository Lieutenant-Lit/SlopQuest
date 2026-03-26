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

      p += 'You are a visual designer creating an INTENSELY immersive frame for a dark, atmospheric interactive fiction game. ';
      p += 'Your goal is NOT a generic color swap — it is a complete visual environment that makes the player feel they have STEPPED INSIDE the story world. ';
      p += 'Think dramatic themed borders, deep atmospheric glows, bold decorative elements, and carefully chosen typography that drips with genre flavor. ';
      p += 'Be BOLD and DRAMATIC — subtlety is the enemy. Every element should reinforce the genre identity. ';
      p += 'Output ONLY a valid JSON object — no prose, no markdown, no code fences, no explanation. ';
      p += 'Nothing before or after the JSON.\n\n';

      p += 'The player has chosen these story parameters:\n';
      p += '- Setting: ' + (setupConfig.setting || 'fantasy') + '\n';
      p += '- Writing style: ' + (setupConfig.writingStyle || 'literary') + '\n';
      p += '- Tone: ' + (setupConfig.tone || 'balanced') + '\n\n';

      p += 'COLOR RULES:\n';
      p += 'Generate a DARK-MODE color theme. The background must be dark (lightness under 15%). ';
      p += 'Text must be light and highly readable against the background. ';
      p += 'Ensure sufficient contrast between text and surface colors (WCAG AA minimum — at least 4.5:1 ratio). ';
      p += 'The primary accent color should strongly evoke the setting — not generic purple. ';
      p += 'Examples: warm gold/amber for fantasy, neon cyan/teal for sci-fi, blood red/sickly green for horror, ';
      p += 'sepia/warm brown for historical, electric blue for cyberpunk.\n\n';

      p += 'FONT RULES:\n';
      p += '- body font: A serif or display font from Google Fonts that fits the setting\'s era/mood.\n';
      p += '- ui font: A clean, readable sans-serif from Google Fonts for buttons and UI elements.\n';
      p += '- Use ONLY well-known Google Fonts (e.g. Crimson Text, EB Garamond, Cinzel, Merriweather, ';
      p += 'Lora, Playfair Display, Source Sans 3, Inter, Roboto, Fira Sans, Space Mono, Share Tech Mono, ';
      p += 'Rajdhani, Orbitron, Creepster, Nosifer, UnifrakturMaguntia, MedievalSharp, Pirata One).\n';
      p += '- Provide just the font family name, not the full CSS value.\n\n';

      p += 'GLOW COLOR:\n';
      p += 'Provide glow_color as an rgba() value based on your primary accent with low alpha (0.15-0.4). ';
      p += 'This creates an atmospheric haze/glow around the content area and on interactive elements. ';
      p += 'Example: if primary is #7c6ff0, glow_color might be "rgba(124, 111, 240, 0.25)".\n\n';

      p += 'SVG DECORATION RULES (IMPORTANT — these are the most visually impactful elements):\n';
      p += 'All SVGs must be inline, self-contained, use viewBox for scaling, and use colors from your palette.\n\n';

      p += '- side_border_svg: A VERTICAL decorative strip that runs along the left and right edges of the screen. ';
      p += 'This is the most important decoration — it frames the entire game like a book or portal. ';
      p += 'Requirements: width="40" with a tall viewBox (e.g. viewBox="0 0 40 200"), designed to tile vertically (repeat-y). ';
      p += 'Use simple but evocative shapes — NO text, NO complex gradients. ';
      p += 'Genre examples: ornate stone pillar carvings or Celtic knotwork for fantasy, corroded metal plating or circuit traces for sci-fi, ';
      p += 'twisted thorny vines or cracked bones for horror, art deco gilded bars for noir, riveted steel panels for steampunk, ';
      p += 'hieroglyphic columns for ancient/historical. ';
      p += 'Use the primary and border colors from your palette. Keep under 2KB. ';
      p += 'The SVG MUST tile seamlessly — the top and bottom edges must connect when repeated.\n\n';

      p += '- header_decoration_svg: A horizontal ornament placed below the game title. ';
      p += 'A filigree underline, bracket shape, or decorative flourish. width="200" height="20" with viewBox. ';
      p += 'Simpler than the divider. Under 1KB.\n\n';

      p += '- divider_svg: A horizontal decorative divider (width="100%" height="20-40px", viewBox-based). ';
      p += 'Placed between story text and choice buttons. Should be thematic. Under 2KB.\n\n';

      p += '- background_pattern_svg: A subtle, tileable background pattern (small, under 1KB). ';
      p += 'Set to null if a clean background suits the theme better.\n\n';

      p += '- choice_icon_svg: An SVG silhouette shape for the choice label badges (A/B/C/D). ';
      p += 'This shape replaces the default rounded square — it will be used as a CSS mask-image, ';
      p += 'so it MUST be a FILLED SOLID shape (single color, no transparency inside the shape). ';
      p += 'Requirements: viewBox="0 0 32 32", width="32" height="32". ';
      p += 'Genre examples: a shield or crest for fantasy, a skull for horror, a star/sheriff badge for western, ';
      p += 'a heart for romance, a hexagon or circuit node for sci-fi, a gear for steampunk, ';
      p += 'a diamond for noir, a paw print for animal stories. ';
      p += 'Use a single fill color (#fff works best since it is used as a mask). ';
      p += 'Keep simple — no fine details, just a bold recognizable silhouette. Under 500 bytes.\n\n';

      p += '- card_border_style: A CSS border shorthand for cards (NOT choice buttons — those are borderless text rows). ';
      p += 'Examples: "1px solid #3a2a1a", "2px solid #0ff3". Set to "none" to keep defaults.\n\n';

      p += '- header_border_style: A CSS border shorthand for the header bottom border. ';
      p += 'Make it thematic: "2px solid #color", "3px double #color", "2px ridge #color". ';
      p += 'More visible than a subtle 1px line.\n\n';

      p += 'css_filter: An optional CSS filter string to apply mood (e.g. "sepia(0.08)" for historical, ';
      p += '"hue-rotate(10deg)" for alien worlds). Use "none" if not needed. Keep subtle (under 15%).\n\n';

      p += 'DRAMATIC STYLING GUIDANCE:\n';
      p += '- Make the glow_color impactful — use alpha 0.25-0.4, not timid 0.15 values.\n';
      p += '- Side borders should feel like the frame of a portal or ancient tome, not a thin decorative afterthought.\n';
      p += '- The divider SVG should feel like a scene break in an illuminated manuscript, not a simple horizontal line.\n';
      p += '- Choose fonts that COMMIT to the genre — Cinzel or MedievalSharp for fantasy, Creepster for horror, Orbitron for sci-fi. Avoid safe generic choices.\n\n';

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
      p += '  "glow_color": "rgba(R, G, B, A) — atmospheric glow color",\n';
      p += '  "css_filter": "none or subtle CSS filter string",\n';
      p += '  "decorations": {\n';
      p += '    "side_border_svg": "<svg>...</svg> — vertical border strip, MOST IMPORTANT",\n';
      p += '    "header_decoration_svg": "<svg>...</svg> — ornament below title",\n';
      p += '    "header_border_style": "CSS border shorthand for header bottom",\n';
      p += '    "divider_svg": "<svg>...</svg> — horizontal divider between passage and choices",\n';
      p += '    "choice_icon_svg": "<svg>...</svg> — solid silhouette shape for choice badges",\n';
      p += '    "card_border_style": "CSS border shorthand or none",\n';
      p += '    "background_pattern_svg": "<svg>...</svg> or null"\n';
      p += '  }\n';
      p += '}\n';

      return p;
    }
  };
})();
