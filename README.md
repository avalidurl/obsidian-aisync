# AI Sessions Sync for Obsidian

[![GitHub release](https://img.shields.io/github/v/release/avalidurl/obsidian-aisync?style=flat-square)](https://github.com/avalidurl/obsidian-aisync/releases)
[![Obsidian Downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&color=%23483699&label=downloads&query=%24%5B%22aisync%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json&style=flat-square)](https://obsidian.md/plugins?id=aisync)
[![License](https://img.shields.io/badge/license-Unlicense-blue?style=flat-square)](LICENSE)
[![Providers](https://img.shields.io/badge/providers-14-blue?style=flat-square)](https://github.com/avalidurl/obsidian-aisync)

> Sync your AI coding sessions from **14 different tools** to your Obsidian vault as searchable markdown notes — with automatic secret redaction.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔄 **One-click sync** | Sync from ribbon icon or command palette |
| ⏰ **Auto-sync** | Background sync at configurable intervals |
| 🔒 **Secret redaction** | API keys, tokens, passwords automatically removed |
| 📁 **Organized output** | Sessions sorted by tool and date |
| 🔍 **Searchable** | Full markdown with YAML frontmatter |
| 📊 **Dataview ready** | Query your sessions with Dataview |
| 🔌 **14 providers** | Support for all major AI coding tools |

## 🛠️ Supported AI Tools (14)

| Tool | Session Location | Status |
|------|------------------|--------|
| **Claude Code** | `~/.claude/projects/**/*.jsonl` | ✅ Supported |
| **Codex CLI** | `~/.codex/sessions/**/*.jsonl` | ✅ Supported |
| **Cursor** | `~/.cursor/projects/**/agent-transcripts/*.txt` | ✅ Supported |
| **Aider** | `~/.aider.chat.history.md` | ✅ Supported |
| **Cline** | VS Code globalStorage | ✅ Supported |
| **Gemini CLI** | `~/.gemini/` | ✅ Supported |
| **Continue.dev** | `~/.continue/sessions/` | ✅ Supported |
| **GitHub Copilot** | VS Code globalStorage | ✅ Supported |
| **Roo Code** | VS Code globalStorage | ✅ Supported |
| **Windsurf** | Codeium/Windsurf app data | ✅ Supported |
| **Zed AI** | `~/.config/zed/conversations/` | ✅ Supported |
| **Amp (Sourcegraph)** | VS Code globalStorage | ✅ Supported |
| **OpenCode** | `~/.local/share/opencode/` | ✅ Supported |
| **OpenRouter** | `~/Downloads/openrouter*.json` (exports) | ✅ Supported |

## 📦 Installation

### From Community Plugins

1. Open **Settings** → **Community Plugins** → **Browse**
2. Search for "**AI Sessions Sync**"
3. Click **Install**, then **Enable**

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/avalidurl/obsidian-aisync/releases)
2. Create folder: `<your-vault>/.obsidian/plugins/aisync/`
3. Copy the downloaded files into the folder
4. Restart Obsidian and enable the plugin in Settings

### Build from Source

```bash
git clone https://github.com/avalidurl/obsidian-aisync.git
cd obsidian-aisync
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` to your vault's plugins folder.

## 🚀 Usage

### Manual Sync

- Click the **🔄 refresh icon** in the left ribbon
- Or press `Ctrl/Cmd + P` → type "**Sync AI Sessions Now**"

### Auto-Sync

1. Go to **Settings** → **AI Sessions Sync**
2. Set **Auto-sync interval** to your preferred time (5/15/30/60 min)
3. Sessions will sync automatically in the background

### Settings

| Setting | Description | Default |
|---------|-------------|---------|
| **Output folder** | Where to save sessions | `ai-sessions` |
| **Providers** | Enable/disable individual tools | All enabled |
| **Auto-sync interval** | Background sync frequency | Disabled |

Each provider can be individually toggled in settings.

## 📂 Output Format

Sessions are organized by tool:

```
ai-sessions/
├── claude-code-sessions/
├── codex-sessions/
├── cursor-sessions/
├── aider-sessions/
├── cline-sessions/
├── gemini-cli-sessions/
├── continue-sessions/
├── copilot-chat-sessions/
├── roo-code-sessions/
├── windsurf-sessions/
├── zed-ai-sessions/
└── amp-sessions/
```

Each file includes YAML frontmatter for Dataview:

```yaml
---
type: claude-code-session
date: 2026-01-09
time: "14:30"
session_id: "abc12345"
working_dir: "/Users/me/project"
tags:
  - claude-code
  - ai-session
  - coding
summary: "Help me refactor this function..."
---
```

### Dataview Examples

**List all sessions from today:**
```dataview
TABLE date, time, summary
FROM "ai-sessions"
WHERE date = date(today)
SORT time DESC
```

**Count sessions by tool:**
```dataview
TABLE length(rows) as Sessions
FROM "ai-sessions"
GROUP BY type
```

## 🔒 Security

All synced content is scanned and secrets are redacted:

| Secret Type | Example Pattern | Replaced With |
|-------------|-----------------|---------------|
| OpenAI API Key | `sk-...` | `[REDACTED: OpenAI API Key]` |
| Anthropic API Key | `sk-ant-...` | `[REDACTED: Anthropic API Key]` |
| GitHub Token | `ghp_...` | `[REDACTED: GitHub Token]` |
| Google API Key | `AIza...` | `[REDACTED: Google API Key]` |
| Sourcegraph Token | `sgp_...` | `[REDACTED: Sourcegraph Token]` |
| JWT Token | `eyJ...` | `[REDACTED: JWT Token]` |
| Database URL | `postgres://...` | `[REDACTED: Database URL]` |
| Private Keys | `-----BEGIN...` | `[REDACTED: Private Key Block]` |

## 📋 Requirements

- **Obsidian** v1.0.0 or later
- **macOS**, **Windows**, or **Linux** (desktop only)
- At least one supported AI tool installed

## ✅ Platform Testing

| Platform | Status | Notes |
|----------|--------|-------|
| **macOS** | ✅ Tested | Full support |
| **Windows** | ✅ Tested | Full support |
| **Linux** | ✅ Tested | Full support |
| **iOS** | ⚪ N/A | Desktop-only plugin |
| **Android** | ⚪ N/A | Desktop-only plugin |

This plugin is `isDesktopOnly: true` because the source AI tools only exist on desktop platforms.

## 🤝 Contributing

Contributions are welcome! To add a new provider:

1. Create `src/sync/<provider>.ts` based on existing sync files
2. Add import and register in `src/main.ts`
3. Update this README

## 📜 License

**Public Domain** ([Unlicense](LICENSE)) — No copyright. Do whatever you want with it.

## 💖 Support

If you find this plugin useful, consider:
- ⭐ Starring the repo on GitHub
- 🐛 Reporting bugs or suggesting features
- 💻 Contributing code or documentation

### ☕ Buy Me Compute

Support development with crypto donations:

| Currency | Address |
|----------|---------|
| **BTC** | `bc1q8emnjcdj6hwyfg074c0sulr739gvmwula9359n` |
| **ETH** | `0x36de990133D36d7E3DF9a820aA3eDE5a2320De71` |
| **SOL** | `J1ALikLy5TZ9tqZq5zxSem5P9G4Wo6fXXWSGGjEvd9Pg` |
| **ZEC** | `t1KGW4ttsi4Dk9NpMMXacuo1BGq51qMHPDh` |

See [DONATIONS.md](DONATIONS.md) for all supported networks.

---

## 📋 Changelog

### v1.2.0 (2026-01-10)
- ✨ **New providers:** OpenCode and OpenRouter (14 total)
- 🐛 **Fix:** Duplicate session files when conversations continue
  - Now uses file creation time (birthtime) for stable filenames
  - Finds existing files by session ID to prevent duplicates
  - Automatically cleans up old duplicate files on sync

### v1.1.0 (2026-01-09)
- ✨ Added 9 new providers: Aider, Cline, Gemini CLI, Continue, Copilot, Roo Code, Windsurf, Zed AI, Amp
- 🔧 Improved session update handling

### v1.0.0 (2026-01-09)
- 🎉 Initial release with Claude Code, Codex CLI, and Cursor support

---

<p align="center">
Built with ❤️ for the Obsidian community
</p>
