# Product

## Register

product

## Users

Developers who use AI coding agents (OpenCode, Claude Code, Qwen, Codex, etc.) in the terminal on Windows. They want a native desktop shell that wraps their CLI tools with visual customization, session tracking, and profile management. Their context: long coding sessions, multiple projects, switching between agents. They're technically fluent — they don't need hand-holding, they need a tool that disappears into the workflow.

## Product Purpose

Monolith wraps CLI coding agents in a native Windows desktop shell. Users choose a project directory to start a terminal session with integrated emulation and history tracking. The product exists because raw terminal emulators are utilitarian — Monolith gives developers a beautiful, themeable, customizable environment that respects their time and taste.

Success: the shell feels invisible during deep work, and delightful when configuring it.

## Brand Personality

**Technical Precision.** Sharp, engineered, deliberate. Like a well-crafted dev tool — Linear, Raycast, Arc — not a toy, not a corporate dashboard. Every pixel is intentional. The monospace body text, uppercase labels, and warm peach accent say "built by someone who cares about craft." The glassmorphism is restrained, not decorative. The app should feel like it was designed by the same kind of developer who uses it.

Voice: confident, direct, no fluff. UI copy is minimal and functional. No marketing language, no exclamation marks, no "awesome!"

## Anti-references

- **VS Code / Electron apps.** Heavy, gray, utilitarian. The "default Electron look" with flat rectangles and no soul.
- **SaaS landing pages.** Generic gradient heroes, "trusted by" logos, pricing tables, cookie-cutter startup aesthetic.
- **Neon/hacker aesthetic.** Cyberpunk green-on-black, Matrix rain, "h4ck3r" vibes. Too try-hard.
- **Gamified dashboards.** XP bars, achievement badges, cartoon mascots. Not a game.
- **Corporate enterprise tools.** IBM/Microsoft enterprise blue, sterile white, "synergy" energy.

## Design Principles

1. **Practice what you preach.** A tool for AI coding agents should itself be built with care and precision. The codebase is the product's first impression.
2. **Show, don't tell.** Customization IS the product. Every option should be visible, tactile, and immediately responsive. No "save" buttons — changes apply live.
3. **Expert confidence.** No tooltips explaining basic concepts. No onboarding wizards. No "Are you sure?" confirmations for reversible actions. Trust the user.
4. **Density over decoration.** Every pixel serves a purpose. Glassmorphism is atmospheric, not decorative. Animations are functional feedback, not delight theater.
5. **The tool disappears.** When deep in a coding session, the shell should be invisible. The terminal is the product; everything around it is ambient.

## Accessibility & Inclusion

WCAG AA compliance. Focus indicators on all interactive elements. `prefers-reduced-motion` support (zeroes all animations). `prefers-reduced-transparency` fallback (glass → solid). `prefers-contrast: more` support (boosts token contrast). `color-scheme` property set correctly for native control theming. Keyboard-navigable command palette, settings, and file picker.
