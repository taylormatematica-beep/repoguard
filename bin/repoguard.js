#!/usr/bin/env node

/**
 * RepoGuard CLI v1.7.0 — The Architecture Guardian for AI-Assisted Codebases
 * Zero-dependency standalone CLI tool
 * Multi-Language Support: TypeScript/JavaScript, Python, Golang, Rust, Secrets 2.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const {
  analyzeDiff,
  scanDirectory,
  calculateHealthScore,
  formatGitHubComment,
  formatSARIF,
  formatJSON,
  ARCHITECTURAL_RULES
} = require('./analyzer');
const { runGitHubActionPRReview, generatePRReviewMarkdown } = require('./commenter');

// ANSI Colors for Terminal Output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m"
};

function logBanner() {
  console.log(`
${colors.cyan}${colors.bright}  ____                     ____                     _ 
 |  _ \\ ___ _ __   ___    / ___|_   _  __ _ _ __ __| |
 | |_) / _ \\ '_ \\ / _ \\  | |  _| | | |/ _\` | '__/ _\` |
 |  _ <  __/ |_) | (_) | | |_| | |_| | (_| | | | (_| |
 |_| \\_\\___| .__/ \\___/   \\____|\\__,_|\\__,_|_|  \\__,_|
           |_|                                        ${colors.reset}
  ${colors.dim}The Architecture Guardian for AI-assisted code • v1.7.0${colors.reset}
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

  // 1. Rust detection (Cargo.toml)
  const cargoTomlPath = path.join(targetDir, 'Cargo.toml');
  if (fs.existsSync(cargoTomlPath)) {
    stack.language = 'Rust';
    stack.framework = 'Rust Standard / Tokio';
    try {
      const cargo = fs.readFileSync(cargoTomlPath, 'utf8');
      if (/axum/i.test(cargo)) stack.framework = 'Axum (Rust)';
      else if (/actix-web/i.test(cargo)) stack.framework = 'Actix-web (Rust)';
      else if (/rocket/i.test(cargo)) stack.framework = 'Rocket (Rust)';

      if (/sqlx/i.test(cargo)) stack.orm = 'SQLx';
      else if (/diesel/i.test(cargo)) stack.orm = 'Diesel';
      else if (/sea-orm/i.test(cargo)) stack.orm = 'SeaORM';
    } catch (_) {}
    return stack;
  }

  // 2. Golang detection (go.mod)
  const goModPath = path.join(targetDir, 'go.mod');
  if (fs.existsSync(goModPath)) {
    stack.language = 'Golang';
    stack.framework = 'Go Standard Library';
    try {
      const goMod = fs.readFileSync(goModPath, 'utf8');
      if (goMod.includes('github.com/gin-gonic/gin')) stack.framework = 'Gin (Go)';
      else if (goMod.includes('github.com/gofiber/fiber')) stack.framework = 'Fiber (Go)';
      else if (goMod.includes('github.com/labstack/echo')) stack.framework = 'Echo (Go)';

      if (goMod.includes('gorm.io/gorm')) stack.orm = 'GORM';
      else if (goMod.includes('github.com/jmoiron/sqlx')) stack.orm = 'sqlx';
      else if (goMod.includes('database/sql')) stack.orm = 'database/sql';
    } catch (_) {}
    return stack;
  }

  // 3. Python detection
  const pyprojectPath = path.join(targetDir, 'pyproject.toml');
  const reqsPath = path.join(targetDir, 'requirements.txt');
  const pipfilePath = path.join(targetDir, 'Pipfile');
  const managePyPath = path.join(targetDir, 'manage.py');

  if (fs.existsSync(pyprojectPath) || fs.existsSync(reqsPath) || fs.existsSync(pipfilePath) || fs.existsSync(managePyPath)) {
    stack.language = 'Python';
    stack.framework = 'Python Web';
    let pyDeps = '';
    if (fs.existsSync(pyprojectPath)) pyDeps += fs.readFileSync(pyprojectPath, 'utf8');
    if (fs.existsSync(reqsPath)) pyDeps += fs.readFileSync(reqsPath, 'utf8');
    if (fs.existsSync(pipfilePath)) pyDeps += fs.readFileSync(pipfilePath, 'utf8');

    if (/fastapi/i.test(pyDeps)) stack.framework = 'FastAPI';
    else if (/django/i.test(pyDeps) || fs.existsSync(managePyPath)) stack.framework = 'Django';
    else if (/flask/i.test(pyDeps)) stack.framework = 'Flask';

    if (/sqlmodel/i.test(pyDeps)) stack.orm = 'SQLModel';
    else if (/sqlalchemy/i.test(pyDeps)) stack.orm = 'SQLAlchemy';
    else if (/tortoise-orm/i.test(pyDeps)) stack.orm = 'Tortoise ORM';
    else if (/peewee/i.test(pyDeps)) stack.orm = 'Peewee';

    return stack;
  }

  // 4. Node.js / TypeScript detection
  const packageJsonPath = path.join(targetDir, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

      if (allDeps['typescript'] || fs.existsSync(path.join(targetDir, 'tsconfig.json'))) {
        stack.language = 'TypeScript';
      }

      if (allDeps['next']) stack.framework = 'Next.js (App Router)';
      else if (allDeps['@nestjs/core']) stack.framework = 'NestJS';
      else if (allDeps['express']) stack.framework = 'Express';
      else if (allDeps['fastify']) stack.framework = 'Fastify';
      else if (allDeps['react']) stack.framework = 'React';

      if (allDeps['@prisma/client'] || allDeps['prisma']) stack.orm = 'Prisma ORM';
      else if (allDeps['drizzle-orm']) stack.orm = 'Drizzle ORM';
      else if (allDeps['typeorm']) stack.orm = 'TypeORM';
      else if (allDeps['mongoose']) stack.orm = 'Mongoose';

      if (allDeps['tailwindcss']) stack.styling = 'Tailwind CSS';
      if (allDeps['vitest']) stack.testing = 'Vitest';
      else if (allDeps['jest']) stack.testing = 'Jest';
    } catch (_) {}
  }

  return stack;
}

function generateCursorRules(stack) {
  if (stack.language === 'Rust') {
    return `# RepoGuard Generated .cursorrules
# Architecture Guardrails for AI Code Generation
# Stack: ${stack.framework} | Language: Rust | ORM: ${stack.orm}

You are an expert principal Rust systems and backend engineer working on this repository.
Follow these strictly enforced architectural guardrails:

## 1. Clean Architecture & Layer Separation (RULE-RS-02)
- NEVER execute direct database queries (e.g. \`sqlx::query!\`, \`diesel::insert_into\`) or pool transactions inside HTTP route handlers (Axum/Actix-web/Rocket).
- Decouple all database operations into dedicated repository or service modules under \`src/services/\` or \`src/repository/\`.
- Route handlers must only extract parameters, invoke services, and return HTTP status codes / JSON.

## 2. Panic-Safe Error Handling (RULE-RS-01)
- NEVER use \`.unwrap()\` or \`.expect()\` in production application logic. AI models frequently silence errors with \`.unwrap()\`, causing runtime thread panics.
- Propagate errors idiomatically using the \`?\` operator with \`Result<T, AppError>\`.
- Provide sensible defaults where appropriate using \`.unwrap_or()\` or \`.unwrap_or_default()\`.
- Note: \`.unwrap()\` is permitted ONLY inside unit tests (\`#[cfg(test)]\`).

## 3. Concurrency & Memory Safety
- Guard shared state using \`Arc<RwLock<T>>\` or channel-based actors (\`tokio::sync::mpsc\`).
- Avoid unnecessary cloning of large structures; pass immutable references \`&T\` where lifetime permits.

## 4. Security & Secrets (RULE-02, RULE-SEC-01)
- NEVER hardcode API keys, database connection strings, or cryptographic tokens in source files.
- Inject secrets via \`std::env::var()\` or validated config structs.
`;
  }

  if (stack.language === 'Golang') {
    return `# RepoGuard Generated .cursorrules
# Architecture Guardrails for AI Code Generation
# Stack: ${stack.framework} | Language: Golang | ORM: ${stack.orm}

You are an expert principal Go software engineer working on this repository.
Follow these strictly enforced architectural guardrails:

## 1. Clean Architecture & Layer Separation (RULE-GO-01)
- NEVER execute direct database queries or GORM mutations inside HTTP handlers/controllers.
- Delegate all database operations to dedicated repository interfaces (e.g., \`repository.UserRepository\`).
- Handlers should only bind requests, invoke service/use-cases, and return HTTP status codes.

## 2. Explicit Error Handling (RULE-GO-02)
- NEVER discard errors with blank identifiers (\`_ = err\`).
- Always handle errors explicitly using \`if err != nil { return err }\` or appropriate error wrapping (\`fmt.Errorf("...: %w", err)\`).

## 3. Context Propagation
- Always accept and propagate \`ctx context.Context\` as the first parameter in all service and database calls.

## 4. Concurrency & Goroutine Safety
- Always guard shared mutable state with \`sync.Mutex\` or channel pipelines.
- Ensure goroutines terminate cleanly by listening to \`ctx.Done()\`.

## 5. Security & Secrets (RULE-02, RULE-SEC-01)
- Never hardcode tokens or database credentials. Inject via \`os.Getenv()\` or structured config.
`;
  }

  if (stack.language === 'Python') {
    return `# RepoGuard Generated .cursorrules
# Architecture Guardrails for AI Code Generation
# Stack: ${stack.framework} | Language: Python | ORM: ${stack.orm}

You are an expert principal Python engineer working on this repository.
Follow these strictly enforced architectural guardrails:

## 1. Router & Layer Separation (RULE-PY-01)
- NEVER execute direct database queries (\`db.query()\`) or transactions (\`db.commit()\`) inside route handlers.
- Encapsulate all database queries and mutations inside dedicated service or repository modules.
- Route functions must only handle HTTP parameters, invoke services, and return responses.

## 2. Strict Type Annotations & Schemas
- Define explicit Pydantic v2 schemas for all request payloads and response bodies.
- Strictly type-annotate all function signatures (arguments and return types).

## 3. Async/Await Hygiene
- Do not mix blocking synchronous I/O inside asynchronous route handlers (\`async def\`). Use async drivers or run in threadpools.

## 4. Security & Environment (RULE-02, RULE-06, RULE-SEC-01)
- Never hardcode secrets. Inject via \`pydantic-settings\` or \`os.getenv()\`.
- Always use parameterized ORM queries to prevent SQL injection.
`;
  }

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

## 4. Security & Sensitive Data (RULE-02, RULE-06, RULE-09, RULE-SEC-01)
- NEVER hardcode API keys, secrets, or database URLs in code. Always access via validated environment variables.
- NEVER prefix private secrets with NEXT_PUBLIC_ or VITE_ (bundles into client browser JS).
- NEVER concatenate raw strings in database queries. Always use parameterized queries.

## 5. SSR & Hydration (RULE-05)
- NEVER access \`window\` or \`localStorage\` directly in Server Components or top-level file scopes.
`;
}

function generateClaudeMd(stack) {
  if (stack.language === 'Rust') {
    return `# CLAUDE.md — Rust Architecture & Context Guide
> Enforced by RepoGuard v1.7.0. Read this before proposing any changes.

## Project Overview
- Framework: ${stack.framework}
- Language: Rust
- Data layer: ${stack.orm}

## Rust Guardrails
1. RULE-RS-02 — Keep Axum/Actix-web/Rocket route handlers thin. Move SQLx or Diesel queries to service/repository modules.
2. RULE-RS-01 — Avoid .unwrap() and .expect() in production logic. Propagate Result errors with ? or handle them with match.
3. RULE-SEC-01 — Never commit live AI/cloud tokens or database URLs containing credentials; use environment variables or a secret manager.
4. Preserve existing module boundaries, reuse shared utilities, and add tests for error paths.
`;
  }

  return `# CLAUDE.md — Architecture & Context Guide
> Enforced by RepoGuard v1.7.0. Read this before proposing any changes.

## Project Overview
- **Framework:** ${stack.framework}
- **Language:** ${stack.language}
- **Data Layer:** ${stack.orm}
- **Source Root:** ${stack.srcDir}/

## Core Rules for AI Agents:
1. **Strict Layer Separation:** Handlers/UI -> Service Layer -> Repository. Never bypass directly to the database.
2. **Explicit Error Handling:** Never discard errors (Go \`_ = err\`) or cause fatal panics (Rust \`.unwrap()\`).
3. **Reuse Existing Utilities:** Do not invent new formatters or date helpers if already available in the codebase.
4. **Zero Secrets in Code:** Never write API keys or tokens in code; use validated environment variables.
5. **Git Commits:** Follow Conventional Commits format (\`feat:\`, \`fix:\`, \`refactor:\`, \`docs:\`).
`;
}

function generateWindsurfRules(stack) {
  if (stack.language === 'Rust') {
    return `# .windsurfrules — Rust Architecture Guardrails for Windsurf Cascade
framework: ${stack.framework}
language: Rust
orm: ${stack.orm}

rules:
  - id: RULE-RS-02
    rule: "Never execute SQLx or Diesel queries directly inside Axum, Actix-web, or Rocket route handlers. Delegate persistence to service/repository modules."
  - id: RULE-RS-01
    rule: "Avoid .unwrap() and .expect() in production Rust. Use Result, the ? operator, or explicit match arms."
  - id: RULE-SEC-01
    rule: "Never hardcode live AI/cloud tokens or database URLs containing credentials."
`;
  }

  return `# .windsurfrules — Architecture Guardrails for Windsurf Cascade
framework: ${stack.framework}
language: ${stack.language}
orm: ${stack.orm}

rules:
  - id: layer-isolation
    rule: "HTTP Handlers and UI components must never execute direct database/ORM operations."
  - id: explicit-errors
    rule: "Never discard errors (Go) or panic with .unwrap() in production (Rust)."
  - id: dry-helpers
    rule: "Check existing helpers in utils/ before creating new functions."
  - id: zero-secrets
    rule: "Never commit API keys or private credentials into source code."
`;
}

function generateCopilotInstructions(stack) {
  return `# GitHub Copilot Custom Instructions
Follow the architectural layering of this repository:
- Keep controllers and route handlers thin; route business logic to service layers.
- Never execute database queries in UI components or route functions.
- Do not bypass type systems or error handling (avoid 'any', '_ = err', and production '.unwrap()').
`;
}

function generateGitHubAction() {
  return `name: RepoGuard Architecture Audit

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  pull-requests: write
  contents: read
  issues: write

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
        uses: taylormatematica-beep/repoguard@main
        with:
          github_token: \${{ secrets.GITHUB_TOKEN }}
          strict_mode: true
`;
}

// Parse arguments
const args = process.argv.slice(2);
const command = args[0] || 'help';

// MCP Mode Hook: If invoked with 'mcp' OR if piped via stdio (Glama mcp-proxy / Claude / Cursor / non-TTY)
if (command === 'mcp' || (!args[0] && !process.stdin.isTTY)) {
  const { startMCPServer } = require('./mcp');
  startMCPServer();
  return;
}

// GitHub Action Runner Check
if (process.env.GITHUB_ACTIONS === 'true' && (!args[0] || args[0] === 'ci' || args[0] === 'action')) {
  runGitHubActionPRReview().catch(err => {
    console.error('RepoGuard CI Error:', err.message);
    process.exit(1);
  });
  return;
}

const isJsonFormat = args.includes('--format=json');
const isSarifFormat = args.includes('--format=sarif');
const isStrict = args.includes('--strict');

if (!isJsonFormat && !isSarifFormat) {
  logBanner();
}

const targetDir = process.cwd();

if (command === 'init') {
  console.log(`${colors.cyan}🔍 Scanning repository architecture...${colors.reset}`);
  
  const stack = detectProjectStack(targetDir);
  console.log(`  ${colors.green}✓${colors.reset} Framework: ${colors.bright}${stack.framework}${colors.reset}`);
  console.log(`  ${colors.green}✓${colors.reset} Language:  ${colors.bright}${stack.language}${colors.reset}`);
  console.log(`  ${colors.green}✓${colors.reset} ORM/Data:  ${colors.bright}${stack.orm}${colors.reset}`);
  console.log(`  ${colors.green}✓${colors.reset} Directory: ${colors.bright}${stack.srcDir}/${colors.reset}\n`);

  // 1. .cursorrules
  fs.writeFileSync(path.join(targetDir, '.cursorrules'), generateCursorRules(stack), 'utf8');
  console.log(`${colors.green}✨ Generated:${colors.reset} .cursorrules (For Cursor AI)`);

  // 2. CLAUDE.md
  fs.writeFileSync(path.join(targetDir, 'CLAUDE.md'), generateClaudeMd(stack), 'utf8');
  console.log(`${colors.green}✨ Generated:${colors.reset} CLAUDE.md (For Claude Code CLI)`);

  // 3. .windsurfrules
  fs.writeFileSync(path.join(targetDir, '.windsurfrules'), generateWindsurfRules(stack), 'utf8');
  console.log(`${colors.green}✨ Generated:${colors.reset} .windsurfrules (For Windsurf Cascade)`);

  // 4. .github/copilot-instructions.md
  const githubDir = path.join(targetDir, '.github');
  if (!fs.existsSync(githubDir)) fs.mkdirSync(githubDir, { recursive: true });
  fs.writeFileSync(path.join(githubDir, 'copilot-instructions.md'), generateCopilotInstructions(stack), 'utf8');
  console.log(`${colors.green}✨ Generated:${colors.reset} .github/copilot-instructions.md (For GitHub Copilot)`);

  // 5. GitHub Action Workflow
  const workflowsDir = path.join(githubDir, 'workflows');
  if (!fs.existsSync(workflowsDir)) fs.mkdirSync(workflowsDir, { recursive: true });
  fs.writeFileSync(path.join(workflowsDir, 'repoguard.yml'), generateGitHubAction(), 'utf8');
  console.log(`${colors.green}✨ Generated:${colors.reset} .github/workflows/repoguard.yml (For CI PR checks)\n`);

  // 6. Viral Loop: Inject / Display Official RepoGuard Badge
  const badgeMd = `[![Architecture: Guarded by RepoGuard](https://img.shields.io/badge/Architecture-Guarded%20by%20RepoGuard-00f2fe?style=flat-square)](https://github.com/taylormatematica-beep/repoguard)`;
  const targetReadme = path.join(targetDir, 'README.md');
  if (fs.existsSync(targetReadme)) {
    try {
      let rText = fs.readFileSync(targetReadme, 'utf8');
      if (!rText.includes('Guarded by RepoGuard')) {
        if (rText.startsWith('# ')) {
          const firstLineEnd = rText.indexOf('\n');
          rText = rText.slice(0, firstLineEnd + 1) + '\n' + badgeMd + '\n' + rText.slice(firstLineEnd + 1);
        } else {
          rText = badgeMd + '\n\n' + rText;
        }
        fs.writeFileSync(targetReadme, rText, 'utf8');
        console.log(`${colors.green}🛡️ Injected:${colors.reset} Architecture badge into your README.md!`);
      }
    } catch (_) {}
  }

  console.log(`${colors.bright}${colors.green}🎉 Setup Complete! Your codebase is now guarded across all major AI tools.${colors.reset}\n`);

  console.log(`${colors.bright}🛡️ Show off your clean architecture to contributors & users!${colors.reset}`);
  console.log(`Add this badge to your README.md:`);
  console.log(`${colors.cyan}${badgeMd}${colors.reset}\n`);

  console.log(`${colors.dim}─────────────────────────────────────────────────────────────────────────────${colors.reset}`);
  console.log(`💡 ${colors.bright}Need automated PR review bots & team CI enforcement?${colors.reset}`);
  console.log(`   Upgrade to RepoGuard Pro ($12/mo): ${colors.cyan}https://taylormatematica-beep.github.io/repoguard/#pricing${colors.reset}`);
  console.log(`${colors.dim}─────────────────────────────────────────────────────────────────────────────${colors.reset}\n`);

} else if (command === 'audit') {
  const startTime = Date.now();
  const files = scanDirectory(targetDir);
  let allViolations = [];

  for (const file of files) {
    const relativePath = path.relative(targetDir, file);
    try {
      const content = fs.readFileSync(file, 'utf8');
      const fileViolations = analyzeDiff(content, relativePath);
      allViolations = allViolations.concat(fileViolations);
    } catch (_) {}
  }

  const { score, grade } = calculateHealthScore(files.length, allViolations);
  const duration = Date.now() - startTime;

  if (isSarifFormat) {
    console.log(formatSARIF(allViolations));
    process.exit(isStrict && allViolations.some(v => v.severity === 'critical' || v.severity === 'error') ? 1 : 0);
  }

  if (isJsonFormat) {
    console.log(formatJSON(allViolations, { score, grade }, files.length));
    process.exit(isStrict && allViolations.some(v => v.severity === 'critical' || v.severity === 'error') ? 1 : 0);
  }

  console.log(`${colors.cyan}🔍 Scanning entire codebase for architectural violations...${colors.reset}\n`);

  console.log(`====================================================`);
  console.log(`  ${colors.bright}ARCHITECTURAL HEALTH DASHBOARD${colors.reset}`);
  console.log(`====================================================`);
  console.log(`  Files Audited:    ${colors.bright}${files.length}${colors.reset}`);
  console.log(`  Scan Duration:    ${colors.dim}${duration}ms [Zero-latency]${colors.reset}`);
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

  console.log(`${colors.dim}─────────────────────────────────────────────────────────────────────────────${colors.reset}`);
  console.log(`💡 ${colors.bright}Need automated PR review bots & team CI enforcement?${colors.reset}`);
  console.log(`   Upgrade to RepoGuard Pro ($12/mo): ${colors.cyan}https://taylormatematica-beep.github.io/repoguard/#pricing${colors.reset}`);
  console.log(`${colors.dim}─────────────────────────────────────────────────────────────────────────────${colors.reset}\n`);

  if (isStrict && allViolations.some(v => v.severity === 'critical' || v.severity === 'error')) {
    process.exit(1);
  }

} else if (command === 'diff') {
  console.log(`${colors.cyan}🔬 Auditing uncommitted git changes against architectural guardrails...${colors.reset}\n`);

  try {
    const gitDiff = execSync('git diff HEAD', { encoding: 'utf8' });
    if (!gitDiff.trim()) {
      console.log(`${colors.green}✓ Working tree is clean. No uncommitted diff to audit.${colors.reset}\n`);
      process.exit(0);
    }

    // Parse diff by file
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
      console.log(`\n${colors.dim}Fix these issues or run with --ignore-guard to bypass.${colors.reset}\n`);
      process.exit(1);
    }
  } catch (e) {
    console.log(`${colors.yellow}⚠️ Not a git repository or git command failed.${colors.reset}`);
  }

} else if (command === 'hook' && args[1] === 'install') {
  const hooksDir = path.join(targetDir, '.git', 'hooks');
  if (!fs.existsSync(hooksDir)) {
    console.log(`${colors.red}Error: .git/hooks directory not found. Is this a Git repository?${colors.reset}`);
    process.exit(1);
  }

  const hookScript = `#!/bin/sh\n# RepoGuard Pre-Commit Architecture Hook\nnpx repoguard diff\n`;
  const hookPath = path.join(hooksDir, 'pre-commit');
  fs.writeFileSync(hookPath, hookScript, { mode: 0o755 });
  console.log(`${colors.green}✅ Pre-commit hook installed in .git/hooks/pre-commit!${colors.reset}`);
  console.log(`${colors.dim}RepoGuard will now automatically block any AI code drift before it gets committed.${colors.reset}\n`);

} else if (command === 'review' || command === 'preview-pr') {
  console.log(`${colors.cyan}🔬 Simulating automated Pull Request comment for CI...${colors.reset}\n`);
  const sampleDiff = `
+ export async function getUserOrders(req: any, res: any) {
+   const apiKey = "sk_live_" + "9823478912389124abcdefgh";
+   const orders = await prisma.order.findMany({ where: { userId: req.params.id } });
+   console.log("Found orders", orders);
+   return res.json(orders);
+ }
`;
  const violations = analyzeDiff(sampleDiff, 'src/controllers/order.controller.ts');
  console.log(generatePRReviewMarkdown(violations, 10));
  console.log(`\n${colors.bright}${colors.yellow}Summary: Found ${violations.length} architectural issue(s) that would be reported in the PR!${colors.reset}\n`);

} else if (command === 'rules') {
  console.log(`${colors.bright}Active Architectural Guardrails (${ARCHITECTURAL_RULES.length} Rules):${colors.reset}\n`);
  for (const r of ARCHITECTURAL_RULES) {
    const sev = r.severity === 'critical' ? colors.red : r.severity === 'error' ? colors.yellow : colors.cyan;
    console.log(`  ${sev}${r.id}${colors.reset} [${r.category}] - ${colors.bright}${r.name}${colors.reset}`);
    console.log(`    ${colors.dim}${r.message}${colors.reset}\n`);
  }

} else if (command === 'fix') {
  console.log(`${colors.cyan}🛠️  Analyzing codebase for architectural auto-fixes & refactoring plans...${colors.reset}\n`);

  const files = scanDirectory(targetDir);
  let allViolations = [];

  for (const file of files) {
    const relativePath = path.relative(targetDir, file);
    try {
      const content = fs.readFileSync(file, 'utf8');
      const fileViolations = analyzeDiff(content, relativePath);
      allViolations = allViolations.concat(fileViolations);
    } catch (_) {}
  }

  if (allViolations.length === 0) {
    console.log(`${colors.green}✨ Flawless architecture! No fixes or refactorings required.${colors.reset}\n`);
    process.exit(0);
  }

  console.log(`${colors.bright}Found ${allViolations.length} item(s) to refactor:${colors.reset}\n`);

  for (const v of allViolations) {
    console.log(`${colors.dim}─── [${v.ruleId}] ${v.filename}:${v.lineNumber} ─────────────────────────────${colors.reset}`);
    console.log(`  ${colors.red}❌ Problematic: ${v.codeSnippet}${colors.reset}`);
    if (v.suggestion) {
      console.log(`  ${colors.green}✅ Suggested Fix: ${v.suggestion}${colors.reset}`);
    }
    console.log(`  ${colors.dim}💡 Architectural Note: ${v.message}${colors.reset}\n`);
  }

  console.log(`${colors.dim}─────────────────────────────────────────────────────────────────────────────${colors.reset}`);
  console.log(`💡 ${colors.bright}Need automated PR review bots & team CI enforcement?${colors.reset}`);
  console.log(`   Upgrade to RepoGuard Pro ($12/mo): ${colors.cyan}https://taylormatematica-beep.github.io/repoguard/#pricing${colors.reset}`);
  console.log(`${colors.dim}─────────────────────────────────────────────────────────────────────────────${colors.reset}\n`);

} else {
  console.log(`Usage:
  ${colors.bright}npx repoguard init${colors.reset}                  Generate .cursorrules, CLAUDE.md & Windsurf rules (Go, Python, TypeScript, Rust)
  ${colors.bright}npx repoguard audit${colors.reset}                 Full codebase scan with Architectural Health Score (A+ to F)
  ${colors.bright}npx repoguard audit --format=sarif${colors.reset}  Export SARIF v2.1.0 report for GitHub Code Scanning
  ${colors.bright}npx repoguard audit --format=json${colors.reset}   Export machine-readable JSON for custom CI/CD pipelines
  ${colors.bright}npx repoguard fix${colors.reset}                   Inspect and generate actionable architectural fixes
  ${colors.bright}npx repoguard mcp${colors.reset}                   Launch Model Context Protocol (MCP) server (Tools, Resources, Prompts)
  ${colors.bright}npx repoguard diff${colors.reset}                  Audit uncommitted git changes in real-time
  ${colors.bright}npx repoguard hook install${colors.reset}          Install pre-commit hook to block AI drift locally
  ${colors.bright}npx repoguard review${colors.reset}                Simulate PR review audit for GitHub CI
  ${colors.bright}npx repoguard rules${colors.reset}                 List all active architectural rules (16 rules)
`);
}
