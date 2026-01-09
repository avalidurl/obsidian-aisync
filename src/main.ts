import { App, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { syncClaudeCode } from './sync/claude';
import { syncCodex } from './sync/codex';
import { syncCursor } from './sync/cursor';
import * as os from 'os';

interface AISyncSettings {
  outputFolder: string;
  claudeEnabled: boolean;
  codexEnabled: boolean;
  cursorEnabled: boolean;
  autoSyncInterval: number; // minutes, 0 = disabled
  lastSync: string;
}

const DEFAULT_SETTINGS: AISyncSettings = {
  outputFolder: 'ai-sessions',
  claudeEnabled: true,
  codexEnabled: true,
  cursorEnabled: true,
  autoSyncInterval: 0,
  lastSync: ''
};

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
    const adapter = this.app.vault.adapter as { basePath?: string };
    const _vaultPath = adapter.basePath ?? '';

    let totalSynced = 0;
    const errors: string[] = [];

    if (!silent) {
      new Notice('🔄 Syncing AI sessions...');
    }

    try {
      // Ensure output folders exist
      await this.ensureFolder(this.settings.outputFolder);
      await this.ensureFolder(`${this.settings.outputFolder}/claude-code-sessions`);
      await this.ensureFolder(`${this.settings.outputFolder}/codex-sessions`);
      await this.ensureFolder(`${this.settings.outputFolder}/cursor-sessions`);

      // Sync Claude Code
      if (this.settings.claudeEnabled) {
        try {
          const count = await syncClaudeCode(this.app, homeDir, this.settings.outputFolder);
          totalSynced += count;
        } catch (e) {
          errors.push(`Claude: ${e}`);
        }
      }

      // Sync Codex
      if (this.settings.codexEnabled) {
        try {
          const count = await syncCodex(this.app, homeDir, this.settings.outputFolder);
          totalSynced += count;
        } catch (e) {
          errors.push(`Codex: ${e}`);
        }
      }

      // Sync Cursor
      if (this.settings.cursorEnabled) {
        try {
          const count = await syncCursor(this.app, homeDir, this.settings.outputFolder);
          totalSynced += count;
        } catch (e) {
          errors.push(`Cursor: ${e}`);
        }
      }

      // Update last sync time
      this.settings.lastSync = new Date().toLocaleTimeString();
      await this.saveSettings();
      this.updateStatusBar();

      if (!silent || totalSynced > 0) {
        if (errors.length > 0) {
          new Notice(`⚠️ Synced ${totalSynced} sessions with errors`);
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
      .setName('Sources')
      .setHeading();

    new Setting(containerEl)
      .setName('Claude Code')
      .setDesc('Sync sessions from ~/.claude/projects/')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.claudeEnabled)
        .onChange(async (value) => {
          this.plugin.settings.claudeEnabled = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Codex CLI')
      .setDesc('Sync sessions from ~/.codex/sessions/')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.codexEnabled)
        .onChange(async (value) => {
          this.plugin.settings.codexEnabled = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Cursor')
      .setDesc('Sync sessions from ~/.cursor/projects/')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.cursorEnabled)
        .onChange(async (value) => {
          this.plugin.settings.cursorEnabled = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Auto-sync')
      .setHeading();

    new Setting(containerEl)
      .setName('Auto-sync interval')
      .setDesc('Automatically sync every X minutes (0 = disabled)')
      .addDropdown(dropdown => dropdown
        .addOption('0', 'Disabled')
        .addOption('5', '5 minutes')
        .addOption('15', '15 minutes')
        .addOption('30', '30 minutes')
        .addOption('60', '1 hour')
        .setValue(String(this.plugin.settings.autoSyncInterval))
        .onChange(async (value) => {
          this.plugin.settings.autoSyncInterval = parseInt(value);
          await this.plugin.saveSettings();
          this.plugin.setupAutoSync();
        }));

    new Setting(containerEl)
      .setName('Manual sync')
      .setHeading();

    new Setting(containerEl)
      .setName('Sync now')
      .setDesc('Manually trigger a sync')
      .addButton(button => button
        .setButtonText('Sync now')
        .setCta()
        .onClick(async () => {
          await this.plugin.runSync();
        }));
  }
}
