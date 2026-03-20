# SlopQuest — Core Design Document

> **Purpose:** This is the single source of truth for building SlopQuest. Reference this document at the start of every Claude Code session. Paste or reference relevant sections when context is needed. Every architectural decision in here has been discussed and agreed upon — do not deviate without updating this document first.

---

## 1. What Is SlopQuest?

SlopQuest is a **mobile-first, browser-based AI-generated gamebook RPG**. Each turn, the player reads a narrative passage and chooses from 4 options. All prose is generated live by an LLM via the OpenRouter API. Optional AI-generated illustrations and voice narration can accompany each passage.

**Runs entirely in the browser.** No backend. Players provide their own OpenRouter API key and can choose which models to use — making SlopQuest both a game and a playground for comparing AI model quality. Deployable to GitHub Pages or openable as a local file. Zero hosting cost.

**Core inspirations:** Inkle's Sorcery! series (structure, rewind mechanic, passage-based flow), classic choose-your-own-adventure gamebooks (discrete choices, meaningful consequences), Fighting Fantasy (resource management, difficulty that can kill you).

**Key differentiator:** The entire story — skeleton, prose, illustrations, audio — is AI-generated from player-chosen parameters. No two playthroughs are the same. But unlike raw LLM chat improv, the story has predetermined structure, dramatic arcs, and a real ending.

---

## 2. Core Architecture

### 2.1 The Fundamental Insight

**The skeleton is the game designer. The LLM is the narrator.**

Raw LLM chat-based narrative games feel directionless because the model is simultaneously inventing plot structure AND writing prose. SlopQuest separates these concerns:

1. **Skeleton generation** (once, at game start): An LLM generates the full story structure — 3-act arc, beat descriptions, NPC roster, central dramatic question, ending shape, difficulty-tuned choice outcomes.
2. **Passage generation** (every turn): A different LLM call writes prose for the current moment, constrained by the skeleton and current game state. It narrates outcomes; it does not decide them.

This separation is what makes difficulty work, consequences stick, and stories have real endings.

### 2.2 The State Object

A persistent JSON state object is passed into every passage generation API call. This is the LLM's substitute for memory. It contains everything the narrator needs to write a coherent, on-target passage.

**Critical design principle:** The state object is *instructions*, not just context. Fields like `pending_consequences`, `locked_constraints`, and `proximity_to_climax` are directives the LLM actively references, not a passive log.

The state object has these layers:

#### Meta
```json
{
  "meta": {
    "title": "string — generated story title",
    "genre": "string — e.g. 'dark fantasy', 'sci-fi comedy', 'political thriller'",
    "universe": "string — e.g. 'Elder Scrolls - Skyrim', 'Original', 'Hitchhiker's Guide'",
    "tone": "string — e.g. 'gritty and grounded', 'whimsical', 'mysterious and political'",
    "perspective": "string — 'first_person' | 'second_person' | 'third_person'",
    "tense": "string — 'past' | 'present'",
    "writing_style": "string — e.g. 'literary', 'pulpy', 'minimalist', 'flowery'",
    "difficulty": "string — 'chill' | 'normal' | 'hard' | 'brutal'",
    "story_length": "string — 'short' | 'medium' | 'long'",
    "version": "number — state schema version for migration"
  }
}
```

#### Skeleton (generated once at game init, immutable after that)
```json
{
  "skeleton": {
    "premise": "string — 2-3 sentence hook",
    "central_question": "string — the dramatic question driving the story",
    "ending_shape": "string — not the content, just the form: 'mystery solved', 'villain defeated', 'escape achieved', etc.",
    "world_rules": ["array of strings — fundamental constraints on the setting"],
    "acts": {
      "one": {
        "description": "string — what happens in this act",
        "ends_when": "string — the specific trigger that advances to act two",
        "locked_constraints": ["array — things that MUST NOT happen yet"],
        "target_scenes": "number — approximate scene count for pacing"
      },
      "two": { "..." : "same structure" },
      "three": { "..." : "same structure" }
    },
    "npcs": [
      {
        "name": "string",
        "role": "string — e.g. 'reluctant ally', 'hidden antagonist', 'mentor'",
        "motivation": "string",
        "allegiance": "string",
        "secret": "string — known to skeleton, hidden from player until revealed",
        "alive": "boolean"
      }
    ],
    "factions": [
      {
        "name": "string",
        "description": "string",
        "disposition_to_player": "string — 'hostile' | 'neutral' | 'friendly' | 'unknown'"
      }
    ]
  }
}
```

#### Player State
```json
{
  "player": {
    "name": "string",
    "archetype": "string — e.g. 'deserter soldier', 'exiled scholar'",
    "health": "number — 0-100",
    "resources": {
      "gold": "number",
      "provisions": "number",
      "custom_resource": "number — genre-dependent, e.g. 'mana', 'ammo', 'reputation'"
    },
    "inventory": ["array of strings"]
  }
}
```

#### Relationships
```json
{
  "relationships": {
    "npc_name": "number — -100 to 100, negative=hostile, positive=friendly",
    "faction_name": "number"
  }
}
```

#### Current State
```json
{
  "current": {
    "act": "number — 1, 2, or 3",
    "scene_number": "number — increments each passage",
    "location": "string",
    "time_of_day": "string — if relevant to setting",
    "proximity_to_climax": "number — 0.0 to 1.0, how close to the act's climax",
    "active_constraints": ["array — currently enforced locked_constraints from skeleton"],
    "scene_context": "string — brief description of what's happening right now"
  }
}
```

