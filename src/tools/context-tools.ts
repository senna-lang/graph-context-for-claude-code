/**
 * tools/context-tools.ts — getSelectionWithContext and getNoteExpanded tool definitions and handlers. Reads SelectionStateRef and builds EnrichedContext via an injected builder function. Path-guards getNoteExpanded against vault-external access.
 */

import type { ToolDefinition, EnrichedContext } from '../protocol/types';
import type { ToolEntry } from './registry';
import type { SelectionStateRef } from './selection-tools';
import { buildToolCallResult } from '../protocol/jsonrpc';
import { isWithinBasePath } from '../obsidian/paths';

export type ContextToolsDeps = {
  stateRef: SelectionStateRef;
  buildContext: (notePath: string, noteText: string, selectionStartLine: number) => EnrichedContext;
  readNote: (path: string) => string | null;
  basePath: string;
};

const getSelectionWithContextDef: ToolDefinition = {
  name: 'getSelectionWithContext',
  description: 'Returns the current selection state enriched with heading path, frontmatter, embed expansions, wikilink summaries, and backlinks.',
  inputSchema: { type: 'object', properties: {}, required: [] },
};

const getNoteExpandedDef: ToolDefinition = {
  name: 'getNoteExpanded',
  description: 'Returns the full note at the given vault-absolute path enriched with context (embeds expanded, wikilinks summarized, backlinks).',
  inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
};

export function makeContextToolEntries(deps: ContextToolsDeps): ToolEntry[] {
  return [
    {
      definition: getSelectionWithContextDef,
      handler: async () => {
        const state = deps.stateRef.current;
        if (!state) return buildToolCallResult(JSON.stringify(null));
        const filePath = state.filePath as unknown as string;
        const noteText = deps.readNote(filePath) ?? '';
        const context = deps.buildContext(filePath, noteText, state.selection.start.line);
        return buildToolCallResult(JSON.stringify({ ...state, context }));
      },
    },
    {
      definition: getNoteExpandedDef,
      handler: async (args: unknown) => {
        if (typeof args !== 'object' || args === null || typeof (args as { path?: unknown }).path !== 'string') {
          return buildToolCallResult('Invalid arguments: path required', true);
        }
        const path = (args as { path: string }).path;
        if (!isWithinBasePath(path, deps.basePath)) {
          return buildToolCallResult('Refused: path outside vault', true);
        }
        const noteText = deps.readNote(path);
        if (noteText === null) {
          return buildToolCallResult('Note not found: ' + path, true);
        }
        const context = deps.buildContext(path, noteText, 0);
        return buildToolCallResult(JSON.stringify({ path, context }));
      },
    },
  ];
}
