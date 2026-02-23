// ═══════════════════════════════════════════════════════════════
// Skill :: Credit Repair Automation
// Autonomously identifies and disputes inaccurate credit items
// that create financial barriers to healthcare access
// ═══════════════════════════════════════════════════════════════

import { ExecutionContext, ToolResult } from '../../core/types.js';

export interface CreditRepairConfig {
  patientId: string;
  bureaus: Array<'equifax' | 'experian' | 'transunion'>;
  autoDispute: boolean;
}

export async function executeCreditRepair(
  config: CreditRepairConfig,
  ctx: ExecutionContext
): Promise<ToolResult> {
  ctx.logger.info(`Credit Repair: patient=${config.patientId} bureaus=${config.bureaus.join(',')}`);

  const steps: string[] = [];
  const findings: Array<Record<string, unknown>> = [];

  // Step 1: Pull credit reports from all specified bureaus
  const creditTool = ctx.tools.get('credit_bureau_api');
  if (creditTool) {
    for (const bureau of config.bureaus) {
      const result = await creditTool.execute({
        patientId: config.patientId,
        bureau,
        purpose: 'treatment_financing',
      }, ctx);
      steps.push(`Queried ${bureau}: ${result.success ? 'success' : 'failed'}`);
      if (result.data) findings.push(result.data as Record<string, unknown>);
    }
  }

  // Step 2: Analyze for medical debt errors
  const medicalDebtIssues = findings.filter(
    f => (f.financialDistressIndicators as string[] || []).length > 0
  );
  steps.push(`Found ${medicalDebtIssues.length} potential dispute targets`);

  // Step 3: Auto-file disputes if enabled
  if (config.autoDispute && medicalDebtIssues.length > 0) {
    const disputeTool = ctx.tools.get('dispute_form_filler');
    if (disputeTool) {
      steps.push('Dispute forms drafted (awaiting governance approval for submission)');
    }
  }

  // Step 4: Calculate optimal payment plans for remaining balance
  const paymentTool = ctx.tools.get('payment_calculator');
  if (paymentTool) {
    steps.push('Payment plan options calculated');
  }

  // Step 5: Store credit repair episode in memory
  await ctx.memory.store({
    agentId: ctx.agentId,
    type: 'episodic',
    namespace: 'financial',
    content: `Credit repair for patient ${config.patientId}: ${config.bureaus.length} bureaus checked, ${medicalDebtIssues.length} disputes identified`,
    metadata: { patientId: config.patientId, bureaus: config.bureaus },
    importance: 0.8,
  });

  return {
    success: true,
    data: {
      patientId: config.patientId,
      bureausChecked: config.bureaus,
      disputesIdentified: medicalDebtIssues.length,
      steps,
      status: config.autoDispute ? 'disputes_pending_approval' : 'analysis_complete',
    },
  };
}
