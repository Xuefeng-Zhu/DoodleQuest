"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ImageOff } from "lucide-react";
import type { Gift } from "@/domain/config";
import { permittedDrawing, type RevealPhase } from "@/domain/reveal";

export default function GiftReveal({
  gift,
  phase,
  ready,
  failed,
  onEnter,
  onSkip,
}: {
  gift: Gift;
  phase: RevealPhase;
  ready: boolean;
  failed: boolean;
  onEnter: () => void;
  onSkip: () => void;
}) {
  const drawing = permittedDrawing(gift);
  const heading = useRef<HTMLHeadingElement>(null);
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  const entering = phase === "entering";
  return (
    <section
      className={`gift-reveal ${drawing ? "with-drawing" : "hero-only"}`}
      aria-label="Drawing meets world"
      data-phase={phase}
    >
      <div className="reveal-heading" aria-hidden={entering}>
        <span className="eyebrow">From drawing to character</span>
        <h1 ref={heading} tabIndex={-1}>
          {drawing ? (
            <>
              It started with <em>a doodle.</em>
            </>
          ) : (
            <>
              Hello, <em>{gift.config.heroName}.</em>
            </>
          )}
        </h1>
        <p>
          {drawing
            ? "The same character, ready to explore."
            : `A little hero, made for ${gift.config.recipient}.`}
        </p>
      </div>
      <div className="reveal-tableau" aria-hidden={entering}>
        {drawing && (
          <figure className="reveal-drawing">
            {imageFailed ? (
              <div className="drawing-unavailable" role="status">
                <ImageOff size={28} />
                The drawing couldn’t open. Your adventure is still here.
              </div>
            ) : (
              <img
                src={drawing}
                alt={`The original drawing of ${gift.config.heroName}`}
                onError={() => setImageFailed(true)}
              />
            )}
            <figcaption>The original drawing</figcaption>
          </figure>
        )}
        {drawing && (
          <span className="reveal-connection" aria-hidden="true">
            <ArrowRight size={25} />
          </span>
        )}
        <div className="reveal-hero-caption" aria-live="polite">
          <span className="reveal-hero-name">Meet {gift.config.heroName}</span>
          <span>
            {gift.source === "procedural"
              ? "Our handmade, procedural example"
              : gift.source === "mock"
                ? "Test character · mocked generation"
                : "A 3D interpretation of the drawing"}
          </span>
        </div>
      </div>
      <div
        className="reveal-invitation"
        aria-hidden={entering}
        inert={entering}
      >
        <p>
          {failed
            ? "The 3D view couldn’t open. Your story and note are still ready."
            : !ready
              ? "Opening the saved character. You can continue at any time."
              : `${gift.config.heroName} has a little adventure to share with you.`}
        </p>
        <button
          className="button primary"
          onClick={onEnter}
          disabled={phase === "drawing"}
        >
          Enter the little world <ArrowRight size={18} />
        </button>
        <span className="reveal-honesty">
          {gift.source === "procedural"
            ? "This example is handcrafted, not Tripo-generated."
            : gift.source === "mock"
              ? "An explicit test preview, not live Tripo output."
              : "An interpretation, not an exact reconstruction."}
        </span>
      </div>
      <button className="reveal-skip" onClick={onSkip}>
        Skip reveal <ArrowRight size={13} aria-hidden="true" />
      </button>
    </section>
  );
}
