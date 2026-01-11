/**
 * Core type definitions for AI Sync plugin v2.0
 */

// Tool types - only the 5 core tools
export type ToolType = 'claude-code' | 'cursor' | 'copilot' | 'codex' | 'opencode';

// Tool display configuration
export interface ToolConfig {
  type: ToolType;
  name: string;
  icon: string;
  dataPaths: string[];  // Paths relative to home dir to search for sessions
  filePattern?: RegExp; // Pattern for session files
}

// Tool detection result
export interface DetectedTool {
  type: ToolType;
  name: string;
  icon: string;
  dataPath: string;     // First found path
  installed: boolean;
  sessionCount: number;
}

// Unified message type
export interface Message {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  timestamp?: Date;
  toolName?: string;
  toolInput?: string;
  toolOutput?: string;
}

// Session metadata - unified across all adapters
export interface SessionMeta {
  sessionId: string;
  date: string;          // YYYY-MM-DD
  time: string;          // HH:MM
  tool: ToolType;
  project?: string;      // Project name extracted from path
  workingDir?: string;   // Working directory/cwd
  title?: string;        // Smart extracted title
  model?: string;        // AI model used
  version?: string;      // Tool version
  messageCount: number;
}

// Parsed session ready for sync
export interface ParsedSession {
  meta: SessionMeta;
  messages: Message[];
  sourceFile: string;
  sourceMtime: number;
}

// Enhanced frontmatter for Dataview
export interface EnhancedFrontmatter {
  type: 'ai-session';
  tool: ToolType;
  date: string;
  time: string;
  session_id: string;
  project: string;
  project_path: string;
  title: string;
  message_count: number;
  user_messages: number;
  assistant_messages: number;
  duration_estimate: string;
  model?: string;
  tags: string[];
  created: string;
  modified: string;
}

// Organization modes
export type OrganizationMode = 'flat' | 'by-project' | 'by-tool';

// Plugin settings - simplified
export interface AISyncSettings {
  // Output configuration
  outputFolder: string;
  organizationMode: OrganizationMode;

  // Detection & filtering
  enabledTools: ToolType[];
  minimumMessages: number;

  // Auto-sync
  autoSyncInterval: number;

  // Digest
  weeklyDigestEnabled: boolean;
  weeklyDigestDay: number;  // 0=Sunday, 6=Saturday

  // State tracking
  lastSync: string;
  lastDigest: string;
}

// Default settings
export const DEFAULT_SETTINGS: AISyncSettings = {
  outputFolder: 'ai-sessions',
  organizationMode: 'flat',
  enabledTools: [],  // Will be populated by auto-detection
  minimumMessages: 3,
  autoSyncInterval: 0,
  weeklyDigestEnabled: false,
  weeklyDigestDay: 1,  // Monday
  lastSync: '',
  lastDigest: ''
};

// Tool configurations
export const TOOL_CONFIGS: ToolConfig[] = [
  {
    type: 'claude-code',
    name: 'Claude Code',
    icon: '🤖',
    dataPaths: ['.claude/projects'],
    filePattern: /\.jsonl$/
  },
  {
    type: 'cursor',
    name: 'Cursor',
    icon: '🖱️',
    dataPaths: ['.cursor/projects'],
    filePattern: /\.txt$/
  },
  {
    type: 'copilot',
    name: 'GitHub Copilot',
    icon: '🐙',
    dataPaths: [
      'Library/Application Support/Code/User/globalStorage/github.copilot-chat',
      'Library/Application Support/Cursor/User/globalStorage/github.copilot-chat',
      '.config/Code/User/globalStorage/github.copilot-chat',
      'AppData/Roaming/Code/User/globalStorage/github.copilot-chat'
    ],
    filePattern: /\.json$/
  },
  {
    type: 'codex',
    name: 'Codex CLI',
    icon: '💻',
    dataPaths: ['.codex/sessions'],
    filePattern: /\.jsonl$/
  },
  {
    type: 'opencode',
    name: 'OpenCode',
    icon: '⚡',
    dataPaths: ['Documents', 'Projects', 'Code', 'Developer', 'GitHub', 'dev', '.'],
    filePattern: /opencode\.db$/
  }
];

// Sync result
export interface SyncResult {
  tool: ToolType;
  synced: number;
  errors: string[];
}

// Digest stats
export interface DigestStats {
  totalSessions: number;
  totalMessages: number;
  byTool: Record<ToolType, number>;
  byProject: Record<string, number>;
  topProjects: Array<{ name: string; sessions: number }>;
  estimatedHours: number;
}
