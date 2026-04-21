import type { StructuredCV } from './cv-structured.types';

export type JobSource =
  | 'adzuna'
  | 'arbeitnow'
  | 'linkedin'
  | 'seek'
  | 'relocateMe'
  | 'nextLevelJobs'
  | 'irishJobs'
  | 'jobsIe'
  | 'jaabz'
  | 'makeItInGermany'
  | 'stepstone'
  | 'glassdoor'
  | 'xing';

export type ApplicationStatus =
  | 'saved'
  | 'ready_to_apply'
  | 'applied'
  | 'screening'
  | 'interviewing'
  | 'offer'
  | 'rejected'
  | 'withdrawn';

export const APPLICATION_STATUSES: { value: ApplicationStatus; label: string }[] = [
  { value: 'saved', label: 'Saved' },
  { value: 'ready_to_apply', label: 'Ready to Apply' },
  { value: 'applied', label: 'Applied' },
  { value: 'screening', label: 'Screening' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'offer', label: 'Offer Received' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

export interface JobDto {
  id: string;
  source: JobSource;
  title: string;
  company: string;
  location: string;
  salary: string | null;
  description: string;
  url: string;
  postedAt: string | null;
  createdAt: string;
}

export type SponsorTier = 'confirmed' | 'likely' | 'unknown' | 'unlikely' | 'rejected';

export interface JobAnalysisDto {
  visaSponsorship: boolean;
  visaExplanation: string;
  sponsorTier: SponsorTier;
  locationScopePass: boolean;
  scopeExplanation: string;
  overallEligible: boolean;
  confidence: number;
  countryCode: string;
}

export interface JobMatchDto {
  matchScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  summary: string;
  recommendApply: boolean;
}

export type JobProcessingStatus =
  | 'pending'        // Just scraped, waiting for AI
  | 'analyzing'      // AI Stage 1 in progress (conceptual — we mark as pending until done)
  | 'eligible'       // Passed visa check, waiting for CV match
  | 'ineligible'     // Failed visa check
  | 'matched'        // CV match complete
  | 'error';         // Processing failed

export interface JobFeedItem extends JobDto {
  analysis: JobAnalysisDto | null;
  match: JobMatchDto | null;
  processingStatus: JobProcessingStatus;
  applicationStatus: string | null; // 'saved' | 'applied' | etc. or null if not tracked
}

export interface CvProfileDto {
  id: string;
  name: string;
  /** Canonical raw text. Source of truth. Saved verbatim. */
  body: string;
  /**
   * Derived structured view, persisted so user edits to the structured form
   * are not lost. `null` means no cached structured view exists yet — the
   * client should trigger a parse (AI or heuristic) before showing structured
   * mode. Saving `body` invalidates this cache on the server.
   */
  structured: StructuredCV | null;
  skills: string[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDto {
  id: string;
  name: string;
  description: string;
  techStack: string[];
  url: string | null;
  startDate: string | null;
  endDate: string | null;
  highlights: string[];
  createdAt: string;
  updatedAt: string;
}

export interface GeneratedDocumentDto {
  id: string;
  jobId: string;
  cvProfileId: string;
  countryCode: string;
  cvText: string;
  coverLetter: string;
  generatedAt: string;
}

export interface ApplicationDto {
  id: string;
  jobId: string;
  status: ApplicationStatus;
  history: StatusHistoryEntry[];
  notes: string;
  salaryOffer: string | null;
  createdAt: string;
  updatedAt: string;
  job?: JobDto;
}

export interface StatusHistoryEntry {
  status: ApplicationStatus;
  timestamp: string;
  note?: string;
}

export interface ScrapeLogDto {
  id: string;
  source: JobSource;
  startedAt: string;
  completedAt: string | null;
  jobsFound: number;
  jobsAfterDedup: number;
  error: string | null;
}
