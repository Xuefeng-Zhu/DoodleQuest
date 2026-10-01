import { waypoints, type Quest } from "./quest";

export const wonderIds = ["flower", "cloud", "butterfly"] as const;
export type Wonder = (typeof wonderIds)[number];
export const wonderDuration: Record<Wonder, number> = {
  flower: 6,
  cloud: 2.8,
  butterfly: 10,
};
export const wonderHomes: Record<Wonder, [number, number, number]> = {
  flower: [-1.2, 0.95, 3.7],
  cloud: [-3, 0.65, 5.2],
  butterfly: [-3.8, 1.15, 1.2],
};
export const wonderMessages: Record<Wonder, string> = {
  flower: "A sleepy flower opens to say hello, then curls up again.",
  cloud: "Poff! A little cloud lets out the softest puff.",
  butterfly:
    "A butterfly keeps your hero company for a little while, then returns to its leaf.",
};
export type Wonders = Record<Wonder, boolean> & { latest: Wonder | null };
export const initialWonders = (): Wonders => ({
  flower: false,
  cloud: false,
  butterfly: false,
  latest: null,
});
export function canDiscover(game: Pick<Quest, "stage" | "paused">) {
  return !game.paused && game.stage !== "intro" && game.stage !== "complete";
}
export function discover(wonders: Wonders, id: Wonder, game: Quest): Wonders {
  if (!canDiscover(game) || wonders[id]) return wonders;
  return { ...wonders, [id]: true, latest: id };
}
export function settle(wonders: Wonders, id: Wonder): Wonders {
  if (!wonders[id]) return wonders;
  return {
    ...wonders,
    [id]: false,
    latest: wonders.latest === id ? null : wonders.latest,
  };
}
export function advanceWonder(
  elapsed: number,
  delta: number,
  paused: boolean,
  duration: number,
) {
  if (paused || !Number.isFinite(delta)) return elapsed;
  return Math.min(duration, elapsed + Math.max(0, Math.min(delta, 0.1)));
}
export function wonderEnvelope(
  elapsed: number,
  duration: number,
  reduced: boolean,
) {
  if (reduced) return 1;
  const t = Math.max(
    0,
    Math.min(1, elapsed / 0.65, (duration - elapsed) / 0.8),
  );
  return t * t * (3 - 2 * t);
}

// Shared waypoint sampling, independent of the generated mesh or its normalization.
export function heroPosition(
  out: { set: (x: number, y: number, z: number) => unknown },
  game: Pick<Quest, "location" | "target">,
  travelSeconds: number,
) {
  const a = waypoints[game.location],
    b = game.target ? waypoints[game.target] : a;
  const p = Math.max(0, Math.min(travelSeconds / 2.4, 1));
  out.set(a[0] + (b[0] - a[0]) * p, 0.22, a[2] + (b[2] - a[2]) * p);
}
