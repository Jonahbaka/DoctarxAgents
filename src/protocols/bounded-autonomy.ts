// ═══════════════════════════════════════════════════════════════
// Protocol :: Bounded Autonomy Engine
// Formalized governance — maps risk to authority levels
// Ensures tools with real-world impact require human approval
// ═══════════════════════════════════════════════════════════════

import { AuthorityLevel, GovernancePolicy, ToolDefinition, LoggerHandle } from '../core/types.js';

export class BoundedAutonomyEngine {
  private policies: GovernancePolicy[];
  private overrides: Map<string, AuthorityLevel> = new Map();
  private auditLog: Array<{ timestamp: Date; tool: string; decision: AuthorityLevel; reason: string }> = [];
  private logger: LoggerHandle;

  constructor(logger: LoggerHandle) {
    this.logger = logger;

    // Default governance policies (strictest risk → authority mapping)
    this.policies = [
      { riskLevel: 'critical', authority: 'require_human', auditRequired: true },
      { riskLevel: 'high', authority: 'require_approval', auditRequired: true },
      { riskLevel: 'medium', authority: 'log_only', auditRequired: true },
      { riskLevel: 'low', authority: 'auto_approve', auditRequired: false },
    ];

    this.logger.info('BoundedAutonomyEngine initialized with default governance policies');
  }

  /** Determine authority level for a tool invocation */
  getAuthority(tool: ToolDefinition): AuthorityLevel {
    // Check for tool-specific override
    const override = this.overrides.get(tool.name);
    if (override) return override;

    // Check if tool explicitly requires approval
    if (tool.requiresApproval) {
      return tool.riskLevel === 'critical' ? 'require_human' : 'require_approval';
    }

    // Match against governance policies
    const policy = this.policies.find(p => p.riskLevel === tool.riskLevel);
    return policy?.authority || 'require_approval';
  }

  /** Check whether a tool can auto-execute (no human in the loop) */
  canAutoExecute(tool: ToolDefinition): boolean {
    const authority = this.getAuthority(tool);
    return authority === 'auto_approve' || authority === 'log_only';
  }

  /** Check if audit trail is required for a tool */
  requiresAudit(tool: ToolDefinition): boolean {
    if (tool.requiresApproval) return true;
    const policy = this.policies.find(p => p.riskLevel === tool.riskLevel);
    return policy?.auditRequired ?? true;
  }

  /** Record an autonomy decision in the audit log */
  recordDecision(tool: ToolDefinition, decision: AuthorityLevel, reason: string): void {
    this.auditLog.push({
      timestamp: new Date(),
      tool: tool.name,
      decision,
      reason,
    });

    // Keep audit log bounded
    if (this.auditLog.length > 10000) {
      this.auditLog = this.auditLog.slice(-5000);
    }

    this.logger.debug(`Autonomy decision: ${tool.name} → ${decision} (${reason})`);
  }

  /** Set a per-tool authority override */
  setOverride(toolName: string, authority: AuthorityLevel): void {
    this.overrides.set(toolName, authority);
    this.logger.info(`Autonomy override set: ${toolName} → ${authority}`);
  }

  /** Remove a per-tool override */
  removeOverride(toolName: string): void {
    this.overrides.delete(toolName);
  }

  /** Update governance policies */
  setPolicies(policies: GovernancePolicy[]): void {
    this.policies = policies;
    this.logger.info(`Governance policies updated: ${policies.length} policies`);
  }

  /** Get current policies */
  getPolicies(): GovernancePolicy[] {
    return [...this.policies];
  }

  /** Get recent audit log entries */
  getAuditLog(limit = 100): Array<{ timestamp: Date; tool: string; decision: AuthorityLevel; reason: string }> {
    return this.auditLog.slice(-limit);
  }

  /** Validate an action against value-based escalation thresholds */
  validateValueThreshold(tool: ToolDefinition, estimatedValue: number): AuthorityLevel {
    const baseAuthority = this.getAuthority(tool);

    // Escalate if value exceeds auto-approve threshold
    const policy = this.policies.find(p => p.riskLevel === tool.riskLevel);
    if (policy?.maxAutoApproveValue && estimatedValue > policy.maxAutoApproveValue) {
      const escalated: AuthorityLevel = baseAuthority === 'auto_approve' ? 'require_approval' : 'require_human';
      this.recordDecision(tool, escalated, `Value threshold exceeded: $${estimatedValue}`);
      return escalated;
    }

    return baseAuthority;
  }
}
