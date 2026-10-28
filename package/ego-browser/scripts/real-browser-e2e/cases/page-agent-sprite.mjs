export function pageAgentSpriteCase() {
  return `
    const task = await taskSpace(taskName);
    const page = await newPageAt(task, baseUrl + "/?agent-sprite=1");

    const spriteState = () => page.evaluate(() => {
      const sprite = globalThis[Symbol.for("ego.agentSprite")];
      const hosts = document.querySelectorAll("ego-agent-sprite");
      if (!sprite || hosts.length === 0) return null;
      const style = getComputedStyle(hosts[0]);
      return {
        ...sprite.state(),
        hosts: hosts.length,
        ariaHidden: hosts[0].getAttribute("aria-hidden"),
        inert: hosts[0].hasAttribute("inert"),
        pointerEvents: style.pointerEvents,
        display: style.display,
        viewport: { width: innerWidth, height: innerHeight },
      };
    });

    /** Count dark pixels in a small patch of the sprite's fuzzy body. */
    function darkBodyPixels(png, viewport) {
      const image = decodePng(png);
      const scale = image.width / viewport.width;
      const centerX = viewport.width - 64;
      const centerY = viewport.height - 58;
      let dark = 0;
      let sampled = 0;
      for (let dy = 16; dy <= 20; dy += 2) {
        for (let dx = -4; dx <= 4; dx += 2) {
          const { red, green, blue } = pngRgbAt(
            image,
            Math.round((centerX + dx) * scale),
            Math.round((centerY + dy) * scale)
          );
          sampled++;
          if (Math.max(red, green, blue) < 70) dark++;
        }
      }
      return { dark, sampled };
    }

    try {
      assertEqual(
        await page.waitForFunction(
          () => Boolean(globalThis[Symbol.for("ego.agentSprite")]),
          undefined,
          { timeout: 2_000, polling: 25 }
        ),
        true,
        "goto summons the agent sprite into the new document"
      );
      const mounted = await spriteState();
      assertEqual(mounted.hosts, 1, "exactly one sprite host is mounted");
      assertEqual(mounted.ariaHidden, "true", "the sprite is hidden from accessibility");
      assertEqual(mounted.inert, true, "the sprite is inert");
      assertEqual(mounted.pointerEvents, "none", "the sprite never takes pointer events");
      assertEqual(mounted.display, "block", "the sprite is visible to the user");

      const clicksBefore = await page.evaluate("window.__fixtureState.clicks");
      await page.click("#click-button", { label: "Trick or treat" });
      assertEqual(
        await page.evaluate("window.__fixtureState.clicks"),
        clicksBefore + 1,
        "a click lands through the full-viewport sprite layer"
      );
      const afterClick = await spriteState();
      assertEqual(afterClick.hosts, 1, "actions never stack a second sprite");
      assertEqual(
        JSON.stringify(afterClick.bubble),
        JSON.stringify({ kind: "text", text: "Trick or treat" }),
        "the action label becomes the sprite's thought bubble"
      );

      await page.fill("#text-input", "boo");
      assertEqual(
        await page.evaluate("document.querySelector('#text-input').value"),
        "boo",
        "fill types through the sprite layer"
      );

      // A static white page keeps snapshots stable and makes the sprite's dark
      // body easy to detect.
      await page.evaluate(() => {
        document.documentElement.style.background = "#fff";
        document.body.innerHTML = "<h1>Static page</h1><button>Boo</button>";
        document.body.style.background = "#fff";
      });
      await page.mouse.move(200, 200);

      // Ego's native snapshot ignores aria-hidden, so compare whole snapshots.
      const withSprite = await page.snapshot({ scope: "full_page" });
      await page.evaluate(() => globalThis[Symbol.for("ego.agentSprite")].dispose());
      const withoutSprite = await page.snapshot({ scope: "full_page" });
      assertEqual(withSprite, withoutSprite, "the sprite adds nothing to page snapshots");

      // The first action after the sprite vanished finds it missing; the next
      // one reinstalls it.
      await page.mouse.move(190, 190);
      await page.waitForTimeout(50);
      await page.mouse.move(200, 200);
      assertEqual(
        await page.waitForFunction(
          () => globalThis[Symbol.for("ego.agentSprite")]?.state().art === "crayon",
          undefined,
          // Background tabs throttle idle callbacks, and the art takes a few.
          { timeout: 10_000, polling: 50 }
        ),
        true,
        "the crayon art is built in idle time and shown"
      );
      await page.waitForTimeout(100);
      const viewport = (await spriteState()).viewport;

      const rawCapture = await page.cdp("Page.captureScreenshot", { format: "png" }, { timeout: 5_000 });
      const live = darkBodyPixels(Buffer.from(rawCapture.data, "base64"), viewport);
      assert(
        live.dark >= live.sampled - 2,
        "the sprite is drawn on the live page: " + JSON.stringify(live)
      );

      const screenshotPath = join(artifactDir, "agent-sprite-hidden.png");
      await page.screenshot({ path: screenshotPath, fullPage: false });
      const captured = darkBodyPixels(await readFile(screenshotPath), viewport);
      assertEqual(captured.dark, 0, "page.screenshot never shows the sprite");

      const restored = await spriteState();
      assertEqual(restored.hidden, false, "the sprite returns after the capture");
      assertEqual(restored.display, "block", "the sprite host is visible again");
      cliLog(JSON.stringify({ agentSprite: { live, captured } }));
    } finally {
      await page.close();
    }
  `;
}
