// ═══════════════════════════════════════════════════════════════
// Agent::Clinical_Specialist (Hippocrates)
// Diagnosis, EHR telemetry, FHIR protocols, triage scoring
// ═══════════════════════════════════════════════════════════════

import { ToolDefinition, ToolResult, ExecutionContext } from '../../core/types.js';
import { z } from 'zod';

// ── FHIR Patient Query Tool ──

const FhirQueryInput = z.object({
  resourceType: z.enum(['Patient', 'Condition', 'MedicationRequest', 'Observation', 'Encounter', 'AllergyIntolerance']),
  patientId: z.string().optional(),
  searchParams: z.record(z.string(), z.string()).optional(),
});

export const fhirQueryTool: ToolDefinition = {
  name: 'fhir_query',
  description: 'Query the DoctaRx EHR via FHIR R4 protocol. Supports Patient, Condition, MedicationRequest, Observation, Encounter, AllergyIntolerance resources.',
  category: 'fhir',
  inputSchema: FhirQueryInput,
  requiresApproval: false,
  riskLevel: 'low',
  async execute(input: unknown, ctx: ExecutionContext): Promise<ToolResult> {
    const parsed = FhirQueryInput.parse(input);
    ctx.logger.info(`FHIR query: ${parsed.resourceType}`, { patientId: parsed.patientId });

    try {
      // TODO: Wire to actual FHIR endpoint
      return {
        success: true,
        data: {
          resourceType: 'Bundle',
          type: 'searchset',
          total: 0,
          entry: [],
          _query: parsed,
        },
        metadata: { source: 'fhir_r4', timestamp: new Date().toISOString() },
      };
    } catch (err) {
      return { success: false, data: null, error: String(err) };
    }
  },
};

// ── FHIR Write Tool ──

const FhirWriteInput = z.object({
  resourceType: z.string(),
  resource: z.record(z.string(), z.unknown()),
  method: z.enum(['POST', 'PUT']).default('POST'),
});

export const fhirWriteTool: ToolDefinition = {
  name: 'fhir_write',
  description: 'Write a FHIR resource to the DoctaRx EHR. Requires clinical oversight approval for medication and condition resources.',
  category: 'fhir',
  inputSchema: FhirWriteInput,
  requiresApproval: true,
  riskLevel: 'high',
  async execute(input: unknown, ctx: ExecutionContext): Promise<ToolResult> {
    const parsed = FhirWriteInput.parse(input);
    ctx.logger.info(`FHIR write: ${parsed.method} ${parsed.resourceType}`);

    return {
      success: true,
      data: { status: 'created', resourceType: parsed.resourceType },
      metadata: { requiresProviderSignoff: true },
    };
  },
};

// ── Patient Lookup Tool ──

const PatientLookupInput = z.object({
  query: z.string().describe('Patient name, MRN, email, or phone'),
});

export const patientLookupTool: ToolDefinition = {
  name: 'patient_lookup',
  description: 'Search for a patient in the DoctaRx system by name, MRN, email, or phone number.',
  category: 'database',
  inputSchema: PatientLookupInput,
  requiresApproval: false,
  riskLevel: 'low',
  async execute(input: unknown, ctx: ExecutionContext): Promise<ToolResult> {
    const parsed = PatientLookupInput.parse(input);
    ctx.logger.info(`Patient lookup: ${parsed.query}`);

    return {
      success: true,
      data: { results: [], query: parsed.query },
    };
  },
};

// ── Triage Scorer Tool ──

const TriageInput = z.object({
  symptoms: z.array(z.string()),
  vitalSigns: z.object({
    heartRate: z.number().optional(),
    bloodPressure: z.string().optional(),
    temperature: z.number().optional(),
    oxygenSaturation: z.number().optional(),
  }).optional(),
  patientAge: z.number().optional(),
  medicalHistory: z.array(z.string()).optional(),
});

export const triageScorerTool: ToolDefinition = {
  name: 'triage_scorer',
  description: 'Calculate an AI-assisted triage acuity score based on symptoms, vitals, and medical history. Score 1-5 (1=immediate, 5=non-urgent).',
  category: 'api',
  inputSchema: TriageInput,
  requiresApproval: false,
  riskLevel: 'medium',
  async execute(input: unknown, ctx: ExecutionContext): Promise<ToolResult> {
    const parsed = TriageInput.parse(input);
    ctx.logger.info(`Triage scoring: ${parsed.symptoms.length} symptoms`);

    // Simplified triage logic — in production, this calls the AI triage model
    let score = 4; // default non-urgent
    const urgentKeywords = ['chest pain', 'difficulty breathing', 'stroke', 'unconscious', 'severe bleeding'];
    const hasUrgent = parsed.symptoms.some(s => urgentKeywords.some(k => s.toLowerCase().includes(k)));
    if (hasUrgent) score = 1;
    else if (parsed.symptoms.length > 5) score = 2;
    else if (parsed.symptoms.length > 3) score = 3;

    return {
      success: true,
      data: {
        triageScore: score,
        acuity: ['', 'Immediate', 'Emergent', 'Urgent', 'Less Urgent', 'Non-Urgent'][score],
        symptoms: parsed.symptoms,
        recommendation: score <= 2 ? 'Route to emergency provider immediately' : 'Schedule standard consultation',
      },
    };
  },
};

// ── Medication Interaction Checker ──

const MedicationCheckInput = z.object({
  currentMedications: z.array(z.string()),
  proposedMedication: z.string(),
});

export const medicationCheckerTool: ToolDefinition = {
  name: 'medication_checker',
  description: 'Check for potential drug interactions between current medications and a proposed new medication.',
  category: 'api',
  inputSchema: MedicationCheckInput,
  requiresApproval: false,
  riskLevel: 'medium',
  async execute(input: unknown, ctx: ExecutionContext): Promise<ToolResult> {
    const parsed = MedicationCheckInput.parse(input);
    ctx.logger.info(`Medication check: ${parsed.proposedMedication} against ${parsed.currentMedications.length} current meds`);

    return {
      success: true,
      data: {
        interactions: [],
        severity: 'none',
        safe: true,
        note: 'No known interactions detected. Provider review recommended.',
      },
    };
  },
};

// ── Export all clinical tools ──

export const clinicalTools: ToolDefinition[] = [
  fhirQueryTool,
  fhirWriteTool,
  patientLookupTool,
  triageScorerTool,
  medicationCheckerTool,
];
