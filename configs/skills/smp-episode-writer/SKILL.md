---
name: smp-episode-writer
description: Turns a rough episode idea into a full production-ready scripted Minecraft SMP episode package. Use this skill whenever the user wants to write, plan, outline, or generate a Minecraft SMP episode, script, beat sheet, shot list, or music cue sheet. Also trigger when the user says things like "write my next episode", "help me plan episode X", "turn this idea into a script", "I want to make an episode about...", or any time they describe a Minecraft SMP story idea and want it developed into structured content. This skill produces four outputs: beat sheet, full script, cinematic shot list, and music cue sheet.
---

# SMP Episode Writer

Turns a rough idea into a full production-ready scripted Minecraft SMP episode.

## What you produce

Given a rough idea (1 sentence to a paragraph), generate all four of:

1. **Beat Sheet** — scene-by-scene arc using the Blake Snyder structure
2. **Full Script** — dialogue + stage directions in Minecraft SMP style
3. **Shot List** — cinematic camera directions per scene (Replay Mod compatible)
4. **Music Cue Sheet** — mood/prompt per scene for AI music generation (Suno/Udio)

Read `references/craft.md` for screenwriting principles before writing.
Read `references/shotlist.md` for shot terminology and camera movement types.
Read `references/smp-style.md` for how scripted SMP dialogue and pacing actually works.

---

## Step 1 — Extract from the user's idea

Before writing, identify:
- **Core conflict**: What does the protagonist want? What's stopping them?
- **Episode theme**: What is this episode really about underneath the plot?
- **Tone**: Action-heavy / mystery / comedic / emotional / political?
- **Key characters**: Who's in this episode? What's their role?
- **Setting**: Where does this take place in the Minecraft world?

If the user's idea is too vague (e.g. "write an episode about a betrayal"), ask ONE clarifying question before proceeding. Otherwise proceed directly.

---

## Step 2 — Beat Sheet

Structure the episode using these beats. SMP episodes are typically 15–30 min, so compress the beat sheet accordingly (not a 120-page film — think 8–15 major beats):

| Beat | Description |
|------|-------------|
| **Opening Image** | A visual moment that sets the tone before the story starts. Establish the world state. |
| **Setup** | Show the protagonist's normal situation and what's missing or at stake. |
| **Catalyst** | The event that kicks off the episode's central problem. |
| **Debate** | A moment where the protagonist considers their options or hesitates. |
| **Break into Act 2** | The protagonist commits to a course of action. |
| **Fun & Games / Exploration** | The "promise of the premise" — the interesting middle where the plan plays out. Include mini-conflicts, discoveries, unexpected turns. |
| **Midpoint** | Either a false victory or a false defeat. Something shifts. |
| **Bad Guys Close In** | Complications escalate. The protagonist's plan starts to crack. |
| **All Is Lost** | The lowest point. Everything goes wrong. |
| **Break into Act 3** | A decision or realization that pushes toward the finale. |
| **Finale / Climax** | The confrontation or resolution. |
| **Final Image** | A closing beat that mirrors or contrasts the opening. Shows change. |

Output the beat sheet as a clean numbered list with a 1–3 sentence description per beat.

---

## Step 3 — Full Script

Write the full episode script in Minecraft SMP style. Follow these rules:

### Format
```
[SCENE HEADING]
INT./EXT. LOCATION – TIME OF DAY

[ACTION LINE]
Brief, visual description of what's happening. Present tense. No internal thoughts.

CHARACTER NAME
Dialogue here.

CHARACTER NAME (continuing)
More dialogue.
```

