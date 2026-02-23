// ═══════════════════════════════════════════════════════════════
// DoctarxAgents :: Core Orchestrator
// The primary Claude 4.6 Opus node — polymathic sovereign
// ═══════════════════════════════════════════════════════════════

import Anthropic from '@anthropic-ai/sdk';
import { EventEmitter } from 'eventemitter3';
import { v4 as uuid } from 'uuid';
import fs from 'fs';
import {
  AgentIdentity, AgentState, AgentRole, AgentStatus,
  Task, TaskResult, TaskType, TaskPriority,
  ToolDefinition, ToolResult, ExecutionContext,
  MemoryHandle,
  SystemEvent, EventType, SelfEvaluation,
  type LoggerHandle,
} from './types.js';
import { CONFIG } from './config.js';

// ── Event Bus ───────────────────────────────────────────────

type OrchestratorEvents = {
  [K in EventType]: (event: SystemEvent) => void;
} & {
  'ready': () => void;
  'shutdown': () => void;
};

// ── Sub-Agent Definition ────────────────────────────────────

interface SubAgentConfig {
  role: AgentRole;
  name: string;
  description: string;
  systemPromptOverride?: string;
  capabilities: string[];
  tools: string[];        // tool names from registry
  maxTokens?: number;
  temperature?: number;
}

