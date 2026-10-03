import type { Metadata } from "next";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/fraunces/500.css";
import "@fontsource/fraunces/500-italic.css";
import "./globals.css";
import MotionPreferences from "@/components/MotionPreferences";
export const metadata: Metadata = {
  title: "DoodleQuest — A world for your drawing",
  description:
    "Turn a drawing into a 3D character and a playable gift, with a personal letter at the end.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <MotionPreferences />
        {children}
      </body>
    </html>
  );
}
