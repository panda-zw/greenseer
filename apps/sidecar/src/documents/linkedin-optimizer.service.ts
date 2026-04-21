import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ClaudeService } from '../ai/claude.service';

export interface LinkedInAnalysis {
  overallScore: number; // 0-100
  headline: {
    current: string;
    issues: string[];
    rewrite: string;
  };
  about: {
    current: string;
    issues: string[];
    rewrite: string;
  };
  experience: {
    role: string;
    issues: string[];
    improvedBullets: string[];
  }[];
  skills: {
    missing: string[];
    reorder: string[];
    reasoning: string;
  };
  keywords: {
    strong: string[];
    missing: string[];
    reasoning: string;
  };
  quickWins: string[];
}

const SYSTEM_PROMPT = `You are a LinkedIn profile optimisation expert who helps software engineers maximise their visibility to recruiters and hiring managers.

You understand:
- How LinkedIn's search algorithm ranks profiles (keyword density, headline weight, skills endorsements, activity signals)
- What recruiters actually search for and filter on (job titles, technologies, years of experience, location)
- The difference between a profile that gets found and one that doesn't
- How to write naturally — no corporate buzzwords, no "passionate synergy-driven leader" language

Your job is to analyse the user's LinkedIn profile text and return a structured JSON analysis.

────────────────────────────────────────────────────────────────────────
HARD RULES — violating these is a failure no matter how polished the output looks
────────────────────────────────────────────────────────────────────────

RULE 1 — OMISSIONS ARE INTENTIONAL.
If the user did not mention a technology, employer, tool, or achievement, treat that as a deliberate editorial choice. You must NOT add it back. Example: if the user lists Nest.js and FastAPI in side projects but says nothing about Laravel in their current role, you do NOT add Laravel anywhere. You do NOT say "you probably also use Laravel." The absence is the signal.

RULE 2 — NEVER CROSS-ATTRIBUTE.
A technology used in Project X does NOT imply it is used at Employer Y. When rewriting a role, you may only reference technologies that the user themselves wrote into that role's text. If their current-role description mentions "building APIs" with no specific stack, you write about "building APIs" — you do NOT paper the gap with TypeScript, Nest.js, or anything else inferred from elsewhere. Every technology claim in an experience bullet must be traceable to something the user actually said about that role.

RULE 3 — RESPECT THE POSITIONING THEY CHOSE.
If a "Positioning" input is provided, anchor the entire rewrite to that framing. Do not narrow it based on which technology stack appears most often in their text. Example: if the user says "I want to be positioned as a full-stack engineer who builds scalable systems" but their profile mentions React Native several times, you still write a full-stack framing. Their stated positioning overrides pattern-matching on their tech list.

RULE 4 — BROADEST ACCURATE IDENTITY.
If no positioning is provided, identify the broadest accurate framing their evidence supports, not the narrowest. Someone who has shipped mobile apps + backends + web apps is a full-stack / systems engineer, not a "mobile developer". Mobile apps have backends; the user built both. Don't collapse a multi-disciplinary engineer into the most visible label.

RULE 5 — NO PHANTOM GAPS.
Do not say "your profile is missing X" unless X is a recruiter-searched term that the user ALREADY has evidence of in their text. Missing skills you suggest must come from the user's own stated experience, not from "what a typical person in this role would have".

────────────────────────────────────────────────────────────────────────
ANALYSIS FRAMEWORK
────────────────────────────────────────────────────────────────────────

1. HEADLINE (120 chars max)
   - LinkedIn's algorithm weights the headline heavily for search ranking
   - Should contain: current role/seniority + 2-3 top technologies that the user actually claims + value signal
   - Should NOT be: just a job title ("Software Engineer at Company"), generic ("Looking for opportunities"), or buzzword-heavy
   - If user provided a Positioning, the headline must reflect it
   - A good headline reads like a search result the recruiter would click on

2. ABOUT SECTION (2600 chars max)
   - First 3 lines are visible before "see more" — they must hook the reader
   - Should open with who the candidate is, at the broadest accurate framing
   - Keywords must only come from what the user stated — do not invent a stack
   - Write in first person, conversational but professional — like talking to a peer at a conference

3. EXPERIENCE BULLETS — PER-ROLE ISOLATION
   - Analyse each role using ONLY that role's own text. Do not mix in facts from other roles or projects.
   - Each rewritten bullet must describe work supported by that specific role's description
   - If a role's description is sparse, say so (issue: "description is too brief to rewrite meaningfully") instead of filling in imagined technologies
   - Action verb + what the user did + measurable impact — all grounded in what they wrote

4. SKILLS SECTION
   - Only recommend skills with explicit evidence in the user's text
   - For missing skills, each suggestion must include (in the reasoning) WHERE you saw evidence the user has it
   - Suggest the best ordering for recruiter search

5. KEYWORD ANALYSIS
   - "Strong" keywords = terms the user's text already contains prominently
   - "Missing" keywords = terms the user's text already supports but isn't surfacing prominently
   - Do NOT suggest a keyword the user didn't demonstrate

6. QUICK WINS
   - 3-5 specific, actionable things the user can do in 10 minutes
   - Be concrete: "Change your headline from X to Y" not "Improve your headline"

Return a JSON object matching this exact schema:
{
  "overallScore": number (0-100, where 80+ is recruiter-ready),
  "headline": {
    "current": string (what they have now, or empty if not provided),
    "issues": string[] (2-4 specific problems),
    "rewrite": string (your suggested headline, max 120 chars)
  },
  "about": {
    "current": string (first 200 chars of their current about, or empty),
    "issues": string[] (2-4 specific problems),
    "rewrite": string (your full suggested about section)
  },
  "experience": [
    {
      "role": string (job title + company),
      "issues": string[] (1-3 specific problems with their bullets),
      "improvedBullets": string[] (3-5 rewritten bullets)
    }
  ],
  "skills": {
    "missing": string[] (skills they clearly have but haven't listed),
    "reorder": string[] (top 5 skills in optimal order for recruiter search),
    "reasoning": string (1-2 sentences explaining the strategy)
  },
  "keywords": {
    "strong": string[] (keywords well-represented in their profile),
    "missing": string[] (important keywords they should add),
    "reasoning": string (1-2 sentences)
  },
  "quickWins": string[] (3-5 specific actionable improvements)
}

IMPORTANT:
- Only suggest changes based on what the candidate ACTUALLY did — never invent experience
- Write rewrites that sound like the candidate wrote them, not a marketing bot
- If the user hasn't provided a section, mark issues as ["Section not provided"] — do NOT fabricate a section by mixing tech from unrelated roles or projects
- All rewrites should be in first person for LinkedIn (unlike CVs which are third person implicit)
- If the user provided CV context, treat that as supporting evidence for skills they genuinely have — but a skill being in the CV does NOT entitle you to attribute it to a specific LinkedIn role unless that role's own text mentions it

SELF-CHECK BEFORE RETURNING:
- For every technology mentioned in each rewritten bullet, trace it back to that role's own text. If you can't find it, remove it.
- Confirm the headline/about framing matches the user's stated Positioning (or, absent that, the broadest accurate framing — not the narrowest).
- Confirm no "missing skill" suggestion is based on "what this role usually needs" rather than evidence in the user's text.`;

