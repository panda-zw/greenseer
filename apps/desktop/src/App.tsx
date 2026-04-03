import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { Shell } from '@/components/layout/Shell';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { OnboardingWizard } from '@/components/OnboardingWizard';
import { Settings } from '@/pages/Settings';
import { JobFeed } from '@/pages/JobFeed';
import { CvManager } from '@/pages/CvManager';
import { Generator } from '@/pages/Generator';
import { Tracker } from '@/pages/Tracker';
import { ActivityLog } from '@/pages/ActivityLog';
import { Sponsors } from '@/pages/Sponsors';
import { useTheme } from '@/hooks/useTheme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, refetchOnWindowFocus: false },
  },
});

function AppContent() {
  useTheme();
  const [showOnboarding, setShowOnboarding] = useState(
    () => !localStorage.getItem('greenseer-onboarded'),
  );

  if (showOnboarding) {
    return <OnboardingWizard onComplete={() => setShowOnboarding(false)} />;
  }

  return (
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<Navigate to="/feed" replace />} />
          <Route path="/feed" element={<JobFeed />} />
          <Route path="/cv" element={<CvManager />} />
          <Route path="/generator" element={<Generator />} />
          <Route path="/tracker" element={<Tracker />} />
          <Route path="/activity" element={<ActivityLog />} />
          <Route path="/sponsors" element={<Sponsors />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <AppContent />
      </ErrorBoundary>
      <Toaster richColors position="bottom-right" />
    </QueryClientProvider>
  );
}
