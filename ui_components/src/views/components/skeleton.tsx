export const SkeletonBase = ({ className }: { className: string }) => (
  <div className={`animate-pulse bg-slate-200 rounded ${className}`} />
);

export const SkeletonCard = () => (
  <div className="glass-card rounded-[2.5rem] p-8 space-y-6">
    <div className="flex justify-between items-start">
      <SkeletonBase className="w-12 h-12 rounded-2xl" />
      <SkeletonBase className="w-2 h-2 rounded-full" />
    </div>
    <div className="space-y-2">
      <SkeletonBase className="w-1/3 h-3" />
      <SkeletonBase className="w-2/3 h-8" />
      <SkeletonBase className="w-1/4 h-2" />
    </div>
  </div>
);

export const SkeletonHero = () => (
  <div className="relative h-[450px] rounded-[3rem] overflow-hidden bg-hicado-navy/10 animate-pulse">
    <div className="absolute inset-0 bg-gradient-to-r from-hicado-navy/20 to-transparent" />
    <div className="relative h-full p-20 flex flex-col justify-center space-y-6">
      <SkeletonBase className="w-24 h-3 bg-hicado-emerald/20" />
      <div className="space-y-4">
        <SkeletonBase className="w-1/2 h-16 bg-white/10" />
        <SkeletonBase className="w-1/3 h-16 bg-white/10" />
      </div>
      <div className="flex gap-4">
        <SkeletonBase className="w-32 h-10 bg-white/5" />
        <SkeletonBase className="w-32 h-10 bg-white/5" />
      </div>
    </div>
  </div>
);

export const SkeletonTable = ({ rows = 5 }: { rows?: number }) => (
  <div className="space-y-4">
    <div className="flex justify-between items-center mb-8">
      <SkeletonBase className="w-48 h-8" />
      <SkeletonBase className="w-32 h-10" />
    </div>
    {[...Array(rows)].map((_, i) => (
      <div key={i} className="flex items-center justify-between p-6 bg-white rounded-2xl border border-slate-50">
        <div className="flex gap-4 items-center">
          <SkeletonBase className="w-12 h-12 rounded-full" />
          <div className="space-y-2">
            <SkeletonBase className="w-48 h-4" />
            <SkeletonBase className="w-32 h-3" />
          </div>
        </div>
        <SkeletonBase className="w-24 h-8 rounded-full" />
      </div>
    ))}
  </div>
);
