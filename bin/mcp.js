const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { scanDirectory, analyzeDiff, calculateHealthScore, ARCHITECTURAL_RULES } = require('./analyzer');

/**
 * RepoGuard Model Context Protocol (MCP) Server v1.7.0
 * Implements Tools, Resources, and Prompts for Claude Desktop, Cursor, and Glama runners.
 */
function startMCPServer() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  function sendResponse(id, result, error) {
    const res = { jsonrpc: '2.0', id };
    if (error) res.error = error;
    else res.result = result;
    process.stdout.write(JSON.stringify(res) + '\n');
  }

  rl.on('line', (line) => {
    if (!line.trim()) return;
    try {
      const msg = JSON.parse(line);
      const { id, method, params } = msg;

      // 1. MCP Lifecycle
      if (method === 'initialize') {
        sendResponse(id, {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
            resources: {},
            prompts: {}
          },
          serverInfo: {
            name: 'repoguard-mcp',
            version: '1.7.0'
          }
        });
      } else if (method === 'notifications/initialized') {
        // Notification, no reply expected
      } else if (method === 'ping') {
        sendResponse(id, {});
      }

      // 2. MCP Tools
      else if (method === 'tools/list') {
        sendResponse(id, {
          tools: [
            {
              name: 'repoguard_audit',
              description: 'Audits a repository or directory against 16 Clean Architecture & Security guardrails (TypeScript, Python, Golang, Rust, Secrets 2.0) in ~12ms',
              inputSchema: {
                type: 'object',
                properties: {
                  directory: { type: 'string', description: 'Directory path to audit (defaults to current working directory)' }
                }
              }
            },
            {
              name: 'repoguard_diff',
              description: 'Audits uncommitted git changes in real-time to detect architectural drift before commit',
              inputSchema: { type: 'object', properties: {} }
            },
            {
              name: 'repoguard_get_rules',
              description: 'Returns all 16 active architectural rules to prevent AI hallucination of invalid layering patterns',
              inputSchema: { type: 'object', properties: {} }
            },
            {
              name: 'repoguard_fix',
              description: 'Analyzes a code snippet and returns actionable clean architecture refactoring suggestions',
              inputSchema: {
                type: 'object',
                properties: {
                  code: { type: 'string', description: 'Source code content to inspect' },
                  filename: { type: 'string', description: 'Filename (e.g. src/controllers/user.controller.ts, src/routes/user.rs)' }
                },
                required: ['code', 'filename']
              }
            }
          ]
        });
      } else if (method === 'tools/call') {
        const { name, arguments: args = {} } = params || {};

        if (name === 'repoguard_get_rules') {
          const rulesText = ARCHITECTURAL_RULES.map(r => `[${r.id}] (${r.severity}) [${r.category}] ${r.name}:\n  ${r.message}`).join('\n\n');
          sendResponse(id, {
            content: [{ type: 'text', text: `RepoGuard v1.7.0 Architectural Rules (${ARCHITECTURAL_RULES.length} active):\n\n${rulesText}` }]
          });
        } else if (name === 'repoguard_audit') {
          const dir = args.directory || process.cwd();
          const files = scanDirectory(dir);
          let allViolations = [];
          for (const file of files) {
            try {
              const content = fs.readFileSync(file, 'utf8');
              const rel = path.relative(dir, file);
              allViolations = allViolations.concat(analyzeDiff(content, rel));
            } catch (_) {}
          }
          const { score, grade } = calculateHealthScore(files.length, allViolations);
          const summary = `RepoGuard Audit Complete:\nHealth Score: ${score}/100 (Grade: ${grade})\nAudited Files: ${files.length}\nTotal Violations: ${allViolations.length}\n\n` +
            (allViolations.length === 0
              ? '✨ Flawless architecture! Zero drift detected across all files.'
              : allViolations.map(v => `- [${v.ruleId}] ${v.filename}:${v.lineNumber} - ${v.message}\n  Fix: ${v.suggestion || 'Refactor to clean architecture'}`).join('\n'));
          sendResponse(id, { content: [{ type: 'text', text: summary }] });
        } else if (name === 'repoguard_diff') {
          try {
            const gitDiff = execSync('git diff HEAD', { encoding: 'utf8' });
            if (!gitDiff.trim()) {
              sendResponse(id, { content: [{ type: 'text', text: '✨ Working tree is clean. Zero uncommitted changes.' }] });
              return;
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
              sendResponse(id, { content: [{ type: 'text', text: '✨ Git diff is architecturally clean! Safe to commit.' }] });
            } else {
              const diffReport = `⚠️ Found ${violations.length} architectural issue(s) in uncommitted changes:\n\n` +
                violations.map(v => `- [${v.ruleId}] ${v.filename}:${v.lineNumber} -> ${v.message}\n  Suggested Fix: ${v.suggestion || 'Move to service layer'}`).join('\n');
              sendResponse(id, { content: [{ type: 'text', text: diffReport }] });
            }
          } catch (err) {
            sendResponse(id, { content: [{ type: 'text', text: `Git diff failed: ${err.message}` }] });
          }
        } else if (name === 'repoguard_fix') {
          const { code, filename } = args;
          const violations = analyzeDiff(code, filename);
          if (violations.length === 0) {
            sendResponse(id, { content: [{ type: 'text', text: '✨ Flawless architecture! Zero violations found in this snippet.' }] });
          } else {
            const report = `Found ${violations.length} architectural item(s) to refactor in ${filename}:\n\n` +
              violations.map(v => `❌ Line ${v.lineNumber} [${v.ruleId}]: ${v.message}\n💡 Suggested Fix: ${v.suggestion || 'Move into service layer'}`).join('\n\n');
            sendResponse(id, { content: [{ type: 'text', text: report }] });
          }
        } else {
          sendResponse(id, null, { code: -32601, message: `Tool not found: ${name}` });
        }
      }

      // 3. MCP Resources (Standardized in MCP spec)
      else if (method === 'resources/list') {
        sendResponse(id, {
          resources: [
            {
              uri: 'repoguard://rules',
              name: 'RepoGuard Architectural Guardrails',
              description: 'Complete catalog of all 16 active Clean Architecture and Security rules (TypeScript, Python, Go, Rust, Secrets 2.0)',
              mimeType: 'application/json'
            },
            {
              uri: 'repoguard://health',
              name: 'Codebase Architectural Health Report',
              description: 'Live codebase health score (0-100), letter grade (A+ to F), and violation breakdown',
              mimeType: 'application/json'
            }
          ]
        });
      } else if (method === 'resources/read') {
        const { uri } = params || {};
        if (uri === 'repoguard://rules') {
          sendResponse(id, {
            contents: [
              {
                uri: 'repoguard://rules',
                mimeType: 'application/json',
                text: JSON.stringify(ARCHITECTURAL_RULES, null, 2)
              }
            ]
          });
        } else if (uri === 'repoguard://health') {
          const dir = process.cwd();
          const files = scanDirectory(dir);
          let allViolations = [];
          for (const file of files) {
            try {
              const content = fs.readFileSync(file, 'utf8');
              const rel = path.relative(dir, file);
              allViolations = allViolations.concat(analyzeDiff(content, rel));
            } catch (_) {}
          }
          const { score, grade } = calculateHealthScore(files.length, allViolations);
          sendResponse(id, {
            contents: [
              {
                uri: 'repoguard://health',
                mimeType: 'application/json',
                text: JSON.stringify({
                  healthScore: score,
                  grade,
                  totalFiles: files.length,
                  totalViolations: allViolations.length,
                  violations: allViolations
                }, null, 2)
              }
            ]
          });
        } else {
          sendResponse(id, null, { code: -32602, message: `Resource not found: ${uri}` });
        }
      }

      // 4. MCP Prompts (Standardized in MCP spec)
      else if (method === 'prompts/list') {
        sendResponse(id, {
          prompts: [
            {
              name: 'architectural_review',
              description: 'Review code or pull request diff against Clean Architecture, Rust panic safety, and Secret prevention guardrails',
              arguments: [
                {
                  name: 'diff',
                  description: 'Git diff or code patch to review',
                  required: false
                }
              ]
            },
            {
              name: 'clean_architecture_refactor',
              description: 'Refactor a controller, route handler, or component with direct DB queries into decoupled Service and Repository layers',
              arguments: [
                {
                  name: 'code',
                  description: 'Code snippet to refactor',
                  required: true
                },
                {
                  name: 'language',
                  description: 'Programming language (typescript, python, go, rust)',
                  required: false
                }
              ]
            }
          ]
        });
      } else if (method === 'prompts/get') {
        const { name, arguments: promptArgs = {} } = params || {};
        if (name === 'architectural_review') {
          const diffText = promptArgs.diff ? `\n\nCode to review:\n\`\`\`\n${promptArgs.diff}\n\`\`\`` : '';
          sendResponse(id, {
            description: 'Enforce Clean Architecture and prevent AI code rot',
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `Please review the following code changes against RepoGuard's 16 Architectural Guardrails.
Enforce strict layer separation:
1. Controllers & Route Handlers must NEVER execute direct database/ORM queries.
2. In Go, never silence errors with '_ = err'.
3. In Rust, never use '.unwrap()' or '.expect()' in production logic — use '?' operator or handle explicitly.
4. Never hardcode live API secrets, private keys, or credentials.
${diffText}`
                }
              }
            ]
          });
        } else if (name === 'clean_architecture_refactor') {
          const codeSnippet = promptArgs.code || '';
          const lang = promptArgs.language || 'code';
          sendResponse(id, {
            description: 'Refactor direct DB queries into decoupled Service and Repository layers',
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `Please refactor the following ${lang} code to follow Clean Architecture principles.
Extract all direct database/ORM operations out of the controller/handler into a dedicated service and repository layer.
Provide clean, idiomatic code with explicit error handling and strong typing.

Code:
\`\`\`${lang}
${codeSnippet}
\`\`\``
                }
              }
            ]
          });
        } else {
          sendResponse(id, null, { code: -32602, message: `Prompt not found: ${name}` });
        }
      }

      // Method not handled
      else {
        sendResponse(id, null, { code: -32601, message: `Method not found: ${method}` });
      }
    } catch (e) {
      // JSON parse error or unhandled
    }
  });
}

module.exports = { startMCPServer };

if (require.main === module) {
  startMCPServer();
}