#### Pending Consequences
```json
{
  "pending_consequences": [
    {
      "id": "string — unique identifier",
      "description": "string — what was set in motion",
      "trigger": "string — when this should surface, e.g. 'within 3 scenes', 'when player returns to city', 'act 2 climax'",
      "severity": "string — 'minor' | 'moderate' | 'severe' | 'critical'",
      "scenes_remaining": "number | null — countdown, decremented each scene"
    }
  ]
}
```

#### Choice Outcomes (Brutal difficulty — the key to making death work)
```json
{
  "current_choices": {
    "A": {
      "outcome": "string — 'advance_safe' | 'advance_risky' | 'severe_penalty' | 'death' | 'hidden_benefit'",
      "consequence": "string — what happens mechanically",
      "narration_directive": "string — e.g. 'Narrate the player's death. Do not offer survival.'"
    },
    "B": { "...": "same structure" },
    "C": { "...": "same structure" },
    "D": { "...": "same structure" }
  }
}
```

**On Chill/Normal, `current_choices` can be lighter** — the LLM gets more freedom to determine outcomes. On Hard/Brutal, outcomes are mechanically predetermined and the LLM only narrates them.

#### Event Log
```json
{
  "event_log": [
    "string — compressed one-liner of a meaningful choice/outcome",
    "Spared the guard captain at the bridge",
    "Accepted the witch's bargain — gained curse, learned secret",
    "Failed to retrieve the artifact — it was destroyed"
  ],
  "backstory_summary": "string — compressed summary of events older than the 20 most recent"
}
```

#### World State Flags
```json
{
  "world_flags": {
    "village_destroyed": false,
    "king_alive": true,
    "seal_broken": false,
    "traitor_revealed": false
  }
}
```

### 2.3 Token Budget

| Component | Estimated Tokens |
|-----------|-----------------|
| System prompt + generation instructions | ~500-800 |
| Skeleton (full) | ~800-1200 |
| Player state + relationships + flags | ~200-400 |
| Pending consequences | ~100-300 |
| Event log (20 entries + backstory) | ~200-400 |
| Current state + choice outcomes | ~150-300 |
| **Total overhead per API call** | **~2,000-3,400** |
| Available for generated passage | Remaining context |

This is comfortable on any modern model. The event log is the component that can balloon — keep it capped at 20 recent entries, with older events compressed into `backstory_summary`.

---

## 3. Difficulty System

Difficulty is **mechanical, not tonal**. The LLM doesn't "try to be harder" — the skeleton and state parameters constrain how forgiving the world is. The prose tone stays consistent; what changes is the math underneath.

### 3.1 Difficulty Parameters

| Parameter | Chill | Normal | Hard | Brutal |
|-----------|-------|--------|------|--------|
| `safe_choice_ratio` | 0.75 | 0.50 | 0.35 | 0.25 |
| `consequence_severity` | mild | moderate | severe | critical |
| `resource_abundance` | generous | moderate | scarce | desperate |
| `allow_game_over` | false | false | true | true |
| `game_over_frequency` | never | never | rare (1 per act max) | common (multiple per act) |
| `hint_transparency` | obvious | moderate | subtle | cryptic |
| `relationship_decay_rate` | slow | normal | fast | aggressive |
| `pending_consequence_speed` | slow (5+ scenes) | normal (3-4 scenes) | fast (1-2 scenes) | immediate (0-1 scenes) |
| `recovery_paths` | always available | usually available | sometimes available | rarely available |
| `npc_forgiveness` | high | moderate | low | none |

### 3.2 How Critical Consequences Work (Hard & Brutal)

The skeleton generator pre-determines which choices have critical (irreversible) consequences. What "critical" means depends on the story's Style & Tone — death in a thriller, total humiliation in a comedy, heartbreak in a romance. The passage generator receives a `narration_directive` that explicitly instructs it to narrate the consequence without softening the outcome.

**The LLM does not decide whether to trigger a critical consequence. The skeleton decides. The LLM narrates.**

Example prompt fragment for a death outcome:
```
The player chose option A.
Outcome classification: DEATH
Cause: The bridge was sabotaged by the faction the player antagonized in Scene 4.
Narration directive: The character dies here. Narrate the death vividly and 
definitively. Do not offer survival, last-minute rescues, or "barely alive" 
outcomes. The character is dead. End the passage with finality.
Post-narration: Set game state to game_over. Offer rewind.
```

For Brutal skeleton generation, enforce hard numerical constraints:
- At least 40% of choices across the act must have outcome `death` or `severe_penalty`
- At least one `game_over` state must exist per act
- No scene may have more than two `advance_safe` options
- At least one death per act must be non-obvious (requires interpreting earlier clues)

### 3.3 Story Length

Player-configurable at game setup. Controls total turn count, skeleton complexity, and subplot density.

| Parameter | Short | Medium | Long |
|-----------|-------|--------|------|
| Total turns (approx) | 15-20 | 30-40 | 50-70 |
| Turns per act (approx) | 5-7 | 10-13 | 17-23 |
| NPC count | 3-4 | 5-6 | 7-9 |
| Faction count | 1-2 | 2-3 | 3-4 |
| Subplot threads | 0-1 | 1-2 | 2-4 |
| Pending consequences (max active) | 3 | 5-7 | 8-12 |
| Estimated playtime | 20-30 min | 45-75 min | 90-150 min |
| Estimated token cost (text only) | ~$0.30-0.80 | ~$0.80-2.00 | ~$2.00-5.00 |

