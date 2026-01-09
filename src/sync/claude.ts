import { App } from 'obsidian';
import { redactSecrets } from './redact';
import { findJsonlFiles } from './utils';
import * as fs from 'fs';
import * as path from 'path';

interface SessionMeta {
  sessionId: string;
  date: string;
  time: string;
  cwd: string;
  version: string;
}

interface Message {
  role: 'user' | 'assistant' | 'tool' | 'result';
  content: string;
}

interface ContentItem {
  type?: string;
  text?: string;
  name?: string;
  input?: string | Record<string, unknown>;
  content?: string | Record<string, unknown>;
}

export async function syncClaudeCode(app: App, homeDir: string, outputFolder: string): Promise<number> {
  const claudeDir = path.join(homeDir, '.claude', 'projects');
  const outputDir = `${outputFolder}/claude-code-sessions`;
  
  if (!fs.existsSync(claudeDir)) {
    return 0;
  }
  
  let syncedCount = 0;
  const sessionFiles = findJsonlFiles(claudeDir);
  
  for (const sessionFile of sessionFiles) {
    try {
      const { meta, messages } = parseSession(sessionFile);
      
      if (messages.length === 0) continue;
      
      const filename = `claude-code-${meta.date}-${meta.time.replace(':', '')}-${meta.sessionId}.md`;
      const filePath = `${outputDir}/${filename}`;
      
      // Find any existing file with same session ID (handles filename changes)
      const sessionId = meta.sessionId;
      const existingFiles = app.vault.getFiles().filter(f => 
        f.path.startsWith(outputDir) && 
        f.path.includes(sessionId) &&
        f.extension === 'md'
      );
      
      const sourceMtime = fs.statSync(sessionFile).mtime.getTime();
      
      // Check if we need to update
      if (existingFiles.length > 0) {
        // Get the newest existing file
        const newestExisting = existingFiles.sort((a, b) => b.stat.mtime - a.stat.mtime)[0];
        
        // Skip if source hasn't changed since last sync
        if (sourceMtime <= newestExisting.stat.mtime) {
          continue;
        }
        
        // Delete ALL old versions with this session ID
        for (const oldFile of existingFiles) {
          await app.vault.delete(oldFile);
        }
      }
      
      const markdown = generateMarkdown(meta, messages);
      await app.vault.create(filePath, markdown);
      syncedCount++;
    } catch (e) {
      console.error(`Error processing ${sessionFile}:`, e);
    }
  }
  
  return syncedCount;
}

function parseSession(filePath: string): { meta: SessionMeta; messages: Message[] } {
  const content = fs.readFileSync(filePath, 'utf-8');
  const stat = fs.statSync(filePath);
  const lines = content.split('\n').filter(l => l.trim());
  
  // Use birthtime (creation time) for stable filenames, fallback to mtime
  const createdAt = stat.birthtime && stat.birthtime.getTime() > 0 
    ? stat.birthtime 
    : stat.mtime;
  
  const meta: SessionMeta = {
    sessionId: path.basename(filePath, '.jsonl').slice(0, 8),
    date: createdAt.toISOString().split('T')[0],
    time: createdAt.toTimeString().slice(0, 5),
    cwd: '',
    version: ''
  };
  
  const messages: Message[] = [];
  
  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as Record<string, unknown>;
      const entryType = (entry.type as string) || '';
      
      // Extract session metadata
      if (entry.sessionId) {
        meta.sessionId = (entry.sessionId as string).slice(0, 8);
      }
      
      // Prefer timestamp from JSONL data over file birthtime
      if (entry.timestamp) {
        try {
          const dt = new Date(entry.timestamp as string);
          // Only use if it's an earlier timestamp (first message)
          const entryDate = dt.toISOString().split('T')[0];
          if (meta.date > entryDate || meta.date === createdAt.toISOString().split('T')[0]) {
            meta.date = entryDate;
            meta.time = dt.toTimeString().slice(0, 5);
          }
        } catch {
          // Invalid date format - ignore
        }
      }
      
      if (entry.cwd) meta.cwd = entry.cwd as string;
      if (entry.version) meta.version = entry.version as string;
      
      // Extract messages
      const message = (entry.message as Record<string, unknown>) || {};
      const msgContent = message.content;
      
      if (entryType === 'user' && msgContent) {
        const text = extractTextContent(msgContent);
        if (text && !text.startsWith('<environment_context')) {
          messages.push({ role: 'user', content: text });
        }
      } else if (entryType === 'assistant' && msgContent) {
        const text = extractTextContent(msgContent);
        if (text) {
          messages.push({ role: 'assistant', content: text });
        }
      }
    } catch {
      // Invalid JSON line - skip
    }
  }
  
  return { meta, messages };
}

function extractTextContent(content: unknown): string {
  if (typeof content === 'string') return content;
  
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const item of content as ContentItem[]) {
      if (typeof item === 'string') {
        parts.push(item);
      } else if (item && typeof item === 'object') {
        if (item.type === 'text' && item.text) {
          parts.push(item.text);
        } else if (item.type === 'tool_use') {
          const toolName = item.name || 'tool';
          parts.push(`**🔧 Tool: ${toolName}**`);
          if (item.input) {
            const inputStr = typeof item.input === 'string' 
              ? item.input 
              : JSON.stringify(item.input, null, 2).slice(0, 500);
            parts.push(`\`\`\`\n${inputStr}\n\`\`\``);
          }
        } else if (item.type === 'tool_result' && item.content) {
          const result = typeof item.content === 'string' 
            ? item.content 
            : JSON.stringify(item.content).slice(0, 1000);
          parts.push(`**📤 Result:**\n\`\`\`\n${result}\n\`\`\``);
        }
      }
    }
    return parts.join('\n\n');
  }
  
  return '';
}

function generateMarkdown(meta: SessionMeta, messages: Message[]): string {
  const firstUserMsg = messages.find(m => m.role === 'user')?.content.slice(0, 80) || 'Session';
  
  let md = `---
type: claude-code-session
date: ${meta.date}
time: "${meta.time}"
session_id: "${meta.sessionId}"
working_dir: "${meta.cwd}"
tags:
  - claude-code
  - ai-session
  - coding
summary: "${firstUserMsg.replace(/"/g, '\\"')}..."
---

# 🤖 Claude Code Session — ${meta.date} ${meta.time.replace(':', '')}

| Property | Value |
|----------|-------|
| **Date** | ${meta.date} ${meta.time} |
| **Session ID** | \`${meta.sessionId}\` |
| **Working Dir** | \`${meta.cwd}\` |

---

`;

  for (const msg of messages) {
    const content = redactSecrets(msg.content);
    if (msg.role === 'user') {
      md += `## 👤 User\n\n${content}\n\n---\n\n`;
    } else if (msg.role === 'assistant') {
      md += `## 🤖 Claude\n\n${content}\n\n---\n\n`;
    }
  }

  const syncTime = new Date().toISOString();
  md += `\n---\n*🔌 Synced via Obsidian Plugin at ${syncTime} — secrets redacted*\n`;
  
  return md;
}
