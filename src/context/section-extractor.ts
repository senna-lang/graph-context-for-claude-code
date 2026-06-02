/**
 * context/section-extractor.ts — Pure functions to extract a heading section or block-id paragraph from raw note text. No Obsidian imports.
 */

/**
 * Extracts a section from noteText starting at the given heading.
 *
 * - Finds the FIRST line that is a heading (matching /^(#{1,6})\s+(.+)$/) whose heading text matches the input heading.
 * - Collects from that heading line (inclusive) until the next heading of equal or higher level (or EOF).
 * - Deeper subheadings are included.
 * - Returns the joined lines or null if heading not found.
 */
export function extractSectionByHeading(noteText: string, heading: string): string | null {
  const lines: string[] = noteText.split('\n');
  const headingRegex = /^(#{1,6})\s+(.+)$/;

  let matchedIndex = -1;
  let matchedLevel = 0;

  // Find the first heading that matches
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(headingRegex);
    if (match) {
      const level = match[1].length;
      const headingText = match[2].trim();
      if (headingText === heading.trim()) {
        matchedIndex = i;
        matchedLevel = level;
        break;
      }
    }
  }

  if (matchedIndex === -1) {
    return null;
  }

  // Collect from matched heading until next heading of equal or higher level
  const sectionLines: string[] = [lines[matchedIndex]];

  for (let i = matchedIndex + 1; i < lines.length; i++) {
    const match = lines[i].match(headingRegex);
    if (match) {
      const level = match[1].length;
      if (level <= matchedLevel) {
        // Stop before this heading
        break;
      }
    }
    sectionLines.push(lines[i]);
  }

  return sectionLines.join('\n');
}

/**
 * Extracts a paragraph containing the given block-id token.
 *
 * - Finds the FIRST line containing the block token (regex /\^<blockId>\s*$/).
 * - Walks up and down to find the enclosing paragraph (bounded by blank lines).
 * - Strips the block token from the paragraph.
 * - Returns the cleaned paragraph or null if block-id not found.
 */
export function extractBlock(noteText: string, blockId: string): string | null {
  const lines: string[] = noteText.split('\n');

  // Build regex to find block token
  const blockTokenRegex = new RegExp('\\^' + blockId + '\\s*$');

  let blockLineIndex = -1;

  // Find the first line containing the block token
  for (let i = 0; i < lines.length; i++) {
    if (blockTokenRegex.test(lines[i])) {
      blockLineIndex = i;
      break;
    }
  }

  if (blockLineIndex === -1) {
    return null;
  }

  // Walk up to find paragraph start
  let startIndex = blockLineIndex;
  while (startIndex > 0 && lines[startIndex - 1].trim() !== '') {
    startIndex--;
  }

  // Walk down to find paragraph end
  let endIndex = blockLineIndex;
  while (endIndex < lines.length - 1 && lines[endIndex + 1].trim() !== '') {
    endIndex++;
  }

  // Collect paragraph lines
  const paragraphLines: string[] = [];
  for (let i = startIndex; i <= endIndex; i++) {
    paragraphLines.push(lines[i]);
  }

  // Strip the block token from the line that actually contains it
  const blockLineRelativeIndex = blockLineIndex - startIndex;
  const lineWithToken = paragraphLines[blockLineRelativeIndex];
  const strippedLine = lineWithToken.replace(new RegExp('\\s*\\^' + blockId + '\\s*$'), '').trimEnd();
  paragraphLines[blockLineRelativeIndex] = strippedLine;

  return paragraphLines.join('\n');
}
