import { lazily } from 'react-lazily';
import { RouteType } from '@/router';

const { Home, Users, AttendancePage, FinancialPage, Classes, Rooms, StudentPage } = lazily(() => import('@/views/pages'));

export const privateRoutes: RouteType[] = [
  {
    id: 'home',
    path: 'home',
    Element: Home,
    roles: ['ADMIN', 'MANAGER'],
    menu: {
      icon: <i className="icon-home"></i>,
      text: 'Trang chủ',
    },
  },
  {
    id: 'student',
    path: 'student',
    Element: StudentPage,
    roles: ['STUDENT'],
    menu: {
      icon: <i className="icon-user"></i>,
      text: 'Câu chuyện của tôi',
    },
  },
  {
    id: 'attendance',
    path: 'attendance',
    Element: AttendancePage,
    roles: ['ADMIN', 'MANAGER', 'TEACHER'],
    menu: {
      icon: <i className="icon-calendar"></i>,
      text: 'Quản lý Điểm danh',
    },
  },
  {
    id: 'finance',
    path: 'finance',
    Element: FinancialPage,
    roles: ['ADMIN', 'MANAGER', 'TEACHER'],
    menu: {
      icon: <i className="icon-dollar-sign"></i>,
      text: 'Lương thưởng',
    },
  },
  {
    id: 'users',
    path: 'users',
    Element: Users,
    roles: ['ADMIN', 'MANAGER', 'TEACHER'],
    menu: {
      icon: <i className="icon-users"></i>,
      text: 'Hồ sơ Giáo viên/HS',
    },
  },
  {
    id: 'classes',
    path: 'classes',
    Element: Classes,
    roles: ['ADMIN', 'MANAGER', 'TEACHER'],
    menu: {
      icon: <i className="icon-book-open"></i>,
      text: 'Quản lý Lớp học',
    },
  },
  {
    id: 'rooms',
    path: 'rooms',
    Element: Rooms,
    roles: ['ADMIN', 'MANAGER', 'TEACHER'],
    menu: {
      icon: <i className="icon-home"></i>,
      text: 'Quản lý Phòng học',
    },
  },
];
