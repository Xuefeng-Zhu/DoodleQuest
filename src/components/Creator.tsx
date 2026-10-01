"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Upload,
  ArrowRight,
  RotateCw,
  Crop,
  Check,
  Copy,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import Header from "./Header";
import DedicationTag from "./DedicationTag";
import GiftWrapping, {
  UnconfirmedPublication,
  type WrappedGift,
} from "./GiftWrapping";
import {
  DEDICATION_LIMIT,
  defaults,
  palettes,
  type GiftConfig,
  type Gift,
} from "@/domain/config";
const HeroPreview = dynamic(() => import("./HeroPreview"), {
  ssr: false,
  loading: () => <div className="scene-loading">Opening the preview…</div>,
});
type Job = {
  id: string;
  status: string;
  providerStatus: string | null;
  providerId: string | null;
  progress: number | null;
  lastError: string | null;
  createdAt: number;
  attempts: number;
  inputRevision: number;
  finalAsset: string | null;
  model: string;
};
type Project = {
  id: string;
  config: GiftConfig;
  inputAsset: string | null;
  modelAsset: string | null;
  revision: number;
  source: Gift["source"];
  approved: number;
  drawingUrl: string | null;
  modelUrl: string | null;
  job: Job | null;
  shares: { id: string; token: string; version: number; revoked: number }[];
};
const states: Record<string, string> = {
  pending: "Waiting for the worker",
  uploading: "Sending the drawing to Tripo",
  submitting: "Requesting a 3D interpretation",
  queued: "Queued at Tripo",
  generating: "Tripo is creating your interpretation",
  polling: "Checking the saved task",
  downloading: "Bringing your model home",
  asset_retry: "The model is made; local delivery needs attention",
  ready: "Your interpretation is ready",
  failed: "This attempt couldn’t finish",
  uncertain: "This submission needs your review",
};
const working = [
  "pending",
  "uploading",
  "submitting",
  "queued",
  "generating",
  "polling",
  "downloading",
  "asset_retry",
];
export async function api(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
) {
  const r = await fetch("/api/" + path, {
    method,
    headers:
      body instanceof FormData
        ? undefined
        : body
          ? { "Content-Type": "application/json" }
          : undefined,
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
let sessionFlight: Promise<{ unlocked: boolean }> | undefined;
function ensureSession() {
  return (sessionFlight ??= api("session", "POST").finally(() => {
    sessionFlight = undefined;
  }));
}
export default function Creator() {
  const [booting, setBooting] = useState(true);
  const [mode, setMode] = useState("example"),
    [unlocked, setUnlocked] = useState(false),
    [code, setCode] = useState(""),
    [project, setProject] = useState<Project | null>(null),
    [drafts, setDrafts] = useState<Project[]>([]),
    [config, setConfig] = useState<GiftConfig>(defaults),
    [step, setStep] = useState(0),
    [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState(""),
    [rotation, setRotation] = useState(0),
    [crop, setCrop] = useState(false),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loaded, setLoaded] = useState(false),
    [dragging, setDragging] = useState(false),
    [deleting, setDeleting] = useState(false),
    [elapsed, setElapsed] = useState(0);
  const dirty = useRef(false);
  const key = useRef("");
  const [wrapping, setWrapping] = useState(false);
  const wrappingBaseline = useRef<string[]>([]);
  const apply = (p: Project, replaceConfig = true) => {
    setProject(p);
    if (replaceConfig) {
      setConfig(p.config);
      dirty.current = false;
    }
    localStorage.setItem("dq_draft", p.id);
  };
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const session = await ensureSession();
        const m = await api("mode");
        const all = await api("projects");
        if (!alive) return;
        setMode(m.mode);
        setUnlocked(session.unlocked);
        setDrafts(all);
        setBooting(false);
        const id =
          new URLSearchParams(location.search).get("draft") ||
          localStorage.getItem("dq_draft");
        const existing = all.find((p: Project) => p.id === id);
        if (existing) {
          apply(existing);
          setStep(
            existing.approved
              ? 3
              : existing.inputAsset
                ? existing.modelAsset || existing.source === "procedural"
                  ? 2
                  : 1
                : 0,
          );
        }
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    let bitmap: ImageBitmap | undefined;
    (async () => {
      try {
        bitmap = await createImageBitmap(file);
        if (bitmap.width * bitmap.height > 24_000_000)
          throw new Error(
            "This image is too large to preview. Please use at most 24 megapixels.",
          );
        const w = rotation % 180 ? bitmap.height : bitmap.width,
          h = rotation % 180 ? bitmap.width : bitmap.height;
        const visibleW = crop ? Math.min(w, h) : w,
          visibleH = crop ? Math.min(w, h) : h;
        const scale = Math.min(1, 1024 / Math.max(visibleW, visibleH));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(visibleW * scale);
        canvas.height = Math.round(visibleH * scale);
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#fffdf4";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(scale, scale);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/png"),
        );
        if (blob && !cancelled) setPreview(URL.createObjectURL(blob));
      } catch {
        /* The server remains the authoritative content validator. */
      } finally {
        bitmap?.close();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file, rotation, crop]);
  useEffect(() => {
    if (!project?.job || !working.includes(project.job.status)) return;
    const timer = setInterval(async () => {
      try {
        const p = await api(`projects/${project.id}`);
        setProject(p);
        setElapsed(Math.floor((Date.now() - p.job.createdAt) / 1000));
        if (p.job.status === "ready") setStep(2);
      } catch (e) {
        setError((e as Error).message);
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [project?.id, project?.job?.status]);
  const ready = useCallback(() => setLoaded(true), []),
    failed = useCallback(() => {
      setLoaded(false);
      setError(
        "The stored model could not be opened. Reload to try again; no generation was started.",
      );
    }, []);
  const run = async (fn: () => Promise<void>) => {
    if (booting) {
      setNotice(
        "Preparing your private creator session. Please try again in a moment.",
      );
      return;
    }
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const ensure = async () => {
    if (project) return project;
    const p = await api("projects", "POST");
    apply(p);
    return p as Project;
  };
  const save = async () => {
    const p = await ensure();
    const next = await api(`projects/${p.id}`, "PATCH", config);
    apply(next);
    setNotice("Your words are saved in this browser’s draft.");
    return next as Project;
  };
  const change = <K extends keyof GiftConfig>(
    field: K,
    value: GiftConfig[K],
  ) => {
    dirty.current = true;
    setConfig((c) => ({ ...c, [field]: value }));
  };
  const choose = (f?: File) => {
    if (!f) return;
    if (
      !["image/jpeg", "image/png"].includes(f.type) ||
      f.size > 10 * 1024 * 1024
    ) {
      setError("Choose a JPEG or PNG smaller than 10 MB.");
      return;
    }
    setError("");
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setRotation(0);
    setCrop(false);
  };
  const upload = async (sample = false) => {
    const p = await ensure();
    const f = new FormData();
    if (sample) f.set("sample", "true");
    else if (file) f.set("file", file);
    else throw new Error("Choose a drawing first.");
    f.set("rotation", String(rotation));
    f.set("crop", String(crop));
    const next = await api(`projects/${p.id}/drawing`, "POST", f);
    apply(next);
    setLoaded(false);
    setStep(sample ? 2 : 1);
    setNotice(
      sample
        ? "Pip is our handmade procedural example, not a Tripo-generated character."
        : "Your drawing is saved.",
    );
  };
  const generate = async (retry = false) => {
    if (!project) return;
    if (!consent) throw new Error("Please acknowledge the Tripo upload first.");
    await save();
    key.current = crypto.randomUUID();
    await api(`projects/${project.id}/generate`, "POST", {
      key: key.current,
      consent: true,
      retry,
    });
    apply(await api(`projects/${project.id}`));
    setLoaded(false);
    setStep(1);
  };
  const publishWrappedGift = async (
    stage: (phase: "saving" | "publishing") => void,
  ): Promise<WrappedGift> => {
    if (!project) throw new Error("Open your saved draft first.");
    setBusy(true);
    setError("");
    setNotice("");
    let submitted = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      stage("saving");
      const p: Project = await api(
        `projects/${project.id}`,
        "PATCH",
        config,
        controller.signal,
      );
      apply(p);
      stage("publishing");
      submitted = true;
      const receipt = await api(
        `projects/${p.id}/publish`,
        "POST",
        undefined,
        controller.signal,
      );
      // A confirmed response is enough; a follow-up refresh must not turn a
      // successful publication into a misleading failure or another publish.
      apply({
        ...p,
        shares: [
          ...p.shares,
          {
            id: receipt.id,
            token: receipt.token,
            version: receipt.version,
            revoked: 0,
          },
        ],
      });
      return {
        id: receipt.id,
        token: receipt.token,
        version: receipt.version,
        config: p.config,
      };
    } catch (e) {
      if (submitted)
        throw new UnconfirmedPublication(
          "We couldn’t confirm the gift link. It may already be saved. Check saved links before publishing again; we won’t automatically make another version.",
        );
      throw new Error(
        e instanceof Error && !["AbortError", "TypeError"].includes(e.name)
          ? e.message
          : "We couldn’t confirm your latest words were saved. Please check your connection and try again. Nothing was published by this attempt.",
      );
    } finally {
      clearTimeout(timeout);
      setBusy(false);
    }
  };
  const checkWrappedGift = async (): Promise<WrappedGift | null> => {
    if (!project) return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    setBusy(true);
    try {
      const p: Project = await api(
        `projects/${project.id}`,
        "GET",
        undefined,
        controller.signal,
      );
      apply(p, false);
      const found = [...p.shares]
        .sort((a, b) => b.version - a.version)
        .find((s) => !s.revoked && !wrappingBaseline.current.includes(s.id));
      if (!found) return null;
      // Read the actual published configuration, not potentially newer draft words.
      const saved: Gift = await api(
        `gifts/${found.token}`,
        "GET",
        undefined,
        controller.signal,
      );
      return { ...found, config: saved.config };
    } finally {
      clearTimeout(timeout);
      setBusy(false);
    }
  };
  const gift: Gift = {
    config,
    modelUrl: project?.modelUrl || undefined,
    drawingUrl: project?.drawingUrl || undefined,
    source: project?.source || "procedural",
    version: 1,
  };
  const fields = (
    <div className="field-grid">
      <label>
        For someone special
        <input
          value={config.recipient}
          maxLength={50}
          onChange={(e) => change("recipient", e.target.value)}
          placeholder="Recipient display name"
        />
      </label>
      <label>
        Made by
        <input
          value={config.creator}
          maxLength={50}
          onChange={(e) => change("creator", e.target.value)}
          placeholder="Your name or nickname"
        />
      </label>
      <label className="wide">
        Adventure title
        <input
          value={config.title}
          maxLength={80}
          onChange={(e) => change("title", e.target.value)}
        />
      </label>
      <div className="wide dedication-field">
        <label htmlFor="dedication">A little saying (optional)</label>
        <input
          id="dedication"
          value={config.dedication}
          maxLength={DEDICATION_LIMIT}
          placeholder="To the moon and back"
          aria-describedby="dedication-help dedication-count"
          onChange={(e) => change("dedication", e.target.value)}
        />
        <p className="note" id="dedication-help">
          A shared saying, a tiny memory, an inside joke. It travels from the
          opening to the star, then into their letter. Visible from the start;
          keep personal information out. Leave blank to skip.
        </p>
        <span className="note" id="dedication-count">
          {config.dedication.length}/{DEDICATION_LIMIT}
        </span>
        <DedicationTag text={config.dedication} variant="preview" />
      </div>
      <label className="wide">
        A note at the end
        <textarea
          value={config.message}
          maxLength={1200}
          onChange={(e) => change("message", e.target.value)}
        />
        <span className="note">
          {config.message.length}/1200 · A few heartfelt words are plenty.
        </span>
      </label>
    </div>
  );
  return (
    <>
      <Header />
      <main className="creator-shell">
        <div className="creator-heading">
          <div>
            <p className="eyebrow">THE LITTLE GIFT WORKSHOP</p>
            <h1>Let’s make their day.</h1>
            <p>
              A character only you could imagine. A note only you could write.
              <br />
              Put a little of yourself into their world.
            </p>
          </div>
          <span className="mode-label">
            {mode === "live"
              ? "Tripo connected · paid generation"
              : mode === "mock"
                ? "TEST MODE · mocked provider"
                : "Example mode · no Tripo key"}
          </span>
        </div>
        <nav className="steps" aria-label="Gift creation steps">
          {[
            "Your drawing",
            "Bring it to life",
            "Meet your hero",
            "Make it personal",
            "Preview & share",
          ].map((s, i) => (
            <button
              key={s}
              className={step === i ? "active" : ""}
              onClick={() => setStep(i)}
              disabled={
                (i > 0 && !project?.inputAsset) || (i > 2 && !project?.approved)
              }
            >
              <span>{i + 1}</span>
              {s}
            </button>
          ))}
        </nav>
        {error && (
          <p className="error-note" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="success-note" role="status">
            {notice}
          </p>
        )}
        {step === 0 && (
          <div className="creator-grid">
            <section>
              {!file ? (
                <div
                  className={`drop-area ${dragging ? "dragging" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    choose(e.dataTransfer.files[0]);
                  }}
                >
                  <div className="drop-icon">
                    <Upload size={26} />
                  </div>
                  <h3>A little doodle goes a long way.</h3>
                  <p>
                    Drop your drawing here, or choose a photo.
                    <br />
                    JPEG or PNG · up to 10 MB
                  </p>
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    aria-label="Choose a drawing"
                    onChange={(e) => choose(e.target.files?.[0])}
                  />
                </div>
              ) : (
                <>
                  <div className="image-preview">
                    <img
                      src={preview}
                      alt="Your drawing crop preview"
                      style={{
                        objectFit: "contain",
                      }}
                    />
                  </div>
                  <div className="tool-row">
                    <button onClick={() => setRotation((r) => (r + 90) % 360)}>
                      <RotateCw size={15} /> Rotate
                    </button>
                    <button aria-pressed={crop} onClick={() => setCrop(!crop)}>
                      <Crop size={15} />{" "}
                      {crop ? "Square crop on" : "Square crop"}
                    </button>
                    <button
                      onClick={() => {
                        setFile(null);
                        setPreview("");
                      }}
                    >
                      Choose another
                    </button>
                  </div>
                  <button
                    className="button primary"
                    style={{ marginTop: 20 }}
                    disabled={busy || booting}
                    onClick={() => run(() => upload())}
                  >
                    Save this drawing <ArrowRight size={17} />
                  </button>
                </>
              )}
              <div className="sample-pick">
                <img
                  src="/sample-drawing.png"
                  alt="Pip, our original sample drawing"
                />
                <div>
                  <button
                    disabled={busy || booting}
                    onClick={() => run(() => upload(true))}
                  >
                    Try it with our Pip drawing →
                  </button>
                  <p>Includes a clearly labeled procedural hero.</p>
                </div>
              </div>
            </section>
            <section className="paper-panel">
              <p className="eyebrow">A GOOD PLACE TO BEGIN</p>
              <h2>
                One character.
                <br />
                Endless personality.
              </h2>
              <p>
                One character, clearly visible, works best. A plain background
                helps. Scribbly ears and wonderfully wonky smiles are welcome.
              </p>
              <p>
                This is a workshop for adult creators. Please don’t upload
                names, school details, faces, or other personal information
                about a child.
              </p>
              <p className="note">
                Your drawing stays in your owner-only draft until you choose to
                share it. Live generation sends it to Tripo after your
                acknowledgement.
              </p>
              {drafts.length > 0 && (
                <div className="draft-list">
                  <h3>Pick up a little work in progress</h3>
                  {drafts.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        apply(p);
                        setStep(p.approved ? 3 : p.inputAsset ? 2 : 0);
                      }}
                    >
                      {p.config.title} · {p.config.heroName}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      setProject(null);
                      setConfig(defaults);
                      setStep(0);
                      localStorage.removeItem("dq_draft");
                    }}
                  >
                    Start a fresh gift
                  </button>
                </div>
              )}
            </section>
          </div>
        )}
        {step === 1 && (
          <div className="creator-grid">
            <section>
              <div className="image-preview">
                {project?.drawingUrl && (
                  <img src={project.drawingUrl} alt="Saved original drawing" />
                )}
              </div>
              <p className="asset-label">
                Your drawing stays part of the story.
              </p>
              <div className="status-card">
                <strong>
                  {project?.job
                    ? states[project.job.status] || project.job.status
                    : "Ready for its little leap into 3D"}
                </strong>
                {project?.job?.progress != null && (
                  <progress
                    max={100}
                    value={project.job.progress}
                    aria-label="Provider reported progress"
                  />
                )}
                <p>
                  {project?.job
                    ? `${elapsed || Math.floor((Date.now() - project.job.createdAt) / 1000)} seconds since this attempt began. You can leave and resume this draft.`
                    : "A new 3D interpretation, not an exact reconstruction. Generation time varies."}
                </p>
                {project?.job?.lastError && (
                  <p className="error-note">{project.job.lastError}</p>
                )}
              </div>
              {mode === "example" ? (
                <p className="error-note">
                  Custom generation is unavailable without a Tripo key. Your
                  upload will not be replaced with Pip. You can keep this draft
                  or choose the labeled sample.
                </p>
              ) : (
                <>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                    />
                    I’m an adult creator and understand this drawing will be
                    sent to Tripo for generation, which may consume credits.
                  </label>
                  {!unlocked && (
                    <div className="share-row">
                      <label>
                        Creator access code
                        <input
                          type="password"
                          value={code}
                          onChange={(e) => setCode(e.target.value)}
                          autoComplete="off"
                        />
                      </label>
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            await api("unlock", "POST", { code });
                            setUnlocked(true);
                            setCode("");
                          })
                        }
                      >
                        Unlock creation
                      </button>
                    </div>
                  )}
                  <button
                    className="button primary"
                    disabled={
                      busy ||
                      !consent ||
                      !unlocked ||
                      (!!project?.job && working.includes(project.job.status))
                    }
                    onClick={() => run(() => generate(!!project?.job))}
                  >
                    <Sparkles size={17} />
                    {project?.job
                      ? "Start another paid attempt"
                      : "Create 3D interpretation"}
                  </button>
                  {project?.job && (
                    <p className="note">
                      Another attempt may consume credits. For an uncertain
                      submission, check your Tripo console first. Downloads
                      retry without regenerating.
                    </p>
                  )}
                </>
              )}
            </section>
            <section className="paper-panel">
              <p className="eyebrow">WHILE A LITTLE MAGIC HAPPENS</p>
              <h2>Who is this world for?</h2>
              <p>
                You don’t have to wait here. Write your note now; the worker
                will keep the generation moving.
              </p>
              {fields}
              <button
                className="button secondary"
                style={{ marginTop: 20 }}
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await save();
                  })
                }
              >
                Save my words
              </button>
              <p className="note">
                Resume from this browser. Keep its cookies to retain ownership.
              </p>
            </section>
          </div>
        )}
        {step === 2 && (
          <>
            <div className="side-by-side">
              <section>
                <div className="image-preview">
                  {project?.drawingUrl && (
                    <img src={project.drawingUrl} alt="Original drawing" />
                  )}
                </div>
                <p className="asset-label">
                  THE ORIGINAL · always part of its story
                </p>
              </section>
              <section>
                <div className="hero-preview">
                  {project?.modelAsset || project?.source === "procedural" ? (
                    <HeroPreview
                      key={project?.modelAsset || project?.inputAsset}
                      gift={gift}
                      onReady={ready}
                      onFailure={failed}
                    />
                  ) : (
                    <div className="scene-loading">
                      Your custom model is not ready yet. Return to “Bring it to
                      life.”
                    </div>
                  )}
                </div>
                <p className="asset-label">
                  {project?.source === "procedural"
                    ? "PROCEDURAL EXAMPLE · not generated by Tripo"
                    : project?.source === "mock"
                      ? "TEST FIXTURE · not a live Tripo result"
                      : "3D INTERPRETATION · made with Tripo"}{" "}
                  · drag to rotate
                </p>
              </section>
            </div>
            <section className="paper-panel">
              <div className="field-grid">
                <label>
                  What’s your hero called?
                  <input
                    value={config.heroName}
                    maxLength={32}
                    onChange={(e) => change("heroName", e.target.value)}
                  />
                </label>
                <label>
                  A little personality
                  <select
                    value={config.movement}
                    onChange={(e) =>
                      change(
                        "movement",
                        e.target.value as GiftConfig["movement"],
                      )
                    }
                  >
                    <option value="bounce">A cheerful bounce</option>
                    <option value="float">A dreamy float</option>
                    <option value="sway">A gentle sway</option>
                  </select>
                </label>
                <label className="wide">
                  Which way is forward? {config.forward}°
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    step="15"
                    value={config.forward}
                    onChange={(e) => change("forward", Number(e.target.value))}
                  />
                </label>
              </div>
              <div className="section-actions">
                <button
                  className="button primary"
                  disabled={busy || !loaded}
                  onClick={() =>
                    run(async () => {
                      const p = await save();
                      apply(
                        await api(`projects/${p.id}/approve`, "POST", {
                          loaded: true,
                        }),
                      );
                      setStep(3);
                    })
                  }
                >
                  <Check size={17} /> That’s my hero
                </button>
                {project?.source !== "procedural" && (
                  <button
                    className="button text-button"
                    onClick={() => setStep(1)}
                  >
                    Request another attempt
                  </button>
                )}
              </div>
              <p className="note">
                Approval uses the model you can see. A loading problem will
                never trigger paid regeneration.
              </p>
            </section>
          </>
        )}
        {step === 3 && (
          <div className="creator-grid">
            <section className="paper-panel">
              <h2>Make it unmistakably yours.</h2>
              {fields}
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={config.showDrawing}
                  onChange={(e) => change("showDrawing", e.target.checked)}
                />
                Show the original drawing to the recipient
              </label>
              <p className="note">
                Off by default. Enabling this includes the drawing in the
                opening reveal and the ending. Preview both before sharing.
              </p>
              <div className="section-actions">
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await save();
                      setStep(4);
                    })
                  }
                >
                  Save & preview <ArrowRight size={17} />
                </button>
              </div>
            </section>
            <section>
              <h2>The same world, a different glow.</h2>
              <p className="note">
                Three palettes. One lovingly built little island.
              </p>
              <div className="palette-row">
                {Object.entries(palettes).map(([name, c]) => (
                  <button
                    key={name}
                    aria-pressed={config.palette === name}
                    onClick={() =>
                      change("palette", name as GiftConfig["palette"])
                    }
                  >
                    <i
                      style={{
                        background: `linear-gradient(90deg,${c.grass} 0 40%,${c.flower} 40% 70%,${c.sky} 70%)`,
                      }}
                    />
                    {name[0].toUpperCase() + name.slice(1)}
                  </button>
                ))}
              </div>
              <div
                className="hero-preview"
                style={{
                  marginTop: 20,
                  background: palettes[config.palette].sky,
                }}
              >
                <HeroPreview gift={gift} onReady={ready} onFailure={failed} />
              </div>
              <p className="asset-label">
                {config.heroName} has a special delivery for {config.recipient}.
              </p>
            </section>
          </div>
        )}
        {step === 4 && (
          <div className="creator-grid">
            <section className="paper-panel">
              <p className="eyebrow">THE NOTE AT THE END</p>
              <h2>For {config.recipient}</h2>
              <p className="personal-message">{config.message}</p>
              <p>With love, {config.creator}</p>
              <DedicationTag text={config.dedication} variant="letter" />
              <p className="note">
                {config.showDrawing
                  ? "The original drawing is included in the reveal and ending."
                  : "The original drawing is not shared."}
              </p>
              <div className="section-actions">
                <Link
                  className="button secondary"
                  href={`/preview/${project?.id}`}
                >
                  <ExternalLink size={16} /> Play the whole adventure
                </Link>
                <button
                  className="button text-button"
                  onClick={() => setStep(3)}
                >
                  Edit the note
                </button>
              </div>
            </section>
            <section className="paper-panel">
              <h2>A world, ready to give.</h2>
              <p>
                Publish an unlisted, read-only gift. Anyone with the link can
                open it. No recipient account needed.
              </p>
              <p className="note">
                Each publish makes an immutable snapshot. Later draft edits
                won’t change links you already shared.
              </p>
              <button
                className="button primary"
                disabled={busy || !project?.approved}
                onClick={() => {
                  wrappingBaseline.current =
                    project?.shares.map((s) => s.id) || [];
                  setWrapping(true);
                }}
              >
                Wrap this gift <ArrowRight size={17} />
              </button>
              <p className="note wrap-invitation">
                A final look. A ribbon. Ready for someone special.
              </p>
              {project?.shares.map((s) => (
                <div key={s.id} style={{ marginTop: 20 }}>
                  <span className="note">
                    Gift version {s.version} ·{" "}
                    {s.revoked ? "revoked" : "unlisted snapshot"}
                  </span>
                  {!s.revoked && (
                    <>
                      <div className="share-row">
                        <input
                          aria-label={`Gift link version ${s.version}`}
                          readOnly
                          value={`${typeof location === "undefined" ? "" : location.origin}/gift/${s.token}`}
                        />
                        <button
                          className="button secondary"
                          aria-label={`Copy gift link version ${s.version}`}
                          onClick={() =>
                            run(async () => {
                              await navigator.clipboard.writeText(
                                `${location.origin}/gift/${s.token}`,
                              );
                              setNotice("Gift link copied.");
                            })
                          }
                        >
                          <Copy size={15} />
                        </button>
                        <Link
                          className="button secondary"
                          href={`/gift/${s.token}`}
                        >
                          Open
                        </Link>
                      </div>
                      <button
                        className="danger"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            await api(
                              `projects/${project?.id}/revoke`,
                              "POST",
                              { shareId: s.id },
                            );
                            apply(await api(`projects/${project?.id}`));
                          })
                        }
                      >
                        Revoke this link
                      </button>
                    </>
                  )}
                </div>
              ))}
            </section>
          </div>
        )}
        {wrapping && project && (
          <GiftWrapping
            config={config}
            onPublish={publishWrappedGift}
            onCheck={checkWrappedGift}
            onClose={() => setWrapping(false)}
          />
        )}
        {project && (
          <>
            <details className="provenance">
              <summary>Behind this little world · asset provenance</summary>
              <pre>
                {JSON.stringify(
                  {
                    drawingAsset: project.inputAsset,
                    inputRevision: project.revision,
                    source: project.source,
                    generationTask:
                      project.job?.providerId ||
                      "No provider task (procedural example)",
                    providerStatus: project.job?.providerStatus,
                    applicationStatus: project.job?.status,
                    modelVersion: project.job?.model,
                    storedModel: project.modelAsset,
                    playableHero: config.heroName,
                    approved: !!project.approved,
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
            <div className="section-actions">
              <button
                className="button text-button"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await save();
                  })
                }
              >
                Save draft for later
              </button>
              <button className="danger" onClick={() => setDeleting(!deleting)}>
                Delete project
              </button>
            </div>
            {deleting && (
              <div className="confirm-delete">
                <p>
                  Delete this project, local drawings, models, and all its gift
                  links? This cannot be undone. It does not promise deletion
                  from Tripo.
                </p>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await api(`projects/${project.id}`, "DELETE");
                      localStorage.removeItem("dq_draft");
                      setProject(null);
                      setDrafts((d) => d.filter((p) => p.id !== project.id));
                      setConfig(defaults);
                      setStep(0);
                      setDeleting(false);
                      setNotice(
                        "Project, local assets, and shared access deleted.",
                      );
                    })
                  }
                >
                  Yes, delete this project
                </button>
                <button
                  className="button text-button"
                  onClick={() => setDeleting(false)}
                >
                  Keep my gift
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
