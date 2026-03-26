/**
 * SQ.UIDesigner — Generates and applies dynamic UI themes via LLM.
 * Produces a color palette, font selections, and SVG decorations
 * based on the story's setting and tone. Applies them as CSS custom
 * properties scoped to #screen-game, side border decorations on body,
 * atmospheric glow effects, and DOM injections. Removes cleanly on game exit.
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

  /**
   * Sanitize a CSS value string (border shorthand, filter, etc.)
   * @param {string} val - Raw CSS value
   * @returns {string} Sanitized value
   */
  function sanitizeCssValue(val) {
    if (!val || typeof val !== 'string') return '';
    return val.replace(/[<>"';{}()]/g, '');
  }

  /** Regex for validating rgba() glow color values. */
  var RGBA_PATTERN = /^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*[\d.]+\s*\)$/;

  SQ.UIDesigner = {
    /** Currently injected Google Fonts <link> element. */
    _fontLink: null,
    /** Currently active theme object. */
    _activeTheme: null,
    /** Injected DOM element and style references for cleanup. */
    _dividerEl: null,
    _bgStyleEl: null,
    _cardBorderStyleEl: null,
    _sideBorderStyleEl: null,
    _headerDecoEl: null,
    _headerBorderStyleEl: null,
    _glowStyleEl: null,

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
        max_tokens: 2500,
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

      // Fonts
      if (!theme.fonts || typeof theme.fonts !== 'object') {
        theme.fonts = { body: 'Georgia', ui: 'system-ui' };
      }
      if (theme.fonts.body) {
        theme.fonts.body = theme.fonts.body.replace(/[<>"';{}()]/g, '');
      }
      if (theme.fonts.ui) {
        theme.fonts.ui = theme.fonts.ui.replace(/[<>"';{}()]/g, '');
      }

      // Glow color
      if (theme.glow_color && typeof theme.glow_color === 'string') {
        if (!RGBA_PATTERN.test(theme.glow_color.trim())) {
          SQ.Logger.warn('UIDesigner', 'Invalid glow_color format, discarding', { value: theme.glow_color });
          theme.glow_color = null;
        } else {
          theme.glow_color = theme.glow_color.trim();
        }
      } else {
        theme.glow_color = null;
      }

      // CSS filter
      if (typeof theme.css_filter !== 'string') {
        theme.css_filter = 'none';
      }
      theme.css_filter = sanitizeCssValue(theme.css_filter);

      // Decorations
      if (!theme.decorations || typeof theme.decorations !== 'object') {
        theme.decorations = {};
      }

      // Sanitize all SVG strings
      if (theme.decorations.divider_svg) {
        theme.decorations.divider_svg = sanitizeSvg(theme.decorations.divider_svg);
        if (theme.decorations.divider_svg.length > 3000) theme.decorations.divider_svg = null;
      }
      if (theme.decorations.background_pattern_svg) {
        theme.decorations.background_pattern_svg = sanitizeSvg(theme.decorations.background_pattern_svg);
        if (theme.decorations.background_pattern_svg.length > 2000) theme.decorations.background_pattern_svg = null;
      }
      if (theme.decorations.side_border_svg) {
        theme.decorations.side_border_svg = sanitizeSvg(theme.decorations.side_border_svg);
        if (theme.decorations.side_border_svg.length > 3000) theme.decorations.side_border_svg = null;
      }
      if (theme.decorations.header_decoration_svg) {
        theme.decorations.header_decoration_svg = sanitizeSvg(theme.decorations.header_decoration_svg);
        if (theme.decorations.header_decoration_svg.length > 1500) theme.decorations.header_decoration_svg = null;
      }

      // Sanitize CSS value strings
      if (theme.decorations.card_border_style) {
        theme.decorations.card_border_style = sanitizeCssValue(theme.decorations.card_border_style);
      }
      if (theme.decorations.header_border_style) {
        theme.decorations.header_border_style = sanitizeCssValue(theme.decorations.header_border_style);
      }

      SQ.Logger.info('UIDesigner', 'Theme generated', {
        primary: theme.colors.primary,
        bodyFont: theme.fonts.body,
        uiFont: theme.fonts.ui,
        hasSideBorders: !!theme.decorations.side_border_svg,
        hasGlow: !!theme.glow_color
      });
      SQ.Logger.infoFull('UIDesigner', 'Full theme', theme);

      return theme;
    },

    /**
     * Apply a theme to the game screen.
     * Sets CSS custom properties on #screen-game (scoped, not :root),
     * loads Google Fonts, injects SVG decorations, side borders, and glow.
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

      // 4. Inject all decorations (SVGs, side borders, glow, header)
      this._applyDecorations(theme.decorations || {}, theme.glow_color);

      // 5. Also apply colors/fonts to game over screen
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

      // 6. Add body class for side border pseudo-elements
      document.body.classList.add('game-themed');

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

      // 4. Remove body class
      document.body.classList.remove('game-themed');

      // 5. Remove all injected decorations
      this._removeDecorations();

      this._activeTheme = null;
    },

    /**
     * Load Google Fonts by injecting a <link> tag.
     * @private
     */
    _loadFonts: function (fonts) {
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
     * Inject all decorative elements: SVGs, side borders, glow, header.
     * @private
     */
    _applyDecorations: function (decorations, glowColor) {
      // Clean up any existing decorations first
      this._removeDecorations();

      // --- Side border SVG (most impactful) ---
      if (decorations.side_border_svg) {
        var svgUri = 'data:image/svg+xml,' + encodeURIComponent(decorations.side_border_svg);
        var sideStyle = document.createElement('style');
        sideStyle.id = 'ui-theme-side-borders';
        sideStyle.textContent =
          'body.game-themed::before, body.game-themed::after {' +
          '  content: "";' +
          '  position: fixed;' +
          '  top: 0; bottom: 0;' +
          '  width: 40px;' +
          '  background-image: url("' + svgUri + '");' +
          '  background-repeat: repeat-y;' +
          '  background-size: 40px auto;' +
          '  opacity: 0.5;' +
          '  pointer-events: none;' +
          '  z-index: 0;' +
          '}' +
          'body.game-themed::before { left: 0; }' +
          'body.game-themed::after { right: 0; transform: scaleX(-1); }' +
          '@media (max-width: 767px) {' +
          '  body.game-themed::before, body.game-themed::after {' +
          '    width: 16px; opacity: 0.3;' +
          '  }' +
          '}';
        document.head.appendChild(sideStyle);
        this._sideBorderStyleEl = sideStyle;
      }

      // --- Glow effect ---
      if (glowColor) {
        var glowStyle = document.createElement('style');
        glowStyle.id = 'ui-theme-glow';
        glowStyle.textContent =
          '#screen-game, #screen-gameover {' +
          '  box-shadow: 0 0 40px 15px ' + glowColor + ';' +
          '}' +
          '#screen-game .btn-choice:hover:not(:disabled) {' +
          '  box-shadow: 0 0 12px ' + glowColor + ';' +
          '}' +
          '#screen-game .game-header-row h1,' +
          '#screen-gameover .screen-header h1 {' +
          '  text-shadow: 0 0 20px ' + glowColor + ';' +
          '}';
        document.head.appendChild(glowStyle);
        this._glowStyleEl = glowStyle;
      }

      // --- Header decoration SVG ---
      if (decorations.header_decoration_svg) {
        var gameScreen = document.getElementById('screen-game');
        if (gameScreen) {
          var screenHeader = gameScreen.querySelector('.screen-header');
          if (screenHeader) {
            var headerDeco = document.createElement('div');
            headerDeco.id = 'ui-theme-header-deco';
            headerDeco.className = 'ui-theme-header-deco';
            headerDeco.innerHTML = decorations.header_decoration_svg;
            screenHeader.parentNode.insertBefore(headerDeco, screenHeader.nextSibling);
            this._headerDecoEl = headerDeco;
          }
        }
      }

      // --- Header border style ---
      if (decorations.header_border_style && decorations.header_border_style !== 'none') {
        var hdrBorderStyle = document.createElement('style');
        hdrBorderStyle.id = 'ui-theme-header-border';
        hdrBorderStyle.textContent =
          '#screen-game .screen-header,' +
          '#screen-gameover .screen-header {' +
          '  border-bottom: ' + decorations.header_border_style + ';' +
          '}';
        document.head.appendChild(hdrBorderStyle);
        this._headerBorderStyleEl = hdrBorderStyle;
      }

      // --- Divider SVG between passage and choices ---
      if (decorations.divider_svg) {
        var passageEl = document.getElementById('passage-text');
        var choicesEl = document.getElementById('choices-container');
        if (passageEl && choicesEl) {
          var divider = document.createElement('div');
          divider.id = 'ui-theme-divider';
          divider.className = 'ui-theme-divider';
          divider.innerHTML = decorations.divider_svg;
          choicesEl.parentNode.insertBefore(divider, choicesEl);
          this._dividerEl = divider;
        }
      }

      // --- Background pattern SVG ---
      if (decorations.background_pattern_svg) {
        var bgUri = 'data:image/svg+xml,' + encodeURIComponent(decorations.background_pattern_svg);
        var bgStyle = document.createElement('style');
        bgStyle.id = 'ui-theme-bg-pattern';
        bgStyle.textContent = '#screen-game { background-image: url("' + bgUri + '"); background-repeat: repeat; background-size: auto; }';
        document.head.appendChild(bgStyle);
        this._bgStyleEl = bgStyle;
      }

      // --- Card border style ---
      if (decorations.card_border_style && decorations.card_border_style !== 'none') {
        var cardStyle = document.createElement('style');
        cardStyle.id = 'ui-theme-card-border';
        cardStyle.textContent = '#screen-game .card, #screen-game .btn-choice { border: ' + decorations.card_border_style + '; }';
        document.head.appendChild(cardStyle);
        this._cardBorderStyleEl = cardStyle;
      }
    },

    /**
     * Remove all injected decorations from the DOM.
     * @private
     */
    _removeDecorations: function () {
      var refs = [
        '_dividerEl', '_bgStyleEl', '_cardBorderStyleEl',
        '_sideBorderStyleEl', '_headerDecoEl', '_headerBorderStyleEl',
        '_glowStyleEl'
      ];
      var self = this;
      refs.forEach(function (ref) {
        if (self[ref]) {
          self[ref].remove();
          self[ref] = null;
        }
      });
    }
  };
})();
