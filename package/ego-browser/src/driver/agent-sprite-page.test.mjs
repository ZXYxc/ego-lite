import assert from "node:assert/strict";
import test from "node:test";
import {
  AGENT_SPRITE_IDLE_DISPOSE_MS,
  AGENT_SPRITE_PAGE_SOURCE,
  AGENT_SPRITE_TAG,
  AGENT_SPRITE_VERSION,
} from "../../dist/src/driver/agent-sprite-page.js";

const KEY = Symbol.for("ego.agentSprite");

/**
 * A minimal window/document double: enough DOM for the sprite to mount its
 * host element and a canvas whose 2D context accepts every drawing call.
 */
function fakeWindow({ imagesLoad, idle = false } = {}) {
  const frames = [];
  const idleCallbacks = [];
  const listeners = new Map();
  let now = 1_000;
  let images = 0;
  const context = new Proxy(
    {},
    {
      get(_target, property) {
        if (property === "measureText") {
          return (text) => ({ width: String(text).length * 7 });
        }
        return () => ({ addColorStop() {} });
      },
      set() {
        return true;
      },
    },
  );

  function element(tagName) {
    const attributes = new Map();
    const properties = new Map();
    const node = {
      tagName: tagName.toUpperCase(),
      children: [],
      parent: null,
      shadow: null,
      width: 0,
      height: 0,
      style: {
        setProperty(name, value, priority) {
          properties.set(name, { value, priority });
        },
        getPropertyValue(name) {
          return properties.get(name)?.value ?? "";
        },
        getPropertyPriority(name) {
          return properties.get(name)?.priority ?? "";
        },
      },
      get isConnected() {
        let current = node;
        while (current.parent) current = current.parent;
        return current === document.documentElement;
      },
      setAttribute(name, value) {
        attributes.set(name, String(value));
      },
      getAttribute(name) {
        return attributes.has(name) ? attributes.get(name) : null;
      },
      append(...children) {
        for (const child of children) {
          child.parent?.children.splice(
            child.parent.children.indexOf(child),
            1,
          );
          child.parent = node;
          node.children.push(child);
        }
      },
      remove() {
        if (!node.parent) return;
        node.parent.children.splice(node.parent.children.indexOf(node), 1);
        node.parent = null;
      },
      attachShadow(init) {
        node.shadow = { init, children: [], append: node.append.bind(node) };
        node.shadowInit = init;
        return node.shadow;
      },
      getContext(kind) {
        return kind === "2d" ? context : null;
      },
      toDataURL() {
        images += 1;
        return `data:image/png;base64,${images}`;
      },
    };
    return node;
  }

  const document = {
    documentElement: element("html"),
    createElement: element,
  };
  const win = {
    document,
    innerWidth: 1280,
    innerHeight: 800,
    devicePixelRatio: 2,
    performance: { now: () => now },
    requestAnimationFrame(callback) {
      frames.push(callback);
      return frames.length;
    },
    cancelAnimationFrame() {},
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
  };
  if (idle) {
    win.requestIdleCallback = (callback) => idleCallbacks.push(callback);
  }
  if (imagesLoad !== undefined) {
    // An Image whose load succeeds or fails like a page CSP would decide.
    win.Image = class {
      set src(_url) {
        queueMicrotask(() => (imagesLoad ? this.onload() : this.onerror()));
      }
    };
  }
  return {
    win,
    document,
    runIdle() {
      for (const callback of idleCallbacks.splice(0)) callback();
    },
    advance(ms) {
      now += ms;
    },
    /** Run every queued animation frame once, as the browser would. */
    tick() {
      const pending = frames.splice(0);
      for (const callback of pending) callback(now);
    },
    pendingFrames: () => frames.length,
    listeners,
  };
}

function install(env) {
  const installer = (0, eval)(`(${AGENT_SPRITE_PAGE_SOURCE})`);
  return installer(env.win, KEY);
}

function host(env) {
  return env.document.documentElement.children.find(
    (child) => child.tagName === AGENT_SPRITE_TAG.toUpperCase(),
  );
}

