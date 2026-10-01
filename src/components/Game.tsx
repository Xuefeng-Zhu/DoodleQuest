"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Settings2,
  ArrowLeft,
  ArrowRight,
  Volume2,
  VolumeX,
  Star,
  Mail,
} from "lucide-react";
import type { Gift } from "@/domain/config";
import {
  allowed,
  objectives,
  sequence,
  type Action,
  type Destination,
} from "@/domain/quest";
import { useGame, movementProgress } from "./game/store";
import Scene from "./Scene";
import GiftReveal from "./GiftReveal";
import GiftLetter from "./GiftLetter";
import DedicationTag from "./DedicationTag";
import { useGiftReveal } from "./game/useGiftReveal";
import { permittedDrawing } from "@/domain/reveal";
import WonderControls from "./WonderControls";
import { useWonderClock } from "./game/useWonderClock";
import { useMelody } from "./game/useMelody";
import { soundForAction } from "@/domain/melody";
export default function Game({
  gift,
  preview = false,
}: {
  gift: Gift;
  preview?: boolean;
}) {
  useWonderClock();
  const melody = useMelody();
  const game = useGame((s) => s.game),
    dispatch = useGame((s) => s.dispatch),
    settings = useGame((s) => s.settings),
    muted = useGame((s) => s.muted),
    low = useGame((s) => s.low),
    reduced = useGame((s) => s.reduced);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const onSceneReady = useCallback(() => setReady(true), []);
  const onSceneFailure = useCallback(() => setFailed(true), []);
  const opening = useGiftReveal(game.paused, reduced);
  const revealing = opening.phase !== "sealed" && opening.phase !== "playing";
  const objective = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    if (game.paused)
      dialog.current?.querySelector<HTMLElement>("input")?.focus();
  }, [game.paused]);
  useEffect(() => {
    movementProgress.current = 0;
    dispatch({ type: "replay" });
    settings({
      reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
    });
  }, [dispatch, settings]);
  useEffect(() => {
    if (opening.phase === "playing" && game.stage === "intro" && !game.paused)
      dispatch({ type: "open" });
  }, [opening.phase, game.stage, game.paused, dispatch]);
  useEffect(() => {
    if (game.stage === "bell_gate")
      objective.current?.focus({ preventScroll: true });
  }, [game.stage]);
  useEffect(() => {
    if (!game.target || game.paused) return;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      movementProgress.current += Math.min((now - last) / 1000, 0.1);
      last = now;
      if (movementProgress.current >= 2.4) {
        dispatch({ type: "tick", delta: 2.4 });
        movementProgress.current = 0;
      } else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [game.target, game.paused, dispatch]);
  const act = (a: Action) => {
    const before = useGame.getState().game;
    if (a.type === "pause") melody.stop();
    if (a.type === "replay") melody.replay();
    dispatch(a);
    const cue = soundForAction(before, useGame.getState().game, a);
    if (cue) melody.play(cue);
  };
  const names: Record<Destination, string> = {
    start: "Little landing",
    bells: "Bell gate",
    garden: "Star garden",
    mailbox: "Gift mailbox",
  };
  return (
    <main
      className={`game-page ${game.stage === "complete" ? "completed" : ""} ${revealing ? "is-revealing" : ""} ${opening.phase === "entering" ? "is-entering" : ""}`}
      data-reveal-phase={opening.phase}
      data-reduced-motion={reduced}
      data-paused={game.paused}
      data-scene-ready={ready}
    >
      <header className="game-top">
        <Link href={preview ? "/create" : "/"} className="back-link">
          <ArrowLeft size={17} />
          {preview ? "Back to your gift" : "doodlequest."}
        </Link>
        <span className="game-title">{gift.config.title}</span>
        <button
          className="icon-button"
          aria-label="Pause and settings"
          onClick={() => act({ type: "pause" })}
        >
          <Settings2 size={20} />
        </button>
      </header>
      <div className="game-scene">
        <Scene
          gift={gift}
          onFailure={onSceneFailure}
          onReady={onSceneReady}
          onAction={act}
          reveal={{
            phase: opening.phase,
            progress: opening.progress,
            withDrawing: !!permittedDrawing(gift),
          }}
        />
      </div>
      {game.stage !== "intro" && game.stage !== "complete" && (
        <div className="objective" ref={objective} tabIndex={-1}>
          <span className="status-dot" />
          {objectives[game.stage]}
        </div>
      )}
      {game.stage === "intro" && opening.phase === "sealed" && (
        <section className="gift-opening">
          <span className="eyebrow">A SMALL ADVENTURE, WITH A BIG HEART</span>
          <h1>
            A little world,
            <br />
            made for <em>{gift.config.recipient}.</em>
          </h1>
          <p>
            Meet {gift.config.heroName}. Find a star.
            <br />
            Discover something just for you.
          </p>
          <DedicationTag text={gift.config.dedication} variant="opening" />
          <button
            className="button primary"
            onClick={() =>
              opening.send({
                type: "open",
                withDrawing: !!permittedDrawing(gift),
                reduced,
              })
            }
          >
            Open my gift <ArrowRight size={18} />
          </button>
          <span className="opening-signature">
            with love, {gift.config.creator}
          </span>
          <button
            className="opening-sound"
            role="switch"
            aria-checked={!muted}
            aria-label="Gentle sounds"
            onClick={() => melody.setEnabled(muted)}
            disabled={game.paused}
          >
            {muted ? (
              <VolumeX size={15} aria-hidden="true" />
            ) : (
              <Volume2 size={15} aria-hidden="true" />
            )}
            {muted
              ? "Sound off · a quiet little world"
              : "Sound on · listen for the bells"}
          </button>
        </section>
      )}
      {revealing && (
        <GiftReveal
          gift={gift}
          phase={opening.phase}
          ready={ready}
          failed={failed}
          onEnter={() => opening.send({ type: "enter" })}
          onSkip={() => opening.send({ type: "skip" })}
        />
      )}
      {game.stage !== "intro" && game.stage !== "complete" && (
        <div className="game-bottom">
          <p className="game-hint" role="status" aria-live="polite">
            {game.hint}
            {game.hasStar && gift.config.dedication && (
              <span className="sr-only">
                {" "}
                Carrying a little thought: {gift.config.dedication}.
              </span>
            )}
          </p>
          {game.hasStar && (failed || !ready) && (
            <DedicationTag text={gift.config.dedication} variant="carried" />
          )}
          {game.location === "bells" &&
            !game.target &&
            game.stage === "bell_gate" && (
              <div className="bell-controls">
                <span>
                  On the sign: <b>● → ▲ → ★</b>
                </span>
                <div>
                  {sequence.map((b, i) => (
                    <button
                      className={`bell bell-${b}`}
                      key={b}
                      aria-label={`Ring ${b} bell`}
                      onClick={() => act({ type: "bell", bell: b })}
                    >
                      {["●", "▲", "★"][i]}
                      <span>{b}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          {!game.target &&
            ((game.location === "garden" && game.stage === "star_garden") ||
              game.location === "mailbox") && (
              <button
                className="button primary interact"
                onClick={() => act({ type: "interact" })}
              >
                {game.location === "garden" ? (
                  <>
                    <Star size={17} /> Collect the star
                  </>
                ) : (
                  <>
                    <Mail size={17} />
                    {game.hasStar ? "Deliver the star" : "Read mailbox hint"}
                  </>
                )}
              </button>
            )}
          <nav className="destinations" aria-label="Choose a destination">
            {(["bells", "garden", "mailbox"] as Destination[]).map((to, i) => (
              <button
                key={to}
                disabled={
                  !allowed(game, to) ||
                  !!game.target ||
                  game.location === to ||
                  game.paused
                }
                onClick={() => act({ type: "go", to })}
              >
                <span>{i + 1}</span>
                {names[to]}
                {game.target === to && " …"}
              </button>
            ))}
          </nav>
          <p className="controls-note">
            Tap a destination or use Tab + Enter. There’s no hurry.
          </p>
        </div>
      )}
      {game.stage !== "intro" && game.stage !== "complete" && (
        <WonderControls textOnly={failed || !ready} />
      )}
      {game.stage === "complete" && (
        <GiftLetter
          gift={gift}
          paused={game.paused}
          reduced={reduced}
          status={game.hint}
          melody={{
            state: melody.state,
            onOpen: melody.openLetter,
            onPlay: melody.hearAgain,
            onStop: melody.stop,
          }}
          onReplay={() => {
            movementProgress.current = 0;
            opening.send({ type: "replay" });
            act({ type: "replay" });
          }}
        />
      )}
      {game.paused && (
        <div className="modal-scrim">
          <section
            ref={dialog}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                act({ type: "pause" });
                return;
              }
              if (e.key === "Tab") {
                const items =
                  dialog.current?.querySelectorAll<HTMLElement>("button,input");
                if (!items?.length) return;
                const first = items[0],
                  last = items[items.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first.focus();
                }
              }
            }}
            className="settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Adventure settings"
          >
            <h2>A little breather.</h2>
            <label className="check-row">
              <input
                type="checkbox"
                checked={!muted}
                onChange={(e) => melody.setEnabled(e.target.checked)}
              />
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />} Gentle
              sounds
            </label>
            {melody.state.phase === "unavailable" && (
              <p className="audio-unavailable" aria-live="polite">
                Sound couldn’t start. Your gift still works without it.
              </p>
            )}
            <label className="check-row">
              <input
                type="checkbox"
                checked={low}
                onChange={(e) => settings({ low: e.target.checked })}
              />{" "}
              Low-quality rendering
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={reduced}
                onChange={(e) => settings({ reduced: e.target.checked })}
              />{" "}
              Reduce motion
            </label>
            <button
              className="button primary"
              onClick={() => act({ type: "pause" })}
            >
              Back to the adventure
            </button>
          </section>
        </div>
      )}
      <span className="game-source">
        {gift.source === "procedural"
          ? "Handmade example · procedural hero"
          : gift.source === "mock"
            ? "TEST MODE · mocked generation"
            : "A Tripo 3D interpretation"}
        {failed ? " · Story controls available" : ""}
      </span>
    </main>
  );
}
