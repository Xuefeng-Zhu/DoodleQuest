"use client";
import { useEffect } from "react";
import { useGame } from "./game/store";
export default function MotionPreferences() {
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () =>
      useGame.getState().settings({ reduced: preference.matches });
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  return null;
}
