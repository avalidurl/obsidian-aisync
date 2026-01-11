/**
 * Base adapter class that eliminates code duplication across all sync adapters.
 * Each tool adapter only needs to implement discovery and parsing logic.
 */

import { App, TFile } from 'obsidian';
import { ParsedSession, Message, SessionMeta, ToolType, OrganizationMode } from '../types';
import { redactSecrets } from './redact';
import { SYNC_FOOTER_MARKER, generateSyncFooter } from './utils';

export abstract class BaseAdapter {
  protected app: App;
  protected homeDir: string;
  protected outputFolder: string;
  protected organizationMode: OrganizationMode;
  protected minimumMessages: number;

  // Abstract properties - each adapter defines these
  abstract readonly toolType: ToolType;
  abstract readonly toolName: string;
  abstract readonly toolIcon: string;

  constructor(
    app: App,
    homeDir: string,
    outputFolder: string,
    organizationMode: OrganizationMode = 'flat',
    minimumMessages: number = 3
  ) {
    this.app = app;
    this.homeDir = homeDir;
    this.outputFolder = outputFolder;
    this.organizationMode = organizationMode;
    this.minimumMessages = minimumMessages;
  }

  /**
   * Main sync method - template method pattern
   * Subclasses only need to implement discoverSessions()
   */
  async sync(): Promise<number> {
    const sessions = await this.discoverSessions();
    let syncedCount = 0;

    for (const session of sessions) {
      // Skip trivial sessions
      if (session.messages.length < this.minimumMessages) {
        continue;
      }

      try {
        const synced = await this.syncSession(session);
        if (synced) syncedCount++;
      } catch (e) {
        console.error(`[${this.toolName}] Error syncing session ${session.meta.sessionId}:`, e);
      }
    }

    return syncedCount;
  }

  /**
   * Abstract: Each adapter discovers sessions from its data source
   */
  abstract discoverSessions(): Promise<ParsedSession[]>;

  /**
   * Sync a single session - creates new file or appends to existing
   */
  protected async syncSession(session: ParsedSession): Promise<boolean> {
    const outputDir = this.getOutputDir(session);
    const filename = this.generateFilename(session);
    const filePath = `${outputDir}/${filename}`;

    // Find existing file by session ID
    const existingFile = this.findExistingFile(session.meta.sessionId, outputDir);

    if (existingFile) {
      // Check if source changed
      if (session.sourceMtime <= existingFile.stat.mtime) {
        return false;
      }
      return await this.appendToExisting(existingFile, session);
    }

    // Create new file
    await this.ensureFolder(outputDir);
    const markdown = this.generateMarkdown(session);
    await this.app.vault.create(filePath, markdown);
    return true;
  }

