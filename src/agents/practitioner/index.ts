// ═══════════════════════════════════════════════════════════════
// Agent: Asclepius — Practitioner Onboarding & Credentialing
// 5 tools: NPI lookup, registration, verification, credential
//          check, profile update
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';
import { ToolDefinition } from '../../core/types.js';
import { CONFIG } from '../../core/config.js';

// ── Tool 1: NPI Lookup ──────────────────────────────────────

const npiLookupSchema = z.object({
  searchType: z.enum(['npi', 'name', 'specialty']),
  npi: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  state: z.string().optional(),
  specialty: z.string().optional(),
  limit: z.number().min(1).max(200).optional().default(10),
});

// ── Tool 2: Practitioner Register ───────────────────────────

const practitionerRegisterSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(['doctor', 'nurse', 'pharmacist', 'therapist', 'surgeon', 'dentist', 'midwife', 'lab_tech', 'other']),
  licenseNumber: z.string().min(1),
  jurisdiction: z.string().min(1), // e.g., "US-CA", "NG", "GH", "KE", "UG", "IN"
  specialties: z.array(z.string()).optional().default([]),
  email: z.string().email(),
  phone: z.string().min(5),
  npi: z.string().optional(),
  linkedFacilities: z.array(z.string()).optional().default([]),
});

// ── Tool 3: Practitioner Verify ─────────────────────────────

const practitionerVerifySchema = z.object({
  practitionerId: z.string().min(1),
  method: z.enum(['npi_cross_reference', 'manual_approval', 'document_review']),
  verifierNotes: z.string().optional().default(''),
});

// ── Tool 4: Credential Check ────────────────────────────────

const credentialCheckSchema = z.object({
  practitionerId: z.string().optional(),
  npi: z.string().optional(),
  licenseNumber: z.string().optional(),
  jurisdiction: z.string().optional(),
});

// ── Tool 5: Profile Update ──────────────────────────────────

const profileUpdateSchema = z.object({
  practitionerId: z.string().min(1),
  updates: z.object({
    specialties: z.array(z.string()).optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    linkedFacilities: z.array(z.string()).optional(),
    availability: z.string().optional(),
  }),
});

// ── Tool Implementations ────────────────────────────────────

