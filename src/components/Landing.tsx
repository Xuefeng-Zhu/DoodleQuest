"use client";
import Link from "next/link";
import {
  ArrowRight,
  Play,
  Heart,
  PenLine,
  Sparkles,
  Gift as GiftIcon,
} from "lucide-react";
import Scene from "./Scene";
import WorldBackdrop from "./WorldBackdrop";
import { example } from "@/domain/config";
import Header from "./Header";
export default function Landing() {
  return (
    <>
      <Header />
      <main>
        <section className="landing-hero">
          <div className="hero-copy">
            <p className="eyebrow">
              <span /> SMALL DRAWINGS. BIG LITTLE WORLDS.
            </p>
            <h1>
              Your drawing
              <br />
              deserves
              <br />
              <em>a world.</em>
              <span className="doodle-spark">✧</span>
            </h1>
            <p className="hero-description">
              Turn a one-of-a-kind drawing into a tiny playable gift. A little
              adventure. A personal message. A whole lot of heart.
            </p>
            <div className="hero-actions">
              <Link className="button primary" href="/create">
                Create a gift <ArrowRight size={18} />
              </Link>
              <Link className="button text-button" href="/example">
                <Play size={16} fill="currentColor" /> Play an example
              </Link>
            </div>
            <p className="fine-print">
              <Heart size={13} /> Made by you. Meant for someone.
            </p>
          </div>
          <div className="hero-art">
            <WorldBackdrop palette={example.config.palette} preview />
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="scene-window">
              <Scene gift={example} mini />
            </div>
            <div className="drawing-note">
              <span className="tape" />
              <img
                src="/sample-drawing.png"
                alt="Original mint bunny drawing, Pip, with a yellow scarf"
              />
              <span>It started with a doodle.</span>
            </div>
            <div className="scene-caption">
              <span className="tiny-star">✦</span> Meet Pip’s little world{" "}
              <span className="muted">drag to peek around</span>
            </div>
            <span className="handwritten art-note">
              imagination lives here ↙
            </span>
          </div>
        </section>
        <section className="journey-strip" aria-label="How it works">
          <div className="strip-intro">
            From the fridge door
            <br />
            <em>to a world of their own.</em>
          </div>
          {[
            [
              PenLine,
              "01",
              "A drawing with character",
              "Upload a doodle. Keep its personality.",
            ],
            [
              Sparkles,
              "02",
              "A little leap into 3D",
              "Meet a new interpretation of your hero.",
            ],
            [
              GiftIcon,
              "03",
              "An adventure to give",
              "Add a note. Share a moment.",
            ],
          ].map(([Icon, n, title, desc]) => {
            const I = Icon as typeof PenLine;
            return (
              <div className="journey-item" key={String(n)}>
                <span className="journey-icon">
                  <I size={21} />
                </span>
                <div>
                  <span className="step-number">{String(n)}</span>
                  <h2>{String(title)}</h2>
                  <p>{String(desc)}</p>
                </div>
              </div>
            );
          })}
        </section>
        <footer className="site-footer">
          <span>A little world. A lasting feeling.</span>
          <span>Adult-created · No recipient account · Unlisted gifts</span>
          <span>Example hero is procedural, not Tripo-generated.</span>
        </footer>
      </main>
    </>
  );
}
