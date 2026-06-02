/**
 * context/context-builder.ts — Pure function to assemble EnrichedContext from selection state + VaultPort. Applies size caps (embed ~2000, wikilink summary ~200, total ~8000). No Obsidian imports. Refactored into buildNoteContext (note-level assembly) + assembleEnrichedContext (composition).
 */

import type { EnrichedContext, LinkSummary, VaultPort } from '../protocol/types';
import { expandLinks } from './link-expander';
import { getHeadingPath } from './heading-path';

export const TOTAL_CONTEXT_CAP = 8000;
export const BACKLINKS_CAP = 20;

export type BuildContextInput = {
  noteText: string;
  notePath: string;
  selectionStartLine: number;
};

export type NoteContext = Omit<EnrichedContext, 'headingPath'>;

export function buildNoteContext(
  noteText: string,
  notePath: string,
  port: VaultPort
): NoteContext {
  const frontmatter = port.getFrontmatter(notePath);
  const linkedSummaries = expandLinks(noteText, notePath, port);

  const rawBacklinks = port.getBacklinks(notePath);
  const backlinksTruncated = rawBacklinks.length > BACKLINKS_CAP;
  const backlinks = rawBacklinks.slice(0, BACKLINKS_CAP);

  let expandedText = linkedSummaries
    .filter((ls) => ls.kind === 'embed' && ls.expandedText !== undefined)
    .map((ls) => ls.expandedText as string)
    .join('\n\n');

  let expandedTextTruncated = false;
  let totalContextTruncated = false;

  // Measure total context size excluding headingPath (negligible contribution, intentionally omitted)
  const measure = (): number =>
    JSON.stringify({ frontmatter, expandedText, linkedSummaries, backlinks })
      .length;

  if (measure() > TOTAL_CONTEXT_CAP) {
    totalContextTruncated = true;
    const overflow = measure() - TOTAL_CONTEXT_CAP;
    const newLen = Math.max(0, expandedText.length - overflow - 16);
    expandedText = expandedText.slice(0, newLen) + '…[truncated]';
    expandedTextTruncated = true;
  }

  return {
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

export function assembleEnrichedContext(
  noteContext: NoteContext,
  headingPath: string[]
): EnrichedContext {
  return { headingPath, ...noteContext };
}

export function buildEnrichedContext(
  input: BuildContextInput,
  port: VaultPort
): EnrichedContext {
  const headingPath = getHeadingPath(input.noteText, input.selectionStartLine);
  const noteCtx = buildNoteContext(input.noteText, input.notePath, port);
  return assembleEnrichedContext(noteCtx, headingPath);
}
