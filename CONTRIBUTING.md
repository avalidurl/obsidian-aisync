# Contributing to AI Sessions Sync

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Development Setup

### Prerequisites

- Node.js 18+
- npm or pnpm
- Obsidian (for testing)

### Getting Started

1. **Clone the repository**
   ```bash
   git clone https://github.com/avalidurl/obsidian-aisync.git
   cd obsidian-aisync
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the plugin**
   ```bash
   npm run build
   ```

4. **Development mode** (watches for changes)
   ```bash
   npm run dev
   ```

### Testing in Obsidian

1. Create a test vault or use an existing one
2. Create the plugin folder: `<vault>/.obsidian/plugins/aisync/`
3. Copy `main.js`, `manifest.json`, and `styles.css` to the folder
4. Enable the plugin in Obsidian Settings → Community Plugins

**Tip:** You can symlink the files for faster iteration:
```bash
ln -s /path/to/obsidian-aisync/main.js /path/to/vault/.obsidian/plugins/aisync/main.js
ln -s /path/to/obsidian-aisync/manifest.json /path/to/vault/.obsidian/plugins/aisync/manifest.json
ln -s /path/to/obsidian-aisync/styles.css /path/to/vault/.obsidian/plugins/aisync/styles.css
```

## Project Structure

```
obsidian-aisync/
├── src/
│   ├── main.ts          # Plugin entry point, settings, commands
│   └── sync/
│       ├── claude.ts    # Claude Code session parser
│       ├── codex.ts     # Codex CLI session parser
│       ├── cursor.ts    # Cursor session parser
│       ├── redact.ts    # Secret redaction utilities
│       └── utils.ts     # Shared utilities
├── manifest.json        # Obsidian plugin manifest
├── versions.json        # Version compatibility map
├── styles.css           # Plugin styles
├── esbuild.config.mjs   # Build configuration
└── tsconfig.json        # TypeScript configuration
```

## Making Changes

### Adding a New AI Tool

1. Create a new file in `src/sync/` (e.g., `windsurf.ts`)
2. Implement the sync function following the pattern in existing files
3. Add a toggle in `src/main.ts` settings
4. Call the sync function from `runSync()`
5. Update README.md with the new source

### Adding Secret Patterns

Edit `src/sync/redact.ts` and add patterns to `SECRET_PATTERNS` or `SECRET_PATTERNS_CI` arrays.

## Code Style

- Use TypeScript strict mode
- Follow existing code patterns
- Add JSDoc comments for exported functions
- Keep functions focused and single-purpose

## Pull Request Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Test in Obsidian
5. Commit with a descriptive message
6. Push and open a Pull Request

### PR Checklist

- [ ] Code builds without errors (`npm run build`)
- [ ] Tested in Obsidian
- [ ] Updated README if adding features
- [ ] Added/updated comments where needed

## Reporting Issues

When reporting bugs, please include:

- Obsidian version
- Operating system
- Steps to reproduce
- Expected vs actual behavior
- Console errors (if any)

## Questions?

Open a GitHub issue or discussion. We're happy to help!

## License

By contributing, you agree that your contributions will be released under the Unlicense (public domain).
