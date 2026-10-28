/**
 * Page-side renderer for the Halloween agent sprite: a fuzzy soot sprite in a
 * witch hat that lives in the bottom-right corner of the page and reaches its
 * arm out to wherever the agent is acting.
 *
 * The source below is evaluated in the page's main world by `agent-sprite.ts`.
 * It must stay self-contained (no imports, no template literals) because it is
 * shipped as a string.
 *
 * The sprite must stay invisible to the agent's own observations. Ego's
 * native snapshot lists every `<canvas>`, `<svg>`, text node, and CSS
 * generated text, even under `aria-hidden` or a closed shadow root, but it
 * omits text-free styled `<div>`s. The sprite is therefore built only from
 * text-free divs inside a closed shadow root. Its crayon look and its
 * thought-bubble label are drawn on detached canvases and shown as background
 * images; a page whose CSP blocks data: images keeps the plain CSS shapes.
 * In addition:
 * - `pointer-events: none` keeps hit testing and clicks unchanged,
 * - per-frame updates only touch styles inside the shadow root, which page
 *   MutationObservers (and the SDK's DOM-activity probes) cannot see.
 */

/** Bump when the page-side command contract changes; old sprites are replaced. */
export const AGENT_SPRITE_VERSION = 3;

/** Custom element name of the overlay host appended to `<html>`. */
export const AGENT_SPRITE_TAG = "ego-agent-sprite";

/**
 * A sprite that receives no commands for this long removes itself, so a page
 * the agent abandoned without handOff/finish does not keep a sprite forever.
 */
export const AGENT_SPRITE_IDLE_DISPOSE_MS = 10 * 60_000;

