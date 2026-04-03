import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  CheckCircle2,
  Info,
  AlertTriangle,
  XCircle,
  Loader2,
  Trash2,
  RefreshCw,
} from 'lucide-react';

interface ActivityEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'success' | 'warning' | 'error';
  source: string;
  message: string;
  detail?: string;
}

const levelConfig = {
  info: { icon: Info, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  success: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  warning: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  error: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10' },
};

export function ActivityLog() {
  const queryClient = useQueryClient();

  const { data: entries, isLoading } = useQuery<ActivityEntry[]>({
    queryKey: ['activity'],
    queryFn: () => apiGet('/activity?limit=100'),
    refetchInterval: 3000,
  });

  const clearLog = useMutation({
    mutationFn: async () => {
      const res = await fetch('http://127.0.0.1:11434/api/activity', { method: 'DELETE' });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['activity'] }),
  });

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString();
  };

  // Group entries by date
  const grouped: Record<string, ActivityEntry[]> = {};
  for (const entry of entries || []) {
    const date = formatDate(entry.timestamp);
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(entry);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div>
          <h2 className="text-[15px] font-semibold">Activity Log</h2>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Background events, scrape results, and errors
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[12px]"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['activity'] })}
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Refresh
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[12px] text-muted-foreground"
            onClick={() => clearLog.mutate()}
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Clear
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !entries || entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2 text-center">
              <Info className="h-8 w-8 text-muted-foreground" />
              <p className="text-[13px] text-muted-foreground">
                No activity yet. Events will appear here as scrapes run and jobs are processed.
              </p>
            </div>
          ) : (
            Object.entries(grouped).map(([date, dayEntries]) => (
              <div key={date} className="mb-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  {date}
                </p>
                <div className="space-y-1">
                  {dayEntries.map((entry) => {
                    const config = levelConfig[entry.level];
                    const Icon = config.icon;
                    return (
                      <div
                        key={entry.id}
                        className="flex items-start gap-2.5 py-1.5 px-2 rounded-lg hover:bg-muted/30 transition-colors"
                      >
                        <div className={`h-6 w-6 rounded flex items-center justify-center flex-shrink-0 mt-0.5 ${config.bg}`}>
                          <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                              {entry.source}
                            </Badge>
                            <span className="text-[12px] text-muted-foreground">
                              {formatTime(entry.timestamp)}
                            </span>
                          </div>
                          <p className="text-[13px] text-foreground mt-0.5">
                            {entry.message}
                          </p>
                          {entry.detail && (
                            <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">
                              {entry.detail}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
