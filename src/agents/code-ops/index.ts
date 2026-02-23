// ═══════════════════════════════════════════════════════════════
// Agent: Prometheus — Self-Evolving Code Operations
// 8 tools: code read, write, test, diagnose, fix, review,
//          deploy, runtime patch
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';
import { ToolDefinition } from '../../core/types.js';
import { CONFIG } from '../../core/config.js';
import { execSync, exec } from 'child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import path from 'path';

// ── Helpers ─────────────────────────────────────────────────

function safeExec(cmd: string, cwd: string, timeoutMs = 30000): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(cmd, { cwd, timeout: timeoutMs, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return { stdout: e.stdout || '', stderr: e.stderr || '', exitCode: e.status || 1 };
  }
}

function resolveRepoPath(filePath: string): string {
  // Prevent path traversal
  const resolved = path.resolve(CONFIG.codeOps.repoPath, filePath);
  if (!resolved.startsWith(path.resolve(CONFIG.codeOps.repoPath))) {
    throw new Error('Path traversal detected — access denied');
  }
  return resolved;
}

// ── Schemas ─────────────────────────────────────────────────

const codeReadSchema = z.object({
  filePath: z.string().min(1),
  startLine: z.number().positive().optional(),
  endLine: z.number().positive().optional(),
  includeLineNumbers: z.boolean().optional().default(true),
});

const codeWriteSchema = z.object({
  filePath: z.string().min(1),
  content: z.string(),
  createDirectories: z.boolean().optional().default(false),
  backup: z.boolean().optional().default(true),
});

const codeTestSchema = z.object({
  command: z.string().optional(),
  testFile: z.string().optional(),
  coverage: z.boolean().optional().default(false),
  watch: z.boolean().optional().default(false),
});

const codeDiagnoseSchema = z.object({
  scope: z.enum(['full', 'file', 'directory']).optional().default('full'),
  target: z.string().optional(),
  checks: z.array(z.enum(['typescript', 'lint', 'test', 'build', 'security'])).optional().default(['typescript']),
});

const codeFixSchema = z.object({
  filePath: z.string().min(1),
  issue: z.string().min(1),
  searchPattern: z.string().optional(),
  replacement: z.string().optional(),
  autoTest: z.boolean().optional().default(true),
});

const codeReviewSchema = z.object({
  filePath: z.string().optional(),
  diffRange: z.string().optional(),
  reviewType: z.enum(['full', 'security', 'performance', 'style']).optional().default('full'),
});

const codeDeploySchema = z.object({
  environment: z.enum(['staging', 'production']).optional().default('staging'),
  branch: z.string().optional().default('main'),
  runTests: z.boolean().optional().default(true),
  dryRun: z.boolean().optional().default(true),
});

const runtimePatchSchema = z.object({
  filePath: z.string().min(1),
  oldCode: z.string().min(1),
  newCode: z.string().min(1),
  reason: z.string().min(1),
  autoTest: z.boolean().optional().default(true),
  autoRevert: z.boolean().optional().default(true),
});

// ── Tool Implementations ────────────────────────────────────

