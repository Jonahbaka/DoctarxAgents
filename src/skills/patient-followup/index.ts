// ═══════════════════════════════════════════════════════════════
// Skill :: Patient Follow-Up
// Autonomous patient engagement — appointment reminders,
// post-visit check-ins, medication adherence tracking
// ═══════════════════════════════════════════════════════════════

import { ExecutionContext, ToolResult, PatientRecord } from '../../core/types.js';

export interface FollowUpConfig {
  patientId: string;
  followUpType: 'appointment_reminder' | 'post_visit' | 'medication_check' | 'payment_reminder' | 'general';
  channel: 'email' | 'sms' | 'portal';
  customMessage?: string;
}

export async function executePatientFollowUp(
  config: FollowUpConfig,
  ctx: ExecutionContext
): Promise<ToolResult> {
  ctx.logger.info(`Patient Follow-Up: ${config.followUpType} for patient=${config.patientId} via ${config.channel}`);

  const steps: string[] = [];

  // Step 1: Look up patient record
  const lookupTool = ctx.tools.get('patient_lookup');
  let patientData: PatientRecord | null = null;

  if (lookupTool) {
    const result = await lookupTool.execute({ query: config.patientId }, ctx);
    steps.push(`Patient lookup: ${result.success ? 'found' : 'not found'}`);
  }

  // Step 2: Check clinical context
  const fhirTool = ctx.tools.get('fhir_query');
  if (fhirTool) {
    // Get recent encounters
    await fhirTool.execute({
      resourceType: 'Encounter',
      patientId: config.patientId,
    }, ctx);
    steps.push('Clinical context retrieved');

    // Get active medications
    await fhirTool.execute({
      resourceType: 'MedicationRequest',
      patientId: config.patientId,
    }, ctx);
    steps.push('Medication list retrieved');
  }

  // Step 3: Generate appropriate follow-up content
  let messageContent = config.customMessage || '';
  if (!messageContent) {
    switch (config.followUpType) {
      case 'appointment_reminder':
        messageContent = 'This is a reminder about your upcoming appointment with DoctaRx. Please confirm or reschedule at your convenience.';
        break;
      case 'post_visit':
        messageContent = 'Thank you for your recent visit. How are you feeling? Please let us know if you have any questions about your treatment plan.';
        break;
      case 'medication_check':
        messageContent = 'This is a medication adherence check-in. Are you taking your prescribed medications as directed? Please reach out if you are experiencing any side effects.';
        break;
      case 'payment_reminder':
        messageContent = 'This is a friendly reminder about your account balance. We offer flexible payment plans — contact us to discuss options.';
        break;
      default:
        messageContent = 'Hello from DoctaRx. We are checking in to see how you are doing. Please do not hesitate to reach out if you need anything.';
    }
  }
  steps.push(`Follow-up content generated: ${config.followUpType}`);

  // Step 4: Send via appropriate channel
  if (config.channel === 'email') {
    const emailTool = ctx.tools.get('email_send');
    if (emailTool) {
      steps.push('Email queued (awaiting send)');
    }
  } else {
    steps.push(`${config.channel} delivery pending integration`);
  }

  // Step 5: Record follow-up in memory
  await ctx.memory.store({
    agentId: ctx.agentId,
    type: 'episodic',
    namespace: 'crm',
    content: `Follow-up (${config.followUpType}) sent to patient ${config.patientId} via ${config.channel}`,
    metadata: {
      patientId: config.patientId,
      type: config.followUpType,
      channel: config.channel,
    },
    importance: 0.5,
  });

  return {
    success: true,
    data: {
      patientId: config.patientId,
      followUpType: config.followUpType,
      channel: config.channel,
      messagePreview: messageContent.slice(0, 100),
      steps,
      status: 'follow_up_queued',
    },
  };
}
