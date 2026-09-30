"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Settings2,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Volume2,
  VolumeX,
  Star,
  Mail,
  Heart,
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
export default function Game({
  gift,
  preview = false,
}: {
  gift: Gift;
  preview?: boolean;
}) {
  const game = useGame((s) => s.game),
    dispatch = useGame((s) => s.dispatch),
    settings = useGame((s) => s.settings),
    muted = useGame((s) => s.muted),
    low = useGame((s) => s.low),
    reduced = useGame((s) => s.reduced);
  const [failed, setFailed] = useState(false);
  const audio = useRef<AudioContext | null>(null);
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
    return () => {
      audio.current?.close();
    };
  }, [dispatch, settings]);
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
    dispatch(a);
    if (!muted && (a.type === "bell" || a.type === "interact")) {
      try {
        audio.current ??= new AudioContext();
        const osc = audio.current.createOscillator(),
          gain = audio.current.createGain();
        osc.type = "sine";
        osc.frequency.value =
          a.type === "bell" ? [523, 659, 784][sequence.indexOf(a.bell)] : 880;
        gain.gain.setValueAtTime(0.05, audio.current.currentTime);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          audio.current.currentTime + 0.6,
        );
        osc.connect(gain).connect(audio.current.destination);
        osc.start();
        osc.stop(audio.current.currentTime + 0.6);
      } catch {
        /* Sound is optional. */
      }
    }
  };
  const names: Record<Destination, string> = {
    start: "Little landing",
    bells: "Bell gate",
    garden: "Star garden",
    mailbox: "Gift mailbox",
  };
  return (
    <main
      className={`game-page ${game.stage === "complete" ? "completed" : ""}`}
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
        <Scene gift={gift} onFailure={() => setFailed(true)} onAction={act} />
      </div>
      {game.stage !== "intro" && game.stage !== "complete" && (
        <div className="objective">
          <span className="status-dot" />
          {objectives[game.stage]}
        </div>
      )}
      {game.stage === "intro" && (
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
          <button
            className="button primary"
            onClick={() => act({ type: "open" })}
          >
            Open my gift <ArrowRight size={18} />
          </button>
          <span className="opening-signature">
            with love, {gift.config.creator}
          </span>
        </section>
      )}
      {game.stage !== "intro" && game.stage !== "complete" && (
        <div className="game-bottom">
          <p className="game-hint" role="status" aria-live="polite">
            {game.hint}
          </p>
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
      {game.stage === "complete" && (
        <section className="ending">
          <div className="gift-sparkles" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <span
                key={i}
                style={{
                  left: `${12 + i * 15}%`,
                  animationDelay: `${i * 0.1}s`,
                }}
              >
                ✦
              </span>
            ))}
          </div>
          <span className="ending-star">✦</span>
          <span className="eyebrow">ONE LITTLE STAR. ALL THIS LOVE.</span>
          <h1>
            For {gift.config.recipient}
            <span className="handwritten">♡</span>
          </h1>
          <p className="personal-message">{gift.config.message}</p>
          <p className="signature">
            With love, <strong>{gift.config.creator}</strong>
          </p>
          {gift.config.showDrawing && gift.drawingUrl && (
            <details>
              <summary>The drawing that started it all</summary>
              <img
                src={gift.drawingUrl}
                alt={`Original drawing for ${gift.config.heroName}`}
              />
            </details>
          )}
          <button
            className="button secondary"
            onClick={() => {
              movementProgress.current = 0;
              act({ type: "replay" });
            }}
          >
            <RotateCcw size={16} /> Play again
          </button>
        </section>
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
                onChange={(e) => settings({ muted: !e.target.checked })}
              />
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />} Gentle
              sounds
            </label>
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
