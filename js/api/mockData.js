/**
 * SQ.MockData — Hardcoded JSON responses for testing without API calls.
 * Matches skeleton and passage response formats from the design doc.
 */
(function () {
  /**
   * Mock skeleton response — a dark fantasy story.
   */
  var SKELETON_RESPONSE = {
    title: 'The Hollow Crown',
    premise: 'A disgraced knight returns to a kingdom on the brink of civil war, only to discover the throne itself is cursed — and they may be the only one who can break the cycle.',
    central_question: 'Will the protagonist restore the rightful ruler, seize power themselves, or destroy the crown forever?',
    ending_shape: 'The protagonist confronts the source of the curse in the throne room. Their choices throughout the story determine which of three endings plays out: restoration, usurpation, or destruction.',
    setting: {
      name: 'The Kingdom of Ashenmoor',
      description: 'A rain-drenched medieval kingdom of crumbling castles and fog-choked moors. The capital city of Thornwall sits on a cliff above a black river. Magic is rare and feared.',
      tone_notes: 'Dark, atmospheric, morally grey. No clear heroes or villains.'
    },
    acts: [
      {
        act_number: 1,
        title: 'The Return',
        description: 'The protagonist arrives at Thornwall to find the kingdom in turmoil. King Aldric is dying, factions are circling, and old enemies remember the protagonist\'s disgrace.',
        end_condition: 'The protagonist gains access to the inner court and witnesses the king\'s curse firsthand.',
        target_scenes: 10,
        locked_constraints: [
          'The protagonist cannot enter the throne room until Act 3',
          'NPC Sera must survive Act 1',
          'The curse must not be fully explained until Act 2'
        ],
        key_beats: [
          'Arrival at Thornwall gates — must talk past suspicious guards',
          'Encounter with Sera (old ally) who reveals faction tensions',
          'Confrontation with Captain Voss who remembers the disgrace',
          'Discovery of the king\'s worsening condition'
        ]
      },
      {
        act_number: 2,
        title: 'The Fracture',
        description: 'The kingdom splits into open conflict. The protagonist must navigate between factions while uncovering the true nature of the crown\'s curse. Betrayals and hard choices mount.',
        end_condition: 'The protagonist discovers the ritual to break the curse and must choose which faction to align with for the final confrontation.',
        target_scenes: 13,
        locked_constraints: [
          'At least one ally must betray the protagonist',
          'The crown\'s origin must be revealed',
          'The protagonist must lose something significant (relationship, resource, or ability)'
        ],
        key_beats: [
          'Faction leaders make their pitches for alliance',
          'The Archivist reveals the crown\'s cursed origin',
          'A trusted NPC\'s betrayal is revealed',
          'The ritual components are scattered — protagonist must choose which to pursue'
        ]
      },
      {
        act_number: 3,
        title: 'The Hollow Crown',
        description: 'The endgame. The protagonist pushes toward the throne room with their chosen allies. Every pending consequence comes due. The curse must be confronted.',
        end_condition: 'The protagonist stands before the Hollow Crown and makes the final choice.',
        target_scenes: 7,
        locked_constraints: [
          'All surviving NPCs must take a final stance',
          'The curse fights back — at least one scene of supernatural danger',
          'The ending must reflect cumulative choices, not just the final one'
        ],
        key_beats: [
          'Assault on (or infiltration of) Thornwall Castle',
          'Final confrontation with the primary antagonist',
          'The curse manifests physically — combat or ritual challenge',
          'The Crown\'s choice: restore, seize, or destroy'
        ]
      }
    ],
    npcs: [
      {
        name: 'Sera Blackwood',
        role: 'Former ally, now resistance leader',
        motivation: 'Wants to install a just ruler and protect the common folk',
        allegiance: 'The People\'s Front',
        secret: 'She was the one who reported the protagonist\'s original crime',
        initial_relationship: 40
      },
      {
        name: 'Captain Aldren Voss',
        role: 'Royal guard captain, loyal to the crown',
        motivation: 'Duty above all — will follow whoever sits the throne',
        allegiance: 'The Crown',
        secret: 'He knows the curse is spreading to other members of the court',
        initial_relationship: -20
      },
      {
        name: 'The Archivist',
        role: 'Keeper of forbidden knowledge in the cathedral library',
        motivation: 'Wants the curse studied and understood, not simply destroyed',
        allegiance: 'None — serves knowledge',
        secret: 'Was once the court mage who helped forge the Hollow Crown',
        initial_relationship: 0
      },
      {
        name: 'Lord Edric Thane',
        role: 'Ambitious noble, claims the throne by blood',
        motivation: 'Seize power, restore the old aristocratic order',
        allegiance: 'The Noble Houses',
        secret: 'Is already partially cursed from handling a crown fragment',
        initial_relationship: 10
      },
      {
        name: 'Mira',
        role: 'Street urchin and information broker',
        motivation: 'Survival and coin, but has a hidden loyalty to Sera',
        allegiance: 'Herself (secretly The People\'s Front)',
        secret: 'Is the illegitimate child of King Aldric',
        initial_relationship: 15
      }
    ],
    factions: [
      {
        name: 'The Crown',
        description: 'Loyalists who serve whoever wears the crown. Led by Captain Voss.',
        goals: 'Maintain order and legitimate succession'
      },
      {
        name: 'The Noble Houses',
        description: 'Aristocrats led by Lord Thane who want to restore noble power.',
        goals: 'Install Thane as king, reduce commoner influence'
      },
      {
        name: 'The People\'s Front',
        description: 'Common folk resistance led by Sera Blackwood.',
        goals: 'End aristocratic rule, protect the common people'
      }
    ],
    world_rules: [
      'Magic is rare and comes with a cost — using it drains health or sanity',
      'The crown\'s curse worsens the longer it goes without a rightful bearer',
      'Dead NPCs stay dead — no resurrection',
      'Information spreads — factions learn about the protagonist\'s actions within 2-3 scenes'
    ],
    initial_world_flags: {
      king_alive: true,
      curse_understood: false,
      crown_location_known: false,
      throne_room_accessible: false,
      sera_alive: true,
      voss_alive: true,
      archivist_alive: true,
      thane_alive: true,
      mira_alive: true,
      betrayal_revealed: false,
      ritual_discovered: false,
      faction_chosen: false
    }
  };

  /**
   * Mock passage responses — cycle through these for testing.
   */
  var PASSAGE_RESPONSES = [
    {
      passage: 'The gates of Thornwall loom before you, their iron teeth rusted but still menacing against the grey sky. Two guards in rain-soaked tabards eye your approach with suspicion. The taller one shifts his halberd across his chest — not quite a threat, but close enough.\n\n"State your business," he says. His eyes linger on the faded crest on your cloak. Recognition flickers across his face, followed quickly by contempt. "Wait. I know that sigil. You\'re the one they cast out three winters ago."\n\nThe shorter guard mutters something and reaches for the horn at his belt. Behind you, the road back to the moors stretches into fog. Inside the walls, you can hear the distant clang of a blacksmith and the murmur of a city that doesn\'t know how close it is to breaking.',
      illustration_prompt: 'Dark ink illustration of a cloaked figure standing before imposing medieval city gates in the rain, two guards blocking the entrance, fog-shrouded moors behind, crosshatched style',
      state_updates: {
        current: {
          location: 'Thornwall Gates',
          time_of_day: 'afternoon',
          scene_context: 'Confronted by gate guards who recognize the protagonist'
        }
      },
      choices: {
        A: {
          text: 'Present yourself honestly. "I\'ve come to serve the kingdom in its hour of need — whatever my past."',
          outcome: 'advance_safe',
          consequence: 'Guards grudgingly let you through. Word spreads that the exile has returned openly.'
        },
        B: {
          text: 'Lie. Claim to be a merchant from the eastern provinces, here to trade.',
          outcome: 'advance_risky',
          consequence: 'Deception check — may work, but if caught later, trust is harder to earn.'
        },
        C: {
          text: 'Bribe the guards with your last silver. Everyone has a price in a dying kingdom.',
          outcome: 'advance_safe',
          consequence: 'Lose 5 gold. Guards let you through quietly. No one knows you\'re here yet.'
        },
        D: {
          text: 'Slip away and find another way in. There were gaps in the wall near the river, if they haven\'t been repaired.',
          outcome: 'advance_risky',
          consequence: 'Takes longer but avoids detection. Risk of encountering something in the undercity.'
        }
      }
    },
    {
      passage: 'The Rusted Lantern hasn\'t changed. Same warped floorboards, same smoke-blackened ceiling, same bartender with the same dead-eyed stare. What\'s new is the tension — every table holds a cluster of people speaking in low voices, hands near weapons.\n\nYou find Sera in the back corner, hood up, fingers wrapped around a cup of something that steams in the cold air. She looks up as you approach, and for a moment her expression cycles through surprise, anger, and something that might be relief.\n\n"Three years," she says. "Not a word, and you walk in now. Of course you do." She kicks out the chair across from her. "Sit. You\'ll want to hear this before someone less friendly finds you."',
      illustration_prompt: 'Dark ink illustration of a tense tavern scene, hooded woman sitting alone in a corner booth, dim lantern light, medieval interior, crosshatched monochrome style',
      state_updates: {
        current: {
          location: 'The Rusted Lantern tavern',
          time_of_day: 'evening',
          scene_context: 'Meeting with old ally Sera Blackwood who has urgent information'
        },
        relationships: {
          'Sera Blackwood': 35
        }
      },
      choices: {
        A: {
          text: 'Sit down and listen. She clearly knows things you need to hear.',
          outcome: 'advance_safe',
          consequence: 'Sera shares intelligence about the factions and the king\'s condition. Relationship improves.'
        },
        B: {
          text: '"Three years and you\'re already giving orders. Some things never change." Press her on why she didn\'t reach out first.',
          outcome: 'advance_risky',
          consequence: 'Tense exchange. May learn about her guilt regarding the protagonist\'s exile.'
        },
        C: {
          text: 'Scan the tavern first. Who\'s watching? Trust needs to be earned again — by both of you.',
          outcome: 'hidden_benefit',
          consequence: 'Spot a spy from the Noble Houses listening in. Gain tactical advantage.'
        },
        D: {
          text: '"I\'m not here for old debts, Sera. I need to see the king." Cut straight to business.',
          outcome: 'advance_safe',
          consequence: 'Sera is hurt but respects the directness. Gives you a path to the court.'
        }
      }
    },
    {
      passage: 'Captain Voss finds you before you find him. You\'re crossing the market square when a gauntleted hand closes on your shoulder and spins you around. His face is older, harder, a fresh scar running from temple to jaw — but the eyes are the same cold blue.\n\n"I should arrest you on sight," he says, voice flat as iron. "Give me one reason not to." Behind him, three royal guards form a loose semicircle. Hands on pommels. The market goes quiet around you, vendors suddenly fascinated by their own wares.\n\nRain drips from the eaves. Somewhere a dog barks. Voss waits, and you can tell — he genuinely hasn\'t decided what to do with you yet.',
      illustration_prompt: 'Dark ink illustration of an armored guard captain confronting a figure in a medieval market square, soldiers behind him, tense standoff, rain, crosshatched woodcut style',
      state_updates: {
        current: {
          location: 'Thornwall market square',
          time_of_day: 'morning',
          scene_context: 'Confrontation with Captain Voss, who is deciding whether to arrest the protagonist'
        },
        relationships: {
          'Captain Aldren Voss': -15
        }
      },
      choices: {
        A: {
          text: '"Because the kingdom needs every sword it can get, and you know it." Appeal to duty.',
          outcome: 'advance_safe',
          consequence: 'Voss respects the pragmatism. Lets you go with a warning and a shadow — one of his guards tails you.'
        },
        B: {
          text: '"Because you\'re curious why I came back. Arrest me and you\'ll never find out."',
          outcome: 'advance_risky',
          consequence: 'Intrigues Voss. He may become a reluctant source of information, or a more determined enemy.'
        },
        C: {
          text: 'Say nothing. Hold his gaze. Let the silence speak.',
          outcome: 'advance_risky',
          consequence: 'A dominance challenge. Voss may respect the steel or take it as defiance.'
        },
        D: {
          text: 'Don\'t give him the chance. Break free and run into the crowd.',
          outcome: 'severe_penalty',
          consequence: 'Escape, but now you\'re a fugitive in the city. Voss becomes an active enemy. Lose access to the Crown faction.'
        }
      }
    },
    {
      passage: 'The cathedral library smells of dust and secrets. The Archivist moves between shelves that reach into darkness above, pulling volumes with the surety of someone who knows every page by heart. Their robes whisper against the stone floor.\n\n"You want to know about the crown," they say. It isn\'t a question. "Everyone does, eventually. The difference is what you\'re willing to pay for the knowledge."\n\nThey set three items on the reading table: a sealed scroll, a vial of something dark and viscous, and a key so old it seems to be made of compressed rust.\n\n"Each of these contains a piece of the answer. The scroll is the history — what the crown was made to do. The vial is the proof — what it\'s doing now. The key opens the place where it all began." They fold their hands. "I\'ll give you one freely. The other two will cost you."',
      illustration_prompt: 'Dark ink illustration of a robed figure in a vast cathedral library, three mysterious objects on an ancient reading table, candlelight, towering bookshelves, crosshatched monochrome',
      state_updates: {
        current: {
          location: 'Cathedral library',
          time_of_day: 'night',
          scene_context: 'The Archivist offers knowledge about the crown\'s curse, but at a price'
        },
        relationships: {
          'The Archivist': 10
        }
      },
      choices: {
        A: {
          text: 'Take the scroll. Start with the history — understanding the curse\'s origin is the foundation for everything else.',
          outcome: 'advance_safe',
          consequence: 'Learn the crown\'s origin story. Sets up Act 2 revelations. Must find other ways to get the vial and key.'
        },
        B: {
          text: 'Take the vial. You need proof of what\'s happening now — the present matters more than the past.',
          outcome: 'advance_safe',
          consequence: 'Gain evidence of the curse\'s current effects. Can be used to convince factions. History remains unknown.'
        },
        C: {
          text: 'Take the key. Whatever\'s behind that door is probably what everyone else is trying to reach first.',
          outcome: 'hidden_benefit',
          consequence: 'Gain access to the crown\'s forging chamber. Dangerous but invaluable. The Archivist is impressed by the boldness.'
        },
        D: {
          text: '"I\'ll take all three. Name your price." Some knowledge is too important to ration.',
          outcome: 'advance_risky',
          consequence: 'The Archivist\'s price is steep — a significant sacrifice (health, a relationship, or a secret). But you get everything.'
        }
      }
    }
  ];

  var passageIndex = 0;

  SQ.MockData = {
    SKELETON_RESPONSE: SKELETON_RESPONSE,
    PASSAGE_RESPONSES: PASSAGE_RESPONSES,

    /**
     * Return a mock skeleton generation response.
     * Simulates API delay with a short timeout.
     */
    generateSkeleton: function (setupConfig) {
      return new Promise(function (resolve) {
        setTimeout(function () {
          resolve(JSON.parse(JSON.stringify(SKELETON_RESPONSE)));
        }, 800);
      });
    },

    /**
     * Return a mock passage generation response.
     * Cycles through pre-written passages.
     */
    generatePassage: function (gameState) {
      return new Promise(function (resolve) {
        setTimeout(function () {
          var response = JSON.parse(JSON.stringify(PASSAGE_RESPONSES[passageIndex]));
          passageIndex = (passageIndex + 1) % PASSAGE_RESPONSES.length;
          resolve(response);
        }, 500);
      });
    },

    /**
     * Reset the passage cycle index (useful for testing).
     */
    resetPassageIndex: function () {
      passageIndex = 0;
    }
  };
})();
