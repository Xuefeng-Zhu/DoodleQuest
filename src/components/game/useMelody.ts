"use client";
import { useEffect, useRef, useState } from "react";
import { useGame } from "./store";
import { idleAudio, MelodyPlayer } from "./MelodyPlayer";
import type { SoundCue } from "@/domain/melody";

export function useMelody() {
  const player = useRef<MelodyPlayer | null>(null);
  const mounted = useRef(false);
  const opened = useRef(false);
  const [state, setState] = useState(idleAudio);
  const muted = useGame((s) => s.muted);
  const paused = useGame((s) => s.game.paused);
  const stop = () => player.current?.stop();
  useEffect(() => {
    mounted.current = true;
    const quiet = () => {
      if (document.hidden) player.current?.stop();
    };
    const leave = () => player.current?.stop();
    document.addEventListener("visibilitychange", quiet);
    window.addEventListener("pagehide", leave);
    return () => {
      mounted.current = false;
      document.removeEventListener("visibilitychange", quiet);
      window.removeEventListener("pagehide", leave);
      player.current?.dispose();
      player.current = null;
    };
  }, []);
  useEffect(() => {
    if (muted || paused) stop();
  }, [muted, paused]);
  const play = (cue: SoundCue) => {
    const { muted, game } = useGame.getState();
    if (muted || game.paused || document.hidden) return;
    player.current ??= new MelodyPlayer((next) => {
      if (mounted.current) setState(next);
    });
    void player.current.play(cue);
  };
  const setEnabled = (enabled: boolean) => {
    if (!enabled) stop();
    useGame.getState().settings({ muted: !enabled });
  };
  return {
    state,
    stop,
    play,
    setEnabled,
    openLetter: () => {
      if (opened.current || useGame.getState().game.stage !== "complete")
        return;
      opened.current = true;
      play("home");
    },
    hearAgain: () => {
      const { game } = useGame.getState();
      if (game.stage !== "complete" || game.paused || document.hidden) return;
      setEnabled(true);
      play("home");
    },
    replay: () => {
      stop();
      opened.current = false;
    },
  };
}
