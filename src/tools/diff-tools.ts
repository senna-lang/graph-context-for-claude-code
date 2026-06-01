/**
 * tools/diff-tools.ts — openDiff tool definition and handler (M4). Shows new_file_contents in temporary leaf, returns FILE_SAVED or DIFF_REJECTED.
 */

import type { ToolDefinition } from '../protocol/types';
import type { ToolEntry } from './registry';
import { buildToolCallResult } from '../protocol/jsonrpc';
import { isWithinBasePath } from '../obsidian/paths';

export type DiffContext = {
  showDiff: (oldPath: string, newPath: string, newContents: string, tabName: string) => Promise<'FILE_SAVED' | 'DIFF_REJECTED'>;
  basePath: string;
};

export const openDiffDef: ToolDefinition = {
  name: 'openDiff',
  description: 'Opens a diff view of proposed file contents in Obsidian for the user to accept or reject.',
  inputSchema: {
    type: 'object',
    properties: {
      old_file_path: { type: 'string' },
      new_file_path: { type: 'string' },
      new_file_contents: { type: 'string' },
      tab_name: { type: 'string' },
    },
    required: ['old_file_path', 'new_file_path', 'new_file_contents', 'tab_name'],
  },
};

export function makeDiffToolEntry(ctx: DiffContext): ToolEntry {
  return {
    definition: openDiffDef,
    handler: async (args: unknown) => {
      // Type guard: ensure args is an object with expected string properties
      if (
        typeof args !== 'object' ||
        args === null ||
        typeof (args as Record<string, unknown>).old_file_path !== 'string' ||
        typeof (args as Record<string, unknown>).new_file_path !== 'string' ||
        typeof (args as Record<string, unknown>).new_file_contents !== 'string' ||
        typeof (args as Record<string, unknown>).tab_name !== 'string'
      ) {
        return buildToolCallResult('Invalid arguments', true);
      }

      const { old_file_path, new_file_path, new_file_contents, tab_name } = args as {
        old_file_path: string;
        new_file_path: string;
        new_file_contents: string;
        tab_name: string;
      };

      // Guard both paths to ensure they are within vault
      if (!isWithinBasePath(old_file_path, ctx.basePath) || !isWithinBasePath(new_file_path, ctx.basePath)) {
        return buildToolCallResult('Refused: path outside vault', true);
      }

      try {
        const result = await ctx.showDiff(old_file_path, new_file_path, new_file_contents, tab_name);
        return buildToolCallResult(result);
      } catch (e) {
        return buildToolCallResult(e instanceof Error ? e.message : String(e), true);
      }
    },
  };
}
