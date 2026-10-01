export const sequence = ["circle", "triangle", "star"] as const;
export type Bell = (typeof sequence)[number];
export type Destination = "start" | "bells" | "garden" | "mailbox";
export const waypoints: Record<Destination, [number, number, number]> = {
  start: [-3.9, 0, 2.3],
  bells: [-2.5, 0, 0.1],
  garden: [0.1, 0, -1.9],
  mailbox: [3, 0, 1.2],
};
export type Stage =
  "intro" | "bell_gate" | "star_garden" | "gift_delivery" | "complete";
export type Quest = {
  stage: Stage;
  location: Destination;
  target: Destination | null;
  bellIndex: number;
  hasStar: boolean;
  hint: string;
  paused: boolean;
  travel: number;
};
export const initialQuest = (): Quest => ({
  stage: "intro",
  location: "start",
  target: null,
  bellIndex: 0,
  hasStar: false,
  hint: "A little adventure is waiting for you.",
  paused: false,
  travel: 0,
});
export type Action =
  | { type: "open" | "replay" | "interact" | "pause" }
  | { type: "go"; to: Destination }
  | { type: "tick"; delta: number }
  | { type: "bell"; bell: Bell };
export function allowed(s: Quest, to: Destination) {
  return (
    s.stage !== "intro" &&
    s.stage !== "complete" &&
    (to === "bells" ||
      to === "start" ||
      to === "mailbox" ||
      (to === "garden" && s.stage !== "bell_gate"))
  );
}
export function quest(s: Quest, a: Action): Quest {
  if (a.type === "replay") return initialQuest();
  if (a.type === "pause") return { ...s, paused: !s.paused };
  if (s.paused) return s;
  // A completed gift keeps its ending, including its accessible status message.
  // Only the replay/settings actions above remain available.
  if (s.stage === "complete") return s;
  if (a.type === "open" && s.stage === "intro")
    return {
      ...s,
      stage: "bell_gate",
      hint: "Follow the ribbon to the bell gate.",
    };
  if (a.type === "go" && allowed(s, a.to) && !s.target && a.to !== s.location)
    return {
      ...s,
      target: a.to,
      travel: 0,
      hint: "A little hop along the ribbon…",
    };
  if (a.type === "tick" && s.target) {
    const travel = s.travel + Math.min(Math.max(a.delta, 0), 2.4);
    return travel >= 2.4
      ? {
          ...s,
          location: s.target,
          target: null,
          travel: 0,
          hint:
            s.target === "bells"
              ? "The sign says: circle, triangle, star."
              : s.target === "garden"
                ? "A star! It has been waiting for you."
                : "A special delivery belongs here.",
        }
      : { ...s, travel };
  }
  if (s.target) return s;
  if (a.type === "bell" && s.location === "bells" && s.stage === "bell_gate") {
    if (a.bell !== sequence[s.bellIndex])
      return {
        ...s,
        bellIndex: 0,
        hint: "Almost! Let’s start again with the circle. No hurry.",
      };
    const n = s.bellIndex + 1;
    return {
      ...s,
      bellIndex: n,
      stage: n === 3 ? "star_garden" : s.stage,
      hint:
        n === 3
          ? "Ding, ding, ding! The ribbon is glowing and the gate is open. Find the star."
          : `${n} of 3 bells. Another piece of the ribbon lights up.`,
    };
  }
  if (
    a.type === "interact" &&
    s.location === "garden" &&
    s.stage === "star_garden" &&
    !s.hasStar
  )
    return {
      ...s,
      hasStar: true,
      stage: "gift_delivery",
      hint: "You found a little light, and the garden is blooming! Let’s deliver it to the mailbox.",
    };
  if (a.type === "interact" && s.location === "mailbox")
    return s.stage === "gift_delivery" && s.hasStar
      ? {
          ...s,
          stage: "complete",
          hasStar: false,
          hint: "The whole island glows. A star, and a note, just for you.",
        }
      : {
          ...s,
          hint: "This mailbox is waiting for a star. Try the bell gate, then the garden.",
        };
  return s;
}
export const objectives: Record<Stage, string> = {
  intro: "A Star for You",
  bell_gate: "01 · Open the bell gate",
  star_garden: "02 · Find your little star",
  gift_delivery: "03 · Deliver a little light",
  complete: "Made with love. Delivered by you.",
};
