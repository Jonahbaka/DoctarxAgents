// ═══════════════════════════════════════════════════════════════
// Agent :: Multimodal Intelligence
// Image analysis + document OCR via Claude Vision
// ═══════════════════════════════════════════════════════════════

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { ToolDefinition } from '../../core/types.js';
import { CONFIG } from '../../core/config.js';

const client = new Anthropic({ apiKey: CONFIG.anthropic.apiKey });

// ── Tool 1: Image Analyzer ─────────────────────────────────

const imageAnalyzer: ToolDefinition = {
  name: 'image_analyzer',
  description: 'Analyze images using Claude Vision — describe contents, extract text, identify objects, detect anomalies. Accepts file path or base64.',
  category: 'protocol',
  inputSchema: z.object({
    source: z.string().describe('File path or base64-encoded image data'),
    sourceType: z.enum(['file', 'base64', 'url']).default('file'),
    mediaType: z.enum(['image/jpeg', 'image/png', 'image/gif', 'image/webp']).default('image/png'),
    prompt: z.string().default('Describe this image in detail. Extract any visible text.'),
  }),
  requiresApproval: false,
  riskLevel: 'low',

  execute: async (input) => {
    const { source, sourceType, mediaType, prompt } = input as {
      source: string; sourceType: string; mediaType: string; prompt: string;
    };

    try {
      let imageContent: Anthropic.ImageBlockParam;

      if (sourceType === 'url') {
        imageContent = {
          type: 'image',
          source: { type: 'url', url: source },
        };
      } else if (sourceType === 'base64') {
        imageContent = {
          type: 'image',
          source: { type: 'base64', media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: source },
        };
      } else {
        // Read from file
        const absPath = path.resolve(source);
        if (!fs.existsSync(absPath)) {
          return { success: false, data: null, error: `File not found: ${absPath}` };
        }
        const fileData = fs.readFileSync(absPath);
        const base64 = fileData.toString('base64');
        const ext = path.extname(absPath).toLowerCase();
        const detectedType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
          : ext === '.png' ? 'image/png'
          : ext === '.gif' ? 'image/gif'
          : ext === '.webp' ? 'image/webp'
          : mediaType;

        imageContent = {
          type: 'image',
          source: { type: 'base64', media_type: detectedType as 'image/jpeg', data: base64 },
        };
      }

      const response = await client.messages.create({
        model: CONFIG.anthropic.model,
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: [
            imageContent,
            { type: 'text', text: prompt },
          ],
        }],
      });

      const text = response.content.find(b => b.type === 'text')?.text || '';

      return {
        success: true,
        data: {
          analysis: text,
          tokensUsed: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
        },
      };
    } catch (err) {
      return { success: false, data: null, error: `Image analysis failed: ${err}` };
    }
  },
};

// ── Tool 2: Document OCR ────────────────────────────────────

const documentOcr: ToolDefinition = {
  name: 'document_ocr',
  description: 'Extract text, tables, and form data from document images or PDFs using Claude Vision. Useful for medical records, insurance forms, lab results.',
  category: 'protocol',
  inputSchema: z.object({
    source: z.string().describe('File path or base64-encoded document image'),
    sourceType: z.enum(['file', 'base64']).default('file'),
    extractionMode: z.enum(['full_text', 'tables', 'forms', 'structured']).default('structured'),
  }),
  requiresApproval: false,
  riskLevel: 'low',

  execute: async (input) => {
    const { source, sourceType, extractionMode } = input as {
      source: string; sourceType: string; extractionMode: string;
    };

    try {
      let base64Data: string;
      let mimeType = 'image/png';

      if (sourceType === 'base64') {
        base64Data = source;
      } else {
        const absPath = path.resolve(source);
        if (!fs.existsSync(absPath)) {
          return { success: false, data: null, error: `File not found: ${absPath}` };
        }
        base64Data = fs.readFileSync(absPath).toString('base64');
        const ext = path.extname(absPath).toLowerCase();
        if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
        else if (ext === '.webp') mimeType = 'image/webp';
      }

      const modePrompts: Record<string, string> = {
        full_text: 'Extract ALL text from this document. Preserve the layout and formatting as much as possible.',
        tables: 'Extract all tables from this document. Return them as structured markdown tables with headers.',
        forms: 'This is a form document. Extract all field labels and their values as key-value pairs.',
        structured: `Extract all content from this document in a structured format:
1. Document type/title
2. All text content (preserve layout)
3. Any tables (as markdown tables)
4. Any form fields (as key-value pairs)
5. Any dates, numbers, or identifiers
6. Any signatures or stamps noted`,
      };

      const response = await client.messages.create({
        model: CONFIG.anthropic.model,
        max_tokens: 8192,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType as 'image/png', data: base64Data },
            },
            { type: 'text', text: modePrompts[extractionMode] || modePrompts.structured },
          ],
        }],
      });

      const text = response.content.find(b => b.type === 'text')?.text || '';

      return {
        success: true,
        data: {
          extractedContent: text,
          extractionMode,
          tokensUsed: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
        },
      };
    } catch (err) {
      return { success: false, data: null, error: `Document OCR failed: ${err}` };
    }
  },
};

export const multimodalTools: ToolDefinition[] = [imageAnalyzer, documentOcr];
