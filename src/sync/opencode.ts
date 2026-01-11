import { App, TFile } from 'obsidian';
import { redactSecrets } from './redact';
import { SYNC_FOOTER_MARKER, generateSyncFooter } from './utils';
import * as fs from 'fs';
import * as path from 'path';

interface SessionMeta {
  sessionId: string;
  date: string;
  time: string;
  title: string;
  messageCount: number;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  model?: string;
}

interface OpenCodeSession {
  id: string;
  title: string;
  message_count: number;
  created_at: number;
  updated_at: number;
}

interface OpenCodeMessage {
  id: string;
  session_id: string;
  role: string;
  parts: string;
  model: string | null;
  created_at: number;
}

export async function syncOpenCode(app: App, homeDir: string, outputFolder: string): Promise<number> {
  const outputDir = `${outputFolder}/opencode-sessions`;

  let syncedCount = 0;

  // OpenCode stores data in .opencode/opencode.db within project directories
  // Search common project locations
  const searchDirs = [
    path.join(homeDir, 'Documents'),
    path.join(homeDir, 'Projects'),
    path.join(homeDir, 'Code'),
    path.join(homeDir, 'Developer'),
    path.join(homeDir, 'GitHub'),
    path.join(homeDir, 'dev'),
    homeDir, // Check home directory itself for global .opencode
  ];

  const dbFiles = findOpenCodeDatabases(searchDirs);

  if (dbFiles.length === 0) {
    return 0;
  }

  for (const dbFile of dbFiles) {
    try {
      const sessions = await parseOpenCodeDatabase(dbFile);
      const projectPath = path.dirname(path.dirname(dbFile)); // Go up from .opencode/opencode.db
      const projectName = path.basename(projectPath) || 'global';

      for (const { meta, messages } of sessions) {
        if (messages.length === 0) continue;

        const projectShort = projectName.slice(0, 20).toLowerCase().replace(/[^a-z0-9-]/g, '-');
        const filename = `opencode-${meta.date}-${meta.time.replace(':', '')}-${projectShort}-${meta.sessionId}.md`;
        const filePath = `${outputDir}/${filename}`;

        // Find any existing file with same session ID
        const sessionId = meta.sessionId;
        const existingFiles = app.vault.getFiles().filter(f =>
          f.path.startsWith(outputDir) &&
          f.path.includes(sessionId) &&
          f.extension === 'md'
        );

        const sourceMtime = fs.statSync(dbFile).mtime.getTime();

        // Check if we need to update
        if (existingFiles.length > 0) {
          const existingFile = existingFiles.find(f => f.name === filename) || existingFiles[0];

          // Skip if source hasn't changed since last sync
          if (sourceMtime <= existingFile.stat.mtime) {
            continue;
          }

          // APPEND MODE: Read existing note, count messages, append only new ones
          const existingContent = await app.vault.read(existingFile);

          // Count by user exchanges (headers at line start only)
          const existingUserCount = (existingContent.match(/^## 👤 User$/gm) || []).length;
          const sourceUserCount = messages.filter(m => m.role === 'user').length;

          if (sourceUserCount > existingUserCount) {
            // Find new exchanges: messages after the last synced user exchange
            const newMessages: Message[] = [];
            let userIdx = 0;
            for (const msg of messages) {
              if (msg.role === 'user') userIdx++;
              if (userIdx > existingUserCount) newMessages.push(msg);
            }

            let appendContent = '';
            for (const msg of newMessages) {
              const content = redactSecrets(msg.content);
              if (!content || !content.trim()) continue;

              if (msg.role === 'user') {
                appendContent += `## 👤 User\n\n${content}\n\n---\n\n`;
              } else {
                appendContent += `## 💻 OpenCode\n\n${content}\n\n---\n\n`;
              }
            }

            if (appendContent) {
              let updatedContent: string;

              if (existingContent.includes(SYNC_FOOTER_MARKER)) {
                updatedContent = existingContent.replace(SYNC_FOOTER_MARKER, appendContent + SYNC_FOOTER_MARKER);
              } else {
                updatedContent = existingContent + '\n' + appendContent;
              }

              await app.vault.modify(existingFile, updatedContent);
              syncedCount++;
            }
          }
          continue;
        }

        // New session - create file
        const markdown = generateMarkdown(meta, messages, projectName);
        await app.vault.create(filePath, markdown);
        syncedCount++;
      }
    } catch (e) {
      console.error(`Error processing OpenCode database ${dbFile}:`, e);
    }
  }

  return syncedCount;
}

function findOpenCodeDatabases(searchDirs: string[]): string[] {
  const dbFiles: string[] = [];

  function walkDir(currentDir: string, depth = 0) {
    if (depth > 5) return;

    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          if (entry.name === '.opencode') {
            // Check for database file
            const dbPath = path.join(fullPath, 'opencode.db');
            if (fs.existsSync(dbPath)) {
              dbFiles.push(dbPath);
            }
          } else if (!entry.name.startsWith('.') &&
                     entry.name !== 'node_modules' &&
                     entry.name !== 'vendor' &&
                     entry.name !== 'dist' &&
                     entry.name !== 'build') {
            walkDir(fullPath, depth + 1);
          }
        }
      }
    } catch {
      // Permission denied or other error - skip
    }
  }

  for (const dir of searchDirs) {
    if (fs.existsSync(dir)) {
      // Check for .opencode directly in search dir
      const directDb = path.join(dir, '.opencode', 'opencode.db');
      if (fs.existsSync(directDb) && !dbFiles.includes(directDb)) {
        dbFiles.push(directDb);
      }
      walkDir(dir);
    }
  }

  return [...new Set(dbFiles)]; // Remove duplicates
}

