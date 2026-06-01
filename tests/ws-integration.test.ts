/**
 * tests/ws-integration.test.ts — Integration test: real WebSocket server on loopback, verifies auth, handshake, and tools/list.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import { randomUUID } from 'crypto';
import { startIdeServer } from '../src/server/ide-server';
import type { IdeServer } from '../src/server/ide-server';
import type { DispatchContext } from '../src/server/dispatch';
import type { AuthToken } from '../src/protocol/types';

function makeTestCtx(): DispatchContext {
  return {
    tools: [{ name: 'getCurrentSelection', description: 'get', inputSchema: { type: 'object' } }],
    handlers: new Map([['getCurrentSelection', async () => ({ content: [{ type: 'text' as const, text: '{}' }], isError: false })]]),
    serverVersion: '0.1.0',
  };
}

async function sendAndReceive(ws: WebSocket, msg: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('timeout'));
    }, 5000);

    ws.once('message', (data) => {
      clearTimeout(timeoutId);
      resolve(JSON.parse(data.toString()));
    });

    ws.send(JSON.stringify(msg));
  });
}

let server: IdeServer;
let token: AuthToken;

beforeAll(async () => {
  token = randomUUID() as AuthToken;
  const r = await startIdeServer(token, makeTestCtx());
  if (!r.ok) throw new Error(r.error);
  server = r.value;
});

afterAll(async () => {
  if (server) await server.close();
});

async function connect(authToken: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, {
      headers: { 'x-claude-code-ide-authorization': authToken },
    });

    ws.on('open', () => {
      resolve(ws);
    });

    ws.on('error', (err) => {
      reject(err);
    });
  });
}

describe('WS integration', () => {
  it('connects with correct auth header, initialize response has protocolVersion 2024-11-05', async () => {
    const ws = await connect(token);
    const res = await sendAndReceive(ws, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    expect((res as { result: { protocolVersion: string } }).result.protocolVersion).toBe('2024-11-05');
    ws.close();
  });

  it('rejects connection with wrong auth token — close code 4001', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, {
      headers: { 'x-claude-code-ide-authorization': 'wrong' },
    });

    const code = await new Promise<number>((resolve) => {
      ws.on('close', (c) => {
        resolve(c);
      });
      ws.on('error', () => {
        /* ignore */
      });
    });

    expect(code).toBe(4001);
  });

  it('tools/list response contains getCurrentSelection', async () => {
    const ws = await connect(token);
    const res = await sendAndReceive(ws, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const tools = (res as { result: { tools: Array<{ name: string }> } }).result.tools;
    expect(tools.some((t) => t.name === 'getCurrentSelection')).toBe(true);
    ws.close();
  });
});
