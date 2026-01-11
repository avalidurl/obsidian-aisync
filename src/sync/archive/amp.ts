import { App } from 'obsidian';
import { redactSecrets } from './redact';
import * as fs from 'fs';
import * as path from 'path';

interface AmpSession {
  sessionId: string;
  date: string;
  time: string;
  messages: Message[];
  sourceFile: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export async function syncAmp(app: App, homeDir: string, outputFolder: string): Promise<number> {
  const outputDir = `${outputFolder}/amp-sessions`;
  
  // Find Amp/Cody storage paths
  const ampPaths = [
    path.join(homeDir, 'Library/Application Support/Code/User/globalStorage/sourcegraph.cody-ai'),
    path.join(homeDir, 'Library/Application Support/Cursor/User/globalStorage/sourcegraph.cody-ai'),
    path.join(homeDir, '.config/Code/User/globalStorage/sourcegraph.cody-ai'),
  ];
  
  let syncedCount = 0;
  
  for (const ampPath of ampPaths) {
    if (!fs.existsSync(ampPath)) continue;
    
    const sessionFiles = findSessions(ampPath);
    
    for (const sessionFile of sessionFiles) {
      const session = parseSession(sessionFile);
      if (!session || session.messages.length === 0) continue;
      
      const filename = `amp-${session.date}-${session.time.replace(':', '')}-${session.sessionId}.md`;
      const filePath = `${outputDir}/${filename}`;

      // Find any existing file with same session ID
      const sessionId = session.sessionId;
      const existingFiles = app.vault.getFiles().filter(f =>
        f.path.startsWith(outputDir) &&
        f.path.includes(sessionId) &&
        f.extension === 'md'
      );

      const sourceMtime = fs.statSync(sessionFile).mtime.getTime();

      if (existingFiles.length > 0) {
        const existingFile = existingFiles.find(f => f.name === filename) || existingFiles[0];

        if (sourceMtime <= existingFile.stat.mtime) {
          continue;
        }

        // APPEND MODE
        const existingContent = await app.vault.read(existingFile);
        const existingUserCount = (existingContent.match(/^## 👤 User$/gm) || []).length;
        const sourceUserCount = session.messages.filter(m => m.role === 'user').length;

        if (sourceUserCount > existingUserCount) {
          const newMessages: Message[] = [];
          let userIdx = 0;
          for (const msg of session.messages) {
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
              appendContent += `## ⚡ Amp\n\n${content}\n\n---\n\n`;
            }
          }

          if (appendContent) {
            const footerMarker = '\n---\n*🔌 Synced via Obsidian Plugin';
            let updatedContent: string;

            if (existingContent.includes(footerMarker)) {
              updatedContent = existingContent.replace(footerMarker, appendContent + footerMarker);
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
      try {
        const markdown = generateMarkdown(session);
        await app.vault.create(filePath, markdown);
        syncedCount++;
      } catch (e) {
        console.error(`Error creating ${filePath}:`, e);
      }
    }
  }
  
  return syncedCount;
}

function findSessions(ampPath: string): string[] {
  const sessions: string[] = [];
  
  const possibleDirs = [
    path.join(ampPath, 'chat'),
    path.join(ampPath, 'chats'),
    path.join(ampPath, 'conversations'),
    path.join(ampPath, 'history'),
  ];
  
  for (const dir of possibleDirs) {
    if (fs.existsSync(dir)) {
      findJsonFiles(dir, sessions);
    }
  }
  
  // Also check main directory
  try {
    const files = fs.readdirSync(ampPath);
    for (const file of files) {
      if ((file.includes('chat') || file.includes('history')) && file.endsWith('.json')) {
        sessions.push(path.join(ampPath, file));
      }
    }
  } catch {
    // Permission error
  }
  
  return [...new Set(sessions)];
}

function findJsonFiles(dir: string, results: string[]): void {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith('.json')) {
        results.push(fullPath);
      } else if (entry.isDirectory()) {
        findJsonFiles(fullPath, results);
      }
    }
  } catch {
    // Permission denied
  }
}

function parseSession(filePath: string): AmpSession | null {
  let data: unknown;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
  
  const messages: Message[] = [];
  
  let history: unknown[] = [];
  if (typeof data === 'object' && data !== null) {
    const d = data as Record<string, unknown>;
    history = (d.messages as unknown[]) || (d.history as unknown[]) || (d.chat as unknown[]) || [];
    
    if (typeof history === 'object' && !Array.isArray(history)) {
      const h = history as Record<string, unknown>;
      history = (h.messages as unknown[]) || [];
    }
  } else if (Array.isArray(data)) {
    history = data;
  }
  
  for (const entry of history) {
    if (typeof entry !== 'object' || entry === null) continue;
    
    const e = entry as Record<string, unknown>;
    const role = (e.role as string) || (e.speaker as string) || (e.author as string) || 'unknown';
    let content = (e.content as unknown) || (e.text as unknown) || (e.message as unknown) || (e.displayText as unknown) || '';
    
    if (Array.isArray(content)) {
      const parts: string[] = [];
      for (const item of content) {
        if (typeof item === 'string') {
          parts.push(item);
        } else if (typeof item === 'object' && item !== null) {
          const i = item as Record<string, unknown>;
          if (i.type === 'text' && i.text) {
            parts.push(String(i.text));
          }
        }
      }
      content = parts.join('\n');
    }
    
    if (content && String(content).trim().length > 5) {
      const roleLower = String(role).toLowerCase();
      const isUser = roleLower === 'user' || roleLower === 'human' || roleLower === 'you';
      messages.push({
        role: isUser ? 'user' : 'assistant',
        content: String(content)
      });
    }
  }
  
  if (messages.length === 0) return null;
  
  const stat = fs.statSync(filePath);
  const dt = new Date(stat.mtime);
  
  return {
    sessionId: path.basename(filePath, '.json').slice(0, 8),
    date: dt.toISOString().split('T')[0],
    time: dt.toTimeString().slice(0, 5),
    messages,
    sourceFile: filePath
  };
}

function generateMarkdown(session: AmpSession): string {
  const firstUserMsg = session.messages.find(m => m.role === 'user')?.content.slice(0, 80) || 'Session';
  
  let md = `---
type: amp-session
date: ${session.date}
time: "${session.time}"
session_id: "${session.sessionId}"
tags:
  - amp
  - sourcegraph
  - cody
  - ai-session
  - coding
summary: "${firstUserMsg.replace(/"/g, '\\"').replace(/\n/g, ' ')}..."
---

# ⚡ Amp Session — ${session.date} ${session.time.replace(':', '')}

| Property | Value |
|----------|-------|
| **Date** | ${session.date} ${session.time} |
| **Session ID** | \`${session.sessionId}\` |

---

`;

  for (const msg of session.messages) {
    const content = redactSecrets(msg.content);
    if (msg.role === 'user') {
      md += `## 👤 User\n\n${content}\n\n---\n\n`;
    } else {
      md += `## ⚡ Amp\n\n${content}\n\n---\n\n`;
    }
  }

  const syncTime = new Date().toISOString();
  md += `\n---\n*🔌 Synced via Obsidian Plugin at ${syncTime} — secrets redacted*\n`;
  
  return md;
}
