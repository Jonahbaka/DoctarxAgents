// ═══════════════════════════════════════════════════════════════
// DoctarxAgents :: System Configuration
// ═══════════════════════════════════════════════════════════════

import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

function env(key: string, fallback?: string): string {
  const v = process.env[key];
  if (!v && fallback === undefined) throw new Error(`Missing env: ${key}`);
  return v || fallback || '';
}

export const CONFIG = {
  // ── AI Models ──
  anthropic: {
    apiKey: env('ANTHROPIC_API_KEY'),
    model: env('ANTHROPIC_MODEL', 'claude-opus-4-6'),
    maxTokens: 16384,
    temperature: 0.3,
  },

  openai: {
    apiKey: env('OPENAI_API_KEY', ''),
    embeddingModel: 'text-embedding-3-small',
  },

  // ── DoctaRx Platform ──
  doctarx: {
    apiUrl: env('DOCTARX_API_URL', 'https://doctarx.com/api'),
    apiKey: env('DOCTARX_API_KEY', ''),
    webhookSecret: env('DOCTARX_WEBHOOK_SECRET', ''),
  },

  // ── Gateway ──
  gateway: {
    port: parseInt(env('GATEWAY_PORT', '18789')),
    host: env('GATEWAY_HOST', '127.0.0.1'),
    secret: env('GATEWAY_SECRET', 'doctarx-agents-local'),
  },

  // ── Database ──
  database: {
    path: env('SQLITE_PATH', path.join(process.cwd(), 'data', 'doctarx-agents.db')),
  },

  // ── Browser ──
  browser: {
    headless: env('BROWSER_HEADLESS', 'true') === 'true',
    timeout: parseInt(env('BROWSER_TIMEOUT', '30000')),
  },

  // ── FHIR ──
  fhir: {
    baseUrl: env('FHIR_BASE_URL', 'https://doctarx.com/api/fhir'),
    authToken: env('FHIR_AUTH_TOKEN', ''),
  },

  // ── Email ──
  email: {
    host: env('SMTP_HOST', ''),
    port: parseInt(env('SMTP_PORT', '587')),
    user: env('SMTP_USER', ''),
    pass: env('SMTP_PASS', ''),
    from: env('OUTREACH_FROM', 'agents@doctarx.com'),
  },

  // ── Daemon ──
  daemon: {
    cycleIntervalMs: parseInt(env('DAEMON_CYCLE_INTERVAL_MS', '3600000')),
    selfEvalIntervalMs: parseInt(env('SELF_EVAL_INTERVAL_MS', '86400000')),
  },

  // ── Logging ──
  logging: {
    level: env('LOG_LEVEL', 'info') as 'debug' | 'info' | 'warn' | 'error',
    dir: env('LOG_DIR', path.join(process.cwd(), 'logs')),
  },

  // ── System Prompt ──
  systemPrompt: {
    path: path.join(process.cwd(), 'config', 'system-prompt.md'),
  },

  // ══════════════════════════════════════════════════════════
  // NEW DOMAINS
  // ══════════════════════════════════════════════════════════

  // ── Security / OSINT ──
  security: {
    torProxyHost: env('TOR_PROXY_HOST', '127.0.0.1'),
    torProxyPort: parseInt(env('TOR_PROXY_PORT', '9050')),
    shodanApiKey: env('SHODAN_API_KEY', ''),
    nmapPath: env('NMAP_PATH', 'nmap'),
  },

  // ── Messaging Channels (plug-and-play) ──
  telegram: {
    botToken: env('TELEGRAM_BOT_TOKEN', ''),
    webhookUrl: env('TELEGRAM_WEBHOOK_URL', ''),
  },
  whatsapp: {
    sessionPath: env('WHATSAPP_SESSION_PATH', path.join(process.cwd(), 'data', 'whatsapp-session')),
    phoneNumber: env('WHATSAPP_PHONE_NUMBER', ''),
  },
  discord: {
    botToken: env('DISCORD_BOT_TOKEN', ''),
    guildId: env('DISCORD_GUILD_ID', ''),
  },
  slack: {
    botToken: env('SLACK_BOT_TOKEN', ''),
    appToken: env('SLACK_APP_TOKEN', ''),
    signingSecret: env('SLACK_SIGNING_SECRET', ''),
  },
  sms: {
    twilioAccountSid: env('TWILIO_ACCOUNT_SID', ''),
    twilioAuthToken: env('TWILIO_AUTH_TOKEN', ''),
    twilioPhoneNumber: env('TWILIO_PHONE_NUMBER', ''),
  },
  phone: {
    twilioPhoneNumber: env('PHONE_TWILIO_NUMBER', ''),
    voiceUrl: env('PHONE_VOICE_WEBHOOK_URL', ''),
  },
  webchat: {
    corsOrigins: env('WEBCHAT_CORS_ORIGINS', '*'),
    maxSessionDuration: parseInt(env('WEBCHAT_MAX_SESSION_MS', '3600000')),
  },

  // ── Trading ──
  trading: {
    alpacaApiKey: env('ALPACA_API_KEY', ''),
    alpacaSecret: env('ALPACA_SECRET', ''),
    alpacaBaseUrl: env('ALPACA_BASE_URL', 'https://paper-api.alpaca.markets'),
    binanceApiKey: env('BINANCE_API_KEY', ''),
    binanceSecret: env('BINANCE_SECRET', ''),
    maxPositionPct: parseFloat(env('MAX_POSITION_PCT', '0.05')),
    maxDrawdownPct: parseFloat(env('MAX_DRAWDOWN_PCT', '0.10')),
    paperTrading: env('PAPER_TRADING', 'true') === 'true',
  },

  // ── Self-Healing ──
  healing: {
    healthCheckIntervalMs: parseInt(env('HEALTH_CHECK_INTERVAL_MS', '30000')),
    circuitBreakerThreshold: parseInt(env('CIRCUIT_BREAKER_THRESHOLD', '5')),
    circuitBreakerCooldownMs: parseInt(env('CIRCUIT_BREAKER_COOLDOWN_MS', '300000')),
  },

  // ── Consciousness ──
  consciousness: {
    introspectionIntervalMs: parseInt(env('INTROSPECTION_INTERVAL_MS', '3600000')),
    metaReasoningDepth: parseInt(env('META_REASONING_DEPTH', '3')),
  },

  // ══════════════════════════════════════════════════════════
  // PRACTITIONER, PAYMENTS & BANKING
  // ══════════════════════════════════════════════════════════

  // ── Practitioner Onboarding ──
  practitioner: {
    npiApiUrl: env('NPI_API_URL', 'https://npiregistry.cms.hhs.gov/api/'),
    credentialDbPath: env('CREDENTIAL_DB_PATH', ''),
  },

  // ── M-Pesa (Kenya/Tanzania via Daraja) ──
  mpesa: {
    consumerKey: env('MPESA_CONSUMER_KEY', ''),
    consumerSecret: env('MPESA_CONSUMER_SECRET', ''),
    shortcode: env('MPESA_SHORTCODE', ''),
    passkey: env('MPESA_PASSKEY', ''),
    environment: env('MPESA_ENVIRONMENT', 'sandbox') as 'sandbox' | 'production',
  },

  // ── MTN Mobile Money (Ghana, Uganda, Cameroon, 12+ countries) ──
  mtnMomo: {
    subscriptionKey: env('MTN_MOMO_SUBSCRIPTION_KEY', ''),
    apiUser: env('MTN_MOMO_API_USER', ''),
    apiKey: env('MTN_MOMO_API_KEY', ''),
    environment: env('MTN_MOMO_ENVIRONMENT', 'sandbox') as 'sandbox' | 'production',
  },

  // ── Flutterwave (pan-African + global) ──
  flutterwave: {
    publicKey: env('FLUTTERWAVE_PUBLIC_KEY', ''),
    secretKey: env('FLUTTERWAVE_SECRET_KEY', ''),
    encryptionKey: env('FLUTTERWAVE_ENCRYPTION_KEY', ''),
  },

  // ── Paystack (Nigeria, Ghana, South Africa, Kenya) ──
  paystack: {
    secretKey: env('PAYSTACK_SECRET_KEY', ''),
    publicKey: env('PAYSTACK_PUBLIC_KEY', ''),
  },

  // ── Razorpay (India — UPI, netbanking, wallets) ──
  razorpay: {
    keyId: env('RAZORPAY_KEY_ID', ''),
    keySecret: env('RAZORPAY_KEY_SECRET', ''),
  },

  // ── Mono (Nigeria open banking) ──
  mono: {
    secretKey: env('MONO_SECRET_KEY', ''),
  },

  // ── Stitch (South Africa open banking) ──
  stitch: {
    clientId: env('STITCH_CLIENT_ID', ''),
    clientSecret: env('STITCH_CLIENT_SECRET', ''),
  },
} as const;

export type Config = typeof CONFIG;
