import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { startAutoUpdate } from './lib/update';
import './styles.css';

void startAutoUpdate();

const queryClient = new QueryClient({
  defaultOptions: { queries: { networkMode: 'offlineFirst' } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
