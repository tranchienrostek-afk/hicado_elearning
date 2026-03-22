import { Children, ClassName } from '@/types';
import { clsx } from 'clsx';

export const Container = ({ children, className }: Children & ClassName) => (
  <section className={clsx("relative h-full", className)} role="content">
    {children}
  </section>
);
