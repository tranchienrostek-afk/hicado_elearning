import { Navigate, Route } from 'react-router-dom';
import { RouteType } from '.';
import { UserRole } from '@/store/modules/auth';

export const routesGenerator = (routes: RouteType[], currentRole: UserRole | null) =>
  routes.map(({ id, path, Element, roles }) => {
    const isAuthorized = !roles || (currentRole && roles.includes(currentRole));
    const fallbackPath = currentRole === 'STUDENT' ? '/student' : currentRole === 'TEACHER' ? '/classes' : '/home';
    
    return (
      <Route 
        key={id} 
        path={path} 
        element={isAuthorized ? <Element /> : <Navigate to={fallbackPath} replace />} 
      />
    );
  });
