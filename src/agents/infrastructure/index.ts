// ═══════════════════════════════════════════════════════════════
// Agent::Infrastructure_Ops (Forge)
// Web navigation, provider outreach, system optimization
// ═══════════════════════════════════════════════════════════════

import { ToolDefinition, ToolResult, ExecutionContext } from '../../core/types.js';
import { z } from 'zod';

// ── Browser Navigation Tool ──

const BrowserInput = z.object({
  url: z.string().url(),
  action: z.enum(['navigate', 'screenshot', 'extract_text', 'fill_form', 'click', 'wait']),
  selector: z.string().optional(),
  formData: z.record(z.string(), z.string()).optional(),
  waitMs: z.number().optional(),
});

export const browserNavigateTool: ToolDefinition = {
  name: 'browser_navigate',
  description: 'Navigate the web using a headless browser. Can navigate URLs, extract text, fill forms, click elements, and take screenshots.',
  category: 'browser',
  inputSchema: BrowserInput,
  requiresApproval: false,
  riskLevel: 'medium',
  async execute(input: unknown, ctx: ExecutionContext): Promise<ToolResult> {
    const parsed = BrowserInput.parse(input);
    ctx.logger.info(`Browser: ${parsed.action} -> ${parsed.url}`);

    try {
      // Lazy-load Playwright to avoid startup cost
      const { chromium } = await import('playwright');
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();

      let data: unknown = null;

      switch (parsed.action) {
        case 'navigate':
          await page.goto(parsed.url, { timeout: 30000 });
          data = { title: await page.title(), url: page.url() };
          break;

        case 'extract_text':
          await page.goto(parsed.url, { timeout: 30000 });
          if (parsed.selector) {
            data = await page.locator(parsed.selector).allTextContents();
          } else {
            data = await page.locator('body').innerText();
          }
          break;

        case 'fill_form':
          await page.goto(parsed.url, { timeout: 30000 });
          if (parsed.formData) {
            for (const [sel, val] of Object.entries(parsed.formData)) {
              await page.fill(sel, val);
            }
          }
          data = { filled: Object.keys(parsed.formData || {}).length };
          break;

        case 'screenshot':
          await page.goto(parsed.url, { timeout: 30000 });
          const buf = await page.screenshot({ fullPage: true });
          data = { size: buf.length, format: 'png' };
          break;

        case 'click':
          await page.goto(parsed.url, { timeout: 30000 });
          if (parsed.selector) await page.click(parsed.selector);
          data = { clicked: parsed.selector };
          break;

        case 'wait':
          await page.goto(parsed.url, { timeout: 30000 });
          await page.waitForTimeout(parsed.waitMs || 2000);
          data = { waited: parsed.waitMs || 2000 };
          break;
      }

      await browser.close();
      return { success: true, data };
    } catch (err) {
      return { success: false, data: null, error: String(err) };
    }
  },
};

// ── DOM Parser Tool ──

const DomParserInput = z.object({
  url: z.string().url(),
  selectors: z.record(z.string(), z.string()).describe('Map of label -> CSS selector to extract'),
});

export const domParserTool: ToolDefinition = {
  name: 'dom_parser',
  description: 'Parse a web page DOM and extract structured data using CSS selectors. Returns a map of label -> extracted text.',
  category: 'browser',
  inputSchema: DomParserInput,
  requiresApproval: false,
  riskLevel: 'low',
  async execute(input: unknown, ctx: ExecutionContext): Promise<ToolResult> {
    const parsed = DomParserInput.parse(input);
    ctx.logger.info(`DOM parse: ${parsed.url} (${Object.keys(parsed.selectors).length} selectors)`);

    try {
      const { chromium } = await import('playwright');
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.goto(parsed.url, { timeout: 30000 });

      const results: Record<string, string | null> = {};
      for (const [label, selector] of Object.entries(parsed.selectors)) {
        try {
          results[label] = await page.locator(selector).first().innerText();
        } catch {
          results[label] = null;
        }
      }

      await browser.close();
      return { success: true, data: results };
    } catch (err) {
      return { success: false, data: null, error: String(err) };
    }
  },
};

// ── Email Send Tool ──

const EmailInput = z.object({
  to: z.string().email(),
  subject: z.string(),
  body: z.string(),
  replyTo: z.string().email().optional(),
  isHtml: z.boolean().default(false),
});

export const emailSendTool: ToolDefinition = {
  name: 'email_send',
  description: 'Send an email on behalf of DoctaRx. Used for provider outreach, partnership inquiries, and patient communications.',
  category: 'email',
  inputSchema: EmailInput,
  requiresApproval: true,
  riskLevel: 'high',
  async execute(input: unknown, ctx: ExecutionContext): Promise<ToolResult> {
    const parsed = EmailInput.parse(input);
    ctx.logger.info(`Email: -> ${parsed.to} subject="${parsed.subject}"`);

    // In production, use nodemailer or similar
    return {
      success: true,
      data: {
        to: parsed.to,
        subject: parsed.subject,
        status: 'queued',
        note: 'Email queued for delivery. SMTP configuration required.',
      },
    };
  },
};

// ── Network Scanner Tool ──

const NetworkScanInput = z.object({
  region: z.string().describe('Geographic region to scan for providers'),
  specialty: z.string().optional(),
  maxResults: z.number().default(20),
});

export const networkScannerTool: ToolDefinition = {
  name: 'network_scanner',
  description: 'Scan regional provider directories to identify gaps in DoctaRx network coverage and find potential partnership targets.',
  category: 'browser',
  inputSchema: NetworkScanInput,
  requiresApproval: false,
  riskLevel: 'medium',
  async execute(input: unknown, ctx: ExecutionContext): Promise<ToolResult> {
    const parsed = NetworkScanInput.parse(input);
    ctx.logger.info(`Network scan: region=${parsed.region} specialty=${parsed.specialty}`);

    // This would scrape provider directories using the browser tool
    return {
      success: true,
      data: {
        region: parsed.region,
        specialty: parsed.specialty,
        providersFound: 0,
        gaps: [],
        note: 'Provider directory scraping requires target URLs configuration',
      },
    };
  },
};

// ── Git Operations Tool ──

const GitInput = z.object({
  operation: z.enum(['status', 'diff', 'log', 'pull', 'push', 'commit']),
  repo: z.string().default('doctarx'),
  message: z.string().optional(),
  branch: z.string().default('main'),
});

export const gitOperationsTool: ToolDefinition = {
  name: 'git_operations',
  description: 'Execute git operations on the DoctaRx repository. Can check status, view diffs, pull updates, and push code changes (with governance approval).',
  category: 'system',
  inputSchema: GitInput,
  requiresApproval: true,
  riskLevel: 'critical',
  async execute(input: unknown, ctx: ExecutionContext): Promise<ToolResult> {
    const parsed = GitInput.parse(input);
    ctx.logger.info(`Git: ${parsed.operation} on ${parsed.repo}/${parsed.branch}`);

    return {
      success: true,
      data: {
        operation: parsed.operation,
        repo: parsed.repo,
        branch: parsed.branch,
        status: 'governance_review_required',
        note: 'Git push operations require human approval via governance channel',
      },
    };
  },
};

export const infrastructureTools: ToolDefinition[] = [
  browserNavigateTool,
  domParserTool,
  emailSendTool,
  networkScannerTool,
  gitOperationsTool,
];
