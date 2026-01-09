/**
 * Secret redaction patterns and utilities
 */

const SECRET_PATTERNS: [RegExp, string][] = [
  // API Keys
  [/sk-[a-zA-Z0-9]{20,}/g, '[REDACTED: OpenAI API Key]'],
  [/sk-proj-[a-zA-Z0-9_-]{50,}/g, '[REDACTED: OpenAI Project Key]'],
  [/sk-ant-[a-zA-Z0-9_-]{50,}/g, '[REDACTED: Anthropic API Key]'],
  [/xai-[a-zA-Z0-9]{20,}/g, '[REDACTED: xAI API Key]'],
  [/AIza[a-zA-Z0-9_-]{35}/g, '[REDACTED: Google API Key]'],
  [/AKIA[A-Z0-9]{16}/g, '[REDACTED: AWS Access Key]'],
  
  // GitHub tokens
  [/ghp_[a-zA-Z0-9]{36}/g, '[REDACTED: GitHub Token]'],
  [/gho_[a-zA-Z0-9]{36}/g, '[REDACTED: GitHub OAuth Token]'],
  [/github_pat_[a-zA-Z0-9_]{22,}/g, '[REDACTED: GitHub PAT]'],
  [/glpat-[a-zA-Z0-9_-]{20,}/g, '[REDACTED: GitLab Token]'],
  
  // Other tokens
  [/npm_[a-zA-Z0-9]{36}/g, '[REDACTED: NPM Token]'],
  [/xox[baprs]-[a-zA-Z0-9-]{10,}/g, '[REDACTED: Slack Token]'],
  [/sk_live_[a-zA-Z0-9]{24,}/g, '[REDACTED: Stripe Live Key]'],
  [/sk_test_[a-zA-Z0-9]{24,}/g, '[REDACTED: Stripe Test Key]'],
  [/supabase_[a-zA-Z0-9_-]{20,}/g, '[REDACTED: Supabase Key]'],
  [/sb_[a-zA-Z0-9_-]{20,}/g, '[REDACTED: Supabase Key]'],
  
  // Bearer tokens and JWTs
  [/Bearer [a-zA-Z0-9_.+-]{20,}/g, '[REDACTED: Bearer Token]'],
  [/eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, '[REDACTED: JWT Token]'],
  
  // Database URLs
  [/postgres(ql)?:\/\/[^\s]+/g, '[REDACTED: Database URL]'],
  [/mysql:\/\/[^\s]+/g, '[REDACTED: Database URL]'],
  [/mongodb(\+srv)?:\/\/[^\s]+/g, '[REDACTED: MongoDB URL]'],
  [/redis:\/\/[^\s]+/g, '[REDACTED: Redis URL]'],
  
  // Private keys
  [/-----BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY( BLOCK)?-----[\s\S]*?-----END (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY( BLOCK)?-----/g, '[REDACTED: Private Key Block]'],
  [/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g, '[REDACTED: Certificate Block]'],
];

// Case-insensitive patterns
const SECRET_PATTERNS_CI: [RegExp, string][] = [
  [/password\s*[=:]\s*["']?[a-zA-Z0-9_.!@#$%^&*-]{8,}["']?/gi, '[REDACTED: Password]'],
  [/api[_-]?key\s*[=:]\s*["']?[a-zA-Z0-9_-]{16,}["']?/gi, '[REDACTED: API Key]'],
  [/secret\s*[=:]\s*["']?[a-zA-Z0-9_-]{16,}["']?/gi, '[REDACTED: Secret]'],
  [/token\s*[=:]\s*["']?[a-zA-Z0-9_.-]{20,}["']?/gi, '[REDACTED: Token]'],
];

export function redactSecrets(text: string): string {
  if (!text) return text;
  
  let result = text;
  
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  
  for (const [pattern, replacement] of SECRET_PATTERNS_CI) {
    result = result.replace(pattern, replacement);
  }
  
  return result;
}
