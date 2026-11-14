const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { applyGeneratedFiles } = require('../bin/safe-init');

const cli = path.join(__dirname, '..', 'bin', 'repoguard.js');
const aiFiles = [
  '.cursorrules',
  'CLAUDE.md',
  '.windsurfrules',
  '.github/copilot-instructions.md'
];
const ciFile = '.github/workflows/repoguard.yml';
const generatedFilesWithCi = [...aiFiles, ciFile];

function sandbox(test) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repoguard-safe-init-'));
  try {
    test(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function write(root, name, contents) {
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents, 'utf8');
}

function run(root, ...flags) {
  return spawnSync(process.execPath, [cli, 'init', ...flags], {
    cwd: root,
    encoding: 'utf8'
  });
}

function assertSuccess(result) {
  assert.strictEqual(result.status, 0, `${result.stderr}\n${result.stdout}`);
}

function backups(root, name) {
  const file = path.join(root, name);
  return fs.readdirSync(path.dirname(file)).filter(entry =>
    entry.startsWith(`${path.basename(file)}.repoguard-backup-`));
}

// Fresh projects get only AI context files: no surprise README edit or CI workflow.
sandbox(root => {
  const readme = '# Existing README\n\nPlease leave my documentation alone.\n';
  write(root, 'README.md', readme);
  const result = run(root);
  assertSuccess(result);
  aiFiles.forEach(name => assert(fs.statSync(path.join(root, name)).isFile(), name));
  assert(!fs.existsSync(path.join(root, ciFile)));
  assert(!fs.existsSync(path.join(root, '.github/workflows')));
  assert.strictEqual(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), readme);
  assert(result.stdout.includes('4 created'));
  assert(result.stdout.includes('CI workflow untouched'));
  assert(result.stdout.includes('copy it yourself'), 'Badge should be optional');
});

// Previews of both variants create nothing, including nested directories.
sandbox(root => {
  const preview = run(root, '--dry-run');
  assertSuccess(preview);
  for (const name of aiFiles) assert(preview.stdout.includes(`Would create: ${name}`), name);
  assert(!preview.stdout.includes(`Would create: ${ciFile}`));
  assert.deepStrictEqual(fs.readdirSync(root), []);

  const withCi = run(root, '--with-ci', '--dry-run');
  assertSuccess(withCi);
  for (const name of generatedFilesWithCi) {
    assert(withCi.stdout.includes(`Would create: ${name}`), name);
  }
  assert.deepStrictEqual(fs.readdirSync(root), []);
});

// A partial setup preserves the user's guidance and pre-existing CI workflow.
sandbox(root => {
  write(root, 'CLAUDE.md', 'my guidance\n');
  write(root, ciFile, 'my existing CI workflow\n');
  const result = run(root);
  assertSuccess(result);
  assert.strictEqual(fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8'), 'my guidance\n');
  assert.strictEqual(fs.readFileSync(path.join(root, ciFile), 'utf8'), 'my existing CI workflow\n');
  for (const name of aiFiles.filter(name => name !== 'CLAUDE.md')) {
    assert(fs.statSync(path.join(root, name)).isFile(), name);
  }
  assert(!fs.existsSync(path.join(root, 'README.md')));
  assert.deepStrictEqual(backups(root, ciFile), []);
});

// Repeated init never changes existing user files or opts in to CI implicitly.
sandbox(root => {
  const originals = new Map();
  for (const name of generatedFilesWithCi) {
    const contents = `My custom ${name}\n`;
    write(root, name, contents);
    originals.set(name, contents);
  }
  write(root, 'README.md', '# Custom README\n');
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = run(root);
    assertSuccess(result);
    assert(result.stdout.includes('4 preserved'), 'Repeat run should preserve all selected AI files');
    for (const [name, contents] of originals) {
      assert.strictEqual(fs.readFileSync(path.join(root, name), 'utf8'), contents);
    }
    assert.strictEqual(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), '# Custom README\n');
  }
  assert.deepStrictEqual(backups(root, ciFile), []);
});

