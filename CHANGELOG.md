# 📜 RepoGuard Changelog

All notable changes to the **RepoGuard** architecture linter and context generator will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.7.0] - 2026-10-14
### 🦀 Added
- **Rust Clean Architecture & Panic Safety Engine:**
  - `RULE-RS-01`: Flags unsafe `.unwrap()` and `.expect()` calls in production Rust logic that cause thread panics and process crashes (exempts unit test modules and `#[cfg(test)]`).
  - `RULE-RS-02`: Enforces Clean Architecture in Rust HTTP handlers (Axum, Actix-web, Rocket), prohibiting direct SQLx (`sqlx::query!`, `sqlx::query_as!`) and Diesel operations inside routes.
  - Added Rust stack detection (`Cargo.toml`) in `npx repoguard init` generating specialized `.cursorrules`, `CLAUDE.md`, and `.windsurfrules`.
- **Secret Leak Engine 2.0:**
  - `RULE-SEC-01`: Signature-based detection of AI/cloud provider tokens (OpenAI `sk-proj-`, Anthropic `sk-ant-`, GitHub `ghp_` / `github_pat_`, AWS `AKIA...`, Stripe `sk_live_` / `sk_test_`) and credential-bearing database URLs (Postgres, MySQL, MongoDB, Redis).
  - `RULE-SEC-02`: Detects private cryptographic key file headers (`-----BEGIN RSA/EC/PGP PRIVATE KEY-----`).
  - Full repository audits now include supported configuration and key files (`.env`, `.env.*`, `.json`, `.yaml`, `.toml`, `.pem`, `.key`).
- **Model Context Protocol (MCP) Server 2.0 (Full 3-Pillar Standard):**
  - **Tools**: Added real-time git diff auditing (`repoguard_diff`) alongside `repoguard_audit`, `repoguard_get_rules`, and `repoguard_fix`.
  - **Resources**: Full `resources/list` and `resources/read` support exposing `repoguard://rules` (JSON rules catalog) and `repoguard://health` (live project health scorecard).
  - **Prompts**: Full `prompts/list` and `prompts/get` support featuring `architectural_review` and `clean_architecture_refactor` templates for Claude Desktop and Cursor.
  - Advertises Tools, Resources, and Prompts over the MCP protocol version `2024-11-05`; external Glama evaluation remains separate.
- **Rule Engine Expansion:**
  - Active architectural guardrails increased from 12 to 16 comprehensive rules across TypeScript, JavaScript, Python, Golang, Rust, and Security.

---

## [1.6.1] - 2026-10-04
### 🤖 Added
- **Native Model Context Protocol (MCP) Server:**
  - Integrated zero-dependency stdio JSON-RPC 2.0 transport via `bin/mcp.js`.
  - Added `npx repoguard mcp` CLI command.
  - Exposes 3 native tools for Claude Desktop, Claude Code, Cursor, and Windsurf:
    - `repoguard_audit`: Audits repositories for Clean Architecture breaches in ~12ms.
    - `repoguard_get_rules`: Returns all 12 architectural guardrails to prevent AI hallucination.
    - `repoguard_fix`: Analyzes violating code snippets and returns actionable refactoring plans.

---

## [1.6.0] - 2026-10-03
### 🚀 Added
- **Golang Clean Architecture Engine:**
  - `RULE-GO-01`: Prohibits raw database queries and GORM mutations inside Gin, Fiber, or Echo HTTP handlers.
  - `RULE-GO-02`: Flags unchecked errors discarded via blank identifiers (`_ = err`).
  - Generates specialized `.cursorrules` and `CLAUDE.md` with context propagation and goroutine safety.
- **Python / FastAPI Expansion:**
  - Auto-detection of FastAPI, Django, Flask, SQLAlchemy, SQLModel, and Pydantic (`RULE-PY-01`).
- **Security Guardrail:**
  - `RULE-09`: Detects client-side secret exposure (`NEXT_PUBLIC_*` or `VITE_*` prefixes with private keys).
- **Enterprise CI/CD & Code Scanning:**
  - Native **OASIS SARIF v2.1.0** export via `npx repoguard audit --format=sarif` for GitHub Security / Code Scanning integration.
  - Machine-readable JSON export via `npx repoguard audit --format=json`.
  - `.repoguardignore` file support for custom directory exclusions.
- **CLI Commands:**
  - Added `npx repoguard fix` for interactive before/after architectural refactoring plans.
  - Added automatic viral badge injection into `README.md` on `init`.
- **Ecosystem:**
  - Officially published on the [GitHub Marketplace](https://github.com/marketplace/actions/repoguard-architecture-audit).
  - Launched in-browser interactive playground on the documentation hub.

---

## [1.5.2] - 2026-09-28
### 💎 Added
- Integrated Developer Pro ($12/mo) and Engineering Team ($39/mo) plan upgrades in CLI terminal footer and README.
- Added domestic PIX checkout support for Brazilian developer community.

---

## [1.5.0] - 2026-09-25
### 🐍 Added
- Merged community Pull Request #3 by [@NihalPN](https://github.com/NihalPN) introducing FastAPI route analysis.
- Integrated automated AST/diff line-number tracking for Python route decorators.

---

## [1.3.0] - 2026-09-19
### 🤖 Added
- Automated GitHub Actions Pull Request Review Commenter (`bin/commenter.js`).
- Dynamic Markdown scorecard with architectural health score (A+ to F) on every PR.

---

## [1.0.0] - 2026-09-18
### 🎉 Initial Release
- Core 8 architectural rules for TypeScript and JavaScript.
- Automated generation of `.cursorrules`, `CLAUDE.md`, and `.windsurfrules`.
- Git pre-commit hook installer (`npx repoguard hook install`).
- Published on NPM registry as `repoguard-rules`.
