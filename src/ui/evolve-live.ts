import { EventEmitter } from 'events';

export interface EvolveLiveSessionOptions {
  skillName: string;
  verbose: boolean;
  apply: boolean;
  preferInk?: boolean;
}

export type EvolveLivePhase =
  | 'load'
  | 'model'
  | 'static'
  | 'context'
  | 'thinking'
  | 'recommend'
  | 'apply'
  | 'done'
  | 'error';

interface InkRenderInstance {
  waitUntilExit?: () => Promise<void>;
  unmount?: () => void;
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

interface ReactModule {
  createElement: (...args: unknown[]) => unknown;
  useEffect: (...args: unknown[]) => unknown;
  useState: (...args: unknown[]) => unknown;
}

interface EvolveLiveState {
  skillName: string;
  verbose: boolean;
  apply: boolean;
  startedAt: number;
  phase: EvolveLivePhase;
  phaseDetail?: string;
  logs: string[];
  thinkingText: string;
  recommendationSummary?: string;
  appliedSummary?: string;
  done: boolean;
  error?: string;
  frame: number;
}

export interface EvolveLiveSession {
  phase: (phase: EvolveLivePhase, detail?: string) => void;
  log: (line: string) => void;
  thinking: (chunk: string) => void;
  recommendSummary: (text: string) => void;
  applySummary: (text: string) => void;
  fail: (message: string) => void;
  finish: () => void;
  stop: () => Promise<void>;
}

const MAX_LOG_LINES = 8;
const MAX_THINKING_CHARS = 2400;
const SPINNER_FRAMES = ['◐', '◓', '◑', '◒'];
const PHASES: EvolveLivePhase[] = ['load', 'model', 'static', 'context', 'thinking', 'recommend', 'apply', 'done'];

export async function createEvolveLiveSession(options: EvolveLiveSessionOptions): Promise<EvolveLiveSession | null> {
  if (options.preferInk === false) return null;
  if (!process.stdout.isTTY || !process.stdin.isTTY) return null;
  if (process.env.SA_NO_INK === '1') return null;

  const [reactMod, inkMod] = await Promise.all([
    safeImport<Record<string, unknown>>('react'),
    safeImport<InkModule>('ink'),
  ]);

  const react = normalizeReact(reactMod);
  if (!react || !inkMod || typeof inkMod.render !== 'function') {
    return null;
  }

  const bus = new EventEmitter();
  const state: EvolveLiveState = {
    skillName: options.skillName,
    verbose: options.verbose,
    apply: options.apply,
    startedAt: Date.now(),
    phase: 'load',
    logs: [],
    thinkingText: '',
    done: false,
    frame: 0,
  };

  const View = createLiveViewComponent(react, inkMod, bus, state);
  const instance = inkMod.render(View, { stdout: process.stdout, stderr: process.stderr, exitOnCtrlC: false });

  const emit = (event: string, payload?: unknown) => {
    bus.emit(event, payload);
  };

  return {
    phase: (phase, detail) => emit('phase', { phase, detail }),
    log: (line) => emit('log', String(line)),
    thinking: (chunk) => emit('thinking', String(chunk)),
    recommendSummary: (text) => emit('recommend', String(text)),
    applySummary: (text) => emit('apply', String(text)),
    fail: (message) => emit('fail', String(message)),
    finish: () => emit('finish'),
    stop: async () => {
      instance.unmount?.();
      instance.cleanup?.();
      if (instance.waitUntilExit) {
        await instance.waitUntilExit();
      }
    },
  };
}

async function safeImport<T>(moduleName: string): Promise<T | null> {
  try {
    return await import(moduleName) as T;
  } catch {
    return null;
  }
}

function normalizeReact(moduleValue: Record<string, unknown> | null): ReactModule | null {
  if (!moduleValue) return null;

  const candidate = (moduleValue.default as unknown) ?? moduleValue;
  if (!candidate || typeof (candidate as { createElement?: unknown }).createElement !== 'function') {
    return null;
  }

  const react = candidate as Partial<ReactModule>;
  if (typeof react.useEffect !== 'function' || typeof react.useState !== 'function') {
    return null;
  }

  return react as ReactModule;
}

function createLiveViewComponent(
  React: ReactModule,
  ink: InkModule,
  bus: EventEmitter,
  initial: EvolveLiveState,
): unknown {
  const Box = ink.Box ?? 'Box';
  const Text = ink.Text ?? 'Text';

  const LiveView = () => {
    const useState = React.useState as unknown as <T>(value: T) => [T, (next: T | ((prev: T) => T)) => void];
    const useEffect = React.useEffect as unknown as (fn: () => void | (() => void), deps?: unknown[]) => void;

    const [state, setState] = useState<EvolveLiveState>(initial);

    useEffect(() => {
      const onPhase = (payload: { phase: EvolveLivePhase; detail?: string }) => {
        setState(prev => ({ ...prev, phase: payload.phase, phaseDetail: payload.detail }));
      };

      const onLog = (payload: string) => {
        setState(prev => ({
          ...prev,
          logs: appendLog(prev.logs, payload, MAX_LOG_LINES),
        }));
      };

      const onThinking = (payload: string) => {
        setState(prev => ({
          ...prev,
          thinkingText: appendThinking(prev.thinkingText, payload),
        }));
      };

      const onRecommend = (payload: string) => {
        setState(prev => ({ ...prev, recommendationSummary: payload }));
      };

      const onApply = (payload: string) => {
        setState(prev => ({ ...prev, appliedSummary: payload }));
      };

      const onFail = (payload: string) => {
        setState(prev => ({ ...prev, phase: 'error', done: true, error: payload }));
      };

      const onFinish = () => {
        setState(prev => ({ ...prev, phase: 'done', done: true }));
      };

      const onTick = () => {
        setState(prev => ({ ...prev, frame: prev.frame + 1 }));
      };

      bus.on('phase', onPhase);
      bus.on('log', onLog);
      bus.on('thinking', onThinking);
      bus.on('recommend', onRecommend);
      bus.on('apply', onApply);
      bus.on('fail', onFail);
      bus.on('finish', onFinish);

      const timer = setInterval(onTick, 100);

      return () => {
        clearInterval(timer);
        bus.off('phase', onPhase);
        bus.off('log', onLog);
        bus.off('thinking', onThinking);
        bus.off('recommend', onRecommend);
        bus.off('apply', onApply);
        bus.off('fail', onFail);
        bus.off('finish', onFinish);
      };
    }, []);

    const spinner = SPINNER_FRAMES[state.frame % SPINNER_FRAMES.length];
    const elapsed = formatElapsed(Date.now() - state.startedAt);
    const phaseIndex = Math.max(0, PHASES.indexOf(state.phase));
    const phaseRatio = phaseIndex < 0 ? 0 : phaseIndex / (PHASES.length - 1);
    const progress = renderProgressBar(phaseRatio, 18);
    const phaseLabel = state.phaseDetail ? `${state.phase.toUpperCase()} • ${state.phaseDetail}` : state.phase.toUpperCase();
    const thinkingTail = tailLines(state.thinkingText, 10);
    const recentLogs = state.logs.slice(-MAX_LOG_LINES);
    const statusTone = state.error ? 'error' : state.done ? 'done' : 'live';

    return React.createElement(
      Box as never,
      { flexDirection: 'column', paddingX: 1, paddingY: 0 },
      React.createElement(
        Box as never,
        { flexDirection: 'column', marginBottom: 1 },
        React.createElement(Text as never, { bold: true }, `${spinner} evolve / ${state.skillName}`),
        React.createElement(Text as never, { dimColor: true }, `${elapsed}  ${statusTone}`),
        React.createElement(Text as never, undefined, progress),
      ),
      React.createElement(
        Box as never,
        { flexDirection: 'column', marginBottom: 1 },
        React.createElement(Text as never, { bold: true }, `Phase: ${phaseLabel}`),
        React.createElement(Text as never, { dimColor: true }, renderPhaseRundown(state.phase)),
      ),
      React.createElement(
        Box as never,
        { flexDirection: 'column', marginBottom: 1 },
        React.createElement(Text as never, { bold: true }, 'Live Summary'),
        React.createElement(Text as never, undefined, `verbose=${state.verbose}  apply=${state.apply}`),
        state.recommendationSummary ? React.createElement(Text as never, undefined, `recommendations: ${state.recommendationSummary}`) : null,
        state.appliedSummary ? React.createElement(Text as never, undefined, `apply: ${state.appliedSummary}`) : null,
        state.error ? React.createElement(Text as never, undefined, `error: ${state.error}`) : null,
      ),
      React.createElement(
        Box as never,
        { flexDirection: 'column', marginBottom: 1 },
        React.createElement(Text as never, { bold: true }, 'Thinking Stream'),
        React.createElement(Text as never, undefined, thinkingTail || (state.phase === 'thinking' ? 'Waiting for model output...' : 'No thinking output yet.')),
      ),
      React.createElement(
        Box as never,
        { flexDirection: 'column', marginBottom: 1 },
        React.createElement(Text as never, { bold: true }, 'Recent Logs'),
        ...recentLogs.map((line) => React.createElement(Text as never, undefined, `• ${line}`)),
      ),
      React.createElement(
        Box as never,
        { flexDirection: 'column' },
        React.createElement(Text as never, { dimColor: true }, state.done ? 'Done' : 'Refreshing live view...'),
      ),
    );
  };

  return React.createElement(LiveView as never, undefined);
}

function renderProgressBar(ratio: number, width: number): string {
  const clamped = Math.max(0, Math.min(1, ratio));
  const filled = Math.round(clamped * width);
  return `Progress [${'█'.repeat(filled)}${'░'.repeat(width - filled)}] ${Math.round(clamped * 100)}%`;
}

function renderPhaseRundown(current: EvolveLivePhase): string {
  return PHASES
    .map((phase) => (phase === current ? `> ${phase}` : `  ${phase}`))
    .join('  ');
}

function appendLog(list: string[], line: string, max: number): string[] {
  const next = [...list, sanitizeLine(line)].filter(Boolean);
  if (next.length <= max) return next;
  return next.slice(next.length - max);
}

function appendThinking(current: string, chunk: string): string {
  const next = `${current}${sanitizeChunk(chunk)}`;
  if (next.length <= MAX_THINKING_CHARS) return next;
  return next.slice(next.length - MAX_THINKING_CHARS);
}

function sanitizeLine(line: string): string {
  return line.replace(/\r/g, '').trimEnd();
}

function sanitizeChunk(chunk: string): string {
  return chunk.replace(/\r/g, '');
}

function tailLines(text: string, maxLines: number): string {
  const lines = text
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => line.length > 0);
  if (lines.length <= maxLines) {
    return lines.join('\n');
  }
  return lines.slice(lines.length - maxLines).join('\n');
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