// --force alone must never modify/back up CI; --dry-run still writes nothing.
sandbox(root => {
  write(root, 'README.md', '# README\n');
  write(root, '.cursorrules', 'custom rules');
  write(root, ciFile, 'custom CI');
  const before = fs.readdirSync(root).sort();
  const preview = run(root, '--dry-run', '--force');
  assertSuccess(preview);
  assert(preview.stdout.includes('Would back up and replace: .cursorrules'));
  assert(!preview.stdout.includes(`Would back up and replace: ${ciFile}`));
  assert(preview.stdout.includes('No files or directories were changed'));
  assert.deepStrictEqual(fs.readdirSync(root).sort(), before);

  const withCi = run(root, '--with-ci', '--dry-run', '--force');
  assertSuccess(withCi);
  assert(withCi.stdout.includes(`Would back up and replace: ${ciFile}`));
  assert.deepStrictEqual(fs.readdirSync(root).sort(), before);
  assert.strictEqual(fs.readFileSync(path.join(root, '.cursorrules'), 'utf8'), 'custom rules');
  assert.strictEqual(fs.readFileSync(path.join(root, ciFile), 'utf8'), 'custom CI');
  assert.deepStrictEqual(backups(root, ciFile), []);
});

// Explicit --force backs up each selected AI file, but leaves existing CI untouched.
sandbox(root => {
  const originals = new Map();
  for (const name of aiFiles) {
    const contents = `KEEP ${name}\n`;
    write(root, name, contents);
    originals.set(name, contents);
  }
  write(root, ciFile, 'CI stays mine\n');
  write(root, 'README.md', '# README stays mine\n');
  const result = run(root, '--force');
  assertSuccess(result);
  assert(result.stdout.includes('4 replaced'));
  for (const [name, contents] of originals) {
    const file = path.join(root, name);
    const names = backups(root, name);
    assert.strictEqual(names.length, 1, `No unique backup for ${name}`);
    assert.strictEqual(fs.readFileSync(path.join(path.dirname(file), names[0]), 'utf8'), contents);
    assert.notStrictEqual(fs.readFileSync(file, 'utf8'), contents);
  }
  assert.strictEqual(fs.readFileSync(path.join(root, ciFile), 'utf8'), 'CI stays mine\n');
  assert.deepStrictEqual(backups(root, ciFile), []);
  assert.strictEqual(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), '# README stays mine\n');

  assertSuccess(run(root, '--force'));
  const names = backups(root, '.cursorrules');
  assert.strictEqual(names.length, 2, 'A second forced run must not overwrite the first backup');
  assert(names.some(name => fs.readFileSync(path.join(root, name), 'utf8') === 'KEEP .cursorrules\n'));
  assert.deepStrictEqual(backups(root, ciFile), []);
});

// --with-ci creates a version-pinned, least-privilege workflow only when requested.
sandbox(root => {
  const readme = '# Keep this README\n';
  write(root, 'README.md', readme);
  const result = run(root, '--with-ci');
  assertSuccess(result);
  assert(result.stdout.includes('5 created'));
  for (const name of generatedFilesWithCi) assert(fs.statSync(path.join(root, name)).isFile(), name);
  assert.strictEqual(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), readme);

  const ci = fs.readFileSync(path.join(root, ciFile), 'utf8');
  assert(ci.includes('uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2'));
  assert(ci.includes('uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0'));
  assert(ci.includes("node-version: '20'"));
  assert(ci.includes('persist-credentials: false'));
  assert(ci.includes('cd "$RUNNER_TEMP"'), 'npm must not read PR checkout .npmrc');
  assert(ci.includes('--ignore-scripts --no-audit --no-fund --package-lock=false --registry=https://registry.npmjs.org/ repoguard-rules@1.7.1'));
  assert(ci.includes('run: node "$RUNNER_TEMP/repoguard/node_modules/repoguard-rules/bin/repoguard.js" ci'));
  assert(!ci.includes('uses: taylormatematica-beep/repoguard@'), 'do not run the vulnerable v1.7.0 Action');
  assert(!ci.includes('repoguard-rules@latest'));
  assert(ci.includes('  contents: read\n'));
  assert(ci.includes('  pull-requests: write\n'));
  assert(!ci.includes('issues: write'));
  const install = ci.split('- name: Install RepoGuard v1.7.1')[1].split('- name: Run RepoGuard Architecture Review')[0];
  assert(!install.includes('GITHUB_TOKEN'), 'install must not have a write-capable token');
  assert(ci.includes('GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}'));
  assert.strictEqual(ci.split('GITHUB_TOKEN:').length, 2, 'token only in review step');
  const repeated = run(root, '--with-ci');
  assertSuccess(repeated);
  assert(repeated.stdout.includes('5 preserved'));
  assert.strictEqual(fs.readFileSync(path.join(root, ciFile), 'utf8'), ci);
  assert.deepStrictEqual(backups(root, ciFile), []);
});

