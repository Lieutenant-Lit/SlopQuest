/**
 * SQ.UIDesigner — Generates and applies dynamic UI themes via LLM.
 * Produces a color palette, font selections, and SVG decorations
 * based on the story's setting and tone. Applies them as CSS custom
 * properties scoped to #screen-game and DOM injections; removes them
 * cleanly on game exit.
 */
(function () {
  var MAX_RETRIES = 1;

  /** Map from theme JSON color keys to CSS variable names. */
  var COLOR_MAP = {
    bg: '--color-bg',
    surface: '--color-surface',
    surface_raised: '--color-surface-raised',
    border: '--color-border',
    text: '--color-text',
    text_muted: '--color-text-muted',
    primary: '--color-primary',
    primary_hover: '--color-primary-hover',
    secondary: '--color-secondary',
    secondary_hover: '--color-secondary-hover',
    danger: '--color-danger',
    success: '--color-success',
    warning: '--color-warning'
  };

  /** All CSS variable names we set, for cleanup. */
  var ALL_CSS_VARS = Object.keys(COLOR_MAP).map(function (k) { return COLOR_MAP[k]; });
  ALL_CSS_VARS.push('--font-body', '--font-ui');

  /**
   * Convert a hex color to sRGB relative luminance.
   * @param {string} hex - Color in #RRGGBB or #RGB format
   * @returns {number} Relative luminance (0-1)
   */
  function hexToLuminance(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    var r = parseInt(hex.substring(0, 2), 16) / 255;
    var g = parseInt(hex.substring(2, 4), 16) / 255;
    var b = parseInt(hex.substring(4, 6), 16) / 255;

    r = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
    g = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
    b = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  /**
   * Compute WCAG contrast ratio between two hex colors.
   * @returns {number} Contrast ratio (1-21)
   */
  function contrastRatio(hex1, hex2) {
    var l1 = hexToLuminance(hex1);
    var l2 = hexToLuminance(hex2);
    var lighter = Math.max(l1, l2);
    var darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  /**
   * Sanitize an SVG string to remove dangerous elements and attributes.
   * Strips <script>, on* event handlers, javascript: URIs, and xlink:href with data/javascript.
   * @param {string} svgStr - Raw SVG string from LLM
   * @returns {string} Sanitized SVG string
   */
  function sanitizeSvg(svgStr) {
    if (!svgStr || typeof svgStr !== 'string') return '';

    // Remove <script> tags and their content
    var clean = svgStr.replace(/<script[\s\S]*?<\/script>/gi, '');

    // Remove on* event handler attributes (onclick, onload, onerror, etc.)
    clean = clean.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');

    // Remove javascript: URIs in any attribute
    clean = clean.replace(/javascript\s*:/gi, '');

    // Remove data: URIs in href/xlink:href (potential script injection)
    clean = clean.replace(/(xlink:)?href\s*=\s*(?:"data:[^"]*"|'data:[^']*')/gi, '');

    // Remove <use> elements referencing external resources
    clean = clean.replace(/<use[^>]*href\s*=\s*(?:"(?!#)[^"]*"|'(?!#)[^']*')[^>]*\/?>/gi, '');

    // Remove <foreignObject> elements (can embed arbitrary HTML)
    clean = clean.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '');

    return clean;
  }

  SQ.UIDesigner = {
    /** Currently injected Google Fonts <link> element. */
    _fontLink: null,
    /** Currently active theme object. */
    _activeTheme: null,
    /** Injected divider element reference. */
    _dividerEl: null,
    /** Injected background style element reference. */
    _bgStyleEl: null,
    /** Injected card border style element reference. */
    _cardBorderStyleEl: null,

    /**
     * Generate a UI theme from the LLM.
     * @param {object} setupConfig - Player's game setup choices
     * @returns {Promise<object>} The theme JSON
     */
    generate: function (setupConfig) {
      var model = SQ.PlayerConfig.getModel('ui_designer');
      var systemPrompt = SQ.UIDesignerPrompt.build(setupConfig);
      var userMsg = 'Generate the UI theme now. Respond with ONLY the JSON object, no code fences.';

      return this._attemptGeneration(model, systemPrompt, userMsg, 0);
    },

    /**
     * Attempt theme generation with retry logic.
     * @private
     */
    _attemptGeneration: function (model, systemPrompt, userMsg, attempt) {
      var self = this;
      var messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMsg }
      ];

      return SQ.API.call(model, messages, {
        temperature: 0.4,
        max_tokens: 2000,
        timeout: 30000,
        source: 'ui_designer'
      })
        .then(function (raw) {
          return self._parseAndValidate(raw, model, systemPrompt, userMsg, attempt);
        });
    },

    /**
     * Parse, validate, and sanitize the LLM response.
     * @private
     */
    _parseAndValidate: function (raw, model, systemPrompt, userMsg, attempt) {
      var self = this;
      var theme;

      try {
        theme = SQ.API.parseJSON(raw);
      } catch (e) {
        SQ.Logger.warn('UIDesigner', 'JSON parse failed (attempt ' + (attempt + 1) + ')', { error: e.message });
        if (attempt < MAX_RETRIES) {
          return self._attemptGeneration(model, systemPrompt, userMsg, attempt + 1);
        }
        throw new Error('UI Designer returned unreadable JSON after ' + (MAX_RETRIES + 1) + ' attempts.');
      }

      // Basic structure validation
      if (!theme.colors || typeof theme.colors !== 'object') {
        SQ.Logger.warn('UIDesigner', 'Missing colors object (attempt ' + (attempt + 1) + ')');
        if (attempt < MAX_RETRIES) {
          return self._attemptGeneration(model, systemPrompt, userMsg, attempt + 1);
        }
        throw new Error('UI Designer returned invalid theme (missing colors).');
      }

      // Validate hex color format
      var hexPattern = /^#[0-9a-fA-F]{3,8}$/;
      Object.keys(theme.colors).forEach(function (key) {
        if (theme.colors[key] && !hexPattern.test(theme.colors[key])) {
          delete theme.colors[key];
        }
      });

      // Contrast validation — text must be readable against backgrounds
      if (theme.colors.text && theme.colors.bg) {
        var textBgRatio = contrastRatio(theme.colors.text, theme.colors.bg);
        if (textBgRatio < 4.5) {
          SQ.Logger.warn('UIDesigner', 'Poor text/bg contrast (' + textBgRatio.toFixed(1) + ':1), discarding theme colors');
          theme.colors = {};
        }
      }
      if (theme.colors.text && theme.colors.surface && Object.keys(theme.colors).length > 0) {
        var textSurfaceRatio = contrastRatio(theme.colors.text, theme.colors.surface);
        if (textSurfaceRatio < 4.5) {
          SQ.Logger.warn('UIDesigner', 'Poor text/surface contrast (' + textSurfaceRatio.toFixed(1) + ':1), discarding theme colors');
          theme.colors = {};
        }
      }

      if (!theme.fonts || typeof theme.fonts !== 'object') {
        theme.fonts = { body: 'Georgia', ui: 'system-ui' };
      }

      // Sanitize font names (prevent injection via font-family)
      if (theme.fonts.body) {
        theme.fonts.body = theme.fonts.body.replace(/[<>"';{}()]/g, '');
      }
      if (theme.fonts.ui) {
        theme.fonts.ui = theme.fonts.ui.replace(/[<>"';{}()]/g, '');
      }

      if (!theme.decorations || typeof theme.decorations !== 'object') {
        theme.decorations = {};
      }

      // Sanitize all SVG strings
      if (theme.decorations.divider_svg) {
        theme.decorations.divider_svg = sanitizeSvg(theme.decorations.divider_svg);
      }
      if (theme.decorations.background_pattern_svg) {
        theme.decorations.background_pattern_svg = sanitizeSvg(theme.decorations.background_pattern_svg);
      }

      // Sanitize card_border_style (only allow CSS border shorthand characters)
      if (theme.decorations.card_border_style) {
        theme.decorations.card_border_style = theme.decorations.card_border_style.replace(/[<>"';{}()]/g, '');
      }

      if (typeof theme.css_filter !== 'string') {
        theme.css_filter = 'none';
      }
      // Sanitize css_filter
      theme.css_filter = theme.css_filter.replace(/[<>"';{}]/g, '');

      SQ.Logger.info('UIDesigner', 'Theme generated', {
        primary: theme.colors.primary,
        bodyFont: theme.fonts.body,
        uiFont: theme.fonts.ui
      });
      SQ.Logger.infoFull('UIDesigner', 'Full theme', theme);

      return theme;
    },

    /**
     * Apply a theme to the game screen.
     * Sets CSS custom properties on #screen-game (scoped, not :root),
     * loads Google Fonts, and injects SVG decorations.
     * @param {object} theme - The theme JSON from generate()
     */
    apply: function (theme) {
      if (!theme) return;
      var gameScreen = document.getElementById('screen-game');
      if (!gameScreen) return;

      // 1. Apply colors (scoped to game screen)
      if (theme.colors) {
        Object.keys(COLOR_MAP).forEach(function (key) {
          if (theme.colors[key]) {
            gameScreen.style.setProperty(COLOR_MAP[key], theme.colors[key]);
          }
        });
      }

      // 2. Load and apply fonts
      if (theme.fonts) {
        this._loadFonts(theme.fonts);

        if (theme.fonts.body) {
          gameScreen.style.setProperty('--font-body', "'" + theme.fonts.body + "', Georgia, serif");
        }
        if (theme.fonts.ui) {
          gameScreen.style.setProperty('--font-ui', "'" + theme.fonts.ui + "', system-ui, sans-serif");
        }
      }

      // 3. Apply CSS filter to game screen
      if (theme.css_filter && theme.css_filter !== 'none') {
        gameScreen.style.filter = theme.css_filter;
      }

      // 4. Inject SVG decorations
      this._applyDecorations(theme.decorations || {});

      // 5. Also apply to game over screen so theme carries through
      var gameOverScreen = document.getElementById('screen-gameover');
      if (gameOverScreen && theme.colors) {
        Object.keys(COLOR_MAP).forEach(function (key) {
          if (theme.colors[key]) {
            gameOverScreen.style.setProperty(COLOR_MAP[key], theme.colors[key]);
          }
        });
        if (theme.fonts) {
          if (theme.fonts.body) {
            gameOverScreen.style.setProperty('--font-body', "'" + theme.fonts.body + "', Georgia, serif");
          }
          if (theme.fonts.ui) {
            gameOverScreen.style.setProperty('--font-ui', "'" + theme.fonts.ui + "', system-ui, sans-serif");
          }
        }
      }

      this._activeTheme = theme;
    },

    /**
     * Remove the active theme, restoring defaults.
     */
    remove: function () {
      // 1. Reset CSS custom properties on game screen
      var gameScreen = document.getElementById('screen-game');
      if (gameScreen) {
        ALL_CSS_VARS.forEach(function (prop) {
          gameScreen.style.removeProperty(prop);
        });
        gameScreen.style.filter = '';
      }

      // 2. Reset CSS custom properties on game over screen
      var gameOverScreen = document.getElementById('screen-gameover');
      if (gameOverScreen) {
        ALL_CSS_VARS.forEach(function (prop) {
          gameOverScreen.style.removeProperty(prop);
        });
      }

      // 3. Remove Google Fonts link
      if (this._fontLink) {
        this._fontLink.remove();
        this._fontLink = null;
      }

      // 4. Remove SVG decorations
      this._removeDecorations();

      this._activeTheme = null;
    },

    /**
     * Load Google Fonts by injecting a <link> tag.
     * @private
     */
    _loadFonts: function (fonts) {
      // Remove previous font link if any
      if (this._fontLink) {
        this._fontLink.remove();
        this._fontLink = null;
      }

      var families = [];
      if (fonts.body && fonts.body !== 'Georgia') {
        families.push(fonts.body.replace(/ /g, '+') + ':wght@400;700');
      }
      if (fonts.ui && fonts.ui !== 'system-ui') {
        families.push(fonts.ui.replace(/ /g, '+') + ':wght@400;600;700');
      }

      if (families.length === 0) return;

      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=' + families.join('&family=') + '&display=swap';
      document.head.appendChild(link);
      this._fontLink = link;
    },

    /**
     * Inject SVG decorative elements into the game screen.
     * @private
     */
    _applyDecorations: function (decorations) {
      // Clean up any existing decorations first
      this._removeDecorations();

      // Divider SVG between passage and choices
      if (decorations.divider_svg) {
        var passageEl = document.getElementById('passage-text');
        var choicesEl = document.getElementById('choices-container');
        if (passageEl && choicesEl) {
          var divider = document.createElement('div');
          divider.id = 'ui-theme-divider';
          divider.className = 'ui-theme-divider';
          divider.innerHTML = decorations.divider_svg;
          divider.style.textAlign = 'center';
          divider.style.margin = 'var(--spacing-md) 0';
          divider.style.opacity = '0.7';
          choicesEl.parentNode.insertBefore(divider, choicesEl);
          this._dividerEl = divider;
        }
      }

      // Background pattern SVG
      if (decorations.background_pattern_svg) {
        var svgDataUri = 'data:image/svg+xml,' + encodeURIComponent(decorations.background_pattern_svg);
        var style = document.createElement('style');
        style.id = 'ui-theme-bg-pattern';
        style.textContent = '#screen-game { background-image: url("' + svgDataUri + '"); background-repeat: repeat; background-size: auto; }';
        document.head.appendChild(style);
        this._bgStyleEl = style;
      }

      // Card border style
      if (decorations.card_border_style && decorations.card_border_style !== 'none') {
        var borderStyle = document.createElement('style');
        borderStyle.id = 'ui-theme-card-border';
        borderStyle.textContent = '#screen-game .card, #screen-game .btn-choice { border: ' + decorations.card_border_style + '; }';
        document.head.appendChild(borderStyle);
        this._cardBorderStyleEl = borderStyle;
      }
    },

    /**
     * Remove all injected SVG decorations from the DOM.
     * @private
     */
    _removeDecorations: function () {
      if (this._dividerEl) {
        this._dividerEl.remove();
        this._dividerEl = null;
      }
      if (this._bgStyleEl) {
        this._bgStyleEl.remove();
        this._bgStyleEl = null;
      }
      if (this._cardBorderStyleEl) {
        this._cardBorderStyleEl.remove();
        this._cardBorderStyleEl = null;
      }
    }
  };
})();
