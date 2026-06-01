/**
 * tests/context-builder.test.ts — Unit tests for context/context-builder using in-memory fake VaultPort.
 */

import { describe, it, expect } from 'vitest';
import { buildEnrichedContext, TOTAL_CONTEXT_CAP, BACKLINKS_CAP } from '../src/context/context-builder';
import type { VaultPort } from '../src/protocol/types';

function makeFakePort(overrides: Partial<VaultPort> = {}): VaultPort {
  return {
    resolveLink: () => null,
    readNote: () => null,
    getFrontmatter: () => null,
    getBacklinks: () => [],
    ...overrides,
  };
}

describe('buildEnrichedContext', () => {
  describe('(a) headingPath computed from selectionStartLine', () => {
    it('should extract heading path for H1 and H2', () => {
      const noteText = '# H1\n## H2\nbody';
      const notePath = '/n.md';
      const selectionStartLine = 2;

      const result = buildEnrichedContext(
        { noteText, notePath, selectionStartLine },
        makeFakePort()
      );

      expect(result.headingPath).toEqual(['# H1', '## H2']);
    });
  });

  describe('(b) includes frontmatter', () => {
    it('should include frontmatter from getFrontmatter', () => {
      const noteText = 'body';
      const notePath = '/n.md';

      const result = buildEnrichedContext(
        { noteText, notePath, selectionStartLine: 0 },
        makeFakePort({ getFrontmatter: () => ({ title: 'X' }) })
      );

      expect(result.frontmatter).toEqual({ title: 'X' });
      expect(result.frontmatter?.title).toBe('X');
    });
  });

  describe('(c) backlinks capped', () => {
    it('should cap backlinks to BACKLINKS_CAP and set truncated flag', () => {
      const backlinksData = Array.from({ length: 25 }, (_v, i) => ({
        path: `/p${i}`,
        name: `p${i}`,
      }));

      const result = buildEnrichedContext(
        { noteText: 'body', notePath: '/n.md', selectionStartLine: 0 },
        makeFakePort({ getBacklinks: () => backlinksData })
      );

      expect(result.backlinks.length).toBe(BACKLINKS_CAP);
      expect(result.backlinks.length).toBe(20);
      expect(result.truncated.backlinks).toBe(true);
    });
  });

  describe('(d) totalContext truncation', () => {
    it('should truncate totalContext when serialized context exceeds TOTAL_CONTEXT_CAP', () => {
      const noteText = '![[big1]]\n![[big2]]\n![[big3]]\n![[big4]]\n![[big5]]';
      const notePath = '/n.md';

      const result = buildEnrichedContext(
        { noteText, notePath, selectionStartLine: 0 },
        makeFakePort({
          resolveLink: (linkText: string) => {
            if (linkText.startsWith('big')) {
              return `/${linkText}.md`;
            }
            return null;
          },
          readNote: (path: string) => {
            if (path.startsWith('/big')) {
              return 'x'.repeat(2000);
            }
            return null;
          },
        })
      );

      expect(result.truncated.totalContext).toBe(true);
    });
  });

  describe('(e) broken embed', () => {
    it('should mark unresolved embed when resolveLink returns null', () => {
      const noteText = '![[missing]]';
      const notePath = '/n.md';

      const result = buildEnrichedContext(
        { noteText, notePath, selectionStartLine: 0 },
        makeFakePort({ resolveLink: () => null })
      );

      expect(result.linkedSummaries.length).toBeGreaterThan(0);
      expect(result.linkedSummaries[0]?.unresolved).toBe(true);
    });
  });

  describe('(f) wikilink kind', () => {
    it('should identify wikilink and expand its summary', () => {
      const noteText = '[[ref]]';
      const notePath = '/n.md';

      const result = buildEnrichedContext(
        { noteText, notePath, selectionStartLine: 0 },
        makeFakePort({
          resolveLink: () => '/ref.md',
          readNote: () => 'para',
        })
      );

      expect(result.linkedSummaries.length).toBeGreaterThan(0);
      const wikilink = result.linkedSummaries.find(ls => ls.kind === 'wikilink');
      expect(wikilink).toBeDefined();
      expect(wikilink?.kind).toBe('wikilink');
    });
  });
});