test("installing mounts one inert, hidden-from-accessibility overlay host", () => {
  const env = fakeWindow();
  const sprite = install(env);

  assert.equal(sprite.version, AGENT_SPRITE_VERSION);
  assert.equal(env.win[KEY], sprite);
  const mounted = host(env);
  assert(mounted, "the host is appended to the document element");
  assert.equal(mounted.getAttribute("aria-hidden"), "true");
  assert.equal(mounted.getAttribute("inert"), "");
  assert.equal(mounted.shadowInit.mode, "closed");
  assert.equal(mounted.style.getPropertyValue("pointer-events"), "none");
  assert.equal(
    mounted.style.getPropertyPriority("pointer-events"),
    "important",
  );
  assert.equal(mounted.style.getPropertyValue("position"), "fixed");
  assert.equal(mounted.style.getPropertyValue("z-index"), "2147483647");

  assert.equal(install(env), sprite, "a second install reuses the live sprite");
  assert.equal(
    env.document.documentElement.children.length,
    1,
    "reinstalling never stacks a second host",
  );
});

test("the face follows the action table and returns to idle", () => {
  const env = fakeWindow();
  const sprite = install(env);
  assert.equal(sprite.state().expression, "idle");

  sprite.apply([{ type: "point", x: 300, y: 200 }]);
  assert.equal(sprite.state().expression, "tracking");
  assert.deepEqual(sprite.state().target, { x: 300, y: 200 });

  sprite.apply([{ type: "press", x: 310, y: 210 }]);
  assert.equal(sprite.state().pose, "tap");
  assert.equal(sprite.state().expression, "squint");
  assert.deepEqual(sprite.state().target, { x: 310, y: 210 });

  env.advance(400);
  sprite.apply([{ type: "scroll", deltaX: 0, deltaY: 300 }]);
  assert.equal(sprite.state().pose, "grab");
  assert.equal(sprite.state().expression, "strain");

  env.advance(700);
  sprite.apply([{ type: "write", chars: 4 }]);
  assert.equal(sprite.state().pose, "pen");
  assert.equal(sprite.state().expression, "focused");

  env.advance(1_000);
  sprite.apply([{ type: "outcome", ok: true }]);
  assert.equal(sprite.state().expression, "happy");

  env.advance(1_000);
  sprite.apply([{ type: "outcome", ok: false }]);
  assert.equal(sprite.state().expression, "surprised");

  env.advance(5_000);
  assert.equal(sprite.state().pose, "open");
  assert.equal(sprite.state().expression, "idle");
});

test("an outcome mood outranks the pose it follows", () => {
  const env = fakeWindow();
  const sprite = install(env);
  sprite.apply([
    { type: "press", x: 10, y: 10 },
    { type: "outcome", ok: false },
  ]);
  assert.equal(sprite.state().pose, "tap");
  assert.equal(sprite.state().expression, "surprised");
});

test("the thought bubble shows the action label, then animated dots", () => {
  const env = fakeWindow();
  const sprite = install(env);
  assert.deepEqual(sprite.state().bubble, { kind: "dots" });

  sprite.apply([{ type: "think", label: "  Clicking the  pumpkin button " }]);
  assert.deepEqual(sprite.state().bubble, {
    kind: "text",
    text: "Clicking the pumpkin button",
  });

  sprite.apply([{ type: "think", label: "x".repeat(200) }]);
  const long = sprite.state().bubble;
  assert.equal(long.kind, "text");
  assert(long.text.length <= 80, "long labels are truncated");
  assert(long.text.endsWith("…"));

  sprite.apply([{ type: "think", label: "   " }]);
  assert.deepEqual(
    sprite.state().bubble,
    { kind: "dots" },
    "an empty label clears the bubble text",
  );

  sprite.apply([{ type: "think", label: "Typing" }]);
  env.advance(6_500);
  assert.deepEqual(
    sprite.state().bubble,
    { kind: "dots" },
    "a label expires back to the dots animation",
  );
});

