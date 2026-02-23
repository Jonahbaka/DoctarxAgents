// ═══════════════════════════════════════════════════════════════
// Skill :: Comprehensive Security Audit
// Orchestrates: port_scanner → ssl_analyzer → dns_recon →
//   vulnerability_scanner → threat_intel → full report
// ═══════════════════════════════════════════════════════════════

import { ExecutionContext, ToolResult } from '../../core/types.js';

export interface SecurityAuditConfig {
  target: string;              // domain or IP
  scope: 'quick' | 'standard' | 'deep';
  includeOsint: boolean;
  includeDarkWeb: boolean;
}

export async function executeSecurityAudit(
  config: SecurityAuditConfig,
  ctx: ExecutionContext
): Promise<ToolResult> {
  ctx.logger.info(`Security Audit: target=${config.target} scope=${config.scope}`);

  const findings: Array<{ phase: string; result: unknown }> = [];
  const steps: string[] = [];

  // Phase 1: DNS Reconnaissance
  const dnsRecon = ctx.tools.get('dns_recon');
  if (dnsRecon) {
    ctx.logger.info('  [1/6] DNS reconnaissance...');
    const result = await dnsRecon.execute({ domain: config.target, recordTypes: ['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME'] }, ctx);
    findings.push({ phase: 'dns_recon', result: result.data });
    steps.push(`DNS recon: ${result.success ? 'complete' : 'failed'}`);
  }

  // Phase 2: Subdomain Enumeration
  if (config.scope !== 'quick') {
    const subEnum = ctx.tools.get('subdomain_enum');
    if (subEnum) {
      ctx.logger.info('  [2/6] Subdomain enumeration...');
      const result = await subEnum.execute({ domain: config.target, wordlist: 'default', concurrency: 20 }, ctx);
      findings.push({ phase: 'subdomain_enum', result: result.data });
      steps.push(`Subdomain enum: ${result.success ? 'complete' : 'failed'}`);
    }
  }

  // Phase 3: Port Scanning
  const portScanner = ctx.tools.get('port_scanner');
  if (portScanner) {
    ctx.logger.info('  [3/6] Port scanning...');
    const ports = config.scope === 'deep' ? '1-65535' : config.scope === 'standard' ? '1-10000' : '1-1024';
    const result = await portScanner.execute({ target: config.target, portRange: ports, scanType: 'tcp' }, ctx);
    findings.push({ phase: 'port_scan', result: result.data });
    steps.push(`Port scan (${ports}): ${result.success ? 'complete' : 'failed'}`);
  }

  // Phase 4: SSL/TLS Analysis
  const sslAnalyzer = ctx.tools.get('ssl_analyzer');
  if (sslAnalyzer) {
    ctx.logger.info('  [4/6] SSL/TLS analysis...');
    const result = await sslAnalyzer.execute({ host: config.target, port: 443 }, ctx);
    findings.push({ phase: 'ssl_analysis', result: result.data });
    steps.push(`SSL analysis: ${result.success ? 'complete' : 'failed'}`);
  }

  // Phase 5: Vulnerability Assessment
  const vulnScanner = ctx.tools.get('vulnerability_scanner');
  if (vulnScanner) {
    ctx.logger.info('  [5/6] Vulnerability assessment...');
    const result = await vulnScanner.execute({
      target: config.target,
      scanType: config.scope === 'deep' ? 'full' : 'web',
      maxDepth: config.scope === 'deep' ? 5 : 3,
    }, ctx);
    findings.push({ phase: 'vulnerability_scan', result: result.data });
    steps.push(`Vulnerability scan: ${result.success ? 'complete' : 'failed'}`);
  }

  // Phase 6: OSINT / Threat Intel (optional)
  if (config.includeOsint) {
    const threatIntel = ctx.tools.get('threat_intel_feed');
    if (threatIntel) {
      ctx.logger.info('  [6/6] Threat intelligence feed...');
      const result = await threatIntel.execute({ query: config.target, feedType: 'cve' }, ctx);
      findings.push({ phase: 'threat_intel', result: result.data });
      steps.push(`Threat intel: ${result.success ? 'complete' : 'failed'}`);
    }

    if (config.includeDarkWeb) {
      const shodanTool = ctx.tools.get('shodan_query');
      if (shodanTool) {
        const result = await shodanTool.execute({ query: config.target }, ctx);
        findings.push({ phase: 'shodan_exposure', result: result.data });
        steps.push(`Shodan exposure check: ${result.success ? 'complete' : 'failed'}`);
      }
    }
  }

  // Store audit memory
  await ctx.memory.store({
    agentId: ctx.agentId,
    type: 'episodic',
    namespace: 'security_audit',
    content: `Security audit of ${config.target} (${config.scope}): ${findings.length} phases completed. ${steps.join('. ')}`,
    metadata: { target: config.target, scope: config.scope, phaseCount: findings.length },
    importance: 0.9,
  });

  return {
    success: true,
    data: {
      target: config.target,
      scope: config.scope,
      phasesCompleted: findings.length,
      steps,
      findings,
      timestamp: new Date().toISOString(),
    },
  };
}
