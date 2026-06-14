import { inspect } from 'util';
import {
  CommandError,
  CommandOutputFormat,
  CommandResult,
  CommandResultMeta,
  CommandFailure,
  CommandSuccess
} from '../types/command';

export interface CommandRenderOptions {
  includeMeta?: boolean;
  jsonSpacing?: number;
}

export interface CommandPrintOptions extends CommandRenderOptions {
  format?: CommandOutputFormat;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
}

export type CommandErrorInput = string | Error | Partial<CommandError> | unknown;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function formatTextValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint' ||
    typeof value === 'undefined'
  ) {
    return String(value);
  }
  return inspect(value, { depth: 6, colors: false, compact: false, breakLength: 80 });
}

function toSerializable(value: unknown, seen = new WeakSet<object>()): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return value;
  }

  if (typeof value === 'undefined') return undefined;
  if (typeof value === 'symbol') return value.toString();
  if (typeof value === 'function') return `[Function${value.name ? `: ${value.name}` : ''}]`;

  if (value instanceof Error) {
    const cause = 'cause' in value ? toSerializable((value as Error & { cause?: unknown }).cause, seen) : undefined;
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      ...(cause === undefined ? {} : { cause })
    };
  }

  if (Array.isArray(value)) {
    return value.map(item => toSerializable(item, seen));
  }

  if (!isRecord(value)) {
    return String(value);
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  seen.add(value);
  const output: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    const serializable = toSerializable(nestedValue, seen);
    if (serializable !== undefined) {
      output[key] = serializable;
    }
  }
  seen.delete(value);
  return output;
}

export function createCommandError(input: CommandErrorInput): CommandError {
  if (typeof input === 'string') {
    return {
      code: 'UNKNOWN',
      message: input
    };
  }

  if (input instanceof Error) {
    const error = input as Error & { code?: unknown; details?: unknown; exitCode?: unknown };
    return {
      code: typeof error.code === 'string' ? error.code : 'UNKNOWN',
      message: error.message || error.name,
      details: error.details,
      cause: error,
      exitCode: typeof error.exitCode === 'number' ? error.exitCode : undefined
    };
  }

  if (isRecord(input)) {
    const code = typeof input.code === 'string' ? input.code : 'UNKNOWN';
    const message = typeof input.message === 'string' ? input.message : 'Command failed';
    return {
      code,
      message,
      details: input.details,
      cause: input.cause,
      exitCode: typeof input.exitCode === 'number' ? input.exitCode : undefined
    };
  }

  return {
    code: 'UNKNOWN',
    message: formatTextValue(input)
  };
}

export function success<T>(data: T, meta?: CommandResultMeta): CommandSuccess<T> {
  return {
    success: true,
    data,
    ...(meta ? { meta } : {})
  };
}

export function failure(error: CommandErrorInput, meta?: CommandResultMeta): CommandFailure {
  return {
    success: false,
    error: createCommandError(error),
    ...(meta ? { meta } : {})
  };
}

export function renderTextCommandResult<T>(result: CommandResult<T>, options: CommandRenderOptions = {}): string {
  const lines: string[] = [];
  const includeMeta = options.includeMeta !== false;

  if (result.success) {
    lines.push('Success');
    if (includeMeta && result.meta?.command) {
      lines.push(`Command: ${result.meta.command}`);
    }
    lines.push('Data:');
    lines.push(formatTextValue(result.data));
  } else {
    lines.push(`Failure [${result.error.code}]`);
    if (includeMeta && result.meta?.command) {
      lines.push(`Command: ${result.meta.command}`);
    }
    lines.push(`Message: ${result.error.message}`);
    if (result.error.details !== undefined) {
      lines.push('Details:');
      lines.push(formatTextValue(result.error.details));
    }
    if (result.error.cause !== undefined) {
      lines.push('Cause:');
      lines.push(formatTextValue(result.error.cause));
    }
  }

  if (includeMeta && result.meta) {
    const meta = { ...result.meta };
    delete meta.command;
    if (Object.keys(meta).length > 0) {
      lines.push('Meta:');
      lines.push(formatTextValue(meta));
    }
  }

  return lines.join('\n');
}

export function renderJsonCommandResult<T>(result: CommandResult<T>, options: CommandRenderOptions = {}): string {
  const includeMeta = options.includeMeta !== false;
  const payload: Record<string, unknown> = {
    success: result.success
  };

  if (result.success) {
    payload.data = toSerializable(result.data);
  } else {
    payload.error = toSerializable(result.error);
  }

  if (includeMeta && result.meta) {
    payload.meta = toSerializable(result.meta);
  }

  return JSON.stringify(payload, null, options.jsonSpacing ?? 2);
}

export function renderCommandResult<T>(
  result: CommandResult<T>,
  format: CommandOutputFormat = 'text',
  options: CommandRenderOptions = {}
): string {
  return format === 'json' ? renderJsonCommandResult(result, options) : renderTextCommandResult(result, options);
}

export function printCommandResult<T>(result: CommandResult<T>, options: CommandPrintOptions = {}): string {
  const rendered = renderCommandResult(result, options.format ?? 'text', options);
  const write = result.success ? options.stdout ?? console.log : options.stderr ?? console.error;
  write(rendered);

  if (!result.success) {
    process.exitCode = result.error.exitCode ?? 1;
  }

  return rendered;
}

/**
 * Resolve output format from options. Returns 'json' if --json was passed, 'text' otherwise.
 */
export function resolveFormat(options: { json?: boolean }): 'json' | 'text' {
  return options.json ? 'json' : 'text';
}
