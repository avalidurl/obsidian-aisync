import * as fs from 'fs';
import * as path from 'path';

/**
 * Recursively find all .jsonl files in a directory
 */
export function findJsonlFiles(dir: string): string[] {
  const files: string[] = [];
  
  function walkDir(currentDir: string) {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          walkDir(fullPath);
        } else if (entry.name.endsWith('.jsonl')) {
          files.push(fullPath);
        }
      }
    } catch (e) {
      // Permission denied or other errors - silently skip
      console.debug(`Skipping directory ${currentDir}:`, e);
    }
  }
  
  walkDir(dir);
  return files;
}

/**
 * Recursively find transcript files in Cursor's agent-transcripts folders
 */
export function findTranscriptFiles(dir: string): string[] {
  const files: string[] = [];
  
  function walkDir(currentDir: string) {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'agent-transcripts') {
            // Found transcripts folder, get all .txt files
            const transcripts = fs.readdirSync(fullPath, { withFileTypes: true });
            for (const t of transcripts) {
              if (t.isFile() && t.name.endsWith('.txt')) {
                files.push(path.join(fullPath, t.name));
              }
            }
          } else {
            walkDir(fullPath);
          }
        }
      }
    } catch (e) {
      // Permission denied or other errors - silently skip
      console.debug(`Skipping directory ${currentDir}:`, e);
    }
  }
  
  walkDir(dir);
  return files;
}

/**
 * Format a date object to YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Format a date object to HH:MM
 */
export function formatTime(date: Date): string {
  return date.toTimeString().slice(0, 5);
}

/**
 * Escape special characters in YAML strings
 */
export function escapeYaml(str: string): string {
  return str
    .replace(/"/g, '\\"')
    .replace(/\n/g, ' ')
    .slice(0, 100);
}
