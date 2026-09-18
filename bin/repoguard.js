#!/usr/bin/env node

/**
 * RepoGuard CLI v1.2 — The Architecture Guardian for AI-Assisted Codebases
 * Zero-dependency standalone CLI tool
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { analyzeDiff, scanDirectory, calculateHealthScore, formatGitHubComment, ARCHITECTURAL_RULES } = require('./analyzer');

// ANSI Colors for Terminal Output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m"
};

function logBanner() {
  console.log(`
${colors.cyan}${colors.bright}  ____                     ____                     _ 
 |  _ \\ ___ _ __   ___    / ___|_   _  __ _ _ __ __| |
 | |_) / _ \\ '_ \\ / _ \\  | |  _| | | |/ _\` | '__/ _\` |
 |  _ <  __/ |_) | (_) | | |_| | |_| | (_| | | | (_| |
 |_| \\_\\___| .__/ \\___/   \\____|\\__,_|\\__,_|_|  \\__,_|
           |_|                                        ${colors.reset}
  ${colors.dim}The Architecture Guardian for AI-assisted code • v1.2${colors.reset}
`);
}

function detectProjectStack(targetDir) {
  const stack = {
    framework: 'Node.js / Universal',
    language: 'JavaScript',
    orm: 'None detected',
    styling: 'Standard CSS',
    testing: 'None detected',
    srcDir: fs.existsSync(path.join(targetDir, 'src')) ? 'src' : '.'
  };

  const packageJsonPath = path.join(targetDir, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

      if (allDeps['typescript'] || fs.existsSync(path.join(targetDir, 'tsconfig.json'))) {
        stack.language = 'TypeScript';
      }

      if (allDeps['next']) stack.framework = 'Next.js (App Router)';
      else if (allDeps['react']) stack.framework = 'React';
      else if (allDeps['@nestjs/core']) stack.framework = 'NestJS';
      else if (allDeps['express']) stack.framework = 'Express';
      else if (allDeps['fastify']) stack.framework = 'Fastify';

      if (allDeps['@prisma/client'] || allDeps['prisma']) stack.orm = 'Prisma ORM';
      else if (allDeps['drizzle-orm']) stack.orm = 'Drizzle ORM';
      else if (allDeps['typeorm']) stack.orm = 'TypeORM';
      else if (allDeps['mongoose']) stack.orm = 'Mongoose';

      if (allDeps['tailwindcss']) stack.styling = 'Tailwind CSS';
      if (allDeps['vitest']) stack.testing = 'Vitest';
      else if (allDeps['jest']) stack.testing = 'Jest';
    } catch (e) {}
  }

  return stack;
}

function generateCursorRules(stack) {
  return `# RepoGuard Generated .cursorrules
# Architecture Guardrails for AI Code Generation
# Stack: ${stack.framework} | Language: ${stack.language} | ORM: ${stack.orm}

You are an expert principal software engineer working on this repository.
Follow these strictly enforced architectural principles:

## 1. Architectural Boundaries & Layering (RULE-01)
- NEVER import database clients or ORM models (${stack.orm}) directly inside UI components or API controllers.
- Always encapsulate data mutations and queries inside dedicated service modules under \`${stack.srcDir}/services\` or \`${stack.srcDir}/lib\`.
- Keep components focused strictly on presentation and state handling.

## 2. Code Reusability & DRY Policy (RULE-08)
- Before creating a new helper function, check existing utilities under \`${stack.srcDir}/utils\` or \`${stack.srcDir}/helpers\`.
- Do not duplicate standard validators (e.g. email, date formatting, slugify). Reuse the centralized ones.

## 3. Strict Type Safety (RULE-03)
${stack.language === 'TypeScript' ? '- NEVER use "any" or "as any". Define explicit interfaces or types under `types/`.\n- Use Zod schemas for all incoming API payloads.' : '- Maintain clear docstrings and typing annotations on all exported functions.'}

## 4. Security & Sensitive Data (RULE-02, RULE-06)
- NEVER hardcode API keys, secrets, or database URLs in code. Always access via validated environment variables.
- NEVER concatenate raw strings in database queries. Always use parameterized queries.

## 5. SSR & Hydration (RULE-05)
- NEVER access \`window\` or \`localStorage\` directly in Server Components or top-level file scopes.
`;
}

function generateClaudeMd(stack) {
  return `# CLAUDE.md — Architecture & Context Guide
> Enforced by RepoGuard. Read this before proposing any changes.

## Project Overview
- **Framework:** ${stack.framework}
- **Language:** ${stack.language}
- **Data Layer:** ${stack.orm}
- **Styling:** ${stack.styling}

## Core Rules for AI Agents:
1. **No Layer Bypassing:** UI -> Service Layer -> Data Repository. Never skip directly to database operations.
2. **Reuse Existing Utilities:** Do not invent new formatters or date helpers if already available in the codebase.
3. **Zero Secrets:** Never write API keys or tokens in code; use environment variables.
4. **Deterministic Error Handling:** Always wrap async external calls in typed try/catch blocks.
5. **Git Commits:** Follow Conventional Commits format (\`feat:\`, \`fix:\`, \`refactor:\`, \`docs:\`).
`;
}

function generateWindsurfRules(stack) {
  return `# .windsurfrules — Architecture Guardrails for Windsurf Cascade
framework: ${stack.framework}
language: ${stack.language}
orm: ${stack.orm}

rules:
  - id: layer-isolation
    rule: "Controllers and React components must never import database/ORM clients directly."
  - id: type-safety
    rule: "Do not use 'any' type. Always define explicit interfaces."
  - id: dry-helpers
    rule: "Check existing helpers in utils/ before creating new functions."
`;
}

function generateCopilotInstructions(stack) {
  return `# GitHub Copilot Custom Instructions
Follow the architectural layering of this repository:
- Keep controllers thin and route logic to \`/services/\`.
- Never execute database queries in UI components.
- Avoid using 'any' types in TypeScript.
`;
}

function generateGitHubAction() {
  return `name: RepoGuard Architecture Audit

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  audit:
    name: Guard Architecture
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run RepoGuard Architecture Review
        uses: repoguard-app/repoguard-action@v1
        with:
          github_token: \${{ secrets.GITHUB_TOKEN }}
          strict_mode: true
`;
}

// Commands
const args = process.argv.slice(2);
const command = args[0] || 'help';

logBanner();

const targetDir = process.cwd();

if (command === 'init') {
  console.log(`${colors.cyan}🔍 Scanning repository architecture...${colors.reset}`);
  
  const stack = detectProjectStack(targetDir);
  console.log(`  ${colors.green}✓${colors.reset} Framework: ${colors.bright}${stack.framework}${colors.reset}`);
  console.log(`  ${colors.green}✓${colors.reset} Language:  ${colors.bright}${stack.language}${colors.reset}`);
  console.log(`  ${colors.green}✓${colors.reset} ORM/Data:  ${colors.bright}${stack.orm}${colors.reset}`);
  console.log(`  ${colors.green}✓${colors.reset} Directory: ${colors.bright}${stack.srcDir}/${colors.reset}\n`);

  fs.writeFileSync(path.join(targetDir, '.cursorrules'), generateCursorRules(stack), 'utf8');
  console.log(`${colors.green}✨ Generated:${colors.reset} .cursorrules (For Cursor AI)`);

  fs.writeFileSync(path.join(targetDir, 'CLAUDE.md'), generateClaudeMd(stack), 'utf8');
  console.log(`${colors.green}✨ Generated:${colors.reset} CLAUDE.md (For Claude Code CLI)`);

  fs.writeFileSync(path.join(targetDir, '.windsurfrules'), generateWindsurfRules(stack), 'utf8');
  console.log(`${colors.green}✨ Generated:${colors.reset} .windsurfrules (For Windsurf Cascade)`);

  const githubDir = path.join(targetDir, '.github');
  if (!fs.existsSync(githubDir)) fs.mkdirSync(githubDir, { recursive: true });
  fs.writeFileSync(path.join(githubDir, 'copilot-instructions.md'), generateCopilotInstructions(stack), 'utf8');
  console.log(`${colors.green}✨ Generated:${colors.reset} .github/copilot-instructions.md (For GitHub Copilot)`);

  const workflowsDir = path.join(githubDir, 'workflows');
  if (!fs.existsSync(workflowsDir)) fs.mkdirSync(workflowsDir, { recursive: true });
  fs.writeFileSync(path.join(workflowsDir, 'repoguard.yml'), generateGitHubAction(), 'utf8');
  console.log(`${colors.green}✨ Generated:${colors.reset} .github/workflows/repoguard.yml (For CI PR checks)\n`);

  console.log(`${colors.bright}${colors.green}🎉 Setup Complete! Your codebase is now guarded across all major AI tools.${colors.reset}\n`);

} else if (command === 'audit') {
  console.log(`${colors.cyan}🔍 Scanning entire codebase for architectural violations...${colors.reset}\n`);
  
  const files = scanDirectory(targetDir);
  let allViolations = [];

  for (const file of files) {
    const relativePath = path.relative(targetDir, file);
    try {
      const content = fs.readFileSync(file, 'utf8');
      const fileViolations = analyzeDiff(content, relativePath);
      allViolations = allViolations.concat(fileViolations);
    } catch (e) {}
  }

  const { score, grade } = calculateHealthScore(files.length, allViolations);

  console.log(`====================================================`);
  console.log(`  ${colors.bright}ARCHITECTURAL HEALTH DASHBOARD${colors.reset}`);
  console.log(`====================================================`);
  console.log(`  Files Audited:    ${colors.bright}${files.length}${colors.reset}`);
  console.log(`  Total Violations: ${allViolations.length === 0 ? colors.green + '0' : colors.yellow + allViolations.length}${colors.reset}`);
  
  const scoreColor = score >= 85 ? colors.green : score >= 70 ? colors.yellow : colors.red;
  console.log(`  Health Score:     ${scoreColor}${colors.bright}${score}/100 [Grade: ${grade}]${colors.reset}`);
  console.log(`====================================================\n`);

  if (allViolations.length > 0) {
    console.log(`${colors.yellow}Detected Architectural Drift:${colors.reset}\n`);
    for (const v of allViolations.slice(0, 10)) {
      const icon = v.severity === 'critical' ? '🚨' : v.severity === 'error' ? '❌' : '⚠️';
      console.log(`  ${icon} ${colors.bright}${v.ruleId}${colors.reset} in ${colors.cyan}${v.filename}:${v.lineNumber}${colors.reset}`);
      console.log(`     ${v.message}`);
      console.log(`     ${colors.dim}Code: "${v.codeSnippet.substring(0, 70)}"${colors.reset}\n`);
    }

    if (allViolations.length > 10) {
      console.log(`  ${colors.dim}... and ${allViolations.length - 10} more violation(s).${colors.reset}\n`);
    }
  } else {
    console.log(`${colors.green}✨ Flawless architecture! Zero drift detected across all files.${colors.reset}\n`);
  }

} else if (command === 'diff') {
  console.log(`${colors.cyan}🔬 Auditing uncommitted git changes against architectural guardrails...${colors.reset}\n`);

  try {
    const gitDiff = execSync('git diff HEAD', { encoding: 'utf8' });
    if (!gitDiff.trim()) {
      console.log(`${colors.green}✓ Working tree is clean. No uncommitted diff to audit.${colors.reset}\n`);
      process.exit(0);
    }

    const fileDiffs = gitDiff.split('diff --git ');
    let violations = [];

    for (const fileDiff of fileDiffs) {
      if (!fileDiff.trim()) continue;
      const match = fileDiff.match(/b\/(.+?)\n/);
      const filename = match ? match[1] : 'unknown';
      violations = violations.concat(analyzeDiff(fileDiff, filename));
    }

    if (violations.length === 0) {
      console.log(`${colors.green}✨ Git diff is architecturally clean! Safe to commit.${colors.reset}\n`);
    } else {
      console.log(`${colors.yellow}⚠️  Found ${violations.length} architectural issue(s) in your uncommitted changes:${colors.reset}\n`);
      for (const v of violations) {
        console.log(`  - [${v.ruleId}] ${v.filename}:${v.lineNumber} -> ${v.message}`);
      }
      console.log(`\n${colors.dim}Fix these issues before committing.${colors.reset}\n`);
      process.exit(1);
    }
  } catch (e) {
    console.log(`${colors.yellow}⚠️ Not a git repository or git command failed.${colors.reset}`);
  }

} else if (command === 'hook' && args[1] === 'install') {
  const hooksDir = path.join(targetDir, '.git', 'hooks');
  if (!fs.existsSync(hooksDir)) {
    console.log(`${colors.red}Error: .git/hooks directory not found.${colors.reset}`);
    process.exit(1);
  }

  const hookScript = `#!/bin/sh\n# RepoGuard Pre-Commit Hook\nnpx repoguard diff\n`;
  const hookPath = path.join(hooksDir, 'pre-commit');
  fs.writeFileSync(hookPath, hookScript, { mode: 0o755 });
  console.log(`${colors.green}✅ Pre-commit hook installed in .git/hooks/pre-commit!${colors.reset}`);
  console.log(`${colors.dim}RepoGuard will automatically block any AI drift before commit.${colors.reset}\n`);

} else if (command === 'review') {
  console.log(`${colors.cyan}🔬 Simulating PR review on sample AI-generated diff...${colors.reset}\n`);
  const sampleDiff = `
+ export async function getUserOrders(req: any, res: any) {
+   const apiKey = "sk_live_9823478912389124";
+   const orders = await prisma.order.findMany({ where: { userId: req.params.id } });
+   console.log("Found orders", orders);
+   return res.json(orders);
+ }
`;
  const violations = analyzeDiff(sampleDiff, 'src/controllers/order.controller.ts');
  console.log(formatGitHubComment(violations));
  console.log(`\n${colors.bright}${colors.yellow}Found ${violations.length} architectural issues!${colors.reset}\n`);

} else if (command === 'rules') {
  console.log(`${colors.bright}Active Architectural Guardrails (${ARCHITECTURAL_RULES.length} Rules):${colors.reset}\n`);
  for (const r of ARCHITECTURAL_RULES) {
    const sev = r.severity === 'critical' ? colors.red : r.severity === 'error' ? colors.yellow : colors.cyan;
    console.log(`  ${sev}${r.id}${colors.reset} [${r.category}] - ${colors.bright}${r.name}${colors.reset}`);
    console.log(`    ${colors.dim}${r.message}${colors.reset}\n`);
  }

} else {
  console.log(`Usage:
  ${colors.bright}npx repoguard init${colors.reset}          Generate .cursorrules, CLAUDE.md & Windsurf rules
  ${colors.bright}npx repoguard audit${colors.reset}         Full codebase scan with Architectural Health Score (A+ to F)
  ${colors.bright}npx repoguard diff${colors.reset}          Audit uncommitted git changes in real-time
  ${colors.bright}npx repoguard hook install${colors.reset}  Install pre-commit hook to block AI drift locally
  ${colors.bright}npx repoguard review${colors.reset}        Simulate PR review audit for GitHub CI
  ${colors.bright}npx repoguard rules${colors.reset}         List all 8 active architectural rules
`);
}
