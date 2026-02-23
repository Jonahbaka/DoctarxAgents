#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//
//   ██████╗  ██████╗  ██████╗████████╗ █████╗ ██████╗ ██╗  ██╗
//   ██╔══██╗██╔═══██╗██╔════╝╚══██╔══╝██╔══██╗██╔══██╗╚██╗██╔╝
//   ██║  ██║██║   ██║██║        ██║   ███████║██████╔╝ ╚███╔╝
//   ██║  ██║██║   ██║██║        ██║   ██╔══██║██╔══██╗ ██╔██╗
//   ██████╔╝╚██████╔╝╚██████╗   ██║   ██║  ██║██║  ██║██╔╝ ██╗
//   ╚═════╝  ╚═════╝  ╚═════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝
//
//   AGENTS — Autonomous Healthcare Operations Intelligence
//   Polymathic Agentic Topology powered by Claude 4.6 Opus
//   15 Named Agents | 95+ Tools | Self-Healing | Multi-Channel | TokenForge | uPromptPay
//
// ═══════════════════════════════════════════════════════════════

import { Orchestrator } from './core/orchestrator.js';
import { VectorStore } from './memory/vector-store.js';
import { GraphStore } from './memory/graph-store.js';
import { GatewayServer } from './gateway/server.js';
import { DaemonLoop } from './daemon/loop.js';
import { createLogger } from './core/logger.js';
import { CONFIG } from './core/config.js';

// Agent tool imports
import { clinicalTools } from './agents/clinical/index.js';
import { financialTools } from './agents/financial/index.js';
import { infrastructureTools } from './agents/infrastructure/index.js';
import { securityTools } from './agents/security/index.js';
import { quantitativeTools } from './agents/quantitative/index.js';
import { tradingTools } from './agents/trading/index.js';
import { multimodalTools } from './agents/multimodal/index.js';
import { createMessagingTools } from './agents/messaging/index.js';
import { practitionerTools } from './agents/practitioner/index.js';
import { paymentTools } from './agents/payment/index.js';
import { bankingTools } from './agents/banking/index.js';
import { shoppingTools } from './agents/shopping/index.js';
import { usPaymentTools } from './agents/us-payment/index.js';
import { codeOpsTools } from './agents/code-ops/index.js';
import { walletTools } from './agents/wallet/index.js';

// Subsystems
import { SelfHealingEngine } from './healing/self-healer.js';
import { CircuitBreakerRegistry } from './healing/circuit-breaker.js';
import { ConsciousnessEngine } from './consciousness/index.js';
import { A2AProtocol } from './protocols/a2a.js';
import { BoundedAutonomyEngine } from './protocols/bounded-autonomy.js';
import { AuditTrail } from './protocols/audit-trail.js';
import { TokenForge } from './subsystems/token-forge/index.js';

// Channels
import { ChannelManager } from './channels/manager.js';
import { TelegramChannel } from './channels/telegram.js';
import { WhatsAppChannel } from './channels/whatsapp.js';
import { DiscordChannel } from './channels/discord.js';
import { SlackChannel } from './channels/slack.js';
import { SmsChannel } from './channels/sms.js';
import { WebChatChannel } from './channels/webchat.js';

