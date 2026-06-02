/**
 * tests/lock-file.test.ts — Unit tests for protocol/lock-file.ts pure path functions and lock data builder.
 */

import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import {
  resolvePrimaryLockDir,
  buildLockFilePath,
  buildLegacyLockFilePath,
  buildLockFileData,
  serializeLockData,
  isLockFilePath,
} from '../src/protocol/lock-file';
import type { Port } from '../src/protocol/types';

describe('resolvePrimaryLockDir', () => {
  it('uses CLAUDE_CONFIG_DIR when set', () => {
    const result = resolvePrimaryLockDir({ CLAUDE_CONFIG_DIR: '/custom' });
    expect(result).toBe(path.join('/custom', 'ide'));
  });

  it('falls back to ~/.config/claude/ide when unset', () => {
    const result = resolvePrimaryLockDir({});
    expect(result).toContain(path.join('.config', 'claude', 'ide'));
  });

  it('ignores empty CLAUDE_CONFIG_DIR', () => {
    const result = resolvePrimaryLockDir({ CLAUDE_CONFIG_DIR: '' });
    expect(result).toContain(path.join('.config', 'claude', 'ide'));
  });
});

describe('buildLockFilePath', () => {
  it('joins dir and port with .lock suffix', () => {
    const result = buildLockFilePath('/d', 999 as Port);
    expect(result).toBe(path.join('/d', '999.lock'));
  });
});

describe('buildLegacyLockFilePath', () => {
  it('always points to ~/.claude/ide/PORT.lock', () => {
    const result = buildLegacyLockFilePath(999 as Port);
    expect(result).toContain(path.join('.claude', 'ide', '999.lock'));
  });
});

describe('buildLockFileData', () => {
  it('sets ideName to Obsidian and transport to ws', () => {
    const result = buildLockFileData(1234, ['/workspace'], 'token123');
    expect(result.ideName).toBe('Obsidian');
    expect(result.transport).toBe('ws');
  });

  it('preserves pid, workspaceFolders, and authToken', () => {
    const pid = 5678;
    const folders = ['/home/user/project1', '/home/user/project2'];
    const token = 'mytoken';

    const result = buildLockFileData(pid, folders, token);

    expect(result.pid).toBe(pid);
    expect(result.workspaceFolders).toEqual(folders);
    expect(result.authToken).toBe(token);
  });
});

describe('serializeLockData', () => {
  it('round-trips through JSON.parse', () => {
    const original = buildLockFileData(9999, ['/test'], 'testtoken');
    const serialized = serializeLockData(original);
    const deserialized = JSON.parse(serialized);

    expect(deserialized).toEqual(original);
  });

  it('output contains pid', () => {
    const data = buildLockFileData(12345, [], 'token');
    const serialized = serializeLockData(data);

    expect(serialized).toContain('"pid"');
    expect(serialized).toContain('12345');
  });
});

describe('isLockFilePath', () => {
  it('true for a lock path with ide parent directory', () => {
    expect(isLockFilePath(path.join('/x', 'ide', '12345.lock'))).toBe(true);
  });

  it('false when parent dir is not ide', () => {
    expect(isLockFilePath(path.join('/x', 'notide', '12345.lock'))).toBe(false);
  });

  it('false when basename is not <digits>.lock', () => {
    expect(isLockFilePath(path.join('/x', 'ide', 'foo.txt'))).toBe(false);
  });

  it('false when basename is non-numeric .lock', () => {
    expect(isLockFilePath(path.join('/x', 'ide', 'abc.lock'))).toBe(false);
  });

  it('true for a .lock in ide parent even in nested path', () => {
    expect(isLockFilePath(path.join('/home', 'user', '.claude', 'ide', '999.lock'))).toBe(true);
  });

  it('false for a .lock directly in a non-ide path', () => {
    expect(isLockFilePath(path.join('/home', 'user', '999.lock'))).toBe(false);
  });
});
