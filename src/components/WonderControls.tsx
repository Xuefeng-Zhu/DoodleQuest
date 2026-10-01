"use client";
import { useRef, useState } from "react";
import { Cloud, Flower2, Sparkles, X } from "lucide-react";
import { useGame } from "./game/store";
import { wonderIds, wonderMessages, type Wonder } from "@/domain/wonders";

const labels: Record<Wonder, string> = {
  flower: "Say hello to the flower",
  cloud: "Give the cloud a tickle",
  butterfly: "Invite the butterfly along",
};
const icons = { flower: Flower2, cloud: Cloud, butterfly: Sparkles };
export default function WonderControls({ textOnly }: { textOnly: boolean }) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const wonders = useGame((s) => s.wonders);
  const paused = useGame((s) => s.game.paused);
  const discover = useGame((s) => s.discover);
  const close = () => {
    setOpen(false);
    toggle.current?.focus({ preventScroll: true });
  };
  return (
    <section
      className="little-wonders"
      aria-label="Little wonders"
      data-flower={wonders.flower}
      data-cloud={wonders.cloud}
      data-butterfly={wonders.butterfly}
      inert={paused}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={toggle}
        className="wonders-toggle"
        aria-expanded={open}
        aria-controls="wonder-choices"
        onClick={() => setOpen(!open)}
        disabled={paused}
      >
        {open ? (
          <X size={15} aria-hidden="true" />
        ) : (
          <Flower2 size={15} aria-hidden="true" />
        )}
        Little wonders
      </button>
      {open && (
        <div
          className="wonder-choices"
          id="wonder-choices"
          role="group"
          aria-label="Optional discoveries"
        >
          <p>
            {textOnly
              ? "Little moments, told in words."
              : "Off the path, a little hello."}
            <br />
            Nothing to collect. No hurry.
          </p>
          {wonderIds.map((id) => {
            const Icon = icons[id];
            return (
              <button
                key={id}
                disabled={paused || wonders[id]}
                onClick={() => {
                  discover(id);
                  close();
                }}
              >
                <Icon size={17} aria-hidden="true" />
                {labels[id]}
              </button>
            );
          })}
        </div>
      )}
      <p className="wonder-notice" aria-live="polite" aria-atomic="true">
        {wonders.latest ? wonderMessages[wonders.latest] : ""}
      </p>
    </section>
  );
}
