import type { RenderCommandResultOptions, RenderCommandResultOutcome } from '../types/ui';
import { ResultView, renderResultViewText } from './result-view';
import type { InkRuntime } from './result-view';
import { safeImport, normalizeReact, type NormalizedReact } from '../utils/helpers';

interface InkRenderInstance {
  waitUntilExit?: () => Promise<void>;
  cleanup?: () => void;
}

interface InkModule {
  render: (element: unknown, options?: {
    stdout?: NodeJS.WriteStream;
    stderr?: NodeJS.WriteStream;
    exitOnCtrlC?: boolean;
  }) => InkRenderInstance;
  Box?: unknown;
  Text?: unknown;
}

export interface LoadedInkSupport {
  runtime: InkRuntime;
  render: InkModule['render'];
}

export async function renderCommandResultWithInk(
  result: Parameters<typeof renderResultViewText>[0],
  options: RenderCommandResultOptions = {},
): Promise<RenderCommandResultOutcome> {
  const text = renderResultViewText(result, options);
  const outputStream = chooseOutputStream(result, options);

  if (options.preferInk === false) {
    writeFallbackText(outputStream, text);
    return { mode: 'text', text, usedInk: false };
  }

  const support = await loadInkSupport();
  if (!support) {
    writeFallbackText(outputStream, text);
    return { mode: 'text', text, usedInk: false };
  }

  try {
    const node = ResultView({
      result,
      runtime: support.runtime,
      maxDataDepth: options.maxDataDepth,
      maxDataEntries: options.maxDataEntries,
      maxNextSteps: options.maxNextSteps,
    });

    const rendered = support.render(node, {
      stdout: options.stdout ?? process.stdout,
      stderr: options.stderr ?? process.stderr,
      exitOnCtrlC: false,
    });

    if (rendered.waitUntilExit) {
      await rendered.waitUntilExit();
    } else {
      rendered.cleanup?.();
    }

    return { mode: 'ink', text, usedInk: true };
  } catch {
    writeFallbackText(outputStream, text);
    return { mode: 'text', text, usedInk: false };
  }
}

export async function loadInkSupport(): Promise<LoadedInkSupport | null> {
  const [reactModule, inkModule] = await Promise.all([
    safeImport<Record<string, unknown>>('react'),
    safeImport<InkModule>('ink'),
  ]);

  const react = normalizeReact(reactModule);
  if (!react || !inkModule || typeof inkModule.render !== 'function') {
    return null;
  }

  return {
    runtime: {
      React: react,
      Box: inkModule.Box ?? 'Box',
      Text: inkModule.Text ?? 'Text',
    },
    render: inkModule.render,
  };
}

// safeImport 和 normalizeReact 已从 ../utils/helpers 导入

function chooseOutputStream(
  result: Parameters<typeof renderResultViewText>[0],
  options: RenderCommandResultOptions,
): NodeJS.WriteStream {
  if (result.status === 'failure' && options.stderr) {
    return options.stderr;
  }

  return options.stdout ?? process.stdout;
}

function writeFallbackText(stream: NodeJS.WriteStream, text: string): void {
  stream.write(`${text}\n`);
}

