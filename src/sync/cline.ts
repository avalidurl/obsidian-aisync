import { App } from 'obsidian';
import { redactSecrets } from './redact';
import * as fs from 'fs';
import * as path from 'path';

interface ClineTask {
  taskId: string;
  date: string;
  time: string;
  model: string;
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
  input?: unknown;
  content?: unknown;
}

interface TaskMetadata {
  model_usage?: Array<{ model_id?: string }>;
}

export async function syncCline(app: App, homeDir: string, outputFolder: string): Promise<number> {
  const outputDir = `${outputFolder}/cline-sessions`;
  
  // Find Cline storage paths
  const clinePaths = [
    path.join(homeDir, 'Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/tasks'),
    path.join(homeDir, 'Library/Application Support/Cursor/User/globalStorage/saoudrizwan.claude-dev/tasks'),
    path.join(homeDir, '.config/Code/User/globalStorage/saoudrizwan.claude-dev/tasks'),
  ];
  
  let syncedCount = 0;
  
  for (const tasksDir of clinePaths) {
    if (!fs.existsSync(tasksDir)) continue;
    
    const taskDirs = fs.readdirSync(tasksDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => path.join(tasksDir, d.name));
    
    for (const taskDir of taskDirs) {
      const task = parseTask(taskDir);
      if (!task || task.messages.length === 0) continue;
      
      const filename = `cline-${task.date}-${task.time.replace(':', '')}-${task.taskId}.md`;
      const filePath = `${outputDir}/${filename}`;
      
      const existingFile = app.vault.getAbstractFileByPath(filePath);
      if (existingFile) {
        try {
          const sourceMtime = fs.statSync(taskDir).mtime.getTime();
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

function parseTask(taskDir: string): ClineTask | null {
  const conversationFile = path.join(taskDir, 'api_conversation_history.json');
  const metadataFile = path.join(taskDir, 'task_metadata.json');
  
  if (!fs.existsSync(conversationFile)) return null;
  
  let conversation: Array<{ role?: string; content?: unknown }>;
  try {
    conversation = JSON.parse(fs.readFileSync(conversationFile, 'utf-8'));
  } catch {
    return null;
  }
  
  // Load metadata
  let metadata: TaskMetadata = {};
  if (fs.existsSync(metadataFile)) {
    try {
      metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf-8'));
    } catch {
      // Ignore metadata errors
    }
  }
  
  // Extract model
  let model = 'unknown';
  if (metadata.model_usage && metadata.model_usage.length > 0) {
    model = metadata.model_usage[0].model_id || 'unknown';
  }
  
  // Parse messages
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
  
  // Get task ID and timestamp
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
    model,
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
          // Skip environment_details
          if (!item.text.includes('<environment_details>')) {
            parts.push(item.text);
          } else {
            const match = item.text.match(/<task>\s*([\s\S]*?)\s*<\/task>/);
            if (match) {
              parts.push(match[1].trim());
            }
          }
        } else if (item.type === 'tool_use') {
          parts.push(`**🔧 Tool: ${item.name || 'tool'}**`);
        }
      }
    }
    return parts.join('\n\n');
  }
  
  return '';
}

function generateMarkdown(task: ClineTask): string {
  const firstUserMsg = task.messages.find(m => m.role === 'user')?.content.slice(0, 80) || 'Task';
  
  let md = `---
type: cline-session
date: ${task.date}
time: "${task.time}"
task_id: "${task.taskId}"
model: "${task.model}"
tags:
  - cline
  - claude-dev
  - ai-session
  - coding
summary: "${firstUserMsg.replace(/"/g, '\\"').replace(/\n/g, ' ')}..."
---

# 🤖 Cline Session — ${task.date} ${task.time.replace(':', '')}

| Property | Value |
|----------|-------|
| **Date** | ${task.date} ${task.time} |
| **Task ID** | \`${task.taskId}\` |
| **Model** | ${task.model} |

---

`;

  for (const msg of task.messages) {
    const content = redactSecrets(msg.content);
    if (msg.role === 'user') {
      md += `## 👤 User\n\n${content}\n\n---\n\n`;
    } else {
      md += `## 🤖 Cline\n\n${content}\n\n---\n\n`;
    }
  }

  const syncTime = new Date().toISOString();
  md += `\n---\n*🔌 Synced via Obsidian Plugin at ${syncTime} — secrets redacted*\n`;
  
  return md;
}