### SMP Script Rules (from studying real scripted SMP content)
- **Dialogue sounds natural but isn't real conversation.** Clean it up but keep personality. Real SMP players say half-sentences, get interrupted, use each other's names mid-sentence. Keep this energy.
- **Keep scenes SHORT.** SMP episodes cut fast. Most scenes are 30 seconds to 2 minutes. Don't linger.
- **Every scene has a micro-conflict.** Even comedic scenes have something someone wants and someone resisting.
- **Show, don't tell.** Don't write "Noah explains the plan." Write Noah explaining the plan in dialogue, with reactions.
- **Narrator / VO blocks** can be used for time skips, context, or lore. Keep them punchy — 2–3 sentences max.
- **Subtext matters.** Characters don't always say what they mean. Tension under polite conversation is good.
- **Give each character a distinct voice.** Different vocabulary, sentence length, level of seriousness.
- **Scene transitions.** Use `CUT TO:`, `SMASH CUT TO:`, or `FADE TO:` between scenes. Match the tone of the cut to the moment.

### Pacing rhythm to follow
Tense scene → lighter/character moment → tense → payoff. Never stack two high-tension scenes back to back without breathing room. Never stack two comedic scenes without advancing the plot.

---

## Step 4 — Shot List

For each major scene, provide a shot list table:

| # | Scene | Shot Size | Camera Angle | Movement | Description |
|---|-------|-----------|--------------|----------|-------------|
| 1 | Opening | Wide / Establishing | Eye-level | Static | Server landscape at dawn, no players visible yet |
| 2 | Opening | Close-Up | Low angle | Slow push-in | On protagonist's face as they look at something off-screen |

**Shot Sizes**: Extreme Wide, Wide, Medium Wide, Medium, Medium Close-Up, Close-Up, Extreme Close-Up
**Camera Angles**: Eye-level, Low angle, High angle, Bird's eye, Dutch angle (unease/danger)
**Movements**: Static, Pan, Tilt, Dolly in/out, Tracking shot, Crane/Boom, Handheld (chaos/urgency), Steadicam (smooth follow), Rack Focus, Zoom

### Replay Mod Notes
All shots are designed for **Replay Mod** post-recording. Mark any shot that requires:
- `[LIVE]` — must be captured during actual session
- `[REPLAY]` — can be set up after via Replay Mod camera paths
- `[FREECAM]` — can be captured live with Freecam mod

Use cinematic shots intentionally. Save Dutch angles for betrayal or danger. Use low angles to make characters feel powerful. Use wide establishing shots to open new locations. Push-ins on faces for emotional moments.

---

## Step 5 — Music Cue Sheet

For each scene or beat, provide a music cue:

| Scene | Mood | Suno/Udio Prompt | Notes |
|-------|------|------------------|-------|
| Opening | Mysterious, ancient | "ambient orchestral, dark fantasy, slow build, no lyrics, strings and choir, cinematic" | Loop-able, fade in |
| Chase sequence | Urgent, chaotic | "fast percussion, tension, action chase, no lyrics, drums and brass" | Cut on beat |

### Music cue types
- **Underscore**: Background mood, never distracting
- **Sting**: Short 2–5 second hit for a reveal or cut
- **Swell**: Builds into an emotional peak
- **Source music**: Diegetic music (e.g., a tavern band in the background)

Suggest where music should START, FADE, and CUT. Give the Suno/Udio prompt as a ready-to-paste string.

---

## Output Format

Present all four sections clearly labeled. Use headers:

```
═══════════════════════════════
   EPISODE [NUMBER]: [TITLE]
═══════════════════════════════

## BEAT SHEET
...

## FULL SCRIPT
...

## SHOT LIST
...

## MUSIC CUE SHEET
...
```

If the episode idea comes with existing lore or character context (pasted by the user), incorporate it fully. Never contradict established lore.

---

## Quality checklist before outputting

- [ ] Every scene has a clear micro-conflict
- [ ] Pacing rhythm is tense → light → tense → payoff
- [ ] Dialogue sounds like real people, not exposition dumps
- [ ] Shot list has at least 3–5 shots per major scene
- [ ] Music cues cover every scene with a ready-to-paste prompt
- [ ] Final image echoes or contrasts the opening image
- [ ] The episode theme is woven into at least one dialogue exchange
