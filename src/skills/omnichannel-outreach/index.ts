// ═══════════════════════════════════════════════════════════════
// Skill :: Omnichannel Patient Outreach
// Multi-channel engagement: Telegram + WhatsApp + Discord +
//   SMS + Email — unified patient communication
// ═══════════════════════════════════════════════════════════════

import { ExecutionContext, ToolResult } from '../../core/types.js';

export interface OmnichannelConfig {
  patientId: string;
  message: string;
  channels: Array<'telegram' | 'whatsapp' | 'discord' | 'slack' | 'sms' | 'email'>;
  priority: 'urgent' | 'normal' | 'low';
  personalizeWithName?: boolean;
  followUpHours?: number;
}

export async function executeOmnichannelOutreach(
  config: OmnichannelConfig,
  ctx: ExecutionContext
): Promise<ToolResult> {
  ctx.logger.info(`Omnichannel Outreach: patient=${config.patientId} channels=${config.channels.join(',')}`);

  const results: Array<{ channel: string; status: string; messageId?: string }> = [];
  const steps: string[] = [];

  // Step 1: Look up patient for personalization
  let patientName = 'Patient';
  const patientLookup = ctx.tools.get('patient_lookup');
  if (patientLookup && config.personalizeWithName) {
    const lookupResult = await patientLookup.execute({ patientId: config.patientId }, ctx);
    if (lookupResult.success && lookupResult.data) {
      const pd = lookupResult.data as Record<string, unknown>;
      patientName = (pd.firstName as string) || patientName;
    }
    steps.push(`Patient lookup: ${lookupResult.success ? patientName : 'not found'}`);
  }

  // Personalize message
  const personalizedMessage = config.personalizeWithName
    ? config.message.replace(/{name}/g, patientName)
    : config.message;

  // Step 2: Send through each channel
  const sendTool = ctx.tools.get('send_message');

  for (const channel of config.channels) {
    if (channel === 'email') {
      // Email goes through the email tool
      const emailTool = ctx.tools.get('email_send');
      if (emailTool) {
        const result = await emailTool.execute({
          to: `patient-${config.patientId}@doctarx.com`, // placeholder — real address from patient record
          subject: config.priority === 'urgent' ? '[URGENT] DoctaRx Health Update' : 'DoctaRx Health Update',
          body: personalizedMessage,
        }, ctx);
        results.push({ channel: 'email', status: result.success ? 'sent' : 'failed' });
        steps.push(`Email: ${result.success ? 'sent' : 'failed'}`);
      }
    } else if (sendTool) {
      // Messaging channels go through the unified send_message tool
      const result = await sendTool.execute({
        channel,
        recipientId: config.patientId,
        content: personalizedMessage,
      }, ctx);
      results.push({
        channel,
        status: result.success ? 'sent' : 'failed',
        messageId: (result.data as Record<string, unknown>)?.messageId as string,
      });
      steps.push(`${channel}: ${result.success ? 'sent' : 'failed'}`);
    } else {
      results.push({ channel, status: 'tool_unavailable' });
      steps.push(`${channel}: tool unavailable`);
    }
  }

  // Step 3: Schedule follow-up if configured
  if (config.followUpHours) {
    await ctx.memory.store({
      agentId: ctx.agentId,
      type: 'working',
      namespace: 'follow_up',
      content: `Follow-up needed for patient ${config.patientId} in ${config.followUpHours}h via ${config.channels.join(', ')}`,
      metadata: {
        patientId: config.patientId,
        followUpAt: new Date(Date.now() + config.followUpHours * 3600000).toISOString(),
        channels: config.channels,
      },
      importance: config.priority === 'urgent' ? 0.95 : 0.7,
    });
    steps.push(`Follow-up scheduled: ${config.followUpHours}h`);
  }

  // Step 4: Store outreach memory
  await ctx.memory.store({
    agentId: ctx.agentId,
    type: 'episodic',
    namespace: 'outreach',
    content: `Omnichannel outreach to patient ${config.patientId}: ${results.filter(r => r.status === 'sent').length}/${config.channels.length} channels sent`,
    metadata: { patientId: config.patientId, results },
    importance: 0.6,
  });

  const sent = results.filter(r => r.status === 'sent').length;

  return {
    success: sent > 0,
    data: {
      patientId: config.patientId,
      channelsAttempted: config.channels.length,
      channelsSent: sent,
      results,
      steps,
      timestamp: new Date().toISOString(),
    },
  };
}
