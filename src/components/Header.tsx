import Link from "next/link";
import { Sparkles, ArrowUpRight } from "lucide-react";
export default function Header() {
  return (
    <header className="site-header">
      <Link href="/" className="wordmark">
        <span className="logo-mark">
          <Sparkles size={23} />
        </span>
        doodlequest<span className="logo-dot">.</span>
      </Link>
      <nav>
        <Link href="/example">A little adventure</Link>
        <Link className="small-link" href="/create">
          Make something magical <ArrowUpRight size={16} />
        </Link>
      </nav>
    </header>
  );
}
