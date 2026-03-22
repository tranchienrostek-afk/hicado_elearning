import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Children } from '@/types';
import { useAuthStore, useCenterStore } from '@/store';
import { setAxiosAuth } from '.';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

export const Api = ({ children }: Children) => {
  const { auth } = useAuthStore();
  const { initialize } = useCenterStore();

  useEffect(() => {
    if (auth?.token) {
      initialize();
    }
  }, [auth?.token, initialize]);

  setAxiosAuth(auth?.token);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};
