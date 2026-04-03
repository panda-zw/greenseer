import { Injectable, Logger } from '@nestjs/common';
import { ClaudeService } from './claude.service';

export interface CvMatchResult {
  matchScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  summary: string;
  recommendApply: boolean;
}

const SYSTEM_PROMPT = `You are an expert technical recruiter and CV analyst. Compare a candidate's CV against a job description with nuanced, practical analysis.

Return ONLY a JSON object:
{
  "matchScore": number 0-100,
  "matchedSkills": ["skill1", ...],
  "missingSkills": ["skill1", ...],
  "summary": "Two sentence summary of match quality and key strengths/gaps",
  "recommendApply": boolean
}

Scoring guidelines:
- 85-100: Excellent — meets all core requirements, experience level matches, strong domain fit
- 70-84: Good — has core tech skills, minor gaps in nice-to-haves or slight seniority mismatch
- 55-69: Moderate — has some relevant skills but meaningful gaps, or significant seniority mismatch
- 35-54: Weak — missing most key requirements or major seniority mismatch
- 0-34: Poor — very little overlap

CRITICAL scoring factors (weight these heavily):
1. **Seniority match** — A senior role requiring 8+ years should score LOW for a candidate with 3 years, even if tech skills match. A junior role should score LOW for an overqualified candidate (they'll be rejected for being too senior). Weight this 30% of the score.
2. **Core tech stack** — Does the candidate know the PRIMARY language/framework? (e.g., a Java role needs Java, not just "backend experience"). Weight 30%.
3. **Domain experience** — Has the candidate worked in a similar domain? (fintech, healthcare, e-commerce, etc.). Weight 15%.
4. **Supporting skills** — Cloud, databases, tools, methodologies. Weight 15%.
5. **Soft factors** — Team size, company stage, management experience if required. Weight 10%.

Be STRICT about seniority:
- "Principal/Staff" roles need 10+ years → 3-5 year candidate gets max 30
- "Senior" roles need 5-8 years → 2-3 year candidate gets max 45
- "Mid" roles need 3-5 years → 7+ year candidate gets max 60 (overqualified)
- "Junior/Graduate" roles → 5+ year candidate gets max 40 (will be rejected)

Transferable skills matter but don't substitute:
- React experience transfers partially to Vue (70% credit)
- Python transfers partially to Java (40% credit)
- AWS transfers well to Azure (80% credit)
- Frontend doesn't transfer to backend (20% credit)`;

@Injectable()
export class CvMatchingService {
  private readonly logger = new Logger(CvMatchingService.name);

  constructor(private readonly claude: ClaudeService) {}

  async match(
    cvText: string,
    cvSkills: string[],
    jobDescription: string,
    jobTitle: string,
    company: string,
  ): Promise<CvMatchResult> {
    // Extract seniority indicators from job title
    const titleLower = jobTitle.toLowerCase();
    let seniorityHint = 'mid-level';
    if (titleLower.includes('principal') || titleLower.includes('staff') || titleLower.includes('distinguished')) {
      seniorityHint = 'principal/staff (10+ years expected)';
    } else if (titleLower.includes('lead') || titleLower.includes('head of')) {
      seniorityHint = 'lead/head (7+ years expected)';
    } else if (titleLower.includes('senior') || titleLower.includes('sr.') || titleLower.includes('sr ')) {
      seniorityHint = 'senior (5-8 years expected)';
    } else if (titleLower.includes('junior') || titleLower.includes('jr') || titleLower.includes('graduate') || titleLower.includes('intern')) {
      seniorityHint = 'junior/graduate (0-2 years expected)';
    }

    const userPrompt = `Compare this candidate's CV against the job:

**Job Title:** ${jobTitle}
**Company:** ${company}
**Estimated Seniority Level:** ${seniorityHint}

**Job Description:**
${jobDescription.slice(0, 4500)}

**Candidate's CV:**
${cvText.slice(0, 4500)}

**Candidate's Known Skills:**
${cvSkills.join(', ')}

Score this match considering seniority fit, core tech stack, domain experience, and supporting skills. Return JSON.`;

    try {
      const result = await this.claude.promptJson<CvMatchResult>(
        SYSTEM_PROMPT,
        userPrompt,
      );

      return {
        matchScore: Math.max(0, Math.min(100, Math.round(Number(result.matchScore) || 0))),
        matchedSkills: Array.isArray(result.matchedSkills) ? result.matchedSkills.map(String) : [],
        missingSkills: Array.isArray(result.missingSkills) ? result.missingSkills.map(String) : [],
        summary: String(result.summary || ''),
        recommendApply: Boolean(result.recommendApply),
      };
    } catch (error) {
      this.logger.error(`CV matching failed: ${error}`);
      throw error;
    }
  }
}
