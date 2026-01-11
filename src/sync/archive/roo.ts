import { App } from 'obsidian';
import { redactSecrets } from './redact';
import * as fs from 'fs';
import * as path from 'path';

interface RooTask {
  taskId: string;
  date: string;
  time: string;
  messages: Message[];
  sourceDir: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ContentItem {
  type?: string;
  text?: string;
  name?: string;
}

export async function syncRooCode(app: App, homeDir: string, outputFolder: string): Promise<number> {
  const outputDir = `${outputFolder}/roo-code-sessions`;
  
  // Find Roo Code storage paths
  const rooPaths = [
    path.join(homeDir, 'Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/tasks'),
    path.join(homeDir, 'Library/Application Support/Cursor/User/globalStorage/rooveterinaryinc.roo-cline/tasks'),
    path.join(homeDir, '.config/Code/User/globalStorage/rooveterinaryinc.roo-cline/tasks'),
  ];
  
  let syncedCount = 0;
  
  for (const tasksDir of rooPaths) {
    if (!fs.existsSync(tasksDir)) continue;
    
    const taskDirs = fs.readdirSync(tasksDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => path.join(tasksDir, d.name));
    
    for (const taskDir of taskDirs) {
      const task = parseTask(taskDir);
      if (!task || task.messages.length === 0) continue;
      
      const filename = `roo-code-${task.date}-${task.time.replace(':', '')}-${task.taskId}.md`;
      const filePath = `${outputDir}/${filename}`;

      // Find any existing file with same task ID
      const taskId = task.taskId;
      const existingFiles = app.vault.getFiles().filter(f =>
        f.path.startsWith(outputDir) &&
        f.path.includes(taskId) &&
        f.extension === 'md'
      );

      const sourceMtime = fs.statSync(taskDir).mtime.getTime();

      if (existingFiles.length > 0) {
        const existingFile = existingFiles.find(f => f.name === filename) || existingFiles[0];

        if (sourceMtime <= existingFile.stat.mtime) {
          continue;
        }

        // APPEND MODE
        const existingContent = await app.vault.read(existingFile);
        const existingUserCount = (existingContent.match(/^## 👤 User$/gm) || []).length;
        const sourceUserCount = task.messages.filter(m => m.role === 'user').length;

        if (sourceUserCount > existingUserCount) {
          const newMessages: Message[] = [];
          let userIdx = 0;
          for (const msg of task.messages) {
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
              appendContent += `## 🦘 Roo Code\n\n${content}\n\n---\n\n`;
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
        const markdown = generateMarkdown(task);
        await app.vault.create(filePath, markdown);
        syncedCount++;
      } catch (e) {
        console.error(`Error creating ${filePath}:`, e);
      }
    }
  }
  
  return syncedCount;
}

function parseTask(taskDir: string): RooTask | null {
  const conversationFile = path.join(taskDir, 'api_conversation_history.json');
  
  if (!fs.existsSync(conversationFile)) return null;
  
  let conversation: Array<{ role?: string; content?: unknown }>;
  try {
    conversation = JSON.parse(fs.readFileSync(conversationFile, 'utf-8'));
  } catch {
    return null;
  }
  
  const messages: Message[] = [];
  for (const entry of conversation) {
    const role = entry.role || '';
    const content = extractTextContent(entry.content);
    
    if (content && content.trim().length > 10) {
      messages.push({
        role: role === 'user' ? 'user' : 'assistant',
        content: content.trim()
      });
    }
  }
  
  const taskId = path.basename(taskDir);
  let date = 'unknown';
  let time = '00:00';
  
  try {
    const timestamp = parseInt(taskId) / 1000;
    const dt = new Date(timestamp * 1000);
    date = dt.toISOString().split('T')[0];
    time = dt.toTimeString().slice(0, 5);
  } catch {
    // Invalid timestamp
  }
  
  return {
    taskId: taskId.slice(0, 8),
    date,
    time,
    messages,
    sourceDir: taskDir
  };
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
          if (!item.text.includes('<environment_details>')) {
            parts.push(item.text);
          } else {
            const match = item.text.match(/<task>\s*([\s\S]*?)\s*<\/task>/);
            if (match) {
              parts.push(match[1].trim());
            }
          }
        }
      }
    }
    return parts.join('\n\n');
  }
  
  return '';
}

function generateMarkdown(task: RooTask): string {
  const firstUserMsg = task.messages.find(m => m.role === 'user')?.content.slice(0, 80) || 'Task';
  
  let md = `---
type: roo-code-session
date: ${task.date}
time: "${task.time}"
task_id: "${task.taskId}"
tags:
  - roo-code
  - ai-session
  - coding
summary: "${firstUserMsg.replace(/"/g, '\\"').replace(/\n/g, ' ')}..."
---

# 🦘 Roo Code Session — ${task.date} ${task.time.replace(':', '')}

| Property | Value |
|----------|-------|
| **Date** | ${task.date} ${task.time} |
| **Task ID** | \`${task.taskId}\` |

---

`;

  for (const msg of task.messages) {
    const content = redactSecrets(msg.content);
    if (msg.role === 'user') {
      md += `## 👤 User\n\n${content}\n\n---\n\n`;
    } else {
      md += `## 🦘 Roo Code\n\n${content}\n\n---\n\n`;
    }
  }

  const syncTime = new Date().toISOString();
  md += `\n---\n*🔌 Synced via Obsidian Plugin at ${syncTime} — secrets redacted*\n`;
  
  return md;
}
