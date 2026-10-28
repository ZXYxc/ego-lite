import assert from "node:assert/strict";
import test from "node:test";
import {
  AgentSpriteRenderer,
  agentSpriteCommandForInput,
} from "../../dist/src/driver/agent-sprite.js";
import {
  AGENT_SPRITE_PAGE_SOURCE,
  AGENT_SPRITE_VERSION,
} from "../../dist/src/driver/agent-sprite-page.js";

const KEY = Symbol.for("ego.agentSprite");

function recordingTransport(respond = () => true) {
  const calls = [];
  return {
    calls,
    evaluate(sessionId, expression) {
      calls.push({ sessionId, expression });
      try {
        return Promise.resolve(respond(expression, sessionId));
      } catch (error) {
        return Promise.reject(error);
      }
    },
  };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

/** Run an apply expression against a stand-in sprite and return its batch. */
function appliedCommands(expression) {
  const received = [];
  globalThis[KEY] = {
    version: AGENT_SPRITE_VERSION,
    apply(commands) {
      received.push(...commands);
    },
  };
  try {
    assert.equal((0, eval)(expression), true);
  } finally {
    delete globalThis[KEY];
  }
  return received;
}

test("the first command for a session installs the sprite synchronously", () => {
  const transport = recordingTransport();
  const sprite = new AgentSpriteRenderer(transport);

  sprite.send({ spaceId: 7, sessionId: "s1" }, { type: "point", x: 4, y: 5 });

  assert.equal(
    transport.calls.length,
    1,
    "the CDP request starts before send returns, while the Page gate is held",
  );
  assert.equal(transport.calls[0].sessionId, "s1");
  assert(transport.calls[0].expression.includes(AGENT_SPRITE_PAGE_SOURCE));
});

test("later commands ship only a small apply expression", () => {
  const transport = recordingTransport();
  const sprite = new AgentSpriteRenderer(transport);
  const target = { spaceId: 7, sessionId: "s1" };

  sprite.send(target, { type: "point", x: 4, y: 5 });
  sprite.send(target, { type: "press", x: 4, y: 5 });

  const apply = transport.calls[1].expression;
  assert(!apply.includes(AGENT_SPRITE_PAGE_SOURCE));
  assert(apply.length < 400, "per-action payloads stay small");
  assert.deepEqual(appliedCommands(apply), [{ type: "press", x: 4, y: 5 }]);
});

test("labels survive serialization into the page expression", () => {
  const transport = recordingTransport();
  const sprite = new AgentSpriteRenderer(transport);
  const target = { spaceId: 7, sessionId: "s1" };
  const label = `Say "boo" </script> \`tick\` \u2028 ${"\\"} 🎃`;

  sprite.send(target, { type: "point", x: 0, y: 0 });
  sprite.send(target, { type: "think", label });

  assert.deepEqual(appliedCommands(transport.calls[1].expression), [
    { type: "think", label },
  ]);
});

test("a replaced document is reinstalled by the next command", async () => {
  let spriteAlive = true;
  const transport = recordingTransport((expression) =>
    expression.includes(AGENT_SPRITE_PAGE_SOURCE) ? true : spriteAlive,
  );
  const sprite = new AgentSpriteRenderer(transport);
  const target = { spaceId: 7, sessionId: "s1" };

  sprite.send(target, { type: "point", x: 1, y: 1 });
  await settle();
  spriteAlive = false;
  sprite.send(target, { type: "point", x: 2, y: 2 });
  await settle();
  sprite.send(target, { type: "point", x: 3, y: 3 });

  assert(
    transport.calls[2].expression.includes(AGENT_SPRITE_PAGE_SOURCE),
    "an apply that finds no sprite makes the next command reinstall it",
  );
});

test("forget makes the next command reinstall without a failed round trip", () => {
  const transport = recordingTransport();
  const sprite = new AgentSpriteRenderer(transport);
  const target = { spaceId: 7, sessionId: "s1" };

  sprite.send(target, { type: "point", x: 1, y: 1 });
  sprite.forget("s1");
  sprite.send(target, { type: "outcome", ok: true });

  assert(transport.calls[1].expression.includes(AGENT_SPRITE_PAGE_SOURCE));
});

/** The commands an install expression applies, run against a stand-in installer. */
function installedCommands(expression) {
  const received = [];
  const stub = `(function () { return { apply(commands) { globalThis.__installed.push(...commands); } }; })`;
  globalThis.__installed = received;
  try {
    (0, eval)(expression.replace(AGENT_SPRITE_PAGE_SOURCE, stub));
  } finally {
    delete globalThis.__installed;
  }
  return received;
}

test("after navigation the new sprite pulls back the hands that were out", () => {
  let now = 10_000;
  const transport = recordingTransport();
  const sprite = new AgentSpriteRenderer(transport, () => now);
  const target = { spaceId: 7, sessionId: "s1" };

  sprite.send(target, { type: "point", x: 1, y: 1 });
  now += 2_000;
  sprite.send(target, { type: "press", x: 40, y: 50 });
  sprite.send(target, { type: "scroll", deltaX: 0, deltaY: 9, x: 60, y: 70 });
  sprite.forget("s1");
  sprite.send(target, { type: "think", label: "Next page" });

  assert.deepEqual(installedCommands(transport.calls[3].expression), [
    {
      type: "retract",
      points: [
        { x: 40, y: 50 },
        { x: 60, y: 70 },
      ],
    },
    { type: "think", label: "Next page" },
  ]);

  sprite.forget("s1");
  sprite.send(target, { type: "key" });
  assert.deepEqual(
    installedCommands(transport.calls[4].expression),
    [{ type: "key" }],
    "hands are only pulled back once",
  );
});

test("rendering failures never reach the caller", async () => {
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);
  try {
    const rejecting = new AgentSpriteRenderer({
      evaluate: () => Promise.reject(new Error("page is gone")),
    });
    const throwing = new AgentSpriteRenderer({
      evaluate() {
        throw new Error("transport exploded");
      },
    });
    for (const sprite of [rejecting, throwing]) {
      assert.doesNotThrow(() =>
        sprite.send({ spaceId: 7, sessionId: "s1" }, { type: "key" }),
      );
      await assert.doesNotReject(sprite.disposeSpace(7));
    }
    assert.doesNotThrow(() =>
      rejecting.send({ spaceId: 7, sessionId: "" }, { type: "key" }),
    );
    await settle();
    assert.deepEqual(unhandled, []);
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});

test("a failed install is retried by the next command", async () => {
  let fail = true;
  const transport = recordingTransport(() => {
    if (fail) throw new Error("navigating");
    return true;
  });
  const sprite = new AgentSpriteRenderer(transport);
  const target = { spaceId: 7, sessionId: "s1" };

  sprite.send(target, { type: "point", x: 1, y: 1 });
  await settle();
  fail = false;
  sprite.send(target, { type: "point", x: 1, y: 1 });

  assert(transport.calls[1].expression.includes(AGENT_SPRITE_PAGE_SOURCE));
});

test("a session without an id is ignored", () => {
  const transport = recordingTransport();
  const sprite = new AgentSpriteRenderer(transport);
  sprite.send({ spaceId: 7, sessionId: undefined }, { type: "key" });
  assert.equal(transport.calls.length, 0);
});

test("hideDuring hides the sprite for the capture and then restores it", async () => {
  const steps = [];
  const transport = recordingTransport((expression) => {
    steps.push(
      expression.includes("setCaptureHidden(true)")
        ? "hide"
        : expression.includes("setCaptureHidden(false)")
          ? "show"
          : "other",
    );
    return true;
  });
  const sprite = new AgentSpriteRenderer(transport);

  const result = await sprite.hideDuring("s1", async () => {
    steps.push("capture");
    return "/tmp/shot.png";
  });

  assert.equal(result, "/tmp/shot.png");
  assert.deepEqual(steps, ["hide", "capture", "show"]);
  assert(transport.calls.every((call) => call.sessionId === "s1"));
});

test("hideDuring restores the sprite when the capture fails", async () => {
  const steps = [];
  const sprite = new AgentSpriteRenderer(
    recordingTransport((expression) => {
      steps.push(expression.includes("(true)") ? "hide" : "show");
      return true;
    }),
  );
  await assert.rejects(
    sprite.hideDuring("s1", async () => {
      throw new Error("capture failed");
    }),
    /capture failed/,
  );
  assert.deepEqual(steps, ["hide", "show"]);
});

test("hideDuring still captures when hiding fails or finds no sprite", async () => {
  const failing = new AgentSpriteRenderer({
    evaluate: () => Promise.reject(new Error("busy")),
  });
  assert.equal(await failing.hideDuring("s1", async () => "shot"), "shot");

  const absent = recordingTransport(() => false);
  const sprite = new AgentSpriteRenderer(absent);
  assert.equal(await sprite.hideDuring("s1", async () => "shot"), "shot");
  assert.equal(
    absent.calls.length,
    1,
    "nothing is restored when no sprite was showing",
  );
});

test("disposeSpace removes only that space's sprites and waits for the replies", async () => {
  const replies = [];
  const transport = recordingTransport(
    () => new Promise((resolve) => replies.push(resolve)),
  );
  const sprite = new AgentSpriteRenderer(transport);
  sprite.send({ spaceId: 7, sessionId: "a" }, { type: "key" });
  sprite.send({ spaceId: 7, sessionId: "b" }, { type: "key" });
  sprite.send({ spaceId: 8, sessionId: "c" }, { type: "key" });
  transport.calls.length = 0;
  replies.length = 0;

  let disposed = false;
  const disposing = sprite.disposeSpace(7).then(() => {
    disposed = true;
  });
  await settle();
  assert.equal(disposed, false, "dispose waits for every page to reply");
  for (const reply of replies) reply(true);
  await disposing;

  assert.deepEqual(transport.calls.map((call) => call.sessionId).sort(), [
    "a",
    "b",
  ]);
  assert(transport.calls.every((call) => call.expression.includes("dispose")));

  transport.calls.length = 0;
  sprite.send({ spaceId: 7, sessionId: "a" }, { type: "key" });
  sprite.send({ spaceId: 8, sessionId: "c" }, { type: "key" });
  assert(
    transport.calls[0].expression.includes(AGENT_SPRITE_PAGE_SOURCE),
    "a disposed session reinstalls when the agent acts again",
  );
  assert(!transport.calls[1].expression.includes(AGENT_SPRITE_PAGE_SOURCE));
});

test("native input maps to sprite gestures", () => {
  const map = agentSpriteCommandForInput;
  assert.deepEqual(
    map("Input.dispatchMouseEvent", { type: "mousePressed", x: 3, y: 4 }, true),
    { type: "press", x: 3, y: 4 },
  );
  assert.deepEqual(
    map(
      "Input.dispatchMouseEvent",
      { type: "mousePressed", x: 3, y: 4 },
      false,
    ),
    { type: "press" },
    "iframe-local coordinates are not used as page coordinates",
  );
  assert.deepEqual(
    map(
      "Input.dispatchMouseEvent",
      { type: "mouseWheel", x: 5, y: 6, deltaX: 0, deltaY: 120 },
      true,
    ),
    { type: "scroll", deltaX: 0, deltaY: 120, x: 5, y: 6 },
  );
  assert.deepEqual(
    map(
      "Input.dispatchMouseEvent",
      { type: "mouseWheel", x: 5, y: 6, deltaX: -40, deltaY: 0 },
      false,
    ),
    { type: "scroll", deltaX: -40, deltaY: 0 },
  );
  assert.equal(
    map("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: 1 }, true),
    null,
    "pointer positions come from the page-coordinate cursor hint",
  );
  assert.equal(
    map("Input.dispatchMouseEvent", { type: "mouseReleased" }, true),
    null,
  );
  assert.deepEqual(
    map("Input.dispatchKeyEvent", { type: "keyDown", text: "a" }, true),
    { type: "write", chars: 1 },
  );
  assert.deepEqual(
    map("Input.dispatchKeyEvent", { type: "char", text: "a" }, true),
    { type: "write", chars: 1 },
  );
  assert.deepEqual(
    map("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter" }, true),
    { type: "key" },
  );
  assert.deepEqual(
    map("Input.dispatchKeyEvent", { type: "keyDown", text: "" }, true),
    {
      type: "key",
    },
  );
  assert.deepEqual(
    map(
      "Input.dispatchKeyEvent",
      { type: "keyDown", key: "Enter", text: "\r" },
      true,
    ),
    { type: "key" },
    "Enter and Tab carry control-character text but are key taps, not writing",
  );
  assert.deepEqual(
    map(
      "Input.dispatchKeyEvent",
      { type: "keyDown", key: "Tab", text: "\t" },
      true,
    ),
    { type: "key" },
  );
  assert.equal(map("Input.dispatchKeyEvent", { type: "keyUp" }, true), null);
  assert.deepEqual(map("Input.insertText", { text: "hello 🎃" }, true), {
    type: "write",
    chars: 7,
  });
  assert.equal(map("Input.insertText", { text: "" }, true), null);
  assert.equal(map("Runtime.evaluate", { expression: "1" }, true), null);
  assert.equal(map("Input.dispatchMouseEvent", undefined, true), null);
});
