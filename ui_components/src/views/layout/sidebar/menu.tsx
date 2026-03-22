import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { privateRoutes } from '@/router';
import { useAuthStore } from '@/store';

export const SidebarMenu = () => {
  const { role } = useAuthStore();

  const filteredRoutes = privateRoutes.filter(
    (route) => !route.roles || (role && route.roles.includes(role))
  );

  const resolveMenuText = (routeId: string, defaultText: string) => {
    if (role === 'TEACHER' && routeId === 'users') return 'Hoc sinh';
    return defaultText;
  };

  return (
    <ul className="flex flex-col gap-1" role="menu">
      {filteredRoutes.map(
        ({ id, path, menu }) =>
          menu?.icon && (
            <li key={id}>
              <NavLink
                to={path}
                title={resolveMenuText(id, menu?.text || '')}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 px-3 py-2 text-sm rounded-lg border transition-colors',
                    {
                      'text-text100 font-medium bg-bg000 border-borderline shadow-soft': isActive,
                      'text-text300 border-transparent hover:bg-bg200': !isActive,
                    }
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={clsx('w-4 h-4 flex items-center justify-center', {
                        'text-accent': isActive,
                        'text-text400': !isActive,
                      })}
                    >
                      {menu.icon}
                    </span>
                    <span>{resolveMenuText(id, menu?.text || '')}</span>
                  </>
                )}
              </NavLink>
            </li>
          )
      )}
    </ul>
  );
};
