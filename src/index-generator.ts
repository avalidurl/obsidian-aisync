/**
 * Index/Dashboard generator for AI Sessions
 * Creates a hub note with stats, recent sessions, and Dataview queries
 */

import { App, TFile } from 'obsidian';
import { ToolType, TOOL_CONFIGS } from './types';

interface IndexStats {
  totalSessions: number;
  byTool: Record<string, number>;
  recentSessions: Array<{ path: string; title: string; date: string; tool: string }>;
}

export class IndexGenerator {
  private app: App;
  private outputFolder: string;

  constructor(app: App, outputFolder: string) {
    this.app = app;
    this.outputFolder = outputFolder;
  }

  /**
   * Generate or update the index file
   */
  async generate(): Promise<void> {
    const stats = this.gatherStats();
    const content = this.generateContent(stats);
    const indexPath = `${this.outputFolder}/_index.md`;

    const existingFile = this.app.vault.getAbstractFileByPath(indexPath);
    if (existingFile instanceof TFile) {
      await this.app.vault.modify(existingFile, content);
    } else {
      await this.app.vault.create(indexPath, content);
    }
  }

  /**
   * Gather statistics from synced sessions
   */
  private gatherStats(): IndexStats {
    const files = this.app.vault.getFiles().filter(f =>
      f.path.startsWith(this.outputFolder) &&
      f.extension === 'md' &&
      !f.name.startsWith('_')
    );

    const byTool: Record<string, number> = {};
    const recentSessions: IndexStats['recentSessions'] = [];

    // Initialize tool counts
    for (const config of TOOL_CONFIGS) {
      byTool[config.name] = 0;
    }

    for (const file of files) {
      // Determine tool from path or filename
      const toolMatch = file.path.match(/(claude-code|cursor|copilot|codex|opencode|aider|cline|gemini|continue|roo|windsurf|zed|amp)/i);
      if (toolMatch) {
        const toolKey = this.normalizeToolName(toolMatch[1]);
        byTool[toolKey] = (byTool[toolKey] || 0) + 1;
      }

      // Collect recent sessions (last 10 by mtime)
      recentSessions.push({
        path: file.path,
        title: file.basename,
        date: new Date(file.stat.mtime).toISOString().split('T')[0],
        tool: toolMatch ? toolMatch[1] : 'unknown'
      });
    }

    // Sort by date descending and take top 10
    recentSessions.sort((a, b) => b.date.localeCompare(a.date));
    const recent = recentSessions.slice(0, 10);

    return {
      totalSessions: files.length,
      byTool,
      recentSessions: recent
    };
  }

  /**
   * Normalize tool name for display
   */
  private normalizeToolName(tool: string): string {
    const mapping: Record<string, string> = {
      'claude-code': 'Claude Code',
      'cursor': 'Cursor',
      'copilot': 'GitHub Copilot',
      'codex': 'Codex CLI',
      'opencode': 'OpenCode',
      'aider': 'Aider',
      'cline': 'Cline',
      'gemini': 'Gemini CLI',
      'continue': 'Continue',
      'roo': 'Roo Code',
      'windsurf': 'Windsurf',
      'zed': 'Zed AI',
      'amp': 'Amp'
    };
    return mapping[tool.toLowerCase()] || tool;
  }

  /**
   * Generate markdown content for index
   */
  private generateContent(stats: IndexStats): string {
    const now = new Date().toISOString();

    let md = `---
type: ai-sessions-index
updated: ${now}
total_sessions: ${stats.totalSessions}
---

# 🤖 AI Sessions Dashboard

> Auto-generated index of all AI coding sessions. Updated on each sync.

## 📊 Overview

| Metric | Value |
|--------|-------|
| **Total Sessions** | ${stats.totalSessions} |
| **Last Updated** | ${new Date().toLocaleString()} |

## 🛠️ Sessions by Tool

| Tool | Sessions |
|------|----------|
`;

    // Add tool counts (sorted by count descending)
    const toolEntries = Object.entries(stats.byTool)
      .filter(([_, count]) => count > 0)
      .sort((a, b) => b[1] - a[1]);

    for (const [tool, count] of toolEntries) {
      const icon = this.getToolIcon(tool);
      md += `| ${icon} ${tool} | ${count} |\n`;
    }

    if (toolEntries.length === 0) {
      md += `| *No sessions yet* | - |\n`;
    }

    md += `
## 🕐 Recent Sessions

`;

    if (stats.recentSessions.length > 0) {
      for (const session of stats.recentSessions) {
        const icon = this.getToolIcon(session.tool);
        md += `- ${icon} [[${session.path}|${session.title}]] *(${session.date})*\n`;
      }
    } else {
      md += `*No sessions synced yet. Click "Sync Now" in settings to get started.*\n`;
    }

    md += `
## 🔍 Quick Queries

### All Sessions This Week
\`\`\`dataview
TABLE tool, date, message_count as "Messages"
FROM "${this.outputFolder}"
WHERE type = "ai-session" AND date >= date(today) - dur(7 days)
SORT date DESC
\`\`\`

### Sessions by Project
\`\`\`dataview
TABLE length(rows) as "Sessions", sum(rows.message_count) as "Total Messages"
FROM "${this.outputFolder}"
WHERE type = "ai-session"
GROUP BY project
SORT length(rows) DESC
\`\`\`

### Most Active Tools
\`\`\`dataview
TABLE length(rows) as "Sessions"
FROM "${this.outputFolder}"
WHERE type = "ai-session"
GROUP BY tool
SORT length(rows) DESC
\`\`\`

---

*🔌 Generated by [AI Sessions Sync](https://github.com/avalidurl/obsidian-aisync) v2.0*
`;

    return md;
  }

  /**
   * Get emoji icon for tool
   */
  private getToolIcon(tool: string): string {
    const icons: Record<string, string> = {
      'Claude Code': '🤖',
      'Cursor': '🖱️',
      'GitHub Copilot': '🐙',
      'Codex CLI': '💻',
      'OpenCode': '⚡',
      'Aider': '🔧',
      'Cline': '📟',
      'Gemini CLI': '♊',
      'Continue': '▶️',
      'Roo Code': '🦘',
      'Windsurf': '🏄',
      'Zed AI': '⚡',
      'Amp': '🔊'
    };
    return icons[tool] || '📄';
  }
}
