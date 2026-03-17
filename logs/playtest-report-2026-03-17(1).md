# SlopQuest Playtest Report: The Devil's Own Luck

## Playtest Summary
- **Turns played:** 8
- **Outcome:** Story marked complete (premature)
- **Difficulty:** Hard
- **Story length:** Short
- **Playstyle:** Human-like play
- **Focus area:** Bug hunt

**Narrative arc:** Joe Miller woke in Tudor London, navigated a marketplace where his modern appearance caused accusations of theft, fled to St. Bartholomew's church claiming sanctuary, convinced Brother Francis he was a foreign merchant, and obtained Tudor clothing—but the story was marked complete before any meaningful resolution, skipping the entire middle act.

---

## Bugs & State Issues

### CRITICAL

1. **Act 2 Completely Skipped (T7→T8)**
   - Story jumped from Act 1 directly to Act 3 in a single turn
   - All Act 2 key beats were missed:
     - No interrogation about origins
     - No modern items examined as witchcraft evidence
     - No encounter with Magistrate Blackwood
     - No discovery of Mary's secret
     - No Hermetic Circle introduction
   - This violates the story skeleton's structure entirely
   - The `story_complete` flag was set to `true` at Turn 8 despite being mid-scene with pending choices

2. **Premature Story Completion**
   - Final state shows `story_complete: true` but `game_over: false`
   - Player still has active choices (A, B, C, D) available
   - Pending consequence `watch_arrival_001` has `time_remaining: 0` but was never resolved
   - The story ended without hitting any Act 3 key beats (no supernatural truth revealed, no return attempt, no fate resolution)

### MAJOR

3. **Location and Time of Day Persistently Empty (T4-T8)**
   - `current.location: ""` throughout most of the playthrough
   - `current.time_of_day: ""` never populated
   - These fields should track player position for narrative consistency

4. **Scene Numbering Inconsistency (T7-T8)**
   - Scene jumped from 6 to 7 to 8 to 9 without proper act transitions
   - Act 2 `target_scenes: 7` was completely bypassed
   - Final scene 9 exceeds Act 1's `target_scenes: 6` without proper act progression

5. **Relationship Value Inconsistency - Brother Francis**
   - Skeleton defined `initial_relationship: -10`
   - T6 showed relationship at -5
   - T8 showed relationship at 0, then final state shows 10
   - No clear trigger for these changes documented

### MINOR

6. **Inventory Item Mismatch (T3)**
   - Jacket mentioned in narrative but not present in inventory
   - Inventory listed "modern clothes (cotton t-shirt, jeans, sneakers)" but prose referenced a jacket

7. **Status Effect Timer Bug (T3-T4)**
   - Hangover timer showed 0 minutes remaining but effect persisted
   - Timer later showed 35 minutes, then 10 minutes—inconsistent decay

8. **Missing Status Effect Removal**
   - "Splitting headache" was in starting inventory but never tracked as status effect
   - Hangover status effect (added later) had inconsistent severity tracking (0.3→0.2)

---

## Writing Quality

### Strengths
- **Prose quality:** Generally strong, evocative descriptions of Tudor squalor
- **Atmosphere:** Effective sensory details ("rough wool and linen... scratching against your skin like medieval sandpaper")
- **Character voice:** Brother Francis well-characterized with nervous mannerisms and religious concerns
- **Tension building:** Final passage effectively builds dread with approaching Watch

### Issues
- **Perspective/tense:** Consistently maintained second person present tense ✓
- **Repetitive elements:** "Hangover" mentioned frequently but handled well narratively
- **Passage length:** Reasonably consistent, though some turns felt rushed
- **Dialogue:** Francis's exposition about the Watch felt slightly info-dump-y but remained in character

---

## Narrative Structure

### Skeleton Adherence: POOR

**Act 1 beats hit:**
- ✓ Awakening in the alley
- ✓ First encounter with Tudor locals
- ✓ Discovering the date and year
- ✓ Attracting suspicion for strange behavior
- ✓ Meeting Brother Francis
- ✓ Crisis that forces flight (sanctuary claim)

**Act 2 beats hit:**
- ✗ Interrogation about origins
- ✗ Modern items examined as evidence
- ✗ Meeting Magistrate Blackwood
- ✗ Discovering Mary's secret
- ✗ Building alliance with Brother Francis (partially done)
- ✗ Learning about the Hermetic Circle
- ✗ Escape attempt or sentencing

**Act 3 beats hit:**
- ✗ Final confrontation with authorities (pending but story marked complete)
- ✗ Supernatural truth revealed
- ✗ Choice between self-preservation and protecting others
- ✗ Attempt to return home
- ✗ Resolution of Joe's fate

