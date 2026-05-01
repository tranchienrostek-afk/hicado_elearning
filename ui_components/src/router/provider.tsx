import { useEffect, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import axios from 'axios';
import { useAuthStore, jwtExpired } from '@/store';
import { PublicLayout, PrivateLayout } from '@/views/layout';
import { Loading, routesGenerator, publicRoutes, privateRoutes } from '.';

export const Router = () => {
  const { auth, role } = useAuthStore();
  const isAuthenticated = !!auth?.token && !jwtExpired(auth.token);

  // Auto-logout when server rejects token (401)
  useEffect(() => {
    const id = axios.interceptors.response.use(
      (res) => res,
      (err) => {
        if (err.response?.status === 401) {
          useAuthStore.getState().logout();
        }
        return Promise.reject(err);
      }
    );
    return () => axios.interceptors.response.eject(id);
  }, []);

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
            element={isAuthenticated ? <PrivateLayout /> : <Navigate to="/login" replace />}
          >
            <Route index element={<Navigate to={role === 'STUDENT' ? '/student' : role === 'TEACHER' ? '/classes' : '/home'} replace />} />
            {routesGenerator(privateRoutes, role)}
          </Route>
        </Routes>
      </BrowserRouter>
    </Suspense>
  );
};
