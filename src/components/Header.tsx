import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import styles from "./Header.module.css";
export default function Header() {
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.wordmark}>
        doodlequest<span>.</span>
      </Link>
      <nav aria-label="Main navigation">
        <Link href="/example">Play the example</Link>
        <Link className={styles.create} href="/create">
          Create a gift <ArrowUpRight size={15} />
        </Link>
      </nav>
    </header>
  );
}
