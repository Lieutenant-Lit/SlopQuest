/**
 * SQ.UIDesigner — Generates and applies dynamic UI themes via LLM.
 * Produces a color palette, font selections, and SVG decorations
 * based on the story's setting and tone. Applies them as CSS custom
 * properties and DOM injections; removes them cleanly on game exit.
 */
(function () {
  var MAX_RETRIES = 1;

  /** CSS variable defaults (mirrors :root in main.css). */
  var CSS_DEFAULTS = {
    '--color-bg': '#0a0a0f',
    '--color-surface': '#14141f',
    '--color-surface-raised': '#1e1e2e',
    '--color-border': '#2a2a3a',
    '--color-text': '#e0e0e8',
    '--color-text-muted': '#8888a0',
    '--color-primary': '#7c6ff0',
    '--color-primary-hover': '#9488f8',
    '--color-secondary': '#2a2a3a',
    '--color-secondary-hover': '#3a3a4a',
    '--color-danger': '#e04050',
    '--color-success': '#40c060',
    '--color-warning': '#e0a030',
    '--font-body': "'Georgia', 'Times New Roman', serif",
    '--font-ui': "system-ui, -apple-system, 'Segoe UI', sans-serif"
  };

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

  SQ.UIDesigner = {
    /** Currently injected Google Fonts <link> element. */
    _fontLink: null,
    /** Currently active theme object. */
    _activeTheme: null,
    /** Injected divider element reference. */
    _dividerEl: null,
    /** Injected background style element reference. */
    _bgStyleEl: null,

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
     * Parse and validate the LLM response.
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

      if (!theme.fonts || typeof theme.fonts !== 'object') {
        // Non-fatal — use defaults
        theme.fonts = { body: 'Georgia', ui: 'system-ui' };
      }

      if (!theme.decorations || typeof theme.decorations !== 'object') {
        theme.decorations = {};
      }

      if (typeof theme.css_filter !== 'string') {
        theme.css_filter = 'none';
      }

      SQ.Logger.info('UIDesigner', 'Theme generated', {
        primary: theme.colors.primary,
        bodyFont: theme.fonts.body,
        uiFont: theme.fonts.ui
      });
      SQ.Logger.infoFull('UIDesigner', 'Full theme', theme);

      return theme;
    },

    /**
     * Apply a theme to the document.
     * Sets CSS custom properties, loads Google Fonts, and injects SVG decorations.
     * @param {object} theme - The theme JSON from generate()
     */
    apply: function (theme) {
      if (!theme) return;
      var root = document.documentElement;

      // 1. Apply colors
      if (theme.colors) {
        Object.keys(COLOR_MAP).forEach(function (key) {
          if (theme.colors[key]) {
            root.style.setProperty(COLOR_MAP[key], theme.colors[key]);
          }
        });
      }

      // 2. Load and apply fonts
      if (theme.fonts) {
        this._loadFonts(theme.fonts);

        if (theme.fonts.body) {
          root.style.setProperty('--font-body', "'" + theme.fonts.body + "', Georgia, serif");
        }
        if (theme.fonts.ui) {
          root.style.setProperty('--font-ui', "'" + theme.fonts.ui + "', system-ui, sans-serif");
        }
      }

      // 3. Apply CSS filter to game screen
      var gameScreen = document.getElementById('screen-game');
      if (gameScreen && theme.css_filter && theme.css_filter !== 'none') {
        gameScreen.style.filter = theme.css_filter;
      }

      // 4. Inject SVG decorations
      this._applyDecorations(theme.decorations || {});

      this._activeTheme = theme;
    },

    /**
     * Remove the active theme, restoring defaults.
     */
    remove: function () {
      var root = document.documentElement;

      // 1. Reset CSS custom properties
      Object.keys(CSS_DEFAULTS).forEach(function (prop) {
        root.style.removeProperty(prop);
      });

      // 2. Remove Google Fonts link
      if (this._fontLink) {
        this._fontLink.remove();
        this._fontLink = null;
      }

      // 3. Remove CSS filter
      var gameScreen = document.getElementById('screen-game');
      if (gameScreen) {
        gameScreen.style.filter = '';
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
