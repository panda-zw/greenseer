import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ArrowRight, ArrowLeft, CheckCircle2, Briefcase, Key, Upload, Globe, Search, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { apiPost, apiPut } from '@/lib/api';
import { toast } from 'sonner';
import { SUPPORTED_COUNTRIES, type CountryConfig } from '@greenseer/shared';

interface Props {
  onComplete: () => void;
}

async function parseFileOnServer(file: File): Promise<{ text: string; filename: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('http://127.0.0.1:11434/api/cv/parse-file', {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Upload failed' }));
    throw new Error(err.message || 'Upload failed');
  }
  return res.json();
}

export function OnboardingWizard({ onComplete }: Props) {
  const [step, setStep] = useState(0);

  // Step 1: API Keys
  const [anthropicKey, setAnthropicKey] = useState('');
  const [adzunaAppId, setAdzunaAppId] = useState('');
  const [adzunaKey, setAdzunaKey] = useState('');

  // Step 2: CV
  const [cvName, setCvName] = useState('My CV');
  const [cvBody, setCvBody] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [showPasteMode, setShowPasteMode] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 3: Keywords
  const [keywords, setKeywords] = useState<string[]>(['software engineer', 'developer']);
  const [keywordInput, setKeywordInput] = useState('');

  // Step 4: Countries
  const [countries, setCountries] = useState<CountryConfig[]>(
    SUPPORTED_COUNTRIES.map((c) => ({ code: c.code, mode: 'relocate' as const, enabled: false })),
  );

  const [saving, setSaving] = useState(false);

  const toggleCountry = (code: string) => {
    setCountries((prev) =>
      prev.map((c) => (c.code === code ? { ...c, enabled: !c.enabled } : c)),
    );
  };

  const setCountryMode = (code: string, mode: 'relocate' | 'remote') => {
    setCountries((prev) =>
      prev.map((c) => (c.code === code ? { ...c, mode } : c)),
    );
  };

  const processFile = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const data = await parseFileOnServer(file);
      setCvBody(data.text);
      setCvName(file.name.replace(/\.\w+$/, ''));
      setUploadedFileName(file.name);
      toast.success(`Extracted text from ${file.name}`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to parse file');
    } finally {
      setUploading(false);
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      const ext = file.name.toLowerCase().split('.').pop();
      if (['pdf', 'docx', 'doc', 'txt', 'png', 'jpg', 'jpeg'].includes(ext || '')) {
        processFile(file);
      } else {
        toast.error('Please drop a PDF, DOCX, TXT, or image file');
      }
    }
  }, [processFile]);

  const finish = async () => {
    setSaving(true);
    const errors: string[] = [];

    // Save settings first — this is the most important step
    try {
      await apiPut('/settings', { search: { countries, keywords } });
    } catch {
      errors.push('settings');
    }

    // Save API keys — store in keychain AND push to sidecar directly
    if (anthropicKey || adzunaAppId) {
      try {
        // Store in OS keychain if running in Tauri
        if ('__TAURI_INTERNALS__' in window) {
          const { invoke } = await import('@tauri-apps/api/core');
          if (anthropicKey) await invoke('store_credential', { service: 'anthropic_api_key', key: anthropicKey });
          if (adzunaAppId) await invoke('store_credential', { service: 'adzuna_app_id', key: adzunaAppId });
          if (adzunaKey) await invoke('store_credential', { service: 'adzuna_api_key', key: adzunaKey });
        }
        // Always push to sidecar via HTTP
        await apiPost('/internal/keys', {
          anthropicKey: anthropicKey || undefined,
          adzunaAppId: adzunaAppId || undefined,
          adzunaKey: adzunaKey || undefined,
        });
      } catch {
        errors.push('API keys');
      }
    }

    // Create CV profile
    if (cvBody.trim()) {
      try {
        await apiPost('/cv/profiles', { name: cvName, body: cvBody });
      } catch {
        errors.push('CV profile');
      }
    }

    // Trigger first scrape (non-blocking)
    apiPost('/scraper/run').catch(() => {});

    localStorage.setItem('greenseer-onboarded', 'true');
    setSaving(false);

    if (errors.length > 0) {
      toast.error(`Some items failed to save: ${errors.join(', ')}. Check Settings.`);
    } else {
      toast.success('Setup complete — your first search is running!');
    }
    onComplete();
  };

  const enabledCountryCount = countries.filter((c) => c.enabled).length;

  const addKeyword = () => {
    const term = keywordInput.trim().toLowerCase();
    if (!term || keywords.includes(term)) return;
    setKeywords([...keywords, term]);
    setKeywordInput('');
  };

  const removeKeyword = (term: string) => {
    setKeywords(keywords.filter((k) => k !== term));
  };

  const steps = [
    { icon: Briefcase, title: 'Welcome to Greenseer', subtitle: 'Let\'s set up your automated job search in a few steps.' },
    { icon: Key, title: 'API Keys', subtitle: 'These power the AI analysis and job searching.' },
    { icon: Upload, title: 'Your CV', subtitle: 'Upload your CV and we\'ll extract everything automatically.' },
    { icon: Search, title: 'What are you looking for?', subtitle: 'Add the job titles and roles you want to search for.' },
    { icon: Globe, title: 'Target Countries', subtitle: 'Where are you looking for work?' },
  ];

  const current = steps[step];

  return (
    <div className="fixed inset-0 bg-background z-50 flex items-center justify-center">
      <div className="w-full max-w-lg mx-auto px-6">
        {/* Progress */}
        <div className="flex items-center gap-1.5 mb-8">
          {steps.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-foreground' : 'bg-muted'}`} />
          ))}
        </div>

        {/* Header */}
        <div className="mb-6">
          <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center mb-4">
            <current.icon className="h-5 w-5 text-foreground" />
          </div>
          <h1 className="text-[20px] font-semibold text-foreground">{current.title}</h1>
          <p className="text-[14px] text-muted-foreground mt-1">{current.subtitle}</p>
        </div>

        {/* Content */}
        <div className="min-h-[280px]">
          {/* Step 0: Welcome */}
          {step === 0 && (
            <div className="space-y-4">
              <p className="text-[14px] text-foreground/80 leading-relaxed">
                Greenseer runs in the background and automatically:
              </p>
              <div className="space-y-3">
                {[
                  'Searches job platforms across your target countries',
                  'Verifies which employers genuinely sponsor visas',
                  'Matches jobs against your CV and skills',
                  'Generates tailored CVs and cover letters',
                ].map((text, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <p className="text-[13px] text-foreground/80">{text}</p>
                  </div>
                ))}
              </div>
              <p className="text-[13px] text-muted-foreground mt-4">
                All data stays on your machine. You use your own API keys.
              </p>
            </div>
          )}

          {/* Step 1: API Keys */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <Label className="text-[13px]">Anthropic API Key</Label>
                <p className="text-[12px] text-muted-foreground mb-1.5">Powers AI analysis — get one at console.anthropic.com</p>
                <Input type="password" placeholder="sk-ant-..." value={anthropicKey} onChange={(e) => setAnthropicKey(e.target.value)} className="text-[13px]" />
              </div>
              <div>
                <Label className="text-[13px]">Adzuna App ID</Label>
                <p className="text-[12px] text-muted-foreground mb-1.5">Free job search API — get keys at developer.adzuna.com</p>
                <Input placeholder="Your App ID" value={adzunaAppId} onChange={(e) => setAdzunaAppId(e.target.value)} className="text-[13px]" />
              </div>
              <div>
                <Label className="text-[13px]">Adzuna API Key</Label>
                <Input type="password" placeholder="Your API Key" value={adzunaKey} onChange={(e) => setAdzunaKey(e.target.value)} className="text-[13px]" />
              </div>
              <p className="text-[12px] text-muted-foreground">You can add these later in Settings.</p>
            </div>
          )}

          {/* Step 2: CV Upload */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <Label className="text-[13px]">Profile Name</Label>
                <Input value={cvName} onChange={(e) => setCvName(e.target.value)} className="text-[13px] mt-1" placeholder="e.g. Full Stack, Backend Focus" />
              </div>

              {!showPasteMode ? (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx,.doc,.txt,.png,.jpg,.jpeg"
                    className="hidden"
                    onChange={handleFileInput}
                  />
                  <div
                    onClick={() => !uploading && fileInputRef.current?.click()}
                    onDragOver={handleDragOver}
                    onDragEnter={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`w-full border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-3 transition-colors cursor-pointer ${
                      isDragging
                        ? 'border-foreground bg-muted/50'
                        : uploadedFileName
                          ? 'border-emerald-500/40 bg-emerald-500/5'
                          : 'border-border hover:border-muted-foreground/40 hover:bg-muted/30'
                    } ${uploading ? 'opacity-60 pointer-events-none' : ''}`}
                  >
                    {uploading ? (
                      <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
                    ) : uploadedFileName ? (
                      <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                    ) : isDragging ? (
                      <Upload className="h-8 w-8 text-foreground" />
                    ) : (
                      <Upload className="h-8 w-8 text-muted-foreground" />
                    )}
                    <div className="text-center">
                      {uploadedFileName ? (
                        <>
                          <p className="text-[13px] font-medium text-foreground">{uploadedFileName}</p>
                          <p className="text-[12px] text-emerald-500 mt-0.5">Text extracted successfully</p>
                        </>
                      ) : isDragging ? (
                        <p className="text-[13px] font-medium text-foreground">Drop your file here</p>
                      ) : uploading ? (
                        <p className="text-[13px] font-medium text-foreground">Extracting text...</p>
                      ) : (
                        <>
                          <p className="text-[13px] font-medium text-foreground">
                            Drop your CV here or click to browse
                          </p>
                          <p className="text-[12px] text-muted-foreground mt-0.5">
                            PDF, DOCX, TXT, or image
                          </p>
                        </>
                      )}
                    </div>
                  </div>

                  {cvBody && (
                    <div className="rounded-lg bg-muted/30 border border-border p-3 max-h-28 overflow-y-auto">
                      <p className="text-[12px] text-muted-foreground whitespace-pre-wrap">
                        {cvBody.slice(0, 400)}{cvBody.length > 400 ? '...' : ''}
                      </p>
                    </div>
                  )}

                  <button
                    onClick={() => setShowPasteMode(true)}
                    className="text-[12px] text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                  >
                    Or paste text manually
                  </button>
                </>
              ) : (
                <>
                  <textarea
                    value={cvBody}
                    onChange={(e) => setCvBody(e.target.value)}
                    className="w-full h-44 bg-muted/30 border border-border rounded-lg p-3 text-[13px] font-mono leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder={`Paste your full CV here...\n\nInclude:\n- Work experience\n- Technical skills\n- Education\n- Projects & certifications`}
                  />
                  <button
                    onClick={() => setShowPasteMode(false)}
                    className="text-[12px] text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                  >
                    Or upload a file instead
                  </button>
                </>
              )}

              <p className="text-[12px] text-muted-foreground">
                This is your master CV — include everything. Greenseer will tailor it for each application.
              </p>
            </div>
          )}

          {/* Step 3: Keywords */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
                  placeholder="e.g. react native developer, backend engineer"
                  className="text-[13px]"
                />
                <Button onClick={addKeyword} variant="secondary" className="text-[13px]">
                  Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {keywords.map((kw) => (
                  <Badge key={kw} variant="secondary" className="text-[12px] gap-1 py-1">
                    {kw}
                    <button onClick={() => removeKeyword(kw)} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              {keywords.length === 0 && (
                <p className="text-[12px] text-muted-foreground">
                  Add at least one keyword so Greenseer knows what to search for.
                </p>
              )}
              <p className="text-[12px] text-muted-foreground">
                Each keyword is searched separately across all sources. More specific terms give better results.
              </p>
            </div>
          )}

          {/* Step 4: Countries */}
          {step === 4 && (
            <div className="space-y-2">
              {SUPPORTED_COUNTRIES.map(({ code, name }) => {
                const config = countries.find((c) => c.code === code)!;
                return (
                  <div key={code} className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-2.5">
                      <Switch checked={config.enabled} onCheckedChange={() => toggleCountry(code)} />
                      <span className="text-[13px] text-foreground">{name}</span>
                    </div>
                    {config.enabled && (
                      <Select value={config.mode} onValueChange={(v) => setCountryMode(code, v as 'relocate' | 'remote')}>
                        <SelectTrigger className="w-28 h-7 text-[12px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="relocate">Relocate</SelectItem>
                          <SelectItem value="remote">Remote</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                );
              })}
              {enabledCountryCount > 0 && (
                <p className="text-[12px] text-emerald-500 mt-2">
                  {enabledCountryCount} {enabledCountryCount === 1 ? 'country' : 'countries'} selected
                </p>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          {step > 0 ? (
            <Button variant="ghost" size="sm" className="text-[13px]" onClick={() => setStep(step - 1)}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back
            </Button>
          ) : <div />}

          {step < steps.length - 1 ? (
            <Button size="sm" className="text-[13px]" onClick={() => setStep(step + 1)}>
              {step === 0 ? 'Get Started' : 'Next'}
              <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          ) : (
            <Button size="sm" className="text-[13px]" onClick={finish} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
              Start Searching
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
