/**
 * protocol/jsonrpc.ts — Pure functions for JSON-RPC 2.0 message parse/build. No IO. All errors returned as Result<T,E>.
 */

import type { Result, JsonRpcRequest, JsonRpcResponse, JsonRpcNotification, JsonRpcMessage, JsonRpcId, ToolCallResult } from './types';
import { ok, err } from './types';

export function parseMessage(raw: string): Result<JsonRpcMessage, string> {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return err('invalid jsonrpc');
    }
    if (parsed.jsonrpc !== '2.0') {
      return err('invalid jsonrpc');
    }
    return ok(parsed as JsonRpcMessage);
  } catch (e) {
    return err(String(e));
  }
}

export function buildResponse(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

export function buildErrorResponse(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message, data } };
}

export function buildNotification(method: string, params: unknown): JsonRpcNotification {
  return { jsonrpc: '2.0', method, params };
}

export function isRequest(msg: JsonRpcMessage): msg is JsonRpcRequest {
  return 'id' in msg && 'method' in msg;
}

export function isNotification(msg: JsonRpcMessage): msg is JsonRpcNotification {
  return !('id' in msg) && 'method' in msg;
}

export function isResponse(msg: JsonRpcMessage): msg is JsonRpcResponse {
  return 'id' in msg && !('method' in msg);
}

export function buildToolCallResult(text: string, isError?: boolean): ToolCallResult {
  return { content: [{ type: 'text', text }], isError: isError ?? false };
}
