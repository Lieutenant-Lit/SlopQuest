/**
 * SQ.SkeletonPrompt — Builds the system prompt for skeleton generation.
 * Based on design doc Section 9.1 prompt template.
 */
(function () {
  SQ.SkeletonPrompt = {
    /**
     * Build the skeleton generation system prompt from setup config.
     * @param {object} setupConfig - Player's game setup choices
     * @returns {string} System prompt
     */
    build: function (setupConfig) {
      var storyLength = SQ.StoryLengthConfig[setupConfig.storyLength] || SQ.StoryLengthConfig.medium;

      var p = '';

      p += 'You are a game designer creating the complete story skeleton for an interactive gamebook. ';
      p += 'Output ONLY a valid JSON object — no prose, no markdown, no code fences, no explanation. ';
      p += 'Nothing before or after the JSON.\n\n';

      // Player configuration
      p += 'The player has chosen these parameters:\n';
      p += '- Setting: ' + (setupConfig.setting || 'fantasy') + '\n';
      p += '- Character concept: ' + (setupConfig.archetype || 'wanderer') + '\n';
      p += '- Writing style: ' + (setupConfig.writingStyle || 'literary') + '\n';
      p += '- Tone: ' + (setupConfig.tone || 'balanced') + '\n';
      p += '- Perspective: ' + (setupConfig.perspective || 'second person') + '\n';
      p += '- Tense: ' + (setupConfig.tense || 'present') + '\n';
      p += '- Story length: ' + storyLength.label + '\n\n';

      // Required JSON schema
      p += 'Generate a complete story skeleton following this EXACT schema:\n';
      p += '{\n';
      p += '  "title": "string — evocative story title",\n';
      p += '  "player_name": "string — a fitting name for the player character, based on the setting and character concept",\n';
      p += '  "premise": "string — 2-3 sentence hook",\n';
      p += '  "central_question": "string — the dramatic question driving the story",\n';
      p += '  "ending_shape": "string — the form of the ending (not content), e.g. \'mystery solved\', \'love found or lost\', \'escape achieved\', \'truth revealed\'",\n';
      p += '  "starting_inventory": [\n';
      p += '    "string — item the character starts with, appropriate to setting and archetype"\n';
      p += '  ],\n';
      p += '  "setting": {\n';
      p += '    "name": "string — name of the world/location",\n';
      p += '    "description": "string — 2-3 sentences describing the setting",\n';
      p += '    "tone_notes": "string — atmosphere and mood guidance"\n';
      p += '  },\n';
      p += '  "acts": [\n';
      p += '    {\n';
      p += '      "act_number": 1,\n';
      p += '      "title": "string",\n';
      p += '      "description": "string — what happens in this act",\n';
      p += '      "end_condition": "string — specific trigger that advances to next act",\n';
      p += '      "target_scenes": "number — scene count for this act",\n';
      p += '      "locked_constraints": ["array of strings — things that MUST NOT happen yet in this act"],\n';
      p += '      "key_beats": ["array of strings — major plot points in this act"]\n';
      p += '    }\n';
      p += '    // ... 3 acts total\n';
      p += '  ],\n';
      p += '  "npcs": [\n';
      p += '    {\n';
      p += '      "name": "string",\n';
      p += '      "role": "string — e.g. \'reluctant ally\', \'hidden antagonist\', \'mentor\'",\n';
      p += '      "motivation": "string",\n';
      p += '      "allegiance": "string — faction name or \'unaligned\'",\n';
      p += '      "secret": "string — hidden from player, known to skeleton",\n';
      p += '      "initial_relationship": "number — -100 to 100",\n';
      p += '      "companion": "boolean — true if this NPC travels with the player as a party member, false otherwise"\n';
      p += '    }\n';
      p += '  ],\n';
      p += '  "factions": [\n';
      p += '    {\n';
      p += '      "name": "string",\n';
      p += '      "description": "string",\n';
      p += '      "goals": "string"\n';
      p += '    }\n';
      p += '  ],\n';
      p += '  "world_rules": ["array of strings — fundamental constraints on the setting"],\n';
      p += '  "initial_world_flags": { "flag_name": true/false }\n';
      p += '}\n\n';

      // Tone alignment — skeleton must serve the player's stated tone
      p += 'CRITICAL — TONE ALIGNMENT:\n';
      p += '- The tone_notes you generate MUST reinforce the player\'s Writing Style and Tone settings above, not subvert or contradict them.\n';
      p += '- If the player asked for comedy, tone_notes must establish a comedic atmosphere — not inject grimdark undertones.\n';
      p += '- The skeleton is tone-first. Match the atmosphere and mood to whatever the player asked for — comedy means comedy, horror means horror.\n';
      p += '- Read what the player actually wrote and serve that vision.\n\n';

      // Story length rules
      p += 'STORY LENGTH RULES (' + storyLength.label + '):\n';
      p += '- Total turns: ' + storyLength.total_turns.min + '-' + storyLength.total_turns.max + '\n';
      p += '- Turns per act: ' + storyLength.turns_per_act.min + '-' + storyLength.turns_per_act.max + '\n';
      p += '- Faction count: ' + storyLength.faction_count.min + '-' + storyLength.faction_count.max + '\n';
      p += '- Subplot threads: ' + storyLength.subplot_threads.min + '-' + storyLength.subplot_threads.max + '\n\n';

      // Starting inventory guidance
      p += 'STARTING INVENTORY — REQUIRED:\n';
      p += 'List 3-8 concrete items the character would realistically have at the start of the story, given their archetype and setting.\n';
      p += '- Items should be tangible, specific things — not abstract concepts or stats.\n';
      p += '- For established settings/universes, use CANONICAL items that make sense in the lore. For example:\n';
      p += '  - Hitchhiker\'s Guide: "a towel", "a copy of The Hitchhiker\'s Guide to the Galaxy", "a Sub-Etha Sens-O-Matic"\n';
      p += '  - Kingkiller Chronicles musician: "a lute", "a traveler\'s cloak", "a few jots and drabs"\n';
      p += '  - Star Wars bounty hunter: "a blaster pistol", "a set of Mandalorian armor", "a tracking fob"\n';
      p += '- For original settings, think about what this specific character would carry: tools of their trade, personal effects, supplies.\n';
      p += '- Currency should be a specific amount with the setting\'s currency name (e.g. "15 gold crowns", "200 credits").\n';
      p += '- Do NOT include abstract resources, stats, or game mechanics as inventory items.\n\n';

      // Final requirements
      p += 'The skeleton must have:\n';
      p += '- A clear central dramatic question that drives the entire story\n';
      p += '- An ending shape (not content, just form) that everything builds toward\n';
      p += '- Three acts with distinct purposes, locked constraints, and clear end conditions\n';
      p += '- Named NPCs with hidden motivations. Include as many NPCs as the setting naturally demands. For established universes, include the important canonical characters. For original settings, create enough NPCs to support the story\'s factions and relationships. Avoid filler characters — every NPC should matter to the plot.\n';
      p += '- Companion allocation: If the setting or character concept implies the player leads or belongs to a group (e.g. a ship crew, adventuring party, squad, band, heist team), mark MOST of the NPCs as companions (companion: true). These are the player\'s core cast. Only antagonists and quest-givers should be non-companions in ensemble settings.\n';
      p += '- For solo-journey or lone-wolf concepts, one companion is enough — or zero if the concept demands isolation.\n';
      p += '- Factions with competing interests (count per story length setting above)\n';
      p += '- Target scenes per act matching the story length setting\n';
      p += '- World rules that create interesting constraints on player choices\n';
      p += '- Enough world state flags to track major consequences (one per major NPC state + key plot flags)\n';

      return p;
    }
  };
})();
