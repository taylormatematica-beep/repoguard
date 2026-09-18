# 🛡️ RepoGuard v1.2

<p align="center">
  <strong>The Architecture Guardian for AI-Assisted Codebases.</strong><br>
  Stop AI from turning your repository into architectural spaghetti.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/rules-8%20active-00f2fe?style=flat-square" alt="Rules">
  <img src="https://img.shields.io/badge/AI-Cursor%20%7C%20Claude%20%7C%20Windsurf%20%7C%20Copilot-green?style=flat-square" alt="AI Support">
</p>

---

## ⚡ The Problem

AI coding assistants write 300 lines in 5 seconds. However, without strict repo context, they frequently:
- **Bypass Layers:** Call Prisma/ORM directly inside UI components and controllers.
- **Leak Secrets:** Hardcode mock credentials and API tokens.
- **Break Hydration:** Inject direct `window` or `localStorage` calls in Server Components.
- **Escape Types:** Scatter `: any` across your codebase to pass compilation.

---

## 🚀 Quickstart & Commands

```bash
# 1. Generate .cursorrules, CLAUDE.md & Windsurf rules
npx repoguard init

# 2. Run Full Architecture Health Check (Score A+ to F)
npx repoguard audit

# 3. Audit uncommitted git changes in real-time
npx repoguard diff

# 4. Block AI drift before commit (Git Hook)
npx repoguard hook install

# 5. List all 8 active architectural rules
npx repoguard rules
