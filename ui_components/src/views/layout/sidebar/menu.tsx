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
                    'flex items-center gap-3 px-4 py-2.5 text-xs font-bold uppercase tracking-widest rounded-xl transition-all duration-300',
                    {
                      'text-hicado-navy bg-hicado-emerald shadow-lg shadow-hicado-emerald/20': isActive,
                      'text-white/50 hover:text-white hover:bg-white/5': !isActive,
                    }
                  )
                }
              >
                {() => (
                  <>
                    <span className="w-4 h-4 flex items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity">
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
