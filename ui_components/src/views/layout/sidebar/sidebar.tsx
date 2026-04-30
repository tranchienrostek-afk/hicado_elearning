import { SidebarMenu } from '.';

export const Sidebar = () => {
  return (
    <aside
      className="hidden md:flex w-64 bg-hicado-navy border-r border-hicado-obsidian/20 flex-col flex-shrink-0 z-20 shadow-2xl"
      role="sidebar"
    >
      <div className="h-16 px-6 border-b border-white/5 flex items-center gap-3">
        <div className="w-8 h-8 bg-hicado-emerald rounded-lg flex items-center justify-center text-hicado-navy font-sans font-black text-sm shadow-lg shadow-hicado-emerald/20">
          H
        </div>
        <div className="flex flex-col">
          <span className="font-sans font-bold text-white leading-none">HICADO</span>
          <span className="text-[10px] font-bold text-hicado-emerald uppercase tracking-widest mt-1">E-Learning</span>
        </div>
      </div>

      <div className="px-6 pt-8 pb-3">
        <div className="text-[10px] font-black text-white/10 uppercase tracking-[0.4em]">
          Operational Context
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 custom-scrollbar">
        <SidebarMenu />
      </div>

      <div className="p-6 border-t border-white/5 flex items-center justify-between text-[10px] font-bold text-white/40 uppercase tracking-widest">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-hicado-emerald animate-pulse" />
          <span>Operational</span>
        </div>
        <span className="font-mono">v3.0.0</span>
      </div>

    </aside>
  );
};
