import { Component, ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { LoginPage } from '@/pages/Login';
import { DashboardPage } from '@/pages/Dashboard';
import { useMe } from '@/hooks/useAuth';
import { Loader2, Radio } from 'lucide-react';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: any) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="max-w-lg space-y-3 rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-destructive">
            <h2 className="text-lg font-semibold">⚠️ Uygulama hatası</h2>
            <pre className="whitespace-pre-wrap text-xs">{this.state.error.message}</pre>
            <p className="text-xs opacity-70">
              Tarayıcı konsoluna (F12) bakıp tam hata mesajını paylaş.
            </p>
            <button
              onClick={() => location.reload()}
              className="rounded-md bg-destructive px-3 py-1.5 text-sm text-destructive-foreground"
            >
              Yeniden yükle
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function FullScreenLoader({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-foreground">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
        <Radio className="h-6 w-6 text-primary" />
      </div>
      <div className="text-sm font-medium">{label}</div>
      <Loader2 className="h-5 w-5 animate-spin text-primary" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isLoading, isError } = useMe();

  if (isLoading) return <FullScreenLoader label="Yükleniyor…" />;
  if (isError) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
        </Routes>
        <Toaster position="top-right" richColors />
      </BrowserRouter>
    </ErrorBoundary>
  );
}
