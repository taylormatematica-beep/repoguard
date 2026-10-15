const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { analyzeDiff } = require('../bin/analyzer');

const fixturesDir = path.join(__dirname, 'fixtures', 'rust');

function analyzeFixture(filename) {
  const filePath = path.join(fixturesDir, filename);
  const content = fs.readFileSync(filePath, 'utf8');
  return analyzeDiff(content, `test/fixtures/rust/${filename}`);
}

// Test 1: bad_unwrap.rs (.unwrap() and .expect() in production logic)
const unwrapViolations = analyzeFixture('bad_unwrap.rs').filter(v => v.ruleId === 'RULE-RS-01');
assert.strictEqual(unwrapViolations.length, 2, 'bad_unwrap.rs should trigger exactly 2 RULE-RS-01 violations (.unwrap and .expect)');
assert.strictEqual(unwrapViolations[0].severity, 'warning', 'RULE-RS-01 should be a warning');
assert(unwrapViolations[0].codeSnippet.includes('.unwrap()'), 'Should highlight .unwrap() call');

// Test 2: bad_axum_handler.rs (Direct sqlx::query! inside route handler)
const axumViolations = analyzeFixture('bad_axum_handler.rs').filter(v => v.ruleId === 'RULE-RS-02');
assert.strictEqual(axumViolations.length, 1, 'bad_axum_handler.rs should trigger exactly 1 RULE-RS-02 violation');
assert.strictEqual(axumViolations[0].severity, 'warning', 'RULE-RS-02 should be a warning');
assert(axumViolations[0].codeSnippet.includes('sqlx::query!'), 'Should highlight direct sqlx query');

// Test 3: good_handler.rs (Clean Architecture delegating to service)
const goodHandlerViolations = analyzeFixture('good_handler.rs').filter(v => v.ruleId.startsWith('RULE-RS'));
assert.strictEqual(goodHandlerViolations.length, 0, 'good_handler.rs should have zero Rust violations');

// Test 4: good_test.rs (.unwrap() inside test block #[cfg(test)])
const goodTestViolations = analyzeFixture('good_test.rs').filter(v => v.ruleId === 'RULE-RS-01');
assert.strictEqual(goodTestViolations.length, 0, 'good_test.rs should NOT flag .unwrap() inside tests');

// Test 5: Git diff detection for Rust
const rustDiff = `
diff --git a/src/api/routes.rs b/src/api/routes.rs
--- a/src/api/routes.rs
+++ b/src/api/routes.rs
@@ -10,3 +10,4 @@
 pub async fn handle_webhook(State(pool): State<PgPool>) -> StatusCode {
+    let _ = sqlx::query!("INSERT INTO events VALUES (1)").execute(&pool).await.unwrap();
     StatusCode::OK
 }
`;
const diffViolations = analyzeDiff(rustDiff, 'src/api/routes.rs');
const rs01Diff = diffViolations.filter(v => v.ruleId === 'RULE-RS-01');
const rs02Diff = diffViolations.filter(v => v.ruleId === 'RULE-RS-02');
assert(rs01Diff.length >= 1, 'Git diff should detect .unwrap() on line added');
assert(rs02Diff.length >= 1, 'Git diff should detect sqlx::query! in handler on line added');

// Test 6: Cargo project initialization generates Rust-specific guidance in all AI context files.
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repoguard-rust-init-'));
try {
  fs.writeFileSync(path.join(tempDir, 'Cargo.toml'), '[package]\nname = "demo"\nversion = "0.1.0"\n[dependencies]\naxum = "0.7"\nsqlx = "0.7"\n');
  const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'repoguard.js'), 'init'], {
    cwd: tempDir,
    encoding: 'utf8'
  });
  assert.strictEqual(result.status, 0, result.stderr || 'Rust init should succeed');
  assert(result.stdout.includes('Language:') && result.stdout.includes('Rust'));
  for (const file of ['.cursorrules', 'CLAUDE.md', '.windsurfrules']) {
    const content = fs.readFileSync(path.join(tempDir, file), 'utf8');
    assert(content.includes('RULE-RS-01'), `${file} should explain Rust panic safety`);
    assert(content.includes('RULE-RS-02'), `${file} should explain Rust layer separation`);
  }
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log('✅ All Rust Clean Architecture & Panic Safety rule tests passed successfully!');