These values are passed to the skeleton generation prompt as target parameters. The skeleton generator adjusts NPC roster size, faction complexity, and pacing accordingly. A Short game has a tight, focused plot. A Long game has interlocking faction threads and compounding consequences.

**Length × Difficulty interaction:** Brutal + Short is a sprint where nearly every choice is life-or-death. Brutal + Long is a war of attrition where consequences compound over dozens of turns. Both are valid and play very differently.

---

## 4. Rewind System

Inspired by Sorcery!'s timeline rewind.

### 4.1 Implementation

Maintain a **state history stack** on the client side. Every time the player makes a choice, push the *pre-choice* state snapshot onto the array.

```
stateHistory = [
  { state: <snapshot_0>, passage_text: "...", choice_made: null },  // game start
  { state: <snapshot_1>, passage_text: "...", choice_made: "A" },   // after choice 1
  { state: <snapshot_2>, passage_text: "...", choice_made: "B" },   // after choice 2
  ...
]
```

**Rewinding:** Pop back to the selected snapshot. Discard everything after it. The player can then make a different choice (or the same one — they'll get a different passage due to LLM non-determinism, which doubles as a model error recovery mechanism).

### 4.2 Key Properties

- **Client-side only.** The history stack is never sent to the LLM. Zero token cost for rewind.
- **The LLM never knows the player rewound.** It receives the restored state and generates fresh.
- **Same choice ≠ same passage.** Non-deterministic generation means replaying a choice produces a new passage. This is a feature, not a bug — it also gives players a free recovery path if a model generates something broken.
- **Unlimited rewinds on all difficulties** (for now). May add limits later as a difficulty lever.
- **Storage:** Each snapshot is ~2-4KB of JSON. 50+ turns of history = well under 1MB in local storage. Trivial.

---

## 5. Multimodal Features (Progressive Enhancement)

All three output modes are **togglable independently** by the player. The text engine is the core; illustrations and audio are layered on top.

### 5.1 API Architecture

All three modalities go through the **OpenRouter API** (`/api/v1/chat/completions`):

| Modality | Endpoint | `modalities` param | Model examples |
|----------|----------|-------------------|----------------|
| Text (prose) | `/api/v1/chat/completions` | `["text"]` | Claude Sonnet, GPT-4o, Gemini |
| Illustration | `/api/v1/chat/completions` | `["image"]` | Gemini Flash Image, GPT-5 Image, Flux |
| Narration | `/api/v1/chat/completions` | `["text", "audio"]` | GPT-4o-audio, others TBD |

**Single API key, single billing, unified error handling.**

### 5.2 Passage Generation Flow

When the player makes a choice:

1. **Fire all enabled calls in parallel:**
   - Text generation (always) — receives full state object, returns passage + updated state + next choices
   - Image generation (if enabled) — receives an illustration prompt derived from the passage context
   - Audio/TTS (if enabled) — receives the generated passage text, returns narrated audio

2. **Progressive rendering:**
   - Show passage text immediately when it arrives
   - Start playing audio as soon as it streams in
   - Fade illustration in when image generation completes (slowest)

3. **Failure isolation:** If image gen fails, the passage still displays with text only. If audio fails, text still works. Never block the game loop on optional features.

### 5.3 Visual Consistency

AI image generation will produce different-looking characters every illustration. Mitigate this by:

- Locking a **visual style prompt prefix** that accompanies every image call (e.g., "dark ink illustration, crosshatched, monochrome, no color, woodcut style" — an abstract style is more forgiving of variation than photorealistic)
- Including persistent character description tags in the image prompt (pulled from player state)
- Keeping the style sufficiently abstract that variation reads as "artistic interpretation" rather than "broken continuity"

### 5.4 Audio Considerations

If OpenRouter TTS quality feels flat, consider breaking this single piece out to a dedicated provider (e.g., ElevenLabs) for better voice control, emotion, and pacing. The architecture supports this — it's just a different endpoint for one of the three parallel calls.

---

## 6. Game Flow

### 6.1 Setup Flow (New Game)

**First-time setup (persisted across games):**

0. **API Key** — player pastes their OpenRouter API key. Stored in localStorage. Validated with a test call before proceeding.
1. **Model selection** — choose which OpenRouter model to use for text generation (skeleton + passages). Provide sensible defaults with a "pick your own" option. Model for image and audio configured separately in settings.

**Per-game configuration:**

2. **Setting/Universe** — pick from presets (fantasy, sci-fi, horror, etc.) or name a specific IP/universe, or describe a custom setting
3. **Character archetype** — broad strokes, not detailed backstory (the skeleton fleshes it out)
4. **Writing style** — literary, pulpy, minimalist, flowery, humorous, etc.
5. **Tone** — dark and gritty, epic and mythic, mysterious, comedic, etc.
6. **Perspective** — first person, second person, third person
7. **Tense** — past or present
8. **Difficulty** — chill, normal, hard, brutal (with clear descriptions of what each means)
9. **Story length** — short, medium, long (see Section 3.3 for details)
10. **Multimodal toggles** — illustrations on/off, narration on/off

### 6.2 Skeleton Generation

After setup, the system makes a **skeleton generation API call**. This is the most important single call in the game. The prompt must be extremely structured, requesting:

- Title
- Premise and central dramatic question
- Ending shape
- 3-act structure with beat descriptions, end conditions, locked constraints, and target scene counts
- NPC roster with names, roles, motivations, allegiances, secrets
- Faction list
- World rules
- Initial world state flags
- Difficulty-appropriate choice outcome distributions

**The skeleton generation prompt should request JSON output directly.** No prose, no explanation, just the structured data. Validate the response and retry if malformed.

The player should see a brief loading screen during this (~5-15 seconds). Display the title and premise as a cinematic intro while the first passage generates.

### 6.3 Turn Loop

```
1. Player reads passage + sees illustration + hears narration (based on toggles)
2. Player sees 4 choices
3. Player taps a choice
4. Client pushes current state to history stack (for rewind)
5. Client sends state + choice to passage generation API
   - In parallel: sends illustration prompt + TTS request (if enabled)
6. API returns: new passage text, updated state object, next 4 choices
7. Client renders new passage (progressive: text → audio → image)
8. Repeat from 1
```

### 6.4 State Update Flow

The passage generation call returns the updated state as part of its response. The LLM is responsible for:

- Updating player health, inventory, resources based on the choice outcome
- Adding/removing pending consequences
- Appending to the event log
- Updating world state flags
- Updating relationship values
- Advancing act/scene numbers when appropriate
- Generating the next set of 4 choices (with outcome classifications on Hard/Brutal)
- Generating an illustration prompt (if illustrations are enabled)

**The system prompt must instruct the LLM to return a single pure JSON object.** The passage text is a string field within the JSON — not separate from it. No markdown, no prose outside the JSON, no delimiters. This is the most reliable approach for parsing. If the response is malformed JSON, retry once, then show an error with a manual retry button.

Example response structure (what the LLM returns):
```json
{
  "passage": "The full narrative passage text as a string...",
  "illustration_prompt": "A concise visual description for image generation...",
  "state_updates": { ... },
  "choices": {
    "A": { "text": "...", "outcome": "...", ... },
    "B": { ... },
    "C": { ... },
    "D": { ... }
  }
}
```

**JSON parsing safety:** Strip markdown code fences (` ```json ` / ` ``` `) before parsing — LLMs frequently wrap JSON in fences despite being told not to. Use try/catch on `JSON.parse()`. On failure, retry the API call once with the same input. If the retry also fails, show the player an error with a "Retry" button that fires the call again. Never lose game state on a parse failure — the pre-choice snapshot is still on the history stack.

### 6.5 Game Over & Endings

**Death (Hard/Brutal):** Display the death passage. Show the rewind timeline. Player can rewind to any previous turn.

**Story ending:** The skeleton defines the ending shape. When the final act's end condition is met, the passage generator produces a denouement. Show a "story complete" screen with stats (turns taken, deaths, choices made, etc.).

### 6.6 Save & Resume

**Phase 1 must support basic save/resume.** The current game state and history stack are in localStorage, so data persists across browser sessions automatically. The game must detect this and handle it:

- On app load, check localStorage for an in-progress game state.
- If found, show a "Continue" button alongside "New Game" on the main screen.
- "Continue" restores the state and drops the player back into the game screen at their last turn.
- "New Game" warns that the current game will be lost, then clears game state (but not player config/API key) and opens the setup screen.
- Starting a new game while one is in progress should require confirmation.

Full multi-slot save/load is Phase 4. For now, one save slot is enough.

### 6.7 API Error Handling

API calls will fail during gameplay. Handle every failure mode gracefully:

| Error | Detection | Response |
|-------|-----------|----------|
| Network failure | `fetch` throws or no response | "Connection lost. Check your internet and tap Retry." |
| Auth failure (401/403) | Response status code | "API key rejected. Check your key in Settings." Link to settings screen. |
| Rate limit (429) | Response status code | "Rate limited. Waiting 10 seconds..." Auto-retry after delay. |
| Insufficient credits (402) | Response status code | "OpenRouter account has insufficient credits. Add funds and tap Retry." |
| Malformed JSON response | `JSON.parse()` throws | Silent auto-retry once. On second failure: "The AI returned an unreadable response. Tap Retry for a fresh generation." |
| Model-specific error (500) | Response status code | "The AI model returned an error. Tap Retry, or switch models in Settings." |
| Timeout (>30s) | `AbortController` timeout | "Response is taking too long. Tap Retry." |

**Critical rule:** Never lose game state on an API error. The pre-choice state snapshot is always preserved on the history stack. The worst case after any failure is the player retries or rewinds — they never lose progress.

**Loading UX:** Show a loading indicator with a cancel button during API calls. If the player cancels, return to the current passage with the same choices available.

---

## 7. Technical Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | Vanilla JS + HTML + CSS | Simple game UI doesn't need a framework. No build tools, no abstractions. |
| Styling | CSS (custom) | No framework dependency. Mobile-first with media queries. |
| API Gateway | OpenRouter | Single API for text, image, and audio generation |
| State Storage | Browser localStorage | State object + history stack, well under 5MB |
| Audio Playback | Web Audio API / HTML5 `<audio>` | Stream and play TTS responses |
| Hosting | GitHub Pages / any static host | No backend. Just static files. Zero hosting cost. |

**No build tools.** The project is plain HTML, CSS, and JS files loaded with `<script>` tags. Open `index.html` in a browser and it works. No npm, no bundler, no compilation step. JS files are loaded in dependency order via script tags, or use a simple module pattern to avoid load-order issues.

### 7.1 No Backend Required

**The player provides their own OpenRouter API key.** This eliminates the need for any server-side infrastructure — no Node backend, no edge functions, no API key to protect. The entire game is static files that run in the browser.

Benefits of this approach:
- **Zero hosting cost.** Deploy to GitHub Pages, Netlify, or just open the HTML file locally.
- **No leaked key risk.** The developer never handles API keys. Players manage their own.
- **Model flexibility.** Players can choose and swap models for each modality (text, image, audio) based on their budget and preference. Someone with money picks Claude Opus + GPT-5 Image. Someone being frugal picks Gemini Flash for everything.
- **Simple deployment.** Push to GitHub, it's live. No environment variables, no server config.

Tradeoff: Onboarding friction. Players need an OpenRouter account and funded API key before they can play. This filters the audience to a technical crowd — which is fine for SlopQuest's target market.

**Future option:** A server-provided API access layer could be added later to remove the key requirement for casual players. The architecture supports this — just swap the API call target from OpenRouter directly to your own proxy endpoint. The game logic doesn't change.

### 7.2 Player Configuration (Persisted)

Stored in localStorage separately from game state:
```json
{
  "openrouter_api_key": "sk-or-...",
  "models": {
    "skeleton": "anthropic/claude-sonnet-4",
    "passage": "anthropic/claude-sonnet-4",
    "image": "google/gemini-2.5-flash-image-preview",
    "audio": "openai/gpt-4o-audio-preview"
  },
  "visual_style_prefix": "dark ink illustration, crosshatched, monochrome, woodcut style"
}
```

**Default model: `anthropic/claude-sonnet-4`** for both skeleton and passage generation. Sonnet is the recommended starting point — strong at structured JSON output, good prose quality, reasonable cost. Players can swap to any OpenRouter model, but Sonnet is the tested baseline.

Players can change models mid-game from a settings screen. This also makes SlopQuest a useful playground for comparing model quality — try the same game with different text models and see which writes better prose.

---

## 8. Build Phases

### Phase 1: Core Text Engine (MVP)
**Goal:** A playable text-only gamebook in the browser. Player configures, skeleton generates, passages generate with choices, game state persists, story has a beginning, middle, and end.

**Build order:**
1. Project scaffolding (plain HTML + CSS + JS, mobile-first layout)
2. Mock data layer (hardcoded JSON responses for testing UI without real API calls)
3. Settings screen (API key input, model selection, validation)
4. Setup flow UI (setting, character, tone, difficulty, story length selection)
5. Skeleton generation (API call + pure JSON validation + retry logic)
6. Passage generation (API call with full state injection, pure JSON response parsing)
7. API error handling (all failure modes from Section 6.7)
8. Game screen (passage display, 4 choice buttons, basic resource display)
9. State management (update state each turn, persist to localStorage)
10. Save & resume (detect in-progress game, offer Continue vs New Game — Section 6.6)
11. Rewind system (state history stack, rewind UI)
12. Game over / ending screens
13. Difficulty tuning (test all 4 tiers, especially Brutal death logic)

### Development & Testing Notes

**Mock data first.** Build a mock data layer before connecting to real APIs. Create hardcoded JSON files that mimic skeleton generation and passage generation responses. This lets you build and test all the UI, state management, rewind, and game flow without spending a cent on API calls. Toggle between mock mode and live mode with a flag in settings. Keep the mock data around permanently — it's useful for debugging and demoing.

**Set an OpenRouter spending limit during development.** A bug in a retry loop or an accidentally hot-reloading page can fire dozens of API calls. Set a low monthly cap on your OpenRouter account ($5-10) while building. Raise it when you're ready for real playtesting.

**Test JSON parsing aggressively.** The biggest source of runtime errors will be malformed LLM responses. During development, deliberately introduce bad JSON to test your error handling — missing fields, extra prose before the JSON, markdown code fences wrapping the response, truncated output. Make sure the game recovers gracefully from all of these.

**Claude Sonnet is the tested baseline.** All prompts in this doc are designed for and tested against `anthropic/claude-sonnet-4`. If swapping to a different model, the prompts may need adjustment — some models are worse at pure JSON output, some ignore system prompt constraints more readily. Test skeleton generation first when evaluating a new model.

**Claude Code prompts for Phase 1:**

```
Prompt 1 — Scaffolding:
"Set up the project structure for a mobile-first browser game called 
SlopQuest. No frameworks, no build tools — plain HTML, CSS, and 
JavaScript only. The app should be a single-page application with no 
backend — all API calls go directly from the browser to OpenRouter using 
a player-provided API key stored in localStorage. Create an index.html 
that loads a main.css and multiple JS files via script tags. Use a simple 
screen-switching pattern (show/hide divs). Create placeholder JS files 
for: settings, setup, game, rewind, and game-over screens. Also create 
a mock data module with hardcoded JSON responses for skeleton generation 
and passage generation — this lets us build and test UI without real API 
calls. Include a dev toggle to switch between mock mode and live mode. 
Read SLOPQUEST_DESIGN_DOC.md for full architectural context."

Prompt 2 — Settings & API Key:
"Build the settings/API key screen for SlopQuest. Reference Section 7.1 
and 7.2 of SLOPQUEST_DESIGN_DOC.md. This is the first screen a new player 
sees. It should: (1) Accept an OpenRouter API key and validate it with a 
lightweight test call (e.g., a tiny completion request to the default 
model anthropic/claude-sonnet-4). Show success/error feedback. (2) Let 
the player choose which OpenRouter model to use for text generation 
(skeleton + passages), with anthropic/claude-sonnet-4 as the default and 
a text input for custom model strings. (3) Store config in localStorage 
as the playerConfig object from Section 7.2. (4) If a valid key already 
exists in localStorage, skip straight to the main menu. Include a 
'Settings' button accessible from all other screens to return here.
Also build the main menu screen: if an in-progress game exists in 
localStorage, show 'Continue' and 'New Game' buttons. If no game exists, 
show only 'New Game'. 'Continue' loads the saved state and goes to the 
game screen. 'New Game' warns if a game is in progress, then goes to 
setup. Reference Section 6.6."

Prompt 3 — Setup Flow:
"Build the new game setup screen for SlopQuest. Reference Section 6.1 of 
SLOPQUEST_DESIGN_DOC.md for the full list of per-game configuration 
options. The screen should let the player choose: setting/universe 
(presets + custom text input), character archetype, writing style, tone, 
perspective, tense, difficulty (with descriptions of what each tier 
means), story length (short/medium/long with estimated playtime from 
Section 3.3), and multimodal toggles (disabled for now, just UI 
placeholders). Mobile-first design — large tap targets, vertical scroll, 
clear visual hierarchy. On submit, pass config to the skeleton generation 
function."

Prompt 4 — Skeleton Generation:
"Build the skeleton generation module for SlopQuest. Reference Section 2.2, 
Section 3.3, and Section 6.2 of SLOPQUEST_DESIGN_DOC.md for the exact 
state object schema. This module takes the player's setup config and makes 
an OpenRouter API call (using the player's API key and chosen model from 
localStorage) that generates a complete story skeleton as pure JSON — no 
markdown, no prose, no code fences. Strip any code fences before parsing 
as a safety measure. Include validation logic to check required fields 
and retry on malformed responses (max 2 retries). The skeleton includes: 
title, premise, central question, ending shape, 3-act structure with 
locked constraints and target scene counts per act based on story length, 
NPC roster (count based on story length from Section 3.3), factions, world 
rules, world flags, and difficulty parameters from Section 3.1. Pay 
special attention to Brutal difficulty — enforce the numerical constraints 
from Section 3.2. In mock mode, return the hardcoded skeleton instead of 
calling the API."

Prompt 5 — Passage Generation:
"Build the passage generation module for SlopQuest. Reference Section 2.2 
and Section 6.3-6.4 of SLOPQUEST_DESIGN_DOC.md. This module takes the 
full current state object and the player's chosen option (A/B/C/D), 
injects them into a system prompt + user message, and calls OpenRouter 
(using the player's API key and chosen model from localStorage). The 
response must be pure JSON — the passage text is a string field within 
the JSON object, not separate from it. See the response structure in 
Section 6.4. Strip markdown code fences before parsing. The JSON contains: 
(1) passage text, (2) illustration_prompt, (3) state_updates with all 
changed fields, (4) four new choices. On Hard/Brutal difficulty, the 
choice_outcomes from the current state determine what happens — the LLM 
narrates the predetermined outcome, it does not decide it. Include the 
narration_directive system from Section 3.2 for death outcomes. In mock 
mode, return hardcoded passage data instead of calling the API."

Prompt 6 — API Error Handling:
"Add comprehensive error handling to all API calls in SlopQuest. Reference 
Section 6.7 of SLOPQUEST_DESIGN_DOC.md for the full error table. Handle: 
network failures, auth errors (401/403 — link to settings), rate limits 
(429 — auto-retry with delay), insufficient credits (402), malformed JSON 
(auto-retry once, then manual retry button), model errors (500 — suggest 
switching models), and timeouts (30s via AbortController). Show clear, 
non-technical error messages. Never lose game state on any error — the 
pre-choice snapshot is always on the history stack. Add a loading indicator 
with cancel button during all API calls."

Prompt 7 — Game Screen:
"Build the game screen for SlopQuest. Reference the full design doc for 
context. Use vanilla JS and DOM manipulation. The screen displays: the 
current passage text (with a typewriter or fade-in effect for atmosphere), 
four choice buttons (large, tappable, clearly labeled A/B/C/D with choice 
text), a minimal resource bar (health, key resources, current act/scene), 
a rewind button, and a settings gear icon. Mobile-first — the passage 
should be the dominant element, choices should be easy to tap, and resource 
display should be unobtrusive. When a choice is tapped, show a loading 
state while the next passage generates. Display error messages inline if 
API calls fail, with a Retry button. Reference Section 6.7 for error UX."

Prompt 8 — State Management & Rewind:
"Build the state management and rewind system for SlopQuest. Reference 
Section 4 and Section 6.6 of SLOPQUEST_DESIGN_DOC.md. Implement: (1) A 
state history stack that pushes a snapshot before each choice, stored in 
localStorage. (2) Auto-save: the current game state and history stack 
persist to localStorage after every turn so the game survives browser 
closure. (3) A rewind screen that shows the timeline of past turns — each 
entry shows the scene number, location, and the choice that was made. The 
player can tap any point to rewind to it, discarding all subsequent 
history. (4) After rewind, the player returns to the game screen at the 
restored state and can make a new choice. The LLM generates a fresh 
passage even if the same choice is selected (non-deterministic generation). 
(5) Unlimited rewinds on all difficulties."

Prompt 9 — Game Over & Endings:
"Build the game over and ending screens for SlopQuest. Reference Section 
6.5 of SLOPQUEST_DESIGN_DOC.md. Death screen: show the death passage, 
then present the rewind timeline so the player can go back. Story 
completion screen: show a final passage, then display stats — total turns, 
times died, key choices made (pulled from event log), difficulty, story 
length. Include a 'New Game' button that clears game state and returns to 
setup screen. Clear the saved game from localStorage on story completion 
(but not on death — player should be able to close and resume at the death 
screen)."

Prompt 10 — Difficulty Tuning:
"Review and tune the difficulty system for SlopQuest. Reference Section 3 
of SLOPQUEST_DESIGN_DOC.md. Play-test each difficulty tier by generating 
skeletons and running through several passages. Verify: Chill mode never 
kills the player and consequences are mild. Normal has moderate stakes. 
Hard has real danger with some critical consequences. Brutal has multiple
critical choices per act, non-obvious traps, scarce resources, and the
critical consequence narration system works (LLM narrates consequences
without softening). Test all 
three story lengths. Adjust system prompts and difficulty parameters based 
on testing."
```

### Phase 2: Illustrations
**Goal:** AI-generated illustrations accompany each passage.

**Build order:**
1. Image generation module (OpenRouter API call with `modalities: ["image"]`)
2. Visual style system (locked style prefix prompt, character description tags)
3. Parallel call architecture (fire image gen alongside text gen)
4. Progressive rendering (text appears immediately, image fades in when ready)
5. Toggle UI (player can enable/disable illustrations)
6. Failure handling (if image gen fails, passage still works text-only)

**Claude Code prompts for Phase 2:**

```
Prompt 1 — Image Generation Module:
"Add AI illustration support to SlopQuest. Reference Section 5 of 
SLOPQUEST_DESIGN_DOC.md. Build an image generation module that calls 
OpenRouter with modalities: ['image']. The illustration prompt should 
combine: (1) a locked visual style prefix stored in game config (e.g., 
'dark ink illustration, crosshatched, monochrome'), (2) persistent 
character description from player state, (3) scene-specific content 
from the passage generation response (the passage generator should 
now also return an illustration_prompt field). Fire the image call in 
parallel with text generation. Display text immediately, fade the 
illustration in when it arrives. If image generation fails, gracefully 
degrade to text-only. Add a toggle in settings to enable/disable."
```

### Phase 3: Voice Narration
**Goal:** AI voice narration reads each passage aloud.

**Build order:**
1. TTS module (OpenRouter audio output or dedicated TTS provider)
2. Audio streaming and playback (Web Audio API)
3. Parallel call architecture (fire TTS alongside text + image)
4. Progressive rendering (text appears, audio starts playing, image fades in)
5. Toggle UI
6. Failure handling

**Claude Code prompts for Phase 3:**

```
Prompt 1 — Voice Narration Module:
"Add AI voice narration to SlopQuest. Reference Section 5 of 
SLOPQUEST_DESIGN_DOC.md. Build a TTS module that sends the generated 
passage text to OpenRouter with modalities: ['text', 'audio'] and 
streams the audio response. Use HTML5 audio or Web Audio API for 
playback. Fire the TTS call in parallel with text and image generation. 
Text should appear first, audio plays as it streams in, image fades in 
last. Add playback controls (play/pause, replay). If TTS quality is 
poor, this module should be easy to swap to a dedicated TTS provider 
like ElevenLabs — keep the interface abstract. Add a toggle in settings. 
Graceful degradation if audio fails."
```

### Phase 4: Polish & UX
**Goal:** Make it feel like a real product.

- Loading/transition animations
- Sound effects (UI interactions, ambient)
- Save/load multiple playthroughs
- Advanced settings (visual style customization, voice selection, per-modality model selection)
- PWA support (installable, offline-capable for saved games)
- Passage history (scroll back through previous passages without rewinding)
- Accessibility (screen reader support, font size, contrast)
- Model comparison mode (generate with two models side-by-side, pick preferred output)

### Phase 5: Advanced Features (Future)
- Server-provided API access (optional backend proxy so casual players don't need their own key)
- Multiplayer (shared state, each player takes turns choosing)
- Custom visual style upload (player provides reference images for consistent style)
- Community skeleton sharing (players share generated skeletons)
- Persistent world (carry consequences across multiple playthroughs in the same setting)

---

## 9. API Prompt Templates

### 9.1 Skeleton Generation System Prompt

```
You are a game designer creating the complete story skeleton for an 
interactive gamebook. Output ONLY a valid JSON object — no prose, no 
markdown, no code fences, no explanation. Nothing before or after the JSON.

The player has chosen these parameters:
- Setting: {universe}
- Character: {archetype}
- Tone: {tone}
- Difficulty: {difficulty}
- Story Length: {story_length}

Generate a complete story skeleton following this EXACT schema:
{paste full skeleton schema from Section 2.2}

STORY LENGTH RULES ({story_length}):
{paste relevant length parameters from Section 3.3 — target turns per act, 
NPC count, faction count, subplot threads}

DIFFICULTY RULES ({difficulty}):
{paste relevant difficulty parameters from Section 3.1}

{if brutal}
BRUTAL DIFFICULTY REQUIREMENTS:
- At least 40% of choices across each act must have outcome CRITICAL or SEVERE_PENALTY
- At least one game_over state must exist per act
- No scene may have more than two advance_safe options
- At least one critical consequence per act must be non-obvious (requires interpreting earlier clues)
- Create genuine trap logic — choices that SOUND safe but have critical consequences based on
  earlier context the player may not have noticed
{/if}

The skeleton must have:
- A clear central dramatic question that drives the entire story
- An ending shape (not content, just form) that everything builds toward
- Three acts with distinct purposes, locked constraints, and clear end conditions
- Named NPCs with hidden motivations (count per story length setting)
- Factions with competing interests (count per story length setting)
- Target scenes per act matching the story length setting
- World rules that create interesting constraints on player choices
- Enough world state flags to track major consequences
```

### 9.2 Passage Generation System Prompt

```
You are the narrator of an interactive gamebook. You write vivid, engaging 
prose in {perspective} perspective, {tense} tense, with a {writing_style} 
style and {tone} tone.

OUTPUT FORMAT: Respond with ONLY a valid JSON object. No markdown, no code 
fences, no prose outside the JSON. The passage text goes inside the "passage" 
field as a string.

STORY SKELETON:
{paste full skeleton}

CURRENT GAME STATE:
{paste full current state}

The player chose: {choice_letter} — "{choice_text}"

{if hard/brutal and choice has predetermined outcome}
OUTCOME CLASSIFICATION: {outcome}
NARRATION DIRECTIVE: {narration_directive}
You MUST narrate this outcome exactly as classified. Do not soften, alter, 
or provide alternatives to the predetermined outcome.
{/if}

Respond with this exact JSON structure:
{
  "passage": "string — the narrative passage, 150-300 words",
  "illustration_prompt": "string — a concise visual description of the key 
    moment in this passage for image generation",
  "state_updates": {
    "player_changes": { ... only fields that changed ... },
    "new_pending_consequences": [ ... if any ... ],
    "resolved_consequences": [ "ids of consequences that fired this turn" ],
    "event_log_entry": "string — one-line summary of what happened",
    "world_flag_changes": { ... only flags that changed ... },
    "relationship_changes": { ... only relationships that changed ... },
    "new_scene_context": "string — brief context for next passage",
    "advance_act": false,
    "game_over": false,
    "story_complete": false
  },
  "choices": {
    "A": { "text": "string — choice description shown to player",
           "outcome": "string — only on hard/brutal", 
           "consequence": "string — only on hard/brutal",
           "narration_directive": "string — only on hard/brutal" },
    "B": { ... },
    "C": { ... },
    "D": { ... }
  }
}

RULES:
- Respond with ONLY the JSON object — nothing before it, nothing after it
- Stay consistent with the skeleton's locked constraints
- Reference and advance pending consequences when their triggers are met
- Keep the passage between 150-300 words
- All four choices should feel plausible and interesting
- Never reveal information the skeleton marks as hidden/secret unless the 
  act's end condition has been met
- Decrement scenes_remaining on all pending consequences
- Update proximity_to_climax based on how close the act's end condition is
```

---

## 10. Known Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| LLM refuses to narrate death on Brutal | High | Predetermined outcomes + explicit narration directives. LLM narrates, doesn't decide. |
| Skeleton generation returns malformed JSON | Medium | Validate + retry (max 2). Request JSON-only output. |
| Visual inconsistency across illustrations | High | Lock abstract art style (ink/crosshatch). Accept some variation. |
| Story drift from skeleton mid-game | Medium (~20%) | Structured state object with locked constraints + pending consequences as instructions. |
| Genuine story breakage (wrong names, contradictions) | Low (~2-3%) | Rewind system as player recovery. Event log keeps key facts consistent. |
| API latency kills pacing on mobile | Medium | Parallel calls, progressive rendering, loading animations. Optimize state object size. |
| Token costs too high per playthrough | Low | State object is ~2-3K tokens. Budget ~$1-5 per full playthrough depending on models. |
| Player gets stuck in unwinnable state (non-Brutal) | Low | Chill/Normal always have recovery paths. Rewind as universal escape valve. |
| Onboarding friction (API key requirement) | High | Clear setup instructions, key validation with helpful errors. Accept this filters to technical audience for now. Server-provided access is a Phase 5 option. |
| Player enters invalid/expired API key | Medium | Validate key on entry with test call. Show clear error messages. Detect auth failures during gameplay and prompt to check key. |

---

## Appendix A: File Structure (Expected)

```
slopquest/
├── index.html                     — single HTML file, all screens as divs, script tags at bottom
├── css/
│   └── main.css                   — all styles, mobile-first
├── js/
│   ├── main.js                    — entry point, screen routing
│   ├── screens/
│   │   ├── settings.js            — API key input, model selection, validation
│   │   ├── setup.js               — new game configuration
│   │   ├── game.js                — main gameplay screen
│   │   ├── rewind.js              — timeline rewind UI
│   │   └── gameover.js            — death + story completion screens
│   ├── api/
│   │   ├── openrouter.js          — base API client (uses key from localStorage)
│   │   ├── mockData.js            — hardcoded JSON responses for testing without API calls
│   │   ├── skeletonGenerator.js   — skeleton generation logic + prompts
│   │   ├── passageGenerator.js    — passage generation logic + prompts
│   │   ├── imageGenerator.js      — illustration generation (Phase 2)
│   │   └── audioGenerator.js      — TTS narration (Phase 3)
│   ├── state/
│   │   ├── gameState.js           — state management + localStorage
│   │   ├── playerConfig.js        — API key + model prefs (persisted)
│   │   ├── historyStack.js        — rewind system
│   │   └── stateValidator.js      — validate state object integrity
│   └── prompts/
│       ├── skeletonPrompt.js      — skeleton generation prompt template
│       ├── passagePrompt.js       — passage generation prompt template
│       └── difficultyConfig.js    — difficulty parameter tables
└── SLOPQUEST_DESIGN_DOC.md        — this file
```

---

*Last updated: March 2026*
*Status: Pre-development — design locked, ready for Phase 1 build*
