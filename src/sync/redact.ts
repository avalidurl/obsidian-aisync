/**
 * Secret redaction patterns and utilities
 */

const SECRET_PATTERNS: [RegExp, string][] = [
  // API Keys - Major AI providers
  [/sk-[a-zA-Z0-9]{20,}/g, '[REDACTED: OpenAI API Key]'],
  [/sk-proj-[a-zA-Z0-9_-]{50,}/g, '[REDACTED: OpenAI Project Key]'],
  [/sk-ant-[a-zA-Z0-9_-]{50,}/g, '[REDACTED: Anthropic API Key]'],
  [/xai-[a-zA-Z0-9]{20,}/g, '[REDACTED: xAI API Key]'],
  [/AIza[a-zA-Z0-9_-]{35}/g, '[REDACTED: Google API Key]'],
  [/hf_[a-zA-Z0-9]{34,}/g, '[REDACTED: Hugging Face Token]'],
  [/r8_[a-zA-Z0-9]{34,}/g, '[REDACTED: Replicate API Token]'],
  [/together_[a-zA-Z0-9]{32,}/g, '[REDACTED: Together AI Key]'],
  [/pplx-[a-zA-Z0-9]{48,}/g, '[REDACTED: Perplexity API Key]'],
  [/gsk_[a-zA-Z0-9]{52,}/g, '[REDACTED: Groq API Key]'],

  // Cloud providers - AWS
  [/AKIA[A-Z0-9]{16}/g, '[REDACTED: AWS Access Key]'],
  [/(?:aws[_-]?secret[_-]?access[_-]?key|AWS_SECRET_ACCESS_KEY)[=:\s]+["']?[a-zA-Z0-9/+=]{40}["']?/gi, '[REDACTED: AWS Secret Key]'],

  // Cloud providers - Azure
  [/az-[a-zA-Z0-9]{32,}/g, '[REDACTED: Azure Key]'],
  [/AccountKey=[a-zA-Z0-9+/=]{88}/g, '[REDACTED: Azure Storage Key]'],
  [/DefaultEndpointsProtocol=https;AccountName=[^;]+;AccountKey=[a-zA-Z0-9+/=]+/g, '[REDACTED: Azure Connection String]'],

  // Vercel & deployment platforms
  [/vercel_[a-zA-Z0-9_]{24,}/gi, '[REDACTED: Vercel Token]'],
  [/vc_[a-zA-Z0-9_]{24,}/g, '[REDACTED: Vercel Token]'],
  [/netlify[_-]?[a-zA-Z0-9_-]{40,}/gi, '[REDACTED: Netlify Token]'],
  [/fly_[a-zA-Z0-9_-]{43}/g, '[REDACTED: Fly.io Token]'],
  [/railway_[a-zA-Z0-9_-]{36}/gi, '[REDACTED: Railway Token]'],
  [/render_[a-zA-Z0-9_-]{20,}/gi, '[REDACTED: Render Token]'],

  // GitHub/GitLab tokens
  [/ghp_[a-zA-Z0-9]{36}/g, '[REDACTED: GitHub Token]'],
  [/gho_[a-zA-Z0-9]{36}/g, '[REDACTED: GitHub OAuth Token]'],
  [/ghu_[a-zA-Z0-9]{36}/g, '[REDACTED: GitHub User Token]'],
  [/ghs_[a-zA-Z0-9]{36}/g, '[REDACTED: GitHub Server Token]'],
  [/ghr_[a-zA-Z0-9]{36}/g, '[REDACTED: GitHub Refresh Token]'],
  [/github_pat_[a-zA-Z0-9_]{22,}/g, '[REDACTED: GitHub PAT]'],
  [/glpat-[a-zA-Z0-9_-]{20,}/g, '[REDACTED: GitLab Token]'],
  [/glcbt-[a-zA-Z0-9_-]{20,}/g, '[REDACTED: GitLab CI Token]'],

  // Communication platforms
  [/xox[baprs]-[a-zA-Z0-9-]{10,}/g, '[REDACTED: Slack Token]'],
  [/hooks\.slack\.com\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[a-zA-Z0-9]+/g, '[REDACTED: Slack Webhook]'],
  [/[MN][A-Za-z\d]{23,}\.[\w-]{6}\.[\w-]{27,}/g, '[REDACTED: Discord Bot Token]'],
  [/discord\.com\/api\/webhooks\/\d+\/[a-zA-Z0-9_-]+/g, '[REDACTED: Discord Webhook]'],
  [/AC[a-z0-9]{32}/g, '[REDACTED: Twilio Account SID]'],
  [/SK[a-z0-9]{32}/g, '[REDACTED: Twilio API Key]'],
  [/twilio[_-]?auth[_-]?token[=:\s]+["']?[a-zA-Z0-9]{32}["']?/gi, '[REDACTED: Twilio Auth Token]'],
  [/SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}/g, '[REDACTED: SendGrid API Key]'],

  // Payment processors
  [/sk_live_[a-zA-Z0-9]{24,}/g, '[REDACTED: Stripe Live Key]'],
  [/sk_test_[a-zA-Z0-9]{24,}/g, '[REDACTED: Stripe Test Key]'],
  [/pk_live_[a-zA-Z0-9]{24,}/g, '[REDACTED: Stripe Publishable Key]'],
  [/pk_test_[a-zA-Z0-9]{24,}/g, '[REDACTED: Stripe Test Publishable Key]'],
  [/rk_live_[a-zA-Z0-9]{24,}/g, '[REDACTED: Stripe Restricted Key]'],
  [/whsec_[a-zA-Z0-9]{32,}/g, '[REDACTED: Stripe Webhook Secret]'],
  [/sq0[a-z]{3}-[a-zA-Z0-9_-]{22,}/g, '[REDACTED: Square Token]'],
  [/EAAA[a-zA-Z0-9]{60,}/g, '[REDACTED: PayPal Token]'],

  // Package managers & registries
  [/npm_[a-zA-Z0-9]{36}/g, '[REDACTED: NPM Token]'],
  [/pypi-[a-zA-Z0-9_-]{100,}/g, '[REDACTED: PyPI Token]'],
  [/nuget[_-]?api[_-]?key[=:\s]+["']?[a-zA-Z0-9-]{36,}["']?/gi, '[REDACTED: NuGet API Key]'],
  [/rubygems_[a-zA-Z0-9]{48}/g, '[REDACTED: RubyGems API Key]'],

  // Databases & BaaS
  [/supabase_[a-zA-Z0-9_-]{20,}/g, '[REDACTED: Supabase Key]'],
  [/sb_[a-zA-Z0-9_-]{20,}/g, '[REDACTED: Supabase Key]'],
  [/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, '[REDACTED: Supabase JWT]'],
  [/firebase[a-zA-Z0-9_-]{30,}/gi, '[REDACTED: Firebase Key]'],
  [/planetscale_[a-zA-Z0-9_-]{40,}/gi, '[REDACTED: PlanetScale Token]'],
  [/dop_v1_[a-zA-Z0-9]{64}/g, '[REDACTED: DigitalOcean Token]'],
  [/neon_[a-zA-Z0-9_-]{36,}/g, '[REDACTED: Neon DB Token]'],

  // Bearer tokens and JWTs
  [/Bearer [a-zA-Z0-9_.+-]{20,}/g, '[REDACTED: Bearer Token]'],
  [/eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, '[REDACTED: JWT Token]'],

  // Database URLs
  [/postgres(ql)?:\/\/[^\s"']+/g, '[REDACTED: Database URL]'],
  [/mysql:\/\/[^\s"']+/g, '[REDACTED: Database URL]'],
  [/mongodb(\+srv)?:\/\/[^\s"']+/g, '[REDACTED: MongoDB URL]'],
  [/redis:\/\/[^\s"']+/g, '[REDACTED: Redis URL]'],
  [/amqp:\/\/[^\s"']+/g, '[REDACTED: RabbitMQ URL]'],

  // Private keys & certificates
  [/-----BEGIN (RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY( BLOCK)?-----[\s\S]*?-----END (RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY( BLOCK)?-----/g, '[REDACTED: Private Key Block]'],
  [/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g, '[REDACTED: Certificate Block]'],
  [/-----BEGIN PGP MESSAGE-----[\s\S]*?-----END PGP MESSAGE-----/g, '[REDACTED: PGP Message]'],

  // Misc secrets
  [/sentry_[a-zA-Z0-9_-]{32,}/gi, '[REDACTED: Sentry DSN]'],
  [/https:\/\/[a-z0-9]+@[a-z0-9]+\.ingest\.sentry\.io\/[0-9]+/g, '[REDACTED: Sentry DSN URL]'],
  [/datadog_[a-zA-Z0-9]{32,}/gi, '[REDACTED: Datadog API Key]'],
  [/dd-api-key[=:\s]+["']?[a-zA-Z0-9]{32,}["']?/gi, '[REDACTED: Datadog API Key]'],
  [/mapbox[_.]?[a-zA-Z0-9_-]{50,}/gi, '[REDACTED: Mapbox Token]'],
  [/algolia[a-zA-Z0-9_-]{30,}/gi, '[REDACTED: Algolia API Key]'],
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
