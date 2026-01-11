/**
 * Codex CLI adapter - extends BaseAdapter for JSONL parsing
 */

import { App } from 'obsidian';
import { BaseAdapter, AdapterOptions } from '../base-adapter';
import { ParsedSession, Message, ToolType } from '../../types';
import { findJsonlFiles } from '../utils';
import * as fs from 'fs';
import * as path from 'path';

export class CodexAdapter extends BaseAdapter {
  readonly toolType: ToolType = 'codex';
  readonly toolName = 'Codex CLI';
  readonly toolIcon = '💻';

  constructor(app: App, homeDir: string, outputFolder: string, options: AdapterOptions = {}) {
    super(app, homeDir, outputFolder, options);
  }

  async discoverSessions(): Promise<ParsedSession[]> {
    const codexDir = path.join(this.homeDir, '.codex', 'sessions');
    if (!fs.existsSync(codexDir)) return [];

    const sessions: ParsedSession[] = [];
    const jsonlFiles = findJsonlFiles(codexDir);

    for (const filePath of jsonlFiles) {
      try {
        const session = this.parseJsonlFile(filePath);
        if (session) sessions.push(session);
      } catch (e) {
        console.error(`[Codex] Error parsing ${filePath}:`, e);
      }
    }

    return sessions;
  }

  private parseJsonlFile(filePath: string): ParsedSession | null {
    const content = fs.readFileSync(filePath, 'utf-8');
    const stat = fs.statSync(filePath);
    const lines = content.split('\n').filter(l => l.trim());
    const createdAt = stat.birthtime?.getTime() > 0 ? stat.birthtime : stat.mtime;

    const messages: Message[] = [];
    let sessionId = path.basename(filePath, '.jsonl').slice(0, 12);
    let workingDir = '';
    let version = '';

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        const entryType = entry.type || '';

        // Extract session metadata
        if (entryType === 'session_meta') {
          const payload = entry.payload || {};
          if (payload.id) sessionId = payload.id.slice(0, 12);
          if (payload.cwd) workingDir = payload.cwd;
          if (payload.cli_version) version = payload.cli_version;
          if (payload.timestamp) {
            try {
              const dt = new Date(payload.timestamp);
              // Update date/time from payload
            } catch { /* ignore */ }
          }
        }

        // Extract messages from response_item
        if (entryType === 'response_item') {
          const contentArr = entry.payload?.content;
          if (Array.isArray(contentArr)) {
            for (const item of contentArr) {
              if (!item || typeof item !== 'object') continue;
              const itemType = item.type || '';
              const text = item.text || '';

              if (itemType === 'input_text' && text) {
                if (!text.startsWith('# AGENTS.md') && !text.startsWith('<environment_context')) {
                  messages.push({ role: 'user', content: text });
                }
              } else if (itemType === 'text' && text) {
                messages.push({ role: 'assistant', content: text });
              } else if (itemType === 'tool_use') {
                const toolName = item.name || 'tool';
                let toolText = `**🔧 Tool: ${toolName}**\n`;
                if (item.input) {
                  const inputStr = typeof item.input === 'string' ? item.input : JSON.stringify(item.input, null, 2).slice(0, 500);
                  toolText += `\`\`\`\n${inputStr}\n\`\`\``;
                }
                messages.push({ role: 'tool', content: toolText, toolName });
              } else if (itemType === 'tool_result' && item.output) {
                const output = String(item.output).slice(0, 1000);
                messages.push({ role: 'tool', content: `**📤 Result:**\n\`\`\`\n${output}\n\`\`\``, toolOutput: output });
              }
            }
          }
        }

        // Capture user messages from event_msg
        if (entryType === 'event_msg') {
          const payload = entry.payload || {};
          if (payload.type === 'user_message' && payload.message) {
            const msg = payload.message;
            if (msg && !msg.startsWith('#') && !msg.startsWith('<')) {
              messages.push({ role: 'user', content: msg });
            }
          }
        }
      } catch { /* skip invalid lines */ }
    }

    if (messages.length === 0) return null;

    return {
      meta: {
        sessionId,
        date: createdAt.toISOString().split('T')[0],
        time: createdAt.toTimeString().slice(0, 5),
        tool: this.toolType,
        project: this.extractProjectFromPath(workingDir),
        workingDir,
        version,
        messageCount: messages.length
      },
      messages,
      sourceFile: filePath,
      sourceMtime: stat.mtime.getTime()
    };
  }
}
