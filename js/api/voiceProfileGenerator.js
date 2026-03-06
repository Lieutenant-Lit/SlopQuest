/**
 * SQ.VoiceProfileGenerator — Generates unique voice profiles for NPCs via LLM.
 * Each NPC gets a custom voice ID + style instruction (accent, tone, pacing, emotion)
 * tailored to their personality and the game's setting.
 */
(function () {
  var AVAILABLE_VOICES = [
    'alloy', 'ash', 'ballad', 'cedar', 'coral',
    'echo', 'fable', 'marin', 'nova', 'onyx',
    'sage', 'shimmer', 'verse'
  ];

  SQ.VoiceProfileGenerator = {
    /**
     * Generate voice profiles for all NPCs in the skeleton.
     * Makes a single LLM call that returns profiles for every NPC at once.
     * @param {object} skeleton - The story skeleton with npcs array
     * @param {object} meta - Game meta (setting, tone, etc.)
     * @returns {Promise<Object>} Map of NPC name → { voice, style }
     */
    generate: function (skeleton, meta) {
      if (!skeleton || !skeleton.npcs || skeleton.npcs.length === 0) {
        return Promise.resolve({});
      }

      if (SQ.useMockData) {
        return this._mockGenerate(skeleton);
      }

      var model = SQ.PlayerConfig.getModel('passage');
      var narratorVoice = SQ.PlayerConfig.getNarratorVoice();

      var npcList = skeleton.npcs.map(function (npc) {
        return '- ' + npc.name + ': ' + npc.role
          + (npc.motivation ? ' (' + npc.motivation + ')' : '');
      }).join('\n');

      var systemPrompt = 'You are a voice casting director for an audio drama. '
        + 'You assign distinct, memorable voice profiles to characters.\n\n'
        + 'OUTPUT FORMAT: Respond with ONLY a valid JSON object. No markdown, no code fences.\n\n'
        + 'AVAILABLE VOICES (OpenAI TTS voice IDs):\n'
        + '- alloy: Neutral, androgynous\n'
        + '- ash: Clear, young male\n'
        + '- ballad: Expressive, melodic\n'
        + '- cedar: Warm, male\n'
        + '- coral: Warm, young female\n'
        + '- echo: Resonant, deep male\n'
        + '- fable: Storyteller, male\n'
        + '- marin: Clear, female\n'
        + '- nova: Bright, young female\n'
        + '- onyx: Deep, authoritative male\n'
        + '- sage: Calm, female\n'
        + '- shimmer: Cheerful, bright female\n'
        + '- verse: Versatile, expressive\n\n'
        + 'The narrator already uses "' + narratorVoice + '", so avoid assigning that voice to any NPC. '
        + 'Each NPC should use a DIFFERENT voice from the others for maximum variety.\n\n'
        + 'For each NPC, create a "style" string that will be sent as a system prompt to the TTS model. '
        + 'This controls HOW they speak. Be specific about:\n'
        + '- Voice quality (gravelly, silky, raspy, clear, etc.)\n'
        + '- Tone (cold, warm, menacing, cheerful, weary, etc.)\n'
        + '- Pacing (fast/slow, clipped/flowing, deliberate, hurried)\n'
        + '- Accent (British, Irish, Scottish, Cockney, archaic, etc. — choose accents fitting the setting)\n'
        + '- Emotion (what simmers beneath the surface)\n'
        + '- Any speech quirks or mannerisms\n\n'
        + 'Make each character sound COMPLETELY DIFFERENT from the others. '
        + 'Variety in accent, pacing, and energy level is critical.';

      var userPrompt = 'STORY SETTING: ' + (meta.setting || 'Fantasy') + '\n'
        + 'TONE: ' + (meta.tone || 'Dark and atmospheric') + '\n\n'
        + 'CHARACTERS:\n' + npcList + '\n\n'
        + 'Respond with this exact JSON structure:\n'
        + '{\n'
        + '  "NPC Name": { "voice": "voice_id", "style": "detailed style instruction string" },\n'
        + '  ...\n'
        + '}\n\n'
        + 'One entry per NPC. Use their exact names as keys.';

      var messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];

      return SQ.API.call(model, messages, { temperature: 0.9, max_tokens: 2000 })
        .then(function (raw) {
          var parsed = SQ.API.parseJSON(raw);
          if (!parsed || typeof parsed !== 'object') {
            console.warn('VoiceProfileGenerator: failed to parse response, using fallback');
            return SQ.VoiceProfileGenerator._fallbackGenerate(skeleton, narratorVoice);
          }

          // Validate and clean up the response
          var result = {};
          skeleton.npcs.forEach(function (npc) {
            var entry = parsed[npc.name];
            if (entry && entry.voice && entry.style) {
              // Validate voice ID is in our list
              var voiceId = entry.voice.toLowerCase();
              if (AVAILABLE_VOICES.indexOf(voiceId) === -1) {
                voiceId = SQ.VoiceProfileGenerator._pickFallbackVoice(result, narratorVoice);
              }
              result[npc.name] = { voice: voiceId, style: entry.style };
            } else {
              // Fallback for missing NPCs
              result[npc.name] = {
                voice: SQ.VoiceProfileGenerator._pickFallbackVoice(result, narratorVoice),
                style: 'Speak naturally with a distinctive voice appropriate for a ' + (npc.role || 'character') + '.'
              };
            }
          });

          return result;
        })
        .catch(function (err) {
          console.warn('VoiceProfileGenerator: LLM call failed, using fallback');
          console.warn('  Error:', err.message || err);
          return SQ.VoiceProfileGenerator._fallbackGenerate(skeleton, narratorVoice);
        });
    },

    /**
     * Pick a voice that hasn't been used yet, excluding narrator voice.
     * @private
     */
    _pickFallbackVoice: function (usedMap, narratorVoice) {
      var usedVoices = {};
      usedVoices[narratorVoice] = true;
      var keys = Object.keys(usedMap);
      for (var i = 0; i < keys.length; i++) {
        var v = usedMap[keys[i]];
        usedVoices[typeof v === 'string' ? v : v.voice] = true;
      }
      for (var j = 0; j < AVAILABLE_VOICES.length; j++) {
        if (!usedVoices[AVAILABLE_VOICES[j]]) return AVAILABLE_VOICES[j];
      }
      return AVAILABLE_VOICES[0];
    },

    /**
     * Simple fallback when LLM call fails — assign distinct voices without style.
     * @private
     */
    _fallbackGenerate: function (skeleton, narratorVoice) {
      var pool = AVAILABLE_VOICES.filter(function (v) { return v !== narratorVoice; });
      var result = {};
      skeleton.npcs.forEach(function (npc, i) {
        result[npc.name] = {
          voice: pool[i % pool.length],
          style: 'Speak naturally with a distinctive voice appropriate for a ' + (npc.role || 'character') + '.'
        };
      });
      return result;
    },

    /**
     * Mock voice profile generation for development.
     * @private
     */
    _mockGenerate: function (skeleton) {
      var result = {};
      var mockProfiles = [
        { voice: 'coral', style: 'Voice: Warm but hardened. Tone: Passionate, determined. Pacing: Measured but urgent. Accent: Slight Irish lilt. Emotion: Fierce conviction tempered by weariness.' },
        { voice: 'onyx', style: 'Voice: Deep, gravelly. Tone: Cold, clipped military precision. Pacing: Short sharp sentences. Accent: Northern English gruffness. Emotion: Stoic, controlled anger.' },
        { voice: 'sage', style: 'Voice: Quiet, deliberate, ethereal. Tone: Detached, contemplative. Pacing: Very slow and precise. Accent: Refined old-world. Emotion: Cold curiosity.' },
        { voice: 'verse', style: 'Voice: Smooth, refined, condescending. Tone: Theatrical, self-important. Pacing: Languid, unhurried. Accent: Upper-class British. Emotion: Barely concealed ambition.' },
        { voice: 'nova', style: 'Voice: Quick, bright, scrappy. Tone: Cheeky, streetwise. Pacing: Fast and darting. Accent: Cockney-influenced. Emotion: Wary bravado masking vulnerability.' }
      ];

      skeleton.npcs.forEach(function (npc, i) {
        var profile = mockProfiles[i % mockProfiles.length];
        result[npc.name] = { voice: profile.voice, style: profile.style };
      });

      return Promise.resolve(result);
    }
  };
})();
