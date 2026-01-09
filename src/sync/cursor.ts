import { App } from 'obsidian';
import { redactSecrets } from './redact';
import { findTranscriptFiles } from './utils';
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
      
      // Find any existing file with same session ID (handles filename changes)
      const sessionId = meta.sessionId;
      const existingFiles = app.vault.getFiles().filter(f => 
        f.path.startsWith(outputDir) && 
        f.path.includes(sessionId) &&
        f.extension === 'md'
      );
      
      const sourceMtime = fs.statSync(transcriptFile).mtime.getTime();
      
      // Check if we need to update
      if (existingFiles.length > 0) {
        // Get the existing file (prefer exact match)
        const existingFile = existingFiles.find(f => f.name === filename) || existingFiles[0];
        
        // Skip if source hasn't changed since last sync
        if (sourceMtime <= existingFile.stat.mtime) {
          continue;
        }
        
        // APPEND MODE: Read existing note, count messages, append only new ones
        const existingContent = await app.vault.read(existingFile);
        
        // Count existing message blocks
        const userMatches = existingContent.match(/## 👤 User/g) || [];
        const assistantMatches = existingContent.match(/## 🤖 Cursor/g) || [];
        const existingMsgCount = userMatches.length + assistantMatches.length;
        const newMsgCount = messages.length;
        
        if (newMsgCount > existingMsgCount) {
          // Append only NEW messages
          const newMessages = messages.slice(existingMsgCount);
          
          let appendContent = '';
          for (const msg of newMessages) {
            const content = redactSecrets(msg.content);
            if (!content || !content.trim()) continue;
            
            if (msg.role === 'user') {
              appendContent += `## 👤 User\n\n${content}\n\n---\n\n`;
            } else if (msg.role === 'assistant') {
              appendContent += `## 🤖 Cursor\n\n${content}\n\n---\n\n`;
            }
          }
          
          if (appendContent) {
            // Find footer and insert before it, or append at end
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
  
  // Use birthtime (creation time) for stable filenames, fallback to mtime
  const createdAt = stat.birthtime && stat.birthtime.getTime() > 0 
    ? stat.birthtime 
    : stat.mtime;
  
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
    date: createdAt.toISOString().split('T')[0],
    time: createdAt.toTimeString().slice(0, 5),
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
        .replace(/\[Thinking\]([\s\S]*?)(?=\[Tool|\n\n|$)/g, (_, thinking: string) => {
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
