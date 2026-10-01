import { Star } from "lucide-react";

/** One creator-authored phrase, never rewritten or used to change quest rules. */
export default function DedicationTag({
  text,
  variant,
}: {
  text?: string;
  variant: "opening" | "carried" | "letter" | "preview";
}) {
  if (!text?.trim()) return null;
  const captions = {
    opening: "A little thought to carry",
    carried: "Carrying a little thought",
    letter: "A little thought, carried all this way",
    preview: "Their little thought to carry",
  };
  return (
    <div
      className={`dedication-tag dedication-${variant}`}
      data-dedication={variant}
      aria-hidden={variant === "carried" ? true : undefined}
    >
      <Star size={15} aria-hidden="true" />
      <div>
        <span className="dedication-caption">{captions[variant]}</span>
        <p>{text.trim()}</p>
      </div>
    </div>
  );
}
