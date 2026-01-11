import { App } from 'obsidian';
import { redactSecrets } from './redact';
import * as fs from 'fs';
import * as path from 'path';

interface GeminiSession {
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

export async function syncGeminiCli(app: App, homeDir: string, outputFolder: string): Promise<number> {
  const geminiDir = path.join(homeDir, '.gemini');
  const outputDir = `${outputFolder}/gemini-cli-sessions`;
  
  if (!fs.existsSync(geminiDir)) {
    return 0;
  }
  
  let syncedCount = 0;
  const sessionFiles = findGeminiSessions(geminiDir);
  
  for (const sessionFile of sessionFiles) {
    const session = parseSession(sessionFile);
    if (!session || session.messages.length === 0) continue;
    
    const filename = `gemini-cli-${session.date}-${session.time.replace(':', '')}-${session.sessionId}.md`;
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
            appendContent += `## 💎 Gemini\n\n${content}\n\n---\n\n`;
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
  
  return syncedCount;
}

function findGeminiSessions(geminiDir: string): string[] {
  const sessions: string[] = [];
  
  const possibleDirs = [
    path.join(geminiDir, 'sessions'),
    path.join(geminiDir, 'history'),
    path.join(geminiDir, 'chats'),
    path.join(geminiDir, 'conversations'),
  ];
  
  for (const dir of possibleDirs) {
    if (fs.existsSync(dir)) {
      findJsonFiles(dir, sessions);
    }
  }
  
  // Also check main dir
  try {
    const files = fs.readdirSync(geminiDir);
    for (const file of files) {
      if ((file.includes('history') || file.includes('session')) && file.endsWith('.json')) {
        sessions.push(path.join(geminiDir, file));
      }
    }
  } catch {
    // Permission error
  }
  
  return sessions;
}

function findJsonFiles(dir: string, results: string[]): void {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && (entry.name.endsWith('.json') || entry.name.endsWith('.jsonl'))) {
        results.push(fullPath);
      } else if (entry.isDirectory()) {
        findJsonFiles(fullPath, results);
      }
    }
  } catch {
    // Permission denied
  }
}

function parseSession(filePath: string): GeminiSession | null {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
  
  const messages: Message[] = [];
  
  // Try JSON format
  try {
    const data = JSON.parse(content) as unknown;
    
    if (Array.isArray(data)) {
      for (const entry of data) {
        if (typeof entry === 'object' && entry !== null) {
          const e = entry as Record<string, unknown>;
          const role = (e.role as string) || (e.author as string) || 'unknown';
          const text = (e.content as string) || (e.text as string) || (e.message as string) || '';
          if (text) {
            messages.push({
              role: role === 'user' || role === 'human' ? 'user' : 'assistant',
              content: String(text)
            });
          }
        }
      }
    } else if (typeof data === 'object' && data !== null) {
      const d = data as Record<string, unknown>;
      const history = (d.history as unknown[]) || (d.messages as unknown[]) || (d.conversation as unknown[]) || [];
      for (const entry of history) {
        if (typeof entry === 'object' && entry !== null) {
          const e = entry as Record<string, unknown>;
          const role = (e.role as string) || (e.author as string) || 'unknown';
          const text = (e.content as string) || (e.text as string) || (e.message as string) || '';
          if (text) {
            messages.push({
              role: role === 'user' || role === 'human' ? 'user' : 'assistant',
              content: String(text)
            });
          }
        }
      }
    }
  } catch {
    // Try JSONL format
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as Record<string, unknown>;
        const role = (entry.role as string) || (entry.author as string) || 'unknown';
        const text = (entry.content as string) || (entry.text as string) || (entry.message as string) || '';
        if (text) {
          messages.push({
            role: role === 'user' || role === 'human' ? 'user' : 'assistant',
            content: String(text)
          });
        }
      } catch {
        // Invalid line
      }
    }
  }
  
  if (messages.length === 0) return null;
  
  const stat = fs.statSync(filePath);
  const dt = new Date(stat.mtime);
  
  return {
    sessionId: path.basename(filePath, path.extname(filePath)).slice(0, 8),
    date: dt.toISOString().split('T')[0],
    time: dt.toTimeString().slice(0, 5),
    messages,
    sourceFile: filePath
  };
}

function generateMarkdown(session: GeminiSession): string {
  const firstUserMsg = session.messages.find(m => m.role === 'user')?.content.slice(0, 80) || 'Session';
  
  let md = `---
type: gemini-cli-session
date: ${session.date}
time: "${session.time}"
session_id: "${session.sessionId}"
tags:
  - gemini
  - google
  - ai-session
  - coding
summary: "${firstUserMsg.replace(/"/g, '\\"').replace(/\n/g, ' ')}..."
---

# 💎 Gemini CLI Session — ${session.date} ${session.time.replace(':', '')}

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
      md += `## 💎 Gemini\n\n${content}\n\n---\n\n`;
    }
  }

  const syncTime = new Date().toISOString();
  md += `\n---\n*🔌 Synced via Obsidian Plugin at ${syncTime} — secrets redacted*\n`;
  
  return md;
}