// --with-ci preserves existing CI without --force; both flags are needed to replace it.
sandbox(root => {
  write(root, ciFile, 'custom workflow\n');
  const first = run(root, '--with-ci');
  assertSuccess(first);
  assert(first.stdout.includes('4 created, 1 preserved, 0 replaced'));
  assert.strictEqual(fs.readFileSync(path.join(root, ciFile), 'utf8'), 'custom workflow\n');
  assert.deepStrictEqual(backups(root, ciFile), []);

  const forced = run(root, '--force', '--with-ci');
  assertSuccess(forced);
  assert(forced.stdout.includes('5 replaced'));
  const names = backups(root, ciFile);
  assert.strictEqual(names.length, 1);
  assert.strictEqual(fs.readFileSync(path.join(root, '.github/workflows', names[0]), 'utf8'), 'custom workflow\n');
  assert.notStrictEqual(fs.readFileSync(path.join(root, ciFile), 'utf8'), 'custom workflow\n');
});

// POSIX mode bits do not represent NTFS ACLs on Windows. Check content on
// every platform, and verify strict file modes only where Node exposes them.
sandbox(root => {
  const file = path.join(root, '.cursorrules');
  write(root, '.cursorrules', 'private rules');
  fs.chmodSync(file, 0o600);
  assertSuccess(run(root, '--force'));
  const names = backups(root, '.cursorrules');
  assert.strictEqual(names.length, 1);
  const backup = path.join(root, names[0]);
  assert.strictEqual(fs.readFileSync(backup, 'utf8'), 'private rules');
  assert.notStrictEqual(fs.readFileSync(file, 'utf8'), 'private rules');
  if (process.platform !== 'win32') {
    assert.strictEqual(fs.statSync(file).mode & 0o777, 0o600);
    assert.strictEqual(fs.statSync(backup).mode & 0o777, 0o600);
  }
});

// A destination swapped to a symlink after backup cannot clobber its target.
sandbox(root => {
  const file = path.join(root, '.cursorrules');
  const outside = path.join(root, 'outside.txt');
  write(root, '.cursorrules', 'original rules');
  write(root, 'outside.txt', 'Do not change me');
  const copyFileSync = fs.copyFileSync;
  const lstatSync = fs.lstatSync;
  let backupCopied = false;
  try {
    fs.copyFileSync = (...args) => {
      copyFileSync(...args);
      backupCopied = true;
    };
    fs.lstatSync = name => {
      const stat = lstatSync(name);
      if (backupCopied && name === file) {
        backupCopied = false;
        fs.unlinkSync(file);
        fs.symlinkSync(outside, file, 'file');
      }
      return stat;
    };
    assert.throws(() => applyGeneratedFiles(root, [
      { relativePath: '.cursorrules', content: 'new rules' }
    ], { force: true }), /changed or symlinked/);
  } finally {
    fs.copyFileSync = copyFileSync;
    fs.lstatSync = lstatSync;
  }
  assert(fs.lstatSync(file).isSymbolicLink());
  assert.strictEqual(fs.readFileSync(outside, 'utf8'), 'Do not change me');
  const names = backups(root, '.cursorrules');
  assert.strictEqual(names.length, 1);
  assert.strictEqual(fs.readFileSync(path.join(root, names[0]), 'utf8'), 'original rules');
  assert(!fs.readdirSync(root).some(name => name.includes('.repoguard-tmp-')));
});

