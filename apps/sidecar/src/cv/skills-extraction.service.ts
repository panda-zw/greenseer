import { Injectable, Logger } from '@nestjs/common';
import { ClaudeService } from '../ai/claude.service';

interface SkillsResult {
  skills: string[];
}

const SYSTEM_PROMPT = `You are a technical skills parser. Given a CV/resume text, extract all technical skills, tools, frameworks, languages, platforms, and domain areas mentioned.

Return ONLY a JSON object: { "skills": ["skill1", "skill2", ...] }

Guidelines:
- Include programming languages (e.g. TypeScript, Python, Go)
- Include frameworks (e.g. React, NestJS, Django)
- Include tools and platforms (e.g. Docker, AWS, Kubernetes)
- Include databases (e.g. PostgreSQL, MongoDB, Redis)
- Include methodologies if clearly technical (e.g. CI/CD, TDD, Agile)
- Include domain expertise (e.g. Machine Learning, DevOps, Cloud Architecture)
- Normalize names: use canonical forms (e.g. "JavaScript" not "JS", "TypeScript" not "TS")
- Do NOT include soft skills, job titles, or company names
- Return between 5 and 50 skills, ordered by relevance`;

@Injectable()
export class SkillsExtractionService {
  private readonly logger = new Logger(SkillsExtractionService.name);

  constructor(private readonly claude: ClaudeService) {}

  async extractSkills(cvText: string): Promise<string[]> {
    try {
      const result = await this.claude.promptJson<SkillsResult>(
        SYSTEM_PROMPT,
        `Extract technical skills from this CV:\n\n${cvText.slice(0, 6000)}`,
      );
      return Array.isArray(result.skills) ? result.skills.map(String) : [];
    } catch (error) {
      this.logger.error(`Skills extraction failed: ${error}`);
      return [];
    }
  }
}
