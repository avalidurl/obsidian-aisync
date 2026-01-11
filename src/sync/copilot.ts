import { App } from 'obsidian';
import { redactSecrets } from './redact';
import * as fs from 'fs';
import * as path from 'path';

interface CopilotSession {
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

export async function syncCopilotChat(app: App, homeDir: string, outputFolder: string): Promise<number> {
  const outputDir = `${outputFolder}/copilot-chat-sessions`;
  
  // Find Copilot storage paths
  const copilotPaths = [
    path.join(homeDir, 'Library/Application Support/Code/User/globalStorage/github.copilot-chat'),
    path.join(homeDir, 'Library/Application Support/Cursor/User/globalStorage/github.copilot-chat'),
    path.join(homeDir, '.config/Code/User/globalStorage/github.copilot-chat'),
  ];
  
  let syncedCount = 0;
  
  for (const copilotPath of copilotPaths) {
    if (!fs.existsSync(copilotPath)) continue;
    
    const sessionFiles = findChatSessions(copilotPath);
    
    for (const sessionFile of sessionFiles) {
      const session = parseSession(sessionFile);
      if (!session || session.messages.length === 0) continue;
      
      const filename = `copilot-chat-${session.date}-${session.time.replace(':', '')}-${session.sessionId}.md`;
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
              appendContent += `## 🐙 Copilot\n\n${content}\n\n---\n\n`;
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

function findChatSessions(copilotPath: string): string[] {
  const sessions: string[] = [];
  
  try {
    const findRecursive = (dir: string) => {
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
    };
    findRecursive(copilotPath);
  } catch {
    // Permission error
  }
  
  return sessions;
}

function parseSession(filePath: string): CopilotSession | null {
  let data: unknown;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
  
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
    sessionId: path.basename(filePath, '.json').slice(0, 8),
    date: dt.toISOString().split('T')[0],
    time: dt.toTimeString().slice(0, 5),
    messages,
    sourceFile: filePath
  };
}

function generateMarkdown(session: CopilotSession): string {
  const firstUserMsg = session.messages.find(m => m.role === 'user')?.content.slice(0, 80) || 'Session';
  
  let md = `---
type: copilot-chat-session
date: ${session.date}
time: "${session.time}"
session_id: "${session.sessionId}"
tags:
  - copilot
  - github
  - ai-session
  - coding
summary: "${firstUserMsg.replace(/"/g, '\\"').replace(/\n/g, ' ')}..."
---

# 🐙 Copilot Chat Session — ${session.date} ${session.time.replace(':', '')}

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
      md += `## 🐙 Copilot\n\n${content}\n\n---\n\n`;
    }
  }

  const syncTime = new Date().toISOString();
  md += `\n---\n*🔌 Synced via Obsidian Plugin at ${syncTime} — secrets redacted*\n`;
  
  return md;
}
