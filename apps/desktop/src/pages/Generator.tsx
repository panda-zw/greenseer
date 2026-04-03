import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Wand2, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { SUPPORTED_COUNTRIES } from '@greenseer/shared';
import type { CvProfileDto, GeneratedDocumentDto } from '@greenseer/shared';
import { DocumentPreview } from '@/components/DocumentPreview';

export function Generator() {
  const [jobDescription, setJobDescription] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [countryCode, setCountryCode] = useState('AU');
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [generatedDoc, setGeneratedDoc] = useState<GeneratedDocumentDto | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const { data: profiles } = useQuery<CvProfileDto[]>({
    queryKey: ['cv-profiles'],
    queryFn: () => apiGet('/cv/profiles'),
  });

  useEffect(() => {
    if (!selectedProfileId && profiles) {
      const def = profiles.find((p) => p.isDefault) || profiles[0];
      if (def) setSelectedProfileId(def.id);
    }
  }, [profiles, selectedProfileId]);

  const generate = useMutation({
    mutationFn: () =>
      apiPost<GeneratedDocumentDto>('/documents/generate', {
        jobDescription, jobTitle, company,
        cvProfileId: selectedProfileId, countryCode,
      }),
    onSuccess: (data) => {
      setGeneratedDoc(data);
      toast.success('Documents generated');
    },
    onError: () => toast.error('Generation failed — check your Anthropic API key.'),
  });

  const canGenerate = jobDescription.trim() && jobTitle.trim() && company.trim() && selectedProfileId;

  return (
    <div className="flex h-full">
      {/* Input panel */}
      <div className="w-[380px] border-r border-border flex flex-col bg-card">
        <div className="flex-shrink-0 p-4 border-b border-border">
          <h2 className="text-[15px] font-semibold">Generate Documents</h2>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Paste any job description to create a tailored CV and cover letter.
          </p>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-3">
            <div>
              <Label className="text-[12px]">Job Title</Label>
              <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="e.g. Senior Software Engineer" className="text-[13px] mt-1" />
            </div>
            <div>
              <Label className="text-[12px]">Company</Label>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Atlassian" className="text-[13px] mt-1" />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="text-[12px]">Country</Label>
                <Select value={countryCode} onValueChange={setCountryCode}>
                  <SelectTrigger className="text-[13px] mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_COUNTRIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Label className="text-[12px]">CV Profile</Label>
                <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
                  <SelectTrigger className="text-[13px] mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {profiles?.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-[12px]">Job Description</Label>
              <textarea
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                className="w-full h-52 mt-1 bg-muted/30 border border-border rounded-lg p-3 text-[13px] leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Paste the full job description..."
              />
            </div>
            <Button onClick={() => generate.mutate()} disabled={!canGenerate || generate.isPending} className="w-full text-[13px]">
              {generate.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wand2 className="h-4 w-4 mr-2" />}
              {generate.isPending ? 'Generating...' : 'Generate'}
            </Button>
          </div>
        </ScrollArea>
      </div>

      {/* Output panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {generatedDoc ? (
          <>
            {/* Header aligned with input panel header */}
            <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h3 className="text-[14px] font-semibold">{company} - {countryCode}</h3>
                <p className="text-[12px] text-muted-foreground mt-0.5">{jobTitle}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  className="h-8 text-[12px]"
                  onClick={() => setShowPreview(true)}
                >
                  <FileText className="h-3.5 w-3.5 mr-1.5" />
                  Preview, Edit & Download
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-[12px]"
                  onClick={() => generate.mutate()}
                  disabled={generate.isPending}
                >
                  {generate.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Wand2 className="h-3 w-3 mr-1" />}
                  Regenerate
                </Button>
              </div>
            </div>

            {/* Two-column document view */}
            <div className="flex-1 flex overflow-hidden">
              {/* CV */}
              <div className="flex-1 flex flex-col border-r border-border">
                <div className="flex-shrink-0 px-4 py-2 border-b border-border">
                  <span className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">CV / Resume</span>
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-4 text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                    {generatedDoc.cvText}
                  </div>
                </ScrollArea>
              </div>

              {/* Cover Letter */}
              <div className="flex-1 flex flex-col">
                <div className="flex-shrink-0 px-4 py-2 border-b border-border">
                  <span className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">Cover Letter</span>
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-4 text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                    {generatedDoc.coverLetter}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <Wand2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-[14px] font-medium">Ready to generate</p>
            <p className="text-[13px] text-muted-foreground text-center max-w-xs">
              Fill in the job details and click Generate to create a country-formatted CV and cover letter.
            </p>
          </div>
        )}
      </div>

      {/* Document preview modal */}
      {showPreview && generatedDoc && (
        <DocumentPreview
          document={generatedDoc}
          company={company}
          onClose={() => setShowPreview(false)}
          onUpdated={(updated) => setGeneratedDoc(updated)}
        />
      )}
    </div>
  );
}
