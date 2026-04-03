import { useSettings, useUpdateSettings } from '@/hooks/useSettings';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';
import type { ScrapeLogDto, JobSource } from '@greenseer/shared';

const sources: { key: JobSource; name: string; description: string }[] = [
  {
    key: 'adzuna',
    name: 'Adzuna',
    description: 'REST API covering UK, Australia, Canada, NZ, and EU markets.',
  },
  {
    key: 'linkedin',
    name: 'LinkedIn',
    description: 'Headless browser scraping of LinkedIn Jobs.',
  },
  {
    key: 'seek',
    name: 'Seek',
    description: 'Scraping AU and NZ tech job listings.',
  },
];

function formatDate(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  return d.toLocaleString();
}

export function SourcesSettings() {
  const { data: settings, isLoading } = useSettings();
  const { mutate: updateSettings } = useUpdateSettings();
  const queryClient = useQueryClient();

  const { data: latestLogs } = useQuery<Record<string, ScrapeLogDto | null>>({
    queryKey: ['scraper-logs-latest'],
    queryFn: () => apiGet('/scraper/logs/latest'),
    refetchInterval: 10000,
  });

  const { data: scraperStatus } = useQuery<{ running: boolean; paused: boolean }>({
    queryKey: ['scraper-status'],
    queryFn: () => apiGet('/scraper/status'),
    refetchInterval: 5000,
  });

  const runSource = useMutation({
    mutationFn: (source: JobSource) =>
      apiPost<{ found: number; new: number }>(`/scraper/run/${source}`),
    onSuccess: (data, source) => {
      toast.success(`${source}: ${data.found} found, ${data.new} new`);
      queryClient.invalidateQueries({ queryKey: ['scraper-logs-latest'] });
    },
    onError: (_, source) => {
      toast.error(`${source} scrape failed`);
    },
  });

  const runAll = useMutation({
    mutationFn: () => apiPost<{ totalFound: number; totalNew: number }>('/scraper/run'),
    onSuccess: (data) => {
      toast.success(`Scrape complete: ${data.totalFound} found, ${data.totalNew} new`);
      queryClient.invalidateQueries({ queryKey: ['scraper-logs-latest'] });
    },
    onError: () => {
      toast.error('Scrape failed');
    },
  });

  if (isLoading || !settings) {
    return <div className="pt-4 text-muted-foreground">Loading...</div>;
  }

  const toggleSource = (key: JobSource, enabled: boolean) => {
    updateSettings({
      sources: {
        ...settings.sources,
        [key]: { ...settings.sources[key], enabled },
      },
    });
  };

  const isAnyScrapeRunning =
    scraperStatus?.running || runSource.isPending || runAll.isPending;

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center justify-between">
        <div>
          {scraperStatus?.paused && (
            <Badge variant="outline" className="text-yellow-500 border-yellow-500">
              Paused
            </Badge>
          )}
        </div>
        <Button
          onClick={() => runAll.mutate()}
          disabled={isAnyScrapeRunning}
          size="sm"
        >
          {runAll.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Play className="h-4 w-4 mr-2" />
          )}
          Run All Sources
        </Button>
      </div>

      {sources.map(({ key, name, description }) => {
        const log = latestLogs?.[key];

        return (
          <Card key={key}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {name}
                    <Badge variant="outline" className="text-xs">
                      {settings.sources[key].enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </CardTitle>
                  <CardDescription>{description}</CardDescription>
                </div>
                <Switch
                  checked={settings.sources[key].enabled}
                  onCheckedChange={(checked) => toggleSource(key, checked)}
                />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>Last run: {formatDate(log?.completedAt ?? log?.startedAt ?? null)}</p>
                  <p>
                    Jobs found: {log?.jobsFound ?? 0} | New: {log?.jobsAfterDedup ?? 0}
                  </p>
                  {log?.error && (
                    <p className="text-destructive text-xs">Error: {log.error}</p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => runSource.mutate(key)}
                  disabled={isAnyScrapeRunning || !settings.sources[key].enabled}
                >
                  {runSource.isPending && runSource.variables === key ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
