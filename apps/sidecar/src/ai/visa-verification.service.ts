import { Injectable, Logger } from '@nestjs/common';
import { ClaudeService } from './claude.service';

export interface VisaVerificationResult {
  visaSponsorship: boolean;
  visaExplanation: string;
  locationScopePass: boolean;
  scopeExplanation: string;
  overallEligible: boolean;
  confidence: number;
}

const COUNTRY_CONTEXT: Record<string, string> = {
  AU: `For Australia:
POSITIVE signals (any of these suggest genuine sponsorship):
- "482 visa", "TSS visa", "Temporary Skill Shortage", "subclass 482"
- "186 visa", "ENS", "Employer Nomination Scheme", "subclass 186"
- "494 visa", "DAMA", "Designated Area Migration Agreement"
- "Global Talent visa", "subclass 858"
- "approved sponsor", "registered sponsor", "standard business sponsor"
- "willing to sponsor", "sponsorship available", "visa sponsorship provided"
- "relocation assistance", "relocation package", "relocation support"
- "international candidates welcome", "international applicants encouraged"
- "migration agent assistance", "immigration support"
DISQUALIFYING signals:
- "must have right to work in Australia", "must be an Australian citizen or permanent resident"
- "no visa sponsorship", "unable to sponsor", "not offering sponsorship"
- "Australian citizens and PR only", "must hold a valid Australian work visa"`,

  UK: `For the United Kingdom:
POSITIVE signals:
- "Skilled Worker visa", "sponsor licence", "Certificate of Sponsorship", "CoS"
- "Tier 2" (old name, still commonly referenced)
- "Global Talent visa", "Global Talent endorsement"
- "willing to sponsor", "sponsorship available", "visa sponsorship"
- "relocation package", "relocation assistance", "relocation support"
- "international candidates welcome", "overseas applicants welcome"
- "Home Office sponsor", "registered sponsor"
- "Scale-up visa sponsor"
DISQUALIFYING signals:
- "must have right to work in the UK", "no sponsorship available"
- "UK work permit holders only", "unable to offer sponsorship"
- "British/EU citizens only"`,

  CA: `For Canada:
POSITIVE signals:
- "LMIA", "Labour Market Impact Assessment", "LMIA support"
- "LMIA-exempt", "LMIA exemption"
- "Global Talent Stream", "GTS"
- "Provincial Nominee Program", "PNP"
- "Express Entry support", "immigration support"
- "work permit support", "work permit sponsorship", "work permit assistance"
- "willing to sponsor", "sponsorship available"
- "relocation assistance", "relocation package"
- "international candidates welcome"
DISQUALIFYING signals:
- "must be legally authorized to work in Canada", "Canadian citizens or PR only"
- "no LMIA support", "no sponsorship", "unable to sponsor"`,

  US: `For the United States:
POSITIVE signals:
- "H-1B", "H1B", "H-1B sponsorship", "H-1B transfer"
- "O-1 visa", "O-1", "extraordinary ability"
- "L-1 visa", "L-1", "intracompany transfer"
- "TN visa", "NAFTA/USMCA"
- "green card sponsorship", "permanent residency sponsorship"
- "immigration sponsorship", "visa sponsorship"
- "willing to sponsor", "sponsorship available"
- "relocation assistance", "relocation package"
- "OPT/CPT welcome" (for recent graduates)
DISQUALIFYING signals:
- "must be authorized to work in the US", "no visa sponsorship"
- "US citizens and green card holders only", "unable to sponsor"
- "must not require sponsorship now or in the future"`,

  DE: `For Germany:
POSITIVE signals:
- "EU Blue Card", "Blaue Karte EU", "Blue Card sponsorship"
- "Aufenthaltserlaubnis" (residence permit)
- "work permit assistance", "visa support"
- "relocation support", "relocation package", "relocation assistance"
- "international candidates welcome", "no German required"
- "English-speaking team", "international team"
- The fact that a company explicitly mentions hiring non-EU candidates
DISQUALIFYING signals:
- "EU nationals only", "must have work authorization in Germany/EU"
- "EU/EEA citizens only"
NOTE: Many German tech companies sponsor by default without explicitly stating it. If the job is posted in English and mentions an international team, it's a moderate positive signal.`,

  NL: `For the Netherlands:
POSITIVE signals:
- "Kennismigrant", "Highly Skilled Migrant", "HSM"
- "erkend referent", "IND recognized sponsor", "recognized sponsor"
- "30% ruling", "30% tax ruling" (fiscal benefit for expats — implies they hire internationally)
- "work permit assistance", "visa support", "sponsorship available"
- "relocation package", "relocation assistance"
- "international candidates welcome"
DISQUALIFYING signals:
- "EU work authorization required", "must have right to work in the Netherlands"
- "EU/EEA nationals only"
NOTE: If a company mentions the 30% ruling in their benefits, it strongly implies they sponsor HSM visas.`,

  SG: `For Singapore:
POSITIVE signals:
- "Employment Pass", "EP", "EP sponsorship"
- "S Pass"
- "work pass", "work visa sponsorship"
- "relocation support", "relocation package"
- "international candidates welcome"
DISQUALIFYING signals:
- "Singapore citizens or PR only", "must have valid work pass"
- "Singaporeans only", "SC/PR only"
NOTE: Employment Pass requires minimum salary (currently SGD 5,600/month for tech). If salary meets this threshold, sponsorship is likely.`,

  AE: `For the United Arab Emirates:
POSITIVE signals:
- "employment visa", "residence visa", "work visa"
- "visa sponsorship", "visa provided"
- "relocation package", "relocation support"
NOTE: UAE employers almost always sponsor visas — it's the default. The absence of disqualifying language is itself a positive signal. Focus more on disqualifying language.
DISQUALIFYING signals:
- "must have valid UAE work visa" (rare but exists for short contracts)
- "UAE nationals only" (Emiratisation quotas for some roles)`,

  NZ: `For New Zealand:
POSITIVE signals:
- "AEWV", "Accredited Employer Work Visa", "accredited employer"
- "Skilled Migrant Category", "SMC"
- "work visa support", "visa sponsorship"
- "relocation assistance", "relocation package"
- "international candidates welcome"
- "immigration support"
DISQUALIFYING signals:
- "must have right to work in NZ", "NZ citizens or residents only"
- "must hold a valid NZ work visa"
NOTE: Under AEWV, the employer must be accredited — if they mention being an accredited employer, that's a strong positive signal.`,

  IE: `For Ireland:
POSITIVE signals:
- "Critical Skills Employment Permit", "CSEP", "Critical Skills permit"
- "General Employment Permit", "GEP"
- "Stamp 1", "Stamp 4" (work permit stamps)
- "work permit support", "visa sponsorship", "immigration support"
- "relocation package", "relocation assistance"
- "international candidates welcome"
DISQUALIFYING signals:
- "must have right to work in Ireland/EU", "EU nationals only"
- "must hold a valid Stamp 4"
NOTE: Tech roles in Ireland often qualify for the Critical Skills list, which has a faster processing time and no labour market test.`,
};

