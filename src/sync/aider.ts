import { App, TFile } from 'obsidian';
import { redactSecrets } from './redact';
import { SYNC_FOOTER_MARKER, generateSyncFooter } from './utils';
import * as fs from 'fs';
import * as path from 'path';

interface AiderSession {
  date: string;
  messages: Message[];
  project: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export async function syncAider(app: App, homeDir: string, outputFolder: string): Promise<number> {
  const globalHistory = path.join(homeDir, '.aider.chat.history.md');
  const outputDir = `${outputFolder}/aider-sessions`;
  
  let syncedCount = 0;
  const historyFiles: string[] = [];
  
  // Check global history
  if (fs.existsSync(globalHistory)) {
    historyFiles.push(globalHistory);
  }
  
  // Look for project-specific histories
  const projectDirs = [
    path.join(homeDir, 'Documents'),
    path.join(homeDir, 'Projects'),
    path.join(homeDir, 'Code'),
    path.join(homeDir, 'Developer'),
    path.join(homeDir, 'GitHub'),
  ];
  
  for (const dir of projectDirs) {
    if (fs.existsSync(dir)) {
      findAiderHistories(dir, historyFiles);
    }
  }
  
  if (historyFiles.length === 0) {
    return 0;
  }
  
  for (const historyFile of historyFiles) {
    const sessions = parseAiderHistory(historyFile);
    const isGlobal = historyFile === globalHistory;
    const project = isGlobal ? 'global' : path.basename(path.dirname(historyFile));
    
    for (let i = 0; i < sessions.length; i++) {
      const session = sessions[i];
      if (session.messages.length === 0) continue;

      // Use stable session identifier based on date, project, and index
      const projectSlug = project.toLowerCase().slice(0, 20).replace(/[^a-z0-9-]/g, '-');
      const sessionId = `${session.date}-${projectSlug}-${String(i + 1).padStart(3, '0')}`;
      const filename = `aider-${sessionId}.md`;
      const filePath = `${outputDir}/${filename}`;

      // Find any existing file with same session identifier
      const existingFiles = app.vault.getFiles().filter(f =>
        f.path.startsWith(outputDir) &&
        f.path.includes(sessionId) &&
        f.extension === 'md'
      );

      const sourceMtime = fs.statSync(historyFile).mtime.getTime();

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
        const sourceUserCount = session.messages.filter(m => m.role === 'user').length;

        if (sourceUserCount > existingUserCount) {
          // Find new exchanges: messages after the last synced user exchange
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
              appendContent += `## 🔧 Aider\n\n${content}\n\n---\n\n`;
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
      try {
        const markdown = generateMarkdown(session, project, i + 1);
        await app.vault.create(filePath, markdown);
        syncedCount++;
      } catch (e) {
        console.error(`Error creating ${filePath}:`, e);
      }
    }
  }
  
  return syncedCount;
}

function findAiderHistories(dir: string, results: string[], depth = 0): void {
  if (depth > 5) return;
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === '.aider.chat.history.md') {
        results.push(fullPath);
      } else if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        findAiderHistories(fullPath, results, depth + 1);
      }
    }
  } catch {
    // Permission denied or other error
  }
}

function parseAiderHistory(filePath: string): AiderSession[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const sessions: AiderSession[] = [];
  
  let currentSession: Message[] = [];
  let currentRole: 'user' | 'assistant' | null = null;
  let currentContent: string[] = [];
  let currentDate: string | null = null;
  
  const lines = content.split('\n');
  
  for (const line of lines) {
    // Check for date markers
    const dateMatch = line.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch && !currentDate) {
      currentDate = dateMatch[1];
    }
    
    // Check for role markers
    if (line.startsWith('#### ')) {
      // Save previous message
      if (currentRole && currentContent.length > 0) {
        currentSession.push({
          role: currentRole,
          content: currentContent.join('\n').trim()
        });
      }
      
      const roleText = line.slice(5).toLowerCase();
      if (roleText.includes('user') || roleText.includes('human')) {
        currentRole = 'user';
      } else {
        currentRole = 'assistant';
      }
      currentContent = [];
    } else if (line.startsWith('---') && line.length > 5) {
      // Session separator
      if (currentRole && currentContent.length > 0) {
        currentSession.push({
          role: currentRole,
          content: currentContent.join('\n').trim()
        });
      }
      if (currentSession.length > 0) {
        sessions.push({
          date: currentDate || new Date().toISOString().split('T')[0],
          messages: currentSession,
          project: ''
        });
      }
      currentSession = [];
      currentRole = null;
      currentContent = [];
      currentDate = null;
    } else if (currentRole) {
      currentContent.push(line);
    }
  }
  
  // Save last message/session
  if (currentRole && currentContent.length > 0) {
    currentSession.push({
      role: currentRole,
      content: currentContent.join('\n').trim()
    });
  }
  if (currentSession.length > 0) {
    sessions.push({
      date: currentDate || new Date().toISOString().split('T')[0],
      messages: currentSession,
      project: ''
    });
  }
  
  return sessions;
}

function generateMarkdown(session: AiderSession, project: string, idx: number): string {
  const firstUserMsg = session.messages.find(m => m.role === 'user')?.content.slice(0, 80) || 'Session';
  
  let md = `---
type: aider-session
date: ${session.date}
session_idx: ${idx}
project: "${project}"
tags:
  - aider
  - ai-session
  - coding
summary: "${firstUserMsg.replace(/"/g, '\\"').replace(/\n/g, ' ')}..."
---

# 🔧 Aider Session — ${session.date}

| Property | Value |
|----------|-------|
| **Date** | ${session.date} |
| **Project** | \`${project}\` |
| **Session** | #${idx} |

---

`;

  for (const msg of session.messages) {
    const content = redactSecrets(msg.content);
    if (msg.role === 'user') {
      md += `## 👤 User\n\n${content}\n\n---\n\n`;
    } else {
      md += `## 🔧 Aider\n\n${content}\n\n---\n\n`;
    }
  }

  md += generateSyncFooter();

  return md;
}
