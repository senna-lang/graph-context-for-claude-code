/**
 * tools/workspace-tools.ts — getWorkspaceFolders, getOpenEditors, openFile tool definitions and handlers.
 */

import type { ToolDefinition, AbsolutePath } from '../protocol/types';
import type { ToolEntry } from './registry';
import { buildToolCallResult } from '../protocol/jsonrpc';
import { toFileUrl, isWithinBasePath } from '../obsidian/paths';
import * as path from 'path';

export type OpenEditor = { filePath: AbsolutePath; active: boolean };

export type OpenFileOptions = {
  preview?: boolean;
  startText?: string;
  endText?: string;
  selectToEndOfLine?: boolean;
  makeFrontmost?: boolean;
};

export type WorkspaceContext = {
  getWorkspaceFolders: () => string[];
  getOpenEditors: () => OpenEditor[];
  openFile: (filePath: string, options: OpenFileOptions) => Promise<boolean>;
  basePath: string;
};

const getWorkspaceFoldersDef: ToolDefinition = {
  name: 'getWorkspaceFolders',
  description: 'Returns the workspace (vault) root folders.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

const getOpenEditorsDef: ToolDefinition = {
  name: 'getOpenEditors',
  description: 'Returns the list of currently open editors with their file paths and active flag.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

const openFileDef: ToolDefinition = {
  name: 'openFile',
  description: 'Opens a file in Obsidian.',
  inputSchema: {
    type: 'object',
    properties: {
      filePath: { type: 'string' },
      preview: { type: 'boolean' },
      startText: { type: 'string' },
      endText: { type: 'string' },
      selectToEndOfLine: { type: 'boolean' },
      makeFrontmost: { type: 'boolean' },
    },
    required: ['filePath'],
  },
};

export function makeWorkspaceToolEntries(ctx: WorkspaceContext): ToolEntry[] {
  return [
    {
      definition: getWorkspaceFoldersDef,
      handler: async () => {
        const folders = ctx.getWorkspaceFolders().map(p => ({
          path: p,
          name: path.basename(p),
          uri: toFileUrl(p as AbsolutePath),
        }));
        return buildToolCallResult(JSON.stringify({ folders }));
      },
    },
    {
      definition: getOpenEditorsDef,
      handler: async () => buildToolCallResult(JSON.stringify(ctx.getOpenEditors())),
    },
    {
      definition: openFileDef,
      handler: async (args: unknown) => {
        // Type guard: args must be an object with filePath
        if (typeof args !== 'object' || args === null) {
          return buildToolCallResult('Invalid arguments: filePath required', true);
        }

        const argsObj = args as Record<string, unknown>;
        const filePath = argsObj.filePath;

        if (typeof filePath !== 'string') {
          return buildToolCallResult('Invalid arguments: filePath required', true);
        }

        // Guard vault-external paths
        if (!isWithinBasePath(filePath, ctx.basePath)) {
          return buildToolCallResult('Refused: path outside vault', true);
        }

        // Extract options defensively
        const opts: OpenFileOptions = {
          preview: typeof argsObj.preview === 'boolean' ? argsObj.preview : undefined,
          startText: typeof argsObj.startText === 'string' ? argsObj.startText : undefined,
          endText: typeof argsObj.endText === 'string' ? argsObj.endText : undefined,
          selectToEndOfLine: typeof argsObj.selectToEndOfLine === 'boolean' ? argsObj.selectToEndOfLine : undefined,
          makeFrontmost: typeof argsObj.makeFrontmost === 'boolean' ? argsObj.makeFrontmost : undefined,
        };

        const okOpened = await ctx.openFile(filePath, opts);
        return buildToolCallResult(okOpened ? 'FILE_OPENED' : 'OPEN_FAILED', !okOpened);
      },
    },
  ];
}
