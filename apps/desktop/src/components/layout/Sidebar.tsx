import { NavLink } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api';
import { Briefcase, FileText, FilePen, ClipboardList, Activity, Building2, Settings, Search, Square, Linkedin, FolderKanban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const navItems = [
  { to: '/feed', label: 'Job Feed', icon: Briefcase },
  { to: '/cv', label: 'CV Manager', icon: FileText },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/generator', label: 'Generator', icon: FilePen },
  { to: '/linkedin', label: 'LinkedIn', icon: Linkedin },
  { to: '/tracker', label: 'Tracker', icon: ClipboardList },
  { to: '/sponsors', label: 'Sponsors', icon: Building2 },
  { to: '/activity', label: 'Activity', icon: Activity },
];

export function Sidebar() {
  const queryClient = useQueryClient();

  const { data: scraperStatus } = useQuery<{ running: boolean; paused: boolean }>({
    queryKey: ['scraper-status'],
    queryFn: () => apiGet('/scraper/status'),
    refetchInterval: 10000,
  });

  const runSearch = useMutation({
    mutationFn: () => apiPost<{ totalFound: number; totalNew: number }>('/scraper/run'),
    onSuccess: (data) => {
      toast.success(
        `Search complete: ${data.totalNew.toLocaleString()} new jobs added`,
        { description: `${data.totalFound.toLocaleString()} hits across all sources (most are cross-source duplicates)` },
      );
      queryClient.invalidateQueries({ queryKey: ['job-feed'] });
      queryClient.invalidateQueries({ queryKey: ['scraper-status'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
    },
    onError: () => toast.error('Search failed — check Activity log for details'),
  });

  const cancelSearch = useMutation({
    mutationFn: () => apiPost('/scraper/cancel'),
    onSuccess: () => {
      toast.info('Search stopping...');
      queryClient.invalidateQueries({ queryKey: ['scraper-status'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
    },
  });

  const isSearching = scraperStatus?.running === true;

  return (
    <aside className="flex w-48 flex-shrink-0 flex-col border-r border-border bg-card overflow-hidden">
      {/* Search button */}
      <div className="px-2 pt-3 pb-1">
        {isSearching ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 text-[12px] justify-start border-destructive/40 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => cancelSearch.mutate()}
          >
            <Square className="h-3 w-3 mr-2 fill-current" />
            Stop Search
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 text-[12px] justify-start"
            onClick={() => runSearch.mutate()}
          >
            <Search className="h-3.5 w-3.5 mr-2" />
            Run Search
          </Button>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-2 pt-2">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
                isActive
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
              )
            }
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-border px-2 h-[49px] flex items-center">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors w-full',
              isActive
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
            )
          }
        >
          <Settings className="h-4 w-4 flex-shrink-0" />
          Settings
        </NavLink>
      </div>
    </aside>
  );
}
