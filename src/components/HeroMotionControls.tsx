"use client";
import { useEffect, useState } from "react";
import type { HeroMotion } from "@/domain/hero-motion";

export type MotionJob = {
  id: string;
  status: string;
  stage: "rig_check" | "rig" | "retarget";
  progress: number | null;
  lastError: string | null;
  inputAsset: string;
  inputRevision: number;
  finalAsset: string | null;
};
export const motionWorking = (job?: MotionJob | null) =>
  !!job &&
  [
    "pending",
    "uploading",
    "submitting",
    "queued",
    "generating",
    "polling",
    "downloading",
    "asset_retry",
  ].includes(job.status);

export default function HeroMotionControls({
  job,
  procedural,
  available,
  unlocked,
  busy,
  loaded,
  previewMotion,
  onPreview,
  onAnimate,
  onRefresh,
}: {
  job?: MotionJob | null;
  procedural: boolean;
  available: boolean;
  unlocked: boolean;
  busy: boolean;
  loaded: boolean;
  previewMotion: HeroMotion;
  onPreview: (motion: HeroMotion) => void;
  onAnimate: (retry: boolean) => void;
  onRefresh: () => void;
}) {
  const [consent, setConsent] = useState(false);
  useEffect(() => setConsent(false), [job?.id, job?.status]);
  const active = motionWorking(job);
  const stage =
    job?.stage === "rig_check"
      ? "Checking which movements suit your hero"
      : job?.stage === "rig"
        ? "Preparing your hero to move"
        : "Adding your hero’s movements";
  const status = !job
    ? ""
    : job.status === "ready"
      ? "Your hero’s motion is ready. Preview it, then approve your hero again."
      : job.status === "unsupported"
        ? "This hero will keep its gentle movement. Its shape doesn’t support this animation set."
        : job.status === "uncertain"
          ? "This animation submission needs review in your Tripo console."
          : job.status === "failed"
            ? "Animation couldn’t finish. Your existing hero is still available."
            : job.status === "asset_retry"
              ? "The animation is made; local delivery needs attention."
              : stage;
  const canAttempt =
    !active && job?.status !== "ready" && job?.status !== "unsupported";
  return (
    <section
      className="paper-panel"
      aria-labelledby="hero-motion-heading"
      style={{ marginBottom: 20 }}
    >
      <p className="eyebrow">MOVEMENT & LITTLE REACTIONS</p>
      <h2 id="hero-motion-heading">A little more alive.</h2>
      <p>
        {procedural
          ? "Pip has handmade steps and happy gestures. Try them here, then watch Pip celebrate as the adventure unfolds."
          : "Give a compatible hero a walk and little reactions when the bell gate opens, the star is found, and the gift is delivered."}
      </p>
      <div
        className="section-actions"
        role="group"
        aria-label="Preview hero movements"
      >
        {(
          [
            ["idle", "Idle"],
            ["walk", "Walk"],
            ["celebrate", "Celebrate"],
          ] as const
        ).map(([motion, label]) => (
          <button
            key={motion}
            className={`button ${previewMotion === motion ? "primary" : "secondary"}`}
            disabled={!loaded}
            aria-label={`Preview ${motion === "celebrate" ? "celebration" : motion}`}
            aria-pressed={previewMotion === motion}
            onClick={() => onPreview(motion)}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="note">
        Preview buttons only play motion; they never use credits. Available
        moves depend on the hero’s shape. Heroes without a matching move keep
        their selected bounce, float or sway. Reduced motion keeps the pose
        still.
      </p>
      {!procedural && (
        <>
          {job && (
            <div className="status-card" aria-live="polite" aria-atomic="true">
              <strong>{status}</strong>
              {active && job.progress != null && (
                <progress
                  max={100}
                  value={job.progress}
                  aria-label="Current animation step progress"
                />
              )}
              {job.lastError && <p className="note">{job.lastError}</p>}
              {active && (
                <p className="note">
                  You can leave and resume this draft. Your existing hero
                  remains available while we work.
                </p>
              )}
            </div>
          )}
          {canAttempt && available && (
            <>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                  disabled={busy}
                />
                I agree to use Tripo credits for rigging and animation.
              </label>
              <p className="note">
                This requests a compatibility check, rigging, and an animation
                set. Credits may be used for each provider step. A new attempt
                may use credits again; check uncertain submissions in Tripo
                first.
              </p>
              {!unlocked && (
                <p className="note">
                  Unlock creation in “Bring it to life” before requesting
                  animation.
                </p>
              )}
              <button
                className="button primary"
                disabled={busy || !loaded || !unlocked || !consent}
                onClick={() => onAnimate(!!job)}
              >
                {job ? "Try animation again" : "Bring my hero to life"}
              </button>
            </>
          )}
          {!available && !active && (
            <p className="note">
              Connect Tripo to add motion to a generated hero.
            </p>
          )}
          <div className="section-actions">
            <button
              className="button text-button"
              disabled={busy}
              onClick={onRefresh}
            >
              Check animation status
            </button>
          </div>
        </>
      )}
    </section>
  );
}
