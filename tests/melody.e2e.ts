import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { bellPitches } from "../src/domain/melody";

declare global {
  interface Window {
    melodyAudit: {
      contexts: AudioContext[];
      notes: { pitch: number; startsAt: number; endsAt: number }[];
      tap: MediaStreamAudioDestinationNode;
      analyser: AnalyserNode;
      recorder?: MediaRecorder;
      chunks: Blob[];
    };
  }
}
mkdirSync("evidence", { recursive: true });
test.use({ hasTouch: true });
const logs: string[] = [];
test.beforeEach(({ page }) => {
  page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (["warning", "error"].includes(m.type()))
      logs.push(`${m.type()}: ${m.text()}`);
  });
});
test.afterAll(() =>
  writeFileSync("evidence/melody-console.txt", logs.join("\n")),
);

async function observeRealAudio(page: Page) {
  // Observation only: all audio nodes, scheduling, rendering and recording are native.
  // No microphone or system-output capture. The tap records only this app's graph.
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    const audit = (window.melodyAudit = {
      contexts: [],
      notes: [],
      chunks: [],
    } as unknown as Window["melodyAudit"]);
    window.AudioContext = class extends Native {
      constructor(options?: AudioContextOptions) {
        super(options);
        audit.contexts.push(this);
        audit.tap = this.createMediaStreamDestination();
        audit.analyser = this.createAnalyser();
        audit.analyser.fftSize = 2048;
        const makeGain = this.createGain.bind(this);
        this.createGain = () => {
          const gain = makeGain(),
            connect = gain.connect.bind(gain);
          gain.connect = ((destination: AudioNode) => {
            if (destination === this.destination) {
              connect(audit.tap);
              connect(audit.analyser);
            }
            return connect(destination);
          }) as typeof gain.connect;
          return gain;
        };
        const makeOscillator = this.createOscillator.bind(this);
        this.createOscillator = () => {
          const oscillator = makeOscillator();
          const note = { pitch: 0, startsAt: 0, endsAt: 0 };
          const pitch = oscillator.frequency.setValueAtTime.bind(
            oscillator.frequency,
          );
          oscillator.frequency.setValueAtTime = (value, at) => {
            note.pitch = value;
            return pitch(value, at);
          };
          const start = oscillator.start.bind(oscillator),
            stop = oscillator.stop.bind(oscillator);
          oscillator.start = (at = this.currentTime) => {
            note.startsAt = at;
            audit.notes.push(note);
            start(at);
          };
          oscillator.stop = (at = this.currentTime) => {
            note.endsAt = at;
            stop(at);
          };
          return oscillator;
        };
      }
    };
  });
}
async function press(page: Page, name: string, touch = false) {
  const button = page.getByRole("button", { name, exact: true });
  await expect(button).toBeEnabled({ timeout: 30000 });
  if (touch) await button.tap();
  else {
    await button.focus();
    await button.press("Enter");
  }
}
async function enter(page: Page, touch = false) {
  await press(page, "Open my gift", touch);
  await press(page, "Enter the little world", touch);
  await press(page, "1 Bell gate", touch);
  await expect(
    page.getByRole("button", { name: "Ring circle bell" }),
  ).toBeVisible({ timeout: 30000 });
}
async function deliver(page: Page, touch = false) {
  for (const bell of ["circle", "triangle", "star"])
    await press(page, `Ring ${bell} bell`, touch);
  await press(page, "2 Star garden", touch);
  await press(page, "Collect the star", touch);
  await press(page, "3 Gift mailbox", touch);
  await press(page, "Deliver the star", touch);
}
const count = (page: Page) =>
  page.evaluate(() => window.melodyAudit.notes.length);
const active = (page: Page) =>
  page.evaluate(() => {
    const a = window.melodyAudit,
      context = a.contexts[0];
    return a.notes.filter((n) => n.endsAt > (context?.currentTime ?? Infinity))
      .length;
  });

