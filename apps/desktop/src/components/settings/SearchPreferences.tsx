import { useSettings, useUpdateSettings } from '@/hooks/useSettings';
import { SUPPORTED_COUNTRIES, type CountryConfig } from '@greenseer/shared';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export function SearchPreferences() {
  const { data: settings, isLoading } = useSettings();
  const { mutate: updateSettings } = useUpdateSettings();
  const [blocklistInput, setBlocklistInput] = useState('');
  const [keywordInput, setKeywordInput] = useState('');

  if (isLoading || !settings) {
    return <div className="pt-4 text-muted-foreground">Loading...</div>;
  }

  const toggleCountry = (code: string, enabled: boolean) => {
    const countries = settings.search.countries.map((c) =>
      c.code === code ? { ...c, enabled } : c,
    );
    updateSettings({ search: { ...settings.search, countries } });
  };

  const setCountryMode = (code: string, mode: 'relocate' | 'remote') => {
    const countries = settings.search.countries.map((c) =>
      c.code === code ? { ...c, mode } : c,
    );
    updateSettings({ search: { ...settings.search, countries } });
  };

  const setMinScore = (value: number[]) => {
    updateSettings({ search: { ...settings.search, minMatchScore: value[0] } });
  };

  const addBlocklistItem = () => {
    const term = blocklistInput.trim();
    if (!term || settings.search.blocklist.includes(term)) return;
    updateSettings({
      search: { ...settings.search, blocklist: [...settings.search.blocklist, term] },
    });
    setBlocklistInput('');
  };

  const removeBlocklistItem = (term: string) => {
    updateSettings({
      search: {
        ...settings.search,
        blocklist: settings.search.blocklist.filter((t) => t !== term),
      },
    });
  };

  const getCountryConfig = (code: string): CountryConfig => {
    return (
      settings.search.countries.find((c) => c.code === code) || {
        code,
        mode: 'relocate',
        enabled: false,
      }
    );
  };

  const addKeyword = () => {
    const term = keywordInput.trim().toLowerCase();
    if (!term || settings.search.keywords.includes(term)) return;
    updateSettings({
      search: { ...settings.search, keywords: [...settings.search.keywords, term] },
    });
    setKeywordInput('');
  };

  const removeKeyword = (term: string) => {
    updateSettings({
      search: {
        ...settings.search,
        keywords: settings.search.keywords.filter((t) => t !== term),
      },
    });
  };

  return (
    <div className="space-y-6 pt-4">
      <Card>
        <CardHeader>
          <CardTitle>Job Search Keywords</CardTitle>
          <CardDescription>
            What kind of roles are you looking for? Add job titles or keywords.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              placeholder="e.g. react native developer"
              onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
            />
            <Button onClick={addKeyword} variant="secondary">
              Add
            </Button>
          </div>
          {settings.search.keywords.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {settings.search.keywords.map((term) => (
                <Badge key={term} variant="secondary" className="gap-1">
                  {term}
                  <button onClick={() => removeKeyword(term)}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          {settings.search.keywords.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Add at least one keyword so Greenseer knows what to search for.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Target Countries</CardTitle>
          <CardDescription>
            Select countries and set whether you're looking to relocate or work remotely.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {SUPPORTED_COUNTRIES.map(({ code, name }) => {
            const config = getCountryConfig(code);
            return (
              <div key={code} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={config.enabled}
                    onCheckedChange={(checked) => toggleCountry(code, checked)}
                  />
                  <Label>{name}</Label>
                </div>
                {config.enabled && (
                  <Select
                    value={config.mode}
                    onValueChange={(v) => setCountryMode(code, v as 'relocate' | 'remote')}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="relocate">Relocate</SelectItem>
                      <SelectItem value="remote">Remote</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Minimum Match Score</CardTitle>
          <CardDescription>
            Jobs scoring below this threshold are hidden from the feed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Slider
              value={[settings.search.minMatchScore]}
              onValueChange={setMinScore}
              min={0}
              max={100}
              step={5}
              className="flex-1"
            />
            <span className="w-10 text-right text-sm font-medium">
              {settings.search.minMatchScore}%
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Keywords Blocklist</CardTitle>
          <CardDescription>
            Jobs containing these terms will be excluded.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={blocklistInput}
              onChange={(e) => setBlocklistInput(e.target.value)}
              placeholder="e.g. 10+ years"
              onKeyDown={(e) => e.key === 'Enter' && addBlocklistItem()}
            />
            <Button onClick={addBlocklistItem} variant="secondary">
              Add
            </Button>
          </div>
          {settings.search.blocklist.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {settings.search.blocklist.map((term) => (
                <Badge key={term} variant="secondary" className="gap-1">
                  {term}
                  <button onClick={() => removeBlocklistItem(term)}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Search Depth</CardTitle>
          <CardDescription>
            How many pages to scrape per source per keyword. More pages = more jobs but takes longer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Slider
              value={[settings.search.maxPagesPerSource || 2]}
              onValueChange={([v]) => updateSettings({ search: { ...settings.search, maxPagesPerSource: v } })}
              min={1}
              max={10}
              step={1}
              className="flex-1"
            />
            <span className="w-16 text-right text-sm font-medium">
              {settings.search.maxPagesPerSource || 2} {(settings.search.maxPagesPerSource || 2) === 1 ? 'page' : 'pages'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Each page has ~25-50 jobs. 2 pages ≈ 50-100 jobs per source per keyword.
          </p>
        </CardContent>
      </Card>

      <ClearJobsCard />
    </div>
  );
}

function ClearJobsCard() {
  const [clearing, setClearing] = useState(false);

  const clearJobs = async (olderThanDays?: number) => {
    const label = olderThanDays ? `jobs older than ${olderThanDays} days` : 'ALL jobs';
    if (!confirm(`Are you sure you want to delete ${label}? This cannot be undone.`)) return;
    setClearing(true);
    try {
      const { apiPost } = await import('@/lib/api');
      const result = await apiPost<{ deleted: number }>('/jobs/clear', { olderThanDays });
      toast.success(`Deleted ${result.deleted} jobs`);
    } catch {
      toast.error('Failed to clear jobs');
    }
    setClearing(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Clear Job Feed</CardTitle>
        <CardDescription>
          Remove scraped jobs to start fresh. This also removes their analysis and documents.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="text-[12px]" disabled={clearing} onClick={() => clearJobs(30)}>
          Clear older than 30 days
        </Button>
        <Button variant="outline" size="sm" className="text-[12px]" disabled={clearing} onClick={() => clearJobs(7)}>
          Clear older than 7 days
        </Button>
        <Button variant="destructive" size="sm" className="text-[12px]" disabled={clearing} onClick={() => clearJobs()}>
          {clearing ? 'Clearing...' : 'Clear all jobs'}
        </Button>
      </CardContent>
    </Card>
  );
}
