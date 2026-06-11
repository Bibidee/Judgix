import Link from "next/link";
import { WalletButton } from "@/components/wallet/WalletButton";

export function TopNav() {
  return (
    <header className="border-b border-mist bg-plum text-cloud">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-md bg-cyan text-plum grid place-items-center font-serif-display text-xl font-bold">J</span>
          <div className="leading-tight">
            <div className="font-serif-display text-xl">Judgix</div>
            <div className="case-stamp text-cyan">Relief Signal Desk</div>
          </div>
        </Link>
        <nav className="hidden md:flex items-center gap-7 text-sm">
          <Link href="/campaigns" className="hover:text-cyan">Case Files</Link>
          <Link href="/review" className="hover:text-cyan">Review Docket</Link>
          <Link href="/submit" className="hover:text-cyan">Open Case</Link>
        </nav>
        <WalletButton />
      </div>
    </header>
  );
}
