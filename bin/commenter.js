/**
 * RepoGuard GitHub PR Commenter Engine
 * Automatically posts & updates rich architectural review comments on Pull Requests
 * Zero-dependency: Uses Node.js native https & child_process
 */

const https = require('https');
const fs = require('fs');
const { execSync } = require('child_process');
const { analyzeDiff, calculateHealthScore } = require('./analyzer');

const COMMENT_MARKER = '<!-- repoguard-pr-audit -->';

function githubApiRequest(method, endpoint, token, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`https://api.github.com${endpoint}`);
    const options = {
      method: method,
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        'User-Agent': 'RepoGuard-GitHub-Action/1.3',
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Formats a high-impact, modern PR review comment in Markdown (CodeRabbit / Sonar style)
 */
function generatePRReviewMarkdown(violations, totalFilesAudited) {
  const { score, grade } = calculateHealthScore(totalFilesAudited, violations);

  const criticals = violations.filter(v => v.severity === 'critical');
  const errors = violations.filter(v => v.severity === 'error');
  const warnings = violations.filter(v => v.severity === 'warning');
  const infos = violations.filter(v => v.severity === 'info');

  const statusBadge = violations.length === 0 
    ? 'https://img.shields.io/badge/Architecture-PASSED%20A%2B-2ea44f?style=flat-square'
    : score >= 75
    ? `https://img.shields.io/badge/Architecture-REVIEW%20NEEDED-yellow?style=flat-square`
    : `https://img.shields.io/badge/Architecture-FAILED%20(${grade})-critical?style=flat-square`;

  let md = `${COMMENT_MARKER}\n`;
  md += `## 🛡️ RepoGuard Architectural Review\n\n`;
  md += `<p align="left">\n`;
  md += `  <a href="https://taylormatematica-beep.github.io/repoguard/"><img src="${statusBadge}" alt="RepoGuard Status"></a>\n`;
  md += `  <a href="https://www.npmjs.com/package/repoguard-rules"><img src="https://img.shields.io/badge/npm-repoguard--rules-00f2fe?style=flat-square" alt="npm"></a>\n`;
  md += `</p>\n\n`;

  // Summary Scorecard
  md += `### 📊 Architectural Scorecard\n\n`;
  md += `| Metric | Result | Target |\n`;
  md += `| :--- | :--- | :--- |\n`;
  md += `| **Health Score** | **${score}/100** (Grade: **${grade}**) | ≥ 85/100 |\n`;
  md += `| **Total Violations** | **${violations.length}** | 0 |\n`;
  md += `| **🚨 Critical Hazards** | \`${criticals.length}\` | 0 |\n`;
  md += `| **❌ Layer Violations** | \`${errors.length}\` | 0 |\n`;
  md += `| **⚠️ Type Safety / Warnings** | \`${warnings.length + infos.length}\` | 0 |\n\n`;

  if (violations.length === 0) {
    md += `### ✅ Clean Architecture Confirmed!\n`;
    md += `No layer breaches, hardcoded secrets, or AI drift patterns detected in this pull request diff. Ready to merge!\n\n`;
  } else {
    md += `### ⚠️ Detected Architectural Drift\n\n`;
    md += `Review and resolve the following guardrail items before merging:\n\n`;

    // Group by file
    const byFile = {};
    for (const v of violations) {
      if (!byFile[v.filename]) byFile[v.filename] = [];
      byFile[v.filename].push(v);
    }

    for (const [filename, fileViolations] of Object.entries(byFile)) {
      md += `<details open>\n`;
      md += `<summary>📁 <strong><code>${filename}</code></strong> (${fileViolations.length} issue${fileViolations.length > 1 ? 's' : ''})</summary>\n\n`;

      for (const v of fileViolations) {
        const icon = v.severity === 'critical' ? '🚨' : v.severity === 'error' ? '❌' : v.severity === 'warning' ? '⚠️' : 'ℹ️';
        md += `#### ${icon} [${v.ruleId}] ${v.ruleName} (Line ${v.lineNumber})\n`;
        md += `> **Rule:** ${v.message}\n\n`;
        md += `\`\`\`typescript\n// Flagged code:\n${v.codeSnippet}\n\`\`\`\n\n`;

        if (v.suggestion) {
          md += `> 💡 **Recommended Fix:**\n`;
          md += `> \`\`\`typescript\n> ${v.suggestion}\n> \`\`\`\n\n`;
        }
      }
      md += `</details>\n\n`;
    }
  }

  md += `---\n`;
  md += `<details>\n<summary>🛡️ About RepoGuard & How to fix locally</summary>\n\n`;
  md += `You can test and auto-fix rules locally before pushing:\n`;
  md += `\`\`\`bash\n# Check your uncommitted diff\nnpx repoguard-rules check\n\n# Audit full project score\nnpx repoguard-rules audit\n\`\`\`\n`;
  md += `[Documentation & Rules](https://taylormatematica-beep.github.io/repoguard/) • [NPM Package](https://www.npmjs.com/package/repoguard-rules) • *Stop AI from turning code into spaghetti.*\n`;
  md += `</details>\n`;

  return md;
}

/**
 * Executes PR Review in GitHub Actions CI
 */
async function runGitHubActionPRReview() {
  const token = process.env.INPUT_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  const isStrictMode = (process.env.INPUT_STRICT_MODE || 'true').toLowerCase() === 'true';

  if (!token) {
    console.log('⚠️ No GITHUB_TOKEN supplied. Running offline audit without PR comment.');
    return;
  }

  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !fs.existsSync(eventPath)) {
    console.log('⚠️ Not running in a GitHub PR context (GITHUB_EVENT_PATH not found).');
    return;
  }

  let eventData;
  try {
    eventData = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  } catch (e) {
    console.error('Failed to parse GITHUB_EVENT_PATH JSON:', e.message);
    return;
  }

  const pr = eventData.pull_request;
  if (!pr) {
    console.log('Event is not a Pull Request. Skipping PR comment.');
    return;
  }

  const repoFullName = eventData.repository ? eventData.repository.full_name : process.env.GITHUB_REPOSITORY;
  const prNumber = pr.number;

  console.log(`🔍 Auditing PR #${prNumber} on ${repoFullName}...`);

  // Obtain PR diff
  let diffOutput = '';
  try {
    // Attempt git diff against base branch
    const baseRef = pr.base && pr.base.ref ? `origin/${pr.base.ref}` : 'HEAD~1';
    diffOutput = execSync(`git diff ${baseRef}...HEAD`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  } catch (e) {
    try {
      diffOutput = execSync('git diff HEAD~1', { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    } catch (err) {
      console.log('Could not get git diff via CLI, falling back to full file audit.');
    }
  }

  let violations = [];
  let auditedFilesCount = 0;

  if (diffOutput) {
    const fileDiffs = diffOutput.split('diff --git ');
    for (const fileDiff of fileDiffs) {
      if (!fileDiff.trim()) continue;
      const match = fileDiff.match(/b\/(.+?)\n/);
      const filename = match ? match[1] : 'unknown';
      auditedFilesCount++;
      violations = violations.concat(analyzeDiff(fileDiff, filename));
    }
  } else {
    // Fallback: scan workspace
    const { scanDirectory } = require('./analyzer');
    const files = scanDirectory(process.cwd());
    auditedFilesCount = files.length;
    for (const f of files) {
      try {
        const c = fs.readFileSync(f, 'utf8');
        violations = violations.concat(analyzeDiff(c, f));
      } catch (e) {}
    }
  }

  console.log(`📊 Found ${violations.length} violation(s) across ${auditedFilesCount} files.`);

  // Generate markdown comment
  const commentBody = generatePRReviewMarkdown(violations, auditedFilesCount);

  // Check for existing comments on PR to avoid spamming
  try {
    const listComments = await githubApiRequest('GET', `/repos/${repoFullName}/issues/${prNumber}/comments`, token);
    let existingCommentId = null;

    if (Array.isArray(listComments.data)) {
      const match = listComments.data.find(c => c.body && c.body.includes(COMMENT_MARKER));
      if (match) existingCommentId = match.id;
    }

    if (existingCommentId) {
      console.log(`📝 Updating existing RepoGuard comment #${existingCommentId}...`);
      await githubApiRequest('PATCH', `/repos/${repoFullName}/issues/comments/${existingCommentId}`, token, { body: commentBody });
      console.log('✅ PR comment updated successfully!');
    } else {
      console.log('💬 Posting new RepoGuard review comment on PR...');
      await githubApiRequest('POST', `/repos/${repoFullName}/issues/${prNumber}/comments`, token, { body: commentBody });
      console.log('✅ PR comment posted successfully!');
    }
  } catch (err) {
    console.error('Failed to communicate with GitHub API:', err.message);
  }

  // Strict mode: Fail CI if critical or error violations exist
  const blockingViolations = violations.filter(v => v.severity === 'critical' || v.severity === 'error');
  if (isStrictMode && blockingViolations.length > 0) {
    console.error(`\n❌ [RepoGuard Strict Mode] PR failed with ${blockingViolations.length} blocking architectural violation(s).`);
    process.exit(1);
  } else {
    console.log('\n✨ RepoGuard PR review passed.');
  }
}

module.exports = {
  generatePRReviewMarkdown,
  runGitHubActionPRReview
};