async function parseOpenCodeDatabase(dbPath: string): Promise<Array<{ meta: SessionMeta; messages: Message[] }>> {
  const results: Array<{ meta: SessionMeta; messages: Message[] }> = [];

  // Use better-sqlite3 for synchronous SQLite access (works in Electron/Node)
  // If not available, fall back to reading raw file and parsing what we can
  try {
    // Try to use better-sqlite3 if available
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Database = require('better-sqlite3');
    const db = new Database(dbPath, { readonly: true });

    try {
      // Get all sessions
      const sessions = db.prepare(`
        SELECT id, title, message_count, created_at, updated_at
        FROM sessions
        ORDER BY created_at DESC
      `).all() as OpenCodeSession[];

      for (const session of sessions) {
        // Get messages for this session
        const messages = db.prepare(`
          SELECT id, session_id, role, parts, model, created_at
          FROM messages
          WHERE session_id = ?
          ORDER BY created_at ASC
        `).all(session.id) as OpenCodeMessage[];

        if (messages.length === 0) continue;

        const createdAt = new Date(session.created_at);
        const meta: SessionMeta = {
          sessionId: session.id.slice(0, 12),
          date: createdAt.toISOString().split('T')[0],
          time: createdAt.toTimeString().slice(0, 5),
          title: session.title || 'Untitled Session',
          messageCount: session.message_count
        };

        const parsedMessages: Message[] = [];
        for (const msg of messages) {
          const content = parseMessageParts(msg.parts);
          if (!content) continue;

          // Only include user and assistant messages
          if (msg.role === 'user' || msg.role === 'assistant') {
            parsedMessages.push({
              role: msg.role as 'user' | 'assistant',
              content: content,
              model: msg.model || undefined
            });
          }
        }

        if (parsedMessages.length > 0) {
          results.push({ meta, messages: parsedMessages });
        }
      }
    } finally {
      db.close();
    }
  } catch (e) {
    // better-sqlite3 not available or error reading database
    // Try alternative approach: read SQLite file directly for basic extraction
    console.debug('OpenCode: better-sqlite3 not available, trying alternative approach', e);

    // Fall back to extracting text content from SQLite file (basic approach)
    const altResults = parseOpenCodeDatabaseAlternative(dbPath);
    results.push(...altResults);
  }

  return results;
}

