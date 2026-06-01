/**
 * tools/registry.ts — Assembles MCP tool definitions and wires handler functions for use by dispatch.
 */

import type { ToolDefinition } from '../protocol/types';
import type { ToolHandler } from '../server/dispatch';

export type ToolEntry = { definition: ToolDefinition; handler: ToolHandler };

export function makeRegistry(entries: ToolEntry[]): { tools: ToolDefinition[]; handlers: Map<string, ToolHandler> } {
  return {
    tools: entries.map(e => e.definition),
    handlers: new Map(entries.map(e => [e.definition.name, e.handler])),
  };
}
