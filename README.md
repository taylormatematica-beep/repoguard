# 🛡️ RepoGuard

<p align="center">
  <strong>The Architecture Guardian for AI-Assisted Codebases.</strong><br>
  Stop AI from turning your repository into architectural spaghetti.
</p>

<p align="center">
  <a href="https://github.com/taylormatematica-beep/repoguard/actions"><img src="https://img.shields.io/badge/CI-passing-2ea44f?style=flat-square" alt="CI"></a>
  <a href="https://www.npmjs.com/package/repoguard-rules"><img src="https://img.shields.io/npm/v/repoguard-rules?style=flat-square&color=00f2fe" alt="npm version"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License"></a>
  <a href="https://twitter.com"><img src="https://img.shields.io/badge/community-HackerNews%20%7C%20Reddit-orange?style=flat-square" alt="Community"></a>
</p>

---

## ⚡ The Problem

AI coding assistants (**Cursor, GitHub Copilot, Claude Code, Windsurf**) write 300 lines of code in 5 seconds. However, without strict repo-level context, they frequently:

1. **Bypass Architectural Layers:** Run raw database queries (Prisma, Drizzle, TypeORM) directly inside UI components or API controllers.
2. **Reinvent Existing Helpers:** Write duplicate 25-line date/string utilities instead of importing from `/utils`.
3. **Escape Type Safety:** Scatter `: any` or `as any` throughout the codebase to pass quick compilation.
4. **Leak Credentials:** Hardcode mock API keys or sensitive tokens.

**RepoGuard** acts as an automated architecture supervisor: it generates strict, customized `.cursorrules` and `CLAUDE.md` context files and runs inline audits on every Pull Request.

---

## 🚀 Quickstart

Run directly in any repository (zero installation required):

```bash
npx repoguard-rules init
