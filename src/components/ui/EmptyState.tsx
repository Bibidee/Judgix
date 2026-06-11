import Link from "next/link";

export function EmptyState({
  eyebrow,
  title,
  description,
  primaryAction,
  secondaryAction,
}: {
  eyebrow: string;
  title: string;
  description: string;
  primaryAction?: { href: string; label: string };
  secondaryAction?: { href: string; label: string };
}) {
  return (
    <div className="paper-card p-10 md:p-14 text-center mt-8">
      <div className="mx-auto w-12 h-12 rounded-full bg-lilac grid place-items-center mb-4">
        <span className="case-stamp text-coral">JX</span>
      </div>
      <div className="case-stamp text-slate">{eyebrow}</div>
      <h3 className="font-serif-display text-3xl mt-2 max-w-xl mx-auto">{title}</h3>
      <p className="text-deeptext/70 mt-2 max-w-xl mx-auto">{description}</p>
      {(primaryAction || secondaryAction) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {primaryAction && (
            <Link href={primaryAction.href} className="bg-coral text-cloud px-4 py-2 rounded-md text-sm font-medium">
              {primaryAction.label}
            </Link>
          )}
          {secondaryAction && (
            <Link href={secondaryAction.href} className="border border-mist px-4 py-2 rounded-md text-sm hover:border-evidence">
              {secondaryAction.label}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
