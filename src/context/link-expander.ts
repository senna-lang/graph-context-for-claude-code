/**
 * context/link-expander.ts — Pure logic to parse, classify, and expand/summarize Obsidian wikilinks and embeds from note text. Depth-1 expansion only. Cycle/self guard. Explicit truncation flags. No Obsidian imports — VaultPort is injected.
 */

import type { VaultPort, LinkSummary } from '../protocol/types';

export type ParsedLink = {
  raw: string;
  linkText: string;
  alias: string | null;
  heading: string | null;
  blockId: string | null;
  isEmbed: boolean;
};

export const EMBED_CAP = 2000;
export const WIKILINK_SUMMARY_CAP = 200;

/**
 * Truncate text to cap, append '…[truncated]' if exceeded.
 */
export function truncateWithFlag(
  text: string,
  cap: number
): { text: string; truncated: boolean } {
  if (text.length <= cap) {
    return { text, truncated: false };
  }
  return { text: text.slice(0, cap) + '…[truncated]', truncated: true };
}

/**
 * Parse wikilinks and embeds from note text, skipping code blocks.
 */
export function parseLinks(noteText: string): ParsedLink[] {
  // Blank out fenced code blocks
  const blanked = blankCodeBlocks(noteText);

  // Match all [[...]] and ![...] patterns
  const linkPattern = /(!?)\[\[([^\]]+)\]\]/g;
  const results: ParsedLink[] = [];
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(blanked)) !== null) {
    const isEmbed = match[1] === '!';
    const inner = match[2];
    const raw = match[0];

    // Split on '|' for alias
    const [target, alias] = inner.split('|').map((s) => s.trim());

    // Parse target for heading/blockId
    const parts = target.split('#');
    const linkText = parts[0].trim();
    let heading: string | null = null;
    let blockId: string | null = null;

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      if (part.startsWith('^')) {
        blockId = part.substring(1);
      } else {
        heading = part;
      }
    }

    results.push({
      raw,
      linkText,
      alias: alias || null,
      heading,
      blockId,
      isEmbed,
    });
  }

  return results;
}

/**
 * Blank out fenced code blocks by replacing them with spaces.
 */
function blankCodeBlocks(text: string): string {
  let result = text;
  const fencePattern = /```[\s\S]*?```/g;
  let match: RegExpExecArray | null;

  // We need to track positions and replace
  const replacements: Array<{ start: number; end: number; replacement: string }> = [];
  const tempPattern = /```[\s\S]*?```/g;

  while ((match = tempPattern.exec(text)) !== null) {
    const replacement = ' '.repeat(match[0].length);
    replacements.push({
      start: match.index,
      end: match.index + match[0].length,
      replacement,
    });
  }

  // Apply replacements in reverse order to maintain indices
  let output = result;
  for (let i = replacements.length - 1; i >= 0; i--) {
    const { start, end, replacement } = replacements[i];
    output = output.slice(0, start) + replacement + output.slice(end);
  }

  return output;
}

/**
 * Expand an embed link: fetch content and truncate.
 */
export function expandEmbed(
  parsed: ParsedLink,
  fromPath: string,
  port: VaultPort
): { expandedText: string; truncated: boolean; unresolved: boolean } {
  const resolved = port.resolveLink(parsed.linkText, fromPath);

  if (resolved === null) {
    return {
      expandedText: '[[' + parsed.linkText + ']] (unresolved)',
      truncated: false,
      unresolved: true,
    };
  }

  if (resolved === fromPath) {
    return {
      expandedText: '[[' + parsed.linkText + ']] (self-reference skipped)',
      truncated: false,
      unresolved: false,
    };
  }

  let body: string | null = null;

  if (parsed.heading != null && port.getSectionByHeading) {
    body = port.getSectionByHeading(resolved, parsed.heading);
  } else if (parsed.blockId != null && port.getBlock) {
    body = port.getBlock(resolved, parsed.blockId);
  } else {
    body = port.readNote(resolved);
  }

  if (body === null) {
    return {
      expandedText: '[[' + parsed.linkText + ']] (unresolved)',
      truncated: false,
      unresolved: true,
    };
  }

  const t = truncateWithFlag(body, EMBED_CAP);
  return { expandedText: t.text, truncated: t.truncated, unresolved: false };
}

/**
 * Summarize a wikilink: frontmatter + first paragraph.
 */
export function summarizeWikilink(
  parsed: ParsedLink,
  fromPath: string,
  port: VaultPort
): { summary: string; truncated: boolean; unresolved: boolean } {
  const resolved = port.resolveLink(parsed.linkText, fromPath);

  if (resolved === null) {
    return {
      summary: '[[' + parsed.linkText + ']] (unresolved)',
      truncated: false,
      unresolved: true,
    };
  }

  const fm = port.getFrontmatter(resolved);
  const fmStr = fm
    ? Object.entries(fm)
        .map(([k, v]) => k + ': ' + String(v))
        .join('\n')
    : '';

  const text = port.readNote(resolved) ?? '';
  const firstParagraph = extractFirstParagraph(text);
  const combined = (fmStr ? fmStr + '\n' : '') + firstParagraph;
  const t = truncateWithFlag(combined, WIKILINK_SUMMARY_CAP);

  return { summary: t.text, truncated: t.truncated, unresolved: false };
}

/**
 * Extract first non-empty paragraph, skipping frontmatter block.
 */
function extractFirstParagraph(text: string): string {
  const lines = text.split('\n');
  let i = 0;

  // Skip leading frontmatter block (--- ... ---)
  if (lines[0]?.trim() === '---') {
    i = 1;
    while (i < lines.length && lines[i]?.trim() !== '---') {
      i++;
    }
    if (i < lines.length) {
      i++; // skip closing ---
    }
  }

  // Find first non-empty line
  while (i < lines.length && !lines[i]?.trim()) {
    i++;
  }

  return i < lines.length ? lines[i].trim() : '';
}

/**
 * Expand all links in note text, returning structured summaries.
 */
export function expandLinks(
  noteText: string,
  fromPath: string,
  port: VaultPort
): LinkSummary[] {
  const parsed = parseLinks(noteText);
  const results: LinkSummary[] = [];

  for (const p of parsed) {
    const resolvedPath = port.resolveLink(p.linkText, fromPath);

    if (p.isEmbed) {
      const e = expandEmbed(p, fromPath, port);
      results.push({
        linkText: p.linkText,
        resolvedPath,
        kind: 'embed',
        expandedText: e.expandedText,
        truncated: e.truncated,
        unresolved: e.unresolved,
      });
    } else {
      const s = summarizeWikilink(p, fromPath, port);
      results.push({
        linkText: p.linkText,
        resolvedPath,
        kind: 'wikilink',
        summary: s.summary,
        truncated: s.truncated,
        unresolved: s.unresolved,
      });
    }
  }

  return results;
}
