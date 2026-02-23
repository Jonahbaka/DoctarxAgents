// ═══════════════════════════════════════════════════════════════
// Skill Registry — Autonomous workflow compositions
// ═══════════════════════════════════════════════════════════════

export { executeProviderOutreach } from './provider-outreach/index.js';
export type { OutreachConfig } from './provider-outreach/index.js';

export { executeCreditRepair } from './credit-repair/index.js';
export type { CreditRepairConfig } from './credit-repair/index.js';

export { executePatientFollowUp } from './patient-followup/index.js';
export type { FollowUpConfig } from './patient-followup/index.js';

export { executeNetworkExpansion } from './network-expansion/index.js';
export type { NetworkExpansionConfig } from './network-expansion/index.js';

// ── New Skills ──

export { executeSecurityAudit } from './security-audit/index.js';
export type { SecurityAuditConfig } from './security-audit/index.js';

export { executeMarketStrategy } from './market-strategy/index.js';
export type { MarketStrategyConfig } from './market-strategy/index.js';

export { executeOmnichannelOutreach } from './omnichannel-outreach/index.js';
export type { OmnichannelConfig } from './omnichannel-outreach/index.js';

export { executeDeepIntrospection } from './deep-introspection/index.js';
export type { IntrospectionConfig } from './deep-introspection/index.js';
