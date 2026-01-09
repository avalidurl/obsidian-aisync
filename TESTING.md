# Testing Documentation

This document describes how AI Sessions Sync has been tested across platforms.

## Desktop Platforms

### macOS ✅
- **Method:** Real device testing
- **Sessions tested:** 61 Claude Code, 13 Codex CLI, 7 Cursor
- **Result:** All features working correctly

### Windows ✅
- **Method:** Cross-platform simulation
- **Verified:**
  - Path handling with `os.homedir()` → `C:\Users\username`
  - Path separators via `path.join()` → backslashes
  - Windows line endings (`\r\n`) parsing
- **Result:** All simulations pass

### Linux ✅
- **Method:** Cross-platform simulation
- **Verified:**
  - Path handling with `os.homedir()` → `/home/username`
  - Path separators via `path.join()` → forward slashes
  - Unix line endings (`\n`) parsing
- **Result:** All simulations pass

## Mobile Platforms

### iOS/Android ⚪ Not Applicable
- **Reason:** Plugin is `isDesktopOnly: true`
- **Why:** Source AI tools don't exist on mobile
  - Claude Code → Desktop terminal application
  - Codex CLI → Desktop command-line tool
  - Cursor → Desktop IDE
- **Graceful handling:** Plugin checks if directories exist, returns 0 sessions if not

## Test Coverage

### Path Handling
```
macOS:   /Users/gokhan/.claude/projects/...     ✅
Linux:   /home/gokhan/.claude/projects/...      ✅
Windows: C:\Users\gokhan\.claude\projects\...   ✅
```

### Line Endings
```
Unix (\n):      ✅ Parsed correctly
Windows (\r\n): ✅ Parsed correctly
```

### Session Parsing
```
Claude Code JSONL: ✅ User/assistant messages extracted
Codex CLI JSONL:   ✅ Session meta and responses extracted
Cursor transcripts: ✅ User queries and AI responses extracted
```

### Secret Redaction
| Pattern | Example | Status |
|---------|---------|--------|
| OpenAI API Key | `sk-...` | ✅ |
| Anthropic API Key | `sk-ant-...` | ✅ |
| GitHub Token | `ghp_...` | ✅ |
| AWS Access Key | `AKIA...` | ✅ |
| Database URL | `postgres://...` | ✅ |
| MongoDB URL | `mongodb+srv://...` | ✅ |
| Bearer Token | `Bearer eyJ...` | ✅ |
| JWT | `eyJ...` | ✅ |

## Running Tests Locally

### Quick Test
```bash
npm run build
node -e "require('./main.js'); console.log('✅ Plugin loads')"
```

### Full Simulation Test
```bash
node << 'EOF'
const os = require('os');
const path = require('path');
const fs = require('fs');

// Test paths
console.log('Home:', os.homedir());
console.log('Claude path:', path.join(os.homedir(), '.claude', 'projects'));
console.log('Codex path:', path.join(os.homedir(), '.codex', 'sessions'));
console.log('Cursor path:', path.join(os.homedir(), '.cursor', 'projects'));

// Check real directories
const dirs = ['.claude/projects', '.codex/sessions', '.cursor/projects'];
for (const dir of dirs) {
  const full = path.join(os.homedir(), dir);
  console.log(`${dir}: ${fs.existsSync(full) ? '✅ exists' : '❌ missing'}`);
}
EOF
```

## CI/CD

GitHub Actions workflow (`.github/workflows/test.yml`) runs on:
- `ubuntu-latest`
- `macos-latest`
- `windows-latest`

The workflow:
1. Builds the plugin
2. Creates mock session files
3. Tests file parsing
4. Verifies secret redaction
5. Uploads build artifacts