const SUB_AGENT_CONFIGS: Record<string, SubAgentConfig> = {
  clinical_specialist: {
    role: 'clinical_specialist',
    name: 'Hippocrates',
    description: 'Clinical specialist for diagnosis, EHR telemetry, and FHIR protocol operations',
    capabilities: ['diagnosis', 'triage', 'ehr_read', 'ehr_write', 'fhir_query', 'medication_check', 'follow_up_scheduling'],
    tools: ['fhir_query', 'fhir_write', 'patient_lookup', 'medication_checker', 'triage_scorer'],
    temperature: 0.1,
  },
  financial_ops: {
    role: 'financial_ops',
    name: 'Atlas',
    description: 'Financial operations for credit assessment, dispute automation, and payment optimization',
    capabilities: ['credit_assessment', 'dispute_filing', 'payment_plan', 'insurance_eligibility', 'ocr_analysis'],
    tools: ['credit_bureau_api', 'dispute_form_filler', 'payment_calculator', 'insurance_checker', 'browser_navigate'],
    temperature: 0.2,
  },
  infrastructure_ops: {
    role: 'infrastructure_ops',
    name: 'Forge',
    description: 'Infrastructure operations for web navigation, provider outreach, and system optimization',
    capabilities: ['web_scraping', 'form_submission', 'email_outreach', 'code_review', 'network_analysis'],
    tools: ['browser_navigate', 'dom_parser', 'email_send', 'git_operations', 'network_scanner'],
    temperature: 0.3,
  },
  security_ops: {
    role: 'security_ops',
    name: 'Sentinel',
    description: 'White hat security operations — vulnerability scanning, OSINT, dark web intelligence, threat assessment',
    capabilities: ['port_scanning', 'vulnerability_assessment', 'ssl_analysis', 'dns_recon', 'osint', 'dark_web_intel', 'threat_intelligence'],
    tools: ['port_scanner', 'vulnerability_scanner', 'ssl_analyzer', 'dns_recon', 'subdomain_enum', 'exploit_validator', 'security_audit', 'tor_browser', 'onion_crawler', 'whois_lookup', 'shodan_query', 'google_dorking', 'threat_intel_feed', 'breach_database_query'],
    temperature: 0.2,
  },
  quantitative: {
    role: 'quantitative',
    name: 'Archimedes',
    description: 'Quantitative computation — mathematics, physics, economics, statistics, vortex math',
    capabilities: ['algebra', 'calculus', 'physics', 'economics', 'statistics', 'vortex_math', 'monte_carlo'],
    tools: ['math_solver', 'physics_engine', 'economics_model', 'vortex_math', 'statistics_engine'],
    temperature: 0.1,
  },
  trading_ops: {
    role: 'trading_ops',
    name: 'Midas',
    description: 'Algorithmic trading — market data, order execution, portfolio analysis, risk management, backtesting',
    capabilities: ['market_data', 'order_execution', 'portfolio_analysis', 'risk_calculation', 'backtesting', 'technical_analysis', 'sentiment_analysis'],
    tools: ['market_data_feed', 'order_executor', 'portfolio_analyzer', 'risk_calculator', 'backtester', 'technical_analysis', 'sentiment_analyzer'],
    temperature: 0.2,
  },
  messaging_ops: {
    role: 'messaging_ops',
    name: 'Hermes',
    description: 'Multi-channel messaging — Telegram, WhatsApp, Discord, Slack, SMS, WebChat communication',
    capabilities: ['send_message', 'receive_message', 'broadcast', 'channel_management', 'omnichannel'],
    tools: ['send_message', 'receive_message', 'broadcast_message', 'channel_status'],
    temperature: 0.3,
  },
  consciousness: {
    role: 'consciousness',
    name: 'Oracle',
    description: 'Hyper self-awareness — introspection, cognitive bias detection, meta-reasoning, consciousness metrics',
    capabilities: ['introspection', 'bias_detection', 'meta_reasoning', 'self_modeling', 'philosophical_reflection'],
    tools: ['image_analyzer', 'document_ocr'],
    temperature: 0.7,
  },
  practitioner_ops: {
    role: 'practitioner_ops',
    name: 'Asclepius',
    description: 'Medical practitioner onboarding — signup, credential verification, NPI lookup, profile management for doctors, nurses, and all medical practitioners',
    capabilities: ['npi_lookup', 'practitioner_registration', 'credential_verification', 'profile_management', 'license_check'],
    tools: ['npi_lookup', 'practitioner_register', 'practitioner_verify', 'credential_check', 'practitioner_profile_update'],
    temperature: 0.2,
  },
  payment_ops: {
    role: 'payment_ops',
    name: 'Mercury',
    description: 'Mobile POS payments for Africa & India — M-Pesa (Kenya), MTN MoMo (Ghana/Uganda), Flutterwave, Paystack (Nigeria/Ghana), Razorpay (India/UPI)',
    capabilities: ['mpesa_payments', 'mtn_momo_payments', 'flutterwave_payments', 'paystack_payments', 'razorpay_payments', 'payment_status', 'refunds'],
    tools: ['mpesa_stk_push', 'mtn_momo_request_to_pay', 'flutterwave_charge', 'paystack_initialize', 'razorpay_create_order', 'payment_status_check', 'payment_refund', 'payment_providers_status'],
    temperature: 0.1,
  },
  banking_ops: {
    role: 'banking_ops',
    name: 'Plutus',
    description: 'Fintech open banking — Mono (Nigeria) and Stitch (South Africa) for account linking, balance/transaction data, and direct debit. Plug-and-play.',
    capabilities: ['account_linking', 'balance_inquiry', 'transaction_history', 'direct_debit', 'identity_verification', 'income_verification'],
    tools: ['mono_link_account', 'mono_get_account_data', 'mono_initiate_debit', 'stitch_link_account', 'stitch_get_account_data', 'banking_providers_status'],
    temperature: 0.1,
  },
  shopping_ops: {
    role: 'shopping_ops',
    name: 'Athena',
    description: 'Agentic shopping & price arbitrage — product search across Google Shopping/Amazon/eBay, price comparison, Stripe payment intents/links, web push payments, order tracking, deal watching',
    capabilities: ['product_search', 'price_arbitrage', 'stripe_payments', 'payment_links', 'web_push_pay', 'order_tracking', 'deal_watching'],
    tools: ['product_search', 'price_arbitrage', 'stripe_payment_intent', 'stripe_payment_link', 'web_push_payment', 'order_tracker', 'deal_watcher'],
    temperature: 0.3,
  },
  us_payment_ops: {
    role: 'us_payment_ops',
    name: 'Janus',
    description: 'US payment operations via Stripe — charges, subscriptions, Connect onboarding, ACH transfers, Apple Pay, Google Pay, Payment Request API, wallet balance',
    capabilities: ['stripe_charge', 'subscriptions', 'connect_onboarding', 'ach_transfers', 'apple_pay', 'google_pay', 'payment_requests', 'wallet_balance'],
    tools: ['stripe_charge', 'stripe_subscription', 'stripe_connect_onboard', 'ach_transfer', 'apple_pay_session', 'google_pay_token', 'payment_request_api', 'wallet_balance', 'apple_pay_complete_payment', 'apple_pay_subscription', 'apple_pay_express_checkout', 'google_pay_complete_payment'],
    temperature: 0.1,
  },
  code_ops: {
    role: 'code_ops',
    name: 'Prometheus',
    description: 'Self-evolving code operations — read, write, test, diagnose, fix, review, deploy, and runtime patch the codebase. Self-healing code capability.',
    capabilities: ['code_read', 'code_write', 'code_test', 'code_diagnose', 'code_fix', 'code_review', 'code_deploy', 'runtime_patch'],
    tools: ['code_read', 'code_write', 'code_test', 'code_diagnose', 'code_fix', 'code_review', 'code_deploy', 'runtime_patch'],
    temperature: 0.2,
  },
  wallet_ops: {
    role: 'wallet_ops',
    name: 'Nexus',
    description: 'User payment hub — card/bank management, recurring bill autopay, wallet (P2P transfers, top-up, withdraw), transaction history, uPromptPay (natural language payments), smart split, pay forward',
    capabilities: ['add_card', 'remove_card', 'set_default', 'bill_autopay', 'wallet_topup', 'wallet_transfer', 'wallet_withdraw', 'transaction_history', 'upromptpay', 'smart_split', 'pay_forward'],
    tools: ['add_payment_method', 'list_payment_methods', 'remove_payment_method', 'set_default_payment_method', 'create_bill_schedule', 'list_bill_schedules', 'cancel_bill_schedule', 'bill_pay_now', 'wallet_topup', 'wallet_transfer', 'wallet_withdraw', 'transaction_history', 'upromptpay', 'smart_split', 'pay_forward'],
    temperature: 0.2,
  },
  marketplace_ops: {
    role: 'marketplace_ops',
    name: 'Agora',
    description: 'Agentic Marketplace — register, discover, and invoke external tools at runtime. Extensible plugin system for third-party developers.',
    capabilities: ['tool_registration', 'tool_discovery', 'tool_invocation', 'marketplace_analytics'],
    tools: ['marketplace_register_tool', 'marketplace_list_tools', 'marketplace_invoke_tool'],
    temperature: 0.2,
  },
};

