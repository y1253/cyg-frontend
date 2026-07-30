import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext';
import { AttachmentViewerProvider } from './components/Companies/AttachmentViewerContext';
import { router } from './routing/router';

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AttachmentViewerProvider>
          <RouterProvider router={router} />
        </AttachmentViewerProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