function parseMessageParts(partsJson: string): string {
  try {
    const parts = JSON.parse(partsJson);
    if (!Array.isArray(parts)) return '';

    const textParts: string[] = [];
    for (const part of parts) {
      if (typeof part === 'string') {
        textParts.push(part);
      } else if (part && typeof part === 'object') {
        // Handle different part types
        if (part.type === 'text' && part.text) {
          textParts.push(part.text);
        } else if (part.type === 'tool_use' || part.type === 'tool-invocation') {
          const toolName = part.name || part.toolName || 'tool';
          textParts.push(`**🔧 Tool: ${toolName}**`);
          if (part.input || part.args) {
            const inputStr = JSON.stringify(part.input || part.args, null, 2).slice(0, 500);
            textParts.push(`\`\`\`\n${inputStr}\n\`\`\``);
          }
        } else if (part.type === 'tool_result' || part.type === 'tool-result') {
          const result = typeof part.output === 'string'
            ? part.output.slice(0, 1000)
            : JSON.stringify(part.output || part.result).slice(0, 1000);
          textParts.push(`**📤 Result:**\n\`\`\`\n${result}\n\`\`\``);
        } else if (part.content) {
          textParts.push(typeof part.content === 'string' ? part.content : JSON.stringify(part.content));
        }
      }
    }

    return textParts.join('\n\n');
  } catch {
    return partsJson; // Return as-is if not valid JSON
  }
}

function parseOpenCodeDatabaseAlternative(dbPath: string): Array<{ meta: SessionMeta; messages: Message[] }> {
  // Alternative: Extract readable strings from SQLite file
  // This is a fallback when better-sqlite3 is not available
  const results: Array<{ meta: SessionMeta; messages: Message[] }> = [];

  try {
    const content = fs.readFileSync(dbPath);

    // Look for JSON arrays (message parts) in the binary content
    const textContent = content.toString('utf-8');

    // Find session-like patterns and message-like patterns
    // This is a best-effort extraction from raw SQLite data
    const sessionMatches = textContent.matchAll(/\{"id":"([^"]+)","title":"([^"]*)"/g);
    const messageMatches = textContent.matchAll(/\{"role":"(user|assistant)","parts":"(\[.*?\])"/g);

    // Try to reconstruct sessions from extracted data
    const sessions = new Map<string, { title: string; messages: Message[] }>();

    for (const match of sessionMatches) {
      const [, id, title] = match;
      if (!sessions.has(id)) {
        sessions.set(id, { title, messages: [] });
      }
    }

    // If we found sessions, try to associate messages
    // This is imperfect but better than nothing
    if (sessions.size > 0) {
      const firstSession = sessions.entries().next().value;
      if (firstSession) {
        const [sessionId, sessionData] = firstSession;
        const meta: SessionMeta = {
          sessionId: sessionId.slice(0, 12),
          date: new Date().toISOString().split('T')[0],
          time: new Date().toTimeString().slice(0, 5),
          title: sessionData.title || 'Extracted Session',
          messageCount: sessionData.messages.length
        };

        if (sessionData.messages.length > 0) {
          results.push({ meta, messages: sessionData.messages });
        }
      }
    }
  } catch {
    // Failed to read or parse - return empty
  }

  return results;
}

function generateMarkdown(meta: SessionMeta, messages: Message[], project: string): string {
  const firstUserMsg = messages.find(m => m.role === 'user')?.content.slice(0, 80) || meta.title;

  let md = `---
type: opencode-session
date: ${meta.date}
time: "${meta.time}"
session_id: "${meta.sessionId}"
project: "${project}"
title: "${meta.title.replace(/"/g, '\\"')}"
tags:
  - opencode
  - ai-session
  - coding
summary: "${firstUserMsg.replace(/"/g, '\\"').replace(/\n/g, ' ')}..."
---

# 💻 OpenCode Session — ${meta.date} ${meta.time.replace(':', '')}

| Property | Value |
|----------|-------|
| **Date** | ${meta.date} ${meta.time} |
| **Session ID** | \`${meta.sessionId}\` |
| **Project** | \`${project}\` |
| **Title** | ${meta.title} |

---

`;

  for (const msg of messages) {
    const content = redactSecrets(msg.content);
    if (msg.role === 'user') {
      md += `## 👤 User\n\n${content}\n\n---\n\n`;
    } else {
      md += `## 💻 OpenCode\n\n${content}\n\n---\n\n`;
    }
  }

  md += generateSyncFooter();

  return md;
}
