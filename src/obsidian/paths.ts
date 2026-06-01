/**
 * obsidian/paths.ts — Pure functions for absolute path construction, fileUrl encoding, and Obsidian selection normalization (anchor/head -> start/end, ch -> character). No Obsidian API imports — fully unit-testable.
 */

import * as path from 'path';
import type { AbsolutePath, FileUrl, SelectionRange, Position } from '../protocol/types';

/**
 * Converts a relative path to an absolute path.
 */
export function toAbsolutePath(basePath: string, relativePath: string): AbsolutePath {
  return path.resolve(basePath, relativePath) as AbsolutePath;
}

/**
 * Converts an absolute path to a file URL.
 */
export function toFileUrl(absolutePath: AbsolutePath): FileUrl {
  return ('file://' + encodeURI(absolutePath)) as FileUrl;
}

/**
 * Mirrors Obsidian's EditorPosition format with line and ch (character).
 */
export type ObsidianPos = { line: number; ch: number };

/**
 * Mirrors Obsidian's selection format with anchor and head positions.
 */
export type ObsidianSelection = { anchor: ObsidianPos; head: ObsidianPos };

/**
 * Converts Obsidian position format to protocol Position format.
 */
export function normalizePosition(pos: ObsidianPos): Position {
  return { line: pos.line, character: pos.ch };
}

/**
 * Normalizes Obsidian selection to protocol SelectionRange format.
 * Ensures start <= end regardless of anchor/head order.
 */
export function normalizeSelection(sel: ObsidianSelection): SelectionRange {
  const isAnchorBeforeHead =
    sel.anchor.line < sel.head.line ||
    (sel.anchor.line === sel.head.line && sel.anchor.ch <= sel.head.ch);

  const startPos = isAnchorBeforeHead ? sel.anchor : sel.head;
  const endPos = isAnchorBeforeHead ? sel.head : sel.anchor;

  const isEmpty = sel.anchor.line === sel.head.line && sel.anchor.ch === sel.head.ch;

  return {
    start: normalizePosition(startPos),
    end: normalizePosition(endPos),
    isEmpty,
  };
}

/**
 * Checks if an absolute path is within a base path.
 * Prevents vault-external writes.
 */
export function isWithinBasePath(absolutePath: string, basePath: string): boolean {
  const resolvedBase = path.resolve(basePath);
  return absolutePath === resolvedBase || absolutePath.startsWith(resolvedBase + path.sep);
}
