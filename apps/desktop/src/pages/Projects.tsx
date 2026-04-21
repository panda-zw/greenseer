import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Plus,
  Save,
  Trash2,
  Loader2,
  FolderKanban,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ProjectDto } from '@greenseer/shared';

async function apiDelete(path: string) {
  const res = await fetch(`http://127.0.0.1:11434/api${path}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export function Projects() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newName, setNewName] = useState('');

  // Form state for editing
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editTechStack, setEditTechStack] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editHighlights, setEditHighlights] = useState('');

  const { data: projects, isLoading } = useQuery<ProjectDto[]>({
    queryKey: ['projects'],
    queryFn: () => apiGet('/projects'),
  });

  const selected = projects?.find((p) => p.id === selectedId);

  const loadProject = (p: ProjectDto) => {
    setSelectedId(p.id);
    setEditName(p.name);
    setEditDescription(p.description);
    setEditTechStack(p.techStack.join(', '));
    setEditUrl(p.url ?? '');
    setEditStartDate(p.startDate ?? '');
    setEditEndDate(p.endDate ?? '');
    setEditHighlights(p.highlights.join('\n'));
  };

  const createProject = useMutation({
    mutationFn: (name: string) =>
      apiPost<ProjectDto>('/projects', { name, description: '' }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      loadProject(data);
      setShowNewDialog(false);
      setNewName('');
      toast.success('Project created');
    },
  });

  const saveProject = useMutation({
    mutationFn: () => {
      if (!selectedId) throw new Error('No project selected');
      const techStack = editTechStack
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const highlights = editHighlights
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      return apiPut<ProjectDto>(`/projects/${selectedId}`, {
        name: editName,
        description: editDescription,
        techStack,
        url: editUrl.trim() || null,
        startDate: editStartDate.trim() || null,
        endDate: editEndDate.trim() || null,
        highlights,
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      loadProject(data);
      toast.success('Project saved');
    },
    onError: (err: any) => toast.error(err?.message || 'Save failed'),
  });

  const deleteProject = useMutation({
    mutationFn: (id: string) => apiDelete(`/projects/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setSelectedId(null);
      toast.success('Project deleted');
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Project List */}
      <div className="w-52 border-r border-border flex flex-col bg-card">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <h2 className="text-[13px] font-semibold">Projects</h2>
          <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
                <Plus className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="text-[15px]">New Project</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 pt-2">
                <div>
                  <Label className="text-[12px]">Project Name</Label>
                  <Input
                    placeholder="e.g. Oono Events"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newName.trim()) createProject.mutate(newName.trim());
                    }}
                    className="text-[13px] mt-1"
                  />
                </div>
                <Button
                  className="text-[13px]"
                  onClick={() => createProject.mutate(newName.trim())}
                  disabled={!newName.trim() || createProject.isPending}
                >
                  {createProject.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                  Create
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-1.5 space-y-0.5">
            {projects?.map((p) => (
              <button
                key={p.id}
                onClick={() => loadProject(p)}
                className={`w-full text-left px-3 py-2 rounded-lg text-[13px] transition-colors ${
                  selectedId === p.id
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:bg-secondary/50'
                }`}
              >
                <span className="truncate block">{p.name}</span>
                <span className="text-[11px] text-muted-foreground">
                  {p.techStack.length > 0 ? p.techStack.slice(0, 3).join(', ') : 'No tech stack'}
                </span>
              </button>
            ))}
            {(!projects || projects.length === 0) && (
              <p className="text-[12px] text-muted-foreground p-3">
                No projects yet. Add your projects so they can be included in generated CVs.
              </p>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Editor */}
      {selected ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
            <h3 className="text-[14px] font-semibold truncate">{editName || 'Untitled Project'}</h3>
            <Button
              size="sm"
              className="h-8 text-[12px] ml-auto"
              onClick={() => saveProject.mutate()}
              disabled={saveProject.isPending}
            >
              {saveProject.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Save className="h-3 w-3 mr-1" />
              )}
              Save
            </Button>
            <Button
              variant="ghost" size="sm"
              className="h-8 text-[12px] text-destructive hover:text-destructive"
              onClick={() => deleteProject.mutate(selected.id)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4 max-w-2xl">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[12px]">Project Name</Label>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="text-[13px] mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[12px]">
                    URL <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input
                    value={editUrl}
                    onChange={(e) => setEditUrl(e.target.value)}
                    placeholder="https://github.com/..."
                    className="text-[13px] mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[12px]">
                    Start Date <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input
                    value={editStartDate}
                    onChange={(e) => setEditStartDate(e.target.value)}
                    placeholder="e.g. Jan 2024"
                    className="text-[13px] mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[12px]">
                    End Date <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input
                    value={editEndDate}
                    onChange={(e) => setEditEndDate(e.target.value)}
                    placeholder="e.g. Present"
                    className="text-[13px] mt-1"
                  />
                </div>
              </div>

              <div>
                <Label className="text-[12px]">Tech Stack</Label>
                <Input
                  value={editTechStack}
                  onChange={(e) => setEditTechStack(e.target.value)}
                  placeholder="React, TypeScript, Node.js, PostgreSQL (comma-separated)"
                  className="text-[13px] mt-1"
                />
                {editTechStack && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {editTechStack.split(',').map((t) => t.trim()).filter(Boolean).map((tech) => (
                      <Badge key={tech} variant="secondary" className="text-[11px]">{tech}</Badge>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <Label className="text-[12px]">Description</Label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full h-28 mt-1 bg-muted/30 border border-border rounded-lg p-3 text-[13px] leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="What does this project do? What problem does it solve?"
                />
              </div>

              <div>
                <Label className="text-[12px]">
                  Key Achievements / Highlights
                  <span className="text-muted-foreground font-normal ml-1">(one per line)</span>
                </Label>
                <textarea
                  value={editHighlights}
                  onChange={(e) => setEditHighlights(e.target.value)}
                  className="w-full h-32 mt-1 bg-muted/30 border border-border rounded-lg p-3 text-[13px] leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                  placeholder={"Reduced page load time by 60% through SSR + edge caching\nServing 5,000+ monthly active users\nBuilt offline-first architecture with service workers"}
                />
              </div>

              <Card className="bg-muted/30">
                <CardContent className="p-3">
                  <p className="text-[12px] text-muted-foreground">
                    Projects you add here are automatically available to the CV Generator.
                    When generating a CV, the AI will pick the most relevant projects based
                    on the job description and include them in the PROJECTS section.
                  </p>
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
            <FolderKanban className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-[14px] font-medium">No project selected</p>
          <p className="text-[13px] text-muted-foreground text-center max-w-xs">
            Add your projects here — they'll be automatically included in generated CVs when relevant to the job description.
          </p>
        </div>
      )}
    </div>
  );
}
