'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const cli = path.join(__dirname, '..', 'bin', 'repoguard.js');
const top = fs.mkdtempSync(path.join(os.tmpdir(), 'repoguard-disabled-'));
try {
  const root = path.join(top, 'root');
  fs.mkdirSync(root);
  const manifest = path.join(root, 'Cargo.toml');
  const guidance = path.join(root, 'CLAUDE.md');
  fs.writeFileSync(manifest, 'axum synthetic fixture');
  fs.writeFileSync(guidance, 'keep unchanged');
  const probe = path.join(top, 'probe.cjs');
  fs.writeFileSync(probe, `
    const fs = require('fs'), path = require('path');
    const root = path.resolve(process.env.RG_TEST_ROOT);
    for (const name of ['existsSync','readFileSync','writeFileSync','appendFileSync','openSync','statSync','lstatSync','readdirSync','mkdirSync','renameSync','unlinkSync','copyFileSync','chmodSync','realpathSync']) {
      const original = fs[name];
      fs[name] = function (...args) {
        for (const v of args.slice(0, name === 'renameSync' || name === 'copyFileSync' ? 2 : 1)) {
          if (typeof v !== 'string') continue;
          const p = path.resolve(v);
          if (p === root || p.startsWith(root + path.sep)) {
            process.stderr.write('FORBIDDEN_PROJECT_IO:' + name + '\\n');
            throw new Error('forbidden project I/O');
          }
        }
        return original.apply(this, args);
      };
    }
  `);
  const variants = [[], ['--dry-run'], ['--force'], ['--with-ci'],
    ['--force','--with-ci'], ['--dry-run','--force','--with-ci'], ['--help'], ['--unknown']];
  for (const flags of variants) {
    const result = spawnSync(process.execPath, ['--require', probe, cli, 'init', ...flags], {
      cwd: root, encoding: 'utf8', env: { ...process.env, RG_TEST_ROOT: root, GITHUB_ACTIONS: 'true' }, timeout: 10000
    });
    assert.strictEqual(result.status, 1, `${flags}: ${result.stdout}\n${result.stderr}`);
    assert(result.stderr.includes('init is temporarily unavailable'), flags.join(' '));
    assert(!result.stderr.includes('FORBIDDEN_PROJECT_IO:'), flags.join(' '));
    assert(!result.stdout.includes('Scanning repository architecture'), flags.join(' '));
    assert(!result.stdout.includes('Axum (Rust)'), flags.join(' '));
    assert.deepStrictEqual(fs.readdirSync(root).sort(), ['CLAUDE.md','Cargo.toml']);
    assert.strictEqual(fs.readFileSync(manifest, 'utf8'), 'axum synthetic fixture');
    assert.strictEqual(fs.readFileSync(guidance, 'utf8'), 'keep unchanged');
  }
  const help = spawnSync(process.execPath, [cli, 'help'], { cwd: root, encoding: 'utf8', timeout: 10000 });
  assert.strictEqual(help.status, 0, help.stderr);
  assert(help.stdout.includes('Temporarily unavailable in v1.7.1'));
  console.log('PASS init disabled: flags, project I/O probe, unchanged fixture and help');
} finally {
  fs.rmSync(top, { recursive: true, force: true });
}
