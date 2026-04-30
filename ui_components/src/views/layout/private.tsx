import { Outlet } from 'react-router-dom';
import { Main, Sidebar, Header, BottomNav } from '.';

export const PrivateLayout = () => (
  <Main className="h-screen w-full overflow-hidden flex bg-bg100">
    <Sidebar />
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
      <Header />
      <main className="flex-1 overflow-y-auto px-4 md:px-8 lg:px-12 py-8 bg-bg100 overflow-x-hidden pb-24 md:pb-8">
        <div className="max-w-7xl mx-auto w-full">
          <Outlet />
        </div>
      </main>
      <BottomNav />
    </div>
  </Main>
);
