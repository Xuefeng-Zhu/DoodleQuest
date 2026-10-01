"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Copy, Heart, Leaf, MoveUpRight, X } from "lucide-react";
import type { GiftConfig } from "@/domain/config";

export type WrappedGift = {
  id: string;
  token: string;
  version: number;
  config: GiftConfig;
};
export class UnconfirmedPublication extends Error {}
type Phase =
  "review" | "saving" | "publishing" | "sealed" | "failed" | "uncertain";

export default function GiftWrapping({
  config,
  onPublish,
  onCheck,
  onClose,
}: {
  config: GiftConfig;
  onPublish: (
    stage: (phase: "saving" | "publishing") => void,
  ) => Promise<WrappedGift>;
  onCheck: () => Promise<WrappedGift | null>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const link = useRef<HTMLInputElement>(null);
  const flight = useRef(false);
  const alive = useRef(false);
  const [phase, setPhase] = useState<Phase>("review");
  const [receipt, setReceipt] = useState<WrappedGift | null>(null);
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [checking, setChecking] = useState(false);
  const waiting = phase === "saving" || phase === "publishing" || checking;
  const sealed = phase === "sealed";
  const shown = receipt?.config || config;
  useEffect(() => {
    alive.current = true;
    const el = dialog.current!;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    el.showModal();
    heading.current?.focus({ preventScroll: true });
    return () => {
      alive.current = false;
      el.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);
  useEffect(() => {
    if (sealed) {
      if (dialog.current) dialog.current.scrollTop = 0;
      heading.current?.focus({ preventScroll: true });
    }
  }, [sealed]);
  const seal = async () => {
    if (flight.current || sealed || phase === "uncertain") return;
    flight.current = true;
    setError("");
    setPhase("saving");
    try {
      const result = await onPublish((next) => {
        if (alive.current) setPhase(next);
      });
      if (alive.current) {
        setReceipt(result);
        setPhase("sealed");
      }
    } catch (e) {
      if (alive.current) {
        setPhase(e instanceof UnconfirmedPublication ? "uncertain" : "failed");
        setError(
          e instanceof Error
            ? e.message
            : "Your gift couldn’t be saved. Please try again.",
        );
      }
    } finally {
      flight.current = false;
    }
  };
  const check = async () => {
    if (flight.current) return;
    flight.current = true;
    setChecking(true);
    try {
      const result = await onCheck();
      if (alive.current) {
        if (result) {
          setReceipt(result);
          setError("");
          setPhase("sealed");
        } else
          setError(
            "No new gift link is confirmed yet. Check again in a moment, or return to the workshop to review saved links before trying another publish.",
          );
      }
    } catch {
      if (alive.current)
        setError(
          "We still can’t check saved links. Your draft is safe; please check again when you’re connected.",
        );
    } finally {
      flight.current = false;
      if (alive.current) setChecking(false);
    }
  };
  const close = () => {
    if (!flight.current) {
      // Restore native dialog focus while it is still connected to the DOM.
      // Closing only in unmount cleanup loses the invoking button's focus.
      dialog.current?.close();
      onClose();
    }
  };
  return (
    <dialog
      ref={dialog}
      className="wrapping-dialog"
      aria-labelledby="wrapping-heading"
      aria-describedby="wrapping-description"
      data-wrap-phase={phase}
      data-palette={shown.palette}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <button
        className="wrap-close"
        aria-label="Close gift wrapping"
        disabled={waiting}
        onClick={close}
      >
        <X size={19} />
      </button>
      <div className="wrapping-table">
        <div className="wrapping-stage" aria-hidden="true">
          <span className="wrapping-kicker">
            A LITTLE WORLD / MADE WITH LOVE
          </span>
          <div className="gift-parcel">
            <div className="parcel-fold parcel-fold-left" />
            <div className="parcel-fold parcel-fold-right" />
            <div className="parcel-ribbon ribbon-across" />
            <div className="parcel-ribbon ribbon-down" />
            <div className="parcel-bow">
              <i />
              <i />
            </div>
            <div className="parcel-tag">
              <span>especially for</span>
              <strong>{shown.recipient}</strong>
              <small>with love, {shown.creator}</small>
            </div>
            <div className="parcel-seal">
              <Heart size={18} strokeWidth={1.5} />
            </div>
          </div>
          <Leaf className="wrapping-sprig" size={60} strokeWidth={1} />
          <p className="wrapping-caption">
            {sealed
              ? "A little world. A lot of love."
              : "One last little touch."}
          </p>
        </div>
        <section className="wrapping-words">
          <p className="eyebrow">
            {sealed ? "SEALED WITH A LITTLE LOVE" : "BEFORE YOU TIE THE RIBBON"}
          </p>
          <h2 id="wrapping-heading" ref={heading} tabIndex={-1}>
            {sealed
              ? `Wrapped for ${shown.recipient}.`
              : "Something only you could give."}
          </h2>
          <p id="wrapping-description">
            {sealed
              ? `${shown.heroName} is ready to carry your words. Give this link to someone special, whenever you’re ready.`
              : "Take one last look at your words. Then we’ll tuck this little adventure into an unlisted gift link."}
          </p>
          {!sealed ? (
            <>
              <div
                className="wrap-note"
                tabIndex={0}
                role="region"
                aria-label="Review your gift note"
              >
                <span className="wrap-adventure">{shown.title}</span>
                <h3>For {shown.recipient},</h3>
                <p>{shown.message}</p>
                <p className="wrap-signature">With love, {shown.creator}</p>
                {shown.dedication && (
                  <small>Your little saying: {shown.dedication}</small>
                )}
              </div>
              <p className="wrap-privacy">
                {shown.showDrawing
                  ? "Includes the original drawing in the opening and ending."
                  : "Your original drawing stays out of this gift."}
              </p>
            </>
          ) : (
            <p className="wrap-receipt">
              <Check size={16} /> Gift version {receipt!.version} · saved,
              read-only snapshot
            </p>
          )}
          <p className="wrap-disclosure">
            Anyone with the link can open it. No recipient account needed. Later
            draft edits won’t change this gift.
          </p>
          <p className="wrap-progress" role="status" aria-live="polite">
            {phase === "saving"
              ? "Saving your latest words…"
              : phase === "publishing"
                ? "Creating your gift link…"
                : checking
                  ? "Checking saved gift links…"
                  : sealed
                    ? "Your gift link is ready. Nothing has been sent to the recipient."
                    : copyStatus}
          </p>
          {error && (
            <p className="error-note" role="alert">
              {error}
            </p>
          )}
          {sealed ? (
            <>
              <label className="wrapped-link-label">
                Your wrapped gift link
                <input
                  ref={link}
                  readOnly
                  value={`${location.origin}/gift/${receipt!.token}`}
                  onFocus={(e) => e.target.select()}
                />
              </label>
              <div className="wrap-actions">
                <button
                  className="button primary"
                  onClick={async () => {
                    setCopyStatus("");
                    try {
                      await navigator.clipboard.writeText(
                        `${location.origin}/gift/${receipt!.token}`,
                      );
                      if (alive.current) {
                        setError("");
                        setCopyStatus("Gift link copied. Ready to give.");
                      }
                    } catch {
                      if (alive.current) {
                        setError(
                          "Copy isn’t available here. Select the gift link and copy it manually.",
                        );
                        link.current?.focus();
                        link.current?.select();
                      }
                    }
                  }}
                >
                  <Copy size={16} /> Copy gift link
                </button>
                <a
                  className="button secondary"
                  href={`/gift/${receipt!.token}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open gift <MoveUpRight size={16} />
                  <span className="sr-only"> in a new tab</span>
                </a>
              </div>
              <p className="wrap-copy-status" aria-live="polite">
                {copyStatus}
              </p>
              <button className="button text-button" onClick={close}>
                Back to my workshop
              </button>
            </>
          ) : (
            <div className="wrap-actions">
              {phase === "uncertain" ? (
                <button
                  className="button primary"
                  disabled={waiting}
                  onClick={check}
                >
                  Check saved gift links
                </button>
              ) : (
                <button
                  className="button primary"
                  disabled={waiting}
                  onClick={seal}
                >
                  <Heart size={16} />
                  {waiting ? "Keeping your words safe…" : "Seal & publish gift"}
                </button>
              )}
              <button
                className="button text-button"
                disabled={waiting}
                onClick={close}
              >
                {phase === "uncertain" ? "Back to workshop" : "Not quite yet"}
              </button>
            </div>
          )}
        </section>
      </div>
    </dialog>
  );
}
