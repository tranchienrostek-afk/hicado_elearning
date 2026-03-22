import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store';
import { privateRoutes } from '@/router';

export const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { role, auth, setAuth } = useAuthStore();

  const roleLabel =
    role === 'ADMIN'
      ? 'Kế toán'
      : role === 'MANAGER'
        ? 'Quản lý'
        : role === 'TEACHER'
          ? 'Giáo viên'
          : role === 'STUDENT'
            ? 'Học sinh'
            : 'Khách';

  const activePath = location.pathname.split('/')[1] || 'home';
  const currentRoute = privateRoutes.find((route) => route.path === activePath);
  const currentLabel = currentRoute?.menu?.text || 'Tổng quan';

  return (
    <header
      className="h-14 bg-bg100 border-b border-borderline flex items-center justify-between px-4 sm:px-6 md:px-10 shrink-0 z-10 sticky top-0 min-w-0 gap-4"
      role="header"
    >
      <div className="flex items-center gap-2 text-sm text-text400 font-medium min-w-0 flex-shrink">
        <span className="hover:text-text100 cursor-default hidden md:inline whitespace-nowrap">Hệ thống quản trị</span>
        <span className="hidden md:inline">/</span>
        <span className="text-text100 truncate mt-0.5">{currentLabel}</span>
      </div>

      <div className="flex items-center gap-2 md:gap-4 text-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded bg-bg200 border border-borderline flex items-center justify-center font-serif text-text300 text-xs shrink-0">
            {(auth?.name || 'A').charAt(0).toUpperCase()}
          </div>
          <div className="hidden lg:flex flex-col">
            <span className="font-medium text-text100 leading-tight whitespace-nowrap">{auth?.name || 'Người dùng'}</span>
            <span className="text-[10px] text-text400 whitespace-nowrap">{roleLabel}</span>
          </div>
        </div>
        <div className="hidden sm:block w-px h-5 bg-borderline mx-1 md:mx-2"></div>
        <button
          onClick={() => {
            setAuth(null);
            navigate('/login', { replace: true });
          }}
          className="p-2 sm:px-4 sm:py-2 text-text400 hover:text-text100 hover:bg-bg200 rounded-lg transition-colors flex items-center gap-2"
          title="Dang xuat"
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span className="hidden sm:inline text-xs font-medium uppercase tracking-wider">Đăng xuất</span>
        </button>
      </div>
    </header>
  );
};