test("real Web Audio returns the bell motif, records non-silent output, and cancels on pause, hide, fold and exit", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1024, height: 768 });
  await observeRealAudio(page);
  await page.goto("/example");
  await expect(
    page.getByRole("switch", { name: "Gentle sounds" }),
  ).not.toBeChecked();
  // The audio clock is native; expensive SwiftShader shadows are irrelevant
  // to this check. Choose the product's normal low-quality setting via its UI.
  await press(page, "Pause and settings");
  await page.getByLabel("Low-quality rendering").check();
  await press(page, "Back to the adventure");
  await page.screenshot({ path: "evidence/melody-opening-desktop.png" });
  await enter(page);
  await press(page, "Ring star bell");
  expect(await page.evaluate(() => window.melodyAudit.contexts.length)).toBe(0);
  await press(page, "Pause and settings");
  await page.getByLabel("Gentle sounds", { exact: true }).check();
  expect(await page.evaluate(() => window.melodyAudit.contexts.length)).toBe(0);
  await press(page, "Back to the adventure");
  for (const [i, bell] of ["circle", "triangle", "star"].entries()) {
    await press(page, `Ring ${bell} bell`);
    await expect.poll(() => count(page)).toBe((i + 1) * 2);
  }
  expect(
    await page.evaluate(() =>
      window.melodyAudit.notes
        .filter((_, i) => i % 2 === 0)
        .map((n) => n.pitch),
    ),
  ).toEqual(Object.values(bellPitches));
  await press(page, "2 Star garden");
  await press(page, "Collect the star");
  await expect.poll(() => count(page)).toBe(12);
  await press(page, "3 Gift mailbox");
  await press(page, "Deliver the star");
  expect(await count(page)).toBe(12);
  await page.evaluate(() => {
    const a = window.melodyAudit;
    a.recorder = new MediaRecorder(a.tap.stream, {
      mimeType: "audio/webm;codecs=opus",
    });
    a.recorder.ondataavailable = (e) => {
      if (e.data.size) a.chunks.push(e.data);
    };
    a.recorder.start();
  });
  await press(page, "Open your letter");
  await expect.poll(() => count(page)).toBe(26);
  // Sample the native audio clock immediately. The software-rendered envelope
  // can take longer to unfold than the tune; don't wait for its DOM first.
  const peak = await page.evaluate(async () => {
    const analyser = window.melodyAudit.analyser,
      data = new Float32Array(analyser.fftSize);
    let peak = 0;
    for (let i = 0; i < 15; i++) {
      analyser.getFloatTimeDomainData(data);
      for (const sample of data) peak = Math.max(peak, Math.abs(sample));
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    return peak;
  });
  expect(peak).toBeGreaterThan(0.001);
  expect(peak).toBeLessThan(0.3);
  await expect(page.locator(".personal-message")).toBeVisible();
  await expect(page.locator(".letter-sheet")).toHaveCSS("opacity", "1");
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.screenshot({ path: "evidence/melody-letter-desktop.png" });
  await expect(
    page.getByRole("button", { name: "Play the melody", exact: true }),
  ).toBeVisible();
  const audio = await page.evaluate(async () => {
    const a = window.melodyAudit;
    await new Promise<void>((resolve) => {
      a.recorder!.onstop = () => resolve();
      a.recorder!.stop();
    });
    return Array.from(new Uint8Array(await new Blob(a.chunks).arrayBuffer()));
  });
  writeFileSync("evidence/melody-browser-audio.webm", Buffer.from(audio));
  const homePitches = await page.evaluate(() =>
    window.melodyAudit.notes
      .slice(12)
      .filter((_, i) => i % 2 === 0)
      .map((n) => n.pitch),
  );
  expect(homePitches.slice(0, 3)).toEqual(Object.values(bellPitches));
  writeFileSync(
    "evidence/melody-audio-measurement.json",
    JSON.stringify(
      {
        nativeWebAudio: true,
        physicalPlaybackVerified: false,
        recordedBytes: audio.length,
        observedPeak: peak,
        homePitches,
      },
      null,
      2,
    ),
  );
  await press(page, "Fold the letter");
  await press(page, "Open your letter");
  await expect(
    page.getByRole("button", { name: "Play the melody", exact: true }),
  ).toBeVisible();
  expect(await count(page)).toBe(26); // Opening a folded letter doesn't repeat it automatically.
  await press(page, "Play the melody");
  await expect.poll(() => count(page)).toBe(40);
  await press(page, "Pause and settings");
  expect(await active(page)).toBe(0);
  await page.getByLabel("Gentle sounds", { exact: true }).uncheck();
  await press(page, "Back to the adventure");
  expect(await count(page)).toBe(40);
  await press(page, "Play the melody"); // This explicit gesture also opts back into sound.
  await expect.poll(() => count(page)).toBe(54);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(await active(page)).toBe(0);
  await page.evaluate(() => {
    delete (document as unknown as { hidden?: boolean }).hidden;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(await count(page)).toBe(54);
  await press(page, "Play the melody");
  await expect.poll(() => count(page)).toBe(68);
  await press(page, "Fold the letter");
  expect(await active(page)).toBe(0);
  await press(page, "Open your letter");
  await press(page, "Play the melody");
  await expect.poll(() => count(page)).toBe(82);
  await page.getByRole("link", { name: "doodlequest.", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.melodyAudit.contexts.every((c) => c.state === "closed"),
      ),
    )
    .toBe(true);
  expect(logs.filter((l) => l.startsWith("pageerror:"))).toEqual([]);
});

test("320px touch: silent full adventure, explicit listening, stop, and replay resets the once-only tune", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await observeRealAudio(page);
  await page.goto("/example");
  await expect(page.locator("main")).toHaveAttribute(
    "data-scene-ready",
    "true",
  );
  await page.screenshot({ path: "evidence/melody-opening-mobile.png" });
  await enter(page, true);
  await deliver(page, true);
  await press(page, "Open your letter", true);
  await expect(page.locator(".personal-message")).toBeVisible();
  expect(await page.evaluate(() => window.melodyAudit.contexts.length)).toBe(0);
  await press(page, "Play the melody", true);
  await expect.poll(() => count(page)).toBe(14);
  await page.screenshot({ path: "evidence/melody-letter-mobile.png" });
  await press(page, "Stop melody", true);
  expect(await active(page)).toBe(0);
  await press(page, "Play the melody", true);
  await expect.poll(() => count(page)).toBe(28);
  await press(page, "Play again", true);
  expect(await active(page)).toBe(0);
  await expect(
    page.getByRole("switch", { name: "Gentle sounds" }),
  ).toBeChecked();
  await enter(page, true);
  await deliver(page, true);
  const before = await count(page);
  await press(page, "Open your letter", true);
  await expect.poll(() => count(page)).toBe(before + 14);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(logs.filter((l) => l.startsWith("pageerror:"))).toEqual([]);
});

test("unavailable audio and WebGL leave an honest, fully readable gift", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.AudioContext = class {
      constructor() {
        throw new Error("Test-only unavailable audio");
      }
    } as unknown as typeof AudioContext;
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (["webgl", "webgl2", "experimental-webgl"].includes(type)) return null;
      return get.call(this, type, ...(args as [])) as never;
    } as typeof get;
  });
  await page.goto("/example");
  await page.getByRole("switch", { name: "Gentle sounds" }).click();
  await enter(page);
  await deliver(page);
  await press(page, "Open your letter");
  await expect(page.locator(".personal-message")).toBeVisible();
  await expect(page.locator(".audio-unavailable")).toContainText(
    "Sound couldn’t start",
  );
  await press(page, "Play the melody");
  await expect(page.locator(".audio-unavailable")).toContainText(
    "enjoy your letter in quiet",
  );
  await page.screenshot({ path: "evidence/melody-silent-alternative.png" });
});
