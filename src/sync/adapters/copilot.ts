/**
 * GitHub Copilot Chat adapter - extends BaseAdapter for JSON parsing
 */

import { App } from 'obsidian';
import { BaseAdapter } from '../base-adapter';
import { ParsedSession, Message, ToolType, OrganizationMode } from '../../types';
import * as fs from 'fs';
import * as path from 'path';

export class CopilotAdapter extends BaseAdapter {
  readonly toolType: ToolType = 'copilot';
  readonly toolName = 'GitHub Copilot';
  readonly toolIcon = '🐙';

  constructor(app: App, homeDir: string, outputFolder: string, organizationMode: OrganizationMode = 'flat', minimumMessages = 3) {
    super(app, homeDir, outputFolder, organizationMode, minimumMessages);
  }

  async discoverSessions(): Promise<ParsedSession[]> {
    const copilotPaths = [
      path.join(this.homeDir, 'Library/Application Support/Code/User/globalStorage/github.copilot-chat'),
      path.join(this.homeDir, 'Library/Application Support/Cursor/User/globalStorage/github.copilot-chat'),
      path.join(this.homeDir, '.config/Code/User/globalStorage/github.copilot-chat'),
      path.join(this.homeDir, 'AppData/Roaming/Code/User/globalStorage/github.copilot-chat'),
    ];

    const sessions: ParsedSession[] = [];

    for (const copilotPath of copilotPaths) {
      if (!fs.existsSync(copilotPath)) continue;

      const sessionFiles = this.findChatSessions(copilotPath);
      for (const filePath of sessionFiles) {
        try {
          const session = this.parseSession(filePath);
          if (session) sessions.push(session);
        } catch (e) {
          console.error(`[Copilot] Error parsing ${filePath}:`, e);
        }
      }
    }

    return sessions;
  }

  private findChatSessions(copilotPath: string): string[] {
    const sessions: string[] = [];

    const findRecursive = (dir: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isFile() && entry.name.endsWith('.json')) {
            if (entry.name.includes('chat') || entry.name.includes('session') || entry.name.includes('conversation')) {
              sessions.push(fullPath);
            }
          } else if (entry.isDirectory()) {
            findRecursive(fullPath);
          }
        }
      } catch { /* skip */ }
    };

    findRecursive(copilotPath);
    return sessions;
  }

  private parseSession(filePath: string): ParsedSession | null {
    let data: unknown;
    try {
      data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch { return null; }

    const messages: Message[] = [];
    let conversations: unknown[] = [];

    if (Array.isArray(data)) {
      conversations = data;
    } else if (typeof data === 'object' && data !== null) {
      const d = data as Record<string, unknown>;
      conversations = (d.conversations as unknown[]) || (d.messages as unknown[]) || [data];
    }

    for (const conv of conversations) {
      if (typeof conv !== 'object' || conv === null) continue;
      const c = conv as Record<string, unknown>;
      const msgs = (c.messages as unknown[]) || (c.history as unknown[]) || [];

      for (const msg of msgs) {
        if (typeof msg !== 'object' || msg === null) continue;
        const m = msg as Record<string, unknown>;
        const role = (m.role as string) || (m.author as string) || 'unknown';
        const content = (m.content as string) || (m.text as string) || (m.message as string) || '';

        if (content) {
          messages.push({
            role: role === 'user' || role === 'human' ? 'user' : 'assistant',
            content: String(content)
          });
        }
      }
    }

    if (messages.length === 0) return null;

    const stat = fs.statSync(filePath);
    const dt = new Date(stat.mtime);

    return {
      meta: {
        sessionId: path.basename(filePath, '.json').slice(0, 12),
        date: dt.toISOString().split('T')[0],
        time: dt.toTimeString().slice(0, 5),
        tool: this.toolType,
        messageCount: messages.length
      },
      messages,
      sourceFile: filePath,
      sourceMtime: stat.mtime.getTime()
    };
  }
}
