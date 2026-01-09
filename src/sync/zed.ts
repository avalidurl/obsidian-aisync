import { App } from 'obsidian';
import { redactSecrets } from './redact';
import * as fs from 'fs';
import * as path from 'path';

interface ZedSession {
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

export async function syncZedAi(app: App, homeDir: string, outputFolder: string): Promise<number> {
  const zedConversations = path.join(homeDir, '.config/zed/conversations');
  const outputDir = `${outputFolder}/zed-ai-sessions`;
  
  if (!fs.existsSync(zedConversations)) {
    return 0;
  }
  
  let syncedCount = 0;
  const conversationFiles = findConversations(zedConversations);
  
  for (const convFile of conversationFiles) {
    const session = parseConversation(convFile);
    if (!session || session.messages.length === 0) continue;
    
    const filename = `zed-ai-${session.date}-${session.time.replace(':', '')}-${session.sessionId}.md`;
    const filePath = `${outputDir}/${filename}`;
    
    const existingFile = app.vault.getAbstractFileByPath(filePath);
    if (existingFile) {
      try {
        const sourceMtime = fs.statSync(convFile).mtime.getTime();
        const outputStat = await app.vault.adapter.stat(filePath);
        if (outputStat && sourceMtime <= outputStat.mtime) {
          continue;
        }
        await app.vault.delete(existingFile);
      } catch {
        continue;
      }
    }
    
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

function findConversations(dir: string): string[] {
  const conversations: string[] = [];
  
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file.endsWith('.json') || file.endsWith('.md')) {
        conversations.push(path.join(dir, file));
      }
    }
  } catch {
    // Permission denied
  }
  
  return conversations;
}

function parseConversation(filePath: string): ZedSession | null {
  const ext = path.extname(filePath);
  const stat = fs.statSync(filePath);
  const dt = new Date(stat.mtime);
  
  const messages: Message[] = [];
  
  if (ext === '.md') {
    // Parse markdown format
    const content = fs.readFileSync(filePath, 'utf-8');
    
    let currentRole: 'user' | 'assistant' | null = null;
    let currentContent: string[] = [];
    
    for (const line of content.split('\n')) {
      if (line.startsWith('## User') || line.startsWith('## Human')) {
        if (currentRole && currentContent.length > 0) {
          messages.push({
            role: currentRole,
            content: currentContent.join('\n').trim()
          });
        }
        currentRole = 'user';
        currentContent = [];
      } else if (line.startsWith('## Assistant') || line.startsWith('## Zed')) {
        if (currentRole && currentContent.length > 0) {
          messages.push({
            role: currentRole,
            content: currentContent.join('\n').trim()
          });
        }
        currentRole = 'assistant';
        currentContent = [];
      } else if (currentRole) {
        currentContent.push(line);
      }
    }
    
    if (currentRole && currentContent.length > 0) {
      messages.push({
        role: currentRole,
        content: currentContent.join('\n').trim()
      });
    }
  } else {
    // Parse JSON format
    let data: unknown;
    try {
      data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
      return null;
    }
    
    let history: unknown[] = [];
    if (typeof data === 'object' && data !== null) {
      const d = data as Record<string, unknown>;
      history = (d.messages as unknown[]) || (d.history as unknown[]) || [];
    }
    
    for (const entry of history) {
      if (typeof entry !== 'object' || entry === null) continue;
      
      const e = entry as Record<string, unknown>;
      const role = (e.role as string) || 'unknown';
      const content = (e.content as string) || (e.text as string) || '';
      
      if (content) {
        messages.push({
          role: role === 'user' || role === 'human' ? 'user' : 'assistant',
          content: String(content)
        });
      }
    }
  }
  
  if (messages.length === 0) return null;
  
  return {
    sessionId: path.basename(filePath, path.extname(filePath)).slice(0, 8),
    date: dt.toISOString().split('T')[0],
    time: dt.toTimeString().slice(0, 5),
    messages,
    sourceFile: filePath
  };
}

function generateMarkdown(session: ZedSession): string {
  const firstUserMsg = session.messages.find(m => m.role === 'user')?.content.slice(0, 80) || 'Session';
  
  let md = `---
type: zed-ai-session
date: ${session.date}
time: "${session.time}"
session_id: "${session.sessionId}"
tags:
  - zed
  - ai-session
  - coding
summary: "${firstUserMsg.replace(/"/g, '\\"').replace(/\n/g, ' ')}..."
---

# ⚡ Zed AI Session — ${session.date} ${session.time.replace(':', '')}

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
      md += `## ⚡ Zed AI\n\n${content}\n\n---\n\n`;
    }
  }

  const syncTime = new Date().toISOString();
  md += `\n---\n*🔌 Synced via Obsidian Plugin at ${syncTime} — secrets redacted*\n`;
  
  return md;
}
