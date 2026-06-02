/**
 * protocol/lock-file.ts — Lock file path resolution (CLAUDE_CONFIG_DIR -> ~/.config/claude/ide -> ~/.claude/ide), JSON generation, write and delete. Thin IO boundary wrapping pure logic. Result<T,E> throughout.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { LockFileData, Port, Result } from './types';
import { ok, err } from './types';

/**
 * Resolve primary lock directory from environment or defaults.
 * PURE: no fs operations.
 */
export function resolvePrimaryLockDir(env: Record<string, string | undefined>): string {
  if (env['CLAUDE_CONFIG_DIR']) {
    return path.join(env['CLAUDE_CONFIG_DIR'], 'ide');
  }
  return path.join(os.homedir(), '.config', 'claude', 'ide');
}

/**
 * Build lock file path from directory and port.
 * PURE: simple path construction.
 */
export function buildLockFilePath(dir: string, port: Port): string {
  return path.join(dir, `${port}.lock`);
}

/**
 * Build legacy lock file path in ~/.claude/ide.
 * PURE: simple path construction.
 */
export function buildLegacyLockFilePath(port: Port): string {
  return path.join(os.homedir(), '.claude', 'ide', `${port}.lock`);
}

/**
 * Build lock file data object.
 * PURE: object construction only.
 */
export function buildLockFileData(pid: number, workspaceFolders: string[], authToken: string): LockFileData {
  return {
    pid,
    workspaceFolders,
    ideName: 'Obsidian',
    transport: 'ws',
    authToken,
  };
}

/**
 * Serialize lock file data to JSON string.
 * PURE: JSON serialization only.
 */
export function serializeLockData(data: LockFileData): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Guard: true only for a lock path of the form .../ide/<port>.lock.
 * Used to constrain all fs writes/deletes to lock files within an `ide` directory.
 * PURE: path inspection only.
 */
export function isLockFilePath(p: string): boolean {
  const base = path.basename(p);
  const parent = path.basename(path.dirname(p));
  return /^\d+\.lock$/.test(base) && parent === 'ide';
}

/**
 * Write lock files to both primary and legacy directories.
 * Always writes both paths. Returns paths on success, error message on failure.
 */
export async function writeLockFiles(
  port: Port,
  data: LockFileData,
  env: Record<string, string | undefined>
): Promise<Result<string[], string>> {
  try {
    const primaryDir = resolvePrimaryLockDir(env);
    const legacyDir = path.join(os.homedir(), '.claude', 'ide');

    if (path.basename(primaryDir) === 'ide') {
      fs.mkdirSync(primaryDir, { recursive: true });
    }
    if (path.basename(legacyDir) === 'ide') {
      fs.mkdirSync(legacyDir, { recursive: true });
    }

    const primaryPath = buildLockFilePath(primaryDir, port);
    const legacyPath = buildLegacyLockFilePath(port);

    const serialized = serializeLockData(data);
    if (isLockFilePath(primaryPath)) {
      fs.writeFileSync(primaryPath, serialized);
    }
    if (isLockFilePath(legacyPath)) {
      fs.writeFileSync(legacyPath, serialized);
    }

    return ok([primaryPath, legacyPath]);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err(message);
  }
}

/**
 * Delete lock files from both primary and legacy directories.
 * Silently succeeds if files don't exist.
 */
export async function deleteLockFiles(
  port: Port,
  env: Record<string, string | undefined>
): Promise<Result<void, string>> {
  try {
    const primaryDir = resolvePrimaryLockDir(env);
    const primaryPath = buildLockFilePath(primaryDir, port);
    const legacyPath = buildLegacyLockFilePath(port);

    if (isLockFilePath(primaryPath)) {
      fs.rmSync(primaryPath, { force: true });
    }
    if (isLockFilePath(legacyPath)) {
      fs.rmSync(legacyPath, { force: true });
    }

    return ok(undefined);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err(message);
  }
}

/**
 * Clean stale lock files from both directories.
 * Removes lock files for processes that don't exist.
 * Silently catches all errors (never throws).
 */
export function cleanStaleLocks(env: Record<string, string | undefined>): void {
  const dirsToClean = [resolvePrimaryLockDir(env), path.join(os.homedir(), '.claude', 'ide')];

  for (const dir of dirsToClean) {
    try {
      const files = fs.readdirSync(dir);

      for (const file of files) {
        if (!file.endsWith('.lock')) {
          continue;
        }

        const fullPath = path.join(dir, file);

        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const data = JSON.parse(content) as LockFileData;

          if (data.pid === process.pid) {
            continue;
          }

          try {
            process.kill(data.pid, 0);
          } catch (killError) {
            const killErr = killError as NodeJS.ErrnoException;
            if (killErr.code === 'ESRCH' && isLockFilePath(fullPath)) {
              fs.rmSync(fullPath, { force: true });
            }
          }
        } catch {
          // Silently ignore parse errors, read errors, etc.
        }
      }
    } catch {
      // Silently ignore directory read errors
    }
  }
}
