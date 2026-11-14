'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  analyzeDiff,
  formatGitHubComment,
  formatJSON,
  formatSARIF,
  publicFinding
} = require('../bin/analyzer');
const { generatePRReviewMarkdown, runGitHubActionPRReview } = require('../bin/commenter');
const https = require('https');
const { EventEmitter } = require('events');

// Assemble synthetic test values at runtime; never put a working credential here.
const synthetic = ['SYNTHETIC', '01234567890123456789'].join('');
const provider = ['sk-proj-', 'abcdefghijklmnopqrstuvwx'].join('');
const dbUri = `postgres://demo:${synthetic}@db.example.test:5432/test`;
const header = ['-----BEGIN RSA', ' PRIVATE KEY-----'].join('');
const omitted = '[source excerpt withheld to avoid exposing credentials]';
const cli = path.resolve(__dirname, '../bin/repoguard.js');
const mcp = path.resolve(__dirname, '../bin/mcp.js');

function assertNoValue(value, output, context) {
  assert(!output.includes(value), `${context} repeated a synthetic sensitive value`);
}

const cases = [
  { filename: 'src/services/logger.ts', code: `const api_key = "${synthetic}"; console.log(api_key);`, value: synthetic, rules: ['RULE-02', 'RULE-04'] },
  { filename: 'src/services/provider.ts', code: `const token = "${provider}";`, value: provider, rules: ['RULE-SEC-01'] },
  { filename: 'config/.env.local', code: `DATABASE_URL=${dbUri}`, value: synthetic, rules: ['RULE-SEC-01'] },
  { filename: 'private.pem', code: `${header}\nSYNTHETIC-KEY-BODY`, value: header, rules: ['RULE-SEC-02'] },
  { filename: 'src/app/config.ts', code: `const NEXT_PUBLIC_API_SECRET = "${synthetic}";`, value: synthetic, rules: ['RULE-09'] },
  { filename: 'src/routes/service.rs', code: `let value = Some(1).unwrap(); let password = "${synthetic}";`, value: synthetic, rules: ['RULE-RS-01', 'RULE-02'] }
];
for (const { filename, code, value, rules } of cases) {
  const findings = analyzeDiff(code, filename);
  for (const rule of rules) assert(findings.some(v => v.ruleId === rule), `${filename} should detect ${rule}`);
  assertNoValue(value, JSON.stringify(findings), 'analyzer findings');
  for (const v of findings) {
    assert.strictEqual(v.filename, filename);
    assert(v.lineNumber >= 1);
    assert.strictEqual(v.codeSnippet, omitted);
  }
  assertNoValue(value, formatJSON(findings, { score: 75, grade: 'C' }, 1), 'JSON');
  assertNoValue(value, formatSARIF(findings), 'SARIF');
  assertNoValue(value, formatGitHubComment(findings), 'GitHub comment');
  assertNoValue(value, generatePRReviewMarkdown(findings, 1), 'PR review comment');
}

// Direct formatter callers may supply raw findings, including an unrelated
// architecture violation on a line containing a credential. No source copies.
const hiddenName = analyzeDiff(`console.log("check"); const NEXT_PUBLIC_SECRET_KEY = "${synthetic}";`, 'src/services/log.ts');
assert(hiddenName.some(v => v.ruleId === 'RULE-04'));
assertNoValue(synthetic, JSON.stringify(hiddenName), 'same-line fallback redaction');

const externalFinding = {
  ruleId: 'RULE-01', ruleName: 'Architecture', severity: 'error', category: 'Architecture',
  filename: 'src/controllers/user.controller.ts', lineNumber: 42,
  codeSnippet: `db.query("SELECT 1"); const password = "${synthetic}";`,
  message: 'Direct database access in controller.', suggestion: 'Move the query into a service.'
};
assert.strictEqual(publicFinding(externalFinding).codeSnippet, omitted);
assert.strictEqual(publicFinding(analyzeDiff(`const api_key = "${synthetic}";`, 'src/services/key.ts')[0]).suggestion,
  'const secret = process.env.API_SECRET_KEY;', 'safe env-variable suggestions must remain');
