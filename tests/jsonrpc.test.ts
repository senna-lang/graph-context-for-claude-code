/**
 * tests/jsonrpc.test.ts — Unit tests for protocol/jsonrpc.ts pure functions.
 */

import { describe, it, expect } from 'vitest';
import type { JsonRpcMessage } from '../src/protocol/types';
import {
  parseMessage,
  buildResponse,
  buildErrorResponse,
  buildNotification,
  buildToolCallResult,
  isRequest,
  isNotification,
  isResponse,
} from '../src/protocol/jsonrpc';

describe('parseMessage', () => {
  it('parses valid request with jsonrpc, id, and method', () => {
    const raw = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'test' });
    const result = parseMessage(raw);
    expect(result.ok).toBe(true);
    if (result.ok && isRequest(result.value)) {
      expect(result.value.jsonrpc).toBe('2.0');
      expect(result.value.method).toBe('test');
    } else {
      expect.fail('expected a valid JSON-RPC request');
    }
  });

  it('parses notification without id', () => {
    const raw = JSON.stringify({ jsonrpc: '2.0', method: 'notify' });
    const result = parseMessage(raw);
    expect(result.ok).toBe(true);
    if (result.ok && isNotification(result.value)) {
      expect(result.value.jsonrpc).toBe('2.0');
      expect(result.value.method).toBe('notify');
    } else {
      expect.fail('expected a JSON-RPC notification');
    }
  });

  it('returns err on malformed JSON', () => {
    const raw = '{bad';
    const result = parseMessage(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error).toBe('string');
    }
  });

  it('returns err when jsonrpc field is wrong version', () => {
    const raw = JSON.stringify({ jsonrpc: '1.0', id: 1, method: 'test' });
    const result = parseMessage(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('invalid jsonrpc');
    }
  });

  it('returns err when parsed value is not an object', () => {
    const raw = '"string"';
    const result = parseMessage(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('invalid jsonrpc');
    }
  });

  it('returns err when parsed value is null', () => {
    const raw = 'null';
    const result = parseMessage(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('invalid jsonrpc');
    }
  });
});

describe('buildResponse', () => {
  it('includes jsonrpc 2.0, id, and result', () => {
    const response = buildResponse(1, { success: true });
    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe(1);
    expect(response.result).toEqual({ success: true });
  });

  it('works with string id', () => {
    const response = buildResponse('abc', { data: 'test' });
    expect(response.id).toBe('abc');
    expect(response.result).toEqual({ data: 'test' });
  });
});

describe('buildErrorResponse', () => {
  it('includes error object with code and message', () => {
    const response = buildErrorResponse(1, -32600, 'Invalid Request');
    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe(1);
    expect(response.error?.code).toBe(-32600);
    expect(response.error?.message).toBe('Invalid Request');
  });

  it('includes optional data field when provided', () => {
    const response = buildErrorResponse(2, -32603, 'Internal error', { info: 'details' });
    expect(response.error?.data).toEqual({ info: 'details' });
  });

  it('omits data field when not provided', () => {
    const response = buildErrorResponse(3, -32700, 'Parse error');
    expect(response.error?.data).toBeUndefined();
  });
});

describe('buildNotification', () => {
  it('has no id field and sets method and params', () => {
    const notification = buildNotification('notify.event', { event: 'test' });
    expect(notification.jsonrpc).toBe('2.0');
    expect(notification.method).toBe('notify.event');
    expect(notification.params).toEqual({ event: 'test' });
    expect('id' in notification).toBe(false);
  });

  it('works with undefined params', () => {
    const notification = buildNotification('notify.empty', undefined);
    expect(notification.method).toBe('notify.empty');
    expect(notification.params).toBeUndefined();
  });
});

describe('buildToolCallResult', () => {
  it('defaults isError to false', () => {
    const result = buildToolCallResult('output text');
    expect(result.isError).toBe(false);
  });

  it('wraps text in content array as type text', () => {
    const result = buildToolCallResult('output text');
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({ type: 'text', text: 'output text' });
  });

  it('sets isError to true when explicitly provided', () => {
    const result = buildToolCallResult('error message', true);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('error message');
  });

  it('sets isError to false when explicitly provided', () => {
    const result = buildToolCallResult('success message', false);
    expect(result.isError).toBe(false);
  });
});

describe('type guards', () => {
  describe('isRequest', () => {
    it('returns true for messages with id and method', () => {
      const msg = { jsonrpc: '2.0', id: 1, method: 'test' } as JsonRpcMessage;
      expect(isRequest(msg)).toBe(true);
    });

    it('returns false for notifications without id', () => {
      const msg = { jsonrpc: '2.0', method: 'notify' } as JsonRpcMessage;
      expect(isRequest(msg)).toBe(false);
    });

    it('returns false for responses without method', () => {
      const msg = { jsonrpc: '2.0', id: 1, result: 'data' } as JsonRpcMessage;
      expect(isRequest(msg)).toBe(false);
    });
  });

  describe('isNotification', () => {
    it('returns true for messages with method but no id', () => {
      const msg = { jsonrpc: '2.0', method: 'notify' } as JsonRpcMessage;
      expect(isNotification(msg)).toBe(true);
    });

    it('returns false for requests with id and method', () => {
      const msg = { jsonrpc: '2.0', id: 1, method: 'test' } as JsonRpcMessage;
      expect(isNotification(msg)).toBe(false);
    });

    it('returns false for responses without method', () => {
      const msg = { jsonrpc: '2.0', id: 1, result: 'data' } as JsonRpcMessage;
      expect(isNotification(msg)).toBe(false);
    });
  });

  describe('isResponse', () => {
    it('returns true for messages with id but no method', () => {
      const msg = { jsonrpc: '2.0', id: 1, result: 'data' } as JsonRpcMessage;
      expect(isResponse(msg)).toBe(true);
    });

    it('returns true for error responses with id', () => {
      const msg = { jsonrpc: '2.0', id: 1, error: { code: -32600, message: 'Invalid Request' } } as JsonRpcMessage;
      expect(isResponse(msg)).toBe(true);
    });

    it('returns false for requests with method and id', () => {
      const msg = { jsonrpc: '2.0', id: 1, method: 'test' } as JsonRpcMessage;
      expect(isResponse(msg)).toBe(false);
    });

    it('returns false for notifications without id', () => {
      const msg = { jsonrpc: '2.0', method: 'notify' } as JsonRpcMessage;
      expect(isResponse(msg)).toBe(false);
    });
  });
});
