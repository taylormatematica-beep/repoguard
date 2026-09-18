🛡️ RepoGuard
<p align="center"> <strong>The Architecture Guardian for AI-Assisted Codebases.</strong><br> Stop AI from turning your repository into architectural spaghetti. </p><p align="center"> <a href="https://github.com/taylormatematica-beep/repoguard/actions"><img src="https://img.shields.io/badge/CI-passing-2ea44f?style=flat-square" alt="CI"></a> <a href="https://www.npmjs.com/package/repoguard-rules"><img src="https://img.shields.io/npm/v/repoguard-rules?style=flat-square&color=00f2fe" alt="npm version"></a> <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License"></a> <a href="https://twitter.com"><img src="https://img.shields.io/badge/community-HackerNews%20%7C%20Reddit-orange?style=flat-square" alt="Community"></a> </p>
⚡ The Problem
AI coding assistants (Cursor, GitHub Copilot, Claude Code, Windsurf) write 300 lines of code in 5 seconds. However, without strict repo-level context, they frequently:

Bypass Architectural Layers: Run raw database queries (Prisma, Drizzle, TypeORM) directly inside UI components or API controllers.
Reinvent Existing Helpers: Write duplicate 25-line date/string utilities instead of importing from /utils.
Escape Type Safety: Scatter : any or as any throughout the codebase to pass quick compilation.
Leak Credentials: Hardcode mock API keys or sensitive tokens.
RepoGuard acts as an automated architecture supervisor: it generates strict, customized .cursorrules and CLAUDE.md context files and runs inline audits on every Pull Request.

🚀 Quickstart
Run directly in any repository (zero installation required):

Bash

npx repoguard-rules init
Or install globally:

Bash

npm install -g repoguard-rules
repoguard init
What happens in 2 seconds:
🔍 Scans your tech stack (Next.js, NestJS, Express, Python, Prisma, Tailwind, etc.).
📝 Generates tailored, strict .cursorrules (for Cursor AI).
🤖 Generates a comprehensive CLAUDE.md (for Claude Code).
🌊 Generates .windsurfrules (for Windsurf IDE).
🛡️ Installs Git Pre-Commit Hooks & Architectural Health Checkers.
🛠️ CLI Commands
Bash

# Scan repository and generate AI context guardrails
npx repoguard-rules init

# Audit entire codebase for architecture score & grade (A+ to F)
npx repoguard-rules audit

# Validate git staged changes before committing
npx repoguard-rules check

# Install pre-commit hook to physically block bad AI commits
npx repoguard-rules install-hook

# Simulate an architecture review on a sample AI-generated diff
npx repoguard-rules review --sample
🤖 GitHub Action (PR Architecture Review)
Add RepoGuard to your CI pipeline to catch violations before merging:

YAML

# .github/workflows/repoguard.yml
name: RepoGuard Architecture Audit

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

      - name: Run RepoGuard Architecture Review
        uses: repoguard-app/repoguard-action@v1
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          strict_mode: true
Sample PR Review Comment:
🤖 RepoGuard Bot commented on src/controllers/order.controller.ts:4:

Diff

- const orders = await orderService.getOrders(userId);
+ const orders = await prisma.order.findMany({ where: { userId } });
⚠️ Layering Violation (RULE-01): Controllers must not access the Prisma client directly. Queries must be encapsulated inside a dedicated service module under /services/.

Enforced by RepoGuard

🛡️ Built-in Architectural Rules (8 Rules)
Rule ID	Rule Name	Category	Severity	Description
RULE-01	Layering Boundaries	Architecture	Error	Blocks raw ORM/DB calls inside Controllers and UI components
RULE-02	Secret Leak Detection	Security	Critical	Flags hardcoded secrets, bearer tokens, API keys, and credentials
RULE-03	Strict Type Safety	Type Safety	Warning	Forbids lazy : any and as any escape hatches
RULE-04	Clean Production Logs	Code Quality	Info	Replaces raw console.log with centralized structured loggers
RULE-05	Next.js / SSR Safety	SSR	Error	Prevents SSR hydration mismatch from browser globals (window/localStorage)
RULE-06	SQL Injection Risk	Security	Critical	Detects dangerous raw string interpolation in SQL queries
RULE-07	API Schema Validation	API Design	Warning	Enforces Zod schema validation on incoming request body payloads
RULE-08	DRY Principle	Architecture	Info	Prevents AI assistants from duplicating existing common utility helpers
📦 Tech Stack & Performance
Zero External Dependencies: Instant execution (< 1.5s startup).
Lightweight AST / Regex Engine: Negligible CI overhead (< 3s per PR review).
Multi-AI Support: Tailored configs for Cursor (.cursorrules), Claude Code (CLAUDE.md), and Windsurf (.windsurfrules).
🤝 Contributing
Contributions are welcome! Please read CONTRIBUTING.md to learn how to add custom rules for new frameworks.

📄 License
MIT © RepoGuard • Built with ❤️ for AI-assisted engineering teams.
