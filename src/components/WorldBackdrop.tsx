import { useId } from "react";
import type { GiftConfig } from "@/domain/config";
import styles from "./WorldBackdrop.module.css";

/** A static paper landscape, independent of the island camera and WebGL. */
export default function WorldBackdrop({
  palette,
  preview = false,
}: {
  palette: GiftConfig["palette"];
  preview?: boolean;
}) {
  const id = useId();
  const sky = `${id}-sky`;
  const haze = `${id}-haze`;
  return (
    <div
      className={`${styles.backdrop} ${preview ? styles.preview : ""}`}
      data-world-backdrop={palette}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 1600 1000"
        preserveAspectRatio="xMidYMid slice"
        focusable="false"
      >
        <defs>
          <linearGradient id={sky} x2="0" y2="1">
            <stop stopColor="var(--world-sky)" />
            <stop offset=".62" stopColor="var(--world-horizon)" />
            <stop offset="1" stopColor="var(--world-paper)" />
          </linearGradient>
          <linearGradient id={haze} x2="0" y2="1">
            <stop stopColor="var(--world-paper)" stopOpacity="0" />
            <stop offset="1" stopColor="var(--world-paper)" stopOpacity=".96" />
          </linearGradient>
        </defs>
        <path fill={`url(#${sky})`} d="M0 0h1600v1000H0z" />
        <g className={styles.sun}>
          <circle
            cx="1270"
            cy="195"
            r="148"
            fill="var(--world-sun)"
            opacity=".13"
          />
          <circle
            cx="1270"
            cy="195"
            r="116"
            fill="var(--world-sun)"
            opacity=".2"
          />
          <circle cx="1270" cy="195" r="77" fill="var(--world-sun)" />
          <circle cx="1250" cy="175" r="50" fill="#fffbee" opacity=".25" />
        </g>
        <g fill="var(--world-cloud)" opacity=".8">
          <path d="M-80 222c30-37 72-26 87-10 5-52 70-70 106-33 34-25 81-10 91 28 39-15 76 3 85 27 28-8 55 8 65 26H-80z" />
          <path
            d="M975 284c18-29 48-35 75-15 8-43 58-63 96-27 30-23 70-8 75 26 32-13 67 1 77 23h-323z"
            opacity=".68"
          />
          <path d="M1364 406c16-33 50-44 79-24 7-42 53-65 88-37 25-41 86-40 105 5 43-19 91 3 104 39v37h-376z" />
        </g>
        <g
          fill="none"
          stroke="var(--world-cloud)"
          strokeWidth="3"
          strokeLinecap="round"
          opacity=".65"
        >
          <path d="M409 202h89m15 0h32M1080 384h113m18 0h29" />
          <path d="M102 350h116m18 0h47" />
        </g>
        <path
          fill="var(--world-hill-far)"
          d="M0 627c89-93 174-151 270-115 103 40 142 118 267 89 144-34 190-72 310-40 107 28 144 80 259 46 152-46 184-146 297-128 87 14 143 74 197 131v390H0z"
        />
        <path
          fill="var(--world-hill-mid)"
          d="M0 734c129-68 226-92 342-49 126 48 191 75 309 43 152-41 222-59 342-21 130 41 176 88 310 39 132-48 203-89 297-53v307H0z"
        />
        <g fill="var(--world-tree)" opacity=".6">
          <path d="M107 654h7v66h-7zM1413 639h7v67h-7z" />
          <ellipse cx="110" cy="648" rx="29" ry="41" />
          <ellipse cx="1417" cy="630" rx="35" ry="48" />
          <path d="M1530 683h6v53h-6z" />
          <ellipse cx="1533" cy="675" rx="24" ry="33" />
        </g>
        <path
          fill="var(--world-hill-near)"
          d="M0 859c137-56 264-39 411 2 154 42 280 16 409-12 148-32 231-9 378 22 168 36 278-35 402-55v184H0z"
        />
        <path fill={`url(#${haze})`} d="M0 530h1600v470H0z" />
        <g fill="var(--world-cloud)" opacity=".64">
          <path d="M-50 864c31-44 86-46 120-14 20-48 90-66 133-19 43-18 93 7 103 36 40-11 74 4 93 27H-50z" />
          <path d="M1301 828c27-36 71-39 103-13 12-42 64-53 95-18 37-21 88-2 99 33 32-8 61 3 81 26h-378z" />
        </g>
      </svg>
    </div>
  );
}
