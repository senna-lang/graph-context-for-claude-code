/**
 * server/ide-server.ts — WebSocket server on 127.0.0.1. Auth token validation, JSON-RPC dispatch, selection_changed push. Returns Result<IdeServer,string>.
 */

import WebSocket, { WebSocketServer } from 'ws';
import * as net from 'net';
import type { AuthToken, Port, SelectionState, Result } from '../protocol/types';
import { ok, err } from '../protocol/types';
import { parseMessage, buildNotification, buildErrorResponse, isRequest } from '../protocol/jsonrpc';
import type { DispatchContext } from './dispatch';
import { dispatch } from './dispatch';

export type IdeServer = {
  port: Port;
  authToken: AuthToken;
  broadcast: (state: SelectionState) => void;
  close: () => Promise<void>;
};

export async function findFreePort(startPort: number, endPort: number): Promise<Result<Port, string>> {
  const range = endPort - startPort;
  const base = startPort + (process.pid % range);
  const step = Math.floor(range / 20) + 1;

  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = startPort + ((base - startPort + attempt * step) % range);

    const available = await new Promise<boolean>((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close(() => resolve(true));
      });
      server.listen(candidate, '127.0.0.1');
    });

    if (available) {
      return ok(candidate as Port);
    }
  }

  return err('no free port available in range');
}

export async function startIdeServer(authToken: AuthToken, ctx: DispatchContext): Promise<Result<IdeServer, string>> {
  try {
    const portResult = await findFreePort(10000, 65535);
    if (!portResult.ok) { return err(portResult.error); }
    const port = portResult.value;
    const wss = new WebSocketServer({ host: '127.0.0.1', port });

    wss.on('connection', (ws, req) => {
      const header = req.headers['x-claude-code-ide-authorization'];
      const provided = Array.isArray(header) ? header[0] : header;
      if (provided !== authToken) {
        ws.close(4001, 'Unauthorized');
        return;
      }

      ws.on('message', (data) => {
        const raw = typeof data === 'string' ? data : data.toString();
        const parsed = parseMessage(raw);
        if (!parsed.ok) {
          ws.send(JSON.stringify(buildErrorResponse(0, -32700, parsed.error)));
          return;
        }

        const msg = parsed.value;
        if (!isRequest(msg)) return;

        dispatch(msg, ctx)
          .then((response) => {
            if (response !== null) ws.send(JSON.stringify(response));
          })
          .catch(() => {
            /* swallow */
          });
      });
    });

    const broadcast = (state: SelectionState): void => {
      const note = JSON.stringify(buildNotification('selection_changed', state));
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) client.send(note);
      });
    };

    const close = (): Promise<void> =>
      new Promise((resolve) => {
        wss.close(() => resolve());
      });

    return ok({ port, authToken, broadcast, close });
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