### Pacing
- Act 1 pacing was appropriate (6 turns for 6 target scenes)
- Act 2 was completely skipped—catastrophic pacing failure
- Story marked complete at what should have been early Act 2

### Character Consistency
- Brother Francis: Consistent characterization, though relationship values don't match narrative warmth
- Mary Blackthorne: Never introduced (Act 2 skip)
- Magistrate Blackwood: Never encountered (Act 2 skip)
- Tom the Cutpurse: Never encountered

---

## Game Mechanics

### Choice Meaningfulness
- Choices generally had clear consequences
- Risk/reward spectrum visible (A: safe, B: risky, C: severe, D: death)
- Final choices well-differentiated but never resolved

### Difficulty Fairness
- Hard difficulty appropriate—multiple near-death situations
- Sanctuary mechanic worked well as escape valve
- Status effects (hangover, suspected thief) created meaningful pressure

### Status Effect Handling
- "Suspected of Theft" status correctly applied with `severity: 0.6`
- Hangover decay inconsistent (timer bugs noted above)
- `lethal: false` correctly set for non-fatal conditions

### Consequence System
- `pending_consequences` array properly tracked Watch arrival
- Consequence never resolved due to premature completion
- Severity ratings ("moderate") appropriate

### Inventory System
- Inventory updates worked (modern clothes → Tudor clothing)
- Starting inventory items properly tracked
- Wallet and smartphone retained appropriately

---

## Specific Focus Findings: Bug Hunt

### Summary of All Bugs Found

| # | Severity | Description | Turn(s) |
|---|----------|-------------|--------|
| 1 | CRITICAL | Act 2→3 skip, entire act bypassed | T7-T8 |
| 2 | CRITICAL | Premature story_complete flag | T8 |
| 3 | MAJOR | location field empty | T4-T8 |
| 4 | MAJOR | time_of_day field empty | T4-T8 |
| 5 | MAJOR | Scene numbering wrong | T7-T8 |
| 6 | MAJOR | Francis relationship inconsistent | T6-T8 |
| 7 | MINOR | Jacket inventory mismatch | T3 |
| 8 | MINOR | Status effect timer at 0 but persisting | T3-T4 |
| 9 | MINOR | Hangover decay inconsistent | T3-T8 |

### Root Cause Hypothesis
The act transition logic appears to be triggering prematurely. When Joe obtained Tudor clothing and the Watch approached, the system may have interpreted this as meeting Act 1's end condition ("flees London after a major incident") AND Act 2's end condition ("escapes custody") simultaneously, causing a double-skip to Act 3.

---

## API Cost Summary

| Component | Model | Calls | Input Tokens | Output Tokens | Cost |
|-----------|-------|-------|--------------|---------------|------|
| Game Master | claude-sonnet-4 | 16 | 71,997 | 10,156 | $0.368 |
| Playtester Agent | claude-opus-4.5 | 8 | 39,812 | 3,924 | $0.891 |
| **Total** | — | 24 | 111,809 | 14,080 | **$1.260** |

**Average cost per turn:** $0.157

---

## Overall Assessment

### Quality Rating: **POOR**

While the writing quality and atmosphere were strong, the critical structural bugs render this playthrough fundamentally broken. The story skeleton was violated catastrophically, with an entire act skipped and the story marked complete mid-scene.

### Top 3 Issues to Fix

1. **Act transition logic** — The system must not skip acts. Each act's end condition should be explicitly verified before transitioning, and transitions should only advance by one act at a time.

2. **Story completion validation** — `story_complete` should only be set when actual ending conditions are met (death, escape to modern times, or explicit resolution). Having pending choices and unresolved consequences should block completion.

3. **Location/time tracking** — These fields should be populated every turn for narrative consistency and debugging purposes.

### Top 3 Things That Worked Well

1. **Atmospheric writing** — Tudor London felt authentic and dangerous, with excellent sensory details

2. **Choice design** — The risk/reward spectrum was clear and choices felt meaningful

3. **Status effect system** — "Suspected of Theft" was well-implemented with appropriate severity and clear removal conditions

### Recommendations for Improvement

1. Add explicit act transition validation that checks:
   - Current act's end condition is actually met
   - Key beats for current act have been addressed
   - Only advance one act at a time

2. Implement story completion guards:
   - Check that `pending_consequences` array is empty or resolved
   - Verify `current_choices` are resolved before marking complete
   - Require explicit ending beat from skeleton

3. Add mandatory field validation for `location` and `time_of_day` in state updates

4. Implement relationship change logging to track when and why NPC relationships shift

5. Add scene count validation against skeleton's `target_scenes` per act