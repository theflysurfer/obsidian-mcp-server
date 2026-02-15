import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

export function notFound(resource: string, detail?: string): McpError {
  const msg = detail ? `${resource}: ${detail}` : `${resource} not found`;
  return new McpError(ErrorCode.InvalidRequest, msg);
}

export function invalidParams(message: string): McpError {
  return new McpError(ErrorCode.InvalidParams, message);
}

export function internalError(message: string): McpError {
  return new McpError(ErrorCode.InternalError, message);
}

export function methodNotFound(action: string): McpError {
  return new McpError(ErrorCode.MethodNotFound, `Unknown action: ${action}`);
}
