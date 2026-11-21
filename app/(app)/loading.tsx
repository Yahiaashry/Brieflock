export default function LoadingWorkspace() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading workspace">
      <div aria-hidden className="h-8 w-56 rounded-lg bg-line motion-safe:animate-pulse" />
      <div aria-hidden className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((card) => (
          <div key={card} className="h-24 rounded-xl border border-line bg-surface motion-safe:animate-pulse" />
        ))}
      </div>
      <div aria-hidden className="h-64 rounded-xl border border-line bg-surface motion-safe:animate-pulse" />
    </div>
  );
}
