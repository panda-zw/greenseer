import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPut } from '@/lib/api';
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable as useDndDroppable,
  useDraggable,
} from '@dnd-kit/core';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Kanban,
  List,
  BarChart3,
  X,
  AlertCircle,
  Clock,
  ArrowRight,
  Zap,
  FileText,
  Loader2,
  Copy,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';
import type { GeneratedDocumentDto } from '@greenseer/shared';
import {
  APPLICATION_STATUSES,
  type ApplicationDto,
  type ApplicationStatus,
} from '@greenseer/shared';

export function Tracker() {
  const queryClient = useQueryClient();
  const [selectedApp, setSelectedApp] = useState<ApplicationDto | null>(null);

  const { data: apps } = useQuery<ApplicationDto[]>({
    queryKey: ['applications'],
    queryFn: () => apiGet('/tracker/applications'),
  });

  const { data: stats } = useQuery<{
    byStatus: Record<string, number>;
    total: number;
    avgDaysToScreening: number | null;
    avgDaysToInterview: number | null;
    interviewToOfferRate: number | null;
    responseRate: number | null;
  }>({
    queryKey: ['tracker-stats'],
    queryFn: () => apiGet('/tracker/statistics'),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ApplicationStatus }) =>
      apiPut(`/tracker/applications/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['tracker-stats'] });
    },
  });

  const updateNotes = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      apiPut(`/tracker/applications/${id}/notes`, { notes }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications'] }),
  });

  const updateSalary = useMutation({
    mutationFn: ({ id, salaryOffer }: { id: string; salaryOffer: string }) =>
      apiPut(`/tracker/applications/${id}/salary`, { salaryOffer }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications'] }),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const appId = active.id as string;
    const newStatus = over.id as ApplicationStatus;
    const app = allApps.find((a) => a.id === appId);
    if (app && app.status !== newStatus) {
      updateStatus.mutate({ id: appId, status: newStatus });
    }
  };

  const allApps = apps || [];

  // Build action items
  const actionItems = buildActionItems(allApps);

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Tabs defaultValue="actions" className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-shrink-0 flex items-center justify-between border-b border-border px-5">
            <div className="flex items-center gap-6">
              <TabsList className="h-auto bg-transparent p-0 rounded-none gap-0">
                {[
                  { value: 'actions', label: 'Actions', icon: Zap },
                  { value: 'board', label: 'Board', icon: Kanban },
                  { value: 'list', label: 'List', icon: List },
                  { value: 'stats', label: 'Stats', icon: BarChart3 },
                ].map(({ value, label, icon: Icon }) => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    className="text-[13px] px-3 py-2.5 rounded-none shadow-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none text-muted-foreground data-[state=active]:text-foreground"
                  >
                    <Icon className="h-3.5 w-3.5 mr-1.5" />{label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            <span className="text-[12px] text-muted-foreground">{allApps.length} tracked</span>
          </div>

          {/* Actions Tab */}
          <TabsContent value="actions" className="flex-1 m-0 overflow-hidden">
            {actionItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
                <Zap className="h-8 w-8 text-muted-foreground" />
                <p className="text-[14px] font-medium">All caught up</p>
                <p className="text-[13px] text-muted-foreground max-w-xs">No actions needed right now. Save jobs from the feed to start tracking.</p>
              </div>
            ) : (
              <ScrollArea className="h-full">
                <div className="p-5 space-y-3 max-w-2xl mx-auto">
                  {actionItems.map((item, i) => (
                    <Card key={i} className="cursor-pointer hover:bg-card/80" onClick={() => setSelectedApp(item.app)}>
                      <CardContent className="p-3.5 flex items-center gap-3">
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${item.iconBg}`}>
                          <item.icon className={`h-4 w-4 ${item.iconColor}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-foreground">{item.title}</p>
                          <p className="text-[12px] text-muted-foreground mt-0.5">{item.subtitle}</p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          {/* Kanban Board */}
          <TabsContent value="board" className="flex-1 m-0 overflow-hidden">
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              <div className="flex h-full overflow-x-auto p-4 gap-2">
                {APPLICATION_STATUSES.map(({ value, label }) => (
                  <KanbanColumn
                    key={value}
                    status={value}
                    label={label}
                    apps={allApps.filter((a) => a.status === value)}
                    onSelect={setSelectedApp}
                  />
                ))}
              </div>
            </DndContext>
          </TabsContent>

          {/* List View */}
          <TabsContent value="list" className="flex-1 m-0">
            <ScrollArea className="h-full">
              <table className="w-full text-[13px]">
                <thead className="border-b border-border bg-muted/30 sticky top-0">
                  <tr>
                    <th className="text-left p-3 font-medium text-[12px] text-muted-foreground">Company</th>
                    <th className="text-left p-3 font-medium text-[12px] text-muted-foreground">Role</th>
                    <th className="text-left p-3 font-medium text-[12px] text-muted-foreground">Status</th>
                    <th className="text-left p-3 font-medium text-[12px] text-muted-foreground">Last Update</th>
                  </tr>
                </thead>
                <tbody>
                  {allApps.map((app) => (
                    <tr
                      key={app.id}
                      className="border-b border-border hover:bg-muted/20 cursor-pointer"
                      onClick={() => setSelectedApp(app)}
                    >
                      <td className="p-3 font-medium">{app.job?.company || '—'}</td>
                      <td className="p-3 text-muted-foreground">{app.job?.title || '—'}</td>
                      <td className="p-3">
                        <Badge variant="outline" className="text-[11px]">
                          {APPLICATION_STATUSES.find((s) => s.value === app.status)?.label}
                        </Badge>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {new Date(app.updatedAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                  {allApps.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-[13px] text-muted-foreground">
                        No applications yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </ScrollArea>
          </TabsContent>

          {/* Stats */}
          <TabsContent value="stats" className="flex-1 m-0 p-5">
            {stats ? (
              <div className="grid grid-cols-2 gap-3 max-w-md">
                <StatCard label="Total" value={stats.total} />
                <StatCard label="Response Rate" value={stats.responseRate != null ? `${stats.responseRate}%` : '—'} />
                <StatCard label="Avg Days to Screening" value={stats.avgDaysToScreening ?? '—'} />
                <StatCard label="Avg Days to Interview" value={stats.avgDaysToInterview ?? '—'} />
                <StatCard label="Interview to Offer" value={stats.interviewToOfferRate != null ? `${stats.interviewToOfferRate}%` : '—'} />
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">Loading...</p>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Detail Panel */}
      {selectedApp && (
        <DetailPanel
          app={selectedApp}
          onClose={() => setSelectedApp(null)}
          onUpdateNotes={(n) => updateNotes.mutate({ id: selectedApp.id, notes: n })}
          onUpdateSalary={(s) => updateSalary.mutate({ id: selectedApp.id, salaryOffer: s })}
          onUpdateStatus={(s) => updateStatus.mutate({ id: selectedApp.id, status: s })}
        />
      )}
    </div>
  );
}

// --- Action Items Builder ---

interface ActionItem {
  icon: any;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle: string;
  app: ApplicationDto;
}

function buildActionItems(apps: ApplicationDto[]): ActionItem[] {
  const items: ActionItem[] = [];

  for (const app of apps) {
    const daysSinceUpdate = Math.floor(
      (Date.now() - new Date(app.updatedAt).getTime()) / 86400000,
    );

    if (app.status === 'applied' && daysSinceUpdate >= 14) {
      items.push({
        icon: AlertCircle,
        iconBg: 'bg-amber-500/10',
        iconColor: 'text-amber-500',
        title: `Follow up with ${app.job?.company || 'employer'}`,
        subtitle: `Applied ${daysSinceUpdate} days ago — no update yet`,
        app,
      });
    } else if (app.status === 'screening') {
      items.push({
        icon: Clock,
        iconBg: 'bg-blue-500/10',
        iconColor: 'text-blue-500',
        title: `Screening in progress — ${app.job?.company}`,
        subtitle: app.notes || `${app.job?.title} · ${daysSinceUpdate}d in this stage`,
        app,
      });
    } else if (app.status === 'interviewing') {
      items.push({
        icon: Zap,
        iconBg: 'bg-purple-500/10',
        iconColor: 'text-purple-500',
        title: `Interview stage — ${app.job?.company}`,
        subtitle: app.notes || `${app.job?.title} · Prepare and follow up`,
        app,
      });
    } else if (app.status === 'saved') {
      items.push({
        icon: ArrowRight,
        iconBg: 'bg-muted',
        iconColor: 'text-muted-foreground',
        title: `Generate docs for ${app.job?.company}`,
        subtitle: `${app.job?.title} — ready to prepare application`,
        app,
      });
    } else if (app.status === 'ready_to_apply') {
      items.push({
        icon: Zap,
        iconBg: 'bg-emerald-500/10',
        iconColor: 'text-emerald-500',
        title: `Submit application — ${app.job?.company}`,
        subtitle: `${app.job?.title} — documents ready, apply now`,
        app,
      });
    }
  }

  return items;
}

// --- Kanban Components ---

const COLUMN_COLORS: Record<string, { header: string; dot: string }> = {
  saved: { header: 'bg-zinc-500/10', dot: 'bg-zinc-400' },
  ready_to_apply: { header: 'bg-blue-500/10', dot: 'bg-blue-400' },
  applied: { header: 'bg-indigo-500/10', dot: 'bg-indigo-400' },
  screening: { header: 'bg-violet-500/10', dot: 'bg-violet-400' },
  interviewing: { header: 'bg-amber-500/10', dot: 'bg-amber-400' },
  offer: { header: 'bg-emerald-500/10', dot: 'bg-emerald-400' },
  rejected: { header: 'bg-red-500/10', dot: 'bg-red-400' },
  withdrawn: { header: 'bg-zinc-500/10', dot: 'bg-zinc-400' },
};

function KanbanColumn({
  status,
  label,
  apps,
  onSelect,
}: {
  status: ApplicationStatus;
  label: string;
  apps: ApplicationDto[];
  onSelect: (app: ApplicationDto) => void;
}) {
  const { setNodeRef } = useDndDroppable({ id: status });
  const colors = COLUMN_COLORS[status] || COLUMN_COLORS.saved;

  return (
    <div ref={setNodeRef} className="flex flex-col w-52 flex-shrink-0 rounded-lg border border-border bg-card">
      <div className={`px-2.5 py-2 rounded-t-lg ${colors.header}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className={`h-2 w-2 rounded-full ${colors.dot}`} />
            <span className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wider">{label}</span>
          </div>
          {apps.length > 0 && (
            <span className="text-[11px] text-muted-foreground font-medium">{apps.length}</span>
          )}
        </div>
      </div>
      <ScrollArea className="flex-1 p-1.5">
        <div className="space-y-1.5">
          {apps.map((app) => (
            <DraggableCard key={app.id} app={app} onSelect={onSelect} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function DraggableCard({
  app,
  onSelect,
}: {
  app: ApplicationDto;
  onSelect: (app: ApplicationDto) => void;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: app.id });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  const daysSinceUpdate = Math.floor(
    (Date.now() - new Date(app.updatedAt).getTime()) / 86400000,
  );

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="cursor-grab active:cursor-grabbing"
      onClick={() => onSelect(app)}
    >
      <CardContent className="p-2.5">
        <p className="text-[12px] font-medium text-foreground leading-tight break-words">{app.job?.title || '—'}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{app.job?.company || '—'}</p>
        <span className="text-[11px] text-muted-foreground">{daysSinceUpdate}d</span>
      </CardContent>
    </Card>
  );
}

// --- Detail Panel ---

function DetailPanel({
  app,
  onClose,
  onUpdateNotes,
  onUpdateSalary,
  onUpdateStatus,
}: {
  app: ApplicationDto & { job?: any };
  onClose: () => void;
  onUpdateNotes: (notes: string) => void;
  onUpdateSalary: (salary: string) => void;
  onUpdateStatus: (status: ApplicationStatus) => void;
}) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState(app.notes);
  const [salary, setSalary] = useState(app.salaryOffer || '');

  const { data: documents } = useQuery<GeneratedDocumentDto[]>({
    queryKey: ['tracker-docs', app.jobId],
    queryFn: () => apiGet(`/documents/job/${app.jobId}`),
  });

  const { data: profiles } = useQuery<{ id: string; isDefault: boolean }[]>({
    queryKey: ['cv-profiles-brief'],
    queryFn: () => apiGet('/cv/profiles'),
    staleTime: 60000,
  });

  const generateDocs = useMutation({
    mutationFn: async () => {
      const profile = profiles?.find((p) => p.isDefault) || profiles?.[0];
      if (!profile) throw new Error('No CV profile');
      await apiPost('/documents/generate', {
        jobId: app.jobId,
        jobDescription: app.job?.description || '',
        jobTitle: app.job?.title || '',
        company: app.job?.company || '',
        cvProfileId: profile.id,
        countryCode: 'AU',
      });
    },
    onSuccess: () => {
      toast.success('Documents generated');
      queryClient.invalidateQueries({ queryKey: ['tracker-docs', app.jobId] });
    },
    onError: (err: any) => toast.error(err.message || 'Generation failed'),
  });

  const latestDoc = documents?.[0];

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  const downloadText = (text: string, filename: string) => {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-96 border-l border-border flex flex-col bg-card overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="text-[13px] font-semibold">Details</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          <div>
            <h4 className="text-[14px] font-medium">{app.job?.title}</h4>
            <p className="text-[13px] text-muted-foreground">{app.job?.company}</p>
            {app.job?.salary && <p className="text-[12px] text-emerald-500 mt-0.5">{app.job.salary}</p>}
          </div>

          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Timeline</Label>
            <div className="mt-1.5 space-y-1.5">
              {app.history.map((h, i) => (
                <div key={i} className="flex items-center gap-2 text-[12px]">
                  <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground flex-shrink-0" />
                  <span className="font-medium">{APPLICATION_STATUSES.find((s) => s.value === h.status)?.label}</span>
                  <span className="text-muted-foreground">{new Date(h.timestamp).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Notes</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => onUpdateNotes(notes)}
              className="w-full h-20 mt-1.5 bg-muted/50 border border-border rounded-lg p-2.5 text-[12px] resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Interview feedback, recruiter contact..."
            />
          </div>

          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Offered Salary</Label>
            <Input
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
              onBlur={() => onUpdateSalary(salary)}
              placeholder="e.g. $120,000 AUD"
              className="h-8 text-[12px] mt-1.5"
            />
          </div>

          {/* Documents */}
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Documents</Label>
            {latestDoc ? (
              <div className="mt-1.5 space-y-2">
                <div className="rounded-lg bg-muted/50 p-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-medium text-foreground">Generated CV</span>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5" onClick={() => copyText(latestDoc.cvText, 'CV')}>
                        <Copy className="h-2.5 w-2.5 mr-0.5" /> Copy
                      </Button>
                      <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5" onClick={() => downloadText(latestDoc.cvText, `CV-${app.job?.company || 'job'}.txt`)}>
                        <Download className="h-2.5 w-2.5 mr-0.5" /> Save
                      </Button>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-2">{latestDoc.cvText.slice(0, 150)}...</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-medium text-foreground">Cover Letter</span>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5" onClick={() => copyText(latestDoc.coverLetter, 'Cover letter')}>
                        <Copy className="h-2.5 w-2.5 mr-0.5" /> Copy
                      </Button>
                      <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5" onClick={() => downloadText(latestDoc.coverLetter, `CoverLetter-${app.job?.company || 'job'}.txt`)}>
                        <Download className="h-2.5 w-2.5 mr-0.5" /> Save
                      </Button>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-2">{latestDoc.coverLetter.slice(0, 150)}...</p>
                </div>
                <Button variant="outline" size="sm" className="h-7 text-[11px] w-full" onClick={() => generateDocs.mutate()} disabled={generateDocs.isPending}>
                  {generateDocs.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <FileText className="h-3 w-3 mr-1" />}
                  Regenerate
                </Button>
              </div>
            ) : (
              <div className="mt-1.5">
                <Button size="sm" className="h-8 text-[12px] w-full" onClick={() => generateDocs.mutate()} disabled={generateDocs.isPending}>
                  {generateDocs.isPending ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <FileText className="h-3 w-3 mr-1.5" />}
                  {generateDocs.isPending ? 'Generating...' : 'Generate CV & Cover Letter'}
                </Button>
              </div>
            )}
          </div>

          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Move To</Label>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {APPLICATION_STATUSES.map(({ value, label }) => (
                <Button
                  key={value}
                  variant={app.status === value ? 'default' : 'outline'}
                  size="sm"
                  className="text-[11px] h-6 px-2"
                  onClick={() => onUpdateStatus(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-[22px] font-bold text-foreground mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}
