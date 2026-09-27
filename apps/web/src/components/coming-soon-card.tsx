type Props = {
  title: string;
  body: string;
  badge: string;
};

/**
 * A planned section that is not built yet. Deliberately not a link or button, so it can't be
 * mistaken for a working feature (spec §60).
 */
export function ComingSoonCard({ title, body, badge }: Props) {
  return (
    <article
      aria-disabled="true"
      className="h-full rounded-lg border border-border bg-surface p-6 shadow-card"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-text">{title}</h3>
        <span className="shrink-0 rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-semibold text-text-muted">
          {badge}
        </span>
      </div>
      <p className="mt-2 text-text-muted">{body}</p>
    </article>
  );
}
