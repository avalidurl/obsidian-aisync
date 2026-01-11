/**
 * OpenCode adapter - extends BaseAdapter for SQLite database parsing
 */

import { App } from 'obsidian';
import { BaseAdapter, AdapterOptions } from '../base-adapter';
import { ParsedSession, Message, ToolType } from '../../types';
import * as fs from 'fs';
import * as path from 'path';

interface OpenCodeSession {
  id: string;
  title: string;
  message_count: number;
  created_at: number;
}

interface OpenCodeMessage {
  role: string;
  parts: string;
  model: string | null;
}

export class OpenCodeAdapter extends BaseAdapter {
  readonly toolType: ToolType = 'opencode';
  readonly toolName = 'OpenCode';
  readonly toolIcon = '⚡';

  constructor(app: App, homeDir: string, outputFolder: string, options: AdapterOptions = {}) {
    super(app, homeDir, outputFolder, options);
  }

  async discoverSessions(): Promise<ParsedSession[]> {
    const searchDirs = [
      path.join(this.homeDir, 'Documents'),
      path.join(this.homeDir, 'Projects'),
      path.join(this.homeDir, 'Code'),
      path.join(this.homeDir, 'Developer'),
      path.join(this.homeDir, 'GitHub'),
      path.join(this.homeDir, 'dev'),
      this.homeDir,
    ];

    const dbFiles = this.findOpenCodeDatabases(searchDirs);
    if (dbFiles.length === 0) return [];

    const sessions: ParsedSession[] = [];

    for (const dbFile of dbFiles) {
      try {
        const projectPath = path.dirname(path.dirname(dbFile));
        const projectName = path.basename(projectPath) || 'global';
        const dbSessions = await this.parseDatabase(dbFile, projectName);
        sessions.push(...dbSessions);
      } catch (e) {
        console.error(`[OpenCode] Error parsing ${dbFile}:`, e);
      }
    }

    return sessions;
  }

  private findOpenCodeDatabases(searchDirs: string[]): string[] {
    const dbFiles: string[] = [];

    const walkDir = (currentDir: string, depth = 0) => {
      if (depth > 5) return;
      try {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name === '.opencode') {
              const dbPath = path.join(fullPath, 'opencode.db');
              if (fs.existsSync(dbPath)) dbFiles.push(dbPath);
            } else if (!entry.name.startsWith('.') && !['node_modules', 'vendor', 'dist', 'build'].includes(entry.name)) {
              walkDir(fullPath, depth + 1);
            }
          }
        }
      } catch { /* skip */ }
    };

    for (const dir of searchDirs) {
      if (fs.existsSync(dir)) {
        const directDb = path.join(dir, '.opencode', 'opencode.db');
        if (fs.existsSync(directDb) && !dbFiles.includes(directDb)) dbFiles.push(directDb);
        walkDir(dir);
      }
    }

    return [...new Set(dbFiles)];
  }

  private async parseDatabase(dbPath: string, projectName: string): Promise<ParsedSession[]> {
    const results: ParsedSession[] = [];
    const stat = fs.statSync(dbPath);

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Database = require('better-sqlite3');
      const db = new Database(dbPath, { readonly: true });

      try {
        const sessions = db.prepare(`
          SELECT id, title, message_count, created_at FROM sessions ORDER BY created_at DESC
        `).all() as OpenCodeSession[];

        for (const session of sessions) {
          const dbMessages = db.prepare(`
            SELECT role, parts, model FROM messages WHERE session_id = ? ORDER BY created_at ASC
          `).all(session.id) as OpenCodeMessage[];

          if (dbMessages.length === 0) continue;

          const messages: Message[] = [];
          let model = '';

          for (const msg of dbMessages) {
            if (msg.model) model = msg.model;
            const content = this.parseMessageParts(msg.parts);
            if (!content) continue;

            if (msg.role === 'user' || msg.role === 'assistant') {
              messages.push({ role: msg.role as 'user' | 'assistant', content });
            }
          }

          if (messages.length === 0) continue;

          const createdAt = new Date(session.created_at);
          results.push({
            meta: {
              sessionId: session.id.slice(0, 12),
              date: createdAt.toISOString().split('T')[0],
              time: createdAt.toTimeString().slice(0, 5),
              tool: this.toolType,
              project: projectName,
              title: session.title || 'Untitled Session',
              model,
              messageCount: messages.length
            },
            messages,
            sourceFile: dbPath,
            sourceMtime: stat.mtime.getTime()
          });
        }
      } finally {
        db.close();
      }
    } catch {
      // Fallback: extract from raw SQLite file
      const fallback = this.parseDatabaseFallback(dbPath, projectName, stat.mtime.getTime());
      results.push(...fallback);
    }

    return results;
  }

  private parseMessageParts(partsJson: string): string {
    try {
      const parts = JSON.parse(partsJson);
      if (!Array.isArray(parts)) return '';

      const textParts: string[] = [];
      for (const part of parts) {
        if (typeof part === 'string') {
          textParts.push(part);
        } else if (part?.type === 'text' && part.text) {
          textParts.push(part.text);
        } else if (part?.type === 'tool_use' || part?.type === 'tool-invocation') {
          const toolName = part.name || part.toolName || 'tool';
          textParts.push(`**🔧 Tool: ${toolName}**`);
          if (part.input || part.args) {
            textParts.push(`\`\`\`\n${JSON.stringify(part.input || part.args, null, 2).slice(0, 500)}\n\`\`\``);
          }
        } else if (part?.type === 'tool_result' || part?.type === 'tool-result') {
          const result = typeof part.output === 'string' ? part.output.slice(0, 1000) : JSON.stringify(part.output || part.result).slice(0, 1000);
          textParts.push(`**📤 Result:**\n\`\`\`\n${result}\n\`\`\``);
        } else if (part?.content) {
          textParts.push(typeof part.content === 'string' ? part.content : JSON.stringify(part.content));
        }
      }
      return textParts.join('\n\n');
    } catch {
      return partsJson;
    }
  }

  private parseDatabaseFallback(dbPath: string, projectName: string, mtime: number): ParsedSession[] {
    // Basic extraction from raw SQLite when better-sqlite3 unavailable
    try {
      const content = fs.readFileSync(dbPath).toString('utf-8');
      const sessionMatches = content.matchAll(/\{"id":"([^"]+)","title":"([^"]*)"/g);

      for (const match of sessionMatches) {
        const [, id, title] = match;
        return [{
          meta: {
            sessionId: id.slice(0, 12),
            date: new Date().toISOString().split('T')[0],
            time: new Date().toTimeString().slice(0, 5),
            tool: this.toolType,
            project: projectName,
            title: title || 'Extracted Session',
            messageCount: 0
          },
          messages: [],
          sourceFile: dbPath,
          sourceMtime: mtime
        }];
      }
    } catch { /* ignore */ }
    return [];
  }
}