  /**
   * Append new messages to existing session file
   */
  protected async appendToExisting(file: TFile, session: ParsedSession): Promise<boolean> {
    const existingContent = await this.app.vault.read(file);

    // Count existing user messages (anchored to line start to avoid false matches)
    const existingUserCount = (existingContent.match(/^## 👤 User$/gm) || []).length;
    const sourceUserCount = session.messages.filter(m => m.role === 'user').length;

    if (sourceUserCount <= existingUserCount) {
      return false;
    }

    // Find new messages after last synced user
    const newMessages = this.getNewMessages(session.messages, existingUserCount);
    if (newMessages.length === 0) return false;

    const appendContent = this.formatMessages(newMessages);

    // Insert before footer or append at end
    let updatedContent: string;
    if (existingContent.includes(SYNC_FOOTER_MARKER)) {
      updatedContent = existingContent.replace(
        SYNC_FOOTER_MARKER,
        appendContent + SYNC_FOOTER_MARKER
      );
    } else {
      updatedContent = existingContent + '\n' + appendContent;
    }

    await this.app.vault.modify(file, updatedContent);
    return true;
  }

  /**
   * Generate full markdown for new session
   */
  protected generateMarkdown(session: ParsedSession): string {
    const frontmatter = this.generateFrontmatter(session);
    const header = this.generateHeader(session);
    const body = this.formatMessages(session.messages);
    const footer = generateSyncFooter();

    return `${frontmatter}\n${header}\n${body}${footer}`;
  }

  /**
   * Generate enhanced frontmatter for Dataview queries
   */
  protected generateFrontmatter(session: ParsedSession): string {
    const m = session.meta;
    const title = this.extractTitle(session);
    const userMsgs = session.messages.filter(msg => msg.role === 'user').length;
    const asstMsgs = session.messages.filter(msg => msg.role === 'assistant').length;

    let yaml = `---
type: ai-session
tool: ${m.tool}
date: ${m.date}
time: "${m.time}"
session_id: "${m.sessionId}"
project: "${m.project || 'unknown'}"
project_path: "${this.escapeYaml(m.workingDir || '')}"
title: "${this.escapeYaml(title)}"
message_count: ${m.messageCount}
user_messages: ${userMsgs}
assistant_messages: ${asstMsgs}
duration_estimate: "${this.estimateDuration(session)}"`;

    if (m.model) {
      yaml += `\nmodel: "${m.model}"`;
    }

    yaml += `
tags:
  - ai-session
  - ${m.tool}
  - coding
created: ${new Date().toISOString()}
modified: ${new Date().toISOString()}
---`;

    return yaml;
  }

  /**
   * Generate session header with metadata table
   */
  protected generateHeader(session: ParsedSession): string {
    const m = session.meta;
    const title = this.extractTitle(session);

    let header = `
# ${this.toolIcon} ${title}

| Property | Value |
|----------|-------|
| **Tool** | ${this.toolName} |
| **Date** | ${m.date} ${m.time} |
| **Project** | \`${m.project || 'unknown'}\` |
| **Session ID** | \`${m.sessionId}\` |`;

    if (m.model) {
      header += `\n| **Model** | ${m.model} |`;
    }

    header += `

---

`;

    return header;
  }

  /**
   * Format messages to markdown with tool-specific headers
   */
  protected formatMessages(messages: Message[]): string {
    let content = '';

    for (const msg of messages) {
      const text = redactSecrets(msg.content);
      if (!text || !text.trim()) continue;

      if (msg.role === 'user') {
        content += `## 👤 User\n\n${text}\n\n---\n\n`;
      } else if (msg.role === 'assistant') {
        content += `## ${this.toolIcon} ${this.toolName}\n\n${text}\n\n---\n\n`;
      } else if (msg.role === 'tool' && msg.toolName) {
        content += `**🔧 Tool: ${msg.toolName}**\n`;
        if (msg.toolInput) {
          const input = msg.toolInput.slice(0, 500);
          content += `\`\`\`\n${input}\n\`\`\`\n`;
        }
        if (msg.toolOutput) {
          const output = msg.toolOutput.slice(0, 1000);
          content += `**📤 Result:**\n\`\`\`\n${output}\n\`\`\`\n\n`;
        }
      }
    }

    return content;
  }

  /**
   * Extract smart title from first user message
   */
  protected extractTitle(session: ParsedSession): string {
    // Use provided title if available
    if (session.meta.title) {
      return session.meta.title;
    }

    const firstUser = session.messages.find(m => m.role === 'user');
    if (!firstUser) return `${this.toolName} Session`;

    let title = firstUser.content
      .split('\n')[0]              // First line only
      .replace(/^[#*>\-\s]+/, '')  // Remove markdown prefixes
      .replace(/[`"']/g, '')       // Remove quotes
      .slice(0, 60)                // Limit length
      .trim();

    // If title is too short, try more content
    if (title.length < 10) {
      title = firstUser.content
        .slice(0, 60)
        .replace(/\n/g, ' ')
        .replace(/[`"']/g, '')
        .trim();
    }

    return title || `${this.toolName} Session`;
  }

  /**
   * Estimate session duration based on message count
   */
  protected estimateDuration(session: ParsedSession): string {
    const msgCount = session.messages.length;
    const minutes = Math.ceil(msgCount * 2);  // ~2 min per exchange

    if (minutes < 5) return '~5 min';
    if (minutes < 15) return '~15 min';
    if (minutes < 30) return '~30 min';
    if (minutes < 60) return '~1 hour';
    return `~${Math.ceil(minutes / 60)} hours`;
  }

  /**
   * Get output directory based on organization mode
   */
  protected getOutputDir(session: ParsedSession): string {
    const project = this.sanitizeProjectName(session.meta.project || 'uncategorized');

    switch (this.organizationMode) {
      case 'by-project':
        return `${this.outputFolder}/projects/${project}`;

      case 'by-tool':
        return `${this.outputFolder}/${this.toolType}/${project}`;

      case 'flat':
      default:
        return `${this.outputFolder}/${this.toolType}-sessions`;
    }
  }

  /**
   * Generate filename with smart title slug
   */
  protected generateFilename(session: ParsedSession): string {
    const m = session.meta;
    const titleSlug = this.extractTitle(session)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30);

    return `${m.tool}-${m.date}-${m.time.replace(':', '')}-${titleSlug}-${m.sessionId.slice(0, 8)}.md`;
  }

  /**
   * Find existing file by session ID
   */
  protected findExistingFile(sessionId: string, outputDir: string): TFile | null {
    const shortId = sessionId.slice(0, 8);
    const files = this.app.vault.getFiles().filter(f =>
      f.path.startsWith(outputDir) &&
      f.path.includes(shortId) &&
      f.extension === 'md'
    );
    return files.length > 0 ? files[0] : null;
  }

  /**
   * Get messages that haven't been synced yet
   */
  protected getNewMessages(messages: Message[], existingUserCount: number): Message[] {
    const newMessages: Message[] = [];
    let userIdx = 0;

    for (const msg of messages) {
      if (msg.role === 'user') userIdx++;
      if (userIdx > existingUserCount) {
        newMessages.push(msg);
      }
    }

    return newMessages;
  }

  /**
   * Ensure folder exists in vault
   */
  protected async ensureFolder(folderPath: string): Promise<void> {
    // Split path and create each level
    const parts = folderPath.split('/');
    let currentPath = '';

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const folder = this.app.vault.getAbstractFileByPath(currentPath);
      if (!folder) {
        try {
          await this.app.vault.createFolder(currentPath);
        } catch {
          // Folder might already exist
        }
      }
    }
  }

  /**
   * Escape YAML special characters
   */
  protected escapeYaml(str: string): string {
    return str
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, ' ')
      .slice(0, 200);
  }

  /**
   * Sanitize project name for folder/file usage
   */
  protected sanitizeProjectName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50) || 'unknown';
  }

  /**
   * Extract project name from working directory path
   */
  protected extractProjectFromPath(workingDir: string): string {
    if (!workingDir) return 'unknown';

    const parts = workingDir.split(/[/\\]/);

    // Skip common prefixes and find meaningful project name
    const skipPrefixes = ['Users', 'home', 'Documents', 'Projects', 'Code', 'GitHub', 'dev', 'Developer'];

    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i];
      if (part && !skipPrefixes.includes(part) && !part.startsWith('.')) {
        return part;
      }
    }

    return 'unknown';
  }
}