@Injectable()
export class LinkedInOptimizerService {
  private readonly logger = new Logger(LinkedInOptimizerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeService,
  ) {}

  async analyzeProfile(input: {
    headline?: string;
    about?: string;
    experience?: string;
    skills?: string;
    targetRoles?: string;
    /**
     * Optional free-text statement of how the user wants to be positioned
     * (e.g. "full-stack engineer who ships scalable distributed systems,
     * not a mobile developer"). When present this anchors the rewrite and
     * overrides the model's inclination to narrow based on tech frequency.
     */
    positioning?: string;
  }): Promise<LinkedInAnalysis> {
    // Pull all CV profiles as supplementary context so the analysis can
    // identify skills/experience the user has but hasn't put on LinkedIn.
    const enc = this.prisma.encryption;
    const cvProfiles = await this.prisma.cvProfile.findMany({
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });

    const cvContext = cvProfiles.length > 0
      ? cvProfiles
          .map((p) => `=== CV PROFILE: ${p.name} ===\n${enc.decrypt(p.body)}`)
          .join('\n\n')
          .slice(0, 8000)
      : '(No CV profiles available)';

    // Build the user prompt from whatever sections they provided.
    const sections: string[] = [];

    // Positioning comes first so it frames every downstream rewrite.
    if (input.positioning?.trim()) {
      sections.push(
        `**Desired Positioning (anchor all rewrites to this — do not narrow based on which tech stack appears most often):**\n${input.positioning.trim()}`,
      );
    }

    if (input.targetRoles?.trim()) {
      sections.push(`**Target Roles / Industries:**\n${input.targetRoles.trim()}`);
    }

    if (input.headline?.trim()) {
      sections.push(`**Current LinkedIn Headline:**\n${input.headline.trim()}`);
    } else {
      sections.push('**Current LinkedIn Headline:** (not provided)');
    }

    if (input.about?.trim()) {
      sections.push(`**Current About Section:**\n${input.about.trim()}`);
    } else {
      sections.push('**Current About Section:** (not provided)');
    }

    if (input.experience?.trim()) {
      sections.push(
        `**Current Experience Section** (analyse each role using ONLY its own text — do not cross-attribute technologies between roles or from CV/projects below):\n${input.experience.trim()}`,
      );
    } else {
      sections.push(
        '**Current Experience Section:** (not provided — report this as a gap; do not invent roles from CV data)',
      );
    }

    if (input.skills?.trim()) {
      sections.push(`**Current Skills Listed:**\n${input.skills.trim()}`);
    } else {
      sections.push('**Current Skills:** (not provided)');
    }

    const userPrompt = `Analyse this LinkedIn profile and return the JSON analysis.

${sections.join('\n\n')}

**Supplementary CV Data** (use for ONE purpose only: confirming evidence for skills the user clearly has. You may NOT copy technologies from the CV into specific LinkedIn role rewrites unless that same role also mentions them on LinkedIn. Treat what is missing from the LinkedIn profile as a deliberate positioning choice by the user — if they left something off LinkedIn that's in their CV, respect that omission):
${cvContext}

Return the JSON analysis now. Before returning, run the self-check from the system prompt — trace every technology in every bullet back to the source text that justifies it.`;

    const result = await this.claude.promptJson<LinkedInAnalysis>(
      SYSTEM_PROMPT,
      userPrompt,
      { model: 'claude-sonnet-4-5', maxTokens: 8192 },
    );

    // Normalize — ensure all required fields exist.
    const normalized: LinkedInAnalysis = {
      overallScore: result.overallScore ?? 50,
      headline: {
        current: result.headline?.current ?? '',
        issues: result.headline?.issues ?? [],
        rewrite: result.headline?.rewrite ?? '',
      },
      about: {
        current: result.about?.current ?? '',
        issues: result.about?.issues ?? [],
        rewrite: result.about?.rewrite ?? '',
      },
      experience: (result.experience ?? []).map((e) => ({
        role: e.role ?? '',
        issues: e.issues ?? [],
        improvedBullets: e.improvedBullets ?? [],
      })),
      skills: {
        missing: result.skills?.missing ?? [],
        reorder: result.skills?.reorder ?? [],
        reasoning: result.skills?.reasoning ?? '',
      },
      keywords: {
        strong: result.keywords?.strong ?? [],
        missing: result.keywords?.missing ?? [],
        reasoning: result.keywords?.reasoning ?? '',
      },
      quickWins: result.quickWins ?? [],
    };

    // Persist to history (non-fatal on failure).
    try {
      await this.prisma.linkedInAnalysisHistory.create({
        data: {
          score: normalized.overallScore,
          inputData: JSON.stringify(input),
          resultData: JSON.stringify(normalized),
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to save LinkedIn analysis history: ${(err as Error).message}`);
    }

    return normalized;
  }

  async getHistory(): Promise<any[]> {
    const records = await this.prisma.linkedInAnalysisHistory.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return records.map((r) => {
      let resultData = {};
      let inputData = {};
      try { resultData = JSON.parse(r.resultData); } catch { /* empty */ }
      try { inputData = JSON.parse(r.inputData); } catch { /* empty */ }
      return {
        id: r.id,
        score: r.score,
        inputData,
        resultData,
        createdAt: r.createdAt.toISOString(),
      };
    });
  }

  async deleteHistory(id: string): Promise<void> {
    await this.prisma.linkedInAnalysisHistory.delete({ where: { id } });
  }
}
