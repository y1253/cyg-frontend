import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext';
import { AttachmentViewerProvider } from './components/Companies/AttachmentViewerContext';
import { ComposerProvider } from './context/ComposerContext';
import { router } from './routing/router';

// React Query's defaults are 3 retries on an exponential delay capped at 30s, which
// is how a single malformed response once turned into a seven-second blank screen.
// One quick retry still rides out a blip; anything worse should surface immediately.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 3000),
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AttachmentViewerProvider>
          {/* Above the router on purpose: the compose window has to outlive tab
              switches and company navigation. See ComposerContext. */}
          <ComposerProvider>
            <RouterProvider router={router} />
          </ComposerProvider>
        </AttachmentViewerProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
