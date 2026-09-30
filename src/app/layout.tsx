import type { Metadata } from "next";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/fraunces/500.css";
import "@fontsource/fraunces/500-italic.css";
import "./globals.css";
import MotionPreferences from "@/components/MotionPreferences";
export const metadata: Metadata = {
  title: "DoodleQuest — Your drawing deserves a world.",
  description: "A drawing. A little adventure. A gift from the heart.",
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
