/**
 * context/context-builder.ts — Pure function to assemble EnrichedContext from selection state + VaultPort. Applies size caps (embed ~2000, wikilink summary ~200, total ~8000). No Obsidian imports.
 */

import type { EnrichedContext, VaultPort } from '../protocol/types';
import { expandLinks } from './link-expander';
import { getHeadingPath } from './heading-path';

export const TOTAL_CONTEXT_CAP = 8000;
export const BACKLINKS_CAP = 20;

export type BuildContextInput = {
  noteText: string;
  notePath: string;
  selectionStartLine: number;
};

export function buildEnrichedContext(
  input: BuildContextInput,
  port: VaultPort
): EnrichedContext {
  const headingPath = getHeadingPath(input.noteText, input.selectionStartLine);
  const frontmatter = port.getFrontmatter(input.notePath);
  const linkedSummaries = expandLinks(input.noteText, input.notePath, port);

  const rawBacklinks = port.getBacklinks(input.notePath);
  const backlinksTruncated = rawBacklinks.length > BACKLINKS_CAP;
  const backlinks = rawBacklinks.slice(0, BACKLINKS_CAP);

  let expandedText = linkedSummaries
    .filter((ls) => ls.kind === 'embed' && ls.expandedText !== undefined)
    .map((ls) => ls.expandedText as string)
    .join('\n\n');

  let expandedTextTruncated = false;
  let totalContextTruncated = false;

  const measure = (): number =>
    JSON.stringify({ headingPath, frontmatter, expandedText, linkedSummaries, backlinks })
      .length;

  if (measure() > TOTAL_CONTEXT_CAP) {
    totalContextTruncated = true;
    const overflow = measure() - TOTAL_CONTEXT_CAP;
    const newLen = Math.max(0, expandedText.length - overflow - 16);
    expandedText = expandedText.slice(0, newLen) + '…[truncated]';
    expandedTextTruncated = true;
  }

  return {
    headingPath,
    frontmatter,
    expandedText,
    linkedSummaries,
    backlinks,
    truncated: {
      expandedText: expandedTextTruncated,
      totalContext: totalContextTruncated,
      backlinks: backlinksTruncated,
    },
  };
}
