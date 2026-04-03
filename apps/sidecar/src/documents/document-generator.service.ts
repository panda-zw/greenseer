import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ClaudeService } from '../ai/claude.service';
import type { GeneratedDocumentDto } from '@greenseer/shared';

const COUNTRY_CV_INSTRUCTIONS: Record<string, string> = {
  AU: `Format as an Australian Resume:
- Title: "Resume" (not CV)
- Maximum 2 pages
- No photo
- Australian spelling (e.g. "organisation", "colour")
- 2-3 line professional summary at top
- Do NOT include any visa or sponsorship notes in the document
- Reverse chronological work experience with quantified achievements`,

  UK: `Format as a UK CV:
- Title: "CV"
- Lead with a 3-4 line personal statement
- British spelling throughout (e.g. "organisation", "specialised")
- Do NOT include any visa or sponsorship notes in the document
- Education section with grades/classifications
- Reverse chronological experience`,

  CA: `Format as a Canadian Resume:
- Title: "Resume"
- Strictly exclude all personal information beyond name, email, phone, LinkedIn URL
- Emphasise quantified achievements throughout
- Use Canadian spelling where different from US`,

  US: `Format as a US Resume:
- Title: "Resume"
- Strictly exclude all personal information beyond name, email, phone, LinkedIn URL
- Lead every bullet point with an action verb
- Emphasise quantified achievements and impact metrics
- No photo, no date of birth, no nationality`,

  DE: `Format as a German Lebenslauf:
- Formal structure following German conventions
- Include a placeholder note for professional photo
- Include date of birth and nationality fields
- Reverse chronological with detailed entries
- Do NOT include any visa or sponsorship notes`,

  NL: `Format for the Netherlands tech market:
- Similar to UK CV format
- Include availability/notice period
- Keep concise, 2 pages maximum
- Do NOT include any visa or sponsorship notes`,

  SG: `Format for Singapore tech market:
- Similar to UK CV format
- Emphasise relevant certifications
- Do NOT include any visa or sponsorship notes`,

  AE: `Format for the UAE tech market:
- Emphasise international experience
- Include language skills prominently
- Do NOT include any visa or sponsorship notes`,

  NZ: `Format as a New Zealand Resume:
- Title: "CV" or "Resume"
- Similar to Australian format
- New Zealand spelling
- 2 pages maximum
- Do NOT include any visa or sponsorship notes`,

  IE: `Format for the Irish tech market:
- Title: "CV"
- Similar to UK format
- Do NOT include any visa or sponsorship notes`,
};

const CV_SYSTEM_PROMPT = `You are an expert CV/resume writer and career consultant. You reformat CVs to match the conventions of specific countries while optimising for ATS (Applicant Tracking System) parsing.

Rules:
ATS OPTIMIZATION (critical for passing automated screening):
- Use standard section headings in ALL CAPS: PROFESSIONAL SUMMARY, EXPERIENCE, EDUCATION, SKILLS, CERTIFICATIONS, PROJECTS
- Use simple formatting: plain text, no tables, no columns, no text boxes, no graphics
- Include exact keyword matches from the job description naturally in bullet points
- Use standard job title formats the ATS expects
- Spell out acronyms at least once (e.g. "Continuous Integration/Continuous Deployment (CI/CD)")
- Include both the technology name and category (e.g. "PostgreSQL database" not just "PostgreSQL")
- Use reverse chronological order for experience
- Each bullet point should start with a strong action verb and include a measurable result where possible

FORMATTING RULES:
- Do NOT include any visa, sponsorship, or work authorisation notes
- Do NOT include separator lines like "---" or "___"
- Do NOT use em-dashes or en-dashes. Use commas, semicolons, or " - " instead
- For experience entries use format: "Job Title, Company Name (Month Year - Month Year)"
- Start bullet points with "- " (hyphen space)
- Section headings must be ALL CAPS on their own line
- Keep to 2 pages maximum
- Be concise: each bullet point should be 1-2 lines max`;

const COVER_LETTER_SYSTEM_PROMPT = `You are an expert cover letter writer. You create compelling, personalised cover letters that connect the candidate's experience to the specific job requirements.

Rules:
- 3-4 paragraphs
- Open with genuine, specific interest in the company (not generic)
- Connect 2-3 concrete experiences from the CV to the job's stated requirements
- Do NOT mention visa or sponsorship in the cover letter
- Close with a clear call to action
- Professional but not stiff
- Do NOT use em-dashes (—). Use commas or semicolons instead
- Use standard hyphens (-) only
- Output plain text only`;

@Injectable()
export class DocumentGeneratorService {
  private readonly logger = new Logger(DocumentGeneratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeService,
  ) {}

