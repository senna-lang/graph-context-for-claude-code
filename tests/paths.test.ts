/**
 * tests/paths.test.ts — Unit tests for obsidian/paths.ts pure functions.
 */

import { describe, it, expect } from 'vitest';
import { toAbsolutePath, toFileUrl, normalizePosition, normalizeSelection, isWithinBasePath } from '../src/obsidian/paths';
import type { AbsolutePath } from '../src/protocol/types';

describe('toAbsolutePath', () => {
  it('joins basePath and relative path', () => {
    const result = toAbsolutePath('/home/user', 'documents/file.md');
    expect(result).toBe('/home/user/documents/file.md');
  });

  it('resolves .. segments', () => {
    const result = toAbsolutePath('/home/user/docs', '../file.md');
    expect(result).toBe('/home/user/file.md');
  });
});

describe('toFileUrl', () => {
  it('prefixes file:// and encodes special chars', () => {
    const path = '/home/user/file.md' as unknown as AbsolutePath;
    const result = toFileUrl(path);
    expect(result).toBe('file:///home/user/file.md');
  });

  it('handles paths with spaces', () => {
    const path = '/a b.md' as unknown as AbsolutePath;
    const result = toFileUrl(path);
    expect(result).toBe('file:///a%20b.md');
  });
});

describe('normalizePosition', () => {
  it('maps ch to character field', () => {
    const result = normalizePosition({ line: 2, ch: 5 });
    expect(result).toEqual({ line: 2, character: 5 });
  });
});

describe('normalizeSelection', () => {
  it('anchor before head → start=anchor end=head', () => {
    const sel = {
      anchor: { line: 1, ch: 3 },
      head: { line: 2, ch: 8 },
    };
    const result = normalizeSelection(sel);
    expect(result.start).toEqual({ line: 1, character: 3 });
    expect(result.end).toEqual({ line: 2, character: 8 });
  });

  it('head before anchor (reversed) → start=head end=anchor', () => {
    const sel = {
      anchor: { line: 3, ch: 10 },
      head: { line: 1, ch: 2 },
    };
    const result = normalizeSelection(sel);
    expect(result.start).toEqual({ line: 1, character: 2 });
    expect(result.end).toEqual({ line: 3, character: 10 });
  });

  it('reversed selection asserts start.line <= end.line', () => {
    const sel = {
      anchor: { line: 5, ch: 0 },
      head: { line: 2, ch: 15 },
    };
    const result = normalizeSelection(sel);
    expect(result.start.line).toBeLessThanOrEqual(result.end.line);
  });

  it('same position → isEmpty true', () => {
    const sel = {
      anchor: { line: 2, ch: 5 },
      head: { line: 2, ch: 5 },
    };
    const result = normalizeSelection(sel);
    expect(result.isEmpty).toBe(true);
  });

  it('different lines → start has smaller line', () => {
    const sel = {
      anchor: { line: 4, ch: 2 },
      head: { line: 1, ch: 8 },
    };
    const result = normalizeSelection(sel);
    expect(result.start.line).toBeLessThan(result.end.line);
  });
});

describe('isWithinBasePath', () => {
  it('true for path inside base', () => {
    const result = isWithinBasePath('/home/user/docs/file.md', '/home/user');
    expect(result).toBe(true);
  });

  it('false for path outside base', () => {
    const result = isWithinBasePath('/etc/passwd', '/home/user');
    expect(result).toBe(false);
  });

  it('false for shared-prefix non-child', () => {
    const result = isWithinBasePath('/foobar/x', '/foo');
    expect(result).toBe(false);
  });
});
