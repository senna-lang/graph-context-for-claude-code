/**
 * tests/link-expander.test.ts — Unit tests for context/link-expander: parseLinks, expandEmbed, summarizeWikilink, expandLinks using in-memory fake VaultPort.
 */

import { describe, it, expect } from 'vitest';
import {
  parseLinks,
  expandEmbed,
  summarizeWikilink,
  expandLinks,
  EMBED_CAP,
  WIKILINK_SUMMARY_CAP,
  truncateWithFlag,
  type ParsedLink,
} from '../src/context/link-expander';
import type { VaultPort } from '../src/protocol/types';

/**
 * Factory for creating fake VaultPort instances for testing.
 */
function makeFakePort(overrides: Partial<VaultPort> = {}): VaultPort {
  return {
    resolveLink: () => null,
    readNote: () => null,
    getFrontmatter: () => null,
    getBacklinks: () => [],
    ...overrides,
  };
}

describe('parseLinks', () => {
  it('parses [[wikilink]] with isEmbed false and linkText "wikilink"', () => {
    const result = parseLinks('text [[wikilink]] more text');
    expect(result).toHaveLength(1);
    expect(result[0]?.isEmbed).toBe(false);
    expect(result[0]?.linkText).toBe('wikilink');
    expect(result[0]?.alias).toBe(null);
  });

  it('parses ![[embed]] with isEmbed true', () => {
    const result = parseLinks('text ![[embed]] more text');
    expect(result).toHaveLength(1);
    expect(result[0]?.isEmbed).toBe(true);
    expect(result[0]?.linkText).toBe('embed');
  });

  it('parses [[note|alias]] with alias "alias"', () => {
    const result = parseLinks('text [[note|alias]] more text');
    expect(result).toHaveLength(1);
    expect(result[0]?.linkText).toBe('note');
    expect(result[0]?.alias).toBe('alias');
  });

  it('parses [[note#heading]] with heading "heading"', () => {
    const result = parseLinks('text [[note#heading]] more text');
    expect(result).toHaveLength(1);
    expect(result[0]?.linkText).toBe('note');
    expect(result[0]?.heading).toBe('heading');
  });

  it('parses ![[note#^blockId]] with blockId "blockId"', () => {
    const result = parseLinks('text ![[note#^blockId]] more text');
    expect(result).toHaveLength(1);
    expect(result[0]?.isEmbed).toBe(true);
    expect(result[0]?.linkText).toBe('note');
    expect(result[0]?.blockId).toBe('blockId');
  });

  it('does NOT match links inside a fenced code block', () => {
    const text = 'text\n```\n[[x]]\n```\nmore';
    const result = parseLinks(text);
    expect(result).toHaveLength(0);
  });

  it('returns [] for plain text', () => {
    const result = parseLinks('just plain text with no links');
    expect(result).toHaveLength(0);
  });
});

describe('truncateWithFlag', () => {
  it('shorter than cap returns truncated:false', () => {
    const result = truncateWithFlag('short', 10);
    expect(result.truncated).toBe(false);
    expect(result.text).toBe('short');
  });

  it('longer than cap returns truncated:true and ends with "…[truncated]"', () => {
    const longText = 'a'.repeat(100);
    const result = truncateWithFlag(longText, 50);
    expect(result.truncated).toBe(true);
    expect(result.text).toMatch(/…\[truncated\]$/);
    expect(result.text.length).toBe(50 + '…[truncated]'.length);
  });
});

describe('expandEmbed', () => {
  it('unresolved (resolveLink→null) returns unresolved:true with sentinel message', () => {
    const parsed: ParsedLink = {
      raw: '![[missing]]',
      linkText: 'missing',
      alias: null,
      heading: null,
      blockId: null,
      isEmbed: true,
    };
    const port = makeFakePort({ resolveLink: () => null });
    const result = expandEmbed(parsed, '/from.md', port);

    expect(result.unresolved).toBe(true);
    expect(result.expandedText).toContain('unresolved');
  });

  it('self-embed (resolveLink returns same fromPath) contains "self-reference"', () => {
    const parsed: ParsedLink = {
      raw: '![[self]]',
      linkText: 'self',
      alias: null,
      heading: null,
      blockId: null,
      isEmbed: true,
    };
    const port = makeFakePort({
      resolveLink: () => '/from.md',
    });
    const result = expandEmbed(parsed, '/from.md', port);

    expect(result.expandedText).toContain('self-reference');
    expect(result.unresolved).toBe(false);
  });

  it('resolved (resolveLink→"/p", readNote→"BODY") returns expandedText "BODY", unresolved:false', () => {
    const parsed: ParsedLink = {
      raw: '![[target]]',
      linkText: 'target',
      alias: null,
      heading: null,
      blockId: null,
      isEmbed: true,
    };
    const port = makeFakePort({
      resolveLink: () => '/p',
      readNote: () => 'BODY',
    });
    const result = expandEmbed(parsed, '/from.md', port);

    expect(result.expandedText).toBe('BODY');
    expect(result.unresolved).toBe(false);
    expect(result.truncated).toBe(false);
  });

  it('over EMBED_CAP (readNote returns long string > 2000) returns truncated:true', () => {
    const longBody = 'x'.repeat(EMBED_CAP + 100);
    const parsed: ParsedLink = {
      raw: '![[target]]',
      linkText: 'target',
      alias: null,
      heading: null,
      blockId: null,
      isEmbed: true,
    };
    const port = makeFakePort({
      resolveLink: () => '/p',
      readNote: () => longBody,
    });
    const result = expandEmbed(parsed, '/from.md', port);

    expect(result.truncated).toBe(true);
    expect(result.expandedText).toMatch(/…\[truncated\]$/);
  });
});

