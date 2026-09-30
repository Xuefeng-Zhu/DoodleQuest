"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Gift } from "@/domain/config";
import Game from "./Game";
import { api } from "./Creator";
export default function GiftLoader({
  id,
  preview = false,
}: {
  id: string;
  preview?: boolean;
}) {
  const [gift, setGift] = useState<Gift | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    api(`${preview ? "projects" : "gifts"}/${id}`)
      .then((p) => {
        if (preview && !p.approved)
          throw new Error("Approve your hero before previewing the gift.");
        setGift(p);
      })
      .catch((e) => setError(e.message));
  }, [id, preview]);
  if (error)
    return (
      <main className="empty-page">
        <span className="ending-star">✧</span>
        <h1>This little world is resting.</h1>
        <p>{error}</p>
        <Link className="button secondary" href="/example">
          Play the example instead
        </Link>
      </main>
    );
  return gift ? (
    <>
      <Game gift={gift} preview={preview} />
      {preview && (
        <Link href="/create" className="preview-note">
          Creator preview · back to workshop →
        </Link>
      )}
    </>
  ) : (
    <div className="empty-page">Unwrapping a little world…</div>
  );
}