test("targets are clamped into the viewport", () => {
  const env = fakeWindow();
  const sprite = install(env);
  sprite.apply([{ type: "point", x: -50, y: 5_000 }]);
  assert.deepEqual(sprite.state().target, { x: 0, y: 800 });
  sprite.apply([{ type: "point", x: Number.NaN, y: 10 }]);
  assert.deepEqual(
    sprite.state().target,
    { x: 0, y: 800 },
    "a non-finite point is ignored",
  );
});

/** Step the animation in small frames, collecting each hand's phases by index. */
function play(env, sprite, ms, seen = []) {
  for (let elapsed = 0; elapsed < ms; elapsed += 16) {
    env.advance(16);
    env.tick();
    sprite.state().hands.forEach((hand, index) => {
      seen[index] ??= new Set();
      seen[index].add(hand.phase);
    });
  }
  return seen;
}

test("an action reaches out its own hand, which acts and pulls back", () => {
  const env = fakeWindow();
  const sprite = install(env);
  assert.equal(sprite.state().hand, null, "no hand is out at rest");

  sprite.apply([{ type: "press", x: 300, y: 200 }]);
  assert.deepEqual(
    sprite.state().hands.map((hand) => [hand.kind, hand.phase]),
    [["tap", "reach"]],
  );
  env.advance(16);
  env.tick();
  const first = sprite.state().hand;
  assert(
    Math.hypot(first.x - 300, first.y - 200) > 100,
    "the hand starts from the body instead of jumping onto the target",
  );

  let closest = Infinity;
  for (let frame = 0; frame < 30; frame += 1) {
    env.advance(16);
    env.tick();
    const tip = sprite.state().hand;
    if (tip) closest = Math.min(closest, Math.hypot(tip.x - 300, tip.y - 200));
  }
  assert(closest < 10, "the hand reaches its target");

  play(env, sprite, 1_000);
  assert.deepEqual(sprite.state().hands, [], "the hand went home");
  assert.equal(sprite.state().hand, null);
  const limbs = descendants(host(env)).filter(
    (node) => node.getAttribute("class") === "limb",
  );
  assert(
    limbs.every((node) => node.style.getPropertyValue("display") === "none"),
    "an idle sprite shows no arms",
  );
});

test("a hand swings out on an arc at the end of a bent arm", () => {
  const env = fakeWindow();
  const sprite = install(env);
  const body = { x: 1280 - 64, y: 800 - 58 };
  const target = { x: 300, y: 200 };
  sprite.apply([{ type: "press", ...target }]);

  // Distance from the straight line between the body and the target.
  const across = unit(target.x - body.x, target.y - body.y);
  let swing = 0;
  let bend = 0;
  for (let frame = 0; frame < 20; frame += 1) {
    env.advance(16);
    env.tick();
    const tip = sprite.state().hand;
    swing = Math.max(
      swing,
      Math.abs((tip.x - body.x) * -across.y + (tip.y - body.y) * across.x),
    );
    const angles = descendants(host(env))
      .filter((node) => node.getAttribute("class") === "part seg")
      .slice(0, 28)
      .map((node) =>
        Number(
          /rotate\((-?[\d.e-]+)rad\)/.exec(
            node.style.getPropertyValue("transform"),
          )[1],
        ),
      );
    bend = Math.max(bend, Math.max(...angles) - Math.min(...angles));
  }
  assert(swing > 60, `the hand travels on an arc (${swing.toFixed(1)}px off)`);
  assert(bend > 0.5, `the arm bends along its length (${bend.toFixed(2)}rad)`);
});

