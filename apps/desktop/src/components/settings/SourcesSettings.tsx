import { useSettings, useUpdateSettings } from '@/hooks/useSettings';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Play, AlertTriangle, CheckCircle2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import type { ScrapeLogDto, JobSource, SourceCatalogEntry, SourceTier } from '@greenseer/shared';
import { SOURCE_CATALOG } from '@greenseer/shared';

function formatDate(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  return d.toLocaleString();
}

/** Visual styling for each reliability tier. */
const TIER_STYLES: Record<SourceTier, { label: string; badge: string; icon: typeof CheckCircle2 | null }> = {
  high: {
    label: 'Reliable',
    badge: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30',
    icon: CheckCircle2,
  },
  medium: {
    label: 'May break',
    badge: 'bg-amber-500/10 text-amber-700 border-amber-500/30',
    icon: AlertTriangle,
  },
  low: {
    label: 'Experimental',
    badge: 'bg-red-500/10 text-red-700 border-red-500/30',
    icon: AlertTriangle,
  },
  manual: {
    label: 'Reference',
    badge: 'bg-blue-500/10 text-blue-700 border-blue-500/30',
    icon: ExternalLink,
  },
};

const TIER_TOOLTIPS: Record<SourceTier, string> = {
  high: 'Public API. Expected to work reliably.',
  medium: 'HTML scraping. Works now but selectors may break when the site redesigns — disable and re-enable if it stops returning results.',
  low: 'Experimental. Target site has anti-bot measures; expect frequent failures. Enable at your own risk.',
  manual: 'External reference. Not automatable — open the link to use it manually.',
};

// Render order: high tier first, then medium, then low, then manual.
const TIER_ORDER: SourceTier[] = ['high', 'medium', 'low', 'manual'];

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
      toast.success(
        `${source}: ${data.new.toLocaleString()} new`,
        { description: `${data.found.toLocaleString()} hits scraped${data.found !== data.new ? ` · ${(data.found - data.new).toLocaleString()} dupes` : ''}` },
      );
      queryClient.invalidateQueries({ queryKey: ['scraper-logs-latest'] });
    },
    onError: (err: any, source) => {
      toast.error(err?.message || `${source} scrape failed`);
    },
  });

  const runAll = useMutation({
    mutationFn: () => apiPost<{ totalFound: number; totalNew: number }>('/scraper/run'),
    onSuccess: (data) => {
      toast.success(
        `Scrape complete: ${data.totalNew.toLocaleString()} new jobs added`,
        { description: `${data.totalFound.toLocaleString()} hits across all sources (most are cross-source duplicates)` },
      );
      queryClient.invalidateQueries({ queryKey: ['scraper-logs-latest'] });
    },
    onError: () => toast.error('Scrape failed'),
  });

  if (isLoading || !settings) {
    return <div className="pt-4 text-muted-foreground">Loading...</div>;
  }

  const toggleSource = (key: string, enabled: boolean) => {
    updateSettings({
      sources: {
        ...settings.sources,
        [key]: { enabled },
      },
    });
  };

  const isAnyScrapeRunning =
    scraperStatus?.running || runSource.isPending || runAll.isPending;

  // Group catalog entries by tier
  const bySource: Record<SourceTier, SourceCatalogEntry[]> = {
    high: [], medium: [], low: [], manual: [],
  };
  for (const entry of SOURCE_CATALOG) bySource[entry.tier].push(entry);

  return (
    <div className="space-y-6 pt-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-[13px] text-muted-foreground">
            Sources are grouped by reliability. Start with{' '}
            <span className="font-semibold text-emerald-600">Reliable</span> sources — they use public APIs and rarely fail.{' '}
            <span className="font-semibold text-amber-700">May break</span> sources scrape HTML and can stop working if the site redesigns.{' '}
            <span className="font-semibold text-red-700">Experimental</span> sources target sites with active bot detection and often return zero results.
          </p>
          {scraperStatus?.paused && (
            <Badge variant="outline" className="text-yellow-500 border-yellow-500">Paused</Badge>
          )}
        </div>
        <Button onClick={() => runAll.mutate()} disabled={isAnyScrapeRunning} size="sm">
          {runAll.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Play className="h-4 w-4 mr-2" />
          )}
          Run All Enabled
        </Button>
      </div>

      {TIER_ORDER.map((tier) => {
        const entries = bySource[tier];
        if (entries.length === 0) return null;
        const style = TIER_STYLES[tier];
        const Icon = style.icon;

        return (
          <section key={tier} className="space-y-2">
            <div className="flex items-center gap-2">
              {Icon && <Icon className={`h-4 w-4 ${tier === 'high' ? 'text-emerald-600' : tier === 'medium' ? 'text-amber-600' : tier === 'low' ? 'text-red-600' : 'text-blue-600'}`} />}
              <h3 className="text-[14px] font-semibold">{style.label}</h3>
              <span className="text-[12px] text-muted-foreground">· {TIER_TOOLTIPS[tier]}</span>
            </div>

            <div className="space-y-2">
              {entries.map((entry) => {
                const key = entry.id as JobSource;
                const enabled = settings.sources[entry.id]?.enabled ?? false;
                const log = latestLogs?.[entry.id];
                const isManual = entry.tier === 'manual';

                return (
                  <Card key={entry.id} className={entry.tier === 'low' ? 'border-red-500/20' : ''}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <CardTitle className="flex items-center gap-2 text-[14px]">
                            {entry.name}
                            <Badge variant="outline" className={`text-[10px] ${style.badge}`}>
                              {style.label}
                            </Badge>
                            {entry.countries.length <= 3 && (
                              <span className="text-[11px] text-muted-foreground font-normal">
                                {entry.countries.join(', ')}
                              </span>
                            )}
                          </CardTitle>
                          <CardDescription className="text-[12px] mt-1">{entry.description}</CardDescription>
                          {entry.warning && (
                            <p className="text-[11px] text-amber-600 mt-1 flex items-start gap-1">
                              <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                              <span>{entry.warning}</span>
                            </p>
                          )}
                        </div>
                        {!isManual && (
                          <Switch
                            checked={enabled}
                            onCheckedChange={(checked) => toggleSource(entry.id, checked)}
                          />
                        )}
                        {isManual && entry.url && (
                          <a
                            href={entry.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[12px] text-blue-600 hover:underline flex items-center gap-1 flex-shrink-0"
                          >
                            Open <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </CardHeader>
                    {!isManual && (
                      <CardContent className="pt-0 pb-3">
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5 text-[11px] text-muted-foreground">
                            <p>Last run: {formatDate(log?.completedAt ?? log?.startedAt ?? null)}</p>
                            <p>
                              <span title="Total listings the scraper pulled, including duplicates.">
                                Hits: {log?.jobsFound ?? 0}
                              </span>
                              {' · '}
                              <span
                                className={(log?.jobsAfterDedup ?? 0) > 0 ? 'text-emerald-600 dark:text-emerald-400 font-medium' : ''}
                                title="Unique new jobs actually added after dedup."
                              >
                                New: {log?.jobsAfterDedup ?? 0}
                              </span>
                            </p>
                            {log?.error && <p className="text-destructive">Error: {log.error.slice(0, 120)}</p>}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7"
                            onClick={() => runSource.mutate(key)}
                            disabled={isAnyScrapeRunning || !enabled}
                          >
                            {runSource.isPending && runSource.variables === key ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Play className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
