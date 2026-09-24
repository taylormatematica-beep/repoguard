/**
 * RepoGuard Architecture & Diff Analyzer Engine
 * Comprehensive 8-Rule Engine with AST/Regex Hybrid Matching
 */

const fs = require('fs');
const path = require('path');

// Complete 8 Architectural Rules
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
    id: 'RULE-02',
    name: 'Hardcoded Secret / Credential Leak',
    severity: 'critical',
    category: 'Security',
    filePattern: /\.(ts|tsx|js|jsx|py|go|env|json)$/i,
    pattern: /(api_key|secret|password|bearer|auth_token|private_key)\s*[:=]\s*["'][A-Za-z0-9_\-\.]{16,}["']/i,
    message: 'Potential hardcoded secret or API credential detected. Secrets must be injected via environment variables (`process.env.*`).',
    suggestion: () => `const secret = process.env.API_SECRET_KEY;`
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
    filePattern: /\.(ts|tsx|js|jsx|py)$/i,
    pattern: /(\$queryRawUnsafe|query\(|execute\()\s*[`"'].*\$\{.*\}.*[`"']/i,
    message: 'Unsafe dynamic string interpolation detected in raw database query. Always use parameterized queries or tagged template literals to prevent SQL injection.',
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
 * Analyzes a diff or raw file content against architectural guardrails
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

      if (match) {
        currentLineNumber = Number(match[1]) - 1;
      }

      continue;
    }
    // Ignore deleted lines from Git diffs.
    if (line.startsWith('-') && !line.startsWith('---')) {
      continue;
    }

    // Remove the Git diff "+" marker from added lines.
    const cleanLine = line.startsWith('+') ? line.slice(1) : line;
    if (isDiff) {
      currentLineNumber++;
    }
    const trimmed = cleanLine.trim();

    // Detect FastAPI route decorators.
    if (/^@(router|app)\.(get|post|put|delete|patch)\s*\(/i.test(trimmed)) {
      routeDecorator = true;
      continue;
    }

    // The function immediately following the route decorator is the route handler.
    if (
      routeDecorator &&
      /^(async\s+)?def\s+\w+\s*\(/.test(trimmed)
    ) {
      insideRoute = true;
      routeDecorator = false;
      routeIndent = line.search(/\S/);
      continue;
    }

    // Ignore blank lines.
    if (!trimmed) {
      continue;
    }

    const indentation = line.search(/\S/);

    // A new function/class at the same or lower indentation means
    // the previous route has ended.
    if (
      insideRoute &&
      indentation <= routeIndent &&
      /^(async\s+)?(def|class)\s+\w+/.test(trimmed)
    ) {
      insideRoute = false;
    }

    // If we are not inside a FastAPI route, do nothing.
    if (!insideRoute) {
      continue;
    }

    const dbOperation =
      /\b(db|session|connection)\.(query|execute|exec|scalars|add|delete|commit|flush|refresh)\s*\(/i;

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


function analyzeDiff(diffContent, filename) {
  const violations = [];
  if (/\.py$/i.test(filename)) {
    violations.push(...analyzePythonFastAPIRoutes(diffContent, filename));
  }
  const lines = diffContent.split('\n');
  let currentLineNumber = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check additions in git diff or regular lines
    if (line.startsWith('+') || !line.startsWith('-')) {
      currentLineNumber++;
      const cleanLine = line.replace(/^\+/, '');

      for (const rule of ARCHITECTURAL_RULES) {
        if (rule.id === 'RULE-PY-01') {
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
 * Recursively scans all codebase files in a directory (ignoring node_modules, .git, etc.)
 */
function scanDirectory(dir, extensions = ['.ts', '.tsx', '.js', '.jsx', '.py']) {
  const ignoreDirs = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.turbo'];
  let files = [];

  const items = fs.readdirSync(dir);
  for (const item of items) {
    if (ignoreDirs.includes(item)) continue;

    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      files = files.concat(scanDirectory(fullPath, extensions));
    } else if (extensions.some(ext => item.endsWith(ext))) {
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
    comment += `\`\`\`typescript\n// Problematic code:\n${v.codeSnippet}\n\`\`\`\n\n`;
    if (v.suggestion) {
      comment += `> 💡 **Architectural Suggestion:**\n> \`${v.suggestion}\`\n\n`;
    }
  }

  comment += `---\n*Audit enforced by [RepoGuard](https://repoguard.dev) • Protect your codebase from AI code rot.*`;
  return comment;
}

module.exports = {
  analyzeDiff,
  scanDirectory,
  calculateHealthScore,
  formatGitHubComment,
  ARCHITECTURAL_RULES
};