const SYSTEM_PROMPT = `You are an expert immigration and job market analyst. Your job is to analyze job descriptions to determine:
1. Whether the employer genuinely offers visa sponsorship for international candidates
2. Whether the job's location/remote scope is compatible with the candidate's requirements

You must return ONLY a JSON object with this exact structure:
{
  "visaSponsorship": boolean,
  "visaExplanation": "1-2 sentence explanation of your visa sponsorship determination",
  "locationScopePass": boolean,
  "scopeExplanation": "1-2 sentence explanation of location/scope compatibility",
  "overallEligible": boolean,
  "confidence": number between 0 and 1
}

Guidelines:
- Look for BOTH explicit signals ("we sponsor visas") and implicit signals ("relocation package", "international team", "30% ruling", job posted in English for a non-English country)
- Disqualifying language always overrides positive signals
- If the description has no mention of sponsorship in either direction, set visaSponsorship to false with low confidence (0.3-0.4) — absence of information is not confirmation
- Platform metadata tags (like LinkedIn's "visa sponsorship" filter) are NOT reliable — only the actual description text matters
- "Relocation assistance" or "relocation package" is a moderate positive signal — employers rarely offer relocation to people who can't legally work there
- For Germany/Netherlands: jobs posted in English targeting an international audience are a moderate positive signal`;

@Injectable()
export class VisaVerificationService {
  private readonly logger = new Logger(VisaVerificationService.name);

  constructor(private readonly claude: ClaudeService) {}

