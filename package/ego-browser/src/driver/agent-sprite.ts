import {
  AGENT_SPRITE_PAGE_SOURCE,
  AGENT_SPRITE_VERSION,
} from "./agent-sprite-page.js";

/**
 * Display-only gestures for the Halloween agent sprite. Coordinates are
 * top-level viewport CSS pixels, the same space as the native cursor hint.
 */
export type AgentSpriteCommand =
  | { type: "point"; x: number; y: number }
  | { type: "press"; x?: number; y?: number }
  | {
      type: "scroll";
      deltaX: number;
      deltaY: number;
      x?: number;
      y?: number;
    }
  /** Typed text; chars sets how long the pen writes. */
  | { type: "write"; chars?: number }
  | { type: "key" }
  /** Hands that were out on the previous document, pulled back from these points. */
  | { type: "retract"; points: { x: number; y: number }[] }
  | { type: "think"; label: string }
  | { type: "outcome"; ok: boolean };

export type AgentSpriteTarget = {
  spaceId: number;
  /** The Page's top-level session; the sprite is drawn in that document. */
  sessionId: string | undefined;
};

/** What page-model needs from a sprite renderer. Every method is best effort. */
export type AgentSpritePort = {
  send(target: AgentSpriteTarget, command: AgentSpriteCommand): void;
  /** The document behind this session was replaced (navigation). */
  forget(sessionId: string): void;
  /** Run a capture with the sprite hidden, so screenshots never show it. */
  hideDuring<T>(sessionId: string, capture: () => Promise<T>): Promise<T>;
  /**
   * Remove every sprite this process drew in a task space. Callers await it
   * before ending agent control: a reply that lands after the task ended is
   * recorded as a hard stop even though the renderer swallows it.
   */
  disposeSpace(spaceId: number): Promise<void>;
};

export type AgentSpriteTransport = {
  /** Evaluate an expression in a session and resolve with its JSON value. */
  evaluate(sessionId: string, expression: string): Promise<unknown>;
};

const SPRITE_GLOBAL = `globalThis[Symbol.for("ego.agentSprite")]`;

/** Points touched this recently may still have a hand out when a page goes away. */
const RECENT_POINT_MS = 1500;
const RECENT_POINTS = 5;

type RecentPoint = { x: number; y: number; at: number };

type SpriteSession = {
  spaceId: number;
  installed: boolean;
  recent: RecentPoint[];
  /** Hands to pull back when the sprite is installed in the new document. */
  retract: { x: number; y: number }[];
};

/**
 * Sends sprite commands to pages without ever affecting the agent's actions.
 *
 * Every request is started synchronously inside `send()`, while the caller
 * still holds the Page's native operation gate. Nothing is queued for later:
 * a deferred request could reach the browser after control moved to another
 * task space or back to the user, and a native send failure there rejects
 * every in-flight CDP request, including real actions. Results are never
 * awaited by the action path and failures are swallowed.
 */
export class AgentSpriteRenderer implements AgentSpritePort {
  readonly #transport: AgentSpriteTransport;
  /** Sessions this process drew in, with their space and install state. */
  readonly #sessions = new Map<string, SpriteSession>();
  readonly #now: () => number;

  constructor(transport: AgentSpriteTransport, now: () => number = Date.now) {
    this.#transport = transport;
    this.#now = now;
  }

