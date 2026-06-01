/**
 * protocol/types.ts — JSON-RPC 2.0 / MCP IDE protocol type definitions. Branded types for type safety. Result<T,E> for error handling. Context/graph types for Obsidian vault integration. No runtime deps.
 */

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export type AuthToken = string & { readonly _brand: 'AuthToken' };

export type Port = number & { readonly _brand: 'Port' };

export type AbsolutePath = string & { readonly _brand: 'AbsolutePath' };

export type FileUrl = string & { readonly _brand: 'FileUrl' };

export type Position = { line: number; character: number };

export type SelectionRange = { start: Position; end: Position; isEmpty: boolean };

export type VaultPort = {
  resolveLink: (linkText: string, fromPath: string) => string | null;
  readNote: (path: string) => string | null;
  getFrontmatter: (path: string) => Record<string, unknown> | null;
  getBacklinks: (path: string) => Array<{ path: string; name: string }>;
  getSectionByHeading?: (path: string, heading: string) => string | null;
  getBlock?: (path: string, blockId: string) => string | null;
};

export type LinkSummary = {
  linkText: string;
  resolvedPath: string | null;
  kind: 'embed' | 'wikilink';
  expandedText?: string;
  summary?: string;
  truncated: boolean;
  unresolved: boolean;
};

export type EnrichedContext = {
  headingPath: string[];
  frontmatter: Record<string, unknown> | null;
  expandedText: string;
  linkedSummaries: LinkSummary[];
  backlinks: Array<{ path: string; name: string }>;
  truncated: { expandedText: boolean; totalContext: boolean; backlinks: boolean };
};

export type SelectionState = { filePath: AbsolutePath; fileUrl: FileUrl; text: string; selection: SelectionRange; context?: EnrichedContext };

export type JsonRpcId = string | number;

export type JsonRpcRequest = { jsonrpc: '2.0'; id: JsonRpcId; method: string; params?: unknown };

export type JsonRpcResponse = { jsonrpc: '2.0'; id: JsonRpcId; result?: unknown; error?: { code: number; message: string; data?: unknown } };

export type JsonRpcNotification = { jsonrpc: '2.0'; method: string; params?: unknown };

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

export type ToolInputSchema = { type: 'object'; properties?: Record<string, unknown>; required?: string[] };

export type ToolDefinition = { name: string; description: string; inputSchema: ToolInputSchema };

export type ToolCallResult = { content: Array<{ type: 'text'; text: string }>; isError: boolean };

export type LockFileData = { pid: number; workspaceFolders: string[]; ideName: string; transport: 'ws'; authToken: string };

export type ServerCapabilities = { tools: Record<string, never> };

export type InitializeResult = { protocolVersion: string; capabilities: ServerCapabilities; serverInfo: { name: string; version: string } };
