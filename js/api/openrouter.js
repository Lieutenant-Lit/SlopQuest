/**
 * SQ.API — Base API client for OpenRouter.
 * All API calls go through here. Handles all error types from Section 6.7:
 * network failures, auth (401/403), credits (402), rate limits (429 w/ auto-retry),
 * model errors (500+), timeouts (30s AbortController), malformed responses.
 */
(function () {
  var BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';
  var TIMEOUT_MS = 30000;
  var RATE_LIMIT_DELAY_MS = 10000;

  /**
   * Typed API error with a code for callers to distinguish error types.
   * @param {string} message - Human-readable error message
   * @param {string} code - Machine-readable error code
   */
  function APIError(message, code) {
    this.name = 'APIError';
    this.message = message;
    this.code = code;
  }
  APIError.prototype = Object.create(Error.prototype);
  APIError.prototype.constructor = APIError;

  // Error codes matching Section 6.7 error table
  var ErrorCodes = {
    NO_API_KEY: 'no_api_key',
    AUTH_FAILED: 'auth_failed',
    INSUFFICIENT_CREDITS: 'insufficient_credits',
    RATE_LIMITED: 'rate_limited',
    MODEL_ERROR: 'model_error',
    NETWORK_ERROR: 'network_error',
    TIMEOUT: 'timeout',
    MALFORMED_RESPONSE: 'malformed_response',
    UNKNOWN: 'unknown'
  };

  SQ.API = {
    /** Expose error codes for callers. */
    ErrorCodes: ErrorCodes,

    /** Expose APIError constructor for instanceof checks. */
    APIError: APIError,

    /**
     * Set of active AbortControllers keyed by a unique call ID.
     * Supports multiple parallel in-flight calls (e.g., text + image).
     */
    _controllers: {},

    /** Auto-incrementing call ID for tracking controllers. */
    _nextCallId: 1,

    /**
     * Make a chat completion call to OpenRouter.
     * Auto-retries once on 429 rate limit after a 10s delay.
     * @param {string} model - Model ID (e.g., 'anthropic/claude-sonnet-4')
     * @param {Array} messages - Array of { role, content } message objects
     * @param {object} [options] - Additional options (temperature, max_tokens, timeout, modalities, etc.)
     * @returns {Promise<object>} Parsed response message object
     */
    call: function (model, messages, options) {
      var callId = this._nextCallId++;
      var self = this;
      return this._callWithRetry(model, messages, options, 0, callId)
        .then(function (result) {
          delete self._controllers[callId];
          return result;
        })
        .catch(function (err) {
          delete self._controllers[callId];
          throw err;
        });
    },

    /**
     * Internal call with 429 retry logic.
     * @private
     */
    _callWithRetry: function (model, messages, options, retryCount, callId) {
      var self = this;
      var apiKey = SQ.PlayerConfig.getApiKey();
      if (!apiKey) {
        return Promise.reject(new APIError(
          'No API key configured. Set your key in Settings.',
          ErrorCodes.NO_API_KEY
        ));
      }

      options = options || {};
      var timeout = options.timeout || TIMEOUT_MS;
      var controller = new AbortController();
      this._controllers[callId] = controller;
      var timeoutId = setTimeout(function () { controller.abort(); }, timeout);

      var body = {
        model: model,
        messages: messages
      };

      if (options.modalities) body.modalities = options.modalities;
      if (options.temperature !== undefined) body.temperature = options.temperature;
      if (options.max_tokens) body.max_tokens = options.max_tokens;

      return fetch(BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey,
          'HTTP-Referer': window.location.href,
          'X-Title': 'SlopQuest'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      })
        .then(function (response) {
          clearTimeout(timeoutId);

          if (response.ok) {
            return response.json();
          }

          // Non-OK: read the body to get OpenRouter's actual error message
          return response.json().catch(function () {
            return { error: { message: 'HTTP ' + response.status } };
          }).then(function (errorBody) {
            var serverMsg = (errorBody.error && errorBody.error.message) || ('HTTP ' + response.status);
            SQ.Logger.error('API', 'HTTP error (' + response.status + ')', { status: response.status, message: serverMsg, model: model });

            if (response.status === 401 || response.status === 403) {
              throw new APIError(
                'API key rejected. Check your key in Settings.',
                ErrorCodes.AUTH_FAILED
              );
            }
            if (response.status === 402) {
              throw new APIError(
                'OpenRouter account has insufficient credits. Add funds and tap Retry.',
                ErrorCodes.INSUFFICIENT_CREDITS
              );
            }
            if (response.status === 429) {
              if (retryCount < 1) {
                return new Promise(function (resolve) {
                  setTimeout(resolve, RATE_LIMIT_DELAY_MS);
                }).then(function () {
                  return self._callWithRetry(model, messages, options, retryCount + 1, callId);
                });
              }
              throw new APIError(
                'Rate limited. Please wait a moment and try again.',
                ErrorCodes.RATE_LIMITED
              );
            }
            if (response.status >= 500) {
              throw new APIError(
                'The AI model returned an error: ' + serverMsg,
                ErrorCodes.MODEL_ERROR
              );
            }
            throw new APIError(
              serverMsg,
              ErrorCodes.UNKNOWN
            );
          });
        })
        .then(function (data) {
          if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            throw new APIError(
              'Unexpected API response format.',
              ErrorCodes.MALFORMED_RESPONSE
            );
          }
          SQ.Logger.info('API', 'Call OK', { model: model, usage: data.usage });
          if (SQ.API.onUsage) {
            SQ.API.onUsage(model, data.usage || {});
          }
          var msg = data.choices[0].message;

          // Return the full message for image callers (they need msg.images).
          // Text callers expect a string, so return content if no images present.
          if (msg.images && msg.images.length > 0) {
            return msg;
          }

          // Multipart content array (some models return this)
          if (Array.isArray(msg.content)) {
            return msg;
          }

          return msg.content;
        })
        .catch(function (err) {
          clearTimeout(timeoutId);

          // Already a typed APIError — rethrow
          if (err instanceof APIError) throw err;

          if (err.name === 'AbortError') {
            throw new APIError(
              'Response is taking too long. Tap Retry.',
              ErrorCodes.TIMEOUT
            );
          }

          // Network failure — fetch threw (offline, DNS, CORS, etc.)
          throw new APIError(
            'Connection lost. Check your internet and tap Retry.',
            ErrorCodes.NETWORK_ERROR
          );
        });
    },

    /**
     * Abort all in-flight API calls.
     * Safe to call even if no calls are active.
     */
    abort: function () {
      var controllers = this._controllers;
      for (var id in controllers) {
        if (controllers.hasOwnProperty(id) && controllers[id]) {
          controllers[id].abort();
        }
      }
      this._controllers = {};
    },

    /**
     * Notify a loading status callback during rate-limit waits.
     * This is set by callers who want to update UI during retries.
     * @type {function|null}
     */
    onStatusUpdate: null,

    /**
     * Usage callback fired after each successful API call.
     * Called with (modelId, usageObj) where usageObj has prompt_tokens, completion_tokens.
     * @type {function|null}
     */
    onUsage: null,

    /**
     * Validate an API key with a lightweight test call.
     * @param {string} apiKey - The key to validate
     * @returns {Promise<boolean>} True if valid
     */
    validateKey: function (apiKey) {
      return fetch(BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey,
          'HTTP-Referer': window.location.href,
          'X-Title': 'SlopQuest'
        },
        body: JSON.stringify({
          model: 'anthropic/claude-sonnet-4',
          messages: [{ role: 'user', content: 'Say "ok"' }],
          max_tokens: 5
        })
      })
        .then(function (response) {
          return response.ok;
        })
        .catch(function () {
          return false;
        });
    },

    /**
     * Parse a JSON string from an LLM response.
     * Strips markdown code fences if present.
     * @param {string} raw - Raw response string
     * @returns {object} Parsed JSON
     */
    parseJSON: function (raw) {
      if (typeof raw !== 'string') return raw;
      // Strip markdown code fences
      var cleaned = raw.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      try {
        return JSON.parse(cleaned);
      } catch (_e) {
        // Attempt repair: fix unescaped newlines inside JSON string values.
        // LLMs at high temperature often produce multi-paragraph passages with
        // literal newlines that aren't escaped, breaking JSON.parse().
        var repaired = cleaned.replace(/("(?:[^"\\]|\\.)*")|(\n)/g, function (match, quoted, newline) {
          if (quoted) return quoted;  // Already inside a properly quoted string
          return '\\n';  // Bare newline outside quotes — escape it
        });
        return JSON.parse(repaired);
      }
    }
  };
})();
