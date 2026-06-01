/**
 * context/heading-path.ts — Pure function to compute the heading path (ancestry array)
 * for a 0-origin line number within note text. No Obsidian imports. Unit-testable.
 */

export type HeadingEntry = {
  level: number;
  text: string;
  line: number;
};

/**
 * Parse all headings from noteText.
 * Matches lines that start with 1-6 '#' characters followed by whitespace.
 * Returns headings in document order with their line indices (0-origin).
 */
export function parseHeadings(noteText: string): HeadingEntry[] {
  const lines = noteText.split('\n');
  const headings: HeadingEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(#{1,6})\s+(.*)$/);
    if (match) {
      const level = match[1].length;
      const text = match[2].trim();
      headings.push({ level, text, line: i });
    }
  }

  return headings;
}

/**
 * Compute the heading path (ancestry chain) for a given 0-origin line number.
 * Returns an array of heading strings in the format '#{level} {text}',
 * representing the hierarchy of ancestors up to and including the closest
 * heading at or before zeroOriginLine.
 * Returns [] when zeroOriginLine is before the first heading or on invalid input.
 */
export function getHeadingPath(noteText: string, zeroOriginLine: number): string[] {
  if (zeroOriginLine < 0) {
    return [];
  }

  const entries = parseHeadings(noteText).filter(e => e.line <= zeroOriginLine);

  if (entries.length === 0) {
    return [];
  }

  const stack: HeadingEntry[] = [];

  for (const entry of entries) {
    while (stack.length > 0 && stack[stack.length - 1].level >= entry.level) {
      stack.pop();
    }
    stack.push(entry);
  }

  return stack.map(entry => '#'.repeat(entry.level) + ' ' + entry.text);
}
