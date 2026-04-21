import { type ReactNode, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { Sidebar } from './Sidebar';
import { Sun, Moon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/useTheme';

function useTick(intervalMs = 30000) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

interface ShellProps {
  children: ReactNode;
}

interface ScraperStatus {
  running: boolean;
  paused: boolean;
  startedAt: string | null;
  lastCompletedAt: string | null;
  lastResult: { found: number; new: number } | null;
}

function formatTimeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatElapsed(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

export function Shell({ children }: ShellProps) {
  const { theme, toggleTheme } = useTheme();
  useTick(30000);

  const { data: status } = useQuery<ScraperStatus>({
    queryKey: ['scraper-status'],
    queryFn: () => apiGet('/scraper/status'),
    refetchInterval: 10000,
  });

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex-shrink-0 flex h-10 items-center justify-between border-b border-border bg-card px-4">
        <span className="text-[13px] font-semibold tracking-tight text-foreground">
          Greenseer
        </span>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-muted-foreground">
            {status?.running && status.startedAt ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                Searching ({formatElapsed(status.startedAt)})
              </span>
            ) : status?.lastCompletedAt ? (
              <>
                Last search: {formatTimeAgo(status.lastCompletedAt)}
                {status.lastResult && (
                  <>
                    {' · '}
                    <span title="Total hits across all sources — most are duplicates between sources or with existing jobs.">
                      {status.lastResult.found.toLocaleString()} hits
                    </span>
                    {' · '}
                    <span
                      className="text-emerald-600 dark:text-emerald-400 font-medium"
                      title="Unique new jobs added to your feed after dedup."
                    >
                      {status.lastResult.new.toLocaleString()} new
                    </span>
                  </>
                )}
              </>
            ) : (
              'No searches yet'
            )}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        {/* No overflow on main — pages handle their own scrolling */}
        <main className="flex-1 min-w-0 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
