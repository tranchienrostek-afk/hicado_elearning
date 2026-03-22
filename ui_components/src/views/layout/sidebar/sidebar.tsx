import { SidebarMenu } from '.';

export const Sidebar = () => {
  return (
    <aside
      className="hidden md:flex w-64 bg-[#F0F0EB] border-r border-borderline flex-col flex-shrink-0 z-20"
      role="sidebar"
    >
      <div className="h-14 px-6 border-b border-borderline flex items-center gap-2">
        <div className="w-6 h-6 bg-accent rounded flex items-center justify-center text-white font-serif font-bold text-xs">
          H
        </div>
        <span className="font-serif font-semibold text-text100">Learning Ops</span>
      </div>

      <div className="px-4 pt-6 pb-2">
        <div className="text-[11px] font-semibold text-text400 uppercase tracking-wider px-2">
          Danh muc chinh
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        <SidebarMenu />
      </div>

      <div className="p-4 border-t border-borderline flex items-center justify-between text-xs text-text400">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>System Normal</span>
        </div>
        <span className="font-serif">v2.4.1</span>
      </div>
    </aside>
  );
};
