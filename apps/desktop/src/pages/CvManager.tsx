import { useState, useRef, useEffect } from 'react';
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
  FileText,
  Plus,
  Save,
  Star,
  Trash2,
  X,
  History,
  RotateCcw,
  Loader2,
  Upload,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import type { CvProfileDto, StructuredCV } from '@greenseer/shared';
import { textToStructuredCv } from '@greenseer/shared';
import { StructuredCvEditor } from '@/components/StructuredCvEditor';

async function apiDelete(path: string) {
  const res = await fetch(`http://127.0.0.1:11434/api${path}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

/**
 * CvManager architecture:
 *
 * - `body` (raw text) is the canonical source of truth on the server.
 * - `structured` is a derived, persisted cache of the parsed form.
 *
 * Data flow:
 * - Raw mode edits `editBody`. Saving sends { body: editBody } → server saves
 *   verbatim and invalidates the server-side structured cache.
 * - Structured mode edits `structuredCv`. Saving sends { structured } → server
 *   persists it. If the server's `body` was empty, it backfills body from the
 *   structured data.
 * - When the user opens structured mode and `structuredCv` is null (fresh load,
 *   or just invalidated by a raw save), we call the AI parse endpoint to fill
 *   it in. A heuristic is used as instant local fallback while AI runs.
 * - Raw and structured never cross-contaminate on save: whichever mode the
 *   user saves from is the only field sent.
 */
export function CvManager() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [editName, setEditName] = useState('');
  const [newSkill, setNewSkill] = useState('');
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [editorMode, setEditorMode] = useState<'structured' | 'raw'>('raw');
  const [structuredCv, setStructuredCv] = useState<StructuredCV | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');

  const { data: profiles, isLoading } = useQuery<CvProfileDto[]>({
    queryKey: ['cv-profiles'],
    queryFn: () => apiGet('/cv/profiles'),
  });

  const selected = profiles?.find((p) => p.id === selectedId);

  // Load local editor state from the selected profile. Uses selectedId as the
  // dependency so this fires on profile switch and on every refetch of the
  // selected profile (so that post-save server state gets pulled back in).
  useEffect(() => {
    if (!selected) return;
    setEditBody(selected.body);
    setStructuredCv(selected.structured);
    setEditName(selected.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, selected?.updatedAt]);

  // Auto-select first profile on initial load.
  useEffect(() => {
    if (!selectedId && profiles && profiles.length > 0) {
      setSelectedId(profiles[0].id);
    }
  }, [profiles, selectedId]);

  const selectProfile = (p: CvProfileDto) => {
    setSelectedId(p.id);
    // Reset mode to raw on profile switch — the user can toggle back if desired.
    setEditorMode('raw');
  };

  const createProfile = useMutation({
    mutationFn: (data: { name: string; body: string }) =>
      apiPost<CvProfileDto>('/cv/profiles', data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['cv-profiles'] });
      setSelectedId(data.id);
      setEditorMode('raw');
      setShowNewDialog(false);
      setNewProfileName('');
      toast.success('Profile created');
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to create profile'),
  });

  const updateProfile = useMutation({
    mutationFn: () => {
      if (!selectedId) throw new Error('No profile selected');
      // Send ONLY the field matching the current edit mode. Never both.
      // This is what guarantees raw-text saves are verbatim.
      const payload: { name: string; body?: string; structured?: StructuredCV | null } = {
        name: editName,
      };
      if (editorMode === 'raw') {
        payload.body = editBody;
      } else {
        payload.structured = structuredCv;
      }
      return apiPut<CvProfileDto>(`/cv/profiles/${selectedId}`, payload);
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['cv-profiles'] });
      // Sync local state from the authoritative server response.
      setEditBody(updated.body);
      setStructuredCv(updated.structured);
      toast.success('Saved');
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to save'),
  });

  const parseStructured = useMutation({
    mutationFn: () => apiPost<CvProfileDto>(`/cv/profiles/${selectedId}/parse-structured`),
    onSuccess: (updated) => {
      setStructuredCv(updated.structured);
      queryClient.invalidateQueries({ queryKey: ['cv-profiles'] });
      toast.success('Parsed from raw text');
    },
    onError: (err: any) => {
      // Even on AI failure the service falls back to heuristic, so an error
      // here is unusual. Surface it but also populate a local heuristic parse
      // so the user isn't stuck.
      toast.error(err?.message || 'AI parse failed — using heuristic parser');
      setStructuredCv(textToStructuredCv(editBody));
    },
  });

  const deleteProfile = useMutation({
    mutationFn: (id: string) => apiDelete(`/cv/profiles/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cv-profiles'] });
      setSelectedId(null);
      toast.success('Profile deleted');
    },
  });

  const setDefault = useMutation({
    mutationFn: (id: string) => apiPost(`/cv/profiles/${id}/default`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cv-profiles'] });
      toast.success('Set as default');
    },
  });

  const updateSkills = useMutation({
    mutationFn: (skills: string[]) =>
      apiPut(`/cv/profiles/${selectedId}/skills`, { skills }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cv-profiles'] }),
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('http://127.0.0.1:11434/api/cv/parse-file', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        // Surface the server's actual error message so the user can diagnose.
        let msg = `Upload failed (${res.status})`;
        try {
          const body = await res.json();
          if (body?.message) msg = Array.isArray(body.message) ? body.message.join(', ') : body.message;
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      const data = await res.json();
      // Replace the raw body with the extracted text and switch to Raw mode so
      // the user can see exactly what was imported. Clear any stale structured
      // state — it will be re-derived the next time structured view opens.
      setEditBody(data.text);
      setStructuredCv(null);
      setEditorMode('raw');
      toast.success(`Extracted ${data.text.length} chars from ${file.name}. Click Save to persist.`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to parse file');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const addSkill = () => {
    const skill = newSkill.trim();
    if (!skill || !selected || selected.skills.includes(skill)) return;
    updateSkills.mutate([...selected.skills, skill]);
    setNewSkill('');
  };

  const removeSkill = (skill: string) => {
    if (!selected) return;
    updateSkills.mutate(selected.skills.filter((s) => s !== skill));
  };

  // Switch to structured mode. If we have no cached structured data, trigger
  // an AI parse (with instant heuristic fallback so the editor is usable
  // immediately).
  const switchToStructured = () => {
    setEditorMode('structured');
    if (!structuredCv) {
      if (editBody.trim()) {
        // Optimistic instant view from heuristic parser.
        setStructuredCv(textToStructuredCv(editBody));
        // Kick off AI parse in the background for a more accurate result.
        parseStructured.mutate();
      } else {
        // Empty CV — give the user an empty skeleton to fill in.
        setStructuredCv({
          summary: '',
          experience: [],
          education: [],
          projects: [],
          certifications: [],
        });
      }
    }
  };

  // Completeness indicator
  const commonSkills = ['TypeScript', 'JavaScript', 'Python', 'React', 'Node.js', 'Docker', 'AWS', 'PostgreSQL', 'Git', 'Kubernetes', 'Go', 'Java', 'Terraform', 'CI/CD', 'GraphQL'];
  const coveredCount = selected ? commonSkills.filter((s) => selected.skills.some((sk) => sk.toLowerCase() === s.toLowerCase())).length : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Profile List */}
      <div className="w-52 border-r border-border flex flex-col bg-card">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <h2 className="text-[13px] font-semibold">Profiles</h2>
          <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
                <Plus className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="text-[15px]">New CV Profile</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 pt-2">
                <div>
                  <Label className="text-[12px]">Profile Name</Label>
                  <Input
                    placeholder="e.g. Backend Focus"
                    value={newProfileName}
                    onChange={(e) => setNewProfileName(e.target.value)}
                    className="text-[13px] mt-1"
                  />
                </div>
                <Button
                  className="text-[13px]"
                  onClick={() => createProfile.mutate({ name: newProfileName, body: '' })}
                  disabled={!newProfileName.trim() || createProfile.isPending}
                >
                  {createProfile.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                  Create
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-1.5 space-y-0.5">
            {profiles?.map((p) => (
              <button
                key={p.id}
                onClick={() => selectProfile(p)}
                className={`w-full text-left px-3 py-2 rounded-lg text-[13px] transition-colors ${
                  selectedId === p.id
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:bg-secondary/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  {p.isDefault && <Star className="h-3 w-3 text-amber-500 flex-shrink-0" />}
                  <span className="truncate">{p.name}</span>
                </div>
                <span className="text-[11px] text-muted-foreground">{p.skills.length} skills</span>
              </button>
            ))}
            {(!profiles || profiles.length === 0) && (
              <p className="text-[12px] text-muted-foreground p-3">
                No profiles yet.
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
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-44 h-8 text-[13px]"
            />
            <Button
              size="sm"
              className="h-8 text-[12px]"
              onClick={() => updateProfile.mutate()}
              disabled={updateProfile.isPending}
            >
              {updateProfile.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Save className="h-3 w-3 mr-1" />
              )}
              Save {editorMode === 'raw' ? 'Raw' : 'Structured'}
            </Button>
            {!selected.isDefault && (
              <Button variant="outline" size="sm" className="h-8 text-[12px]" onClick={() => setDefault.mutate(selected.id)}>
                <Star className="h-3 w-3 mr-1" />
                Set Default
              </Button>
            )}
            <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp" className="hidden" onChange={handleFileUpload} />
            <Button variant="outline" size="sm" className="h-8 text-[12px]" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Upload className="h-3 w-3 mr-1" />}
              Upload
            </Button>
            <VersionHistory profileId={selected.id} onRestore={() => queryClient.invalidateQueries({ queryKey: ['cv-profiles'] })} />
            <div className="ml-auto">
              <Button variant="ghost" size="sm" className="h-8 text-[12px] text-destructive hover:text-destructive" onClick={() => deleteProfile.mutate(selected.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Editor mode toggle */}
          <div className="flex-shrink-0 flex items-center gap-1 px-4 py-1.5 border-b border-border">
            <button
              onClick={switchToStructured}
              className={`text-[12px] px-2.5 py-1 rounded transition-colors ${editorMode === 'structured' ? 'bg-secondary text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Structured
            </button>
            <button
              onClick={() => setEditorMode('raw')}
              className={`text-[12px] px-2.5 py-1 rounded transition-colors ${editorMode === 'raw' ? 'bg-secondary text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Raw Text
            </button>
            {editorMode === 'structured' && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 ml-2 text-[11px] text-muted-foreground"
                onClick={() => parseStructured.mutate()}
                disabled={parseStructured.isPending || !editBody.trim()}
                title="Re-parse the structured view from the current raw text using AI"
              >
                {parseStructured.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <RefreshCw className="h-3 w-3 mr-1" />
                )}
                Re-parse from Raw
              </Button>
            )}
            <span className="ml-auto text-[11px] text-muted-foreground">
              {editorMode === 'raw'
                ? 'Raw text saves verbatim — exactly what you type.'
                : 'Structured edits save independently; raw text is untouched.'}
            </span>
          </div>

          <div className="flex-1 flex overflow-hidden">
            {/* Editor */}
            {editorMode === 'structured' ? (
              <div className="flex-1 overflow-hidden">
                {structuredCv ? (
                  <StructuredCvEditor
                    cv={structuredCv}
                    onChange={(cv) => setStructuredCv(cv)}
                    profileId={selected.id}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span className="text-[12px]">Parsing raw text…</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 p-4">
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  className="w-full h-full bg-muted/30 border border-border rounded-lg p-4 text-[13px] leading-relaxed font-mono resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="Paste your complete CV here..."
                />
              </div>
            )}

            {/* Skills Panel */}
            <div className="w-60 border-l border-border flex flex-col bg-card">
              <div className="p-3 border-b border-border">
                <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Skills Inventory</h3>
                {/* Completeness */}
                <div className="flex items-center gap-2 mt-2">
                  <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${Math.min(100, (coveredCount / 10) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-muted-foreground">{selected.skills.length}</span>
                </div>
              </div>

              <div className="p-3">
                <div className="flex gap-1">
                  <Input
                    value={newSkill}
                    onChange={(e) => setNewSkill(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addSkill()}
                    placeholder="Add skill..."
                    className="h-7 text-[12px]"
                  />
                  <Button variant="outline" size="sm" className="h-7 px-2" onClick={addSkill}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <ScrollArea className="flex-1 px-3 pb-3">
                <div className="flex flex-wrap gap-1">
                  {selected.skills.map((skill) => (
                    <Badge key={skill} variant="secondary" className="text-[11px] gap-1 h-6">
                      {skill}
                      <button onClick={() => removeSkill(skill)} className="hover:text-destructive">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  ))}
                  {selected.skills.length === 0 && (
                    <p className="text-[12px] text-muted-foreground leading-relaxed">
                      Paste your CV and save — skills will be extracted automatically.
                    </p>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
            <FileText className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-[14px] font-medium">No profile selected</p>
          <p className="text-[13px] text-muted-foreground">Create a profile to start managing your CV.</p>
        </div>
      )}
    </div>
  );
}

function VersionHistory({
  profileId,
  onRestore,
}: {
  profileId: string;
  onRestore: () => void;
}) {
  const [open, setOpen] = useState(false);

  const { data: versions } = useQuery<{ body: string; skills: string[]; savedAt: string }[]>({
    queryKey: ['cv-versions', profileId],
    queryFn: () => apiGet(`/cv/profiles/${profileId}/versions`),
    enabled: open,
  });

  const restore = useMutation({
    mutationFn: (index: number) =>
      apiPost(`/cv/profiles/${profileId}/versions/${index}/restore`),
    onSuccess: () => {
      onRestore();
      setOpen(false);
      toast.success('Version restored');
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-[12px]">
          <History className="h-3 w-3 mr-1" />
          History
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[70vh]">
        <DialogHeader>
          <DialogTitle className="text-[15px]">Version History</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[50vh]">
          <div className="space-y-2">
            {versions?.map((v, i) => (
              <Card key={i}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-muted-foreground">
                      {new Date(v.savedAt).toLocaleString()}
                    </span>
                    <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={() => restore.mutate(i)}>
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Restore
                    </Button>
                  </div>
                  <p className="text-[12px] text-muted-foreground line-clamp-2 mt-1">
                    {v.body.slice(0, 150)}...
                  </p>
                </CardContent>
              </Card>
            ))}
            {versions?.length === 0 && (
              <p className="text-[13px] text-muted-foreground text-center py-4">
                No versions yet. Save your CV to create the first snapshot.
              </p>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
