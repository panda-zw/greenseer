import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Trash2, Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type {
  StructuredCV,
  ExperienceEntry,
  EducationEntry,
  ProjectEntry,
  CertificationEntry,
} from '@greenseer/shared';

interface Props {
  cv: StructuredCV;
  onChange: (cv: StructuredCV) => void;
  profileId: string;
}

export function StructuredCvEditor({ cv, onChange }: Props) {
  const [aiInput, setAiInput] = useState('');

  const aiEdit = useMutation({
    mutationFn: async () => {
      // Send the current CV text + instruction to the AI refine endpoint
      const { structuredCvToText } = await import('@greenseer/shared');
      const currentText = structuredCvToText(cv);
      const result = await apiPost<{ text: string }>('/documents/refine-cv', {
        cvText: currentText,
        instruction: aiInput,
      });
      // Parse the refined text back into structured format
      const { textToStructuredCv } = await import('@greenseer/shared');
      return textToStructuredCv(result.text);
    },
    onSuccess: (result) => {
      onChange(result);
      setAiInput('');
      toast.success('CV updated by AI');
    },
    onError: () => toast.error('AI edit failed'),
  });

  const update = <K extends keyof StructuredCV>(key: K, value: StructuredCV[K]) => {
    onChange({ ...cv, [key]: value });
  };

  const addExperience = () => {
    update('experience', [...cv.experience, { title: '', company: '', location: '', startDate: '', endDate: '', bullets: [''] }]);
  };

  const updateExperience = (index: number, exp: ExperienceEntry) => {
    const list = [...cv.experience];
    list[index] = exp;
    update('experience', list);
  };

  const removeExperience = (index: number) => {
    update('experience', cv.experience.filter((_, i) => i !== index));
  };

  const addEducation = () => {
    update('education', [...cv.education, { degree: '', institution: '', year: '' }]);
  };

  const updateEducation = (index: number, edu: EducationEntry) => {
    const list = [...cv.education];
    list[index] = edu;
    update('education', list);
  };

  const removeEducation = (index: number) => {
    update('education', cv.education.filter((_, i) => i !== index));
  };

  const addProject = () => {
    update('projects', [...cv.projects, { name: '', techStack: '', description: '' }]);
  };

  const updateProject = (index: number, proj: ProjectEntry) => {
    const list = [...cv.projects];
    list[index] = proj;
    update('projects', list);
  };

  const removeProject = (index: number) => {
    update('projects', cv.projects.filter((_, i) => i !== index));
  };

  const addCertification = () => {
    update('certifications', [...cv.certifications, { name: '', year: '' }]);
  };

  const updateCertification = (index: number, cert: CertificationEntry) => {
    const list = [...cv.certifications];
    list[index] = cert;
    update('certifications', list);
  };

  const removeCertification = (index: number) => {
    update('certifications', cv.certifications.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">

          {/* Professional Summary */}
          <Section title="Professional Summary">
            <textarea
              value={cv.summary}
              onChange={(e) => update('summary', e.target.value)}
              placeholder="Brief overview of your professional background, key strengths, and what you're looking for..."
              className="w-full h-24 bg-muted/30 border border-border rounded-lg p-3 text-[13px] leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </Section>

          {/* Experience */}
          <Section title="Work Experience" onAdd={addExperience} addLabel="Add Position">
            {cv.experience.length === 0 && (
              <p className="text-[12px] text-muted-foreground">No experience added yet.</p>
            )}
            {cv.experience.map((exp, i) => (
              <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[11px] text-muted-foreground">Job Title</Label>
                      <Input
                        value={exp.title}
                        onChange={(e) => updateExperience(i, { ...exp, title: e.target.value })}
                        placeholder="e.g. Marketing Manager, Software Engineer"
                        className="h-8 text-[13px] mt-0.5"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] text-muted-foreground">Company</Label>
                      <Input
                        value={exp.company}
                        onChange={(e) => updateExperience(i, { ...exp, company: e.target.value })}
                        placeholder="e.g. Acme Corp"
                        className="h-8 text-[13px] mt-0.5"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] text-muted-foreground">Location</Label>
                      <Input
                        value={exp.location}
                        onChange={(e) => updateExperience(i, { ...exp, location: e.target.value })}
                        placeholder="e.g. London, UK"
                        className="h-8 text-[13px] mt-0.5"
                      />
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Label className="text-[11px] text-muted-foreground">Start</Label>
                        <Input
                          value={exp.startDate}
                          onChange={(e) => updateExperience(i, { ...exp, startDate: e.target.value })}
                          placeholder="Oct 2021"
                          className="h-8 text-[13px] mt-0.5"
                        />
                      </div>
                      <div className="flex-1">
                        <Label className="text-[11px] text-muted-foreground">End</Label>
                        <Input
                          value={exp.endDate}
                          onChange={(e) => updateExperience(i, { ...exp, endDate: e.target.value })}
                          placeholder="Present"
                          className="h-8 text-[13px] mt-0.5"
                        />
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost" size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive ml-2"
                    onClick={() => removeExperience(i)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Bullet points */}
                <div>
                  <Label className="text-[11px] text-muted-foreground">Key Achievements</Label>
                  <div className="space-y-1 mt-0.5">
                    {exp.bullets.map((bullet, bi) => (
                      <div key={bi} className="flex items-center gap-1">
                        <span className="text-[12px] text-muted-foreground w-4 text-center">•</span>
                        <Input
                          value={bullet}
                          onChange={(e) => {
                            const bullets = [...exp.bullets];
                            bullets[bi] = e.target.value;
                            updateExperience(i, { ...exp, bullets });
                          }}
                          placeholder="Describe an achievement or responsibility with measurable impact"
                          className="h-7 text-[12px] flex-1"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const bullets = [...exp.bullets];
                              bullets.splice(bi + 1, 0, '');
                              updateExperience(i, { ...exp, bullets });
                            }
                            if (e.key === 'Backspace' && !bullet && exp.bullets.length > 1) {
                              e.preventDefault();
                              const bullets = exp.bullets.filter((_, j) => j !== bi);
                              updateExperience(i, { ...exp, bullets });
                            }
                          }}
                        />
                      </div>
                    ))}
                    <Button
                      variant="ghost" size="sm"
                      className="h-6 text-[11px] text-muted-foreground"
                      onClick={() => updateExperience(i, { ...exp, bullets: [...exp.bullets, ''] })}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Add bullet
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </Section>

          {/* Education */}
          <Section title="Education" onAdd={addEducation} addLabel="Add Education">
            {cv.education.map((edu, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex-1 grid grid-cols-3 gap-2">
                  <Input
                    value={edu.degree}
                    onChange={(e) => updateEducation(i, { ...edu, degree: e.target.value })}
                    placeholder="BSc Computer Science"
                    className="h-8 text-[13px]"
                  />
                  <Input
                    value={edu.institution}
                    onChange={(e) => updateEducation(i, { ...edu, institution: e.target.value })}
                    placeholder="University of Zimbabwe"
                    className="h-8 text-[13px]"
                  />
                  <Input
                    value={edu.year}
                    onChange={(e) => updateEducation(i, { ...edu, year: e.target.value })}
                    placeholder="2018"
                    className="h-8 text-[13px]"
                  />
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeEducation(i)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </Section>

          {/* Projects */}
          <Section title="Projects" onAdd={addProject} addLabel="Add Project">
            {cv.projects.map((proj, i) => (
              <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[11px] text-muted-foreground">Project Name</Label>
                      <Input
                        value={proj.name}
                        onChange={(e) => updateProject(i, { ...proj, name: e.target.value })}
                        placeholder="Project name"
                        className="h-8 text-[13px] mt-0.5"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] text-muted-foreground">Tools / Methods</Label>
                      <Input
                        value={proj.techStack}
                        onChange={(e) => updateProject(i, { ...proj, techStack: e.target.value })}
                        placeholder="Tools, methods, or technologies used"
                        className="h-8 text-[13px] mt-0.5"
                      />
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeProject(i)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">Description</Label>
                  <textarea
                    value={proj.description}
                    onChange={(e) => updateProject(i, { ...proj, description: e.target.value })}
                    placeholder="What you did, the outcome, and the impact..."
                    className="w-full h-16 bg-muted/30 border border-border rounded-lg p-2 text-[12px] leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-ring mt-0.5"
                  />
                </div>
              </div>
            ))}
          </Section>

          {/* Certifications */}
          <Section title="Certifications" onAdd={addCertification} addLabel="Add Certification">
            {cv.certifications.map((cert, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={cert.name}
                  onChange={(e) => updateCertification(i, { ...cert, name: e.target.value })}
                  placeholder="e.g. PMP, CPA, AWS Certified"
                  className="h-8 text-[13px] flex-1"
                />
                <Input
                  value={cert.year}
                  onChange={(e) => updateCertification(i, { ...cert, year: e.target.value })}
                  placeholder="2024"
                  className="h-8 text-[13px] w-20"
                />
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeCertification(i)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </Section>
        </div>
      </ScrollArea>

      {/* AI Assist Bar */}
      <div className="flex-shrink-0 border-t border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Input
            value={aiInput}
            onChange={(e) => setAiInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && aiInput.trim() && aiEdit.mutate()}
            placeholder="Ask AI to edit — e.g. 'Add my management experience', 'Make summary more concise', 'Rewrite bullets with metrics'..."
            className="flex-1 h-8 text-[13px]"
            disabled={aiEdit.isPending}
          />
          <Button
            size="sm" className="h-8 text-[12px]"
            onClick={() => aiEdit.mutate()}
            disabled={!aiInput.trim() || aiEdit.isPending}
          >
            {aiEdit.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
            Edit with AI
          </Button>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
  onAdd,
  addLabel,
}: {
  title: string;
  children: React.ReactNode;
  onAdd?: () => void;
  addLabel?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
        {onAdd && (
          <Button variant="ghost" size="sm" className="h-6 text-[11px] text-muted-foreground" onClick={onAdd}>
            <Plus className="h-3 w-3 mr-1" /> {addLabel || 'Add'}
          </Button>
        )}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
