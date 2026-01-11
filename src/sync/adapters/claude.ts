/**
 * Claude Code adapter - extends BaseAdapter for JSONL parsing
 */

import { App } from 'obsidian';
import { BaseAdapter, AdapterOptions } from '../base-adapter';
import { ParsedSession, Message, ToolType } from '../../types';
import { findJsonlFiles } from '../utils';
import * as fs from 'fs';
import * as path from 'path';

export class ClaudeAdapter extends BaseAdapter {
  readonly toolType: ToolType = 'claude-code';
  readonly toolName = 'Claude Code';
  readonly toolIcon = '🤖';

  constructor(app: App, homeDir: string, outputFolder: string, options: AdapterOptions = {}) {
    super(app, homeDir, outputFolder, options);
  }

  async discoverSessions(): Promise<ParsedSession[]> {
    const claudeDir = path.join(this.homeDir, '.claude', 'projects');
    if (!fs.existsSync(claudeDir)) return [];

    const sessions: ParsedSession[] = [];
    let jsonlFiles = findJsonlFiles(claudeDir);

    // Filter out subagent files unless includeSubagents is true
    if (!this.includeSubagents) {
      jsonlFiles = jsonlFiles.filter(f => !f.includes('/subagents/') && !f.includes('\\subagents\\'));
    }

    for (const filePath of jsonlFiles) {
      try {
        const session = this.parseJsonlFile(filePath);
        if (session) sessions.push(session);
      } catch (e) {
        console.error(`[Claude] Error parsing ${filePath}:`, e);
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
    let model = '';

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.sessionId) sessionId = entry.sessionId.slice(0, 12);
        if (entry.cwd) workingDir = entry.cwd;
        if (entry.model) model = entry.model;

        const msgContent = entry.message?.content;
        if (entry.type === 'user' && msgContent) {
          const text = this.extractText(msgContent);
          if (text && !text.startsWith('<environment_context')) {
            messages.push({ role: 'user', content: text });
          }
        } else if (entry.type === 'assistant' && msgContent) {
          const text = this.extractText(msgContent);
          if (text) messages.push({ role: 'assistant', content: text });
        }
      } catch { /* skip invalid lines */ }
    }

    if (messages.length === 0) return null;

    // Mark if this is a subagent session
    const isSubagent = filePath.includes('/subagents/') || filePath.includes('\\subagents\\');

    return {
      meta: {
        sessionId,
        date: createdAt.toISOString().split('T')[0],
        time: createdAt.toTimeString().slice(0, 5),
        tool: this.toolType,
        project: this.extractProjectFromPath(workingDir),
        workingDir,
        model,
        title: isSubagent ? `[Subagent] ${sessionId}` : undefined,
        messageCount: messages.length
      },
      messages,
      sourceFile: filePath,
      sourceMtime: stat.mtime.getTime()
    };
  }

  private extractText(content: unknown): string {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';

    const parts: string[] = [];
    for (const item of content) {
      if (typeof item === 'string') {
        parts.push(item);
      } else if (item?.type === 'text' && item.text) {
        parts.push(item.text);
      } else if (item?.type === 'tool_use') {
        parts.push(`**🔧 Tool: ${item.name || 'tool'}**`);
        if (item.input) {
          const input = typeof item.input === 'string' ? item.input : JSON.stringify(item.input, null, 2).slice(0, 500);
          parts.push(`\`\`\`\n${input}\n\`\`\``);
        }
      } else if (item?.type === 'tool_result' && item.content) {
        const result = typeof item.content === 'string' ? item.content : JSON.stringify(item.content).slice(0, 1000);
        parts.push(`**📤 Result:**\n\`\`\`\n${result}\n\`\`\``);
      }
    }
    return parts.join('\n\n');
  }
}
