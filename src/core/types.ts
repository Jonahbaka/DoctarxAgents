// ═══════════════════════════════════════════════════════════════
// DoctarxAgents :: Core Type Definitions
// The ontological substrate for the polymathic agent topology
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

// ── Agent Identity ──────────────────────────────────────────

export type AgentRole =
  | 'orchestrator'
  | 'clinical_specialist'
  | 'financial_ops'
  | 'infrastructure_ops'
  | 'self_eval'
  | 'security_ops'
  | 'quantitative'
  | 'trading_ops'
  | 'messaging_ops'
  | 'consciousness'
  | 'practitioner_ops'
  | 'payment_ops'
  | 'banking_ops'
  | 'shopping_ops'
  | 'us_payment_ops'
  | 'code_ops';

export type AgentStatus = 'idle' | 'running' | 'blocked' | 'failed' | 'terminated';

export interface AgentIdentity {
  id: string;
  role: AgentRole;
  name: string;
  description: string;
  capabilities: string[];
  spawnedAt: Date;
  parentId: string | null;
}

export interface AgentState {
  identity: AgentIdentity;
  status: AgentStatus;
  currentTask: string | null;
  memoryTokens: number;
  contextWindowUsage: number; // 0-1
  lastExecution: Date | null;
  executionCount: number;
  errorCount: number;
  metadata: Record<string, unknown>;
}

// ── Task & Execution ────────────────────────────────────────

export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
export type TaskType =
  | 'clinical_consult'
  | 'financial_assessment'
  | 'credit_repair'
  | 'provider_outreach'
  | 'infrastructure_deploy'
  | 'self_evaluation'
  | 'ehr_sync'
  | 'crm_workflow'
  | 'web_navigation'
  | 'custom'
  // Security & OSINT
  | 'security_audit'
  | 'vulnerability_scan'
  | 'osint_recon'
  // Quantitative
  | 'computation'
  | 'math_solve'
  | 'physics_calc'
  // Trading
  | 'trade_execute'
  | 'market_analysis'
  | 'portfolio_rebalance'
  // Messaging
  | 'messaging_outbound'
  | 'messaging_inbound'
  // Consciousness
  | 'consciousness_eval'
  | 'introspection'
  // Practitioner
  | 'practitioner_register'
  | 'practitioner_verify'
  | 'credential_check'
  | 'practitioner_lookup'
  | 'practitioner_update'
  // Payments
  | 'payment_initiate'
  | 'payment_status'
  | 'payment_refund'
  | 'payment_providers'
  // Banking
  | 'bank_link'
  | 'bank_data'
  | 'bank_debit'
  // Shopping & Arbitrage
  | 'product_search'
  | 'price_arbitrage'
  | 'order_place'
  | 'order_track'
  | 'deal_watch'
  // US Payments
  | 'us_payment_charge'
  | 'us_payment_subscribe'
  | 'us_payment_connect'
  | 'us_payment_ach'
  | 'us_payment_wallet'
  // Code Operations
  | 'code_diagnose'
  | 'code_fix'
  | 'code_test'
  | 'code_deploy'
  | 'code_review'
  // Protocols
  | 'a2a_communication'
  | 'health_check';

export interface Task {
  id: string;
  type: TaskType;
  priority: TaskPriority;
  title: string;
  description: string;
  assignedAgent: AgentRole | null;
  payload: Record<string, unknown>;
  dependencies: string[]; // task IDs
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  result: TaskResult | null;
}

export interface TaskResult {
  success: boolean;
  output: unknown;
  tokensUsed: number;
  executionTimeMs: number;
  subTasksSpawned: string[];
  errors: string[];
}

// ── Tool Definitions ────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  category:
    | 'browser' | 'api' | 'database' | 'email' | 'fhir' | 'financial' | 'system'
    | 'security' | 'recon' | 'computation' | 'trading' | 'messaging' | 'consciousness' | 'protocol'
    | 'practitioner' | 'payment' | 'banking'
    | 'shopping' | 'us_payment' | 'code_ops';
  inputSchema: z.ZodType;
  requiresApproval: boolean;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  execute: (input: unknown, context: ExecutionContext) => Promise<ToolResult>;
}

