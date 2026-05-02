import { lazily } from 'react-lazily';
import { RouteType } from '@/router';

const { Login, NotFound, PayPage } = lazily(() => import('@/views/pages'));

export const publicRoutes: RouteType[] = [
  {
    id: 'login',
    path: 'login',
    Element: Login,
  },
  {
    id: 'pay',
    path: 'pay/:studentId',
    Element: PayPage,
  },
  {
    id: 'notFound',
    path: '*',
    Element: NotFound,
  },
];
