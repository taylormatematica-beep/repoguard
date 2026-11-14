const assert = require('assert');
const fs = require('fs');
const path = require('path');

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
assert.strictEqual(unwrapViolations[0].codeSnippet, '[source excerpt withheld to avoid exposing credentials]', 'Analyzer must withhold source excerpts');
assert(unwrapViolations[0].message.includes('.unwrap()'), 'RULE-RS-01 still explains the detected problem');

// Test 2: bad_axum_handler.rs (Direct sqlx::query! inside route handler)
const axumViolations = analyzeFixture('bad_axum_handler.rs').filter(v => v.ruleId === 'RULE-RS-02');
assert.strictEqual(axumViolations.length, 1, 'bad_axum_handler.rs should trigger exactly 1 RULE-RS-02 violation');
assert.strictEqual(axumViolations[0].severity, 'warning', 'RULE-RS-02 should be a warning');
assert.strictEqual(axumViolations[0].codeSnippet, '[source excerpt withheld to avoid exposing credentials]', 'Analyzer must withhold source excerpts');
assert(axumViolations[0].message.includes('database/ORM'), 'RULE-RS-02 still explains the database risk');

// Test 3: good_handler.rs (Clean Architecture delegating to service)
const goodHandlerViolations = analyzeFixture('good_handler.rs').filter(v => v.ruleId.startsWith('RULE-RS'));
assert.strictEqual(goodHandlerViolations.length, 0, 'good_handler.rs should have zero Rust violations');

// Test 4: good_test.rs (.unwrap() inside test block #[cfg(test)])
const goodTestViolations = analyzeFixture('good_test.rs').filter(v => v.ruleId === 'RULE-RS-01');
assert.strictEqual(goodTestViolations.length, 0, 'good_test.rs should NOT flag .unwrap() inside tests');

const windowsTestPath = analyzeDiff('let value = Some(1).unwrap();', 'tests\\good_test.rs');
assert.strictEqual(windowsTestPath.filter(v => v.ruleId === 'RULE-RS-01').length, 0,
  'Windows test paths should not trigger production-only Rust rules');

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

console.log('✅ All Rust Clean Architecture & Panic Safety rule tests passed successfully!');