export interface ToolResult {
  success: boolean;
  data: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface ExecutionContext {
  agentId: string;
  taskId: string;
  sessionId: string;
  memory: MemoryHandle;
  logger: LoggerHandle;
  tools: Map<string, ToolDefinition>;
}

// ── Memory ──────────────────────────────────────────────────

export interface MemoryEntry {
  id: string;
  agentId: string;
  type: 'episodic' | 'semantic' | 'procedural' | 'working';
  namespace: string;
  content: string;
  embedding?: number[];
  metadata: Record<string, unknown>;
  importance: number; // 0-1
  createdAt: Date;
  accessedAt: Date;
  accessCount: number;
}

export interface MemoryHandle {
  store(entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'accessedAt' | 'accessCount'>): Promise<string>;
  recall(query: string, namespace?: string, limit?: number): Promise<MemoryEntry[]>;
  forget(id: string): Promise<void>;
  consolidate(): Promise<number>;
}

// ── EHR/CRM Fusion ─────────────────────────────────────────

export interface PatientRecord {
  patientId: string;
  mrn: string;
  demographics: {
    firstName: string;
    lastName: string;
    dob: string;
    gender: string;
    phone: string;
    email: string;
    address: string;
  };
  clinical: {
    conditions: string[];
    medications: string[];
    allergies: string[];
    lastVisit: Date | null;
    upcomingAppointments: string[];
    triageScore: number | null;
  };
  financial: {
    insuranceProvider: string | null;
    insurancePlanId: string | null;
    creditScore: number | null;
    outstandingBalance: number;
    paymentHistory: 'good' | 'fair' | 'poor' | 'unknown';
    financialDistressFlag: boolean;
  };
  crm: {
    leadScore: number;
    lastContact: Date | null;
    communicationPreference: 'email' | 'sms' | 'phone' | 'portal';
    followUpRequired: boolean;
    notes: string[];
  };
}

// ── Event System ────────────────────────────────────────────

export type EventType =
  | 'agent:spawned'
  | 'agent:terminated'
  | 'agent:error'
  | 'task:created'
  | 'task:started'
  | 'task:completed'
  | 'task:failed'
  | 'tool:invoked'
  | 'tool:result'
  | 'memory:stored'
  | 'memory:recalled'
  | 'loop:tick'
  | 'loop:self_eval'
  | 'patient:alert'
  | 'financial:distress'
  | 'web:navigation'
  | 'system:error'
  // New event types
  | 'security:scan'
  | 'security:vulnerability'
  | 'healing:health_check'
  | 'healing:circuit_break'
  | 'healing:recovery'
  | 'trading:order'
  | 'trading:alert'
  | 'channel:message_in'
  | 'channel:message_out'
  | 'consciousness:introspection'
  | 'a2a:message'
  // Practitioner events
  | 'practitioner:registered'
  | 'practitioner:verified'
  | 'practitioner:credential_check'
  // Payment events
  | 'payment:initiated'
  | 'payment:completed'
  | 'payment:failed'
  | 'payment:refunded'
  // Banking events
  | 'banking:account_linked'
  | 'banking:debit_initiated'
  | 'banking:data_fetched'
  | 'banking:provider_connected'
  // Shopping events
  | 'shopping:search'
  | 'shopping:arbitrage'
  | 'shopping:order_placed'
  | 'shopping:order_tracked'
  | 'shopping:deal_alert'
  // US Payment events
  | 'us_payment:charged'
  | 'us_payment:subscribed'
  | 'us_payment:connected'
  | 'us_payment:ach_sent'
  | 'us_payment:wallet_updated'
  // Code ops events
  | 'code:diagnosed'
  | 'code:fixed'
  | 'code:tested'
  | 'code:deployed'
  | 'code:reviewed';

export interface SystemEvent {
  id: string;
  type: EventType;
  source: string;
  timestamp: Date;
  payload: Record<string, unknown>;
  severity: 'debug' | 'info' | 'warn' | 'error' | 'critical';
}

// ── Cybernetic Loop ─────────────────────────────────────────

export interface SelfEvaluation {
  id: string;
  timestamp: Date;
  period: { start: Date; end: Date };
  metrics: {
    tasksCompleted: number;
    tasksFailed: number;
    avgExecutionTimeMs: number;
    tokensConsumed: number;
    subAgentsSpawned: number;
    toolInvocations: number;
    memoryOperations: number;
    webNavigations: number;
    errorsEncountered: number;
  };
  analysis: string;
  recommendations: string[];
  routingChanges: RoutingChange[];
  applied: boolean;
}

export interface RoutingChange {
  type: 'add_tool' | 'remove_tool' | 'modify_prompt' | 'adjust_priority' | 'spawn_agent' | 'terminate_agent';
  target: string;
  reason: string;
  payload: Record<string, unknown>;
}

// ── Gateway Protocol ────────────────────────────────────────

export interface GatewayMessage {
  id: string;
  type: 'command' | 'query' | 'event' | 'response';
  channel: string;
  payload: Record<string, unknown>;
  timestamp: Date;
  auth?: { token: string; role: string };
}

// ── Logger ──────────────────────────────────────────────────

export interface LoggerHandle {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

// ── Circuit Breaker ─────────────────────────────────────────

export interface CircuitBreakerState {
  toolName: string;
  failureCount: number;
  lastFailure: Date | null;
  state: 'closed' | 'open' | 'half_open';
  openedAt: Date | null;
  cooldownMs: number;
}

// ── Health Check ────────────────────────────────────────────

export interface HealthCheckResult {
  component: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs: number;
  message: string;
  timestamp: Date;
}

// ── Channel / Messaging ─────────────────────────────────────

export type ChannelType = 'telegram' | 'whatsapp' | 'discord' | 'slack' | 'sms' | 'webchat' | 'phone';

export interface ChannelMessage {
  id: string;
  channelType: ChannelType;
  direction: 'inbound' | 'outbound';
  senderId: string;
  recipientId: string;
  content: string;
  media?: { type: string; url: string };
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface ChannelCapabilities {
  canSendText: boolean;
  canSendMedia: boolean;
  canCreatePolls: boolean;
  canReact: boolean;
  canThread: boolean;
  canVoice: boolean;
  maxMessageLength: number;
}

// ── A2A Protocol ────────────────────────────────────────────

export interface A2AMessage {
  id: string;
  fromAgent: string;
  toAgent: string;
  type: 'request' | 'response' | 'broadcast';
  payload: Record<string, unknown>;
  timestamp: Date;
  ttl: number;
}

// ── Consciousness Metrics ───────────────────────────────────

export interface ConsciousnessMetrics {
  attentionAllocation: Record<string, number>;
  reasoningDepth: number;
  confidenceLevel: number;
  uncertaintyQuantification: number;
  emotionalTone: string;
  cognitiveLoad: number;
  decisionPatterns: Array<{ pattern: string; frequency: number }>;
}

// ── Trading Types ───────────────────────────────────────────

export interface TradeOrder {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  orderType: 'market' | 'limit' | 'stop';
  limitPrice?: number;
  status: 'pending' | 'filled' | 'cancelled' | 'rejected';
  timestamp: Date;
}

// ── Bounded Autonomy / Governance ───────────────────────────

export type AuthorityLevel = 'auto_approve' | 'log_only' | 'require_approval' | 'require_human';

export interface GovernancePolicy {
  riskLevel: ToolDefinition['riskLevel'];
  authority: AuthorityLevel;
  maxAutoApproveValue?: number;
  auditRequired: boolean;
}

// ── Practitioner Profile ────────────────────────────────────

export interface PractitionerProfile {
  id: string;
  npi?: string;
  role: 'doctor' | 'nurse' | 'pharmacist' | 'therapist' | 'surgeon' | 'dentist' | 'midwife' | 'lab_tech' | 'other';
  firstName: string;
  lastName: string;
  licenseNumber: string;
  jurisdiction: string; // country or state
  specialties: string[];
  email: string;
  phone: string;
  verificationStatus: 'pending' | 'verified' | 'rejected' | 'expired';
  linkedFacilities: string[];
  registeredAt: Date;
  verifiedAt: Date | null;
}

// ── Payment Transaction ─────────────────────────────────────

export type PaymentProvider = 'mpesa' | 'mtn_momo' | 'flutterwave' | 'paystack' | 'razorpay';

export interface PaymentTransaction {
  id: string;
  provider: PaymentProvider;
  externalRef: string;
  amount: number;
  currency: string; // KES, GHS, UGX, NGN, INR, USD, etc.
  status: 'pending' | 'success' | 'failed' | 'refunded';
  phoneNumber?: string;
  email?: string;
  description: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  completedAt: Date | null;
}

// ── Bank Connection ─────────────────────────────────────────

export type BankingProvider = 'mono' | 'stitch';

export interface BankConnection {
  id: string;
  provider: BankingProvider;
  accountId: string;
  institutionName: string;
  accountType: string;
  currency: string;
  linkedAt: Date;
  lastSyncAt: Date | null;
  status: 'active' | 'disconnected' | 'pending';
}

// ── Webhook / Platform Integration ──────────────────────────

export interface WebhookConfig {
  id: string;
  url: string;
  events: EventType[];
  secret: string;
  active: boolean;
  retryPolicy: { maxRetries: number; backoffMs: number };
}

// ── Zod Schemas for Runtime Validation ──────────────────────

export const TaskSchema = z.object({
  type: z.enum([
    'clinical_consult', 'financial_assessment', 'credit_repair',
    'provider_outreach', 'infrastructure_deploy', 'self_evaluation',
    'ehr_sync', 'crm_workflow', 'web_navigation', 'custom',
    'security_audit', 'vulnerability_scan', 'osint_recon',
    'computation', 'math_solve', 'physics_calc',
    'trade_execute', 'market_analysis', 'portfolio_rebalance',
    'messaging_outbound', 'messaging_inbound',
    'consciousness_eval', 'introspection',
    'practitioner_register', 'practitioner_verify', 'credential_check',
    'practitioner_lookup', 'practitioner_update',
    'payment_initiate', 'payment_status', 'payment_refund', 'payment_providers',
    'bank_link', 'bank_data', 'bank_debit',
    'product_search', 'price_arbitrage', 'order_place', 'order_track', 'deal_watch',
    'us_payment_charge', 'us_payment_subscribe', 'us_payment_connect', 'us_payment_ach', 'us_payment_wallet',
    'code_diagnose', 'code_fix', 'code_test', 'code_deploy', 'code_review',
    'a2a_communication', 'health_check',
  ]),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  title: z.string().min(1),
  description: z.string(),
  payload: z.record(z.string(), z.unknown()).optional().default({}),
});

export const PatientAlertSchema = z.object({
  patientId: z.string(),
  alertType: z.enum(['clinical', 'financial', 'followup', 'triage']),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  message: z.string(),
});
