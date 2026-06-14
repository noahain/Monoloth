# Security Policy

## Supported versions

Monoloth ships fixes in the latest release. Update to the most recent version
before reporting a vulnerability.

| Version | Supported |
| --- | --- |
| 2.1.x | Yes |
| < 2.1 | No |

## Reporting a vulnerability

Please report security issues privately, not in public issues.

- Preferred: open a private advisory through GitHub's
  ["Report a vulnerability"](https://github.com/noahain/Monoloth/security/advisories/new)
  button on the Security tab.
- Email: `TODO@example.com` <!-- replace with a real contact address -->

Include what you found, how to reproduce it, and the impact. Expect an
acknowledgment within a few days.

## What Monoloth accesses

Monoloth is a desktop shell for CLI coding agents, so it touches your system
in ways worth stating plainly:

- **Terminals and processes.** It spawns PTY sessions and runs the command you
  configure (`opencode` by default) plus any secondary or background commands
  you set up. Those processes run with your user permissions.
- **The project directory.** It reads the directory you pick: listing files,
  generating previews, and analyzing image brightness for theming.
- **Local config.** Settings and profiles are stored under
  `%APPDATA%/Monoloth/` (or the platform config directory). Nothing is sent
  anywhere.

## Auto-update

Monoloth checks for updates through the Tauri updater and notifies you when one
is available. Update artifacts are signed with a
[minisign](https://jedisct1.github.io/minisign/) key, and the app verifies that
signature before installing, so a tampered update is rejected. The update
manifest is served from the project's GitHub Releases.

## Code signing

Release installers are not yet signed with an OS code-signing certificate. Until
they are, Windows SmartScreen and macOS Gatekeeper may warn on first launch.
This section will be updated when signing is in place.
