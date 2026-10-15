const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { analyzeDiff, scanDirectory } = require('../bin/analyzer');

// Synthetic test values only. Split provider signatures from dummy bodies in this file.
const joined = (prefix, body) => prefix + body;

const openAiSnippet = `const apiKey = "${joined('sk-proj-', 'abc123456789012345678')}";`;
assert(analyzeDiff(openAiSnippet, 'src/services/ai.ts').some(v => v.ruleId === 'RULE-SEC-01'));

const anthropicSnippet = `const antKey = "${joined('sk-ant-', 'api03-12345678901234567890')}";`;
assert(analyzeDiff(anthropicSnippet, 'src/services/claude.ts').some(v => v.ruleId === 'RULE-SEC-01'));

const githubSnippet = `const ghToken = "${joined('ghp_', '123456789012345678901234567890123456')}";`;
assert(analyzeDiff(githubSnippet, 'scripts/deploy.js').some(v => v.ruleId === 'RULE-SEC-01'));

const awsSnippet = `export AWS_KEY = "${joined('AKIA', 'IOSFODNN7EXAMPLE')}";`;
assert(analyzeDiff(awsSnippet, 'config/aws.ts').some(v => v.ruleId === 'RULE-SEC-01'));

const stripeSnippet = `const stripe = new Stripe("${joined('sk_live_', '51Abcdefghijklmnopqrstuv')}");`;
assert(analyzeDiff(stripeSnippet, 'src/lib/stripe.ts').some(v => v.ruleId === 'RULE-SEC-01'));

const pemSnippet = `const key = "${joined('-----BEGIN RSA', ' PRIVATE KEY-----')}\\nMIIEowIBAAKCAQEA0...";`;
assert(analyzeDiff(pemSnippet, 'src/auth/jwt.ts').some(v => v.ruleId === 'RULE-SEC-02'));

const safeSnippet = 'const apiKey = process.env.OPENAI_API_KEY;\nconst secret = std::env::var("AWS_SECRET_ACCESS_KEY");';
assert.strictEqual(analyzeDiff(safeSnippet, 'src/services/ai.ts').filter(v => v.category === 'Security').length, 0);

// Embedded credentials in database URLs are secrets too (split in source; only assembled test input is scanned).
const dbUri = `${joined('postgres', '://')}admin:syntheticP4ssword@db.example.test:5432/prod`;
assert(analyzeDiff(`DATABASE_URL=${dbUri}`, 'config/.env.local').some(v => v.ruleId === 'RULE-SEC-01'));
const safeDbUri = 'postgres://db.example.test/prod';
assert.strictEqual(analyzeDiff(safeDbUri, 'config/.env').filter(v => v.ruleId === 'RULE-SEC-01').length, 0);

// The whole-repository audit must actually include .env.*, PEM and TOML files, not just source code.
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repoguard-secrets-'));
try {
  fs.writeFileSync(path.join(tempDir, '.env.local'), `DATABASE_URL=${dbUri}\n`);
  fs.writeFileSync(path.join(tempDir, 'private.pem'), joined('-----BEGIN RSA', ' PRIVATE KEY-----'));
  fs.writeFileSync(path.join(tempDir, 'config.toml'), 'name = "demo"\n');
  const files = scanDirectory(tempDir);
  assert(files.some(f => f.endsWith('.env.local')));
  assert(files.some(f => f.endsWith('.pem')));
  assert(files.some(f => f.endsWith('.toml')));
  const violations = files.flatMap(file => analyzeDiff(fs.readFileSync(file, 'utf8'), file));
  assert(violations.some(v => v.ruleId === 'RULE-SEC-01'));
  assert(violations.some(v => v.ruleId === 'RULE-SEC-02'));
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log('✅ All Secret Leak Engine 2.0 tests passed successfully!');
