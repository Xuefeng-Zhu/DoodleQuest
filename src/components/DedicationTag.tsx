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
    opening: "For the journey",
    carried: "For the journey",
    letter: "A note to keep",
    preview: "For the journey",
  };
  return (
    <div
      className={`dedication-tag dedication-${variant}`}
      data-dedication={variant}
      aria-hidden={variant === "carried" ? true : undefined}
    >
      <div>
        <span className="dedication-caption">{captions[variant]}</span>
        <p>{text.trim()}</p>
      </div>
    </div>
  );
}
