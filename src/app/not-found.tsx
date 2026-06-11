import Link from "next/link";

export default function NotFound() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-24 text-center">
      <div className="case-stamp text-slate">404 · Case file not found</div>
      <h1 className="font-serif-display text-5xl mt-2">No record on the docket.</h1>
      <p className="text-deeptext/70 mt-4">The case file you're looking for is not on the Judgix ledger.</p>
      <Link href="/campaigns" className="inline-block mt-6 bg-plum text-cloud px-4 py-2 rounded-md">Back to all case files</Link>
    </div>
  );
}
