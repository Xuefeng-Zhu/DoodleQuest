import { z } from "zod";
export const GiftConfigSchema = z.object({
  recipient: z.string().trim().min(1).max(50).default("Someone wonderful"),
  creator: z.string().trim().min(1).max(50).default("Someone who loves you"),
  title: z.string().trim().min(1).max(80).default("A Star for You"),
  message: z
    .string()
    .trim()
    .min(1)
    .max(1200)
    .default(
      "The world is a little brighter with you in it. Keep being wonderfully you.",
    ),
  heroName: z.string().trim().min(1).max(32).default("Pip"),
  movement: z.enum(["bounce", "float", "sway"]).default("bounce"),
  forward: z.number().min(-180).max(180).default(0),
  palette: z.enum(["meadow", "sunset", "sky"]).default("meadow"),
  showDrawing: z.boolean().default(false),
});
export type GiftConfig = z.infer<typeof GiftConfigSchema>;
export type Gift = {
  config: GiftConfig;
  modelUrl?: string;
  drawingUrl?: string;
  source: "procedural" | "tripo" | "mock";
  version: number;
};
export const defaults = GiftConfigSchema.parse({});
export const example: Gift = {
  config: {
    ...defaults,
    recipient: "You",
    creator: "The DoodleQuest studio",
    showDrawing: true,
  },
  drawingUrl: "/sample-drawing.png",
  source: "procedural",
  version: 1,
};
export const palettes = {
  meadow: {
    grass: "#b7d9ad",
    rim: "#789e79",
    flower: "#ffc96b",
    sky: "#e8eee2",
  },
  sunset: {
    grass: "#d4d6a8",
    rim: "#a5aa7e",
    flower: "#efa495",
    sky: "#f2e3d9",
  },
  sky: { grass: "#b2d8c7", rim: "#6ea6a1", flower: "#a6badd", sky: "#e2edf0" },
};
