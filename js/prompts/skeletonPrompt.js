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
      var difficulty = SQ.DifficultyConfig[setupConfig.difficulty] || SQ.DifficultyConfig.normal;
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
      p += '- Tone: ' + (setupConfig.tone || 'dark and atmospheric') + '\n';
      p += '- Perspective: ' + (setupConfig.perspective || 'second person') + '\n';
      p += '- Tense: ' + (setupConfig.tense || 'present') + '\n';
      p += '- Difficulty: ' + difficulty.label + '\n';
      p += '- Story length: ' + storyLength.label + '\n\n';

      // Required JSON schema
      p += 'Generate a complete story skeleton following this EXACT schema:\n';
      p += '{\n';
      p += '  "title": "string — evocative story title",\n';
      p += '  "player_name": "string — a fitting name for the player character, based on the setting and character concept",\n';
      p += '  "premise": "string — 2-3 sentence hook",\n';
      p += '  "central_question": "string — the dramatic question driving the story",\n';
      p += '  "ending_shape": "string — the form of the ending (not content), e.g. \'sacrifice or survival\', \'mystery solved\', \'escape achieved\'",\n';
      p += '  "healing_context": "string — how healing works in this setting (e.g. \'magic potions and healing spells can mend wounds in hours\', \'wounds heal naturally over days with rest and bandages\', \'nanobots repair tissue damage within minutes\')",\n';
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

      // Story length rules
      p += 'STORY LENGTH RULES (' + storyLength.label + '):\n';
      p += '- Total turns: ' + storyLength.total_turns.min + '-' + storyLength.total_turns.max + '\n';
      p += '- Turns per act: ' + storyLength.turns_per_act.min + '-' + storyLength.turns_per_act.max + '\n';
      p += '- NPC count: ' + storyLength.npc_count.min + '-' + storyLength.npc_count.max + '\n';
      p += '- Faction count: ' + storyLength.faction_count.min + '-' + storyLength.faction_count.max + '\n';
      p += '- Subplot threads: ' + storyLength.subplot_threads.min + '-' + storyLength.subplot_threads.max + '\n';
      p += '- Max pending consequences: ' + storyLength.max_pending_consequences + '\n\n';

      // Difficulty rules
      p += 'DIFFICULTY RULES (' + difficulty.label + '):\n';
      p += '- Safe choice ratio: ' + difficulty.safe_choice_ratio + ' (proportion of choices that are safe)\n';
      p += '- Consequence severity: ' + difficulty.consequence_severity + '\n';
      p += '- Game over allowed: ' + difficulty.allow_game_over + '\n';
      p += '- Game over frequency: ' + difficulty.game_over_frequency + '\n';
      p += '- Hint transparency: ' + difficulty.hint_transparency + '\n';
      p += '- Relationship decay rate: ' + difficulty.relationship_decay_rate + '\n';
      p += '- Pending consequence speed: ' + difficulty.pending_consequence_speed + '\n';
      p += '- Recovery paths: ' + difficulty.recovery_paths + '\n';
      p += '- NPC forgiveness: ' + difficulty.npc_forgiveness + '\n\n';

      // Tier-specific skeleton constraints
      if (setupConfig.difficulty === 'chill') {
        p += 'CHILL DIFFICULTY SKELETON REQUIREMENTS:\n';
        p += '- The skeleton must NEVER include death states, lethal outcomes, or game_over triggers\n';
        p += '- All choices should lead to interesting story developments, not punishments\n';
        p += '- Consequences should be narrative setbacks at most — lost items, blocked paths, NPC disappointment — never threatening\n';
        p += '- NPCs should be generally helpful or at worst inconvenient — no genuinely hostile NPCs that threaten the player\n';
        p += '- Locked constraints should protect the player from accidentally entering dangerous situations\n';
        p += '- The key_beats should focus on discovery, relationships, and narrative progression — not survival\n\n';
      } else if (setupConfig.difficulty === 'normal') {
        p += 'NORMAL DIFFICULTY SKELETON REQUIREMENTS:\n';
        p += '- The skeleton must NOT include death states or game_over triggers\n';
        p += '- Consequences should be meaningful but recoverable — status effects, relationship damage, lost items\n';
        p += '- Include both safe and risky choices. Risky choices should have bigger rewards but real mechanical costs\n';
        p += '- NPCs can be hostile but should offer paths to resolution or avoidance\n';
        p += '- The story should feel challenging but fair — a player paying attention should rarely feel stuck\n\n';
      } else if (setupConfig.difficulty === 'hard') {
        p += 'HARD DIFFICULTY SKELETON REQUIREMENTS:\n';
        p += '- Death is possible but rare: include at most 1 lethal choice per act\n';
        p += '- Lethal choices MUST be foreshadowed — clues in earlier passages should hint at the danger\n';
        p += '- Include severe consequences: serious status effects, permanent NPC hostility, lost items\n';
        p += '- Pending consequences should escalate quickly (1-2 scenes) and hit hard when they trigger\n';
        p += '- Recovery paths exist but require sacrifice — healing requires effort, alliances cost favors\n';
        p += '- NPCs hold grudges. Betraying or ignoring an NPC should have lasting consequences\n\n';
      } else if (setupConfig.difficulty === 'brutal') {
        p += 'BRUTAL DIFFICULTY REQUIREMENTS:\n';
        p += '- At least 40% of choices across each act must have outcome DEATH or SEVERE_PENALTY\n';
        p += '- At least one game_over state must exist per act\n';
        p += '- No scene may have more than two advance_safe options\n';
        p += '- At least one death per act must be non-obvious (requires interpreting earlier clues)\n';
        p += '- Create genuine trap logic — choices that SOUND safe but are lethal based on earlier context the player may not have noticed\n';
        p += '- Consequences are immediate and severe. Pending consequences trigger within 0-1 scenes\n';
        p += '- NPCs never forgive. A single wrong move with an NPC should permanently close that relationship\n';
        p += '- Include cascading failure states where one bad choice makes subsequent choices more dangerous\n\n';
      }

      // Length × Difficulty interaction
      p += 'LENGTH × DIFFICULTY INTERACTION (' + storyLength.label + ' + ' + difficulty.label + '):\n';
      if (setupConfig.storyLength === 'short') {
        if (setupConfig.difficulty === 'brutal') {
          p += '- Short + Brutal = a deadly sprint. Nearly every choice matters. Pack maximum danger into few turns.\n';
        } else {
          p += '- Short story: keep the plot focused and tight. Every scene should advance the central question.\n';
        }
      } else if (setupConfig.storyLength === 'long') {
        if (setupConfig.difficulty === 'brutal' || setupConfig.difficulty === 'hard') {
          p += '- Long + ' + difficulty.label + ' = a war of attrition. Consequences compound over dozens of turns. Status effects stack and healing is scarce.\n';
        } else {
          p += '- Long story: develop subplots, deepen NPC relationships, let consequences play out over many scenes.\n';
        }
      } else {
        p += '- Medium length: balance pacing with depth. Enough room for subplots but keep the main arc tight.\n';
      }
      p += '\n';

      // Healing context guidance
      p += 'HEALING CONTEXT — REQUIRED:\n';
      p += 'Describe how healing works in THIS setting. This tells the Game Master how fast injuries should heal and what methods are available.\n';
      p += 'Examples:\n';
      p += '- Fantasy: "Healing potions can mend minor wounds instantly. Serious injuries require a healer or extended rest. Magic can accelerate bone-setting but leaves the patient exhausted."\n';
      p += '- Sci-fi: "Medical nanobots repair tissue damage over hours. Severe trauma requires a medbay. Cybernetic replacements are available but expensive."\n';
      p += '- Realistic/gritty: "Wounds heal naturally over days and weeks. Bandages stop bleeding, splints set bones. Without proper treatment, injuries can worsen or become infected."\n';
      p += '- Superhero: "The character heals rapidly — minor injuries in minutes, major ones in hours. Only extraordinary damage poses lasting danger."\n';
      p += 'Make it specific to your setting. If it\'s an established universe, match the lore.\n\n';

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
      p += '- Named NPCs with hidden motivations (count per story length setting above)\n';
      p += '- Companion allocation: If the setting or character concept implies the player leads or belongs to a group (e.g. a ship crew, adventuring party, squad, band, heist team), mark MOST of the NPCs as companions (companion: true). These are the player\'s core cast. Only antagonists and quest-givers should be non-companions in ensemble settings.\n';
      p += '- For solo-journey or lone-wolf concepts, one companion is enough — or zero if the concept demands isolation.\n';
      p += '- When the NPC count cap is low (e.g. 3-4 for short stories), prioritize the most important ensemble members rather than diluting with background characters.\n';
      p += '- Factions with competing interests (count per story length setting above)\n';
      p += '- Target scenes per act matching the story length setting\n';
      p += '- World rules that create interesting constraints on player choices\n';
      p += '- Enough world state flags to track major consequences (one per NPC alive status + key plot flags)\n';

      return p;
    }
  };
})();
