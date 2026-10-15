/**
 * RepoGuard Architecture & Diff Analyzer Engine
 * Comprehensive Multi-Language Rule Engine (TypeScript, Python, Go, Rust, Cloud Security)
 * Version 1.7.0
 */

const fs = require('fs');
const path = require('path');

// Complete Architectural Guardrails (16 Rules across TS, Py, Go, Rust & Security)
const ARCHITECTURAL_RULES = [
  {
    id: 'RULE-01',
    name: 'Layering Violation (Direct DB in Controller/UI)',
    severity: 'error',
    category: 'Architecture',
    filePattern: /(controller|components|pages|app\/.*\/page)\.(ts|tsx|js|jsx)$/i,
    pattern: /(prisma\.|db\.|sequelize\.|mongoose\.|drizzle\.)(find|insert|update|delete|query|select|execute)/i,
    message: 'Direct database/ORM access is strictly prohibited in Controllers and UI components. Encapsulate queries inside a dedicated service layer (e.g., `/services/` or `/repositories/`).',
    suggestion: () => `const result = await entityService.find(params);`
  },
  {
    id: 'RULE-PY-01',
    name: 'FastAPI Layer Separation / No Raw DB Queries in Routers',
    severity: 'warning',
    category: 'Architecture',
    filePattern: /\.py$/i,
    pattern: /(db|session|connection)\.(query|execute|exec|scalars|add|delete|commit|flush|refresh)\s*\(/i,
    message: 'Direct database/ORM access is prohibited inside FastAPI route handlers. Encapsulate database operations inside a service or repository layer.',
    suggestion: () => `return userService.get_users();`
  },
  {
    id: 'RULE-GO-01',
    name: 'Go Clean Architecture / No Raw DB Queries in HTTP Handlers',
    severity: 'warning',
    category: 'Architecture',
    filePattern: /\.go$/i,
    pattern: /\b(db|dbConn|database|session|gormDB)\.(Where|Find|First|Take|Last|Save|Create|Delete|Updates|Update|Exec|Raw|Query|QueryRow|Begin|Commit)\b/,
    message: 'Direct database/ORM access detected inside an HTTP handler. Decouple database access into a repository or service layer.',
    suggestion: () => `users, err := userRepository.FindActive(ctx);`
  },
  {
    id: 'RULE-GO-02',
    name: 'Unchecked Error Silenced via Blank Identifier',
    severity: 'warning',
    category: 'Error Handling',
    filePattern: /\.go$/i,
    pattern: /\b_\s*=\s*(err|err[A-Za-z0-9_]*)\b/,
    message: 'Unchecked error discarded via blank identifier (`_ = err`). AI assistants often silence errors to bypass Go compiler strictness. Handle the error explicitly.',
    suggestion: () => `if err != nil { return err }`
  },
  {
    id: 'RULE-RS-01',
    name: 'Rust Panic Risk / Unsafe .unwrap() or .expect() in Production',
    severity: 'warning',
    category: 'Error Handling',
    filePattern: /\.rs$/i,
    pattern: /\.(unwrap|expect)\s*\(/,
    message: 'Unsafe .unwrap() or .expect() in production Rust code. AI models frequently silence errors with .unwrap(), leading to runtime panics and thread crashes. Handle errors explicitly using ?, match, unwrap_or, or unwrap_or_default().',
    suggestion: () => `let value = result?;`
  },
  {
    id: 'RULE-RS-02',
    name: 'Rust Clean Architecture / No Raw DB Queries in Route Handlers',
    severity: 'warning',
    category: 'Architecture',
    filePattern: /\.rs$/i,
    pattern: /\b(sqlx::(query|query_as|query_scalar)|diesel::(insert_into|update|delete)|pool\.(acquire|begin))\b/,
    message: 'Direct database/ORM access detected inside a Rust route handler (Axum/Actix-web/Rocket). Decouple persistence logic into a dedicated repository or service layer.',
    suggestion: () => `let users = user_service::get_active_users(&pool).await?;`
  },
  {
    id: 'RULE-02',
    name: 'Hardcoded Secret / Credential Leak',
    severity: 'critical',
    category: 'Security',
    filePattern: /\.(ts|tsx|js|jsx|py|go|rs|env|json)$/i,
    pattern: /(api_key|secret|password|bearer|auth_token|private_key)\s*[:=]\s*["'][A-Za-z0-9_\-\.]{16,}["']/i,
    message: 'Potential hardcoded secret or API credential detected. Secrets must be injected via environment variables (`process.env.*` or `std::env::var()`).',
    suggestion: () => `const secret = process.env.API_SECRET_KEY;`
  },
  {
    id: 'RULE-SEC-01',
    name: 'Live AI, Cloud & Database Credential Leak',
    severity: 'critical',
    category: 'Security',
    filePattern: /(?:\.(?:ts|tsx|js|jsx|py|go|rs|env|json|ya?ml|toml|pem|key)|\.env\.[\w.-]+)$/i,
    pattern: /(?:\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{40,}|AKIA[0-9A-Z]{16}|(?:sk|rk)_(?:live|test)_[0-9a-zA-Z]{24,})\b|(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss):\/\/[A-Za-z0-9._%-]+:[^\/\s"'`@${}]{8,}@[A-Za-z0-9._-]+(?::\d{2,5})?(?:\/[^\s"'`]*)?)/i,
    message: 'Live AI/cloud token or database connection URI with embedded credentials detected. Revoke or rotate exposed credentials immediately and load them from a secret manager or environment variable.',
    suggestion: () => `const apiKey = process.env.PROVIDER_API_KEY;`
  },
  {
    id: 'RULE-SEC-02',
    name: 'Embedded Private Cryptographic Key Header',
    severity: 'critical',
    category: 'Security',
    filePattern: /(?:\.(?:ts|tsx|js|jsx|py|go|rs|env|pem|key)|\.env\.[\w.-]+)$/i,
    pattern: /-----BEGIN\s+(RSA|EC|PGP|OPENSSH|ENCRYPTED|DSA)?\s*PRIVATE\s+KEY-----/i,
    message: 'Unencrypted private cryptographic key file header detected in source code. Store private keys in a secure secret manager or KMS, never in source repositories.',
    suggestion: () => `const privateKey = process.env.PRIVATE_KEY_PEM;`
  },
  {
    id: 'RULE-09',
    name: 'Client-Side Secret Exposure via Public Prefix',
    severity: 'critical',
    category: 'Security',
    filePattern: /\.(ts|tsx|js|jsx|env|env\..*)$/i,
    pattern: /(NEXT_PUBLIC|VITE|REACT_APP|PUBLIC)_[A-Z0-9_]*(SECRET|PRIVATE_KEY|PASSWORD|AUTH_TOKEN|API_SECRET)\b/i,
    message: 'Publicly exposed client-side environment variable with sensitive prefix. Variables prefixed with NEXT_PUBLIC_ or VITE_ are bundled directly into browser-facing client JS.',
    suggestion: () => `Access the secret server-side without the public prefix.`
  },
  {
    id: 'RULE-03',
    name: 'Forbidden "any" Type Escape Hatch',
    severity: 'warning',
    category: 'Type Safety',
    filePattern: /\.(ts|tsx)$/i,
    pattern: /:\s*any\b|\bas\s+any\b|<any>/i,
    message: 'Forbidden use of "any". AI assistants frequently use "any" to bypass compile errors, destroying type safety. Define an explicit interface or use `unknown`.',
    suggestion: () => `interface Props { id: string; } // Replace 'any' with typed interface`
  },
  {
    id: 'RULE-04',
    name: 'Production Logger Hygiene',
    severity: 'info',
    category: 'Code Quality',
    filePattern: /(src|pages|app|controllers|services|lib|routes)\/.*\.(ts|tsx|js|jsx)$/i,
    pattern: /console\.(log|debug|info|warn|error)\(/i,
    message: 'Raw console statement in application flow. Use the project centralized structured logger (e.g., `/lib/logger` or winston/pino).',
    suggestion: () => `logger.info("Operation completed successfully", { metadata });`
  },
  {
    id: 'RULE-05',
    name: 'SSR / Hydration Mismatch Risk',
    severity: 'error',
    category: 'Next.js / SSR',
    filePattern: /(app\/.*\/page|app\/.*\/layout|server|api)\.(tsx|ts|jsx|js)$/i,
    pattern: /(window\.|localStorage\.|sessionStorage\.|document\.)/i,
    message: 'Direct access to browser globals (window/localStorage) in Server Components or SSR paths causes hydration mismatch errors. Use `useEffect` or client-only hooks.',
    suggestion: () => `'use client'; // Or wrap in typeof window !== 'undefined'`
  },
  {
    id: 'RULE-06',
    name: 'SQL Injection Vulnerability',
    severity: 'critical',
    category: 'Security',
    filePattern: /\.(ts|tsx|js|jsx|py|go|rs)$/i,
    pattern: /(\$queryRawUnsafe|query\(|execute\(|db\.Raw\()\s*[`"'].*\$\{.*\}.*[`"']/i,
    message: 'Unsafe dynamic string interpolation detected in raw database query. Always use parameterized queries to prevent SQL injection.',
    suggestion: () => `await prisma.$queryRaw\`SELECT * FROM users WHERE id = \${id}\`;`
  },
  {
    id: 'RULE-07',
    name: 'Unvalidated Request Body Payload',
    severity: 'warning',
    category: 'API Design',
    filePattern: /(route|controller|api)\.(ts|tsx|js|jsx)$/i,
    pattern: /const\s+.*=\s*(req\.body|await\s+req\.json\(\))\s*;/i,
    message: 'Request payload extracted without schema validation. Validate incoming data using a schema validator like Zod before processing.',
    suggestion: () => `const data = UserSchema.parse(await req.json());`
  },
  {
    id: 'RULE-08',
    name: 'Duplicate Common Utility Anti-Pattern',
    severity: 'info',
    category: 'DRY Principle',
    filePattern: /\.(ts|tsx|js|jsx)$/i,
    pattern: /(function\s+(formatDate|formatCurrency|validateEmail|slugify|sleep)\b|const\s+(formatDate|formatCurrency|validateEmail|slugify|sleep)\s*=)/i,
    message: 'Reinventing a standard utility function. AI models frequently duplicate existing helpers. Check `/utils` or `/lib` and import the existing shared function.',
    suggestion: () => `import { formatDate } from '@/utils/formatters';`
  }
];

/**
 * Analyzes Python FastAPI routes for direct DB operations
 */
function analyzePythonFastAPIRoutes(content, filename) {
  const violations = [];
  const lines = content.split('\n');

  let insideRoute = false;
  let routeIndent = -1;
  let routeDecorator = false;
  let currentLineNumber = 0;
  let isDiff = lines.some(line => /^@@ /.test(line));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isDiff && line.startsWith('@@ ')) {
      const match = line.match(/^\@\@ -\d+(?:,\d+)? \+(\d+)/);
      if (match) currentLineNumber = Number(match[1]) - 1;
      continue;
    }
    if (line.startsWith('-') && !line.startsWith('---')) continue;

    const cleanLine = line.startsWith('+') ? line.slice(1) : line;
    if (isDiff) currentLineNumber++;
    const trimmed = cleanLine.trim();

    if (/^@(router|app)\.(get|post|put|delete|patch)\s*\(/i.test(trimmed)) {
      routeDecorator = true;
      continue;
    }

    if (routeDecorator && /^(async\s+)?def\s+\w+\s*\(/.test(trimmed)) {
      insideRoute = true;
      routeDecorator = false;
      routeIndent = line.search(/\S/);
      continue;
    }

    if (!trimmed) continue;

    const indentation = line.search(/\S/);
    if (insideRoute && indentation <= routeIndent && /^(async\s+)?(def|class)\s+\w+/.test(trimmed)) {
      insideRoute = false;
    }

    if (!insideRoute) continue;

    const dbOperation = /\b(db|session|connection)\.(query|execute|exec|scalars|add|delete|commit|flush|refresh)\s*\(/i;
    if (dbOperation.test(trimmed)) {
      const isCommit = /\.commit\s*\(/i.test(trimmed);
      violations.push({
        ruleId: 'RULE-PY-01',
        ruleName: 'FastAPI Layer Separation / No Raw DB Queries in Routers',
        severity: isCommit ? 'critical' : 'warning',
        category: 'Architecture',
        filename: filename,
        lineNumber: isDiff ? currentLineNumber : i + 1,
        codeSnippet: trimmed,
        message: isCommit
          ? 'Direct database transaction commit detected inside a FastAPI route handler. Database mutations and transaction management must be encapsulated inside a service or repository layer.'
          : 'Direct database/ORM access detected inside a FastAPI route handler. Encapsulate database operations inside a service or repository layer.',
        suggestion: 'Delegate database operations to a service or repository.'
      });
    }
  }

  return violations;
}

/**
 * Analyzes Go HTTP handlers (Gin, Fiber, Echo, net/http) for direct DB/GORM access
 */
function analyzeGolangHandlers(content, filename) {
  const violations = [];
  const lines = content.split('\n');

  let insideHandler = false;
  let handlerBraceCount = 0;
  let currentLineNumber = 0;
  let isDiff = lines.some(line => /^@@ /.test(line));

  const isHandlerFile = /(handler|handlers|controller|controllers|routes|router)/i.test(filename) ||
                        /(handler|controller)\.go$/i.test(filename);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isDiff && line.startsWith('@@ ')) {
      const match = line.match(/^\@\@ -\d+(?:,\d+)? \+(\d+)/);
      if (match) currentLineNumber = Number(match[1]) - 1;
      continue;
    }
    if (line.startsWith('-') && !line.startsWith('---')) continue;

    const cleanLine = line.startsWith('+') ? line.slice(1) : line;
    if (isDiff) currentLineNumber++;
    const trimmed = cleanLine.trim();

    // Check for ignored errors (RULE-GO-02)
    if (/\b_\s*=\s*(err|err[A-Za-z0-9_]*)\b/.test(trimmed)) {
      violations.push({
        ruleId: 'RULE-GO-02',
        ruleName: 'Unchecked Error Silenced via Blank Identifier',
        severity: 'warning',
        category: 'Error Handling',
        filename: filename,
        lineNumber: isDiff ? currentLineNumber : i + 1,
        codeSnippet: trimmed,
        message: 'Unchecked error discarded via blank identifier (`_ = err`). AI assistants often silence errors to bypass Go compiler strictness. Handle the error explicitly.',
        suggestion: 'if err != nil { return err }'
      });
    }

    // Detect HTTP Handler function signature: Gin (*gin.Context), Fiber (*fiber.Ctx), Echo (echo.Context), or net/http
    const isHandlerFunc = /func\s+(\([^)]+\)\s+)?\w+\s*\([^)]*(\*gin\.Context|\*fiber\.Ctx|echo\.Context|http\.ResponseWriter)[^)]*\)/i.test(trimmed);

    if (isHandlerFunc || (isHandlerFile && /^func\s+(\([^)]+\)\s+)?\w+\s*\(/.test(trimmed))) {
      insideHandler = true;
      handlerBraceCount = (cleanLine.match(/{/g) || []).length - (cleanLine.match(/}/g) || []).length;
      continue;
    }

    if (insideHandler) {
      handlerBraceCount += (cleanLine.match(/{/g) || []).length - (cleanLine.match(/}/g) || []).length;
      if (handlerBraceCount <= 0) {
        insideHandler = false;
      }
    }

    // Ignore lines if not inside an HTTP handler
    if (!insideHandler) continue;

    const dbOp = /\b(db|dbConn|database|session|gormDB)\.(Where|Find|First|Take|Last|Save|Create|Delete|Updates|Update|Exec|Raw|Query|QueryRow|Begin|Commit)\b/i;
    if (dbOp.test(trimmed)) {
      const isMutation = /\.(Exec|Commit|Delete|Save|Create)\b/i.test(trimmed);
      violations.push({
        ruleId: 'RULE-GO-01',
        ruleName: 'Go Clean Architecture / No Raw DB Queries in HTTP Handlers',
        severity: isMutation ? 'critical' : 'warning',
        category: 'Architecture',
        filename: filename,
        lineNumber: isDiff ? currentLineNumber : i + 1,
        codeSnippet: trimmed,
        message: isMutation
          ? 'Direct database mutation/transaction executed inside a Go HTTP handler. Database persistence must be encapsulated within a repository layer.'
          : 'Direct database/ORM query detected inside a Go HTTP handler. Decouple database operations into a repository or service.',
        suggestion: 'Delegate database operations to a repository layer (e.g. userRepo.FindActive(ctx)).'
      });
    }
  }

  return violations;
}

/**
 * Analyzes Rust code for panic-prone .unwrap() and Clean Architecture route violations (Axum, Actix-web, Rocket)
 */
function analyzeRustCode(content, filename) {
  const violations = [];
  const lines = content.split('\n');

  const isTestFile = /(^|\/)(tests\/|test_.*\.rs$|.*_test\.rs$)/i.test(filename);
  let insideTestBlock = false;
  let seenTestOpenBrace = false;
  let testBraceCount = 0;

  let insideHandler = false;
  let seenHandlerOpenBrace = false;
  let handlerBraceCount = 0;

  let currentLineNumber = 0;
  let isDiff = lines.some(line => /^@@ /.test(line));

  const isHandlerFile = /(handler|handlers|routes|router|controller|controllers)/i.test(filename) ||
                        /(handler|controller)\.rs$/i.test(filename);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isDiff && line.startsWith('@@ ')) {
      const match = line.match(/^\@\@ -\d+(?:,\d+)? \+(\d+)/);
      if (match) currentLineNumber = Number(match[1]) - 1;
      continue;
    }
    if (line.startsWith('-') && !line.startsWith('---')) continue;

    const cleanLine = line.startsWith('+') ? line.slice(1) : line;
    if (isDiff) currentLineNumber++;
    const trimmed = cleanLine.trim();

    // Detect unit test module or #[test] attribute
    if (/#\[cfg\(test\)\]|#\[test\]|mod\s+tests\s*\{/i.test(trimmed)) {
      insideTestBlock = true;
      seenTestOpenBrace = cleanLine.includes('{');
      testBraceCount = (cleanLine.match(/{/g) || []).length - (cleanLine.match(/}/g) || []).length;
    } else if (insideTestBlock) {
      if (cleanLine.includes('{')) seenTestOpenBrace = true;
      testBraceCount += (cleanLine.match(/{/g) || []).length - (cleanLine.match(/}/g) || []).length;
      if (seenTestOpenBrace && testBraceCount <= 0) {
        insideTestBlock = false;
        seenTestOpenBrace = false;
      }
    }

    // RULE-RS-01: .unwrap() or .expect() in production code
    if (!isTestFile && !insideTestBlock) {
      if (/\.(unwrap|expect)\s*\(/.test(trimmed) && !trimmed.startsWith('//') && !trimmed.startsWith('/*')) {
        violations.push({
          ruleId: 'RULE-RS-01',
          ruleName: 'Rust Panic Risk / Unsafe .unwrap() or .expect() in Production',
          severity: 'warning',
          category: 'Error Handling',
          filename: filename,
          lineNumber: isDiff ? currentLineNumber : i + 1,
          codeSnippet: trimmed,
          message: 'Unsafe .unwrap() or .expect() in production Rust code. AI models frequently silence errors with .unwrap(), leading to runtime panics and thread crashes. Handle errors explicitly using ?, match, unwrap_or, or unwrap_or_default().',
          suggestion: 'let value = result?;'
        });
      }
    }

    // Detect HTTP route handler in Axum, Actix-web, or Rocket
    const isRouteDecorator = /#\[(get|post|put|delete|patch|route)\s*\(/i.test(trimmed);
    const isHandlerSig = /(pub\s+)?(async\s+)?fn\s+\w+/i.test(trimmed);

    if (isRouteDecorator || (isHandlerFile && isHandlerSig)) {
      insideHandler = true;
      seenHandlerOpenBrace = cleanLine.includes('{');
      handlerBraceCount = (cleanLine.match(/{/g) || []).length - (cleanLine.match(/}/g) || []).length;
      continue;
    }

    if (insideHandler) {
      if (cleanLine.includes('{')) seenHandlerOpenBrace = true;
      handlerBraceCount += (cleanLine.match(/{/g) || []).length - (cleanLine.match(/}/g) || []).length;

      // RULE-RS-02: Direct database operations inside Rust route handlers
      const dbOp = /\b(sqlx::(query|query_as|query_scalar)|diesel::(insert_into|update|delete)|pool\.(acquire|begin))\b/i;
      if (dbOp.test(trimmed)) {
        violations.push({
          ruleId: 'RULE-RS-02',
          ruleName: 'Rust Clean Architecture / No Raw DB Queries in Route Handlers',
          severity: 'warning',
          category: 'Architecture',
          filename: filename,
          lineNumber: isDiff ? currentLineNumber : i + 1,
          codeSnippet: trimmed,
          message: 'Direct database/ORM access detected inside a Rust route handler (Axum/Actix-web/Rocket). Decouple persistence logic into a dedicated repository or service layer.',
          suggestion: 'let users = user_service::get_active_users(&pool).await?;'
        });
      }

      if (seenHandlerOpenBrace && handlerBraceCount <= 0) {
        insideHandler = false;
        seenHandlerOpenBrace = false;
      }
    }
  }

  return violations;
}

/**
 * Analyzes a diff or raw file content against architectural guardrails
 */
function analyzeDiff(diffContent, filename) {
  const violations = [];

  if (/\.py$/i.test(filename)) {
    violations.push(...analyzePythonFastAPIRoutes(diffContent, filename));
  } else if (/\.go$/i.test(filename)) {
    violations.push(...analyzeGolangHandlers(diffContent, filename));
  } else if (/\.rs$/i.test(filename)) {
    violations.push(...analyzeRustCode(diffContent, filename));
  }

  const lines = diffContent.split('\n');
  const isDiff = lines.some(line => line.startsWith('diff --git ') || /^@@ -\d/.test(line));
  let currentLineNumber = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // A raw PEM file begins with '-----BEGIN'; only skip removed lines in an actual git diff.
    if (!isDiff || !line.startsWith('-')) {
      currentLineNumber++;
      const cleanLine = line.replace(/^\+/, '');

      for (const rule of ARCHITECTURAL_RULES) {
        if (
          rule.id === 'RULE-PY-01' ||
          rule.id === 'RULE-GO-01' ||
          rule.id === 'RULE-GO-02' ||
          rule.id === 'RULE-RS-01' ||
          rule.id === 'RULE-RS-02'
        ) {
          continue;
        }
        if (rule.filePattern.test(filename) && rule.pattern.test(cleanLine)) {
          violations.push({
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            category: rule.category,
            filename: filename,
            lineNumber: currentLineNumber,
            codeSnippet: cleanLine.trim(),
            message: rule.message,
            suggestion: rule.suggestion ? rule.suggestion(cleanLine) : null
          });
        }
      }
    }
  }

  return violations;
}

/**
 * Reads .repoguardignore file if present
 */
function loadIgnoreList(rootDir) {
  const defaultIgnores = [
    'node_modules', '.git', 'dist', 'build', '.next', 'coverage',
    '.turbo', 'venv', '.venv', 'vendor', '__pycache__', 'test', 'tests', '__tests__', 'test/fixtures',
    'target', 'Cargo.lock'
  ];

  const ignoreFile = path.join(rootDir, '.repoguardignore');
  if (fs.existsSync(ignoreFile)) {
    try {
      const content = fs.readFileSync(ignoreFile, 'utf8');
      const customIgnores = content
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#'));
      return [...new Set([...defaultIgnores, ...customIgnores])];
    } catch (_) {}
  }

  return defaultIgnores;
}

/**
 * Recursively scans all codebase files in a directory
 */
function scanDirectory(dir, extensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.json', '.yaml', '.yml', '.toml', '.env', '.pem', '.key'], rootDir = dir) {
  const ignoreDirs = loadIgnoreList(rootDir);
  let files = [];

  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');

    const shouldIgnore = ignoreDirs.some(ign => {
      const cleanIgn = ign.replace(/\/$/, '');
      return item === cleanIgn || relPath === cleanIgn || relPath.startsWith(cleanIgn + '/');
    });

    if (shouldIgnore) continue;

    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      files = files.concat(scanDirectory(fullPath, extensions, rootDir));
    } else if (extensions.some(ext => item.endsWith(ext)) || item.startsWith('.env.')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Calculates repository architectural health score (0 to 100)
 */
function calculateHealthScore(totalFiles, violations) {
  if (totalFiles === 0) return { score: 100, grade: 'A+' };

  let penalty = 0;
  for (const v of violations) {
    if (v.severity === 'critical') penalty += 25;
    else if (v.severity === 'error') penalty += 10;
    else if (v.severity === 'warning') penalty += 3;
    else if (v.severity === 'info') penalty += 1;
  }

  const score = Math.max(0, 100 - penalty);
  let grade = 'A+';
  if (score < 50) grade = 'F (Architecture Rot)';
  else if (score < 70) grade = 'D (High Debt)';
  else if (score < 80) grade = 'C (Moderate Drift)';
  else if (score < 90) grade = 'B (Good)';

  return { score, grade };
}

/**
 * Formats violations into GitHub PR Review Markdown comment
 */
function formatGitHubComment(violations) {
  if (violations.length === 0) {
    return `### 🛡️ RepoGuard Architecture Audit: PASSED\n\n✅ No architectural guardrail violations detected in this Pull Request diff. Clean code!`;
  }

  let comment = `### ⚠️ RepoGuard Architecture Audit: ${violations.length} Violation(s) Found\n\n`;
  comment += `Our AI-guardrails detected patterns that violate the repository's \`.cursorrules\`:\n\n`;

  for (const v of violations) {
    const icon = v.severity === 'critical' ? '🚨' : v.severity === 'error' ? '❌' : v.severity === 'warning' ? '⚠️' : 'ℹ️';
    comment += `#### ${icon} \`${v.ruleId}\`: ${v.ruleName}\n`;
    comment += `- **File:** \`${v.filename}:${v.lineNumber}\`\n`;
    comment += `- **Category:** \`${v.category}\`\n`;
    comment += `- **Violation:** ${v.message}\n`;
    const lang = v.filename.endsWith('.rs') ? 'rust' : v.filename.endsWith('.go') ? 'go' : v.filename.endsWith('.py') ? 'python' : 'typescript';
    comment += `\`\`\`${lang}\n// Problematic code:\n${v.codeSnippet}\n\`\`\`\n\n`;
    if (v.suggestion) {
      comment += `> 💡 **Architectural Suggestion:**\n> \`${v.suggestion}\`\n\n`;
    }
  }

  comment += `---\n*Audit enforced by [RepoGuard](https://taylormatematica-beep.github.io/repoguard/) • Protect your codebase from AI code rot.*`;
  return comment;
}

/**
 * Formats violations into OASIS SARIF v2.1.0 for GitHub Code Scanning
 */
function formatSARIF(violations) {
  const sarif = {
    $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "RepoGuard",
            version: "1.7.0",
            informationUri: "https://taylormatematica-beep.github.io/repoguard/",
            rules: ARCHITECTURAL_RULES.map(r => ({
              id: r.id,
              name: r.name,
              shortDescription: { text: r.name },
              fullDescription: { text: r.message },
              defaultConfiguration: {
                level: r.severity === 'critical' || r.severity === 'error' ? 'error' : 'warning'
              }
            }))
          }
        },
        results: violations.map(v => ({
          ruleId: v.ruleId,
          level: v.severity === 'critical' || v.severity === 'error' ? 'error' : 'warning',
          message: { text: v.message },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: v.filename },
                region: { startLine: v.lineNumber || 1 }
              }
            }
          ]
        }))
      }
    ]
  };

  return JSON.stringify(sarif, null, 2);
}

/**
 * Formats violations into clean JSON for custom CI/CD pipelines
 */
function formatJSON(violations, healthScore, totalFiles) {
  return JSON.stringify({
    tool: "RepoGuard",
    version: "1.7.0",
    totalFiles,
    healthScore: healthScore.score,
    grade: healthScore.grade,
    violationsCount: violations.length,
    violations
  }, null, 2);
}

module.exports = {
  analyzeDiff,
  analyzeGolangHandlers,
  analyzeRustCode,
  scanDirectory,
  calculateHealthScore,
  formatGitHubComment,
  formatSARIF,
  formatJSON,
  loadIgnoreList,
  ARCHITECTURAL_RULES
};