  async verify(
    jobDescription: string,
    jobTitle: string,
    company: string,
    location: string,
    countryCode: string,
    mode: 'relocate' | 'remote',
  ): Promise<VisaVerificationResult> {
    const countryContext =
      COUNTRY_CONTEXT[countryCode] || 'No specific country context available.';

    const userPrompt = `Analyze this job listing:

**Job Title:** ${jobTitle}
**Company:** ${company}
**Location:** ${location}
**Target Country:** ${countryCode}
**Candidate Mode:** ${mode === 'relocate' ? 'Looking to relocate (needs visa sponsorship)' : 'Looking for remote work from abroad'}

**Country-Specific Guidance:**
${countryContext}

**Full Job Description:**
${jobDescription.slice(0, 6000)}

Determine:
1. Does this employer genuinely offer visa sponsorship based on the actual description text?
2. Is the location/remote scope compatible with the candidate's ${mode} mode?

Return your analysis as JSON.`;

    try {
      const result = await this.claude.promptJson<VisaVerificationResult>(
        SYSTEM_PROMPT,
        userPrompt,
      );

      // Validate the result shape
      return {
        visaSponsorship: Boolean(result.visaSponsorship),
        visaExplanation: String(result.visaExplanation || ''),
        locationScopePass: Boolean(result.locationScopePass),
        scopeExplanation: String(result.scopeExplanation || ''),
        overallEligible: Boolean(result.overallEligible),
        confidence: Math.max(0, Math.min(1, Number(result.confidence) || 0)),
      };
    } catch (error) {
      this.logger.error(`Visa verification failed: ${error}`);
      throw error;
    }
  }

  /**
   * Batch verify multiple jobs in a single AI call (saves ~80% tokens).
   */
  async verifyBatch(
    jobs: {
      id: string;
      description: string;
      title: string;
      company: string;
      location: string;
      countryCode: string;
      mode: 'relocate' | 'remote';
    }[],
  ): Promise<Map<string, VisaVerificationResult>> {
    if (jobs.length === 0) return new Map();
    if (jobs.length === 1) {
      const j = jobs[0];
      const result = await this.verify(j.description, j.title, j.company, j.location, j.countryCode, j.mode);
      return new Map([[j.id, result]]);
    }

    const jobSummaries = jobs.map((j, i) => {
      const countryContext = COUNTRY_CONTEXT[j.countryCode] || '';
      return `--- JOB ${i + 1} (ID: ${j.id}) ---
Title: ${j.title}
Company: ${j.company}
Location: ${j.location}
Country: ${j.countryCode} | Mode: ${j.mode}
Country guidance: ${countryContext.slice(0, 300)}
Description: ${j.description.slice(0, 2000)}`;
    }).join('\n\n');

    const batchPrompt = `Analyze these ${jobs.length} job listings for visa sponsorship:

${jobSummaries}

Return a JSON array with one object per job in the same order:
[
  {
    "id": "job ID from above",
    "visaSponsorship": boolean,
    "visaExplanation": "1-2 sentence explanation",
    "locationScopePass": boolean,
    "scopeExplanation": "1 sentence",
    "overallEligible": boolean,
    "confidence": number 0-1
  },
  ...
]`;

    try {
      const results = await this.claude.promptJson<VisaVerificationResult[]>(
        SYSTEM_PROMPT,
        batchPrompt,
      );

      const resultMap = new Map<string, VisaVerificationResult>();
      const resultArray = Array.isArray(results) ? results : [results];

      for (let i = 0; i < Math.min(resultArray.length, jobs.length); i++) {
        const r = resultArray[i] as any;
        resultMap.set(r.id || jobs[i].id, {
          visaSponsorship: Boolean(r.visaSponsorship),
          visaExplanation: String(r.visaExplanation || ''),
          locationScopePass: Boolean(r.locationScopePass),
          scopeExplanation: String(r.scopeExplanation || ''),
          overallEligible: Boolean(r.overallEligible),
          confidence: Math.max(0, Math.min(1, Number(r.confidence) || 0)),
        });
      }

      return resultMap;
    } catch (error) {
      this.logger.error(`Batch verification failed: ${error}`);
      // Fall back to individual verification
      const resultMap = new Map<string, VisaVerificationResult>();
      for (const j of jobs) {
        try {
          const result = await this.verify(j.description, j.title, j.company, j.location, j.countryCode, j.mode);
          resultMap.set(j.id, result);
        } catch { /* skip */ }
      }
      return resultMap;
    }
  }
}