const unknownSecret = 'opaque-credential:' + synthetic;
const otherwiseCleanFinding = analyzeDiff(`console.log("${unknownSecret}");`, 'src/services/trace.ts');
assert(otherwiseCleanFinding.some(v => v.ruleId === 'RULE-04'));
assert(otherwiseCleanFinding.every(v => v.codeSnippet === omitted), 'all raw analyzer findings withhold source');
assertNoValue(unknownSecret, JSON.stringify(otherwiseCleanFinding), 'non-rule credential in analyzer findings');
assertNoValue(synthetic, formatJSON([externalFinding], { score: 90, grade: 'B' }, 1), 'manual JSON');
assertNoValue(synthetic, formatSARIF([externalFinding]), 'manual SARIF');
assertNoValue(synthetic, formatSARIF([{ ...externalFinding, message: `const api_key = "${synthetic}";` }]), 'manual SARIF message');
assertNoValue(synthetic, formatGitHubComment([externalFinding]), 'manual GitHub comment');
assertNoValue(synthetic, generatePRReviewMarkdown([externalFinding], 1), 'manual PR comment');
const externalSuggestion = { ...externalFinding, suggestion: `const password = "${synthetic}";` };
const extraRaw = { ...externalFinding, extraSource: synthetic, filename: `src/${provider}/file.ts` };
for (const [name, text] of [
  ['JSON extra', formatJSON([extraRaw], { score: 90, grade: 'B' }, 1)],
  ['PR path', generatePRReviewMarkdown([extraRaw], 1)],
  ['SARIF path', formatSARIF([extraRaw])],
  ['GitHub path', formatGitHubComment([extraRaw])]
]) assertNoValue(provider, text, name);
assertNoValue(synthetic, formatJSON([extraRaw], { score: 90, grade: 'B' }, 1), 'JSON extra field');
for (const [name, text] of [
  ['JSON suggestion', formatJSON([externalSuggestion], { score: 90, grade: 'B' }, 1)],
  ['PR suggestion', generatePRReviewMarkdown([externalSuggestion], 1)],
  ['GitHub suggestion', formatGitHubComment([externalSuggestion])]
]) assertNoValue(synthetic, text, name);

const parsed = JSON.parse(formatJSON([externalFinding], { score: 90, grade: 'B' }, 1));
assert.strictEqual(parsed.violations[0].codeSnippet, omitted);
assert.strictEqual(parsed.violations[0].filename, externalFinding.filename);
assert(!Object.prototype.hasOwnProperty.call(JSON.parse(formatJSON([extraRaw], { score: 90, grade: 'B' }, 1)).violations[0], 'extraSource'));
assert.strictEqual(parsed.violations[0].lineNumber, 42);
assert.strictEqual(parsed.violationsCount, 1);
assert.strictEqual(parsed.healthScore, 90);
assert.strictEqual(externalFinding.codeSnippet.includes(synthetic), true, 'formatters must not mutate caller objects');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repoguard-redaction-'));
const run = (binary, args, input) => spawnSync(process.execPath, [binary, ...args], {
  cwd: root, input, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024
});
const git = args => {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.strictEqual(result.status, 0, 'temporary git fixture setup failed');
};
try {
  fs.mkdirSync(path.join(root, 'src', 'services'), { recursive: true });
  const target = path.join(root, 'src', 'services', 'logger.ts');
  fs.writeFileSync(target, `const api_key = "${synthetic}"; console.log(api_key);\n`);
  for (const args of [
    ['audit'], ['audit', '--format=json'], ['audit', '--format=sarif'], ['fix']
  ]) {
    const result = run(cli, args);
    assert.strictEqual(result.status, 0, `${args.join(' ')} failed`);
    assertNoValue(synthetic, result.stdout + result.stderr, `CLI ${args.join(' ')}`);
    assert(result.stdout.includes('RULE-02'), `${args.join(' ')} must retain the finding`);
  }
  const preview = run(cli, ['review']);
  assert.strictEqual(preview.status, 0);
  assertNoValue('9823478912389124abcdefgh', preview.stdout + preview.stderr, 'CLI review');
  const audit = JSON.parse(run(cli, ['audit', '--format=json']).stdout);
  assert(audit.violations.some(v => v.ruleId === 'RULE-04'));
  for (const v of audit.violations) assert.strictEqual(v.codeSnippet, omitted);

  const requests = [
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'repoguard_audit', arguments: { directory: root } } },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'repoguard_fix', arguments: { code: `const api_key = "${synthetic}";`, filename: 'src/services/ai.ts' } } },
    { jsonrpc: '2.0', id: 3, method: 'resources/read', params: { uri: 'repoguard://health' } },
    { jsonrpc: '2.0', id: 4, method: 'prompts/get', params: { name: 'architectural_review', arguments: { diff: `+const api_key = "${synthetic}";` } } },
    { jsonrpc: '2.0', id: 5, method: 'prompts/get', params: { name: 'clean_architecture_refactor', arguments: { code: `const api_key = "${synthetic}";`, language: provider } } }
  ];
  const protocol = run(mcp, [], requests.map(x => JSON.stringify(x)).join('\n') + '\n');
  assert.strictEqual(protocol.status, 0, 'MCP test process failed');
  assertNoValue(synthetic, protocol.stdout + protocol.stderr, 'MCP output');
  assertNoValue(provider, protocol.stdout + protocol.stderr, 'MCP language output');
  const responses = protocol.stdout.trim().split('\n').map(x => JSON.parse(x));
  assert.strictEqual(responses.length, requests.length);
  const health = JSON.parse(responses.find(x => x.id === 3).result.contents[0].text);
  assert(health.violations.some(v => v.ruleId === 'RULE-02'));
  for (const v of health.violations) assert.strictEqual(v.codeSnippet, omitted);
  assert(responses.find(x => x.id === 4).result.messages[0].content.text.includes('source omitted'));
  assert(responses.find(x => x.id === 5).result.messages[0].content.text.includes('source omitted'));

  // Diff is read from a disposable git repository, not the RepoGuard branch.
  fs.unlinkSync(target);
  git(['init', '-q']);
  fs.writeFileSync(target, 'const safe = true;\n');
  git(['add', 'src/services/logger.ts']);
  git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-q', '-m', 'fixture']);
  fs.appendFileSync(target, `const api_key = "${synthetic}";\n`);
  const diff = run(cli, ['diff']);
  assert.strictEqual(diff.status, 1, 'critical finding must still block diff');
  assertNoValue(synthetic, diff.stdout + diff.stderr, 'CLI diff');
  assert(diff.stdout.includes('RULE-02'));
  const diffRequest = { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'repoguard_diff', arguments: {} } };
  const mcpDiff = run(mcp, [], JSON.stringify(diffRequest) + '\n');
  assert.strictEqual(mcpDiff.status, 0);
  assertNoValue(synthetic, mcpDiff.stdout + mcpDiff.stderr, 'MCP diff');
  assert(JSON.parse(mcpDiff.stdout.trim()).result.content[0].text.includes('RULE-02'));

} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

