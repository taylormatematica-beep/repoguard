# 🛡️ RepoGuard

<p align="center">
  <strong>The Architecture Guardian for AI-Assisted Codebases.</strong><br>
  Stop AI from turning your repository into architectural spaghetti.
</p>

<p align="center">
  <a href="https://www.producthunt.com/products/repoguard" target="_blank">
    <img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=repoguard&theme=dark" alt="RepoGuard on Product Hunt" style="height: 44px;" height="44" />
  </a>
</p>

<p align="center">
  <a href="https://github.com/taylormatematica-beep/repoguard/actions"><img src="https://img.shields.io/badge/CI-passing-2ea44f?style=flat-square" alt="CI"></a>
  <a href="https://www.npmjs.com/package/repoguard-rules"><img src="https://img.shields.io/npm/v/repoguard-rules?style=flat-square&color=00f2fe" alt="npm version"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License"></a>
  <a href="https://taylormatematica-beep.github.io/repoguard/"><img src="https://img.shields.io/badge/docs-live%20demo-00f2fe?style=flat-square" alt="Docs"></a>
</p>

---

## ⚡ The Problem

AI coding assistants (**Cursor, GitHub Copilot, Claude Code, Windsurf**) write 300 lines of code in 5 seconds. However, without strict repo-level context, they frequently:

1. **Bypass Architectural Layers:** Run raw database queries (Prisma, Drizzle, TypeORM) directly inside UI components or API controllers.
2. **Reinvent Existing Helpers:** Write duplicate 25-line date/string utilities instead of importing from `/utils`.
3. **Escape Type Safety:** Scatter `: any` or `as any` throughout the codebase to pass quick compilation.
4. **Leak Credentials:** Hardcode mock API keys or sensitive tokens.

RepoGuard acts as an automated architecture supervisor: it generates strict, customized `.cursorrules`, `CLAUDE.md`, and `.windsurfrules` context files and runs inline audits on every Pull Request.

---

## 🚀 Quickstart

Run directly in any repository (zero installation required):

```bash
npx repoguard-rules init
```

Or install globally:

```bash
npm install -g repoguard-rules
repoguard init
```

### What happens in 2 seconds:
- 🔍 **Scans your tech stack** (Next.js, NestJS, Express, Python, Prisma, Tailwind, etc.).
- 📝 **Generates tailored, strict `.cursorrules`** (for Cursor AI).
- 🤖 **Generates a comprehensive `CLAUDE.md`** (for Claude Code).
- 🌊 **Generates `.windsurfrules`** (for Windsurf IDE).
- 🛡️ **Installs Git Pre-Commit Hooks & Architectural Health Checkers**.

---

## 🛠️ CLI Commands

| Command | Description |
| :--- | :--- |
| `npx repoguard-rules init` | Scans codebase and generates all AI context rules. |
| `npx repoguard-rules audit` | Evaluates entire codebase and returns an **Architectural Health Score (A+ to F)**. |
| `npx repoguard-rules check` | Audits staged git diffs against architectural rules. |
| `npx repoguard-rules install-hook` | Configures local `.git/hooks/pre-commit` to prevent rule breaches. |
| `npx repoguard-rules list-rules` | Displays all 8 built-in architectural rules and descriptions. |

---

## 🛡️ The 8 Built-in Architectural Rules

| Rule ID | Category | Severity | Guardrail Enforced |
| :--- | :--- | :--- | :--- |
| **RULE-01** | Architecture | Error | Prohibits raw ORM/DB queries in UI components and Controllers. |
| **RULE-02** | Security | Critical | Flags hardcoded secrets, private keys, and API tokens. |
| **RULE-03** | Type Safety | Warning | Forbids lazy `: any` and `as any` escape hatches. |
| **RULE-04** | Code Quality | Info | Enforces structured logging instead of raw `console.log`. |
| **RULE-05** | Next.js / SSR | Error | Prevents hydration mismatch from browser globals (`window`/`localStorage`). |
| **RULE-06** | Security | Critical | Detects SQL injection hazards in raw query interpolations. |
| **RULE-07** | API Design | Warning | Enforces Zod schema validation on incoming request payloads. |
| **RULE-08** | DRY Principle | Info | Prevents AI assistants from duplicating existing common utility helpers. |

---

## 🤖 GitHub Action Integration

Add continuous architectural enforcement to your CI/CD pipeline:

```yaml
# .github/workflows/repoguard.yml
name: RepoGuard Architecture Audit
on: [pull_request]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npx repoguard-rules audit
```

---

## 🌟 Support & Community

- 🌐 **Documentation & Live Hub:** [https://taylormatematica-beep.github.io/repoguard/](https://taylormatematica-beep.github.io/repoguard/)
- 📦 **NPM Registry:** [https://www.npmjs.com/package/repoguard-rules](https://www.npmjs.com/package/repoguard-rules)
- 🐱 **Product Hunt:** [https://www.producthunt.com/products/repoguard](https://www.producthunt.com/products/repoguard)

If RepoGuard helps keep your AI coding clean, consider giving this repository a ⭐ **Star**!
