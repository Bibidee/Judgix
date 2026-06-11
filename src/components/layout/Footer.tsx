export function Footer() {
  return (
    <footer className="border-t border-mist bg-cloud">
      <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-sm text-slate">
        <div>
          <div className="font-serif-display text-lg text-deeptext">Judgix</div>
          <div className="case-stamp">A legitimacy layer for public fundraising</div>
          <a
            href="https://genlayer.com"
            target="_blank"
            rel="noreferrer"
            className="case-stamp mt-2 inline-flex items-center gap-1.5 text-evidence hover:text-plum"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-cyan" />
            Powered by GenLayer consensus
          </a>
        </div>
        <p className="max-w-md text-xs leading-relaxed">
          Judgix provides decentralised evidence review, not a legal guarantee.
          Verdicts are produced by GenLayer consensus over submitted evidence.
        </p>
      </div>
    </footer>
  );
}