export const practitionerTools: ToolDefinition[] = [
  // ─── 1. NPI Lookup ────────────────────────────────────────
  {
    name: 'npi_lookup',
    description: 'Query the US NPI/NPPES Registry by name, NPI number, state, or specialty. Returns practitioner details, taxonomy codes, and addresses.',
    category: 'practitioner',
    inputSchema: npiLookupSchema,
    requiresApproval: false,
    riskLevel: 'low',
    execute: async (input, ctx) => {
      const params = npiLookupSchema.parse(input);
      ctx.logger.info(`[Asclepius] NPI lookup: ${params.searchType}`);

      try {
        const queryParams = new URLSearchParams({ version: '2.1', limit: String(params.limit) });

        if (params.searchType === 'npi' && params.npi) {
          queryParams.set('number', params.npi);
        } else if (params.searchType === 'name') {
          if (params.firstName) queryParams.set('first_name', params.firstName);
          if (params.lastName) queryParams.set('last_name', params.lastName);
          if (params.state) queryParams.set('state', params.state);
        } else if (params.searchType === 'specialty' && params.specialty) {
          queryParams.set('taxonomy_description', params.specialty);
          if (params.state) queryParams.set('state', params.state);
        }

        const url = `${CONFIG.practitioner.npiApiUrl}?${queryParams.toString()}`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });

        if (!resp.ok) {
          return { success: false, data: null, error: `NPI API returned ${resp.status}` };
        }

        const data = await resp.json() as Record<string, unknown>;
        const results = (data.results || []) as Array<Record<string, unknown>>;

        const practitioners = results.map((r: Record<string, unknown>) => {
          const basic = r.basic as Record<string, unknown> | undefined;
          const taxonomies = r.taxonomies as Array<Record<string, unknown>> | undefined;
          const addresses = r.addresses as Array<Record<string, unknown>> | undefined;
          return {
            npi: r.number,
            firstName: basic?.first_name || '',
            lastName: basic?.last_name || '',
            credential: basic?.credential || '',
            gender: basic?.gender || '',
            status: basic?.status || '',
            taxonomies: taxonomies?.map((t: Record<string, unknown>) => ({
              code: t.code,
              description: t.desc,
              primary: t.primary,
              state: t.state,
              license: t.license,
            })) || [],
            addresses: addresses?.map((a: Record<string, unknown>) => ({
              type: a.address_purpose,
              line1: a.address_1,
              city: a.city,
              state: a.state,
              zip: a.postal_code,
              phone: a.telephone_number,
            })) || [],
          };
        });

        return {
          success: true,
          data: { resultCount: data.result_count, practitioners },
          metadata: { source: 'NPPES', apiVersion: '2.1' },
        };
      } catch (err) {
        return { success: false, data: null, error: `NPI lookup failed: ${err}` };
      }
    },
  },

  // ─── 2. Practitioner Register ─────────────────────────────
  {
    name: 'practitioner_register',
    description: 'Register a new medical practitioner (doctor, nurse, pharmacist, etc.) with license, jurisdiction, specialties, and contact info. Stores in the practitioner registry.',
    category: 'practitioner',
    inputSchema: practitionerRegisterSchema,
    requiresApproval: false,
    riskLevel: 'medium',
    execute: async (input, ctx) => {
      const params = practitionerRegisterSchema.parse(input);
      ctx.logger.info(`[Asclepius] Registering practitioner: ${params.firstName} ${params.lastName} (${params.role})`);

      const practitionerId = `PRAC-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const profile = {
        id: practitionerId,
        ...params,
        verificationStatus: 'pending' as const,
        registeredAt: new Date().toISOString(),
        verifiedAt: null,
      };

      // Store in memory
      await ctx.memory.store({
        agentId: ctx.agentId,
        type: 'semantic',
        namespace: 'practitioners',
        content: JSON.stringify(profile),
        importance: 0.8,
        metadata: {
          practitionerId,
          role: params.role,
          jurisdiction: params.jurisdiction,
          licenseNumber: params.licenseNumber,
        },
      });

      return {
        success: true,
        data: {
          practitionerId,
          status: 'registered',
          verificationStatus: 'pending',
          message: `${params.role} ${params.firstName} ${params.lastName} registered. Verification pending.`,
        },
        metadata: { jurisdiction: params.jurisdiction },
      };
    },
  },

  // ─── 3. Practitioner Verify ───────────────────────────────
  {
    name: 'practitioner_verify',
    description: 'Verify a practitioner\'s credentials. For US practitioners, cross-references NPI registry. For Africa/India, supports manual approval or document review.',
    category: 'practitioner',
    inputSchema: practitionerVerifySchema,
    requiresApproval: true,
    riskLevel: 'high',
    execute: async (input, ctx) => {
      const params = practitionerVerifySchema.parse(input);
      ctx.logger.info(`[Asclepius] Verifying practitioner ${params.practitionerId} via ${params.method}`);

      // Recall practitioner record
      const records = await ctx.memory.recall(`practitionerId:${params.practitionerId}`, 'practitioners', 1);

      if (records.length === 0) {
        return { success: false, data: null, error: `Practitioner ${params.practitionerId} not found` };
      }

      const profile = JSON.parse(records[0].content);
      let verificationResult: { verified: boolean; details: string } = { verified: false, details: '' };

      switch (params.method) {
        case 'npi_cross_reference': {
          if (!profile.npi) {
            return { success: false, data: null, error: 'No NPI number on record — cannot cross-reference' };
          }
          // Query NPI registry
          const url = `${CONFIG.practitioner.npiApiUrl}?version=2.1&number=${profile.npi}`;
          try {
            const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
            const data = await resp.json() as Record<string, unknown>;
            const count = data.result_count as number;
            if (count > 0) {
              verificationResult = { verified: true, details: `NPI ${profile.npi} confirmed active in NPPES` };
            } else {
              verificationResult = { verified: false, details: `NPI ${profile.npi} not found in NPPES` };
            }
          } catch (err) {
            return { success: false, data: null, error: `NPI verification failed: ${err}` };
          }
          break;
        }

        case 'manual_approval':
          verificationResult = { verified: true, details: `Manually approved. Notes: ${params.verifierNotes}` };
          break;

        case 'document_review':
          verificationResult = { verified: true, details: `Documents reviewed and accepted. Notes: ${params.verifierNotes}` };
          break;
      }

      // Update the stored profile
      profile.verificationStatus = verificationResult.verified ? 'verified' : 'rejected';
      profile.verifiedAt = verificationResult.verified ? new Date().toISOString() : null;

      await ctx.memory.store({
        agentId: ctx.agentId,
        type: 'semantic',
        namespace: 'practitioners',
        content: JSON.stringify(profile),
        importance: 0.9,
        metadata: {
          practitionerId: params.practitionerId,
          verificationStatus: profile.verificationStatus,
          method: params.method,
        },
      });

      return {
        success: true,
        data: {
          practitionerId: params.practitionerId,
          verified: verificationResult.verified,
          status: profile.verificationStatus,
          details: verificationResult.details,
        },
      };
    },
  },

  // ─── 4. Credential Check ──────────────────────────────────
  {
    name: 'credential_check',
    description: 'Check if a practitioner\'s license is active, expired, or suspended. Cross-references stored data with NPI API for US practitioners.',
    category: 'practitioner',
    inputSchema: credentialCheckSchema,
    requiresApproval: false,
    riskLevel: 'low',
    execute: async (input, ctx) => {
      const params = credentialCheckSchema.parse(input);
      ctx.logger.info(`[Asclepius] Credential check`);

      // If NPI provided, query registry directly
      if (params.npi) {
        try {
          const url = `${CONFIG.practitioner.npiApiUrl}?version=2.1&number=${params.npi}`;
          const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
          const data = await resp.json() as Record<string, unknown>;
          const results = (data.results || []) as Array<Record<string, unknown>>;

          if (results.length > 0) {
            const r = results[0];
            const basic = r.basic as Record<string, unknown> | undefined;
            const taxonomies = r.taxonomies as Array<Record<string, unknown>> | undefined;
            return {
              success: true,
              data: {
                npi: params.npi,
                status: basic?.status === 'A' ? 'active' : 'inactive',
                name: `${basic?.first_name || ''} ${basic?.last_name || ''}`,
                credential: basic?.credential || '',
                lastUpdated: basic?.last_updated || '',
                licenses: taxonomies?.map((t: Record<string, unknown>) => ({
                  state: t.state,
                  license: t.license,
                  taxonomy: t.desc,
                  primary: t.primary,
                })) || [],
              },
            };
          }
          return { success: true, data: { npi: params.npi, status: 'not_found' } };
        } catch (err) {
          return { success: false, data: null, error: `NPI check failed: ${err}` };
        }
      }

      // Check stored practitioner record
      if (params.practitionerId) {
        const records = await ctx.memory.recall(`practitionerId:${params.practitionerId}`, 'practitioners', 1);
        if (records.length > 0) {
          const profile = JSON.parse(records[0].content);
          return {
            success: true,
            data: {
              practitionerId: params.practitionerId,
              verificationStatus: profile.verificationStatus,
              role: profile.role,
              jurisdiction: profile.jurisdiction,
              licenseNumber: profile.licenseNumber,
            },
          };
        }
      }

      return { success: false, data: null, error: 'Provide practitionerId or npi to check credentials' };
    },
  },

  // ─── 5. Profile Update ────────────────────────────────────
  {
    name: 'practitioner_profile_update',
    description: 'Update a practitioner\'s profile — specialties, contact info, availability, linked facilities.',
    category: 'practitioner',
    inputSchema: profileUpdateSchema,
    requiresApproval: false,
    riskLevel: 'low',
    execute: async (input, ctx) => {
      const params = profileUpdateSchema.parse(input);
      ctx.logger.info(`[Asclepius] Updating profile for ${params.practitionerId}`);

      const records = await ctx.memory.recall(`practitionerId:${params.practitionerId}`, 'practitioners', 1);
      if (records.length === 0) {
        return { success: false, data: null, error: `Practitioner ${params.practitionerId} not found` };
      }

      const profile = JSON.parse(records[0].content);
      const updatedFields: string[] = [];

      if (params.updates.specialties) { profile.specialties = params.updates.specialties; updatedFields.push('specialties'); }
      if (params.updates.email) { profile.email = params.updates.email; updatedFields.push('email'); }
      if (params.updates.phone) { profile.phone = params.updates.phone; updatedFields.push('phone'); }
      if (params.updates.linkedFacilities) { profile.linkedFacilities = params.updates.linkedFacilities; updatedFields.push('linkedFacilities'); }
      if (params.updates.availability) { profile.availability = params.updates.availability; updatedFields.push('availability'); }

      await ctx.memory.store({
        agentId: ctx.agentId,
        type: 'semantic',
        namespace: 'practitioners',
        content: JSON.stringify(profile),
        importance: 0.7,
        metadata: {
          practitionerId: params.practitionerId,
          updatedFields,
        },
      });

      return {
        success: true,
        data: {
          practitionerId: params.practitionerId,
          updatedFields,
          message: `Profile updated: ${updatedFields.join(', ')}`,
        },
      };
    },
  },
];
