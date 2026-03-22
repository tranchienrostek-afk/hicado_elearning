import { Children } from '@/types';
import clsx from 'clsx';

interface MainProps extends Children {
  className?: string;
}

export const Main = ({ children, className }: MainProps) => {
  return (
    <main className={clsx('flex h-screen w-full overflow-hidden bg-bg100 text-text100 font-sans', className)}>
      {children}
    </main>
  );
};
