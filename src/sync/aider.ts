import { App } from 'obsidian';
import { redactSecrets } from './redact';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

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
      
      const contentHash = crypto.createHash('md5')
        .update(JSON.stringify(session.messages))
        .digest('hex')
        .slice(0, 8);
      
      const filename = `aider-${session.date}-${project.toLowerCase().slice(0, 20)}-${String(i + 1).padStart(3, '0')}-${contentHash}.md`;
      const filePath = `${outputDir}/${filename}`;
      
      const existingFile = app.vault.getAbstractFileByPath(filePath);
      if (existingFile) continue;
      
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

  const syncTime = new Date().toISOString();
  md += `\n---\n*🔌 Synced via Obsidian Plugin at ${syncTime} — secrets redacted*\n`;
  
  return md;
}