describe('summarizeWikilink', () => {
  it('unresolved (resolveLink→null) returns unresolved:true', () => {
    const parsed: ParsedLink = {
      raw: '[[missing]]',
      linkText: 'missing',
      alias: null,
      heading: null,
      blockId: null,
      isEmbed: false,
    };
    const port = makeFakePort({ resolveLink: () => null });
    const result = summarizeWikilink(parsed, '/from.md', port);

    expect(result.unresolved).toBe(true);
    expect(result.summary).toContain('unresolved');
  });

  it('resolved with frontmatter+body contains frontmatter key and first paragraph', () => {
    const parsed: ParsedLink = {
      raw: '[[target]]',
      linkText: 'target',
      alias: null,
      heading: null,
      blockId: null,
      isEmbed: false,
    };
    const port = makeFakePort({
      resolveLink: () => '/target.md',
      getFrontmatter: () => ({ title: 'Note Title' }),
      readNote: () => 'First paragraph here\n\nSecond paragraph',
    });
    const result = summarizeWikilink(parsed, '/from.md', port);

    expect(result.unresolved).toBe(false);
    expect(result.summary).toContain('title');
    expect(result.summary).toContain('First paragraph here');
  });

  it('over WIKILINK_SUMMARY_CAP returns truncated:true', () => {
    const parsed: ParsedLink = {
      raw: '[[target]]',
      linkText: 'target',
      alias: null,
      heading: null,
      blockId: null,
      isEmbed: false,
    };
    const longSummary = 'x'.repeat(WIKILINK_SUMMARY_CAP + 50);
    const port = makeFakePort({
      resolveLink: () => '/target.md',
      getFrontmatter: () => ({ key: longSummary }),
      readNote: () => 'body text',
    });
    const result = summarizeWikilink(parsed, '/from.md', port);

    expect(result.truncated).toBe(true);
    expect(result.summary).toMatch(/…\[truncated\]$/);
  });
});

describe('expandLinks', () => {
  it('a note with one ![[embed]] and one [[wikilink]] returns 2 LinkSummary with kinds "embed" and "wikilink"', () => {
    const noteText = 'text ![[embed]] and [[wikilink]] more';
    const port = makeFakePort({
      resolveLink: (linkText: string) => `/resolved/${linkText}`,
      readNote: () => 'content',
      getFrontmatter: () => null,
    });
    const result = expandLinks(noteText, '/from.md', port);

    expect(result).toHaveLength(2);

    const embedResult = result.find((r) => r.kind === 'embed');
    expect(embedResult).toBeDefined();
    expect(embedResult?.linkText).toBe('embed');

    const wikilinkResult = result.find((r) => r.kind === 'wikilink');
    expect(wikilinkResult).toBeDefined();
    expect(wikilinkResult?.linkText).toBe('wikilink');
  });
});

describe('expandLinks dedup', () => {
  it('same [[X]] twice → 1 LinkSummary', () => {
    const noteText = '[[X]] and [[X]]';
    const port = makeFakePort({
      resolveLink: () => '/x.md',
      readNote: () => 'content',
      getFrontmatter: () => null,
    });
    const r = expandLinks(noteText, '/from.md', port);

    expect(r).toHaveLength(1);
    expect(r[0]?.linkText).toBe('X');
  });

  it('![[A#Beta]] and ![[A#Gamma]] → 2 (heading differs)', () => {
    const noteText = '![[A#Beta]] and ![[A#Gamma]]';
    const port = makeFakePort({
      resolveLink: () => '/a.md',
      readNote: () => 'content',
    });

    expect(expandLinks(noteText, '/from.md', port)).toHaveLength(2);
  });

  it('[[A]] and ![[A]] → 2 (kind differs)', () => {
    const noteText = '[[A]] and ![[A]]';
    const port = makeFakePort({
      resolveLink: () => '/a.md',
      readNote: () => 'content',
      getFrontmatter: () => null,
    });
    const r = expandLinks(noteText, '/from.md', port);

    expect(r).toHaveLength(2);
    expect(r.some((x) => x.kind === 'wikilink')).toBe(true);
    expect(r.some((x) => x.kind === 'embed')).toBe(true);
  });

  it('first-occurrence order preserved', () => {
    const noteText = '[[First]] [[Second]] [[First]]';
    const port = makeFakePort({
      resolveLink: (linkText: string) => `/${linkText}.md`,
      readNote: () => 'x',
      getFrontmatter: () => null,
    });
    const r = expandLinks(noteText, '/from.md', port);

    expect(r).toHaveLength(2);
    expect(r[0]?.linkText).toBe('First');
    expect(r[1]?.linkText).toBe('Second');
  });
});
