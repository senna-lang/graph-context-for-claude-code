/**
 * tools/selection-tools.ts — getCurrentSelection and getLatestSelection tool definitions and handlers. Reads from SelectionStateRef.
 */

import type { ToolDefinition, SelectionState } from '../protocol/types';
import type { ToolEntry } from './registry';
import { buildToolCallResult } from '../protocol/jsonrpc';

export type SelectionStateRef = { current: SelectionState | null; latest: SelectionState | null };

const getCurrentSelectionDef: ToolDefinition = {
  name: 'getCurrentSelection',
  description: 'Returns the currently selected text and position in the active Obsidian editor. Returns cursor position if nothing selected.',
  inputSchema: { type: 'object', properties: {}, required: [] },
};

const getLatestSelectionDef: ToolDefinition = {
  name: 'getLatestSelection',
  description: 'Returns the most recent non-empty selection in the active Obsidian editor.',
  inputSchema: { type: 'object', properties: {}, required: [] },
};

export function makeSelectionToolEntries(stateRef: SelectionStateRef): ToolEntry[] {
  return [
    {
      definition: getCurrentSelectionDef,
      handler: async () => buildToolCallResult(JSON.stringify(stateRef.current ?? null)),
    },
    {
      definition: getLatestSelectionDef,
      handler: async () => buildToolCallResult(JSON.stringify(stateRef.latest ?? null)),
    },
  ];
}
