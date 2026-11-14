'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function lstatIfPresent(filePath) {
  try {
    return fs.lstatSync(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

// Never let a generated file escape the project through a path or a symlinked parent.
function resolveSafePath(root, relativePath) {
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new Error(`Unsafe generated file path: ${relativePath}`);
  }

  const base = path.resolve(root);
  const target = path.resolve(base, relativePath);
  if (!target.startsWith(base + path.sep)) {
    throw new Error(`Generated file is outside the project: ${relativePath}`);
  }

  const parentPath = path.relative(base, path.dirname(target));
  let current = base;
  if (parentPath) {
    for (const segment of parentPath.split(path.sep)) {
      current = path.join(current, segment);
      const stat = lstatIfPresent(current);
      if (stat && !stat.isDirectory()) {
        throw new Error(`Refusing to write through a non-directory or symlink: ${path.relative(base, current)}`);
      }
    }
  }

  return target;
}

function backUpExistingFile(target) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (let attempt = 0; attempt < 1000; attempt++) {
    const suffix = attempt ? `-${attempt}` : '';
    const backup = `${target}.repoguard-backup-${timestamp}${suffix}`;
    try {
      // COPYFILE_EXCL prevents an existing backup from ever being overwritten.
      fs.copyFileSync(target, backup, fs.constants.COPYFILE_EXCL);
      return backup;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
  throw new Error(`Unable to create a unique backup for ${target}`);
}

/**
 * Create RepoGuard's generated files without clobbering user files.
 * --force is explicit, backs up every existing regular file, and never follows symlinks.
 * --dry-run only previews the preflight plan and does not create directories.
 */
function applyGeneratedFiles(root, files, { force = false, dryRun = false } = {}) {
  const base = path.resolve(root);

  // Validate *all* destinations before writing anything. An unsafe parent aborts
  // the entire initialization instead of leaving the first few files changed.
  const plan = files.map(({ relativePath, content }) => {
    if (typeof content !== 'string') throw new TypeError(`Expected text for ${relativePath}`);
    const target = resolveSafePath(base, relativePath);
    const stat = lstatIfPresent(target);
    if (stat && !stat.isFile() && !stat.isSymbolicLink()) {
      throw new Error(`Refusing to replace a non-file: ${relativePath}`);
    }
    if (force && stat && stat.isSymbolicLink()) {
      throw new Error(`Refusing to follow or replace a symlink: ${relativePath}`);
    }
    return {
      relativePath,
      content,
      target,
      action: stat ? (force ? 'replace' : 'skip') : 'create',
      symlink: Boolean(stat && stat.isSymbolicLink())
    };
  });

  return plan.map(item => {
    const { relativePath, content, target, action, symlink } = item;
    if (dryRun) return { relativePath, action: `would-${action}`, symlink };
    if (action === 'skip') return { relativePath, action: 'skipped', symlink };

    // Recheck existing parents before writing in case something changed after planning.
    resolveSafePath(base, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });

    if (action === 'create') {
      try {
        fs.writeFileSync(target, content, { encoding: 'utf8', flag: 'wx' });
        return { relativePath, action: 'created' };
      } catch (error) {
        // Exclusive creation also protects against dangling symlinks or races.
        if (error.code === 'EEXIST') {
          const existing = lstatIfPresent(target);
          return { relativePath, action: 'skipped', symlink: Boolean(existing && existing.isSymbolicLink()) };
        }
        throw error;
      }
    }

    const latest = lstatIfPresent(target);
    if (!latest || !latest.isFile()) {
      throw new Error(`Refusing to replace a changed or symlinked file: ${relativePath}`);
    }
    const backup = backUpExistingFile(target);
    const afterBackup = lstatIfPresent(target);
    if (!afterBackup || !afterBackup.isFile()) {
      throw new Error(`Refusing to replace a changed or symlinked file: ${relativePath}. Backup saved at ${backup}`);
    }

    // A rename replaces a destination without following it if a symlink appears
    // between the final check and the replacement. Keep a complete backup first.
    const temp = `${target}.repoguard-tmp-${process.pid}-${crypto.randomBytes(8).toString('hex')}`;
    let tempCreated = false;
    try {
      const mode = afterBackup.mode & 0o777;
      const fd = fs.openSync(temp, 'wx', mode);
      tempCreated = true;
      try {
        fs.writeFileSync(fd, content, { encoding: 'utf8' });
      } finally {
        fs.closeSync(fd);
      }
      fs.chmodSync(temp, mode);
      const beforeReplace = lstatIfPresent(target);
      if (!beforeReplace || !beforeReplace.isFile()) {
        throw new Error(`Refusing to replace a changed or symlinked file: ${relativePath}. Backup saved at ${backup}`);
      }
      fs.renameSync(temp, target);
    } catch (error) {
      if (tempCreated) {
        try { fs.unlinkSync(temp); } catch (cleanupError) {
          if (cleanupError.code !== 'ENOENT') throw cleanupError;
        }
      }
      throw error;
    }
    return { relativePath, action: 'replaced', backupPath: path.relative(base, backup) };
  });
}

module.exports = { applyGeneratedFiles };
