import { Outlet } from 'react-router-dom';
import { Main } from '.';

export const PublicLayout = () => (
  <Main className="bg-bg100">
    <div className="flex-1 min-h-screen">
      <Outlet />
    </div>
  </Main>
);
