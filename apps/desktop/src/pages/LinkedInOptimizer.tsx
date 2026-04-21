import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Loader2,
  Sparkles,
  Copy,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Lightbulb,
  Target,
  Zap,
  History,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

interface LinkedInAnalysis {
  overallScore: number;
  headline: { current: string; issues: string[]; rewrite: string };
  about: { current: string; issues: string[]; rewrite: string };
  experience: { role: string; issues: string[]; improvedBullets: string[] }[];
  skills: { missing: string[]; reorder: string[]; reasoning: string };
  keywords: { strong: string[]; missing: string[]; reasoning: string };
  quickWins: string[];
}

function ScoreRing({ score }: { score: number }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color =
    score >= 80 ? 'text-emerald-500' : score >= 60 ? 'text-amber-500' : 'text-red-500';

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="100" height="100" className="-rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="currentColor" strokeWidth="6" className="text-muted/30" />
        <circle
          cx="50" cy="50" r={radius} fill="none" stroke="currentColor" strokeWidth="6"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" className={color}
        />
      </svg>
      <span className="absolute text-[20px] font-bold">{score}</span>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost" size="sm" className="h-7 text-[11px] text-muted-foreground"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success('Copied to clipboard');
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}

export function LinkedInOptimizer() {
  const [headline, setHeadline] = useState('');
  const [about, setAbout] = useState('');
  const [experience, setExperience] = useState('');
  const [skills, setSkills] = useState('');
  const [targetRoles, setTargetRoles] = useState('');
  const [positioning, setPositioning] = useState('');
  const [analysis, setAnalysis] = useState<LinkedInAnalysis | null>(null);
  const queryClient = useQueryClient();

  const { data: historyList } = useQuery<any[]>({
    queryKey: ['linkedin-history'],
    queryFn: () => apiGet('/documents/linkedin/history'),
  });

  const analyze = useMutation({
    mutationFn: () =>
      apiPost<LinkedInAnalysis>('/documents/linkedin/analyze', {
        headline: headline.trim() || undefined,
        about: about.trim() || undefined,
        experience: experience.trim() || undefined,
        skills: skills.trim() || undefined,
        targetRoles: targetRoles.trim() || undefined,
        positioning: positioning.trim() || undefined,
      }),
    onSuccess: (data) => {
      setAnalysis(data);
      queryClient.invalidateQueries({ queryKey: ['linkedin-history'] });
      toast.success('Analysis complete');
    },
    onError: (err: any) =>
      toast.error(err?.message || 'Analysis failed — check your Anthropic API key.'),
  });

  const deleteHistory = useMutation({
    mutationFn: (id: string) => {
      return fetch(`http://127.0.0.1:11434/api/documents/linkedin/history/${id}`, { method: 'DELETE' })
        .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['linkedin-history'] }),
  });

  const loadFromHistory = (entry: any) => {
    setAnalysis(entry.resultData as LinkedInAnalysis);
    const input = entry.inputData || {};
    if (input.headline) setHeadline(input.headline);
    if (input.about) setAbout(input.about);
    if (input.experience) setExperience(input.experience);
    if (input.skills) setSkills(input.skills);
    if (input.targetRoles) setTargetRoles(input.targetRoles);
    if (input.positioning) setPositioning(input.positioning);
  };

  const hasInput = headline.trim() || about.trim() || experience.trim() || skills.trim();

  return (
    <div className="flex h-full">
      {/* Input panel */}
      <div className="w-[380px] border-r border-border flex flex-col bg-card">
        <div className="flex-shrink-0 p-4 border-b border-border">
          <h2 className="text-[15px] font-semibold">LinkedIn Optimizer</h2>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Paste sections from your LinkedIn profile to get AI-powered suggestions.
            Your CV data is used automatically as context.
          </p>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-3">
            <div>
              <Label className="text-[12px]">
                Headline
                <span className="text-muted-foreground font-normal ml-1">(the line under your name)</span>
              </Label>
              <Input
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="e.g. Software Engineer at Company"
                className="text-[13px] mt-1"
                maxLength={120}
              />
              {headline && (
                <span className="text-[11px] text-muted-foreground">{headline.length}/120</span>
              )}
            </div>

            <div>
              <Label className="text-[12px]">About</Label>
              <textarea
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                className="w-full h-28 mt-1 bg-muted/30 border border-border rounded-lg p-3 text-[13px] leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Paste your About section..."
              />
            </div>

            <div>
              <Label className="text-[12px]">
                Experience
                <span className="text-muted-foreground font-normal ml-1">(roles + bullets)</span>
              </Label>
              <textarea
                value={experience}
                onChange={(e) => setExperience(e.target.value)}
                className="w-full h-36 mt-1 bg-muted/30 border border-border rounded-lg p-3 text-[13px] leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Paste your experience section — role titles, companies, bullets..."
              />
            </div>

            <div>
              <Label className="text-[12px]">Skills</Label>
              <textarea
                value={skills}
                onChange={(e) => setSkills(e.target.value)}
                className="w-full h-16 mt-1 bg-muted/30 border border-border rounded-lg p-3 text-[13px] leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="List your LinkedIn skills (comma-separated or one per line)..."
              />
            </div>

            <div>
              <Label className="text-[12px]">
                Target Roles
                <span className="text-muted-foreground font-normal ml-1">(optional)</span>
              </Label>
              <Input
                value={targetRoles}
                onChange={(e) => setTargetRoles(e.target.value)}
                placeholder="e.g. Senior Backend Engineer, Platform Engineer"
                className="text-[13px] mt-1"
              />
            </div>

            <div>
              <Label className="text-[12px]">
                Positioning
                <span className="text-muted-foreground font-normal ml-1">(recommended)</span>
              </Label>
              <textarea
                value={positioning}
                onChange={(e) => setPositioning(e.target.value)}
                className="w-full h-20 mt-1 bg-muted/30 border border-border rounded-lg p-3 text-[13px] leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="How you want to be positioned. E.g. 'full-stack engineer who ships scalable backend systems — not a mobile developer, even though I've shipped mobile apps.'"
              />
              <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                Anchors every rewrite. The AI won't narrow your identity based on whichever tech appears most often, and won't add technologies you deliberately left off.
              </p>
            </div>

            <Button
              onClick={() => analyze.mutate()}
              disabled={!hasInput || analyze.isPending}
              className="w-full text-[13px]"
            >
              {analyze.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              {analyze.isPending ? 'Analyzing...' : 'Analyze Profile'}
            </Button>

            {/* Analysis History */}
            {historyList && historyList.length > 0 && (
              <div className="pt-2 border-t border-border">
                <div className="flex items-center gap-1.5 mb-2">
                  <History className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">History</span>
                </div>
                <div className="space-y-1">
                  {historyList.map((entry: any) => (
                    <div
                      key={entry.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary/50 cursor-pointer group text-[12px]"
                      onClick={() => loadFromHistory(entry)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="truncate font-medium text-foreground">
                          Score: {entry.score}/100
                        </p>
                        <p className="truncate text-muted-foreground text-[11px]">
                          {new Date(entry.createdAt).toLocaleDateString()} · {new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <button
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                        onClick={(e) => { e.stopPropagation(); deleteHistory.mutate(entry.id); }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Results panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {analysis ? (
          <>
            <div className="flex-shrink-0 flex items-center gap-4 px-5 py-4 border-b border-border">
              <ScoreRing score={analysis.overallScore} />
              <div>
                <h3 className="text-[14px] font-semibold">
                  Profile Score: {analysis.overallScore}/100
                </h3>
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  {analysis.overallScore >= 80
                    ? 'Your profile is recruiter-ready. Fine-tune with the suggestions below.'
                    : analysis.overallScore >= 60
                      ? 'Good foundation — apply the suggestions below to boost recruiter visibility.'
                      : 'Significant improvements needed. Focus on the Quick Wins first.'}
                </p>
              </div>
              <Button
                variant="outline" size="sm" className="ml-auto h-8 text-[12px]"
                onClick={() => analyze.mutate()}
                disabled={analyze.isPending}
              >
                {analyze.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
                Re-analyze
              </Button>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-5 space-y-5 max-w-3xl">
                {/* Quick Wins */}
                {analysis.quickWins.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-[13px] flex items-center gap-2">
                        <Zap className="h-4 w-4 text-amber-500" />
                        Quick Wins
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {analysis.quickWins.map((win, i) => (
                        <div key={i} className="flex items-start gap-2 text-[13px]">
                          <ArrowRight className="h-3.5 w-3.5 mt-0.5 text-emerald-500 flex-shrink-0" />
                          <span>{win}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Headline */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-[13px] flex items-center gap-2">
                      <Target className="h-4 w-4 text-blue-500" />
                      Headline
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {analysis.headline.issues.length > 0 && (
                      <div className="space-y-1">
                        {analysis.headline.issues.map((issue, i) => (
                          <div key={i} className="flex items-start gap-2 text-[12px] text-muted-foreground">
                            <AlertCircle className="h-3 w-3 mt-0.5 text-amber-500 flex-shrink-0" />
                            <span>{issue}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {analysis.headline.rewrite && (
                      <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600">Suggested Headline</span>
                          <CopyButton text={analysis.headline.rewrite} />
                        </div>
                        <p className="text-[13px] font-medium">{analysis.headline.rewrite}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* About */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-[13px] flex items-center gap-2">
                      <Lightbulb className="h-4 w-4 text-amber-500" />
                      About Section
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {analysis.about.issues.length > 0 && (
                      <div className="space-y-1">
                        {analysis.about.issues.map((issue, i) => (
                          <div key={i} className="flex items-start gap-2 text-[12px] text-muted-foreground">
                            <AlertCircle className="h-3 w-3 mt-0.5 text-amber-500 flex-shrink-0" />
                            <span>{issue}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {analysis.about.rewrite && (
                      <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600">Suggested About</span>
                          <CopyButton text={analysis.about.rewrite} />
                        </div>
                        <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{analysis.about.rewrite}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Experience */}
                {analysis.experience.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-[13px]">Experience Improvements</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {analysis.experience.map((exp, i) => (
                        <div key={i} className="space-y-2">
                          <h4 className="text-[13px] font-semibold">{exp.role}</h4>
                          {exp.issues.length > 0 && (
                            <div className="space-y-1">
                              {exp.issues.map((issue, j) => (
                                <div key={j} className="flex items-start gap-2 text-[12px] text-muted-foreground">
                                  <AlertCircle className="h-3 w-3 mt-0.5 text-amber-500 flex-shrink-0" />
                                  <span>{issue}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {exp.improvedBullets.length > 0 && (
                            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600">Improved Bullets</span>
                                <CopyButton text={exp.improvedBullets.map((b) => `- ${b}`).join('\n')} />
                              </div>
                              <ul className="space-y-1">
                                {exp.improvedBullets.map((bullet, k) => (
                                  <li key={k} className="text-[13px] flex items-start gap-2">
                                    <span className="text-muted-foreground mt-0.5">-</span>
                                    <span>{bullet}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {i < analysis.experience.length - 1 && <div className="border-t border-border" />}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Keywords */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-[13px]">Keyword Analysis</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-[12px] text-muted-foreground">{analysis.keywords.reasoning}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {analysis.keywords.strong.map((kw) => (
                        <Badge key={kw} variant="secondary" className="text-[11px] bg-emerald-500/10 text-emerald-700 border-emerald-500/20">
                          {kw}
                        </Badge>
                      ))}
                      {analysis.keywords.missing.map((kw) => (
                        <Badge key={kw} variant="secondary" className="text-[11px] bg-red-500/10 text-red-700 border-red-500/20">
                          + {kw}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Skills */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-[13px]">Skills Optimization</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-[12px] text-muted-foreground">{analysis.skills.reasoning}</p>
                    {analysis.skills.reorder.length > 0 && (
                      <div>
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Recommended Top 5 Order</span>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {analysis.skills.reorder.map((skill, i) => (
                            <Badge key={skill} variant="outline" className="text-[11px]">
                              {i + 1}. {skill}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {analysis.skills.missing.length > 0 && (
                      <div>
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Skills to Add</span>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {analysis.skills.missing.map((skill) => (
                            <Badge key={skill} variant="secondary" className="text-[11px] bg-blue-500/10 text-blue-700 border-blue-500/20">
                              + {skill}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <Sparkles className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-[14px] font-medium">LinkedIn Profile Optimizer</p>
            <p className="text-[13px] text-muted-foreground text-center max-w-xs">
              Paste your LinkedIn profile sections on the left to get actionable suggestions for improving recruiter visibility. Your CV data is used automatically as context.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
