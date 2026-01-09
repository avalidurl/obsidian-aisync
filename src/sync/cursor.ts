import { App } from 'obsidian';
import { redactSecrets } from './redact';
import { findTranscriptFiles, escapeYaml } from './utils';
import * as fs from 'fs';
import * as path from 'path';

interface SessionMeta {
  sessionId: string;
  date: string;
  time: string;
  project: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export async function syncCursor(app: App, homeDir: string, outputFolder: string): Promise<number> {
  const cursorDir = path.join(homeDir, '.cursor', 'projects');
  const outputDir = `${outputFolder}/cursor-sessions`;
  
  if (!fs.existsSync(cursorDir)) {
    return 0;
  }
  
  let syncedCount = 0;
  const transcriptFiles = findTranscriptFiles(cursorDir);
  
  for (const transcriptFile of transcriptFiles) {
    try {
      const { meta, messages } = parseTranscript(transcriptFile);
      
      if (messages.length === 0) continue;
      
      // Create filename
      const projectShort = meta.project.slice(0, 30).toLowerCase().replace(/\//g, '-');
      const filename = `cursor-${meta.date}-${meta.time.replace(':', '')}-${projectShort}-${meta.sessionId}.md`;
      const filePath = `${outputDir}/${filename}`;
      
      // Check if already synced
      const existingFile = app.vault.getAbstractFileByPath(filePath);
      if (existingFile) continue;
      
      const markdown = generateMarkdown(meta, messages);
      await app.vault.create(filePath, markdown);
      syncedCount++;
    } catch (e) {
      console.error(`Error processing ${transcriptFile}:`, e);
    }
  }
  
  return syncedCount;
}

function parseTranscript(filePath: string): { meta: SessionMeta; messages: Message[] } {
  const content = fs.readFileSync(filePath, 'utf-8');
  const stat = fs.statSync(filePath);
  const mtime = new Date(stat.mtime);
  
  // Extract project name from path
  const pathParts = filePath.split(path.sep);
  let project = 'Unknown';
  for (let i = 0; i < pathParts.length; i++) {
    if (pathParts[i] === 'projects' && i + 1 < pathParts.length) {
      project = pathParts[i + 1]
        .replace(/^Users-[^-]+-/, '')
        .replace(/-/g, '/');
      break;
    }
  }
  
  const meta: SessionMeta = {
    sessionId: path.basename(filePath, '.txt').slice(0, 8),
    date: mtime.toISOString().split('T')[0],
    time: mtime.toTimeString().slice(0, 5),
    project: project
  };
  
  const messages: Message[] = [];
  
  // Parse the transcript format
  // Format: "user:\n...\n\nA:\n..."
  const parts = content.split(/\n(?=user:|\nA:)/);
  
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    
    if (trimmed.startsWith('user:')) {
      let text = trimmed.slice(5).trim();
      
      // Extract user_query from system context
      if (text.includes('<user_query>')) {
        const match = text.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/);
        if (match) {
          text = match[1].trim();
        } else if (text.startsWith('<')) {
          // Skip pure system messages
          continue;
        }
      }
      
      // Skip empty or very short messages
      if (text && text.length > 2) {
        messages.push({ role: 'user', content: text });
      }
    }
    else if (trimmed.startsWith('A:') || trimmed.startsWith('\nA:')) {
      let text = trimmed.replace(/^A:/, '').replace(/^\nA:/, '').trim();
      
      // Clean up tool calls for readability
      text = text
        .replace(/\[Thinking\]([\s\S]*?)(?=\[Tool|\n\n|$)/g, (_, thinking) => {
          const short = thinking.trim().slice(0, 300);
          return `> 💭 **Thinking:** ${short}...\n\n`;
        })
        .replace(/\[Tool call\]\s*(\w+)/g, '**🔧 Tool:** `$1`')
        .replace(/\[Tool result\]\s*(\w+)/g, '**📤 Result:** `$1`');
      
      if (text && text.length > 2) {
        messages.push({ role: 'assistant', content: text });
      }
    }
  }
  
  return { meta, messages };
}

function generateMarkdown(meta: SessionMeta, messages: Message[]): string {
  const firstUserMsg = messages.find(m => m.role === 'user')?.content.slice(0, 80) || 'Session';
  
  let md = `---
type: cursor-session
date: ${meta.date}
time: "${meta.time}"
session_id: "${meta.sessionId}"
project: "${meta.project}"
tags:
  - cursor
  - ai-session
  - coding
summary: "${firstUserMsg.replace(/"/g, '\\"').replace(/\n/g, ' ')}..."
---

# 🖱️ Cursor Session — ${meta.date} ${meta.time.replace(':', '')}

| Property | Value |
|----------|-------|
| **Date** | ${meta.date} ${meta.time} |
| **Session ID** | \`${meta.sessionId}\` |
| **Project** | \`${meta.project}\` |

---

`;

  for (const msg of messages) {
    const content = redactSecrets(msg.content);
    if (msg.role === 'user') {
      md += `## 👤 User\n\n${content}\n\n---\n\n`;
    } else if (msg.role === 'assistant') {
      md += `## 🤖 Cursor\n\n${content}\n\n---\n\n`;
    }
  }

  const syncTime = new Date().toISOString();
  md += `\n---\n*🔌 Synced via Obsidian Plugin at ${syncTime} — secrets redacted*\n`;
  
  return md;
}
