import { App, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { syncClaudeCode } from './sync/claude';
import { syncCodex } from './sync/codex';
import { syncCursor } from './sync/cursor';
import { syncAider } from './sync/aider';
import { syncCline } from './sync/cline';
import { syncGeminiCli } from './sync/gemini';
import { syncContinue } from './sync/continue';
import { syncCopilotChat } from './sync/copilot';
import { syncRooCode } from './sync/roo';
import { syncWindsurf } from './sync/windsurf';
import { syncZedAi } from './sync/zed';
import { syncAmp } from './sync/amp';
import { syncOpenCode } from './sync/opencode';
import * as os from 'os';

interface AISyncSettings {
  outputFolder: string;
  // Core providers
  claudeEnabled: boolean;
  codexEnabled: boolean;
  cursorEnabled: boolean;
  // Additional providers
  aiderEnabled: boolean;
  clineEnabled: boolean;
  geminiEnabled: boolean;
  continueEnabled: boolean;
  copilotEnabled: boolean;
  rooEnabled: boolean;
  windsurfEnabled: boolean;
  zedEnabled: boolean;
  ampEnabled: boolean;
  opencodeEnabled: boolean;
  // Auto-sync
  autoSyncInterval: number;
  lastSync: string;
}

const DEFAULT_SETTINGS: AISyncSettings = {
  outputFolder: 'ai-sessions',
  claudeEnabled: true,
  codexEnabled: true,
  cursorEnabled: true,
  aiderEnabled: true,
  clineEnabled: true,
  geminiEnabled: true,
  continueEnabled: true,
  copilotEnabled: true,
  rooEnabled: true,
  windsurfEnabled: true,
  zedEnabled: true,
  ampEnabled: true,
  opencodeEnabled: true,
  autoSyncInterval: 0,
  lastSync: ''
};

interface SyncProvider {
  name: string;
  key: keyof AISyncSettings;
  folder: string;
  sync: (app: App, homeDir: string, outputFolder: string) => Promise<number>;
  desc: string;
}

const PROVIDERS: SyncProvider[] = [
  { name: 'Claude Code', key: 'claudeEnabled', folder: 'claude-code-sessions', sync: syncClaudeCode, desc: '~/.claude/projects/' },
  { name: 'Codex CLI', key: 'codexEnabled', folder: 'codex-sessions', sync: syncCodex, desc: '~/.codex/sessions/' },
  { name: 'Cursor', key: 'cursorEnabled', folder: 'cursor-sessions', sync: syncCursor, desc: '~/.cursor/projects/' },
  { name: 'Aider', key: 'aiderEnabled', folder: 'aider-sessions', sync: syncAider, desc: '~/.aider.chat.history.md' },
  { name: 'Cline', key: 'clineEnabled', folder: 'cline-sessions', sync: syncCline, desc: 'VS Code globalStorage' },
  { name: 'Gemini CLI', key: 'geminiEnabled', folder: 'gemini-cli-sessions', sync: syncGeminiCli, desc: '~/.gemini/' },
  { name: 'Continue.dev', key: 'continueEnabled', folder: 'continue-sessions', sync: syncContinue, desc: '~/.continue/sessions/' },
  { name: 'GitHub Copilot', key: 'copilotEnabled', folder: 'copilot-chat-sessions', sync: syncCopilotChat, desc: 'VS Code globalStorage' },
  { name: 'Roo Code', key: 'rooEnabled', folder: 'roo-code-sessions', sync: syncRooCode, desc: 'VS Code globalStorage' },
  { name: 'Windsurf', key: 'windsurfEnabled', folder: 'windsurf-sessions', sync: syncWindsurf, desc: 'Codeium/Windsurf app' },
  { name: 'Zed AI', key: 'zedEnabled', folder: 'zed-ai-sessions', sync: syncZedAi, desc: '~/.config/zed/conversations/' },
  { name: 'Amp', key: 'ampEnabled', folder: 'amp-sessions', sync: syncAmp, desc: 'Sourcegraph Cody' },
  { name: 'OpenCode', key: 'opencodeEnabled', folder: 'opencode-sessions', sync: syncOpenCode, desc: '.opencode/opencode.db' },
];

export default class AISyncPlugin extends Plugin {
  settings: AISyncSettings;
  autoSyncIntervalId: number | null = null;
  statusBarItem: HTMLElement | null = null;

  async onload() {
    await this.loadSettings();

    // Add ribbon icon
    this.addRibbonIcon('refresh-cw', 'Sync AI sessions', async () => {
      await this.runSync();
    });

    // Add command
    this.addCommand({
      id: 'sync-ai-sessions',
      name: 'Sync AI sessions now',
      callback: () => {
        void this.runSync();
      }
    });

    // Add settings tab
    this.addSettingTab(new AISyncSettingTab(this.app, this));

    // Setup auto-sync if enabled
    this.setupAutoSync();

    // Status bar
    this.statusBarItem = this.addStatusBarItem();
    this.updateStatusBar();
  }

  updateStatusBar() {
    if (this.statusBarItem) {
      this.statusBarItem.setText(this.settings.lastSync ? `AI Sync: ${this.settings.lastSync}` : 'AI Sync: Never');
    }
  }

  onunload() {
    if (this.autoSyncIntervalId) {
      window.clearInterval(this.autoSyncIntervalId);
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  setupAutoSync() {
    if (this.autoSyncIntervalId) {
      window.clearInterval(this.autoSyncIntervalId);
      this.autoSyncIntervalId = null;
    }

    if (this.settings.autoSyncInterval > 0) {
      const intervalMs = this.settings.autoSyncInterval * 60 * 1000;
      this.autoSyncIntervalId = window.setInterval(() => {
        void this.runSync(true);
      }, intervalMs);
    }
  }

  async runSync(silent: boolean = false) {
    const homeDir = os.homedir();

    let totalSynced = 0;
    const errors: string[] = [];

    if (!silent) {
      new Notice('🔄 Syncing AI sessions...');
    }

    try {
      // Ensure base output folder exists
      await this.ensureFolder(this.settings.outputFolder);

      // Sync each enabled provider
      for (const provider of PROVIDERS) {
        if (!this.settings[provider.key]) continue;

        try {
          await this.ensureFolder(`${this.settings.outputFolder}/${provider.folder}`);
          const count = await provider.sync(this.app, homeDir, this.settings.outputFolder);
          totalSynced += count;
        } catch (e) {
          errors.push(`${provider.name}: ${e}`);
        }
      }

      // Update last sync time
      this.settings.lastSync = new Date().toLocaleTimeString();
      await this.saveSettings();
      this.updateStatusBar();

      if (!silent || totalSynced > 0) {
        if (errors.length > 0) {
          new Notice(`⚠️ Synced ${totalSynced} sessions with ${errors.length} errors`);
        } else {
          new Notice(`✅ Synced ${totalSynced} new AI sessions`);
        }
      }
    } catch (e) {
      new Notice(`❌ Sync failed: ${e}`);
    }
  }

  async ensureFolder(folderPath: string) {
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!folder) {
      await this.app.vault.createFolder(folderPath);
    }
  }
}

class AISyncSettingTab extends PluginSettingTab {
  plugin: AISyncPlugin;

  constructor(app: App, plugin: AISyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('AI sessions sync settings')
      .setHeading();

    new Setting(containerEl)
      .setName('Output folder')
      .setDesc('Folder in your vault where sessions will be saved')
      .addText(text => text
        .setPlaceholder('ai-sessions')
        .setValue(this.plugin.settings.outputFolder)
        .onChange(async (value) => {
          this.plugin.settings.outputFolder = value || 'ai-sessions';
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Providers')
      .setDesc('Enable or disable individual AI tools')
      .setHeading();

    // Dynamically create settings for each provider
    for (const provider of PROVIDERS) {
      new Setting(containerEl)
        .setName(provider.name)
        .setDesc(`Sync sessions from ${provider.desc}`)
        .addToggle(toggle => toggle
          .setValue(this.plugin.settings[provider.key] as boolean)
          .onChange(async (value) => {
            (this.plugin.settings[provider.key] as boolean) = value;
            await this.plugin.saveSettings();
          }));
    }

    new Setting(containerEl)
      .setName('Auto-sync')
      .setHeading();

    new Setting(containerEl)
      .setName('Auto-sync interval (minutes)')
      .setDesc('Automatically sync every X minutes (0 = disabled, min 1)')
      .addText(text => text
        .setPlaceholder('0')
        .setValue(String(this.plugin.settings.autoSyncInterval))
        .onChange(async (value) => {
          const num = parseInt(value) || 0;
          // Enforce minimum of 1 minute if enabled, max 1440 (24 hours)
          this.plugin.settings.autoSyncInterval = num <= 0 ? 0 : Math.min(Math.max(num, 1), 1440);
          await this.plugin.saveSettings();
          this.plugin.setupAutoSync();
        }));

    new Setting(containerEl)
      .setName('Manual sync')
      .setHeading();

    new Setting(containerEl)
      .setName('Sync now')
      .setDesc(`Manually trigger a sync (${PROVIDERS.length} providers available)`)
      .addButton(button => button
        .setButtonText('Sync now')
        .setCta()
        .onClick(async () => {
          await this.plugin.runSync();
        }));
  }
}