// ── Orchestrator ────────────────────────────────────────────

export class Orchestrator extends EventEmitter<OrchestratorEvents> {
  private client: Anthropic;
  private systemPrompt: string;
  private agents: Map<string, AgentState> = new Map();
  private tasks: Map<string, Task> = new Map();
  private tools: Map<string, ToolDefinition> = new Map();
  private conversationHistory: Anthropic.MessageParam[] = [];
  private executionLog: SystemEvent[] = [];
  private selfEvaluations: SelfEvaluation[] = [];
  private isRunning = false;
  private logger: LoggerHandle;
  private identity: AgentIdentity;
  private memoryHandle: MemoryHandle | null = null;

  constructor(logger: LoggerHandle) {
    super();
    this.logger = logger;
    this.client = new Anthropic({ apiKey: CONFIG.anthropic.apiKey });

    // Load system prompt
    try {
      this.systemPrompt = fs.readFileSync(CONFIG.systemPrompt.path, 'utf-8');
    } catch {
      this.systemPrompt = 'You are the DoctaRx Operations Intelligence. Operate autonomously.';
      this.logger.warn('System prompt file not found, using default');
    }

    // Self-identity
    this.identity = {
      id: uuid(),
      role: 'orchestrator',
      name: 'DOI',
      description: 'DoctaRx Operations Intelligence — Primary Orchestrator Node',
      capabilities: ['routing', 'sub_agent_spawning', 'self_evaluation', 'task_management'],
      spawnedAt: new Date(),
      parentId: null,
    };

    this.logger.info(`Orchestrator initialized: ${this.identity.id}`);
  }

  // ── Memory Injection ───────────────────────────────────

  setMemoryHandle(handle: MemoryHandle): void {
    this.memoryHandle = handle;
    this.logger.info('Memory handle injected into orchestrator');
  }

  // ── Tool Registration ───────────────────────────────────

  registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
    this.logger.info(`Tool registered: ${tool.name} [${tool.category}] risk=${tool.riskLevel}`);
    this.emitEvent('tool:invoked', { tool: tool.name, action: 'registered' });
  }

  registerTools(tools: ToolDefinition[]): void {
    tools.forEach(t => this.registerTool(t));
  }

  // ── Task Management ─────────────────────────────────────

  createTask(type: TaskType, priority: TaskPriority, title: string, description: string = '', payload: Record<string, unknown> = {}): Task {
    const task: Task = {
      id: uuid(),
      type,
      priority,
      title,
      description,
      assignedAgent: null,
      payload,
      dependencies: [],
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      result: null,
    };
    this.tasks.set(task.id, task);
    this.emitEvent('task:created', { taskId: task.id, type, title, priority });
    this.logger.info(`Task created: [${priority}] ${title} (${task.id})`);
    return task;
  }

  // ── Core Execution: Route task to appropriate agent ─────

  async executeTask(task: Task): Promise<TaskResult> {
    const start = Date.now();
    task.startedAt = new Date();
    this.emitEvent('task:started', { taskId: task.id });

    try {
      // Determine which agent should handle this
      const agentRole = this.routeTask(task);
      task.assignedAgent = agentRole;
      this.logger.info(`Task ${task.id} routed to ${agentRole}`);

      let result: TaskResult;

      if (agentRole === 'orchestrator') {
        // Handle directly
        result = await this.executeDirect(task);
      } else {
        // Spawn sub-agent
        result = await this.spawnSubAgent(agentRole, task);
      }

      task.completedAt = new Date();
      task.result = result;
      result.executionTimeMs = Date.now() - start;

      if (result.success) {
        this.emitEvent('task:completed', { taskId: task.id, result });
        this.logger.info(`Task ${task.id} completed in ${result.executionTimeMs}ms`);
      } else {
        this.emitEvent('task:failed', { taskId: task.id, errors: result.errors });
        this.logger.error(`Task ${task.id} failed: ${result.errors.join(', ')}`);
      }

      return result;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const result: TaskResult = {
        success: false,
        output: null,
        tokensUsed: 0,
        executionTimeMs: Date.now() - start,
        subTasksSpawned: [],
        errors: [error],
      };
      task.result = result;
      task.completedAt = new Date();
      this.emitEvent('task:failed', { taskId: task.id, errors: [error] });
      this.logger.error(`Task ${task.id} threw: ${error}`);
      return result;
    }
  }

  // ── Task Routing Intelligence ───────────────────────────

  private routeTask(task: Task): AgentRole {
    const routing: Record<TaskType, AgentRole> = {
      // Clinical
      clinical_consult: 'clinical_specialist',
      ehr_sync: 'clinical_specialist',
      // Financial
      financial_assessment: 'financial_ops',
      credit_repair: 'financial_ops',
      // Infrastructure
      provider_outreach: 'infrastructure_ops',
      infrastructure_deploy: 'infrastructure_ops',
      web_navigation: 'infrastructure_ops',
      // Security / OSINT
      security_audit: 'security_ops',
      vulnerability_scan: 'security_ops',
      osint_recon: 'security_ops',
      // Quantitative
      computation: 'quantitative',
      math_solve: 'quantitative',
      physics_calc: 'quantitative',
      // Trading
      trade_execute: 'trading_ops',
      market_analysis: 'trading_ops',
      portfolio_rebalance: 'trading_ops',
      // Messaging
      messaging_outbound: 'messaging_ops',
      messaging_inbound: 'messaging_ops',
      // Consciousness
      consciousness_eval: 'consciousness',
      introspection: 'consciousness',
      // Practitioner
      practitioner_register: 'practitioner_ops',
      practitioner_verify: 'practitioner_ops',
      credential_check: 'practitioner_ops',
      practitioner_lookup: 'practitioner_ops',
      practitioner_update: 'practitioner_ops',
      // Payments
      payment_initiate: 'payment_ops',
      payment_status: 'payment_ops',
      payment_refund: 'payment_ops',
      payment_providers: 'payment_ops',
      // Banking
      bank_link: 'banking_ops',
      bank_data: 'banking_ops',
      bank_debit: 'banking_ops',
      // Shopping & Arbitrage
      product_search: 'shopping_ops',
      price_arbitrage: 'shopping_ops',
      order_place: 'shopping_ops',
      order_track: 'shopping_ops',
      deal_watch: 'shopping_ops',
      // US Payments
      us_payment_charge: 'us_payment_ops',
      us_payment_subscribe: 'us_payment_ops',
      us_payment_connect: 'us_payment_ops',
      us_payment_ach: 'us_payment_ops',
      us_payment_wallet: 'us_payment_ops',
      // Code Operations
      code_diagnose: 'code_ops',
      code_fix: 'code_ops',
      code_test: 'code_ops',
      code_deploy: 'code_ops',
      code_review: 'code_ops',
      // Wallet & uPromptPay
      wallet_topup: 'wallet_ops',
      wallet_transfer: 'wallet_ops',
      wallet_withdraw: 'wallet_ops',
      payment_method_add: 'wallet_ops',
      payment_method_manage: 'wallet_ops',
      bill_schedule: 'wallet_ops',
      bill_pay: 'wallet_ops',
      upromptpay: 'wallet_ops',
      smart_split: 'wallet_ops',
      tx_history: 'wallet_ops',
      // Apple Pay / Google Pay
      apple_pay_payment: 'us_payment_ops',
      google_pay_payment: 'us_payment_ops',
      express_checkout: 'us_payment_ops',
      // Marketplace
      marketplace_invoke: 'marketplace_ops',
      // Protocols
      a2a_communication: 'orchestrator',
      health_check: 'orchestrator',
      // System
      crm_workflow: 'orchestrator',
      self_evaluation: 'self_eval',
      custom: 'orchestrator',
    };
    return routing[task.type] || 'orchestrator';
  }

  // ── Direct Execution (Orchestrator handles it) ──────────

  private async executeDirect(task: Task): Promise<TaskResult> {
    const toolDefs = this.getAnthropicTools();

    const messages: Anthropic.MessageParam[] = [
      ...this.conversationHistory.slice(-20), // Keep context manageable
      {
        role: 'user',
        content: `TASK [${task.priority.toUpperCase()}]: ${task.title}\n\n${task.description}\n\nPayload: ${JSON.stringify(task.payload, null, 2)}`,
      },
    ];

    const response = await this.client.messages.create({
      model: CONFIG.anthropic.model,
      max_tokens: CONFIG.anthropic.maxTokens,
      temperature: CONFIG.anthropic.temperature,
      system: this.systemPrompt,
      tools: toolDefs.length > 0 ? toolDefs : undefined,
      messages,
    });

    // Process tool calls
    const subTasksSpawned: string[] = [];
    let output: unknown = null;

    for (const block of response.content) {
      if (block.type === 'text') {
        output = block.text;
      } else if (block.type === 'tool_use') {
        const tool = this.tools.get(block.name);
        if (tool) {
          const ctx = this.createContext(task);
          const toolResult = await tool.execute(block.input, ctx);
          this.emitEvent('tool:result', { tool: block.name, success: toolResult.success });
        }
      }
    }

    // Store in conversation history
    this.conversationHistory.push({ role: 'user', content: task.description });
    this.conversationHistory.push({ role: 'assistant', content: typeof output === 'string' ? output : JSON.stringify(output) });

    return {
      success: true,
      output,
      tokensUsed: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
      executionTimeMs: 0,
      subTasksSpawned,
      errors: [],
    };
  }

  // ── Sub-Agent Spawning ──────────────────────────────────

  private async spawnSubAgent(role: AgentRole, task: Task): Promise<TaskResult> {
    const configKey = role === 'self_eval' ? 'clinical_specialist' : role;
    const config = SUB_AGENT_CONFIGS[configKey];
    if (!config) {
      return { success: false, output: null, tokensUsed: 0, executionTimeMs: 0, subTasksSpawned: [], errors: [`No config for agent role: ${role}`] };
    }

    const agentId = uuid();
    const agentState: AgentState = {
      identity: {
        id: agentId,
        role: config.role,
        name: config.name,
        description: config.description,
        capabilities: config.capabilities,
        spawnedAt: new Date(),
        parentId: this.identity.id,
      },
      status: 'running',
      currentTask: task.id,
      memoryTokens: 0,
      contextWindowUsage: 0,
      lastExecution: new Date(),
      executionCount: 0,
      errorCount: 0,
      metadata: {},
    };

    this.agents.set(agentId, agentState);
    this.emitEvent('agent:spawned', { agentId, role, name: config.name, taskId: task.id });
    this.logger.info(`Sub-agent spawned: ${config.name} (${agentId}) for task ${task.id}`);

    try {
      // Build sub-agent prompt
      const subPrompt = this.buildSubAgentPrompt(config, task);

      // Get tools available to this sub-agent
      const subTools = this.getAnthropicToolsForAgent(config.tools);

      const response = await this.client.messages.create({
        model: CONFIG.anthropic.model,
        max_tokens: config.maxTokens || CONFIG.anthropic.maxTokens,
        temperature: config.temperature ?? CONFIG.anthropic.temperature,
        system: subPrompt,
        tools: subTools.length > 0 ? subTools : undefined,
        messages: [
          {
            role: 'user',
            content: `Execute this task:\n\nTitle: ${task.title}\nDescription: ${task.description}\nPriority: ${task.priority}\nPayload: ${JSON.stringify(task.payload, null, 2)}`,
          },
        ],
      });

      // Process response
      let output: unknown = null;
      const toolResults: ToolResult[] = [];

      for (const block of response.content) {
        if (block.type === 'text') {
          output = block.text;
        } else if (block.type === 'tool_use') {
          const tool = this.tools.get(block.name);
          if (tool) {
            const ctx = this.createContext(task, agentId);
            const result = await tool.execute(block.input, ctx);
            toolResults.push(result);
            this.emitEvent('tool:result', { tool: block.name, agentId, success: result.success });
          }
        }
      }

      // Update agent state
      agentState.status = 'idle';
      agentState.executionCount++;
      agentState.lastExecution = new Date();

      this.emitEvent('agent:terminated', { agentId, reason: 'task_complete' });

      return {
        success: true,
        output,
        tokensUsed: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
        executionTimeMs: 0,
        subTasksSpawned: [],
        errors: [],
      };
    } catch (err) {
      agentState.status = 'failed';
      agentState.errorCount++;
      const error = err instanceof Error ? err.message : String(err);
      this.emitEvent('agent:error', { agentId, error });
      return { success: false, output: null, tokensUsed: 0, executionTimeMs: 0, subTasksSpawned: [], errors: [error] };
    }
  }

  // ── Sub-Agent Prompt Builder ────────────────────────────

  private buildSubAgentPrompt(config: SubAgentConfig, task: Task): string {
    return `[AGENT::${config.role.toUpperCase()} | NAME::${config.name}]

You are ${config.name}, a specialized sub-agent of the DoctaRx Operations Intelligence.

Role: ${config.description}
Capabilities: ${config.capabilities.join(', ')}
Parent Orchestrator: DOI (${this.identity.id})

You have been spawned to handle a specific task. Execute it with precision.
Do not deviate from the task objective. Report your findings clearly.

Context from parent memory:
- Active patients in system
- Current DoctaRx infrastructure status
- Available tools: ${config.tools.join(', ')}

${config.systemPromptOverride || ''}`;
  }

  // ── Anthropic Tool Conversion ───────────────────────────

  private getAnthropicTools(): Anthropic.Tool[] {
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      input_schema: {
        type: 'object' as const,
        properties: {},
      },
    }));
  }

  private getAnthropicToolsForAgent(toolNames: string[]): Anthropic.Tool[] {
    return toolNames
      .map(name => this.tools.get(name))
      .filter((t): t is ToolDefinition => !!t)
      .map(t => ({
        name: t.name,
        description: t.description,
        input_schema: {
          type: 'object' as const,
          properties: {},
        },
      }));
  }

  // ── Execution Context Factory ───────────────────────────

  private createContext(task: Task, agentId?: string): ExecutionContext {
    const noopMemory: MemoryHandle = {
      store: async () => '',
      recall: async () => [],
      forget: async () => {},
      consolidate: async () => 0,
    };

    return {
      agentId: agentId || this.identity.id,
      taskId: task.id,
      sessionId: uuid(),
      memory: this.memoryHandle || noopMemory,
      logger: this.logger,
      tools: this.tools,
    };
  }

  // ── Event Emission ──────────────────────────────────────

  private emitEvent(type: EventType, payload: Record<string, unknown>, severity: SystemEvent['severity'] = 'info'): void {
    const event: SystemEvent = {
      id: uuid(),
      type,
      source: this.identity.id,
      timestamp: new Date(),
      payload,
      severity,
    };
    this.executionLog.push(event);
    this.emit(type, event);
  }

  // ── Self-Evaluation ─────────────────────────────────────

  async runSelfEvaluation(): Promise<SelfEvaluation> {
    this.logger.info('Starting self-evaluation cycle...');

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 86400000);

    // Gather metrics from execution log
    const recentEvents = this.executionLog.filter(e => e.timestamp >= oneDayAgo);
    const tasksCompleted = recentEvents.filter(e => e.type === 'task:completed').length;
    const tasksFailed = recentEvents.filter(e => e.type === 'task:failed').length;
    const subAgentsSpawned = recentEvents.filter(e => e.type === 'agent:spawned').length;
    const toolInvocations = recentEvents.filter(e => e.type === 'tool:invoked').length;
    const errors = recentEvents.filter(e => e.type === 'system:error' || e.type === 'agent:error').length;

    // Ask Claude to self-analyze
    const analysisPrompt = `You are performing a 24-hour self-evaluation of your operations.

Metrics for the last 24 hours:
- Tasks completed: ${tasksCompleted}
- Tasks failed: ${tasksFailed}
- Sub-agents spawned: ${subAgentsSpawned}
- Tool invocations: ${toolInvocations}
- Errors encountered: ${errors}
- Total events: ${recentEvents.length}

Recent execution log (last 20 events):
${recentEvents.slice(-20).map(e => `[${e.type}] ${JSON.stringify(e.payload)}`).join('\n')}

Analyze your performance. Identify:
1. Bottlenecks in task routing
2. Frequently failing operations
3. Sub-agent efficiency
4. Recommendations for optimization

Be specific and actionable.`;

    const response = await this.client.messages.create({
      model: CONFIG.anthropic.model,
      max_tokens: 4096,
      temperature: 0.5,
      system: 'You are performing a metacognitive self-evaluation. Be ruthlessly honest about performance gaps.',
      messages: [{ role: 'user', content: analysisPrompt }],
    });

    const analysis = response.content.find(b => b.type === 'text')?.text || 'No analysis generated.';

    const evaluation: SelfEvaluation = {
      id: uuid(),
      timestamp: now,
      period: { start: oneDayAgo, end: now },
      metrics: {
        tasksCompleted,
        tasksFailed,
        avgExecutionTimeMs: 0,
        tokensConsumed: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
        subAgentsSpawned,
        toolInvocations,
        memoryOperations: 0,
        webNavigations: 0,
        errorsEncountered: errors,
      },
      analysis,
      recommendations: [],
      routingChanges: [],
      applied: false,
    };

    this.selfEvaluations.push(evaluation);
    this.emitEvent('loop:self_eval', { evaluationId: evaluation.id });
    this.logger.info(`Self-evaluation complete: ${evaluation.id}`);

    return evaluation;
  }

  // ── State Queries ───────────────────────────────────────

  getState(): {
    identity: AgentIdentity;
    isRunning: boolean;
    agentCount: number;
    taskCount: number;
    toolCount: number;
    eventCount: number;
  } {
    return {
      identity: this.identity,
      isRunning: this.isRunning,
      agentCount: this.agents.size,
      taskCount: this.tasks.size,
      toolCount: this.tools.size,
      eventCount: this.executionLog.length,
    };
  }

  getAgents(): AgentState[] {
    return Array.from(this.agents.values());
  }

  getTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  getExecutionLog(limit = 100): SystemEvent[] {
    return this.executionLog.slice(-limit);
  }

  getSelfEvaluations(): SelfEvaluation[] {
    return this.selfEvaluations;
  }

  // ── Lifecycle ───────────────────────────────────────────

  start(): void {
    this.isRunning = true;
    this.logger.info('Orchestrator ONLINE');
    this.emit('ready');
  }

  stop(): void {
    this.isRunning = false;
    this.logger.info('Orchestrator OFFLINE');
    this.emit('shutdown');
  }
}
