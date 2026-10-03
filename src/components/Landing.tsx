"use client";
import Link from "next/link";
import { ArrowRight, MoveUpRight } from "lucide-react";
import Scene from "./Scene";
import WorldBackdrop from "./WorldBackdrop";
import { example } from "@/domain/config";
import Header from "./Header";
import styles from "./Landing.module.css";

const steps = [
  [
    "01",
    "Start with a drawing",
    "A photo of a character from a sketchbook is enough.",
  ],
  [
    "02",
    "Meet the character",
    "See it in 3D. Adjust it, then approve the version you like.",
  ],
  [
    "03",
    "Make it a gift",
    "Add a personal note and share the adventure with a link.",
  ],
];
export default function Landing() {
  return (
    <>
      <Header />
      <main className={styles.page}>
        <section className={styles.hero} aria-labelledby="landing-title">
          <div className={styles.copy}>
            <p className={styles.kicker}>
              A drawing. A character. An adventure.
            </p>
            <h1 id="landing-title">
              A world for
              <br />
              your drawing.
            </h1>
            <p className={styles.description}>
              Turn a drawing into a 3D character, then send it on a short
              adventure with a note from you.
            </p>
            <div className={styles.actions}>
              <Link className="button primary" href="/create">
                Create a gift <ArrowRight size={17} />
              </Link>
              <Link className={styles.exampleLink} href="/example">
                Play an example <MoveUpRight size={16} />
              </Link>
            </div>
            <p className={styles.detail}>
              One drawing. Three stops. A letter at the end.
            </p>
          </div>
          <figure className={styles.world}>
            <div className={styles.worldHeading}>
              <span>The example world</span>
              <span>Pip / A Star for You</span>
            </div>
            <div className={styles.stage}>
              <WorldBackdrop palette={example.config.palette} preview />
              <div className={styles.canvas}>
                <Scene gift={example} mini />
              </div>
            </div>
            <figcaption className={styles.caption}>
              <div className={styles.drawing}>
                <img
                  src="/sample-drawing.png"
                  alt="The original drawing of Pip, a mint bunny with a yellow scarf"
                />
                <div>
                  <span>Started here</span>
                  <strong>Pip, on paper.</strong>
                </div>
              </div>
              <div className={styles.worldNote}>
                <span>Drag the world to look around</span>
                <span>Handcrafted example · not AI-generated</span>
              </div>
            </figcaption>
          </figure>
        </section>
        <section className={styles.process} aria-labelledby="process-title">
          <div className={styles.processIntro}>
            <span className={styles.kicker}>From paper to play</span>
            <h2 id="process-title">
              Keep the character. <br />
              Add an adventure.
            </h2>
          </div>
          <ol>
            {steps.map(([number, title, description]) => (
              <li key={number}>
                <span className={styles.stepNumber}>{number}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <footer className={styles.footer}>
          <span>A gift they can play.</span>
          <span>Created by adults. Shared by link. No recipient account.</span>
          <Link href="/create">
            Make yours <ArrowRight size={14} />
          </Link>
        </footer>
      </main>
    </>
  );
}