  send(target: AgentSpriteTarget, command: AgentSpriteCommand): void {
    const { sessionId, spaceId } = target;
    if (!sessionId) return;
    const session = this.#sessions.get(sessionId) ?? {
      spaceId,
      installed: false,
      recent: [],
      retract: [],
    };
    session.spaceId = spaceId;
    this.#sessions.set(sessionId, session);
    const install = !session.installed;
    const commands: AgentSpriteCommand[] = [command];
    if (install && session.retract.length > 0) {
      commands.unshift({ type: "retract", points: session.retract });
      session.retract = [];
    }
    this.#remember(session, command);
    // Optimistic: commands sent before the install resolves run after it in
    // the page, so they can use the short apply form. Any failure resets it.
    session.installed = true;
    const reset = () => {
      if (this.#sessions.get(sessionId) === session) this.#lose(session);
    };
    this.#evaluate(
      sessionId,
      install ? installExpression(commands) : applyExpression(commands),
    ).then((applied) => {
      // An apply that finds no sprite means the document was replaced.
      if (applied !== true) reset();
    }, reset);
  }

  forget(sessionId: string): void {
    const session = this.#sessions.get(sessionId);
    if (session) this.#lose(session);
  }

  #remember(session: SpriteSession, command: AgentSpriteCommand): void {
    if (
      !("x" in command) ||
      typeof command.x !== "number" ||
      typeof command.y !== "number"
    ) {
      return;
    }
    session.recent.push({ x: command.x, y: command.y, at: this.#now() });
    if (session.recent.length > RECENT_POINTS) session.recent.shift();
  }

  /** The sprite's document is gone; its recent hands retract on reinstall. */
  #lose(session: SpriteSession): void {
    if (!session.installed) return;
    session.installed = false;
    const since = this.#now() - RECENT_POINT_MS;
    session.retract = session.recent
      .filter((point) => point.at >= since)
      .map(({ x, y }) => ({ x, y }));
    session.recent = [];
  }

  async hideDuring<T>(
    sessionId: string,
    capture: () => Promise<T>,
  ): Promise<T> {
    // Hide even when this process never drew here: a sprite left by an
    // earlier round must not appear in this round's screenshot either.
    const hidden = await this.#evaluate(
      sessionId,
      captureHiddenExpression(true),
    ).catch(() => false);
    try {
      return await capture();
    } finally {
      if (hidden === true) {
        void this.#evaluate(sessionId, captureHiddenExpression(false));
      }
    }
  }

  async disposeSpace(spaceId: number): Promise<void> {
    const pending: Promise<unknown>[] = [];
    for (const [sessionId, session] of this.#sessions) {
      if (session.spaceId !== spaceId) continue;
      this.#sessions.delete(sessionId);
      pending.push(
        this.#evaluate(
          sessionId,
          `(() => { ${SPRITE_GLOBAL}?.dispose?.(); return true; })()`,
        ),
      );
    }
    await Promise.all(pending);
  }

  /** Never throws and never rejects: rendering problems stay invisible. */
  #evaluate(sessionId: string, expression: string): Promise<unknown> {
    try {
      return this.#transport
        .evaluate(sessionId, expression)
        .catch(() => undefined);
    } catch {
      return Promise.resolve(undefined);
    }
  }
}

/** Embed commands as a JSON string literal, safe for any label text. */
function commandsLiteral(commands: AgentSpriteCommand[]): string {
  return `JSON.parse(${JSON.stringify(JSON.stringify(commands))})`;
}

function applyExpression(commands: AgentSpriteCommand[]): string {
  return `(() => {
  const sprite = ${SPRITE_GLOBAL};
  if (!sprite || sprite.version !== ${AGENT_SPRITE_VERSION}) return false;
  sprite.apply(${commandsLiteral(commands)});
  return true;
})()`;
}

function installExpression(commands: AgentSpriteCommand[]): string {
  return `(() => {
  const sprite = (${AGENT_SPRITE_PAGE_SOURCE})(globalThis, Symbol.for("ego.agentSprite"));
  sprite.apply(${commandsLiteral(commands)});
  return true;
})()`;
}

function captureHiddenExpression(hidden: boolean): string {
  return `(() => {
  const sprite = ${SPRITE_GLOBAL};
  return typeof sprite?.setCaptureHidden === "function"
    ? sprite.setCaptureHidden(${hidden})
    : false;
})()`;
}

/**
 * Translate one native input command into a sprite gesture. Pointer moves
 * are ignored here because their page-coordinate position already arrives
 * through the native cursor hint. Coordinates from an iframe session are
 * frame-local, so they are only used for the Page's own session.
 */
export function agentSpriteCommandForInput(
  method: string,
  params: Record<string, unknown> | undefined,
  onPageSession: boolean,
): AgentSpriteCommand | null {
  if (!params || typeof params !== "object") return null;
  const point =
    onPageSession &&
    typeof params.x === "number" &&
    typeof params.y === "number"
      ? { x: params.x, y: params.y }
      : {};
  if (method === "Input.dispatchMouseEvent") {
    if (params.type === "mousePressed") return { type: "press", ...point };
    if (params.type === "mouseWheel") {
      return {
        type: "scroll",
        deltaX: Number(params.deltaX) || 0,
        deltaY: Number(params.deltaY) || 0,
        ...point,
      };
    }
    return null;
  }
  if (method === "Input.dispatchKeyEvent") {
    if (params.type === "keyUp") return null;
    // Enter and Tab carry control-character text ("\r", "\t"): key taps.
    const typesText =
      typeof params.text === "string" &&
      /[^\u0000-\u001f\u007f]/.test(params.text);
    return typesText
      ? { type: "write", chars: [...(params.text as string)].length }
      : { type: "key" };
  }
  if (method === "Input.insertText") {
    return typeof params.text === "string" && params.text !== ""
      ? { type: "write", chars: [...params.text].length }
      : null;
  }
  return null;
}
