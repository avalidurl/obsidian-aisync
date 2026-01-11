import { App } from 'obsidian';
import { redactSecrets } from './redact';
import * as fs from 'fs';
import * as path from 'path';

interface ContinueSession {
  sessionId: string;
  date: string;
  time: string;
  model: string;
  messages: Message[];
  sourceFile: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export async function syncContinue(app: App, homeDir: string, outputFolder: string): Promise<number> {
  const continueDir = path.join(homeDir, '.continue');
  const sessionsDir = path.join(continueDir, 'sessions');
  const outputDir = `${outputFolder}/continue-sessions`;
  
  if (!fs.existsSync(sessionsDir)) {
    return 0;
  }
  
  let syncedCount = 0;
  
  const sessionFiles = fs.readdirSync(sessionsDir)
    .filter(f => f.endsWith('.json'))
    .map(f => path.join(sessionsDir, f));
  
  for (const sessionFile of sessionFiles) {
    const session = parseSession(sessionFile);
    if (!session || session.messages.length === 0) continue;
    
    const filename = `continue-${session.date}-${session.time.replace(':', '')}-${session.sessionId}.md`;
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
            appendContent += `## 🔄 Continue\n\n${content}\n\n---\n\n`;
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

function parseSession(filePath: string): ContinueSession | null {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
  
  const messages: Message[] = [];
  const history = (data.history as unknown[]) || (data.messages as unknown[]) || [];
  
  for (const entry of history) {
    if (typeof entry !== 'object' || entry === null) continue;
    
    const e = entry as Record<string, unknown>;
    const role = (e.role as string) || 'unknown';
    let content = (e.content as unknown) || (e.message as unknown) || '';
    
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
      messages.push({
        role: role === 'user' || role === 'human' ? 'user' : 'assistant',
        content: String(content)
      });
    }
  }
  
  if (messages.length === 0) return null;
  
  const sessionId = (data.sessionId as string) || path.basename(filePath, '.json').slice(0, 8);
  const model = (data.model as string) || (data.selectedModelTitle as string) || 'unknown';
  
  const stat = fs.statSync(filePath);
  const dt = new Date(stat.mtime);
  
  return {
    sessionId: sessionId.slice(0, 8),
    date: dt.toISOString().split('T')[0],
    time: dt.toTimeString().slice(0, 5),
    model,
    messages,
    sourceFile: filePath
  };
}

function generateMarkdown(session: ContinueSession): string {
  const firstUserMsg = session.messages.find(m => m.role === 'user')?.content.slice(0, 80) || 'Session';
  
  let md = `---
type: continue-session
date: ${session.date}
time: "${session.time}"
session_id: "${session.sessionId}"
model: "${session.model}"
tags:
  - continue
  - ai-session
  - coding
summary: "${firstUserMsg.replace(/"/g, '\\"').replace(/\n/g, ' ')}..."
---

# 🔄 Continue Session — ${session.date} ${session.time.replace(':', '')}

| Property | Value |
|----------|-------|
| **Date** | ${session.date} ${session.time} |
| **Session ID** | \`${session.sessionId}\` |
| **Model** | ${session.model} |

---

`;

  for (const msg of session.messages) {
    const content = redactSecrets(msg.content);
    if (msg.role === 'user') {
      md += `## 👤 User\n\n${content}\n\n---\n\n`;
    } else {
      md += `## 🔄 Continue\n\n${content}\n\n---\n\n`;
    }
  }

  const syncTime = new Date().toISOString();
  md += `\n---\n*🔌 Synced via Obsidian Plugin at ${syncTime} — secrets redacted*\n`;
  
  return md;
}
