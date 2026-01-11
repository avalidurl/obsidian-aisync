/**
 * AI Sync Plugin v2.0
 * Syncs AI coding sessions from 5 core tools to Obsidian
 */

import { App, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { AISyncSettings, DEFAULT_SETTINGS, ToolType, DetectedTool } from './types';
import { detectInstalledTools, getEnabledTools } from './settings/detection';
import { ClaudeAdapter } from './sync/adapters/claude';
import { CursorAdapter } from './sync/adapters/cursor';
import { CopilotAdapter } from './sync/adapters/copilot';
import { CodexAdapter } from './sync/adapters/codex';
import { OpenCodeAdapter } from './sync/adapters/opencode';
import { BaseAdapter } from './sync/base-adapter';
import { IndexGenerator } from './index-generator';
import * as os from 'os';

export default class AISyncPlugin extends Plugin {
  settings: AISyncSettings;
  detectedTools: DetectedTool[] = [];
  autoSyncIntervalId: number | null = null;
  statusBarItem: HTMLElement | null = null;

  async onload() {
    await this.loadSettings();

    // Detect installed tools on load
    this.detectedTools = detectInstalledTools(os.homedir());

    // Auto-enable detected tools if enabledTools is empty (first run)
    if (this.settings.enabledTools.length === 0) {
      this.settings.enabledTools = this.detectedTools
        .filter(t => t.installed)
        .map(t => t.type);
      await this.saveSettings();
    }

    // Add ribbon icon
    this.addRibbonIcon('refresh-cw', 'Sync AI sessions', async () => {
      await this.runSync();
    });

    // Add commands
    this.addCommand({
      id: 'sync-ai-sessions',
      name: 'Sync AI sessions now',
      callback: () => void this.runSync()
    });

    this.addCommand({
      id: 'detect-ai-tools',
      name: 'Re-detect installed AI tools',
      callback: () => {
        this.detectedTools = detectInstalledTools(os.homedir());
        const installed = this.detectedTools.filter(t => t.installed);
        new Notice(`🔍 Found ${installed.length} AI tools: ${installed.map(t => t.name).join(', ')}`);
      }
    });

    this.addCommand({
      id: 'regenerate-index',
      name: 'Regenerate sessions index',
      callback: async () => {
        const generator = new IndexGenerator(this.app, this.settings.outputFolder);
        await generator.generate();
        new Notice('📋 Index regenerated');
      }
    });

    // Add settings tab
    this.addSettingTab(new AISyncSettingTab(this.app, this));

    // Setup auto-sync
    this.setupAutoSync();

    // Status bar
    this.statusBarItem = this.addStatusBarItem();
    this.updateStatusBar();
  }

  updateStatusBar() {
    if (this.statusBarItem) {
      const text = this.settings.lastSync ? `AI Sync: ${this.settings.lastSync}` : 'AI Sync: Never';
      this.statusBarItem.setText(text);
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

  /**
   * Create adapter instance for a tool type
   */
  private createAdapter(toolType: ToolType): BaseAdapter {
    const homeDir = os.homedir();
    const options = {
      organizationMode: this.settings.organizationMode,
      minimumMessages: this.settings.minimumMessages,
      includeSubagents: this.settings.includeSubagents
    };

    switch (toolType) {
      case 'claude-code':
        return new ClaudeAdapter(this.app, homeDir, this.settings.outputFolder, options);
      case 'cursor':
        return new CursorAdapter(this.app, homeDir, this.settings.outputFolder, options);
      case 'copilot':
        return new CopilotAdapter(this.app, homeDir, this.settings.outputFolder, options);
      case 'codex':
        return new CodexAdapter(this.app, homeDir, this.settings.outputFolder, options);
      case 'opencode':
        return new OpenCodeAdapter(this.app, homeDir, this.settings.outputFolder, options);
      default:
        throw new Error(`Unknown tool type: ${toolType}`);
    }
  }

  async runSync(silent = false) {
    let totalSynced = 0;
    const errors: string[] = [];
    const results: Array<{ tool: string; count: number }> = [];

    if (!silent) {
      new Notice('🔄 Syncing AI sessions...');
    }

    try {
      // Ensure base output folder exists
      await this.ensureFolder(this.settings.outputFolder);

      // Get enabled tools
      const enabledTools = getEnabledTools(this.detectedTools, this.settings.enabledTools);

      // Sync each enabled tool
      for (const tool of enabledTools) {
        try {
          const adapter = this.createAdapter(tool.type);
          const count = await adapter.sync();
          totalSynced += count;
          if (count > 0) {
            results.push({ tool: tool.name, count });
          }
        } catch (e) {
          errors.push(`${tool.name}: ${e}`);
          console.error(`[AI Sync] Error syncing ${tool.name}:`, e);
        }
      }

      // Update last sync time
      this.settings.lastSync = new Date().toLocaleTimeString();
      await this.saveSettings();
      this.updateStatusBar();

      // Regenerate index
      try {
        const generator = new IndexGenerator(this.app, this.settings.outputFolder);
        await generator.generate();
      } catch (e) {
        console.error('[AI Sync] Index generation failed:', e);
      }

      // Show results
      if (!silent || totalSynced > 0) {
        if (errors.length > 0) {
          new Notice(`⚠️ Synced ${totalSynced} sessions with ${errors.length} errors`);
        } else if (totalSynced > 0) {
          const breakdown = results.map(r => `${r.tool}: ${r.count}`).join(', ');
          new Notice(`✅ Synced ${totalSynced} sessions (${breakdown})`);
        } else if (!silent) {
          new Notice('✅ All sessions up to date');
        }
      }
    } catch (e) {
      new Notice(`❌ Sync failed: ${e}`);
      console.error('[AI Sync] Sync failed:', e);
    }
  }

  async ensureFolder(folderPath: string) {
    const parts = folderPath.split('/');
    let currentPath = '';

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const folder = this.app.vault.getAbstractFileByPath(currentPath);
      if (!folder) {
        try {
          await this.app.vault.createFolder(currentPath);
        } catch { /* folder may exist */ }
      }
    }
  }
}

/**
 * Settings Tab - Clean, detection-first UI
 */
class AISyncSettingTab extends PluginSettingTab {
  plugin: AISyncPlugin;

  constructor(app: App, plugin: AISyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // Header
    new Setting(containerEl)
      .setName('AI Sessions Sync')
      .setDesc('Sync coding sessions from AI tools to Obsidian')
      .setHeading();

    // Detected Tools Section
    new Setting(containerEl)
      .setName('Detected Tools')
      .setDesc('Tools found on your system')
      .setHeading();

    for (const tool of this.plugin.detectedTools) {
      const desc = tool.installed
        ? `${tool.sessionCount} session${tool.sessionCount !== 1 ? 's' : ''} found`
        : 'Not installed';

      const setting = new Setting(containerEl)
        .setName(`${tool.icon} ${tool.name}`)
        .setDesc(desc);

      if (tool.installed) {
        setting.addToggle(toggle => toggle
          .setValue(this.plugin.settings.enabledTools.includes(tool.type))
          .onChange(async (enabled) => {
            if (enabled) {
              if (!this.plugin.settings.enabledTools.includes(tool.type)) {
                this.plugin.settings.enabledTools.push(tool.type);
              }
            } else {
              this.plugin.settings.enabledTools = this.plugin.settings.enabledTools.filter(t => t !== tool.type);
            }
            await this.plugin.saveSettings();
          }));
      } else {
        setting.setClass('mod-disabled');
      }
    }

    // Output Settings
    new Setting(containerEl)
      .setName('Output')
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
      .setName('Organization mode')
      .setDesc('How to organize synced sessions')
      .addDropdown(dropdown => dropdown
        .addOption('flat', 'Flat (by tool)')
        .addOption('by-project', 'By project')
        .addOption('by-tool', 'By tool then project')
        .setValue(this.plugin.settings.organizationMode)
        .onChange(async (value) => {
          this.plugin.settings.organizationMode = value as 'flat' | 'by-project' | 'by-tool';
          await this.plugin.saveSettings();
        }));

    // Filtering
    new Setting(containerEl)
      .setName('Filtering')
      .setHeading();

    new Setting(containerEl)
      .setName('Minimum messages')
      .setDesc('Skip sessions with fewer messages (filter trivial sessions)')
      .addSlider(slider => slider
        .setLimits(1, 10, 1)
        .setValue(this.plugin.settings.minimumMessages)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.minimumMessages = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Include subagent sessions')
      .setDesc('Include Claude Code subagent sessions (automated sub-tasks spawned by main sessions)')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.includeSubagents)
        .onChange(async (value) => {
          this.plugin.settings.includeSubagents = value;
          await this.plugin.saveSettings();
        }));

    // Auto-sync
    new Setting(containerEl)
      .setName('Auto-sync')
      .setHeading();

    new Setting(containerEl)
      .setName('Auto-sync interval (minutes)')
      .setDesc('Automatically sync every X minutes (0 = disabled)')
      .addText(text => text
        .setPlaceholder('0')
        .setValue(String(this.plugin.settings.autoSyncInterval))
        .onChange(async (value) => {
          const num = parseInt(value) || 0;
          this.plugin.settings.autoSyncInterval = num <= 0 ? 0 : Math.min(Math.max(num, 1), 1440);
          await this.plugin.saveSettings();
          this.plugin.setupAutoSync();
        }));

    // Actions
    new Setting(containerEl)
      .setName('Actions')
      .setHeading();

    const enabledCount = this.plugin.settings.enabledTools.length;

    new Setting(containerEl)
      .setName('Sync now')
      .setDesc(`Sync sessions from ${enabledCount} enabled tool${enabledCount !== 1 ? 's' : ''}`)
      .addButton(button => button
        .setButtonText('Sync Now')
        .setCta()
        .onClick(async () => {
          await this.plugin.runSync();
        }));

    new Setting(containerEl)
      .setName('Re-detect tools')
      .setDesc('Scan for newly installed AI tools')
      .addButton(button => button
        .setButtonText('Detect')
        .onClick(() => {
          this.plugin.detectedTools = detectInstalledTools(os.homedir());
          new Notice(`🔍 Detection complete`);
          this.display(); // Refresh UI
        }));
  }
}