function unit(x, y) {
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

test("fast actions each play in full, starting in order and overlapping", () => {
  const env = fakeWindow();
  const sprite = install(env);
  sprite.apply([
    { type: "press", x: 100, y: 100 },
    { type: "press", x: 400, y: 120 },
    { type: "write", chars: 3 },
    { type: "scroll", deltaX: 0, deltaY: 400, x: 700, y: 500 },
  ]);
  assert.deepEqual(
    sprite.state().hands.map((hand) => [hand.kind, hand.phase]),
    [
      ["tap", "reach"],
      ["tap", "waiting"],
      ["write", "waiting"],
      ["grab", "waiting"],
    ],
    "one hand per action, later ones wait their turn",
  );

  let together = 0;
  const seen = [];
  for (let frame = 0; frame < 200; frame += 1) {
    play(env, sprite, 16, seen);
    const out = sprite
      .state()
      .hands.filter((hand) => hand.phase !== "waiting").length;
    together = Math.max(together, out);
  }
  assert.equal(seen.length, 4);
  for (const phases of seen) {
    for (const phase of ["reach", "act", "retract"]) {
      assert(phases.has(phase), `every hand plays its ${phase}`);
    }
  }
  assert(together >= 3, "a new hand starts before the previous one is home");
  assert.deepEqual(sprite.state().hands, []);
});

test("typing keeps one pen writing for longer", () => {
  const env = fakeWindow();
  const sprite = install(env);
  sprite.apply([{ type: "write", chars: 1 }]);
  for (let key = 0; key < 20; key += 1) {
    env.advance(40);
    env.tick();
    sprite.apply([{ type: "write", chars: 1 }]);
  }
  const hands = sprite.state().hands;
  assert.equal(hands.length, 1, "consecutive typing shares one hand");
  assert.equal(hands[0].kind, "write");
  assert.equal(
    hands[0].phase,
    "act",
    "the pen keeps writing while keys arrive",
  );
});

test("a pointing hand turns into the click near it", () => {
  const env = fakeWindow();
  const sprite = install(env);
  sprite.apply([
    { type: "point", x: 300, y: 200 },
    { type: "press", x: 310, y: 205 },
  ]);
  assert.deepEqual(
    sprite.state().hands.map((hand) => hand.kind),
    ["tap"],
  );
  sprite.apply([{ type: "press", x: 800, y: 100 }]);
  assert.deepEqual(
    sprite.state().hands.map((hand) => hand.kind),
    ["tap", "tap"],
    "a click far away gets its own hand",
  );
});

test("at most five hands work at once; the oldest pull back early", () => {
  const env = fakeWindow();
  const sprite = install(env);
  for (let index = 0; index < 7; index += 1) {
    sprite.apply([{ type: "press", x: 100 + index * 120, y: 300 }]);
  }
  const phases = sprite.state().hands.map((hand) => hand.phase);
  assert(phases.length <= 7);
  assert(
    phases.filter((phase) => phase !== "retract").length <= 5,
    "no more than five hands are at work",
  );
  assert.equal(phases[0], "retract", "the oldest hand pulls back first");
  play(env, sprite, 3_000);
  assert.deepEqual(sprite.state().hands, []);
});

test("repeated gestures cycle through their variants", () => {
  const env = fakeWindow();
  const sprite = install(env);
  const variants = [];
  for (let index = 0; index < 6; index += 1) {
    sprite.apply([{ type: "press", x: 100 + index * 150, y: 300 }]);
    variants.push(sprite.state().hands.at(-1).variant);
  }
  for (let index = 1; index < variants.length; index += 1) {
    assert.notEqual(
      variants[index],
      variants[index - 1],
      "no variant twice in a row",
    );
  }
  for (const variant of variants) {
    assert(["poke", "knock", "slap"].includes(variant));
  }
});

test("a retract command pulls back hands from the previous page", () => {
  const env = fakeWindow();
  const sprite = install(env);
  sprite.apply([
    {
      type: "retract",
      points: [
        { x: 100, y: 100 },
        { x: 400, y: 300 },
      ],
    },
  ]);
  const hands = sprite.state().hands;
  assert.deepEqual(
    hands.map((hand) => [hand.phase, hand.tip]),
    [
      ["retract", { x: 100, y: 100 }],
      ["retract", { x: 400, y: 300 }],
    ],
  );
  assert.equal(
    sprite.state().expression,
    "idle",
    "retracting hands are not work",
  );
  play(env, sprite, 500);
  assert.deepEqual(sprite.state().hands, []);
});

test("a failed action shakes the newest hand", () => {
  const env = fakeWindow();
  const sprite = install(env);
  sprite.apply([
    { type: "press", x: 300, y: 200 },
    { type: "outcome", ok: false },
  ]);
  assert.equal(sprite.state().hands[0].failed, true);
  assert.equal(sprite.state().expression, "surprised");
});

test("every pose and face can be drawn", () => {
  const env = fakeWindow();
  const sprite = install(env);
  const commands = [
    [{ type: "point", x: 200, y: 200 }],
    [{ type: "press", x: 200, y: 200 }],
    [{ type: "scroll", deltaX: 120, deltaY: -480, x: 300, y: 300 }],
    [{ type: "write" }, { type: "think", label: "Filling the form" }],
    [{ type: "key" }],
    [{ type: "outcome", ok: true }],
    [{ type: "outcome", ok: false }],
  ];
  for (const batch of commands) {
    sprite.apply(batch);
    for (let frame = 0; frame < 4; frame += 1) {
      env.advance(40);
      assert.doesNotThrow(() => env.tick());
    }
  }
  assert(env.pendingFrames() > 0, "the animation loop keeps running");
});

function descendants(node) {
  return node.children.flatMap((child) => [child, ...descendants(child)]);
}

test("the sprite is drawn without canvas, svg, or text the snapshot would list", () => {
  // Ego's native snapshot lists every canvas, svg, text node, and CSS
  // generated text, even under aria-hidden or a closed shadow root.
  const env = fakeWindow();
  const sprite = install(env);
  sprite.apply([
    { type: "press", x: 200, y: 200 },
    { type: "think", label: "Carving a pumpkin" },
  ]);
  for (const batch of [
    [{ type: "scroll", deltaX: 0, deltaY: 300 }],
    [{ type: "write" }],
    [{ type: "outcome", ok: true }],
  ]) {
    sprite.apply(batch);
    env.advance(40);
    env.tick();
  }

  const mounted = descendants(host(env));
  const tags = new Set(mounted.map((node) => node.tagName));
  assert.deepEqual([...tags].sort(), ["DIV", "STYLE"]);
  for (const node of mounted) {
    if (node.tagName !== "STYLE") {
      assert.equal(node.textContent, undefined, "no element carries text");
    }
  }
  const style = mounted.find((node) => node.tagName === "STYLE");
  assert(!/content\s*:/.test(style.textContent), "no CSS generated text");
  const label = mounted.find(
    (node) => node.getAttribute("class") === "bubble-text",
  );
  assert.match(
    label.style.getPropertyValue("background-image"),
    /^url\("data:image\/png/,
    "the label is shown as an image of text",
  );
});

function byClass(env, className) {
  return descendants(host(env)).find((node) =>
    node.getAttribute("class")?.split(" ").includes(className),
  );
}

const backgroundOf = (node) => node.style.getPropertyValue("background-image");

test("the crayon art is drawn when the page is idle and shown once it loads", async () => {
  const env = fakeWindow({ idle: true, imagesLoad: true });
  const sprite = install(env);
  const stage = byClass(env, "stage");
  assert.equal(
    stage.getAttribute("data-art"),
    "pending",
    "installing does not draw the art and keeps the sprite hidden",
  );
  assert.equal(backgroundOf(byClass(env, "blob")), "");

  assert.equal(sprite.state().art, "pending");
  env.runIdle();
  await Promise.resolve();
  assert.equal(stage.getAttribute("data-art"), "crayon");
  assert.equal(sprite.state().art, "crayon");
  for (const part of [
    "blob",
    "tuft",
    "hat-art",
    "pupil-art",
    "seg",
    "bubble-dots-art",
  ]) {
    assert.match(
      backgroundOf(byClass(env, part)),
      /^url\("data:image\/png/,
      `${part} shows a crayon image`,
    );
  }
  sprite.apply([{ type: "point", x: 100, y: 100 }]);
  env.advance(16);
  env.tick();
  const tracking = backgroundOf(byClass(env, "face-art"));
  const open = backgroundOf(byClass(env, "hand-art"));
  sprite.apply([{ type: "write" }, { type: "outcome", ok: true }]);
  env.advance(16);
  env.tick();
  assert.notEqual(
    backgroundOf(byClass(env, "face-art")),
    tracking,
    "each expression has its own crayon face",
  );
  assert.notEqual(
    backgroundOf(byClass(env, "hand-art")),
    open,
    "each pose has its own crayon hand",
  );
});

test("the crayon body keeps changing shape and its fur keeps swaying", () => {
  const env = fakeWindow();
  install(env);
  const nodes = (className) =>
    descendants(host(env)).filter((node) =>
      node.getAttribute("class")?.split(" ").includes(className),
    );
  const pose = () =>
    [...nodes("blob"), ...nodes("tuft")].map((node) =>
      node.style.getPropertyValue("transform"),
    );
  assert.equal(nodes("blob").length, 7);
  assert.equal(nodes("tuft").length, 30);

  const seen = new Set();
  for (let frame = 0; frame < 6; frame += 1) {
    env.advance(400);
    env.tick();
    const current = pose();
    assert(
      current.every((transform) => transform.length > 0),
      "every lump and tuft is placed",
    );
    seen.add(current.join("|"));
  }
  assert.equal(seen.size, 6, "the outline and fur differ on every frame");
});

test("a page whose CSP blocks data: images keeps the plain sprite", async () => {
  const env = fakeWindow({ imagesLoad: false });
  install(env);
  await Promise.resolve();
  assert.equal(byClass(env, "stage").getAttribute("data-art"), "plain");
});

test("capture hiding hides the host without losing state", () => {
  const env = fakeWindow();
  const sprite = install(env);
  sprite.apply([{ type: "think", label: "Before capture" }]);

  assert.equal(sprite.setCaptureHidden(true), true);
  assert.equal(host(env).style.getPropertyValue("display"), "none");
  assert.equal(sprite.state().hidden, true);

  sprite.apply([{ type: "point", x: 20, y: 20 }]);
  assert.equal(
    host(env).style.getPropertyValue("display"),
    "none",
    "actions during a capture do not reveal the sprite",
  );

  assert.equal(sprite.setCaptureHidden(false), true);
  assert.equal(host(env).style.getPropertyValue("display"), "block");
  assert.equal(sprite.state().bubble.text, "Before capture");
});

test("a host removed by the page is reattached by the next command", () => {
  const env = fakeWindow();
  const sprite = install(env);
  host(env).remove();
  assert.equal(host(env), undefined);
  sprite.apply([{ type: "point", x: 1, y: 1 }]);
  assert(host(env), "the sprite remounts itself");
});

test("dispose removes the host, stops the loop, and clears the global", () => {
  const env = fakeWindow();
  const sprite = install(env);
  sprite.dispose();
  assert.equal(host(env), undefined);
  assert.equal(env.win[KEY], undefined);
  assert.equal(env.listeners.has("resize"), false);
  env.tick();
  assert.equal(env.pendingFrames(), 0, "no animation frames remain scheduled");
  assert.doesNotThrow(() => sprite.apply([{ type: "point", x: 1, y: 1 }]));
});

test("an abandoned sprite removes itself after the idle limit", () => {
  const env = fakeWindow();
  install(env);
  env.advance(AGENT_SPRITE_IDLE_DISPOSE_MS + 1);
  env.tick();
  assert.equal(host(env), undefined);
  assert.equal(env.win[KEY], undefined);
});

test("an older sprite version is replaced", () => {
  const env = fakeWindow();
  let disposed = false;
  env.win[KEY] = {
    version: AGENT_SPRITE_VERSION - 1,
    dispose() {
      disposed = true;
      delete env.win[KEY];
    },
  };
  const sprite = install(env);
  assert.equal(disposed, true);
  assert.equal(sprite.version, AGENT_SPRITE_VERSION);
});