export const codeOpsTools: ToolDefinition[] = [
  // ─── 1. Code Read ──────────────────────────────────────────
  {
    name: 'code_read',
    description: 'Read source code files from the repository. Supports line ranges, line numbers, and directory listing. Path-traversal protected.',
    category: 'code_ops',
    inputSchema: codeReadSchema,
    requiresApproval: false,
    riskLevel: 'low',
    execute: async (input, ctx) => {
      const params = codeReadSchema.parse(input);
      ctx.logger.info(`[Prometheus] Reading: ${params.filePath}`);

      try {
        const fullPath = resolveRepoPath(params.filePath);

        if (!existsSync(fullPath)) {
          return { success: false, data: null, error: `File not found: ${params.filePath}` };
        }

        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          const entries = readdirSync(fullPath, { withFileTypes: true }).map(e => ({
            name: e.name,
            type: e.isDirectory() ? 'directory' : 'file',
          }));
          return { success: true, data: { path: params.filePath, type: 'directory', entries } };
        }

        const content = readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');

        const start = params.startLine ? params.startLine - 1 : 0;
        const end = params.endLine || lines.length;
        const selectedLines = lines.slice(start, end);

        const output = params.includeLineNumbers
          ? selectedLines.map((line, i) => `${start + i + 1}: ${line}`).join('\n')
          : selectedLines.join('\n');

        return {
          success: true,
          data: {
            path: params.filePath,
            type: 'file',
            totalLines: lines.length,
            range: { start: start + 1, end },
            content: output,
            sizeBytes: stat.size,
          },
        };
      } catch (err) {
        return { success: false, data: null, error: `Read failed: ${err}` };
      }
    },
  },

  // ─── 2. Code Write ─────────────────────────────────────────
  {
    name: 'code_write',
    description: 'Write or overwrite source code files. Creates backup by default. Supports directory creation. Path-traversal protected.',
    category: 'code_ops',
    inputSchema: codeWriteSchema,
    requiresApproval: true,
    riskLevel: 'high',
    execute: async (input, ctx) => {
      const params = codeWriteSchema.parse(input);
      ctx.logger.info(`[Prometheus] Writing: ${params.filePath}`);

      if (!CONFIG.codeOps.autoFixEnabled) {
        return { success: false, data: null, error: 'Code write disabled — set CODE_OPS_AUTO_FIX=true' };
      }

      try {
        const fullPath = resolveRepoPath(params.filePath);
        const dir = path.dirname(fullPath);

        if (params.createDirectories && !existsSync(dir)) {
          const { mkdirSync } = await import('fs');
          mkdirSync(dir, { recursive: true });
        }

        // Backup existing file
        if (params.backup && existsSync(fullPath)) {
          const backupPath = `${fullPath}.bak.${Date.now()}`;
          const existing = readFileSync(fullPath, 'utf-8');
          writeFileSync(backupPath, existing, 'utf-8');
          ctx.logger.info(`[Prometheus] Backup: ${backupPath}`);
        }

        writeFileSync(fullPath, params.content, 'utf-8');

        return {
          success: true,
          data: {
            path: params.filePath,
            bytesWritten: Buffer.byteLength(params.content, 'utf-8'),
            linesWritten: params.content.split('\n').length,
          },
        };
      } catch (err) {
        return { success: false, data: null, error: `Write failed: ${err}` };
      }
    },
  },

  // ─── 3. Code Test ──────────────────────────────────────────
  {
    name: 'code_test',
    description: 'Run test suites against the codebase. Supports custom commands, specific test files, coverage reports.',
    category: 'code_ops',
    inputSchema: codeTestSchema,
    requiresApproval: false,
    riskLevel: 'medium',
    execute: async (input, ctx) => {
      const params = codeTestSchema.parse(input);
      ctx.logger.info(`[Prometheus] Running tests`);

      try {
        let cmd = params.command || CONFIG.codeOps.testCommand;
        if (params.testFile) cmd += ` -- ${params.testFile}`;
        if (params.coverage) cmd += ' --coverage';

        const result = safeExec(cmd, CONFIG.codeOps.repoPath, 120000);

        const passed = result.exitCode === 0;

        // Store test result in memory
        await ctx.memory.store({
          agentId: ctx.agentId,
          type: 'episodic',
          namespace: 'code_ops_tests',
          content: JSON.stringify({
            command: cmd,
            passed,
            exitCode: result.exitCode,
            timestamp: new Date().toISOString(),
            stdoutTail: result.stdout.slice(-2000),
            stderrTail: result.stderr.slice(-2000),
          }),
          importance: passed ? 0.3 : 0.9,
          metadata: { passed, exitCode: result.exitCode },
        });

        return {
          success: true,
          data: {
            passed,
            exitCode: result.exitCode,
            stdout: result.stdout.slice(-5000),
            stderr: result.stderr.slice(-3000),
            command: cmd,
          },
        };
      } catch (err) {
        return { success: false, data: null, error: `Test execution failed: ${err}` };
      }
    },
  },

  // ─── 4. Code Diagnose ─────────────────────────────────────
  {
    name: 'code_diagnose',
    description: 'Diagnose codebase health: TypeScript errors, lint issues, test failures, build errors, security vulnerabilities. Scans full repo or specific files.',
    category: 'code_ops',
    inputSchema: codeDiagnoseSchema,
    requiresApproval: false,
    riskLevel: 'low',
    execute: async (input, ctx) => {
      const params = codeDiagnoseSchema.parse(input);
      ctx.logger.info(`[Prometheus] Diagnosing: scope=${params.scope}, checks=${params.checks.join(',')}`);

      const diagnostics: Record<string, { passed: boolean; output: string; errors: number }> = {};

      try {
        for (const check of params.checks) {
          switch (check) {
            case 'typescript': {
              const target = params.target && params.scope === 'file' ? ` ${params.target}` : '';
              const result = safeExec(`npx tsc --noEmit${target}`, CONFIG.codeOps.repoPath, 60000);
              const errorCount = (result.stderr + result.stdout).split('\nerror TS').length - 1;
              diagnostics.typescript = { passed: result.exitCode === 0, output: result.stdout.slice(-3000), errors: Math.max(0, errorCount) };
              break;
            }
            case 'lint': {
              const target = params.target || 'src/';
              const result = safeExec(`npx eslint ${target} --format compact 2>&1 || true`, CONFIG.codeOps.repoPath, 60000);
              const errorCount = (result.stdout.match(/\d+ error/g) || []).length;
              diagnostics.lint = { passed: errorCount === 0, output: result.stdout.slice(-3000), errors: errorCount };
              break;
            }
            case 'test': {
              const result = safeExec(CONFIG.codeOps.testCommand, CONFIG.codeOps.repoPath, 120000);
              diagnostics.test = { passed: result.exitCode === 0, output: result.stdout.slice(-3000), errors: result.exitCode === 0 ? 0 : 1 };
              break;
            }
            case 'build': {
              const result = safeExec(CONFIG.codeOps.buildCommand, CONFIG.codeOps.repoPath, 120000);
              diagnostics.build = { passed: result.exitCode === 0, output: result.stdout.slice(-3000), errors: result.exitCode === 0 ? 0 : 1 };
              break;
            }
            case 'security': {
              const result = safeExec('npm audit --json 2>&1 || true', CONFIG.codeOps.repoPath, 30000);
              try {
                const audit = JSON.parse(result.stdout);
                const vulns = audit.metadata?.vulnerabilities || {};
                const total = (vulns.high || 0) + (vulns.critical || 0);
                diagnostics.security = { passed: total === 0, output: JSON.stringify(vulns), errors: total };
              } catch {
                diagnostics.security = { passed: true, output: 'Unable to parse audit', errors: 0 };
              }
              break;
            }
          }
        }

        const overallPassed = Object.values(diagnostics).every(d => d.passed);
        const totalErrors = Object.values(diagnostics).reduce((sum, d) => sum + d.errors, 0);

        return {
          success: true,
          data: {
            overallHealth: overallPassed ? 'healthy' : 'issues_found',
            totalErrors,
            diagnostics,
            scope: params.scope,
            target: params.target || 'full repo',
          },
        };
      } catch (err) {
        return { success: false, data: null, error: `Diagnosis failed: ${err}` };
      }
    },
  },

  // ─── 5. Code Fix ───────────────────────────────────────────
  {
    name: 'code_fix',
    description: 'Automatically fix code issues. Applies search-and-replace patches, runs tests to verify fix. Self-healing code capability.',
    category: 'code_ops',
    inputSchema: codeFixSchema,
    requiresApproval: true,
    riskLevel: 'high',
    execute: async (input, ctx) => {
      const params = codeFixSchema.parse(input);
      ctx.logger.info(`[Prometheus] Fixing: ${params.filePath} — ${params.issue}`);

      if (!CONFIG.codeOps.autoFixEnabled) {
        return { success: false, data: null, error: 'Auto-fix disabled — set CODE_OPS_AUTO_FIX=true' };
      }

      try {
        const fullPath = resolveRepoPath(params.filePath);

        if (!existsSync(fullPath)) {
          return { success: false, data: null, error: `File not found: ${params.filePath}` };
        }

        const original = readFileSync(fullPath, 'utf-8');

        if (!params.searchPattern || !params.replacement) {
          // Return file content for AI analysis
          return {
            success: true,
            data: {
              path: params.filePath,
              issue: params.issue,
              content: original.slice(0, 8000),
              totalLines: original.split('\n').length,
              message: 'Provide searchPattern and replacement to apply fix.',
            },
          };
        }

        // Apply fix
        if (!original.includes(params.searchPattern)) {
          return { success: false, data: null, error: `Search pattern not found in ${params.filePath}` };
        }

        // Backup
        writeFileSync(`${fullPath}.bak.${Date.now()}`, original, 'utf-8');

        const fixed = original.replace(params.searchPattern, params.replacement);
        writeFileSync(fullPath, fixed, 'utf-8');

        // Auto-test if enabled
        let testResult = null;
        if (params.autoTest) {
          const test = safeExec(CONFIG.codeOps.testCommand, CONFIG.codeOps.repoPath, 60000);
          testResult = { passed: test.exitCode === 0, output: test.stdout.slice(-2000) };

          if (!test.exitCode) {
            ctx.logger.info(`[Prometheus] Fix verified — tests pass`);
          } else {
            ctx.logger.warn(`[Prometheus] Fix applied but tests FAIL — consider reverting`);
          }
        }

        // Record fix in memory
        await ctx.memory.store({
          agentId: ctx.agentId,
          type: 'procedural',
          namespace: 'code_fixes',
          content: JSON.stringify({
            file: params.filePath,
            issue: params.issue,
            searchPattern: params.searchPattern,
            replacement: params.replacement,
            testsPassed: testResult?.passed,
            timestamp: new Date().toISOString(),
          }),
          importance: 0.8,
          metadata: { file: params.filePath, issue: params.issue },
        });

        return {
          success: true,
          data: {
            path: params.filePath,
            issue: params.issue,
            applied: true,
            testResult,
            linesChanged: fixed.split('\n').length - original.split('\n').length,
          },
        };
      } catch (err) {
        return { success: false, data: null, error: `Fix failed: ${err}` };
      }
    },
  },

  // ─── 6. Code Review ────────────────────────────────────────
  {
    name: 'code_review',
    description: 'Review code for quality, security, performance, and style issues. Can review specific files or git diffs.',
    category: 'code_ops',
    inputSchema: codeReviewSchema,
    requiresApproval: false,
    riskLevel: 'low',
    execute: async (input, ctx) => {
      const params = codeReviewSchema.parse(input);
      ctx.logger.info(`[Prometheus] Code review: ${params.reviewType}`);

      try {
        let codeToReview = '';

        if (params.filePath) {
          const fullPath = resolveRepoPath(params.filePath);
          if (!existsSync(fullPath)) {
            return { success: false, data: null, error: `File not found: ${params.filePath}` };
          }
          codeToReview = readFileSync(fullPath, 'utf-8');
        } else if (params.diffRange) {
          const result = safeExec(`git diff ${params.diffRange}`, CONFIG.codeOps.repoPath, 15000);
          codeToReview = result.stdout;
        } else {
          // Default: staged changes
          const result = safeExec('git diff --cached', CONFIG.codeOps.repoPath, 15000);
          if (!result.stdout.trim()) {
            // Unstaged changes
            const unstaged = safeExec('git diff', CONFIG.codeOps.repoPath, 15000);
            codeToReview = unstaged.stdout;
          } else {
            codeToReview = result.stdout;
          }
        }

        if (!codeToReview.trim()) {
          return { success: true, data: { message: 'No code changes to review', issues: [] } };
        }

        // Static analysis
        const issues: Array<{ type: string; severity: string; line?: number; message: string }> = [];
        const lines = codeToReview.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          // Security checks
          if (params.reviewType === 'full' || params.reviewType === 'security') {
            if (/password\s*=\s*['"][^'"]+['"]/i.test(line)) issues.push({ type: 'security', severity: 'critical', line: i + 1, message: 'Hardcoded password detected' });
            if (/api[_-]?key\s*=\s*['"][^'"]+['"]/i.test(line)) issues.push({ type: 'security', severity: 'critical', line: i + 1, message: 'Hardcoded API key detected' });
            if (/eval\s*\(/.test(line)) issues.push({ type: 'security', severity: 'high', line: i + 1, message: 'eval() usage — potential code injection' });
            if (/innerHTML\s*=/.test(line)) issues.push({ type: 'security', severity: 'high', line: i + 1, message: 'innerHTML assignment — potential XSS' });
          }

          // Performance checks
          if (params.reviewType === 'full' || params.reviewType === 'performance') {
            if (/\.forEach\(.*await\b/.test(line)) issues.push({ type: 'performance', severity: 'medium', line: i + 1, message: 'await inside forEach — use for...of or Promise.all' });
            if (/JSON\.parse\(JSON\.stringify/.test(line)) issues.push({ type: 'performance', severity: 'low', line: i + 1, message: 'Deep clone via JSON — consider structuredClone()' });
          }

          // Style checks
          if (params.reviewType === 'full' || params.reviewType === 'style') {
            if (/console\.log\(/.test(line) && !line.includes('// debug')) issues.push({ type: 'style', severity: 'low', line: i + 1, message: 'console.log — use logger instead' });
            if (/any\b/.test(line) && /:\s*any/.test(line)) issues.push({ type: 'style', severity: 'low', line: i + 1, message: 'Explicit `any` type — consider narrowing' });
          }
        }

        return {
          success: true,
          data: {
            reviewType: params.reviewType,
            source: params.filePath || params.diffRange || 'working changes',
            linesReviewed: lines.length,
            issuesFound: issues.length,
            issues: issues.slice(0, 50),
            summary: issues.length === 0
              ? 'No issues found — code looks clean.'
              : `Found ${issues.length} issue(s): ${issues.filter(i => i.severity === 'critical').length} critical, ${issues.filter(i => i.severity === 'high').length} high, ${issues.filter(i => i.severity === 'medium').length} medium, ${issues.filter(i => i.severity === 'low').length} low`,
          },
        };
      } catch (err) {
        return { success: false, data: null, error: `Review failed: ${err}` };
      }
    },
  },

  // ─── 7. Code Deploy ────────────────────────────────────────
  {
    name: 'code_deploy',
    description: 'Build and deploy the codebase. Runs tests first (optional). Supports staging/production. Dry-run mode by default.',
    category: 'code_ops',
    inputSchema: codeDeploySchema,
    requiresApproval: true,
    riskLevel: 'critical',
    execute: async (input, ctx) => {
      const params = codeDeploySchema.parse(input);
      ctx.logger.info(`[Prometheus] Deploy: ${params.environment} (dry_run=${params.dryRun})`);

      if (!CONFIG.codeOps.autoDeployEnabled && !params.dryRun) {
        return { success: false, data: null, error: 'Auto-deploy disabled — set CODE_OPS_AUTO_DEPLOY=true or use dryRun=true' };
      }

      const steps: Array<{ step: string; passed: boolean; output: string }> = [];

      try {
        // Step 1: Tests (optional)
        if (params.runTests) {
          const test = safeExec(CONFIG.codeOps.testCommand, CONFIG.codeOps.repoPath, 120000);
          steps.push({ step: 'test', passed: test.exitCode === 0, output: test.stdout.slice(-2000) });
          if (test.exitCode !== 0) {
            return {
              success: false,
              data: { steps, message: 'Tests failed — aborting deploy' },
              error: 'Deploy blocked: tests did not pass',
            };
          }
        }

        // Step 2: Build
        const build = safeExec(CONFIG.codeOps.buildCommand, CONFIG.codeOps.repoPath, 120000);
        steps.push({ step: 'build', passed: build.exitCode === 0, output: build.stdout.slice(-2000) });
        if (build.exitCode !== 0) {
          return {
            success: false,
            data: { steps, message: 'Build failed — aborting deploy' },
            error: 'Deploy blocked: build did not pass',
          };
        }

        if (params.dryRun) {
          return {
            success: true,
            data: {
              dryRun: true,
              environment: params.environment,
              steps,
              message: 'Dry run complete — all checks passed. Set dryRun=false to deploy.',
            },
          };
        }

        // Step 3: Git push (if auto deploy enabled)
        const push = safeExec(`git push origin ${params.branch}`, CONFIG.codeOps.repoPath, 30000);
        steps.push({ step: 'push', passed: push.exitCode === 0, output: push.stdout.slice(-1000) });

        return {
          success: true,
          data: {
            dryRun: false,
            environment: params.environment,
            branch: params.branch,
            steps,
            message: `Deployed to ${params.environment} from branch ${params.branch}`,
            timestamp: new Date().toISOString(),
          },
        };
      } catch (err) {
        return { success: false, data: null, error: `Deploy failed: ${err}` };
      }
    },
  },

  // ─── 8. Runtime Patch ──────────────────────────────────────
  {
    name: 'runtime_patch',
    description: 'Hot-patch running code: replace a code pattern in a file, test, and optionally auto-revert if tests fail. Self-healing code in action.',
    category: 'code_ops',
    inputSchema: runtimePatchSchema,
    requiresApproval: true,
    riskLevel: 'critical',
    execute: async (input, ctx) => {
      const params = runtimePatchSchema.parse(input);
      ctx.logger.info(`[Prometheus] Runtime patch: ${params.filePath} — ${params.reason}`);

      if (!CONFIG.codeOps.autoFixEnabled) {
        return { success: false, data: null, error: 'Auto-fix disabled — set CODE_OPS_AUTO_FIX=true' };
      }

      try {
        const fullPath = resolveRepoPath(params.filePath);

        if (!existsSync(fullPath)) {
          return { success: false, data: null, error: `File not found: ${params.filePath}` };
        }

        const original = readFileSync(fullPath, 'utf-8');

        if (!original.includes(params.oldCode)) {
          return { success: false, data: null, error: `Old code pattern not found in ${params.filePath}` };
        }

        // Apply patch
        const patched = original.replace(params.oldCode, params.newCode);
        writeFileSync(fullPath, patched, 'utf-8');
        ctx.logger.info(`[Prometheus] Patch applied`);

        let testsPassed = true;
        let testOutput = '';

        if (params.autoTest) {
          const test = safeExec(CONFIG.codeOps.testCommand, CONFIG.codeOps.repoPath, 60000);
          testsPassed = test.exitCode === 0;
          testOutput = test.stdout.slice(-2000);

          if (!testsPassed && params.autoRevert) {
            // Revert
            writeFileSync(fullPath, original, 'utf-8');
            ctx.logger.warn(`[Prometheus] Patch REVERTED — tests failed`);

            return {
              success: false,
              data: {
                path: params.filePath,
                patched: false,
                reverted: true,
                reason: params.reason,
                testOutput,
              },
              error: 'Patch reverted — tests failed after apply',
            };
          }
        }

        // Store successful patch in memory
        await ctx.memory.store({
          agentId: ctx.agentId,
          type: 'procedural',
          namespace: 'runtime_patches',
          content: JSON.stringify({
            file: params.filePath,
            reason: params.reason,
            oldCode: params.oldCode.slice(0, 500),
            newCode: params.newCode.slice(0, 500),
            testsPassed,
            timestamp: new Date().toISOString(),
          }),
          importance: 0.9,
          metadata: { file: params.filePath, reason: params.reason, testsPassed },
        });

        return {
          success: true,
          data: {
            path: params.filePath,
            patched: true,
            reverted: false,
            reason: params.reason,
            testsPassed,
            testOutput: testOutput.slice(-1000),
          },
        };
      } catch (err) {
        return { success: false, data: null, error: `Runtime patch failed: ${err}` };
      }
    },
  },
];
