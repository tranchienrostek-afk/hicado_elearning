import { Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '@/store';
import { PublicLayout, PrivateLayout } from '@/views/layout';
import { Loading, routesGenerator, publicRoutes, privateRoutes } from '.';

export const Router = () => {
  const { isAuth, role } = useAuthStore();

  return (
    <Suspense fallback={<Loading />}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<PublicLayout />}>
            <Route index element={<Navigate to="/login" replace />} />
            {routesGenerator(publicRoutes, role)}
          </Route>
          <Route
            path="/"
            element={isAuth ? <PrivateLayout /> : <Navigate to="/login" />}
          >
            <Route index element={<Navigate to={role === 'STUDENT' ? '/student' : role === 'TEACHER' ? '/classes' : '/home'} replace />} />
            {routesGenerator(privateRoutes, role)}
          </Route>
        </Routes>
      </BrowserRouter>
    </Suspense>
  );
};
