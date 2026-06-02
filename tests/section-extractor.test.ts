/**
 * tests/section-extractor.test.ts — Unit tests for extractSectionByHeading and extractBlock.
 */

import { describe, it, expect } from 'vitest';
import { extractSectionByHeading, extractBlock } from '../src/context/section-extractor';

describe('extractSectionByHeading', () => {
  it('(a) stops before next same-level heading', () => {
    const text = '## A\ncontent\n## B\nother';
    const result = extractSectionByHeading(text, 'A');
    expect(result).toBe('## A\ncontent');
  });

  it('(b) includes deeper subheadings', () => {
    const text = '## A\nx\n### B\ny\n## C\nz';
    const result = extractSectionByHeading(text, 'A');
    expect(result).toBe('## A\nx\n### B\ny');
  });

  it('(c) last section runs to EOF', () => {
    const text = '# H1\nbody1\n## H2\nbody2';
    const result = extractSectionByHeading(text, 'H2');
    expect(result).toBe('## H2\nbody2');
  });

  it('(d) heading not found returns null', () => {
    const result = extractSectionByHeading('# X\nbody', 'Nope');
    expect(result).toBeNull();
  });

  it('(e) heading line itself included', () => {
    const text = '## A\ncontent\n## B\nother';
    const result = extractSectionByHeading(text, 'A');
    expect(result).toBeTruthy();
    expect(result).toMatch(/^## A/);
  });
});

describe('extractBlock', () => {
  it('(a) inline token at paragraph end', () => {
    const text = 'para line one\npara line two ^id1';
    const result = extractBlock(text, 'id1');
    expect(result).toBe('para line one\npara line two');
  });

  it('(b) token on its own concept', () => {
    const text = 'lead\nmid ^id2\ntail';
    const result = extractBlock(text, 'id2');
    expect(result).toBe('lead\nmid\ntail');
  });

  it('(c) blockId not found returns null', () => {
    const result = extractBlock('text ^other', 'missing');
    expect(result).toBeNull();
  });

  it('(d) paragraph bounded by blanks', () => {
    const text = 'p1\n\ntarget line ^id3\n\np3';
    const result = extractBlock(text, 'id3');
    expect(result).toBe('target line');
  });
});