const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; pointer-events: none; }
.stage { position: absolute; inset: 0; overflow: hidden; }
.part { position: absolute; left: 0; top: 0; will-change: transform; }
.seg { height: 4px; margin-top: -2px; border-radius: 2px; background: #0d0d0d; transform-origin: 0 50%; }

.body { width: 48px; height: 48px; margin: -24px 0 0 -24px; }
.fuzz { position: absolute; inset: -9px; border-radius: 50%;
  -webkit-mask: radial-gradient(circle, #000 52%, transparent 71%);
  mask: radial-gradient(circle, #000 52%, transparent 71%); }
.fuzz.a { background: repeating-conic-gradient(#0d0d0d 0deg 3deg, transparent 3deg 7deg);
  animation: ego-fuzz-a 0.45s ease-in-out infinite alternate; }
.fuzz.b { background: repeating-conic-gradient(from 2deg, #0d0d0d 0deg 2deg, transparent 2deg 9deg);
  animation: ego-fuzz-b 0.6s ease-in-out infinite alternate; }
@keyframes ego-fuzz-a { from { transform: rotate(-5deg) scale(0.97); } to { transform: rotate(6deg) scale(1.05); } }
@keyframes ego-fuzz-b { from { transform: rotate(4deg) scale(1.04); } to { transform: rotate(-6deg) scale(0.96); } }
.core { position: absolute; inset: 0; border-radius: 50%;
  background: radial-gradient(circle at 38% 32%, #2c2c2c, #050505 70%); }

.eye { position: absolute; top: 14px; width: 14px; height: 14px; border-radius: 50%;
  background: #fff; overflow: hidden; transition: transform 120ms; }
.eye.l { left: 8.5px; }
.eye.r { left: 25.5px; }
.pupil { position: absolute; left: 50%; top: 50%; width: 6.2px; height: 6.2px; margin: -3.1px;
  border-radius: 50%; background: #0d0d0d;
  transform: translate(var(--look-x, 0px), var(--look-y, 0px)); }
.lid { position: absolute; left: -1px; right: -1px; top: -1px; height: 55%; background: #0d0d0d; display: none; }
.extra { position: absolute; display: none; }
.o-mouth { left: 20.5px; top: 31.5px; width: 7px; height: 7px; border: 2px solid #fff; border-radius: 50%; }
.smile { left: 18px; top: 28px; width: 12px; height: 7px; border: solid #fff; border-width: 0 0 2px 0; border-radius: 0 0 12px 12px; }
.teeth { left: 17px; top: 31px; width: 14px; height: 6px;
  background: repeating-linear-gradient(90deg, #fff 0 3.7px, #0d0d0d 3.7px 4.7px); }
.tongue { left: 26px; top: 32px; width: 5px; height: 5px; border-radius: 50%; background: #ff8fab; }
.sweat { left: 47px; top: 6px; width: 5px; height: 7px; border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%; background: #7cc8ff; }
.cheek { top: 27px; width: 5px; height: 5px; border-radius: 50%; background: rgba(255, 140, 170, 0.6); }
.cheek.l { left: 3px; }
.cheek.r { left: 40px; }

.face[data-expression="idle"] .eye { animation: ego-blink 3.8s infinite; }
@keyframes ego-blink { 0%, 96% { transform: scaleY(1); } 98% { transform: scaleY(0.1); } 100% { transform: scaleY(1); } }
.face[data-expression="tracking"] .eye { transform: scale(1.12); }
.face[data-expression="surprised"] .eye { transform: scale(1.35); }
.face[data-expression="surprised"] .pupil { width: 4px; height: 4px; margin: -2px; }
.face[data-expression="surprised"] .o-mouth { display: block; }
.face[data-expression="strain"] .eye { transform: scaleY(0.45); }
.face[data-expression="strain"] .teeth,
.face[data-expression="strain"] .sweat { display: block; }
.face[data-expression="focused"] .lid,
.face[data-expression="focused"] .tongue { display: block; }
.face[data-expression="squint"] .eye { background: transparent; border-radius: 1px;
  border: solid #fff; border-width: 2.4px 2.4px 0 0; }
.face[data-expression="squint"] .eye.l { transform: translate(-1px, 2px) rotate(45deg) scale(0.6); }
.face[data-expression="squint"] .eye.r { transform: translate(1px, 2px) rotate(-135deg) scale(0.6); }
.face[data-expression="squint"] .pupil,
.face[data-expression="happy"] .pupil { display: none; }
.face[data-expression="happy"] .eye { background: transparent; border-top: 2.4px solid #fff; transform: translateY(3px); }
.face[data-expression="happy"] .smile,
.face[data-expression="happy"] .cheek { display: block; }

.hat { position: absolute; left: 13px; top: -26px; width: 30px; height: 32px;
  transform: rotate(-14deg); transform-origin: 50% 100%; }
.cone { position: absolute; left: 4px; top: 0; width: 22px; height: 28px; background: #3d1f63;
  clip-path: polygon(0% 100%, 42% 10%, 72% 0%, 60% 24%, 100% 100%); }
.band { position: absolute; left: 5px; top: 21px; width: 20px; height: 4px; background: #ff7a1a; }
.brim { position: absolute; left: -2px; top: 25px; width: 34px; height: 8px; border-radius: 50%; background: #2b1645; }

.hand > div { position: absolute; display: none; background: #0d0d0d; }
.palm { width: 13px; height: 13px; border-radius: 50%; }
.finger { left: -10px; top: -1.3px; width: 12px; height: 2.6px; border-radius: 2px; transform-origin: 0 50%; }
.finger.f1 { transform: rotate(-43deg); }
.finger.f2 { transform: rotate(-14deg); }
.finger.f3 { transform: rotate(14deg); }
.finger.f4 { transform: rotate(43deg); }
.index { left: -7px; top: -1.6px; width: 7px; height: 3.2px; border-radius: 2px; }
.curl { width: 6px; height: 6px; border-radius: 50%; left: -10px; }
.curl.c1 { top: -7.5px; }
.curl.c2 { top: 1.5px; }
.pen { left: 3px; top: -7.5px; width: 22px; height: 5px; border-radius: 2.5px; transform-origin: 0 50%;
  transform: rotate(-60deg); background: linear-gradient(90deg, #ff7a1a 78%, #3d1f63 78%) !important; }
.nib { left: 0; top: -1.2px; width: 6px; height: 2.4px; border-radius: 1px; transform-origin: 0 50%; transform: rotate(-59deg); }
.hand[data-pose="open"] .palm { display: block; left: -16.5px; top: -6.5px; }
.hand[data-pose="open"] .finger { display: block; }
.hand[data-pose="tap"] .palm { display: block; left: -17.5px; top: -6.5px; }
.hand[data-pose="tap"] .index,
.hand[data-pose="tap"] .curl { display: block; }
.hand[data-pose="grab"] .palm { display: block; left: -14.5px; top: -8.5px; width: 17px; height: 17px; }
.hand[data-pose="pen"] .palm { display: block; left: 2.5px; top: -21.5px; }
.hand[data-pose="pen"] .pen,
.hand[data-pose="pen"] .nib { display: block; }

.ink { width: 5px; height: 2px; margin: -1px 0 0 -2.5px; border-radius: 1px; background: #3b1f63; display: none; }
.drag { width: 10px; height: 2px; margin-top: -1px; border-radius: 1px; background: #ff7a1a;
  transform-origin: 0 50%; display: none; }
.ripple { width: 20px; height: 20px; margin: -10px 0 0 -10px; border: 2px solid #ff7a1a; border-radius: 50%; opacity: 0; }

.trail { border-radius: 50%; background: rgba(255, 250, 240, 0.96); border: 1px solid #3d1f63; }
.trail.t1 { width: 5px; height: 5px; margin: -2.5px 0 0 -2.5px; }
.trail.t2 { width: 8px; height: 8px; margin: -4px 0 0 -4px; }
.bubble { border-radius: 12px; background: rgba(255, 250, 240, 0.96); border: 1.5px solid #3d1f63; }
.bubble-text { position: absolute; left: 0; top: 0; background-size: 100% 100%; display: none; }
.bubble[data-kind="text"] .bubble-text { display: block; }
.dot { position: absolute; top: 9.5px; width: 6px; height: 6px; border-radius: 50%; background: #3d1f63;
  animation: ego-dot 0.9s ease-in-out infinite; }
.dot.d1 { left: 11px; }
.dot.d2 { left: 23px; animation-delay: 0.15s; }
.dot.d3 { left: 35px; animation-delay: 0.3s; }
.bubble[data-kind="text"] .dot { display: none; }
@keyframes ego-dot { 0%, 100% { transform: translateY(2px); } 50% { transform: translateY(-3px); } }

.stage[data-art="pending"] { visibility: hidden; }
.art { position: absolute; display: none; }
.stage .art { background: transparent no-repeat 0 0 / 100% 100%; }
.stage[data-art="crayon"] .art { display: block; }
.stage[data-art="crayon"] .fuzz, .stage[data-art="crayon"] .core, .stage[data-art="crayon"] .eye,
.stage[data-art="crayon"] .extra, .stage[data-art="crayon"] .hat > div:not(.art),
.stage[data-art="crayon"] .hand > div:not(.art) { display: none !important; }
/* The living body: overlapping blobs and fur tufts moved every frame. */
.blob { left: 0; top: 0; width: 64px; height: 64px; margin: -32px 0 0 -32px; will-change: transform; }
.tuft { left: 0; top: 0; width: 14px; height: 22px; margin: -22px 0 0 -7px;
  transform-origin: 50% 100%; will-change: transform; }
.hat-art { transform-origin: 50% 85%; }
.face-art { left: -6px; top: 2px; width: 60px; height: 44px; transform-origin: 50% 41%; }
.pupil-art { top: 15px; width: 10px; height: 10px;
  transform: translate(calc(var(--look-x, 0px) * 1.4), calc(var(--look-y, 0px) * 1.4)); }
.pupil-art.l { left: 8px; }
.pupil-art.r { left: 30px; }
.stage[data-art="crayon"] .face[data-expression="idle"] .face-art { animation: ego-blink 3.8s infinite; }
.stage[data-art="crayon"] .face[data-expression="idle"] .pupil-art { animation: ego-blink-pupil 3.8s infinite; }
@keyframes ego-blink-pupil { 0%, 96% { opacity: 1; } 97%, 99% { opacity: 0; } 100% { opacity: 1; } }
.stage[data-art="crayon"] .face[data-expression="surprised"] .pupil-art {
  transform: translate(calc(var(--look-x, 0px) * 1.4), calc(var(--look-y, 0px) * 1.4)) scale(0.7); }
.stage[data-art="crayon"] .face[data-expression="focused"] .pupil-art { top: 16px; }
.stage[data-art="crayon"] .face[data-expression="squint"] .pupil-art,
.stage[data-art="crayon"] .face[data-expression="strain"] .pupil-art,
.stage[data-art="crayon"] .face[data-expression="happy"] .pupil-art { display: none; }
/* HAT_SCALE (1.45) x the 52px design, placed so the brim stays on the head. */
.hat-art { left: -12.7px; top: -39.4px; width: 75.4px; height: 75.4px; }
.hand-art { left: -57.6px; top: -57.6px; width: 115.2px; height: 115.2px; }
.bubble-dots-art { inset: 0; }
.bubble[data-kind="text"] .bubble-dots-art { display: none !important; }

.stage[data-art="crayon"] .seg { height: 12px; margin-top: -6px; border-radius: 0;
  background: transparent repeat-x 0 0 / 24px 12px; }
.stage[data-art="crayon"] .ink, .stage[data-art="crayon"] .drag, .stage[data-art="crayon"] .ripple,
.stage[data-art="crayon"] .trail, .stage[data-art="crayon"] .dot {
  border: 0; border-radius: 0; background: transparent no-repeat 0 0 / 100% 100%; }
.stage[data-art="crayon"] .ink { width: 18px; height: 9px; margin: -4.5px 0 0 -9px; }
.stage[data-art="crayon"] .drag { width: 18px; height: 6px; margin-top: -3px; }
.stage[data-art="crayon"] .ripple { width: 40px; height: 40px; margin: -20px 0 0 -20px; }
.stage[data-art="crayon"] .trail.t1 { width: 10px; height: 10px; margin: -5px 0 0 -5px; }
.stage[data-art="crayon"] .trail.t2 { width: 14px; height: 14px; margin: -7px 0 0 -7px; }
.stage[data-art="crayon"] .bubble { border: 0; border-radius: 0; background: transparent; }
.stage[data-art="crayon"] .dot { top: 12px; width: 8px; height: 8px; }
.stage[data-art="crayon"] .dot.d1 { left: 14px; }
.stage[data-art="crayon"] .dot.d2 { left: 26px; }
.stage[data-art="crayon"] .dot.d3 { left: 38px; }
`;

export const AGENT_SPRITE_PAGE_SOURCE = `function installAgentSprite(win, key) {
  "use strict";
  var VERSION = ${AGENT_SPRITE_VERSION};
  var existing = win[key];
  if (existing && existing.version === VERSION) return existing;
  if (existing && typeof existing.dispose === "function") {
    try { existing.dispose(); } catch (error) {}
  }

  // Timings in milliseconds. Every visual reacts to a command immediately and
  // then settles on its own; nothing here ever waits on or delays the agent.
  var IDLE_DISPOSE_MS = ${AGENT_SPRITE_IDLE_DISPOSE_MS};
  var LABEL_MS = 6000;
  var LABEL_MAX_CHARS = 72;
  var HAPPY_MS = 900;
  var SURPRISED_MS = 1600;
  var TRACK_MS = 1200;
  var CHASE_MS = 45;
  var RIPPLE_MS = 450;
  var BODY_RADIUS = 24;
  var ARM_SEGMENTS = 28;
  var INK_DOTS = 6;
  var RIPPLES = 5;

  // Every action gets its own hand: reach (by distance), act (by gesture),
  // retract. Hands start in order, at least HAND_STAGGER_MS apart, and may
  // overlap; past MAX_HANDS at work the oldest pull back early.
  var MAX_HANDS = 5;
  var HAND_SLOTS = 7;
  var HAND_STAGGER_MS = 120;
  var REACH_MIN_MS = 220;
  var REACH_MAX_MS = 420;
  var RETRACT_MS = 300;
  var KEY_MS = 200;
  var ACT_MS = { point: 450, poke: 300, knock: 420, slap: 320, grab: 520 };
  var WRITE_BASE_MS = 600;
  var WRITE_CHAR_MS = 30;
  var WRITE_MAX_MS = 1500;
  var SCROLL_MORE_MS = 260;
  var ACT_MAX_MS = 2000;
  var MERGE_PX = 48;
  // Hands swing out and back on an arc; arms bow by a share of their length.
  var SWING = 0.22;
  var ARM_BEND = 0.24;
  var ARM_BEND_MAX = 150;
  var DRAG_MAX = 60;
  // Angles (radians) off the line to the target where an arm leaves the body.
  var EXIT_OFFSETS = [-0.9, -0.45, 0, 0.45, 0.9];
  var VARIANTS = {
    tap: ["poke", "knock", "slap"],
    write: ["pen", "crayon"],
    grab: ["fist", "push"],
    point: ["point"]
  };
  // Crayon hand image and plain CSS pose for each variant.
  var ART_FOR = { point: "open", poke: "tap", knock: "grab", slap: "open", pen: "pen",
    crayon: "crayon", fist: "grab", push: "open" };
  var PLAIN_FOR = { point: "open", poke: "tap", knock: "grab", slap: "open", pen: "pen",
    crayon: "pen", fist: "grab", push: "open" };
  var UPRIGHT = { pen: true, crayon: true };
  var RIPPLE_AT = { poke: [0.45], knock: [0.5, 0.97], slap: [0.4] };
  var RIPPLE_SIZE = { poke: 1, knock: 0.75, slap: 1.5 };
  var KIND_FACE = { tap: "squint", grab: "strain", write: "focused", point: "tracking" };
  var KIND_POSE = { tap: "tap", grab: "grab", write: "pen", point: "open" };
  var SOOT_BLOBS = 7;
  var SOOT_TUFTS = 30;
  var LABEL_FONT = "500 13px system-ui, -apple-system, sans-serif";
  var CRAYON_FONT = '600 14px "Chalkboard SE", "Comic Sans MS", "Marker Felt", system-ui, sans-serif';

  var doc = win.document;
  var clock = function () { return win.performance.now(); };

  function div(className, parent) {
    var node = doc.createElement("div");
    node.setAttribute("class", className);
    parent.append(node);
    return node;
  }

  function css(node, values) {
    for (var name in values) node.style.setProperty(name, values[name]);
  }

  // The host is a fixed, full-viewport, click-through layer above the page.
  var host = doc.createElement("${AGENT_SPRITE_TAG}");
  host.setAttribute("aria-hidden", "true");
  host.setAttribute("inert", "");
  var hostStyle = {
    position: "fixed",
    top: "0",
    left: "0",
    width: "100vw",
    height: "100vh",
    margin: "0",
    padding: "0",
    border: "0",
    background: "transparent",
    "pointer-events": "none",
    "z-index": "2147483647",
    display: "block",
    contain: "strict",
    opacity: "1",
    transform: "none",
    visibility: "visible"
  };
  for (var name in hostStyle) host.style.setProperty(name, hostStyle[name], "important");
  var root = host.attachShadow({ mode: "closed" });
  var sheet = doc.createElement("style");
  sheet.textContent = ${JSON.stringify(STYLE)};
  root.append(sheet);
  var stage = doc.createElement("div");
  stage.setAttribute("class", "stage");
  // "pending" until the crayon images are ready, then "crayon" or "plain".
  stage.setAttribute("data-art", "pending");
  root.append(stage);
  var art = null;

  // Paint order: arms, thought trail and bubble, body, hands, ripples. Each
  // hand slot owns one arm behind the body and one hand in front of it.
  var armLayer = div("layer", stage);
  var trails = [div("part trail t1", stage), div("part trail t2", stage)];
  var bubble = div("part bubble", stage);
  var bubbleDotsArt = div("art bubble-dots-art", bubble);
  var bubbleText = div("bubble-text", bubble);
  var dots = [div("dot d1", bubble), div("dot d2", bubble), div("dot d3", bubble)];
  var body = div("part body", stage);
  div("fuzz a", body);
  div("fuzz b", body);
  div("core", body);
  // Tufts first so the blobs cover their roots.
  var tuftNodes = [];
  for (var t = 0; t < SOOT_TUFTS; t += 1) tuftNodes.push(div("art tuft", body));
  var blobNodes = [];
  for (var b = 0; b < SOOT_BLOBS; b += 1) blobNodes.push(div("art blob", body));
  var face = div("face", body);
  [div("eye l", face), div("eye r", face)].forEach(function (eye) {
    div("pupil", eye);
    div("lid", eye);
  });
  ["extra o-mouth", "extra smile", "extra teeth", "extra tongue", "extra sweat",
    "extra cheek l", "extra cheek r"].forEach(function (className) { div(className, face); });
  var faceArt = div("art face-art", face);
  var pupilArts = [div("art pupil-art l", face), div("art pupil-art r", face)];
  var hat = div("hat", body);
  div("brim", hat);
  div("cone", hat);
  div("band", hat);
  var hatArt = div("art hat-art", hat);
  var handLayer = div("layer", stage);
  var slots = [];
  for (var slotIndex = 0; slotIndex < HAND_SLOTS; slotIndex += 1) {
    var armBox = div("limb", armLayer);
    var front = div("limb", handLayer);
    var segments = [];
    for (var s = 0; s < ARM_SEGMENTS; s += 1) segments.push(div("part seg", armBox));
    var handNode = div("part hand", front);
    ["palm", "finger f1", "finger f2", "finger f3", "finger f4", "index", "curl c1",
      "curl c2", "pen", "nib"].forEach(function (className) { div(className, handNode); });
    var handArt = div("art hand-art", handNode);
    var inks = [];
    for (var i = 0; i < INK_DOTS; i += 1) inks.push(div("part ink", front));
    var drags = [div("part drag", front), div("part drag", front), div("part drag", front)];
    armBox.style.setProperty("display", "none");
    front.style.setProperty("display", "none");
    slots.push({
      arm: armBox,
      front: front,
      segments: segments,
      hand: handNode,
      handArt: handArt,
      inks: inks,
      drags: drags,
      owner: null,
      visible: false,
      shownVariant: "",
      shownInk: ""
    });
  }
  var rippleNodes = [];
  for (var r = 0; r < RIPPLES; r += 1) rippleNodes.push(div("part ripple", stage));

  function mount() {
    if (!host.isConnected) (doc.documentElement || doc).append(host);
  }

  function viewport() {
    return { width: win.innerWidth || 0, height: win.innerHeight || 0 };
  }

  /** Body center: anchored near the bottom-right corner, gently bobbing. */
  function bodyCenter(now) {
    var size = viewport();
    return {
      x: size.width - 64 + Math.sin(now / 1100) * 2,
      y: size.height - 58 + Math.sin(now / 700) * 3
    };
  }

  function restingHand() {
    var size = viewport();
    return { x: size.width - 150, y: size.height - 44 };
  }

  function bodyRadius() {
    return art ? 30 : BODY_RADIUS;
  }

  function clampPoint(x, y) {
    var size = viewport();
    return {
      x: Math.min(Math.max(x, 0), size.width),
      y: Math.min(Math.max(y, 0), size.height)
    };
  }

  function finitePoint(command) {
    return typeof command.x === "number" && typeof command.y === "number" &&
      isFinite(command.x) && isFinite(command.y);
  }

  function normalizeLabel(label) {
    var text = String(label == null ? "" : label).replace(/\\s+/g, " ").trim();
    if (text.length > LABEL_MAX_CHARS) text = text.slice(0, LABEL_MAX_CHARS).trimEnd() + "\\u2026";
    return text;
  }

  var start = clock();
  var rest = restingHand();
  var state = {
    lastTarget: { x: rest.x, y: rest.y },
    mood: null,
    moodUntil: 0,
    label: "",
    labelUntil: 0,
    labelImage: null,
    lastPointAt: -Infinity,
    lastCommandAt: start,
    lastFrameAt: start,
    ripples: [],
    hidden: false,
    disposed: false
  };
  var frameId = 0;
  var shown = { expression: "", bubble: "" };

  // ---- hands ---------------------------------------------------------------
  // A hand is a timeline: waiting (staggered start), reach, act, retract,
  // done. Times inside it are scaled by its speed so crowded hands hurry.

  var hands = [];
  var lastBornAt = -Infinity;
  var lastExit = 0;
  var lastVariant = {};

  function copy(point) {
    return { x: point.x, y: point.y };
  }

  /** Pick a variant for the gesture, never the same one twice in a row. */
  function chooseVariant(kind) {
    var options = VARIANTS[kind];
    var fresh = options.filter(function (variant) { return variant !== lastVariant[kind]; });
    var pool = fresh.length ? fresh : options;
    var variant = pool[Math.floor(Math.random() * pool.length)];
    lastVariant[kind] = variant;
    return variant;
  }

  function writeMs(chars) {
    return Math.min(WRITE_MAX_MS, WRITE_BASE_MS + chars * WRITE_CHAR_MS);
  }

  function phaseOf(hand, now) {
    if (hand.forcedAt !== null && now >= hand.forcedAt) {
      var back = (now - hand.forcedAt) * hand.speed;
      return back < RETRACT_MS ? { name: "retract", p: back / RETRACT_MS } : { name: "done", p: 1 };
    }
    var elapsed = (now - hand.bornAt) * hand.speed;
    if (elapsed < 0) return { name: "waiting", p: 0 };
    if (elapsed < hand.reachMs) return { name: "reach", p: elapsed / hand.reachMs };
    elapsed -= hand.reachMs;
    if (elapsed < hand.actMs) {
      // A gesture restarted on a hand that is already out begins at actFrom.
      var span = Math.max(1, hand.actMs - hand.actFrom);
      return { name: "act", p: Math.min(1, Math.max(0, (elapsed - hand.actFrom) / span)), ms: elapsed };
    }
    elapsed -= hand.actMs;
    if (elapsed < RETRACT_MS) return { name: "retract", p: elapsed / RETRACT_MS };
    return { name: "done", p: 1 };
  }

  /** Still out at work: not yet retracting. */
  function busy(hand, now) {
    var name = phaseOf(hand, now).name;
    return name === "waiting" || name === "reach" || name === "act";
  }

  function actElapsed(hand, now) {
    return Math.max(0, (now - hand.bornAt) * hand.speed - hand.reachMs);
  }

  /** Keep acting for at least "more" ms from now; typing and scrolling grow this way. */
  function extendAct(hand, now, more) {
    hand.actMs = Math.min(ACT_MAX_MS, Math.max(hand.actMs, actElapsed(hand, now) + more));
  }

  /** Play a fresh gesture on a hand that is already out, e.g. point then click. */
  function restartAct(hand, now, kind, variant, duration) {
    var elapsed = actElapsed(hand, now);
    hand.kind = kind;
    hand.variant = variant;
    hand.actFrom = elapsed;
    hand.actMs = Math.min(ACT_MAX_MS, elapsed + duration);
    hand.rippled = 0;
  }

  function slotFor() {
    for (var index = 0; index < slots.length; index += 1) {
      if (!slots[index].owner) return slots[index];
    }
    // Every slot is taken: the oldest hand vanishes to make room.
    var oldest = hands.shift();
    oldest.slot.owner = null;
    return oldest.slot;
  }

  function spawn(kind, variant, target, now, actMs) {
    var working = hands.filter(function (hand) { return busy(hand, now); });
    for (var extra = working.length - MAX_HANDS + 1; extra > 0; extra -= 1) {
      working.shift().forcedAt = now;
    }
    var slot = slotFor();
    var bornAt = Math.max(now, lastBornAt + HAND_STAGGER_MS);
    lastBornAt = bornAt;
    var exits = EXIT_OFFSETS.filter(function (offset) { return offset !== lastExit; });
    lastExit = exits[Math.floor(Math.random() * exits.length)];
    var center = bodyCenter(now);
    var distance = Math.hypot(target.x - center.x, target.y - center.y);
    var hand = {
      kind: kind,
      variant: variant,
      target: target,
      bornAt: bornAt,
      speed: working.length >= 3 ? 1.7 : working.length >= 1 ? 1.25 : 1,
      reachMs: Math.min(REACH_MAX_MS, REACH_MIN_MS + distance * 0.12),
      actMs: actMs,
      actFrom: 0,
      forcedAt: null,
      exit: lastExit,
      curl: (Math.random() < 0.5 ? -1 : 1) * (0.7 + Math.random() * 0.6),
      tip: null,
      retractFrom: null,
      drag: { x: 0, y: 0 },
      chars: 0,
      failed: false,
      rippled: 0,
      slot: slot
    };
    slot.owner = hand;
    hands.push(hand);
    return hand;
  }

  /** A hand that was out on the previous page, already pulling back. */
  function spawnRetracting(point, now) {
    var hand = spawn("point", "point", point, now, 0);
    hand.bornAt = now;
    hand.forcedAt = now;
    hand.speed = 1;
    hand.retractFrom = copy(point);
    hand.tip = copy(point);
  }

  /** The newest hand still at work, if any. */
  function workingHand(now) {
    for (var index = hands.length - 1; index >= 0; index -= 1) {
      if (busy(hands[index], now)) return hands[index];
    }
    return null;
  }

  function poseAt(now) {
    var hand = workingHand(now);
    return hand ? KIND_POSE[hand.kind] : "open";
  }

  /** The face follows the newest hand's action; outcomes outrank it. */
  function expressionAt(now) {
    if (state.mood && state.moodUntil > now) return state.mood;
    var hand = workingHand(now);
    if (hand) return KIND_FACE[hand.kind];
    if (now - state.lastPointAt < TRACK_MS) return "tracking";
    return "idle";
  }

  function bubbleAt(now) {
    if (state.label && state.labelUntil > now) return { kind: "text", text: state.label };
    return { kind: "dots" };
  }

  // ---- crayon art ----------------------------------------------------------
  // Each part is drawn once on a detached canvas with jittered, translucent
  // wax strokes and paper grain. A fixed seed keeps the sprite identical on
  // every page.

  var INK = "#17141b";
  var CHALK = "#fffaf0";
  var PURPLE = "#4a2a7d";
  var PLUM = "#2b1645";
  var ORANGE = "#ff7a1a";
  var PINK = "#ff8fab";
  var SKY = "#7cc8ff";
  var SLIME = "#5fbf3a";
  var ART_RATIO = 2;
  // Hands are drawn in a 72px design space and shown this much larger; keep
  // in sync with .hand-art in the stylesheet.
  var HAND_SCALE = 1.6;
  var HAT_SCALE = 1.45;
  var ART_SLICE_MS = 8;
  var seed = 0;

  function random() {
    seed = (seed + 0x6d2b79f5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function jitter(amount) {
    return (random() * 2 - 1) * amount;
  }

  function canvasSheet(width, height, ratio) {
    var canvas = doc.createElement("canvas");
    var context = canvas.getContext && canvas.getContext("2d");
    if (!context || typeof canvas.toDataURL !== "function") return null;
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    context.scale(ratio, ratio);
    context.lineCap = "round";
    context.lineJoin = "round";
    return { canvas: canvas, context: context };
  }

  function tracePath(context, points) {
    context.beginPath();
    points.forEach(function (point, index) {
      if (index === 0) context.moveTo(point[0], point[1]);
      else context.lineTo(point[0], point[1]);
    });
  }

  /** A waxy stroke: a few jittered, translucent passes along the points. */
  function crayonLine(context, points, color, width, passes) {
    context.strokeStyle = color;
    for (var pass = 0; pass < passes; pass += 1) {
      context.globalAlpha = 0.5 + random() * 0.3;
      context.lineWidth = width * (0.65 + random() * 0.45);
      tracePath(context, points.map(function (point) {
        return [point[0] + jitter(width * 0.3), point[1] + jitter(width * 0.3)];
      }));
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  function ellipsePoints(cx, cy, rx, ry, count) {
    var points = [];
    var phase = random() * Math.PI * 2;
    for (var index = 0; index <= count; index += 1) {
      var angle = phase + (index / count) * Math.PI * 2;
      points.push([cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry]);
    }
    return points;
  }

  /** Fill an ellipse the way a crayon does: crossed hatching plus an outline. */
  function crayonBlob(context, cx, cy, rx, ry, color) {
    var stroke = Math.max(1.6, Math.min(3.2, Math.min(rx, ry) / 3));
    var hatches = Math.max(3, Math.ceil((2 * Math.max(rx, ry)) / (stroke * 0.75)));
    [0.6, -0.9].forEach(function (angle) {
      var along = { x: Math.cos(angle), y: Math.sin(angle) };
      for (var index = 0; index < hatches; index += 1) {
        var offset = -1 + ((index + 0.5) / hatches) * 2 + jitter(0.04);
        var half = Math.sqrt(Math.max(0, 1 - offset * offset)) * 0.92;
        var baseX = -along.y * offset;
        var baseY = along.x * offset;
        crayonLine(context, [
          [cx + (baseX - along.x * half) * rx, cy + (baseY - along.y * half) * ry],
          [cx + (baseX + along.x * half) * rx, cy + (baseY + along.y * half) * ry]
        ], color, stroke, 1);
      }
    });
    crayonLine(context, ellipsePoints(cx, cy, rx, ry, 18), color, stroke, 2);
  }

  function roundedPoints(x, y, width, height, radius) {
    var corners = [
      [x + width - radius, y + radius, -0.5],
      [x + width - radius, y + height - radius, 0],
      [x + radius, y + height - radius, 0.5],
      [x + radius, y + radius, 1]
    ];
    var points = [];
    corners.forEach(function (corner) {
      for (var index = 0; index <= 4; index += 1) {
        var angle = (corner[2] + index / 8) * Math.PI;
        points.push([corner[0] + Math.cos(angle) * radius, corner[1] + Math.sin(angle) * radius]);
      }
    });
    points.push(points[0]);
    return points;
  }

  /** A cream thought bubble with waxy texture and a plum crayon outline. */
  function crayonBubble(context, x, y, width, height) {
    var outline = roundedPoints(x, y, width, height, Math.min(12, height / 2));
    context.fillStyle = CHALK;
    context.globalAlpha = 0.95;
    tracePath(context, outline);
    context.fill();
    context.globalAlpha = 1;
    context.save();
    tracePath(context, outline);
    context.clip();
    for (var hatch = -height; hatch < width; hatch += 5) {
      crayonLine(context, [[x + hatch, y + height], [x + hatch + height, y]], "#f3dfbd", 2.4, 1);
    }
    context.restore();
    crayonLine(context, outline, PLUM, 1.8, 2);
  }

  /** Erase specks so the paper shows through, like crayon on rough paper. */
  function grain(context, width, height, count, strength) {
    context.globalCompositeOperation = "destination-out";
    context.fillStyle = "#000";
    for (var index = 0; index < count; index += 1) {
      context.globalAlpha = random() * strength;
      context.fillRect(random() * width, random() * height, 0.6 + random() * 0.9, 0.6 + random() * 0.9);
    }
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
  }

  /** Paint in a width x height design space, enlarged by an optional scale. */
  function render(width, height, paint, scale) {
    var factor = scale || 1;
    var page = canvasSheet(width * factor, height * factor, ART_RATIO);
    if (!page) return null;
    page.context.scale(factor, factor);
    paint(page.context);
    grain(page.context, width, height, Math.round(width * height * 0.1), 0.35);
    return page.canvas.toDataURL("image/png");
  }

  /**
   * One lump of soot in a 64x64 sheet (drawn radius 28): a solid core under
   * crayon hatching. The living body overlaps several of these.
   */
  function paintSootBlob(context) {
    context.fillStyle = INK;
    context.globalAlpha = 0.92;
    context.beginPath();
    context.arc(32, 32, 24, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;
    crayonBlob(context, 32, 32, 28, 28, INK);
  }

  /**
   * A fur tuft in a 14x22 sheet: a few soft, curved hairs fanning up from
   * (7, 22), thick at the root and tapering to a wisp.
   */
  function paintTuft(context) {
    var hairs = 3 + Math.floor(random() * 2);
    for (var index = 0; index < hairs; index += 1) {
      var rootX = 7 + jitter(1.8);
      var tipX = 7 + jitter(5);
      var tipY = 1.5 + random() * 5;
      var bend = jitter(3.5);
      var curve = [];
      for (var step = 0; step <= 5; step += 1) {
        var t = step / 5;
        curve.push([
          rootX + (tipX - rootX) * t + bend * Math.sin(Math.PI * t),
          22 + (tipY - 22) * t
        ]);
      }
      crayonLine(context, curve.slice(0, 4), INK, 2.6, 2);
      crayonLine(context, curve, INK, 1.4, 2);
    }
  }

  function paintHat(context) {
    var cone = [[11, 42], [22, 14], [35, 3], [30, 16], [42, 42]];
    context.save();
    tracePath(context, cone);
    context.closePath();
    context.clip();
    for (var y = 0; y < 50; y += 2.4) {
      crayonLine(context, [[6, y + 8], [46, y - 6]], PURPLE, 3, 1);
    }
    context.restore();
    crayonLine(context, cone.concat([cone[0]]), PLUM, 2.2, 2);
    crayonLine(context, [[13, 35], [27, 34], [40, 35]], ORANGE, 4.5, 3);
    crayonBlob(context, 26, 43, 23, 5.5, PLUM);
  }

  // Faces are 60x44 with the eyes at (19, 18) and (41, 18); the moving
  // pupils are separate so they can follow the hand.
  function eyes(context, rx, ry, dy) {
    crayonBlob(context, 19, 18 + dy, rx, ry, CHALK);
    crayonBlob(context, 41, 18 + dy, rx, ry, CHALK);
  }

  var FACES = {
    idle: function (context) { eyes(context, 8, 8.5, 0); },
    tracking: function (context) { eyes(context, 9, 9.5, 0); },
    surprised: function (context) {
      eyes(context, 10.5, 11, 0);
      crayonLine(context, ellipsePoints(30, 33, 3.2, 3.6, 10), CHALK, 2, 2);
    },
    focused: function (context) {
      eyes(context, 8, 5.5, 1);
      crayonLine(context, [[25, 32], [31, 33]], CHALK, 2, 2);
      crayonBlob(context, 34, 33.5, 3, 2.8, PINK);
    },
    squint: function (context) {
      crayonLine(context, [[13, 12], [22, 18], [13, 24]], CHALK, 3.2, 3);
      crayonLine(context, [[47, 12], [38, 18], [47, 24]], CHALK, 3.2, 3);
    },
    strain: function (context) {
      eyes(context, 8, 3, 0);
      crayonLine(context, [[21, 30], [24, 34], [27, 30], [30, 34], [33, 30], [36, 34], [39, 30]], CHALK, 2, 2);
      crayonBlob(context, 54, 9, 3, 4, SKY);
    },
    happy: function (context) {
      crayonLine(context, [[12, 21], [19, 13], [26, 21]], CHALK, 3.2, 3);
      crayonLine(context, [[34, 21], [41, 13], [48, 21]], CHALK, 3.2, 3);
      crayonLine(context, [[22, 28], [26, 32.5], [30, 33.5], [34, 32.5], [38, 28]], CHALK, 2.4, 2);
      crayonBlob(context, 8, 28, 3.6, 3, PINK);
      crayonBlob(context, 52, 28, 3.6, 3, PINK);
    }
  };

  // Hands are 72x72 with the fingertip (or pen nib) at the center (36, 36).
  // They point along +x and are rotated toward the target, except the pen,
  // which is drawn upright.
  var HANDS = {
    open: function (context) {
      crayonBlob(context, 13, 36, 12, 11.5, INK);
      [-0.75, -0.25, 0.25, 0.75].forEach(function (angle) {
        crayonLine(context, [
          [13 + Math.cos(angle) * 8, 36 + Math.sin(angle) * 8],
          [13 + Math.cos(angle) * 16, 36 + Math.sin(angle) * 16 + jitter(1)],
          [13 + Math.cos(angle) * 23, 36 + Math.sin(angle) * 23]
        ], INK, 5, 3);
      });
    },
    tap: function (context) {
      crayonBlob(context, 11, 36, 11.5, 11, INK);
      crayonLine(context, [[18, 36], [27, 35.5], [35, 36]], INK, 6.5, 3);
      crayonBlob(context, 21, 27, 5, 4.5, INK);
      crayonBlob(context, 21, 45, 5, 4.5, INK);
    },
    grab: function (context) {
      crayonBlob(context, 22, 36, 15, 14, INK);
      [-7, 0, 7].forEach(function (dy) {
        crayonLine(context, [[31, 33 + dy], [34, 36 + dy], [31, 39 + dy]], "#6b6472", 1.5, 1);
      });
    },
    pen: function (context) {
      crayonLine(context, [[36, 36], [38.5, 32], [41, 28]], INK, 3.4, 3);
      crayonLine(context, [[41, 28], [47, 17.5], [53, 7]], ORANGE, 8, 4);
      crayonLine(context, [[51, 10.5], [54.5, 4.5]], "#5b2f91", 8, 3);
      crayonBlob(context, 47, 20, 10, 9.5, INK);
    },
    // A stubby slime-green crayon held in the same fist as the pen.
    crayon: function (context) {
      crayonLine(context, [[36, 36], [38, 32.5], [40, 29]], SLIME, 4.5, 3);
      crayonLine(context, [[40, 29], [46, 18.5], [51, 10]], SLIME, 10, 4);
      crayonLine(context, [[42.5, 24.5], [48.5, 14]], CHALK, 2.4, 2);
      crayonBlob(context, 47, 20, 10, 9.5, INK);
    }
  };

  /**
   * The arm tile repeats along every segment, so its passes are straight and
   * run past both edges: any wobble or rounded end would bead at the seams.
   * The grain alone gives it the crayon texture.
   */
  function paintArm(context) {
    context.lineCap = "butt";
    context.strokeStyle = INK;
    [[6, 7, 0.8], [5.2, 5, 0.6], [6.8, 4.4, 0.55], [6, 3, 0.7]].forEach(function (pass) {
      context.globalAlpha = pass[2];
      context.lineWidth = pass[1];
      context.beginPath();
      context.moveTo(-2, pass[0]);
      context.lineTo(26, pass[0]);
      context.stroke();
    });
    context.globalAlpha = 1;
    context.lineCap = "round";
  }

  function paintTrail(size) {
    return function (context) {
      var center = size / 2;
      crayonBlob(context, center, center, size * 0.36, size * 0.36, CHALK);
      crayonLine(context, ellipsePoints(center, center, size * 0.38, size * 0.38, 10), PLUM, 1.2, 1);
    };
  }

  /**
   * Every crayon image as one small drawing job, so the art can be built a
   * few milliseconds at a time. Jobs run in order, keeping the seed stable.
   */
  function artJobs() {
    seed = 0x2b1645;
    var built = { blobs: [], tufts: [], faces: {}, hands: {} };
    var jobs = [];
    function add(target, name, width, height, paint, scale) {
      jobs.push(function () { target[name] = render(width, height, paint, scale); });
    }
    for (var variant = 0; variant < 2; variant += 1) add(built.blobs, variant, 64, 64, paintSootBlob);
    for (var tuft = 0; tuft < 3; tuft += 1) add(built.tufts, tuft, 14, 22, paintTuft);
    add(built, "hat", 52, 52, paintHat, HAT_SCALE);
    add(built, "arm", 24, 12, paintArm);
    add(built, "pupil", 10, 10, function (context) { crayonBlob(context, 5, 5, 3.6, 3.6, INK); });
    add(built, "ink", 18, 9, function (context) {
      crayonLine(context, [[1.5, 6], [6, 3], [10.5, 6], [16.5, 3]], PURPLE, 3, 2);
    });
    add(built, "drag", 18, 6, function (context) {
      crayonLine(context, [[1, 3], [9, 3.5], [17, 3]], ORANGE, 2.6, 2);
    });
    add(built, "ripple", 40, 40, function (context) {
      crayonLine(context, ellipsePoints(20, 20, 16, 16, 20), ORANGE, 2.6, 2);
    });
    add(built, "trailSmall", 10, 10, paintTrail(10));
    add(built, "trailLarge", 14, 14, paintTrail(14));
    add(built, "dot", 8, 8, function (context) { crayonBlob(context, 4, 4, 2.8, 2.8, PLUM); });
    add(built, "dotsBubble", 60, 32, function (context) { crayonBubble(context, 1.5, 1.5, 57, 29); });
    for (var expression in FACES) add(built.faces, expression, 60, 44, FACES[expression]);
    for (var pose in HANDS) add(built.hands, pose, 72, 72, HANDS[pose], HAND_SCALE);
    add(built, "inkGreen", 18, 9, function (context) {
      crayonLine(context, [[1.5, 6], [6, 3], [10.5, 6], [16.5, 3]], SLIME, 3.6, 2);
    });
    return { built: built, jobs: jobs, total: jobs.length };
  }

  /** True when every job produced an image. */
  function artComplete(work) {
    var urls = [];
    for (var name in work.built) {
      var value = work.built[name];
      if (value && typeof value === "object") {
        for (var part in value) urls.push(value[part]);
      } else {
        urls.push(value);
      }
    }
    return urls.length === work.total && urls.every(Boolean);
  }

  function setImage(node, url) {
    node.style.setProperty("background-image", 'url("' + url + '")');
  }

  /** Switch between the crayon images and the plain CSS shapes. */
  function useArt(next) {
    if (state.disposed) return;
    art = next;
    stage.setAttribute("data-art", art ? "crayon" : "plain");
    if (art) {
      blobNodes.forEach(function (node, index) { setImage(node, art.blobs[index % art.blobs.length]); });
      tuftNodes.forEach(function (node, index) { setImage(node, art.tufts[index % art.tufts.length]); });
      setImage(hatArt, art.hat);
      setImage(bubbleDotsArt, art.dotsBubble);
      pupilArts.forEach(function (node) { setImage(node, art.pupil); });
      slots.forEach(function (slot) {
        slot.segments.forEach(function (node) { setImage(node, art.arm); });
        slot.drags.forEach(function (node) { setImage(node, art.drag); });
      });
      rippleNodes.forEach(function (node) { setImage(node, art.ripple); });
      dots.forEach(function (node) { setImage(node, art.dot); });
      setImage(trails[0], art.trailSmall);
      setImage(trails[1], art.trailLarge);
    }
    slots.forEach(function (slot) {
      slot.shownVariant = "";
      slot.shownInk = "";
    });
    shown.expression = "";
    shown.bubble = "";
    if (state.label) state.labelImage = labelImage(state.label);
  }

  var artWork = null;

  /**
   * Draw the art in short idle slices so neither installing nor a later
   * agent input waits on it, then keep it only if this page's CSP lets data:
   * images load.
   */
  function prepareArt(deadline) {
    if (state.disposed) return;
    var budget = deadline && typeof deadline.timeRemaining === "function"
      ? Math.min(ART_SLICE_MS, deadline.timeRemaining())
      : ART_SLICE_MS;
    var started = clock();
    try {
      if (!artWork) artWork = artJobs();
      do {
        artWork.jobs.shift()();
      } while (artWork.jobs.length && clock() - started < budget);
    } catch (error) {
      useArt(null);
      return;
    }
    if (artWork.jobs.length) {
      scheduleArt();
      return;
    }
    var next = artComplete(artWork) ? artWork.built : null;
    artWork = null;
    if (!next || typeof win.Image !== "function") {
      useArt(next);
      return;
    }
    var probe = new win.Image();
    probe.onload = function () { useArt(next); };
    probe.onerror = function () { useArt(null); };
    probe.src = next.blobs[0];
  }

  function scheduleArt() {
    if (typeof win.requestIdleCallback === "function") {
      win.requestIdleCallback(prepareArt, { timeout: 300 });
    } else if (typeof win.setTimeout === "function") {
      win.setTimeout(prepareArt, 0);
    } else {
      prepareArt();
    }
  }

  // ---- label image ---------------------------------------------------------

  /** Wrap a label to at most two lines of the given pixel width. */
  function wrap(context, text, maxWidth) {
    var lines = [];
    var current = "";
    for (var index = 0; index < text.length; index += 1) {
      var next = current + text[index];
      if (context.measureText(next).width <= maxWidth || !current) {
        current = next;
        continue;
      }
      var space = current.lastIndexOf(" ");
      if (space > 0 && text[index] !== " ") {
        lines.push(current.slice(0, space));
        current = current.slice(space + 1) + text[index];
      } else {
        lines.push(current);
        current = text[index] === " " ? "" : text[index];
      }
    }
    if (current) lines.push(current);
    if (lines.length > 2) {
      lines = lines.slice(0, 2);
      lines[1] = lines[1].replace(/.$/, "") + "\\u2026";
    }
    return lines;
  }

  /**
   * Render a label to an image on a canvas that is never attached to the DOM,
   * so the snapshot cannot list it. Runs once per label, not per frame.
   */
  function labelImage(text) {
    // In crayon mode the image also carries its own crayon bubble.
    var crayon = Boolean(art);
    var font = crayon ? CRAYON_FONT : LABEL_FONT;
    var padX = crayon ? 16 : 12;
    var padY = crayon ? 11 : 8;
    var lineHeight = crayon ? 18 : 17;
    var measure = canvasSheet(1, 1, 1);
    if (!measure) return null;
    measure.context.font = font;
    var lines = wrap(measure.context, text, 200);
    var width = Math.ceil(Math.max.apply(null, lines.map(function (line) {
      return measure.context.measureText(line).width;
    })) + padX * 2);
    var height = lines.length * lineHeight + padY * 2 - (crayon ? 0 : 2);
    var page = canvasSheet(width, height, win.devicePixelRatio || 1);
    var context = page.context;
    if (crayon) crayonBubble(context, 1.5, 1.5, width - 3, height - 3);
    context.font = font;
    context.textBaseline = "top";
    context.fillStyle = crayon ? PLUM : "#24123d";
    lines.forEach(function (line, index) { context.fillText(line, padX, padY + index * lineHeight); });
    if (crayon) grain(context, width, height, Math.round(width * height * 0.08), 0.3);
    var image = { text: text, url: page.canvas.toDataURL("image/png"), width: width, height: height, blocked: false };
    // A page whose CSP forbids data: images cannot show the label; fall back
    // to the dots instead of an empty bubble.
    if (typeof win.Image === "function") {
      var probe = new win.Image();
      probe.onerror = function () { image.blocked = true; };
      probe.src = image.url;
    }
    return image;
  }

  // ---- commands ------------------------------------------------------------
  // Each command starts a new hand unless the newest working hand can carry
  // it: a pointing hand turns into the click, typing keeps one pen writing,
  // and repeated scrolls keep one hand dragging.

  function aim(command, now) {
    if (!finitePoint(command)) return null;
    state.lastTarget = clampPoint(command.x, command.y);
    state.lastPointAt = now;
    return state.lastTarget;
  }

  function near(hand, point) {
    return !point || Math.hypot(point.x - hand.target.x, point.y - hand.target.y) <= MERGE_PX;
  }

  function applyOne(command, now) {
    if (!command || typeof command !== "object") return;
    var last = hands.length ? hands[hands.length - 1] : null;
    var open = last && busy(last, now) ? last : null;
    switch (command.type) {
      case "point": {
        var point = aim(command, now);
        if (!point) break;
        if (open && open.kind === "point") {
          open.target = point;
          extendAct(open, now, ACT_MS.point);
        } else {
          spawn("point", "point", point, now, ACT_MS.point);
        }
        break;
      }
      case "press":
      case "key": {
        var isKey = command.type === "key";
        var pressAt = isKey ? null : aim(command, now);
        if (open && (open.kind === "point" || open.kind === "tap") && near(open, pressAt)) {
          // A second click on a tapping hand repeats its gesture.
          var variant = isKey ? "poke" : open.kind === "tap" ? open.variant : chooseVariant("tap");
          if (pressAt) open.target = pressAt;
          restartAct(open, now, "tap", variant, isKey ? KEY_MS : ACT_MS[variant]);
        } else {
          var fresh = isKey ? "poke" : chooseVariant("tap");
          spawn("tap", fresh, pressAt || copy(state.lastTarget), now, isKey ? KEY_MS : ACT_MS[fresh]);
        }
        break;
      }
      case "write": {
        var chars = Math.max(1, Math.floor(Number(command.chars)) || 1);
        if (open && open.kind === "write") {
          open.chars += chars;
          open.actMs = Math.min(ACT_MAX_MS, Math.max(open.actMs,
            open.actFrom + writeMs(open.chars), actElapsed(open, now) + KEY_MS));
        } else if (open && open.kind === "point") {
          restartAct(open, now, "write", chooseVariant("write"), writeMs(chars));
          open.chars = chars;
        } else {
          spawn("write", chooseVariant("write"), copy(state.lastTarget), now, writeMs(chars)).chars = chars;
        }
        break;
      }
      case "scroll": {
        var scrollAt = aim(command, now);
        var dx = Number(command.deltaX) || 0;
        var dy = Number(command.deltaY) || 0;
        var grabber = open && (open.kind === "grab" || open.kind === "point") && near(open, scrollAt)
          ? open
          : null;
        if (grabber && grabber.kind === "grab") {
          extendAct(grabber, now, SCROLL_MORE_MS);
        } else if (grabber) {
          if (scrollAt) grabber.target = scrollAt;
          restartAct(grabber, now, "grab", chooseVariant("grab"), ACT_MS.grab);
        } else {
          grabber = spawn("grab", chooseVariant("grab"), scrollAt || copy(state.lastTarget), now, ACT_MS.grab);
        }
        // Scrolling down moves content up, so the hand drags the page upward.
        grabber.drag = {
          x: Math.max(-DRAG_MAX, Math.min(DRAG_MAX, grabber.drag.x - dx * 0.2)),
          y: Math.max(-DRAG_MAX, Math.min(DRAG_MAX, grabber.drag.y - dy * 0.2))
        };
        break;
      }
      case "retract":
        (Array.isArray(command.points) ? command.points : []).slice(0, MAX_HANDS).forEach(function (spot) {
          if (spot && typeof spot === "object" && finitePoint(spot)) {
            spawnRetracting(clampPoint(spot.x, spot.y), now);
          }
        });
        break;
      case "think": {
        var text = normalizeLabel(command.label);
        state.label = text;
        state.labelUntil = text ? now + LABEL_MS : 0;
        if (text && (!state.labelImage || state.labelImage.text !== text)) {
          state.labelImage = labelImage(text);
        }
        break;
      }
      case "outcome":
        state.mood = command.ok ? "happy" : "surprised";
        state.moodUntil = now + (command.ok ? HAPPY_MS : SURPRISED_MS);
        if (!command.ok && last && phaseOf(last, now).name !== "done") last.failed = true;
        break;
    }
  }

  function apply(commands) {
    if (state.disposed || !Array.isArray(commands)) return;
    var now = clock();
    mount();
    state.lastCommandAt = now;
    for (var index = 0; index < commands.length; index += 1) applyOne(commands[index], now);
  }

  /** Drop finished hands and free their slots. */
  function prune(now) {
    hands = hands.filter(function (hand) {
      if (phaseOf(hand, now).name !== "done") return true;
      if (hand.slot.owner === hand) hand.slot.owner = null;
      return false;
    });
    state.ripples = state.ripples.filter(function (ripple) { return now - ripple.at < RIPPLE_MS; });
  }

  // ---- drawing -------------------------------------------------------------

  function place(node, x, y, extra) {
    node.style.setProperty("transform", "translate(" + x + "px, " + y + "px)" + (extra || ""));
  }

  function unit(dx, dy) {
    var length = Math.hypot(dx, dy) || 1;
    return { x: dx / length, y: dy / length };
  }

  function lerp(from, to, p) {
    return { x: from.x + (to.x - from.x) * p, y: from.y + (to.y - from.y) * p };
  }

  function easeOut(p) {
    return 1 - Math.pow(1 - p, 3);
  }

  function easeIn(p) {
    return p * p * p;
  }

  /** Where the palm sits for a variant; the fingertip or nib is the tip. */
  function palmFor(variant, tip, direction) {
    // Crayon palms sit where HANDS draws them, scaled by HAND_SCALE.
    if (UPRIGHT[variant]) {
      return art
        ? { x: tip.x + 11 * HAND_SCALE, y: tip.y - 16 * HAND_SCALE }
        : { x: tip.x + 9, y: tip.y - 15 };
    }
    var pose = ART_FOR[variant];
    var back = art
      ? (pose === "grab" ? 14 : pose === "tap" ? 25 : 23) * HAND_SCALE
      : (pose === "grab" ? 6 : 10);
    return { x: tip.x - direction.x * back, y: tip.y - direction.y * back };
  }

  /** Where the arm leaves the body: fanned around the target, never under the hat. */
  function rootOf(hand, center, lumps) {
    var angle = Math.atan2(hand.target.y - center.y, hand.target.x - center.x) + hand.exit;
    var fromTop = Math.atan2(Math.sin(angle + Math.PI / 2), Math.cos(angle + Math.PI / 2));
    if (Math.abs(fromTop) < 0.6) angle = -Math.PI / 2 + (fromTop < 0 ? -0.6 : 0.6);
    var edge = (lumps ? edgeAt(lumps, angle) : bodyRadius()) * 0.8;
    return { x: center.x + Math.cos(angle) * edge, y: center.y + Math.sin(angle) * edge };
  }

  /** Travel from one point to another on an arc bulging to the hand's side. */
  function swing(hand, from, to, p) {
    var point = lerp(from, to, p);
    var bulge = Math.sin(Math.PI * p) * Math.hypot(to.x - from.x, to.y - from.y) * SWING *
      (hand.curl < 0 ? -1 : 1);
    var across = unit(to.x - from.x, to.y - from.y);
    return { x: point.x - across.y * bulge, y: point.y + across.x * bulge };
  }

  /** Where the tip should be for the hand's phase and gesture. */
  function goalOf(hand, phase, root, direction) {
    if (phase.name === "reach") return swing(hand, root, hand.target, easeOut(phase.p));
    if (phase.name === "retract") return swing(hand, hand.retractFrom || hand.target, root, easeIn(phase.p));
    var p = phase.p;
    var push = 0;
    var offset = { x: 0, y: 0 };
    var pull = 0;
    switch (hand.variant) {
      case "poke":
        push = p < 0.3 ? -8 * (p / 0.3) : p < 0.45 ? -8 * (1 - (p - 0.3) / 0.15) : 0;
        break;
      case "knock":
        push = -6 * Math.abs(Math.sin(Math.PI * 2 * p));
        break;
      case "slap":
        push = p < 0.25 ? -14 * (p / 0.25) : p < 0.4 ? -14 * (1 - (p - 0.25) / 0.15) : 0;
        break;
      case "pen":
      case "crayon":
        // Scribble left to right along the line being written.
        offset = { x: -10 + 20 * p + Math.sin(phase.ms / 38) * 3, y: Math.cos(phase.ms / 53) * 1.8 };
        break;
      case "fist":
      case "push":
        pull = easeOut(Math.min(1, p * 1.4));
        offset = { x: hand.drag.x * pull, y: hand.drag.y * pull };
        break;
      default:
        offset = { x: Math.sin(phase.ms / 220) * 2, y: Math.cos(phase.ms / 260) * 2 };
    }
    return {
      x: hand.target.x + direction.x * push + offset.x,
      y: hand.target.y + direction.y * push + offset.y
    };
  }

  function showSlot(slot, visible) {
    if (slot.visible === visible) return;
    slot.visible = visible;
    slot.arm.style.setProperty("display", visible ? "block" : "none");
    slot.front.style.setProperty("display", visible ? "block" : "none");
  }

  /**
   * Bezier handles for an arm from the body to an end point: it leaves the
   * body outward, bows to the hand's side, and breathes a little.
   */
  function armCurve(hand, root, outward, end, now) {
    var length = Math.hypot(end.x - root.x, end.y - root.y);
    var along = unit(end.x - root.x, end.y - root.y);
    var bend = hand.curl * Math.min(ARM_BEND_MAX, length * ARM_BEND) *
      (0.85 + 0.15 * Math.sin(now / 340 + hand.curl * 5));
    var lead = Math.min(80, length * 0.35);
    var c1 = {
      x: root.x + outward.x * lead - along.y * bend * 0.5,
      y: root.y + outward.y * lead + along.x * bend * 0.5
    };
    var c2 = {
      x: end.x - along.x * length * 0.3 - along.y * bend,
      y: end.y - along.y * length * 0.3 + along.x * bend
    };
    return { c1: c1, c2: c2, length: length, along: along, heading: unit(end.x - c2.x, end.y - c2.y) };
  }

  /** A long noodly arm along the curve, drawn as short segments. */
  function drawArm(slot, hand, start, curve, end, now) {
    // A soft wave runs down the arm; the ends stay put.
    var wiggle = Math.min(4, curve.length * 0.02);
    var previous = start;
    for (var index = 1; index <= ARM_SEGMENTS; index += 1) {
      var t = index / ARM_SEGMENTS;
      var u = 1 - t;
      var a = u * u * u;
      var b = 3 * u * u * t;
      var c = 3 * u * t * t;
      var d = t * t * t;
      var wave = Math.sin(Math.PI * t) * wiggle * Math.sin(now / 170 - t * 7 + hand.curl * 3);
      var point = {
        x: a * start.x + b * curve.c1.x + c * curve.c2.x + d * end.x - curve.along.y * wave,
        y: a * start.y + b * curve.c1.y + c * curve.c2.y + d * end.y + curve.along.x * wave
      };
      var segment = slot.segments[index - 1];
      var length = Math.hypot(point.x - previous.x, point.y - previous.y);
      segment.style.setProperty("width", (length + (art ? 1 : 1.5)) + "px");
      place(segment, previous.x, previous.y,
        " rotate(" + Math.atan2(point.y - previous.y, point.x - previous.x) + "rad)");
      previous = point;
    }
  }

  function drawHand(hand, now, dt, center, lumps) {
    var slot = hand.slot;
    var phase = phaseOf(hand, now);
    if (phase.name === "waiting" || phase.name === "done") {
      showSlot(slot, false);
      return;
    }
    showSlot(slot, true);
    var root = rootOf(hand, center, lumps);
    var direction = unit(hand.target.x - root.x, hand.target.y - root.y);
    if (!hand.tip) hand.tip = copy(root);
    if (phase.name === "retract" && !hand.retractFrom) hand.retractFrom = copy(hand.tip);
    var goal = goalOf(hand, phase, root, direction);
    if (hand.failed && phase.name !== "reach") {
      var shake = Math.sin(now / 22) * 3;
      goal.x -= direction.y * shake;
      goal.y += direction.x * shake;
    }
    // The tip chases its goal, so re-aimed hands glide instead of jumping.
    var follow = 1 - Math.exp(-dt / CHASE_MS);
    hand.tip.x += (goal.x - hand.tip.x) * follow;
    hand.tip.y += (goal.y - hand.tip.y) * follow;
    var marks = RIPPLE_AT[hand.variant];
    if (phase.name === "act" && marks) {
      while (hand.rippled < marks.length && phase.p >= marks[hand.rippled]) {
        state.ripples.push({ x: hand.target.x, y: hand.target.y, at: now, size: RIPPLE_SIZE[hand.variant] });
        if (state.ripples.length > RIPPLES) state.ripples.shift();
        hand.rippled += 1;
      }
    }

    var tip = hand.tip;
    var outward = unit(root.x - center.x, root.y - center.y);
    // The hand points along the end of the bent arm, not straight at the body.
    var heading = armCurve(hand, root, outward, tip, now).heading;
    var palm = palmFor(hand.variant, tip, heading);
    drawArm(slot, hand, root, armCurve(hand, root, outward, palm, now), palm, now);
    if (slot.shownVariant !== hand.variant) {
      slot.hand.setAttribute("data-pose", PLAIN_FOR[hand.variant]);
      if (art) setImage(slot.handArt, art.hands[ART_FOR[hand.variant]]);
      slot.shownVariant = hand.variant;
    }
    // Pens and crayons are drawn upright; other hands point along the arm.
    var angle = UPRIGHT[hand.variant] ? 0 : Math.atan2(heading.y, heading.x);
    place(slot.hand, tip.x, tip.y, " rotate(" + angle + "rad)");

    var writing = hand.kind === "write" && phase.name === "act";
    var inkGap = art ? 12 : 5;
    if (art && writing) {
      var inkImage = hand.variant === "crayon" ? art.inkGreen : art.ink;
      if (slot.shownInk !== inkImage) {
        slot.inks.forEach(function (node) { setImage(node, inkImage); });
        slot.shownInk = inkImage;
      }
    }
    slot.inks.forEach(function (ink, index) {
      if (!writing) {
        ink.style.setProperty("display", "none");
        return;
      }
      ink.style.setProperty("display", "block");
      ink.style.setProperty("opacity", String(0.85 - index * 0.13));
      place(ink, tip.x - inkGap - index * inkGap, tip.y + Math.sin(now / 45 + index) * 2.5);
    });

    var dragging = hand.kind === "grab" && phase.name === "act" && Math.hypot(hand.drag.x, hand.drag.y) > 2;
    var drag = unit(hand.drag.x, hand.drag.y);
    var dragReach = art ? 30 : 16;
    var dragLane = art ? 9 : 6;
    slot.drags.forEach(function (line, lane) {
      if (!dragging) {
        line.style.setProperty("display", "none");
        return;
      }
      var offset = lane - 1;
      line.style.setProperty("display", "block");
      place(line,
        tip.x - drag.x * dragReach - drag.y * offset * dragLane,
        tip.y - drag.y * dragReach + drag.x * offset * dragLane,
        " rotate(" + Math.atan2(-drag.y, -drag.x) + "rad)");
    });
  }

  function drawRipples(now) {
    rippleNodes.forEach(function (node, index) {
      var ripple = state.ripples[index];
      if (!ripple) {
        node.style.setProperty("opacity", "0");
        return;
      }
      var progress = (now - ripple.at) / RIPPLE_MS;
      node.style.setProperty("opacity", String(Math.max(0, 1 - progress)));
      // The crayon ripple image is twice the size of the plain ring.
      place(node, ripple.x, ripple.y,
        " scale(" + (0.4 + progress * 2) * (art ? 0.5 : 1) * (ripple.size || 1) + ")");
    });
  }

  /** The thought bubble: the agent's action label, or a "..." while idle. */
  function drawBubble(center, current) {
    var size = viewport();
    var image = current.kind === "text" && state.labelImage && !state.labelImage.blocked
      ? state.labelImage
      : null;
    var kind = image ? "text:" + image.url : "dots";
    var width = image ? image.width : art ? 60 : 52;
    var height = image ? image.height : art ? 32 : 26;
    if (shown.bubble !== kind) {
      bubble.setAttribute("data-kind", image ? "text" : "dots");
      css(bubble, { width: width + "px", height: height + "px" });
      if (image) {
        css(bubbleText, {
          "background-image": "url(\\"" + image.url + "\\")",
          width: width + "px",
          height: height + "px"
        });
      }
      shown.bubble = kind;
    }
    var radius = bodyRadius();
    var top = center.y - radius - 44;
    // The crayon hat is tall, so its bubble floats left of the hat's tip.
    var right = center.x + (art ? -4 : 14);
    var x = Math.min(Math.max(right - width, 8), Math.max(8, size.width - width - 8));
    var y = Math.max(8, top - height);
    place(bubble, x, y);
    place(trails[0], center.x - 18, center.y - radius - 20);
    place(trails[1], center.x - 27, center.y - radius - 36);
  }

  // ---- living soot ---------------------------------------------------------
  // In crayon mode the body and fur move every frame on smooth noise: sums of
  // slow sines with unrelated frequencies and random phases, so the motion
  // never shows a loop.

  function waves(hz) {
    return [1, 1.618, 2.414].map(function (ratio) {
      return { hz: hz * ratio * (0.8 + Math.random() * 0.4), phase: Math.random() * Math.PI * 2 };
    });
  }

  /** Smooth noise in [-1, 1]. */
  function noise(set, seconds) {
    var turn = Math.PI * 2 * seconds;
    return 0.5 * Math.sin(set[0].hz * turn + set[0].phase) +
      0.3 * Math.sin(set[1].hz * turn + set[1].phase) +
      0.2 * Math.sin(set[2].hz * turn + set[2].phase);
  }

  // One core lump plus satellites around it; their union is the outline.
  var soot = { blobs: [], tufts: [] };
  soot.blobs.push({ angle: 0, distance: 0, radius: 23, size: waves(0.17), drift: waves(0.11), reach: waves(0.13) });
  for (var lump = 1; lump < SOOT_BLOBS; lump += 1) {
    soot.blobs.push({
      angle: (lump / (SOOT_BLOBS - 1)) * Math.PI * 2 + (Math.random() - 0.5) * 0.5,
      distance: 11 + Math.random() * 3,
      radius: 15 + Math.random() * 3,
      size: waves(0.21),
      drift: waves(0.09),
      reach: waves(0.16)
    });
  }
  for (var hair = 0; hair < SOOT_TUFTS; hair += 1) {
    soot.tufts.push({
      angle: (hair / SOOT_TUFTS) * Math.PI * 2 + (Math.random() - 0.5) * 0.18,
      length: 0.8 + Math.random() * 0.5,
      sway: waves(0.23),
      flutter: waves(0.9),
      breath: waves(0.19)
    });
  }

  /** Where each lump sits right now, relative to the body center. */
  function sootLumps(seconds) {
    return soot.blobs.map(function (blob) {
      var angle = blob.angle + 0.3 * noise(blob.drift, seconds);
      var distance = blob.distance * (1 + 0.35 * noise(blob.reach, seconds));
      return {
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance * 0.94,
        radius: blob.radius * (1 + 0.12 * noise(blob.size, seconds))
      };
    });
  }

  /** Distance from the center to the outline: the farthest lump exit. */
  function edgeAt(lumps, angle) {
    var ux = Math.cos(angle);
    var uy = Math.sin(angle);
    var edge = 0;
    lumps.forEach(function (lump) {
      var along = lump.x * ux + lump.y * uy;
      var inside = lump.radius * lump.radius - (lump.x * lump.x + lump.y * lump.y - along * along);
      if (inside > 0) edge = Math.max(edge, along + Math.sqrt(inside));
    });
    return edge || BODY_RADIUS;
  }

  function drawSoot(now, expression, lumps) {
    var seconds = now / 1000;
    // Blob sheets are drawn with a radius of 28 in the body's 48px box.
    lumps.forEach(function (lump, index) {
      blobNodes[index].style.setProperty("transform", "translate(" + (24 + lump.x) + "px, " +
        (24 + lump.y) + "px) scale(" + lump.radius / 28 + ")");
    });
    // Startled or straining fur stands on end.
    var bristle = expression === "surprised" ? 1.35 : expression === "strain" ? 1.15 : 1;
    soot.tufts.forEach(function (tuft, index) {
      var root = edgeAt(lumps, tuft.angle) - 5;
      var sway = 0.22 * noise(tuft.sway, seconds) + 0.05 * noise(tuft.flutter, seconds);
      var length = tuft.length * bristle * (1 + 0.1 * noise(tuft.breath, seconds));
      tuftNodes[index].style.setProperty("transform", "translate(" +
        (24 + Math.cos(tuft.angle) * root) + "px, " + (24 + Math.sin(tuft.angle) * root) + "px) rotate(" +
        (tuft.angle + Math.PI / 2 + sway) + "rad) scale(1, " + length + ")");
    });
    // The hat rides the top of the squishy head.
    var top = edgeAt(lumps, -Math.PI / 2 + 0.35);
    hatArt.style.setProperty("transform", "translate(0px, " + (27 - top) + "px) rotate(" +
      0.06 * noise(soot.blobs[0].drift, seconds) + "rad)");
  }

  function draw(now, dt) {
    var center = bodyCenter(now);
    var lumps = art ? sootLumps(now / 1000) : null;
    place(body, center.x, center.y);
    var expression = expressionAt(now);
    if (shown.expression !== expression) {
      face.setAttribute("data-expression", expression);
      if (art) setImage(faceArt, art.faces[expression]);
      shown.expression = expression;
    }
    if (lumps) drawSoot(now, expression, lumps);
    slots.forEach(function (slot) {
      if (!slot.owner) showSlot(slot, false);
    });
    hands.forEach(function (hand) { drawHand(hand, now, dt, center, lumps); });
    // The eyes follow the newest working hand.
    var watched = workingHand(now);
    var look = watched && watched.tip
      ? unit(watched.tip.x - center.x, watched.tip.y - center.y)
      : { x: 0, y: 0 };
    face.style.setProperty("--look-x", (look.x * 2.4) + "px");
    face.style.setProperty("--look-y", (look.y * 2.4) + "px");
    drawRipples(now);
    drawBubble(center, bubbleAt(now));
  }

  function frame() {
    if (state.disposed) return;
    var now = clock();
    if (now - state.lastCommandAt > IDLE_DISPOSE_MS) {
      dispose();
      return;
    }
    var dt = Math.min(100, Math.max(0, now - state.lastFrameAt));
    state.lastFrameAt = now;
    prune(now);
    if (!state.hidden) draw(now, dt);
    frameId = win.requestAnimationFrame(frame);
  }

  function setCaptureHidden(hidden) {
    state.hidden = Boolean(hidden);
    host.style.setProperty("display", state.hidden ? "none" : "block", "important");
    return true;
  }

  function dispose() {
    if (state.disposed) return;
    state.disposed = true;
    win.cancelAnimationFrame(frameId);
    host.remove();
    if (win[key] === api) delete win[key];
  }

  /** Read-only view of the sprite for tests and debugging. */
  function snapshot() {
    var now = clock();
    return {
      version: VERSION,
      expression: expressionAt(now),
      pose: poseAt(now),
      bubble: bubbleAt(now),
      hidden: state.hidden,
      art: stage.getAttribute("data-art"),
      target: copy(state.lastTarget),
      // The newest hand's tip, or null when every hand is home.
      hand: hands.length && hands[hands.length - 1].tip ? copy(hands[hands.length - 1].tip) : null,
      hands: hands.map(function (hand) {
        return {
          kind: hand.kind,
          variant: hand.variant,
          phase: phaseOf(hand, now).name,
          failed: hand.failed,
          tip: hand.tip ? copy(hand.tip) : null
        };
      })
    };
  }

  var api = {
    version: VERSION,
    apply: apply,
    setCaptureHidden: setCaptureHidden,
    state: snapshot,
    dispose: dispose
  };
  Object.defineProperty(win, key, { value: api, configurable: true, writable: true, enumerable: false });
  mount();
  draw(start, 0);
  frameId = win.requestAnimationFrame(frame);
  scheduleArt();
  return api;
}`;
