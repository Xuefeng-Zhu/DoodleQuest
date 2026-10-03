"use client";
import { useEffect, useReducer, useRef, useState } from "react";
import { Mail, Music2, RotateCcw, Square } from "lucide-react";
import type { Gift } from "@/domain/config";
import { permittedDrawing } from "@/domain/reveal";
import { advanceLetter, letter, LETTER_OPEN_MS } from "@/domain/letter";
import DedicationTag from "./DedicationTag";
import type { AudioState } from "./game/MelodyPlayer";
import styles from "./GiftLetter.module.css";

export default function GiftLetter({
  gift,
  paused,
  reduced,
  status,
  onReplay,
  melody,
}: {
  gift: Gift;
  paused: boolean;
  reduced: boolean;
  status: string;
  onReplay: () => void;
  melody: {
    state: AudioState;
    onOpen: () => void;
    onPlay: () => void;
    onStop: () => void;
  };
}) {
  const [phase, send] = useReducer(letter, "sealed");
  const elapsed = useRef(0);
  const openButton = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [drawingOpen, setDrawingOpen] = useState(false);
  const [drawingFailed, setDrawingFailed] = useState(false);
  const drawing = permittedDrawing(gift);
  const playing =
    melody.state.phase === "playing" && melody.state.cue === "home";

  useEffect(() => {
    elapsed.current = 0;
  }, [phase]);
  useEffect(() => {
    if (phase !== "opening") return;
    if (reduced) {
      send({ type: "opened" });
      return;
    }
    if (paused) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      elapsed.current = advanceLetter(
        elapsed.current,
        now - last,
        document.hidden,
        false,
      );
      last = now;
      if (elapsed.current >= LETTER_OPEN_MS) send({ type: "opened" });
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase, paused, reduced]);
  useEffect(() => {
    if (paused) return;
    if (phase === "sealed") openButton.current?.focus({ preventScroll: true });
    if (phase === "reading") heading.current?.focus({ preventScroll: true });
  }, [phase, paused]);

  return (
    <section
      className={`ending letter-ending ${styles.letter}`}
      data-letter-phase={phase}
      aria-label="Your letter"
      inert={paused}
    >
      <p className="sr-only" role="status">
        {status}
      </p>
      {phase !== "reading" ? (
        <div className="letter-delivery">
          <div className="letter-intro">
            <span className="eyebrow">YOUR LETTER</span>
            <h1>
              Something just
              <br /> for you.
            </h1>
            <p>Delivered by {gift.config.heroName}.</p>
          </div>
          <button
            ref={openButton}
            className="letter-envelope"
            data-long-name={gift.config.recipient.length > 24}
            aria-label="Open your letter"
            aria-busy={phase === "opening"}
            disabled={phase === "opening" || paused}
            onClick={() => {
              melody.onOpen();
              send({ type: "open", reduced });
            }}
          >
            <span className="envelope-back" aria-hidden="true" />
            <span className="envelope-peek" aria-hidden="true" />
            <span className="envelope-flap" aria-hidden="true" />
            <span className="envelope-front" aria-hidden="true" />
            <span className="envelope-address" aria-hidden="true">
              <small>To</small>
              <strong>{gift.config.recipient}</strong>
            </span>
            <span className="envelope-invitation" aria-hidden="true">
              {phase === "opening"
                ? "Opening your letter…"
                : "Open your letter"}
              <span>↗</span>
            </span>
          </button>
          <p className="letter-sender">
            From <strong>{gift.config.creator}</strong>
          </p>
        </div>
      ) : (
        <article
          className="letter-sheet"
          data-long-name={gift.config.recipient.length > 24}
          aria-labelledby="letter-heading"
          tabIndex={0}
        >
          <h1 ref={heading} id="letter-heading" tabIndex={-1}>
            For {gift.config.recipient}
            <span aria-hidden="true">,</span>
          </h1>
          <p className="personal-message">{gift.config.message}</p>
          <p className="letter-signature">
            <span>From</span>
            <strong>{gift.config.creator}</strong>
          </p>
          <div className="letter-postscript">
            Delivered by {gift.config.heroName}.
          </div>
          <div className="letter-melody">
            <span className="melody-symbols" aria-hidden="true">
              <i>●</i>
              <i>▲</i>
              <i>★</i>
            </span>
            <div>
              <p>Bell melody</p>
              <button
                disabled={paused}
                onClick={playing ? melody.onStop : melody.onPlay}
              >
                {playing ? (
                  <Square size={12} aria-hidden="true" />
                ) : (
                  <Music2 size={14} aria-hidden="true" />
                )}
                {playing ? "Stop melody" : "Play the melody"}
              </button>
            </div>
            <span className="sr-only" aria-live="polite">
              {playing ? "The bell melody is playing." : ""}
            </span>
          </div>
          {melody.state.phase === "unavailable" && (
            <p className="audio-unavailable" aria-live="polite">
              Sound couldn’t start. You can try again, or enjoy your letter in
              quiet.
            </p>
          )}
          <DedicationTag text={gift.config.dedication} variant="letter" />
          {drawing && (
            <details
              className="letter-keepsake"
              onToggle={(e) => setDrawingOpen(e.currentTarget.open)}
            >
              <summary>The drawing that started it all</summary>
              {drawingOpen &&
                (drawingFailed ? (
                  <p aria-live="polite">
                    The drawing couldn’t open. Your letter is still here.
                  </p>
                ) : (
                  <figure>
                    <img
                      src={drawing}
                      alt={`Original drawing for ${gift.config.heroName}`}
                      onError={() => setDrawingFailed(true)}
                    />
                    <figcaption>Original drawing</figcaption>
                  </figure>
                ))}
            </details>
          )}
        </article>
      )}
      <div className="letter-actions">
        {phase === "reading" && (
          <button
            className="letter-fold"
            disabled={paused}
            onClick={() => {
              melody.onStop();
              setDrawingOpen(false);
              send({ type: "fold" });
            }}
          >
            <Mail size={15} aria-hidden="true" />
            Fold the letter
          </button>
        )}
        <button
          className="letter-replay"
          disabled={paused || phase === "opening"}
          onClick={onReplay}
        >
          <RotateCcw size={14} aria-hidden="true" />
          Play again
        </button>
      </div>
    </section>
  );
}
