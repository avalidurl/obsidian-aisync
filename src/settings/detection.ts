/**
 * Auto-detection system for installed AI tools
 */

import { TOOL_CONFIGS, ToolType, DetectedTool } from '../types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Detect installed AI tools and count their sessions
 */
export function detectInstalledTools(homeDir: string): DetectedTool[] {
  const detected: DetectedTool[] = [];

  for (const config of TOOL_CONFIGS) {
    const result = detectTool(homeDir, config);
    detected.push(result);
  }

  // Sort by session count (most active first), then by installed status
  return detected.sort((a, b) => {
    if (a.installed !== b.installed) return a.installed ? -1 : 1;
    return b.sessionCount - a.sessionCount;
  });
}

/**
 * Detect a single tool
 */
function detectTool(homeDir: string, config: typeof TOOL_CONFIGS[number]): DetectedTool {
  let dataPath = '';
  let sessionCount = 0;
  let installed = false;

  for (const relativePath of config.dataPaths) {
    const fullPath = path.join(homeDir, relativePath);

    if (fs.existsSync(fullPath)) {
      installed = true;
      dataPath = fullPath;

      // Count sessions based on tool type
      if (config.type === 'claude-code') {
        sessionCount = countJsonlFiles(fullPath);
      } else if (config.type === 'cursor') {
        sessionCount = countTranscriptFiles(fullPath);
      } else if (config.type === 'copilot') {
        sessionCount = countCopilotSessions(fullPath);
      } else if (config.type === 'codex') {
        sessionCount = countJsonlFiles(fullPath);
      } else if (config.type === 'opencode') {
        sessionCount = countOpenCodeDatabases(homeDir);
      }

      break; // Found a valid path
    }
  }

  return {
    type: config.type,
    name: config.name,
    icon: config.icon,
    dataPath,
    installed,
    sessionCount
  };
}

/**
 * Count JSONL files recursively
 */
function countJsonlFiles(dir: string): number {
  let count = 0;

  function walk(currentDir: string) {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.name.endsWith('.jsonl')) {
          count++;
        }
      }
    } catch { /* skip */ }
  }

  walk(dir);
  return count;
}

/**
 * Count Cursor transcript files
 */
function countTranscriptFiles(dir: string): number {
  let count = 0;

  function walk(currentDir: string) {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'agent-transcripts') {
            const transcripts = fs.readdirSync(fullPath);
            count += transcripts.filter(f => f.endsWith('.txt')).length;
          } else {
            walk(fullPath);
          }
        }
      }
    } catch { /* skip */ }
  }

  walk(dir);
  return count;
}

/**
 * Count Copilot chat sessions
 */
function countCopilotSessions(dir: string): number {
  let count = 0;

  function walk(currentDir: string) {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.name.endsWith('.json') &&
                   (entry.name.includes('chat') || entry.name.includes('session') || entry.name.includes('conversation'))) {
          count++;
        }
      }
    } catch { /* skip */ }
  }

  walk(dir);
  return count;
}

/**
 * Count OpenCode databases across project directories
 */
function countOpenCodeDatabases(homeDir: string): number {
  const searchDirs = [
    path.join(homeDir, 'Documents'),
    path.join(homeDir, 'Projects'),
    path.join(homeDir, 'Code'),
    path.join(homeDir, 'Developer'),
    path.join(homeDir, 'GitHub'),
    path.join(homeDir, 'dev'),
    homeDir,
  ];

  const dbFiles = new Set<string>();

  function walk(currentDir: string, depth = 0) {
    if (depth > 5) return;
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === '.opencode') {
            const dbPath = path.join(fullPath, 'opencode.db');
            if (fs.existsSync(dbPath)) dbFiles.add(dbPath);
          } else if (!entry.name.startsWith('.') && !['node_modules', 'vendor', 'dist', 'build'].includes(entry.name)) {
            walk(fullPath, depth + 1);
          }
        }
      }
    } catch { /* skip */ }
  }

  for (const dir of searchDirs) {
    if (fs.existsSync(dir)) walk(dir);
  }

  return dbFiles.size;
}

/**
 * Get only enabled/installed tools
 */
export function getEnabledTools(detected: DetectedTool[], enabledTypes: ToolType[]): DetectedTool[] {
  if (enabledTypes.length === 0) {
    // Auto-mode: return all installed tools
    return detected.filter(t => t.installed);
  }
  return detected.filter(t => enabledTypes.includes(t.type) && t.installed);
}