async function main(): Promise<void> {
  const logger = createLogger('doctarx-agents');

  logger.info('═══════════════════════════════════════════════════');
  logger.info('  DoctaRx Agents — Booting Swarm Intelligence');
  logger.info('═══════════════════════════════════════════════════');
  logger.info(`  Model: ${CONFIG.anthropic.model}`);
  logger.info(`  Gateway: ${CONFIG.gateway.host}:${CONFIG.gateway.port}`);
  logger.info(`  Database: ${CONFIG.database.path}`);
  logger.info(`  Log level: ${CONFIG.logging.level}`);
  logger.info('');

  // ── Phase 1: Initialize Core Components ──

  logger.info('[1/8] Initializing orchestrator...');
  const orchestrator = new Orchestrator(logger);

  logger.info('[2/8] Initializing memory subsystem...');
  const memory = new VectorStore(logger);
  const graphStore = new GraphStore(memory.getDb(), logger);

  // Inject memory handle into orchestrator
  const memoryHandle = memory.createMemoryHandle('orchestrator');
  orchestrator.setMemoryHandle(memoryHandle);

  // ── Phase 2: Initialize Protocols ──

  logger.info('[3/8] Initializing protocols...');
  const a2a = new A2AProtocol(logger);
  const autonomy = new BoundedAutonomyEngine(logger);
  const auditTrail = new AuditTrail(memory.getDb(), logger);

  // Register agent queues in A2A
  ['orchestrator', 'clinical_specialist', 'financial_ops', 'infrastructure_ops',
   'security_ops', 'quantitative', 'trading_ops', 'messaging_ops', 'consciousness',
   'practitioner_ops', 'payment_ops', 'banking_ops',
   'shopping_ops', 'us_payment_ops', 'code_ops', 'wallet_ops'].forEach(
    agent => a2a.registerAgent(agent)
  );

  auditTrail.record('system', 'boot', 'doctarx-agents', { version: '5.0.0', model: CONFIG.anthropic.model });

  // ── Phase 3: Initialize Channels ──

  logger.info('[4/8] Initializing messaging channels...');
  const channelManager = new ChannelManager(logger);

  channelManager.registerChannel(new TelegramChannel(logger));
  channelManager.registerChannel(new WhatsAppChannel(logger));
  channelManager.registerChannel(new DiscordChannel(logger));
  channelManager.registerChannel(new SlackChannel(logger));
  channelManager.registerChannel(new SmsChannel(logger));
  channelManager.registerChannel(new WebChatChannel(logger));

  await channelManager.connectAll();

  // ── Phase 4: Initialize Subsystems ──

  logger.info('[5/8] Initializing self-healing engine...');
  const circuitBreakers = new CircuitBreakerRegistry(CONFIG.healing, logger);
  const healingEngine = new SelfHealingEngine(logger, memory, circuitBreakers);

  logger.info('[6/9] Initializing consciousness engine...');
  const consciousnessEngine = new ConsciousnessEngine(logger);

  logger.info('[7/9] Initializing TokenForge (model routing + cost optimization)...');
  const tokenForge = new TokenForge(logger);

  // ── Phase 5: Register All Tools ──

  logger.info('[8/9] Registering tools across 15 agent domains...');

  // Core agent tools
  orchestrator.registerTools(clinicalTools);
  orchestrator.registerTools(financialTools);
  orchestrator.registerTools(infrastructureTools);

  // Specialist agent tools
  orchestrator.registerTools(securityTools);
  orchestrator.registerTools(quantitativeTools);
  orchestrator.registerTools(tradingTools);
  orchestrator.registerTools(multimodalTools);

  // Messaging tools (factory pattern — needs channel manager)
  const messagingTools = createMessagingTools(channelManager);
  orchestrator.registerTools(messagingTools);

  // Practitioner, Payment & Banking agent tools
  orchestrator.registerTools(practitionerTools);
  orchestrator.registerTools(paymentTools);
  orchestrator.registerTools(bankingTools);

  // Shopping, US Payments & Code Operations agent tools
  orchestrator.registerTools(shoppingTools);
  orchestrator.registerTools(usPaymentTools);
  orchestrator.registerTools(codeOpsTools);

  // Wallet & uPromptPay agent tools
  orchestrator.registerTools(walletTools);

  const state = orchestrator.getState();
  logger.info(`  ${state.toolCount} tools registered across 15 agent domains`);

  // ── Phase 6: Start Gateway + Daemon ──

  logger.info('[9/9] Starting gateway & daemon...');
  const gateway = new GatewayServer(logger);

  const daemon = new DaemonLoop(orchestrator, memory, gateway, logger);

  // Inject subsystems into daemon
  daemon.setHealingEngine(healingEngine);
  daemon.setChannelManager(channelManager);
  daemon.setConsciousnessEngine(consciousnessEngine);

  // ── Phase 7: Boot ──

  orchestrator.start();
  await daemon.start();

  // Record successful boot
  auditTrail.record('system', 'boot_complete', 'doctarx-agents', {
    toolCount: state.toolCount,
    channelsConnected: channelManager.getConnectedCount(),
    graphStats: graphStore.getStats(),
  });

  logger.info('');
  logger.info('═══════════════════════════════════════════════════');
  logger.info('  ALL SYSTEMS OPERATIONAL');
  logger.info('');
  logger.info('  Agents (15):');
  logger.info('    Hippocrates (Clinical)       — STANDBY');
  logger.info('    Atlas       (Financial)      — STANDBY');
  logger.info('    Forge       (Infrastructure) — STANDBY');
  logger.info('    Sentinel    (Security/OSINT) — STANDBY');
  logger.info('    Archimedes  (Quantitative)   — STANDBY');
  logger.info('    Midas       (Trading)        — STANDBY');
  logger.info('    Hermes      (Messaging)      — STANDBY');
  logger.info('    Oracle      (Consciousness)  — STANDBY');
  logger.info('    Asclepius   (Practitioner)   — STANDBY');
  logger.info('    Mercury     (Payments)       — STANDBY');
  logger.info('    Plutus      (Banking)        — STANDBY');
  logger.info('    Athena      (Shopping)       — STANDBY');
  logger.info('    Janus       (US Payments)    — STANDBY');
  logger.info('    Prometheus  (Code Ops)       — STANDBY');
  logger.info('    Nexus       (uPromptPay)     — STANDBY');
  logger.info('');
  logger.info('  Subsystems:');
  logger.info(`    Self-Healing    — ACTIVE`);
  logger.info(`    Consciousness   — ACTIVE`);
  logger.info(`    TokenForge      — ${CONFIG.tokenForge.enabled ? 'ACTIVE (model routing + caching)' : 'DISABLED'}`);
  logger.info(`    A2A Protocol    — ACTIVE (${a2a.getRegisteredAgents().length} agents)`);
  logger.info(`    Audit Trail     — ACTIVE (${auditTrail.getCount()} entries)`);
  logger.info(`    Governance      — ACTIVE (${autonomy.getPolicies().length} policies)`);
  logger.info(`    Knowledge Graph — ACTIVE`);
  logger.info('');
  logger.info('  Channels:');
  const channelStatus = channelManager.getStatus();
  for (const ch of channelStatus) {
    logger.info(`    ${ch.name.padEnd(12)} — ${ch.connected ? 'CONNECTED' : 'DISABLED'}`);
  }
  logger.info('');
  logger.info(`  Gateway API: http://${CONFIG.gateway.host}:${CONFIG.gateway.port}/api`);
  logger.info(`  WebSocket:   ws://${CONFIG.gateway.host}:${CONFIG.gateway.port}/ws`);
  logger.info(`  Health:      http://${CONFIG.gateway.host}:${CONFIG.gateway.port}/health`);
  logger.info('');
  logger.info('  Memory stats:', memory.getStats());
  logger.info(`  Paper trading: ${CONFIG.trading.paperTrading ? 'ON (safe mode)' : 'OFF (LIVE!)'}`);
  logger.info('═══════════════════════════════════════════════════');

  // ── Graceful Shutdown ──

  const shutdown = async (signal: string) => {
    logger.info(`\n${signal} received — shutting down gracefully...`);
    auditTrail.record('system', 'shutdown', 'doctarx-agents', { signal });
    a2a.destroy();
    tokenForge.destroy();
    await daemon.stop();
    orchestrator.stop();
    logger.info('All systems offline. Goodbye.');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Keep process alive
  process.stdin.resume();
}

// ── Execute ──
main().catch((err) => {
  console.error('FATAL: DoctaRx Agents failed to start:', err);
  process.exit(1);
});
