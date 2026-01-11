/**
 * Cursor adapter - extends BaseAdapter for transcript parsing
 */

import { App } from 'obsidian';
import { BaseAdapter, AdapterOptions } from '../base-adapter';
import { ParsedSession, Message, ToolType } from '../../types';
import { findTranscriptFiles } from '../utils';
import * as fs from 'fs';
import * as path from 'path';

export class CursorAdapter extends BaseAdapter {
  readonly toolType: ToolType = 'cursor';
  readonly toolName = 'Cursor';
  readonly toolIcon = '🖱️';

  constructor(app: App, homeDir: string, outputFolder: string, options: AdapterOptions = {}) {
    super(app, homeDir, outputFolder, options);
  }

  async discoverSessions(): Promise<ParsedSession[]> {
    const cursorDir = path.join(this.homeDir, '.cursor', 'projects');
    if (!fs.existsSync(cursorDir)) return [];

    const sessions: ParsedSession[] = [];
    const transcriptFiles = findTranscriptFiles(cursorDir);

    for (const filePath of transcriptFiles) {
      try {
        const session = this.parseTranscript(filePath);
        if (session) sessions.push(session);
      } catch (e) {
        console.error(`[Cursor] Error parsing ${filePath}:`, e);
      }
    }

    return sessions;
  }

  private parseTranscript(filePath: string): ParsedSession | null {
    const content = fs.readFileSync(filePath, 'utf-8');
    const stat = fs.statSync(filePath);
    const createdAt = stat.birthtime?.getTime() > 0 ? stat.birthtime : stat.mtime;

    // Extract project from path: .cursor/projects/{encoded-project}/agent-transcripts/...
    const project = this.extractProjectFromCursorPath(filePath);
    const messages: Message[] = [];

    // Parse transcript format: "user:\n...\n\nassistant:\n..."
    const parts = content.split(/\n(?=user:)|(?<=\n)\n(?=assistant:)/);

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith('user:')) {
        let text = trimmed.slice(5).trim();
        // Extract user_query from system context
        if (text.includes('<user_query>')) {
          const match = text.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/);
          if (match) text = match[1].trim();
          else if (text.startsWith('<')) continue;
        }
        if (text && text.length > 2) {
          messages.push({ role: 'user', content: text });
        }
      } else if (trimmed.startsWith('assistant:')) {
        let text = trimmed.replace(/^assistant:/, '').trim();
        // Clean up tool calls for readability
        text = text
          .replace(/\[Thinking\]([\s\S]*?)(?=\[Tool|\n\n|$)/g, (_, thinking: string) =>
            `> 💭 **Thinking:** ${thinking.trim().slice(0, 300)}...\n\n`)
          .replace(/\[Tool call\]\s*(\w+)/g, '**🔧 Tool:** `$1`')
          .replace(/\[Tool result\]\s*(\w+)/g, '**📤 Result:** `$1`');

        if (text && text.length > 2) {
          messages.push({ role: 'assistant', content: text });
        }
      }
    }

    if (messages.length === 0) return null;

    return {
      meta: {
        sessionId: path.basename(filePath, '.txt').slice(0, 12),
        date: createdAt.toISOString().split('T')[0],
        time: createdAt.toTimeString().slice(0, 5),
        tool: this.toolType,
        project,
        messageCount: messages.length
      },
      messages,
      sourceFile: filePath,
      sourceMtime: stat.mtime.getTime()
    };
  }

  private extractProjectFromCursorPath(filePath: string): string {
    const parts = filePath.split(path.sep);
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === 'projects' && i + 1 < parts.length) {
        return parts[i + 1]
          .replace(/^Users-[^-]+-/, '')
          .replace(/-/g, '/');
      }
    }
    return 'unknown';
  }
}
