import { useSettings, useUpdateSettings } from '@/hooks/useSettings';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function ScheduleSettings() {
  const { data: settings, isLoading } = useSettings();
  const { mutate: updateSettings } = useUpdateSettings();

  if (isLoading || !settings) {
    return <div className="pt-4 text-muted-foreground">Loading...</div>;
  }

  const setInterval = (value: string) => {
    updateSettings({
      schedule: { ...settings.schedule, intervalHours: parseInt(value, 10) },
    });
  };

  const setQuietStart = (value: string) => {
    updateSettings({
      schedule: { ...settings.schedule, quietHoursStart: value || null },
    });
  };

  const setQuietEnd = (value: string) => {
    updateSettings({
      schedule: { ...settings.schedule, quietHoursEnd: value || null },
    });
  };

  return (
    <div className="space-y-6 pt-4">
      <Card>
        <CardHeader>
          <CardTitle>Scrape Frequency</CardTitle>
          <CardDescription>
            How often Greenseer checks for new job listings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={String(settings.schedule.intervalHours)}
            onValueChange={setInterval}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2">Every 2 hours</SelectItem>
              <SelectItem value="4">Every 4 hours</SelectItem>
              <SelectItem value="6">Every 6 hours</SelectItem>
              <SelectItem value="8">Every 8 hours</SelectItem>
              <SelectItem value="12">Every 12 hours</SelectItem>
              <SelectItem value="24">Once daily</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quiet Hours</CardTitle>
          <CardDescription>
            No scraping or notifications during this time range.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <div>
            <Label>Start</Label>
            <Input
              type="time"
              value={settings.schedule.quietHoursStart || ''}
              onChange={(e) => setQuietStart(e.target.value)}
              className="w-32"
            />
          </div>
          <span className="mt-6 text-muted-foreground">to</span>
          <div>
            <Label>End</Label>
            <Input
              type="time"
              value={settings.schedule.quietHoursEnd || ''}
              onChange={(e) => setQuietEnd(e.target.value)}
              className="w-32"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
