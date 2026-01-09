# How to Submit to Obsidian Community Plugins

This guide walks you through submitting this plugin to the official Obsidian community plugins list.

## Prerequisites Checklist

Before submitting, ensure you have:

- [x] `manifest.json` - Plugin metadata
- [x] `versions.json` - Version compatibility map
- [x] `main.js` - Compiled plugin code
- [x] `styles.css` - Plugin styles (optional but recommended)
- [x] `README.md` - Documentation
- [x] `LICENSE` - Open source license (required)
- [x] GitHub repository is public

## Step 1: Verify Your Files

### manifest.json requirements:

```json
{
  "id": "aisync",           // Unique, lowercase, no spaces
  "name": "AI Sessions Sync",
  "version": "1.0.0",
  "minAppVersion": "1.0.0",
  "description": "...",     // Clear, concise description
  "author": "Your Name",
  "authorUrl": "https://github.com/username",
  "isDesktopOnly": true     // or false
}
```

### versions.json format:

```json
{
  "1.0.0": "1.0.0"  // plugin version: minimum Obsidian version
}
```

## Step 2: Create a GitHub Release

1. **Tag your release:**
   ```bash
   git tag 1.0.0
   git push origin 1.0.0
   ```

2. **Create release on GitHub:**
   - Go to your repo → Releases → "Create a new release"
   - Select your tag (1.0.0)
   - Title: `1.0.0`
   - Attach these files:
     - `main.js`
     - `manifest.json`
     - `styles.css`
   - Click "Publish release"

## Step 3: Submit Pull Request

1. **Fork the Obsidian releases repo:**
   - Go to: https://github.com/obsidianmd/obsidian-releases
   - Click "Fork"

2. **Edit community-plugins.json:**
   - Open `community-plugins.json` in your fork
   - Add your plugin entry in alphabetical order:
   
   ```json
   {
     "id": "aisync",
     "name": "AI Sessions Sync",
     "author": "Gökhan Turhan",
     "description": "Sync Claude Code, Codex CLI, and Cursor chat sessions to your vault as searchable markdown notes with automatic secret redaction.",
     "repo": "avalidurl/obsidian-aisync"
   }
   ```

3. **Create Pull Request:**
   - Title: `Add aisync plugin`
   - Description should include:
     - Brief description of what the plugin does
     - Confirmation that you've tested it
     - Any special notes for reviewers

## Step 4: Review Process

The Obsidian team will review your submission. Common review points:

| Check | Description |
|-------|-------------|
| **Functionality** | Does the plugin work as described? |
| **Security** | No malicious code, proper permissions |
| **Quality** | Clean code, no major bugs |
| **Documentation** | Clear README, good description |
| **Licensing** | Valid open source license |

### Timeline
- Reviews typically take **1-2 weeks**
- You may receive feedback requiring changes
- Once approved, your plugin appears in Community Plugins

## Step 5: After Approval

Once approved, users can install via:
1. Settings → Community Plugins → Browse
2. Search "AI Sessions Sync"
3. Install

### Updating Your Plugin

For future updates:

1. Update `version` in `manifest.json`
2. Update `versions.json` if minimum Obsidian version changes
3. Create new GitHub release with the new version tag
4. Users will see the update in Obsidian

## Quick Commands

```bash
# Build for release
npm run build

# Tag and push
git add .
git commit -m "Release 1.0.0"
git tag 1.0.0
git push origin main --tags

# Verify release files exist
ls -la main.js manifest.json styles.css versions.json
```

## Useful Links

- [Obsidian Plugin Guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)
- [Sample Plugin](https://github.com/obsidianmd/obsidian-sample-plugin)
- [Community Plugins Repo](https://github.com/obsidianmd/obsidian-releases)
- [Plugin API Docs](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)

## Troubleshooting

| Issue | Solution |
|-------|----------|
| PR rejected for naming | Use unique, descriptive `id` |
| Version mismatch | Ensure manifest.json matches tag |
| Build errors | Check Node.js version, reinstall deps |
| Missing files in release | Manually upload all required files |

---

Good luck with your submission! 🚀
