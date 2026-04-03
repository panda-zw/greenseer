import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useSidecarHealth } from '@/hooks/useSidecarHealth';
import { Badge } from '@/components/ui/badge';

export function AboutSettings() {
  const { data: health, isError } = useSidecarHealth();

  return (
    <div className="space-y-6 pt-4">
      <Card>
        <CardHeader>
          <CardTitle>About Greenseer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Version</span>
            <span className="text-sm font-medium">0.1.0</span>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Sidecar Status</span>
            {isError ? (
              <Badge variant="destructive">Offline</Badge>
            ) : health ? (
              <Badge variant="secondary">
                Online (uptime: {health.uptime}s)
              </Badge>
            ) : (
              <Badge variant="outline">Checking...</Badge>
            )}
          </div>
          <Separator />
          <p className="text-xs text-muted-foreground">
            Greenseer automates your international job search by scraping listings,
            verifying visa sponsorship, matching against your CV, and generating
            tailored application documents.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
