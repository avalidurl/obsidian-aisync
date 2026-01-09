# AI Sessions Sync for Obsidian

Sync your AI coding sessions (Claude Code, Codex CLI, Cursor) to your Obsidian vault as searchable markdown notes — with automatic secret redaction.

![Obsidian](https://img.shields.io/badge/Obsidian-plugin-purple.svg)
![License](https://img.shields.io/badge/license-Unlicense-blue.svg)

## Features

- 🔄 **One-click sync** from ribbon icon or command palette
- ⏰ **Auto-sync** at configurable intervals (5/15/30/60 min)
- 🔒 **Secret redaction** - API keys, tokens, passwords automatically removed
- 📁 **Organized output** - Sessions sorted by tool and date
- 🔍 **Searchable** - Full markdown with YAML frontmatter
- ⚙️ **Configurable** - Enable/disable sources, custom output folder

## Supported Sources

| Tool | Session Location |
|------|------------------|
| Claude Code | `~/.claude/projects/**/*.jsonl` |
| Codex CLI | `~/.codex/sessions/**/*.jsonl` |
| Cursor | `~/.cursor/projects/**/agent-transcripts/*.txt` |

## Installation

### From Community Plugins (Coming Soon)

1. Open Obsidian Settings → Community Plugins
2. Search for "AI Sessions Sync"
3. Install and enable

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release
2. Create folder: `<vault>/.obsidian/plugins/aisync/`
3. Copy the files into the folder
4. Enable the plugin in Obsidian settings

### Build from Source

```bash
git clone https://github.com/avalidurl/obsidian-aisync.git
cd obsidian-aisync
npm install
npm run build
```

Then copy `main.js` and `manifest.json` to your vault's plugins folder.

## Usage

### Manual Sync

- Click the **🔄 refresh icon** in the ribbon (left sidebar)
- Or use Command Palette: `Ctrl/Cmd + P` → "Sync AI Sessions Now"

### Auto-Sync

1. Go to Settings → AI Sessions Sync
2. Set "Auto-sync interval" to your preferred time
3. Sessions will sync automatically in the background

### Settings

| Setting | Description |
|---------|-------------|
| Output folder | Where to save sessions (default: `ai-sessions`) |
| Claude Code | Enable/disable Claude Code sync |
| Codex CLI | Enable/disable Codex CLI sync |
| Cursor | Enable/disable Cursor sync |
| Auto-sync interval | Sync frequency (disabled, 5/15/30/60 min) |

## Output Format

Each session is saved as a markdown file:

```
ai-sessions/
├── claude-code-sessions/
│   └── claude-code-2026-01-09-1430-abc12345.md
├── codex-sessions/
│   └── codex-2026-01-09-1500-def67890.md
└── cursor-sessions/
    └── cursor-2026-01-09-1530-project-name-ghi11111.md
```

With YAML frontmatter for Dataview queries:

```yaml
---
type: claude-code-session
date: 2026-01-09
time: "14:30"
session_id: "abc12345"
tags:
  - claude-code
  - ai-session
  - coding
---
```

## Security

All synced content is automatically scanned for secrets:

- API keys (OpenAI, Anthropic, GitHub, AWS, Google, etc.)
- Bearer tokens and JWTs
- Database connection strings
- Private keys and certificates
- Passwords and secrets in config

Detected secrets are replaced with `[REDACTED: Type]`.

## Requirements

- Obsidian v1.0.0+
- macOS, Windows, or Linux
- AI tools installed (Claude Code, Codex CLI, and/or Cursor)

## License

**Public Domain (Unlicense)** - No copyright. Do whatever you want with it.

## Contributing

Contributions welcome! Please open an issue or PR on GitHub.

## Credits

Built with ❤️ for the Obsidian community.
