import { NavLink } from 'react-router-dom';
import { useAuthStore } from '@/store';

export const BottomNav = () => {
  const { role } = useAuthStore();
  const isAdminOrManager = role === 'ADMIN' || role === 'MANAGER';

  return (
    <nav className="fixed bottom-0 left-0 w-full bg-bg100 border-t border-borderline md:hidden flex justify-around items-center h-16 z-50 px-2 pb-safe shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)]">
      <NavLink
        to="/home"
        className={({ isActive }) =>
          `flex flex-col items-center justify-center w-16 h-full gap-1 transition-colors ${
            isActive ? 'text-accent' : 'text-text400 hover:text-text200'
          }`
        }
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
        <span className="text-[10px] font-bold">Tổng quan</span>
      </NavLink>

      <NavLink
        to="/classes"
        className={({ isActive }) =>
          `flex flex-col items-center justify-center w-16 h-full gap-1 transition-colors ${
            isActive ? 'text-accent' : 'text-text400 hover:text-text200'
          }`
        }
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        <span className="text-[10px] font-bold">Lớp học</span>
      </NavLink>

      <NavLink
        to="/attendance"
        className={({ isActive }) =>
          `flex flex-col items-center justify-center w-16 h-full gap-1 transition-colors ${
            isActive ? 'text-accent' : 'text-text400 hover:text-text200'
          }`
        }
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-[10px] font-bold">Điểm danh</span>
      </NavLink>

      {isAdminOrManager ? (
        <NavLink
          to="/finance"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center w-16 h-full gap-1 transition-colors ${
              isActive ? 'text-accent' : 'text-text400 hover:text-text200'
            }`
          }
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-[10px] font-bold">Tài chính</span>
        </NavLink>
      ) : (
        <NavLink
          to="/users"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center w-16 h-full gap-1 transition-colors ${
              isActive ? 'text-accent' : 'text-text400 hover:text-text200'
            }`
          }
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <span className="text-[10px] font-bold">Hồ sơ HS</span>
        </NavLink>
      )}

    </nav>
  );
};
