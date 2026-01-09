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
  output?: string;
}

export async function syncCodex(app: App, homeDir: string, outputFolder: string): Promise<number> {
  const codexDir = path.join(homeDir, '.codex', 'sessions');
  const outputDir = `${outputFolder}/codex-sessions`;
  
  if (!fs.existsSync(codexDir)) {
    return 0;
  }
  
  let syncedCount = 0;
  const sessionFiles = findJsonlFiles(codexDir);
  
  for (const sessionFile of sessionFiles) {
    try {
      const { meta, messages } = parseSession(sessionFile);
      
      if (messages.length === 0) continue;
      
      const filename = `codex-${meta.date}-${meta.time.replace(':', '')}-${meta.sessionId}.md`;
      const filePath = `${outputDir}/${filename}`;
      
      // Check if already synced AND source hasn't been modified
      // This ensures continuing sessions get updated with new messages
      const existingFile = app.vault.getAbstractFileByPath(filePath);
      if (existingFile) {
        const sourceMtime = fs.statSync(sessionFile).mtime.getTime();
        const outputStat = await app.vault.adapter.stat(filePath);
        if (outputStat && sourceMtime <= outputStat.mtime) {
          continue; // Skip - no changes since last sync
        }
        // Source was modified - delete old note to re-sync
        await app.vault.delete(existingFile);
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
  const lines = content.split('\n').filter(l => l.trim());
  
  const meta: SessionMeta = {
    sessionId: path.basename(filePath, '.jsonl').slice(0, 8),
    date: 'unknown',
    time: '00:00',
    cwd: '',
    version: ''
  };
  
  const messages: Message[] = [];
  
  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as Record<string, unknown>;
      const entryType = (entry.type as string) || '';
      
      // Extract session metadata from session_meta type
      if (entryType === 'session_meta') {
        const payload = (entry.payload as Record<string, unknown>) || {};
        if (payload.id) meta.sessionId = (payload.id as string).slice(0, 8);
        if (payload.timestamp) {
          try {
            const dt = new Date(payload.timestamp as string);
            meta.date = dt.toISOString().split('T')[0];
            meta.time = dt.toTimeString().slice(0, 5);
          } catch {
            // Invalid date format - ignore
          }
        }
        if (payload.cwd) meta.cwd = payload.cwd as string;
        if (payload.cli_version) meta.version = payload.cli_version as string;
      }
      
      // Extract messages from response_item type
      if (entryType === 'response_item') {
        const payload = (entry.payload as Record<string, unknown>) || {};
        const contentArr = payload.content;
        
        if (Array.isArray(contentArr)) {
          for (const item of contentArr as ContentItem[]) {
            if (item && typeof item === 'object') {
              const itemType = item.type || '';
              const text = item.text || '';
              
              // User input (skip system messages)
              if (itemType === 'input_text' && text) {
                if (!text.startsWith('# AGENTS.md') && !text.startsWith('<environment_context')) {
                  messages.push({ role: 'user', content: text });
                }
              }
              // Assistant response
              else if (itemType === 'text' && text) {
                messages.push({ role: 'assistant', content: text });
              }
              // Tool use
              else if (itemType === 'tool_use') {
                const toolName = item.name || 'tool';
                let toolText = `**🔧 Tool: ${toolName}**\n`;
                if (item.input) {
                  const inputStr = typeof item.input === 'string'
                    ? item.input
                    : JSON.stringify(item.input, null, 2).slice(0, 500);
                  toolText += `\`\`\`\n${inputStr}\n\`\`\``;
                }
                messages.push({ role: 'tool', content: toolText });
              }
              // Tool result
              else if (itemType === 'tool_result' && item.output) {
                const output = String(item.output).slice(0, 1000);
                messages.push({ role: 'result', content: `**📤 Result:**\n\`\`\`\n${output}\n\`\`\`` });
              }
            }
          }
        }
      }
      
      // Also capture user messages from event_msg type
      if (entryType === 'event_msg') {
        const payload = (entry.payload as Record<string, unknown>) || {};
        if (payload.type === 'user_message' && payload.message) {
          const msg = payload.message as string;
          if (msg && !msg.startsWith('#') && !msg.startsWith('<')) {
            messages.push({ role: 'user', content: msg });
          }
        }
      }
    } catch {
      // Invalid JSON line - skip
    }
  }
  
  return { meta, messages };
}

function generateMarkdown(meta: SessionMeta, messages: Message[]): string {
  const firstUserMsg = messages.find(m => m.role === 'user')?.content.slice(0, 80) || 'Session';
  
  let md = `---
type: codex-session
date: ${meta.date}
time: "${meta.time}"
session_id: "${meta.sessionId}"
working_dir: "${meta.cwd}"
cli_version: "${meta.version}"
tags:
  - codex
  - ai-session
  - coding
summary: "${firstUserMsg.replace(/"/g, '\\"')}..."
---

# 🤖 Codex Session — ${meta.date} ${meta.time.replace(':', '')}

| Property | Value |
|----------|-------|
| **Date** | ${meta.date} ${meta.time} |
| **Session ID** | \`${meta.sessionId}\` |
| **Working Dir** | \`${meta.cwd}\` |
| **CLI Version** | ${meta.version} |

---

`;

  for (const msg of messages) {
    const content = redactSecrets(msg.content);
    if (msg.role === 'user') {
      md += `## 👤 User\n\n${content}\n\n---\n\n`;
    } else if (msg.role === 'assistant') {
      md += `## 🤖 Codex\n\n${content}\n\n---\n\n`;
    } else if (msg.role === 'tool' || msg.role === 'result') {
      md += `${content}\n\n`;
    }
  }

  const syncTime = new Date().toISOString();
  md += `\n---\n*🔌 Synced via Obsidian Plugin at ${syncTime} — secrets redacted*\n`;
  
  return md;
}