// Existing symlinked AI files are skipped by default and rejected for replacement.
sandbox(root => {
  const outside = path.join(root, 'outside.txt');
  write(root, 'outside.txt', 'Do not change me');
  fs.symlinkSync(outside, path.join(root, '.cursorrules'), 'file');
  const forced = run(root, '--force');
  assert.notStrictEqual(forced.status, 0);
  assert(forced.stderr.includes('symlink'));
  assert.strictEqual(fs.readFileSync(outside, 'utf8'), 'Do not change me');
  assert(!fs.existsSync(path.join(root, 'CLAUDE.md')));
  const normal = run(root);
  assertSuccess(normal);
  assert(fs.lstatSync(path.join(root, '.cursorrules')).isSymbolicLink());
  assert.strictEqual(fs.readFileSync(outside, 'utf8'), 'Do not change me');
  assert(!fs.existsSync(path.join(root, ciFile)));
});

// --force without --with-ci ignores even a symlinked CI workflow.
sandbox(root => {
  const outside = path.join(root, 'outside-ci.yml');
  write(root, 'outside-ci.yml', 'Do not change me');
  fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
  fs.symlinkSync(outside, path.join(root, ciFile), 'file');
  const forcedCi = run(root, '--with-ci', '--force');
  assert.notStrictEqual(forcedCi.status, 0);
  assert(forcedCi.stderr.includes('symlink'));
  assert(!fs.existsSync(path.join(root, '.cursorrules')));
  const aiOnly = run(root, '--force');
  assertSuccess(aiOnly);
  assert(fs.lstatSync(path.join(root, ciFile)).isSymbolicLink());
  assert.strictEqual(fs.readFileSync(outside, 'utf8'), 'Do not change me');
  assert.deepStrictEqual(backups(root, ciFile), []);
});

// A symlinked .github parent must not cause AI files to escape the project.
sandbox(root => {
  const outside = path.join(root, 'other-directory');
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(root, '.github'), 'dir');
  const result = run(root);
  assert.notStrictEqual(result.status, 0);
  assert(result.stderr.includes('non-directory or symlink'));
  assert(!fs.existsSync(path.join(root, '.cursorrules')));
  assert.deepStrictEqual(fs.readdirSync(outside), []);
});

// A symlinked workflows directory is ignored without CI opt-in but rejected with it.
sandbox(root => {
  const outside = path.join(root, 'other-directory');
  fs.mkdirSync(path.join(root, '.github'));
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(root, '.github/workflows'), 'dir');
  const withCi = run(root, '--with-ci');
  assert.notStrictEqual(withCi.status, 0);
  assert(withCi.stderr.includes('non-directory or symlink'));
  assert(!fs.existsSync(path.join(root, '.cursorrules')));
  assertSuccess(run(root));
  assert(fs.statSync(path.join(root, '.github/copilot-instructions.md')).isFile());
  assert.deepStrictEqual(fs.readdirSync(outside), []);
});

// A non-file CI destination is ignored by default and blocks explicit CI setup.
sandbox(root => {
  fs.mkdirSync(path.join(root, ciFile), { recursive: true });
  const withCi = run(root, '--with-ci');
  assert.notStrictEqual(withCi.status, 0);
  assert(withCi.stderr.includes('non-file'));
  assert(!fs.existsSync(path.join(root, '.cursorrules')));
  assertSuccess(run(root));
  assert(fs.statSync(path.join(root, ciFile)).isDirectory());
});

// CLI help explains opt-in; typos and incompatible files abort without partial init.
sandbox(root => {
  const help = run(root, '--help');
  assertSuccess(help);
  assert(help.stdout.includes('--with-ci'));
  const generalHelp = spawnSync(process.execPath, [cli, '--help'], { cwd: root, encoding: 'utf8' });
  assertSuccess(generalHelp);
  assert(generalHelp.stdout.includes('init [--dry-run] [--force] [--with-ci]'));
  assert(generalHelp.stdout.includes('CI opt-in'));
  assert.deepStrictEqual(fs.readdirSync(root), []);
  assert.strictEqual(run(root, '--with-c').status, 2);
  assert(!fs.existsSync(path.join(root, '.cursorrules')));
  fs.mkdirSync(path.join(root, '.cursorrules'));
  const result = run(root);
  assert.notStrictEqual(result.status, 0);
  assert(!fs.existsSync(path.join(root, 'CLAUDE.md')));
});

console.log('Safe Init tests passed: AI defaults, CI opt-in/pins, preservation, dry runs, backups, POSIX modes where supported, symlinks, invalid inputs.');
