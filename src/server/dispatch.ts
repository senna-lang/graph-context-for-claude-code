/**
 * server/dispatch.ts — Pure routing function for JSON-RPC method dispatch. Maps method names to handler results. No WebSocket IO here.
 */

import type { JsonRpcRequest, JsonRpcResponse, JsonRpcId, ToolDefinition, ToolCallResult, InitializeResult } from '../protocol/types';
import { buildResponse, buildErrorResponse } from '../protocol/jsonrpc';

export type ToolHandler = (args: unknown) => Promise<ToolCallResult>;

export type DispatchContext = { tools: ToolDefinition[]; handlers: Map<string, ToolHandler>; serverVersion: string };

export async function handleInitialize(id: JsonRpcId, _params: unknown, ctx: DispatchContext): Promise<JsonRpcResponse> {
  const result: InitializeResult = {
    protocolVersion: '2024-11-05',
    capabilities: { tools: {} },
    serverInfo: { name: 'obsidian-claude-code-ide', version: ctx.serverVersion },
  };
  return buildResponse(id, result);
}

export async function handleToolsList(id: JsonRpcId, ctx: DispatchContext): Promise<JsonRpcResponse> {
  return buildResponse(id, { tools: ctx.tools });
}

export async function handleToolsCall(id: JsonRpcId, params: unknown, ctx: DispatchContext): Promise<JsonRpcResponse> {
  // Type-guard: params must be an object with string `name`
  if (typeof params !== 'object' || params === null || !('name' in params) || typeof (params as Record<string, unknown>).name !== 'string') {
    return buildErrorResponse(id, -32602, 'Invalid params');
  }

  const name = (params as Record<string, unknown>).name as string;
  const args = (params as Record<string, unknown>).arguments ?? {};

  const handler = ctx.handlers.get(name);
  if (!handler) {
    return buildErrorResponse(id, -32601, 'Tool not found: ' + name);
  }

  try {
    const result = await handler(args);
    return buildResponse(id, result);
  } catch (e) {
    return buildErrorResponse(id, -32603, e instanceof Error ? e.message : String(e));
  }
}

export async function dispatch(req: JsonRpcRequest, ctx: DispatchContext): Promise<JsonRpcResponse | null> {
  switch (req.method) {
    case 'initialize':
      return handleInitialize(req.id, req.params, ctx);
    case 'notifications/initialized':
      return null;
    case 'tools/list':
      return handleToolsList(req.id, ctx);
    case 'tools/call':
      return handleToolsCall(req.id, req.params, ctx);
    default:
      return buildErrorResponse(req.id, -32601, 'Method not found: ' + req.method);
  }
}
