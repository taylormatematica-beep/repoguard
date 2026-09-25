const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { analyzeDiff } = require('../bin/analyzer');

const fixturesDir = path.join(__dirname, 'fixtures', 'python-fastapi');

function analyzeFixture(filename) {
  const filePath = path.join(fixturesDir, filename);
  const content = fs.readFileSync(filePath, 'utf8');

  return analyzeDiff(content, `test/fixtures/python-fastapi/${filename}`);
}

function getPythonViolations(filename) {
  return analyzeFixture(filename).filter(
    violation => violation.ruleId === 'RULE-PY-01'
  );
}

const badRouterViolations = getPythonViolations('bad_router.py');

assert.strictEqual(
  badRouterViolations.length,
  1,
  'bad_router.py should have exactly 1 violation'
);

const badCommitViolations = getPythonViolations('bad_commit_router.py');

assert.strictEqual(
  badCommitViolations.length,
  2,
  'bad_commit_router.py should have exactly 2 violations'
);

assert.ok(
  badCommitViolations.some(v => v.severity === 'critical'),
  'db.commit() should be reported as critical'
);

const badSqlModelViolations = getPythonViolations(
  'bad_sqlmodel_router.py'
);

assert.strictEqual(
  badSqlModelViolations.length,
  1,
  'bad_sqlmodel_router.py should have exactly 1 violation'
);

const goodRouterViolations = getPythonViolations('good_router.py');

assert.strictEqual(
  goodRouterViolations.length,
  0,
  'good_router.py should have no violations'
);

const goodRepositoryViolations =
  getPythonViolations('good_repository.py');

assert.strictEqual(
  goodRepositoryViolations.length,
  0,
  'good_repository.py should have no violations'
);

console.log('Python FastAPI rule tests passed.');

const diff = [
  '+@router.get("/users")',
  '+def get_users():',
  '+    return db.query(User).all()'
].join('\n');

const diffViolations = analyzeDiff(
  diff,
  'routers/users.py'
).filter(
  violation => violation.ruleId === 'RULE-PY-01'
);

assert.strictEqual(
  diffViolations.length,
  1,
  'A FastAPI route added in a diff should be detected'
);

console.log('Git diff detection test passed.');

const deletedDiff = [
  '@@ -1,3 +1,3 @@',
  ' @router.get("/users")',
  ' def get_users():',
  '-    return db.query(User).all()',
  '+    return userService.get_users()'
].join('\n');

const deletedViolations = analyzeDiff(
  deletedDiff,
  'routers/users.py'
).filter(
  violation => violation.ruleId === 'RULE-PY-01'
);

assert.strictEqual(
  deletedViolations.length,
  0,
  'Deleted DB queries should not be reported'
);

const lineNumberDiff = [
  '@@ -20,2 +20,3 @@',
  ' @router.get("/users")',
  ' def get_users():',
  '+    return db.query(User).all()'
].join('\n');

const lineNumberViolations = analyzeDiff(
  lineNumberDiff,
  'routers/users.py'
).filter(
  violation => violation.ruleId === 'RULE-PY-01'
);

assert.strictEqual(
  lineNumberViolations.length,
  1,
  'The added DB query should be detected'
);

assert.strictEqual(
  lineNumberViolations[0].lineNumber,
  22,
  'The violation should report the actual source-file line number'
);

console.log('Git diff deletion and line-number tests passed.');