// Exercise the actual Action POST path without a GitHub connection. The mock
// must receive safe markdown; source input is a disposable, local PR diff.
(async () => {
  const actionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'repoguard-pr-redaction-'));
  const savedCwd = process.cwd();
  const savedEnv = Object.fromEntries(['GITHUB_TOKEN', 'INPUT_STRICT_MODE', 'GITHUB_EVENT_PATH']
    .map(key => [key, process.env[key]]));
  const realRequest = https.request;
  const realLog = console.log;
  const requestBodies = [];
  const logs = [];
  try {
    const actionGit = (...args) => {
      const result = spawnSync('git', args, { cwd: actionRoot, encoding: 'utf8' });
      assert.strictEqual(result.status, 0, result.stderr || 'fixture git command failed');
    };
    actionGit('init', '-q');
    fs.mkdirSync(path.join(actionRoot, 'src', 'services'), { recursive: true });
    const file = path.join(actionRoot, 'src', 'services', 'token.ts');
    fs.writeFileSync(file, 'const safe = true;\n');
    actionGit('add', '.');
    actionGit('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-q', '-m', 'base');
    actionGit('update-ref', 'refs/remotes/origin/main', 'HEAD');
    fs.appendFileSync(file, `const api_key = "${synthetic}";\n`);
    actionGit('add', '.');
    actionGit('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-q', '-m', 'review');
    const event = path.join(actionRoot, 'event.json');
    fs.writeFileSync(event, JSON.stringify({
      repository: { full_name: 'example/fixture' },
      pull_request: { number: 42, base: { ref: 'main' } }
    }));
    process.chdir(actionRoot);
    process.env.GITHUB_TOKEN = 'FIXTURE-ONLY-NOT-A-TOKEN';
    process.env.INPUT_STRICT_MODE = 'false';
    process.env.GITHUB_EVENT_PATH = event;
    console.log = (...args) => logs.push(args.join(' '));
    https.request = (options, onResponse) => {
      let body = '';
      const req = new EventEmitter();
      req.write = chunk => { body += chunk; };
      req.end = () => {
        requestBodies.push({ method: options.method, path: options.path, body });
        process.nextTick(() => {
          const res = new EventEmitter();
          res.statusCode = 200;
          onResponse(res);
          res.emit('data', options.method === 'GET' ? '[]' : '{}');
          res.emit('end');
        });
      };
      return req;
    };
    await runGitHubActionPRReview();
    const post = requestBodies.find(request => request.method === 'POST');
    assert(post, 'Action must actually prepare a PR comment');
    assert.strictEqual(post.path, '/repos/example/fixture/issues/42/comments');
    assertNoValue(synthetic, post.body, 'actual Action POST body');
    assertNoValue(synthetic, logs.join('\n'), 'Action logs');
    assert(JSON.parse(post.body).body.includes('RULE-02'), 'Action keeps the detected security finding');
  } finally {
    https.request = realRequest;
    console.log = realLog;
    process.chdir(savedCwd);
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(actionRoot, { recursive: true, force: true });
  }
  console.log('Sensitive diagnostic output redaction tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
