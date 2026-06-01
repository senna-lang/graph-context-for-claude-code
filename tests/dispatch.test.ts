/**
 * tests/dispatch.test.ts — Unit tests for server/dispatch.ts pure routing functions.
 */

import { describe, it, expect } from 'vitest';
import { dispatch } from '../src/server/dispatch';
import type { DispatchContext } from '../src/server/dispatch';
import type { JsonRpcRequest } from '../src/protocol/types';

function buildCtx(): DispatchContext {
  return {
    tools: [
      {
        name: 'getCurrentSelection',
        description: 'get selection',
        inputSchema: { type: 'object' },
      },
    ],
    handlers: new Map([
      [
        'getCurrentSelection',
        async () => ({
          content: [{ type: 'text' as const, text: '{}' }],
          isError: false,
        }),
      ],
    ]),
    serverVersion: '0.1.0',
  };
}

describe('dispatch', () => {
  it('returns initialize result with protocolVersion 2024-11-05', async () => {
    const ctx = buildCtx();
    const req: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
    };
    const res = await dispatch(req, ctx);
    expect(res).not.toBeNull();
    if (res === null) throw new Error('unreachable');
    const protocolVersion = (res.result as { protocolVersion: string }).protocolVersion;
    expect(protocolVersion).toBe('2024-11-05');
  });

  it('returns tools list with registered tools', async () => {
    const ctx = buildCtx();
    const req: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    };
    const res = await dispatch(req, ctx);
    expect(res).not.toBeNull();
    if (res === null) throw new Error('unreachable');
    const tools = (res.result as { tools: unknown[] }).tools;
    expect(tools).toHaveLength(1);
  });

  it('calls tool handler for tools/call', async () => {
    const ctx = buildCtx();
    const req: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'getCurrentSelection', arguments: {} },
    };
    const res = await dispatch(req, ctx);
    expect(res).not.toBeNull();
    if (res === null) throw new Error('unreachable');
    const content = (res.result as { content: Array<{ type: string; text: string }> }).content;
    expect(content[0].text).toBe('{}');
  });

  it('returns error for unknown method', async () => {
    const ctx = buildCtx();
    const req: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'nope',
    };
    const res = await dispatch(req, ctx);
    expect(res).not.toBeNull();
    if (res === null) throw new Error('unreachable');
    const errorCode = (res.error as { code: number }).code;
    expect(errorCode).toBe(-32601);
  });

  it('returns null for notifications/initialized', async () => {
    const ctx = buildCtx();
    const req: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'notifications/initialized',
    };
    const res = await dispatch(req, ctx);
    expect(res).toBeNull();
  });

  it('returns error when tool name not found', async () => {
    const ctx = buildCtx();
    const req: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'missing', arguments: {} },
    };
    const res = await dispatch(req, ctx);
    expect(res).not.toBeNull();
    if (res === null) throw new Error('unreachable');
    const errorCode = (res.error as { code: number }).code;
    expect(errorCode).toBe(-32601);
  });
});
