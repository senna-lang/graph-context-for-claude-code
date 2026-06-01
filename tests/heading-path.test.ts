/**
 * tests/heading-path.test.ts — Unit tests for context/heading-path pure functions.
 */

import { describe, it, expect } from 'vitest';
import { parseHeadings, getHeadingPath } from '../src/context/heading-path';

describe('parseHeadings', () => {
  it('returns empty array for text with no headings', () => {
    const result = parseHeadings('just some text\nno headings here');
    expect(result).toEqual([]);
  });

  it("parses a single h1 ('# Title') → [{level:1, text:'Title', line:0}]", () => {
    const result = parseHeadings('# Title');
    expect(result).toEqual([{ level: 1, text: 'Title', line: 0 }]);
  });

  it('parses multiple headings at correct 0-origin lines', () => {
    const text = 'line 0\n# H1\nline 2\n## H2\nline 4';
    const result = parseHeadings(text);
    expect(result).toEqual([
      { level: 1, text: 'H1', line: 1 },
      { level: 2, text: 'H2', line: 3 },
    ]);
  });

  it('does NOT match "##no-space" (no space after #)', () => {
    const text = '##no-space\n## with-space';
    const result = parseHeadings(text);
    expect(result).toEqual([{ level: 2, text: 'with-space', line: 1 }]);
  });
});

describe('getHeadingPath', () => {
  it('returns [] for line 0 when text starts before any heading', () => {
    const text = 'body text on line 0\n# Heading later';
    const result = getHeadingPath(text, 0);
    expect(result).toEqual([]);
  });

  it("returns ['# H1'] when line is within h1 only", () => {
    const text = '# H1\nbody text';
    const result = getHeadingPath(text, 1);
    expect(result).toEqual(['# H1']);
  });

  it("returns ['# H1', '## H2'] for a line under a nested h2", () => {
    const text = '# H1\n## H2\nbody';
    const result = getHeadingPath(text, 2);
    expect(result).toEqual(['# H1', '## H2']);
  });

  it('sibling case: "# A\\n## B\\n## C\\nbody"(line 3) → ["# A", "## C"] (deepest ancestor per level; B popped by C)', () => {
    const text = '# A\n## B\n## C\nbody';
    const result = getHeadingPath(text, 3);
    expect(result).toEqual(['# A', '## C']);
  });

  it('boundary: line exactly at a heading\'s line includes that heading', () => {
    const text = '# H1\n## H2\nbody';
    const result = getHeadingPath(text, 1);
    expect(result).toEqual(['# H1', '## H2']);
  });

  it('second h1 resets ancestry (h1>h2 then new h1)', () => {
    const text = '# A\n## B\nbody\n# C\nbody';
    const result = getHeadingPath(text, 4);
    expect(result).toEqual(['# C']);
  });
});