  async generate(
    jobId: string | null,
    jobDescription: string,
    jobTitle: string,
    company: string,
    cvProfileId: string,
    countryCode: string,
  ): Promise<GeneratedDocumentDto> {
    const cvProfile = await this.prisma.cvProfile.findUnique({
      where: { id: cvProfileId },
    });
    if (!cvProfile) throw new NotFoundException('CV profile not found');

    const countryInstructions =
      COUNTRY_CV_INSTRUCTIONS[countryCode] || COUNTRY_CV_INSTRUCTIONS['US'];

    // Generate CV and cover letter in parallel
    const [cvText, coverLetter] = await Promise.all([
      this.generateCv(cvProfile.body, jobDescription, jobTitle, company, countryInstructions),
      this.generateCoverLetter(cvProfile.body, jobDescription, jobTitle, company, countryCode),
    ]);

    // If we have a job ID, store linked to the job
    if (jobId) {
      const enc = this.prisma.encryption;
      const doc = await this.prisma.generatedDocument.create({
        data: {
          jobId,
          cvProfileId,
          countryCode,
          cvText: enc.encrypt(cvText),
          coverLetter: enc.encrypt(coverLetter),
        },
      });

      return this.toDto(doc);
    }

    // For manual generation (no job in system), return without storing
    return {
      id: 'manual',
      jobId: '',
      cvProfileId,
      countryCode,
      cvText,
      coverLetter,
      generatedAt: new Date().toISOString(),
    };
  }

  async getDocuments(jobId: string): Promise<GeneratedDocumentDto[]> {
    const docs = await this.prisma.generatedDocument.findMany({
      where: { jobId },
      orderBy: { generatedAt: 'desc' },
    });
    return docs.map(this.toDto);
  }

  async getDocument(id: string): Promise<GeneratedDocumentDto> {
    const doc = await this.prisma.generatedDocument.findUnique({
      where: { id },
    });
    if (!doc) throw new NotFoundException('Document not found');
    return this.toDto(doc);
  }

  async refineCvText(cvText: string, instruction: string): Promise<{ text: string }> {
    const result = await this.claude.promptJson<{ text: string }>(
      `You are an expert CV editor. Edit the CV below according to the user's instruction. Keep the same section structure (headings in ALL CAPS). Return JSON: { "text": "the complete edited CV text" }`,
      `Current CV:\n\n${cvText}\n\nInstruction: ${instruction}\n\nReturn the complete edited CV as JSON.`,
    );
    return { text: result.text };
  }

  async refineDocument(
    documentId: string,
    type: 'cv' | 'coverLetter',
    instruction: string,
  ): Promise<GeneratedDocumentDto> {
    const doc = await this.prisma.generatedDocument.findUnique({ where: { id: documentId } });
    if (!doc) throw new NotFoundException('Document not found');

    const enc = this.prisma.encryption;
    const currentText = type === 'cv' ? enc.decrypt(doc.cvText) : enc.decrypt(doc.coverLetter);

    const result = await this.claude.promptJson<{ text: string }>(
      `You are an expert CV/resume editor. Refine the document below according to the user's instruction. Return JSON: { "text": "the refined full document text" }`,
      `Current ${type === 'cv' ? 'CV' : 'cover letter'}:\n\n${currentText}\n\nUser instruction: ${instruction}\n\nApply the instruction and return the complete refined document as JSON.`,
    );

    const updateData = type === 'cv'
      ? { cvText: enc.encrypt(result.text) }
      : { coverLetter: enc.encrypt(result.text) };

    const updated = await this.prisma.generatedDocument.update({
      where: { id: documentId },
      data: updateData,
    });

    return this.toDto(updated);
  }

  private async generateCv(
    cvText: string,
    jobDescription: string,
    jobTitle: string,
    company: string,
    countryInstructions: string,
  ): Promise<string> {
    const result = await this.claude.promptJson<{ cv: string }>(
      CV_SYSTEM_PROMPT,
      `Reformat this CV for the following job application.

**Country Formatting Instructions:**
${countryInstructions}

**Target Job:**
Title: ${jobTitle}
Company: ${company}

**Job Description:**
${jobDescription.slice(0, 4000)}

**Candidate's Master CV:**
${cvText.slice(0, 5000)}

Return JSON: { "cv": "the full reformatted CV text" }`,
    );
    return result.cv;
  }

  private async generateCoverLetter(
    cvText: string,
    jobDescription: string,
    jobTitle: string,
    company: string,
    countryCode: string,
  ): Promise<string> {
    const result = await this.claude.promptJson<{ coverLetter: string }>(
      COVER_LETTER_SYSTEM_PROMPT,
      `Write a cover letter for this job application.

**Job Title:** ${jobTitle}
**Company:** ${company}
**Country:** ${countryCode}

**Job Description:**
${jobDescription.slice(0, 4000)}

**Candidate's CV:**
${cvText.slice(0, 4000)}

Return JSON: { "coverLetter": "the full cover letter text" }`,
    );
    return result.coverLetter;
  }

  private toDto = (doc: any): GeneratedDocumentDto => {
    const enc = this.prisma.encryption;
    return {
      id: doc.id,
      jobId: doc.jobId,
      cvProfileId: doc.cvProfileId,
      countryCode: doc.countryCode,
      cvText: enc.decrypt(doc.cvText),
      coverLetter: enc.decrypt(doc.coverLetter),
      generatedAt: doc.generatedAt.toISOString(),
    };
  }
}
