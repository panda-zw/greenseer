import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ClaudeService } from '../ai/claude.service';
import { ProjectsService } from '../projects/projects.service';
import type { GeneratedDocumentDto } from '@greenseer/shared';

/**
 * Per-market guidance. Each entry specifies (a) the document title, (b) the
 * REQUIRED section order — this is what ATS scoring and recruiter scanning
 * conventions expect, and (c) locale-specific rules (spelling, photo, etc.).
 *
 * Section order is the #1 thing that differs across markets and is the thing
 * most CV generators get wrong. All tech-focused markets lead with a SKILLS
 * block directly after the summary so the "6-second recruiter scan" hits
 * the candidate's capabilities immediately.
 */
const COUNTRY_CV_INSTRUCTIONS: Record<string, string> = {
  AU: `Target market: Australia
- Document title: "Resume"
- Section order (strict): CONTACT → PROFESSIONAL SUMMARY → TECHNICAL SKILLS → PROFESSIONAL EXPERIENCE → PROJECTS → EDUCATION → CERTIFICATIONS
- Language: Australian English ("organisation", "specialised", "colour")
- Length: maximum 2 pages
- No photo, no date of birth, no marital status
- Use quantified, metric-led achievements ("reduced build time by 40%")`,

  UK: `Target market: United Kingdom
- Document title: "CV"
- Section order (strict): CONTACT → PERSONAL STATEMENT → KEY SKILLS → PROFESSIONAL EXPERIENCE → EDUCATION → CERTIFICATIONS → PROJECTS
- Language: British English ("organisation", "specialised")
- Length: 2 pages maximum
- Personal statement is 3-4 lines, first person implicit ("Full-stack engineer with 6+ years...")
- Include degree classification (2:1, First) in education if present in source
- No photo, no date of birth`,

  CA: `Target market: Canada
- Document title: "Resume"
- Section order (strict): CONTACT → PROFESSIONAL SUMMARY → TECHNICAL SKILLS → PROFESSIONAL EXPERIENCE → PROJECTS → EDUCATION → CERTIFICATIONS
- Language: Canadian English (blend of US/UK — "organization" but "colour")
- Length: 1-2 pages maximum
- Only personal data: name, email, phone, city/province, LinkedIn, GitHub
- No photo, no date of birth, no SIN, no marital status
- Lead every bullet with a strong past-tense action verb`,

  US: `Target market: United States
- Document title: "Resume"
- Section order (strict): CONTACT → PROFESSIONAL SUMMARY → TECHNICAL SKILLS → PROFESSIONAL EXPERIENCE → PROJECTS → EDUCATION → CERTIFICATIONS
- Language: American English ("organization", "specialized", "color")
- Length: 1 page if <10 years experience, 2 pages otherwise
- Only personal data: name, email, phone, city/state, LinkedIn, GitHub
- No photo, no date of birth, no nationality, no marital status
- Every bullet starts with a strong action verb and includes a quantified outcome where possible
- Skills section uses keyword-dense grouping (Languages, Frameworks, Cloud, Databases, Tools)`,

  DE: `Target market: Germany (modern tech Lebenslauf — NOT the traditional formal Lebenslauf)
- Document title: "Lebenslauf" or "CV" (either is acceptable for tech roles)
- IMPORTANT: For senior tech roles in Germany, use the MODERN tech-focused format, not the traditional formal Lebenslauf. German tech hiring now follows international conventions — lead with skills so recruiters see the candidate's capabilities immediately.
- Section order (strict): KONTAKT (Contact) → PROFIL (Summary) → KERNKOMPETENZEN / TECHNICAL SKILLS → BERUFSERFAHRUNG (Experience) → PROJEKTE (Projects) → AUSBILDUNG (Education) → ZERTIFIZIERUNGEN (Certifications) → SPRACHEN (Languages)
- Language: write the CV in ENGLISH unless the job description is in German; if the JD is in German, write the CV in German
- Length: 2-3 pages acceptable (Germany is more lenient than US)
- Photo is OPTIONAL — do NOT add a photo placeholder; omit unless the source CV already has one
- Include a prominent SPRACHEN / LANGUAGES section at the end
- Do NOT include date of birth or nationality unless present in the source
- Reverse chronological, with detailed entries and quantified impact`,

  NL: `Target market: Netherlands
- Document title: "CV"
- Section order (strict): CONTACT → PROFESSIONAL SUMMARY → TECHNICAL SKILLS → PROFESSIONAL EXPERIENCE → EDUCATION → CERTIFICATIONS → LANGUAGES
- Language: English (Dutch tech market runs in English)
- Length: 2 pages maximum — Dutch recruiters are strict on length
- Include availability/notice period at the bottom if known, otherwise omit
- No photo required (tech market convention)`,

  SG: `Target market: Singapore
- Document title: "CV" or "Resume" (either acceptable)
- Section order (strict): CONTACT → PROFESSIONAL SUMMARY → TECHNICAL SKILLS → PROFESSIONAL EXPERIENCE → EDUCATION → CERTIFICATIONS → LANGUAGES
- Language: British-leaning English ("organisation")
- Length: 2-3 pages acceptable
- Certifications section should be prominent — Singapore tech market values them
- Include languages spoken`,

  AE: `Target market: United Arab Emirates
- Document title: "CV"
- Section order (strict): CONTACT → PROFESSIONAL SUMMARY → TECHNICAL SKILLS → PROFESSIONAL EXPERIENCE → EDUCATION → CERTIFICATIONS → LANGUAGES
- Language: English
- Length: 2-3 pages acceptable
- Emphasise international experience and cross-cultural collaboration
- LANGUAGES section should be prominent and listed near the top if the candidate speaks multiple languages`,

  NZ: `Target market: New Zealand
- Document title: "CV"
- Section order (strict): CONTACT → PROFESSIONAL SUMMARY → TECHNICAL SKILLS → PROFESSIONAL EXPERIENCE → PROJECTS → EDUCATION → CERTIFICATIONS
- Language: New Zealand English (similar to Australian — "organisation", "colour")
- Length: 2 pages maximum
- No photo, no date of birth`,

  IE: `Target market: Ireland
- Document title: "CV"
- Section order (strict): CONTACT → PROFESSIONAL SUMMARY → KEY SKILLS → PROFESSIONAL EXPERIENCE → EDUCATION → CERTIFICATIONS → PROJECTS
- Language: Hiberno-English (British spelling — "organisation")
- Length: 2 pages maximum
- Include degree classification if present in source`,

  GLOBAL: `Target market: International / remote / unspecified
- Document title: "CV"
- Section order (strict): CONTACT → PROFESSIONAL SUMMARY → TECHNICAL SKILLS → PROFESSIONAL EXPERIENCE → PROJECTS → EDUCATION → CERTIFICATIONS → LANGUAGES
- Language: neutral international English — avoid US-only or UK-only quirks where possible
- Length: 2 pages maximum
- Only personal data: name, email, phone, LinkedIn, GitHub, portfolio URL
- No photo, no date of birth, no nationality
- Strong quantified achievements throughout — this format reads well for remote-first companies and international recruiters`,

  EMEA: `Target market: EMEA region (Europe, Middle East, Africa)
- Document title: "CV"
- Section order (strict): CONTACT → PROFESSIONAL SUMMARY → TECHNICAL SKILLS → PROFESSIONAL EXPERIENCE → PROJECTS → EDUCATION → CERTIFICATIONS → LANGUAGES
- Language: British English ("organisation", "specialised")
- Length: 2 pages maximum
- LANGUAGES section must be prominent — EMEA hiring heavily values multilingual candidates
- No photo, no date of birth`,

  // ── African markets ────────────────────────────────────────────────────
  AFRICA: `Target market: Pan-African (covers ZA, KE, NG, EG, MA, MU, RW, GH, ZW, etc.)
- Document title: "CV"
- Section order (strict): CONTACT → PROFESSIONAL SUMMARY → TECHNICAL SKILLS → PROFESSIONAL EXPERIENCE → PROJECTS → EDUCATION → CERTIFICATIONS → LANGUAGES
- Language: British English
- Length: 2-3 pages acceptable
- Emphasise remote-work experience, international collaboration, and any regional / pan-African project exposure
- LANGUAGES section should list all languages spoken with proficiency (English, French, Arabic, Portuguese, Swahili, etc.)
- No photo unless the source CV already includes one`,

  ZA: `Target market: South Africa
- Document title: "CV" (the term "Resume" is less common here)
- Section order (strict): CONTACT → PROFESSIONAL SUMMARY → TECHNICAL SKILLS → PROFESSIONAL EXPERIENCE → PROJECTS → EDUCATION → CERTIFICATIONS → LANGUAGES
- Language: South African English (British spelling — "organisation", "specialised")
- Length: 2-3 pages acceptable — SA recruiters read longer CVs than EU/US
- Include "ID or work-permit status" placeholder at the top ONLY if the source CV already did; otherwise leave out
- Emphasise scale signals (users, transactions, rand / USD revenue impact) — SA tech hires favour evidence of operating at scale
- Certifications (AWS, Azure, Google Cloud, K8s, Scrum) carry weight in the SA market — promote them if present`,

  KE: `Target market: Kenya ("Silicon Savannah")
- Document title: "CV"
- Section order (strict): CONTACT → PROFESSIONAL SUMMARY → TECHNICAL SKILLS → PROFESSIONAL EXPERIENCE → PROJECTS → EDUCATION → CERTIFICATIONS → LANGUAGES
- Language: British English
- Length: 2 pages maximum
- Emphasise fintech / mobile money experience if present — Kenyan tech centres heavily on M-Pesa-adjacent work
- Mention any East African regional experience explicitly`,

  NG: `Target market: Nigeria
- Document title: "CV"
- Section order (strict): CONTACT → PROFESSIONAL SUMMARY → TECHNICAL SKILLS → PROFESSIONAL EXPERIENCE → PROJECTS → EDUCATION → CERTIFICATIONS → LANGUAGES
- Language: British English
- Length: 2-3 pages acceptable
- Emphasise scale (Nigeria has the largest tech market in Africa) and any fintech / e-commerce experience
- Promote certifications prominently — they signal trustworthiness in the NG market`,

  EG: `Target market: Egypt
- Document title: "CV"
- Section order (strict): CONTACT → PROFESSIONAL SUMMARY → TECHNICAL SKILLS → PROFESSIONAL EXPERIENCE → PROJECTS → EDUCATION → CERTIFICATIONS → LANGUAGES
- Language: English (unless the JD is in Arabic, in which case produce an English version — most tech hiring in Egypt happens in English)
- Length: 2-3 pages acceptable
- Include Arabic language proficiency if the candidate has it — it is a strong signal for MENA roles
- Emphasise experience that crosses into GCC markets (UAE, Saudi) — many EG-based roles are regional`,

  MA: `Target market: Morocco
- Document title: "CV"
- Section order (strict): CONTACT → PROFESSIONAL SUMMARY → TECHNICAL SKILLS → PROFESSIONAL EXPERIENCE → PROJECTS → EDUCATION → CERTIFICATIONS → LANGUAGES
- Language: English or French depending on the JD — when in doubt, English
- Length: 2 pages maximum
- Include French language proficiency prominently if present — much of the MA tech market is Francophone / EU-facing
- Emphasise Europe-adjacent experience; many MA roles serve French or Spanish markets`,

  MU: `Target market: Mauritius
- Document title: "CV"
- Section order (strict): CONTACT → PROFESSIONAL SUMMARY → TECHNICAL SKILLS → PROFESSIONAL EXPERIENCE → PROJECTS → EDUCATION → CERTIFICATIONS → LANGUAGES
- Language: British English
- Length: 2 pages maximum
- Emphasise fintech / offshore-services experience if present — MU positions itself as a regional fintech hub
- Multilingual ability (English + French) is a meaningful advantage — surface it clearly`,

  RW: `Target market: Rwanda
- Document title: "CV"
- Section order (strict): CONTACT → PROFESSIONAL SUMMARY → TECHNICAL SKILLS → PROFESSIONAL EXPERIENCE → PROJECTS → EDUCATION → CERTIFICATIONS → LANGUAGES
- Language: English
- Length: 2 pages maximum
- Emphasise any smart-city / govtech / fintech experience — Rwanda actively recruits engineers for those sectors
- Mention regional / East African exposure`,

  GH: `Target market: Ghana
- Document title: "CV"
- Section order (strict): CONTACT → PROFESSIONAL SUMMARY → TECHNICAL SKILLS → PROFESSIONAL EXPERIENCE → PROJECTS → EDUCATION → CERTIFICATIONS → LANGUAGES
- Language: British English
- Length: 2 pages maximum
- Emphasise fintech, e-commerce, or agritech if present — Ghana's tech sector is growing fastest in those verticals`,

  ZW: `Target market: Zimbabwe
- Document title: "CV"
- Section order (strict): CONTACT → PROFESSIONAL SUMMARY → TECHNICAL SKILLS → PROFESSIONAL EXPERIENCE → PROJECTS → EDUCATION → CERTIFICATIONS → LANGUAGES
- Language: British English
- Length: 2-3 pages acceptable — ZW recruiters read longer CVs
- Emphasise any regional (SADC) or remote-international experience — most well-paying ZW tech roles serve foreign clients
- Include professional certifications prominently`,
};

const CV_SYSTEM_PROMPT = `You are a senior career writer helping a software engineer produce a CV that tells a coherent, honest story about their career arc — tailored to a specific role — and that a thoughtful recruiter would enjoy reading.

You are NOT an ATS-optimisation specialist. ATS scoring varies wildly between systems (Workday, Greenhouse, Lever, Taleo, Ashby — each parses and weights content differently), so optimising for any one of them produces a contorted document that reads as insincere to humans without being meaningfully more discoverable elsewhere. Structural cleanliness (standard section headings, plain text, reverse chronological) is all that's needed for ATS compatibility. Keyword density in prose is not.

The CV's job is:
  1. Give a recruiter a clear, honest picture of who this engineer is in a 6-second scan
  2. Back that picture up with evidence — specific accomplishments with real outcomes
  3. Demonstrate the role's requirements through what the candidate actually did, not by dropping the JD's vocabulary into every sentence

────────────────────────────────────────────────────────────────────────
CORE PRINCIPLES
────────────────────────────────────────────────────────────────────────

PRINCIPLE 1 — WRITE FOR A HUMAN FIRST.
Every bullet must read as something a competent engineer would actually say about their own work in a conversation with a peer. If a sentence would sound strange said out loud, rewrite it. "Architected event-driven microservices using Kubernetes, Terraform, PostgreSQL, and CI/CD pipelines for high-throughput distributed systems" is a keyword dump, not a bullet. "Rearchitected the payment queue consumer, cutting p99 latency from 800ms to 120ms" is a bullet.

PRINCIPLE 2 — EVIDENCE OVER VOCABULARY.
When the JD wants a trait (scalability, reliability, ownership, mentorship), demonstrate it with a concrete story. If the JD wants scalability, show a specific scale or performance improvement. If it wants ownership, show a project led end-to-end. A recruiter (or a well-designed ATS) draws the correct conclusion from the evidence without needing the keyword stamped on the bullet.

PRINCIPLE 3 — KEYWORDS LIVE IN THE SKILLS SECTION.
The skills section is the legitimate home for dense, comprehensive enumeration — readers know that's what it's for. Every technology the candidate actually uses can go there. Bullets should reference a technology only when that technology is load-bearing for the story ("Migrated the logging pipeline from Logstash to Vector, halving ingest cost" — Vector is load-bearing). Decorative filler lists inside bullets ("using X, Y, Z" tacked on at the end) are forbidden.

PRINCIPLE 4 — OMISSIONS ARE INTENTIONAL.
If the candidate's source CV omits a technology or responsibility from a specific role, that is a deliberate editorial choice. Never "fill the gap" by adding tech from elsewhere in their history. The CV should reflect how the candidate wants their career to be framed, not an averaged inference of what they probably did.

PRINCIPLE 5 — HONEST RESTRUCTURING.
You CAN and SHOULD reorder sections to match market conventions (e.g. skills before experience for most tech markets), prioritise the bullets most relevant to the target role, drop the weakest 20% of older bullets for length, and rewrite summaries to speak to this role. You may NOT invent skills, employers, dates, degrees, certifications, technologies, or achievements that the source does not support.

────────────────────────────────────────────────────────────────────────
WORKFLOW
────────────────────────────────────────────────────────────────────────

STEP 1 — UNDERSTAND THE ROLE.
Read the job description and identify:
  - The 2–3 core responsibilities this role centres on
  - The seniority signal (years, scope, ownership expectations)
  - The traits the role actually wants (scalability experience, cross-functional collaboration, specific domain, etc.)
  - Which of the candidate's stories from their source CV are genuinely relevant

STEP 2 — RESTRUCTURE FOR THE MARKET.
Apply the country-specific section order from the formatting instructions EXACTLY. Standard headings in ALL CAPS on their own line: PROFESSIONAL SUMMARY, TECHNICAL SKILLS, PROFESSIONAL EXPERIENCE, PROJECTS, EDUCATION, CERTIFICATIONS, LANGUAGES.

STEP 3 — WRITE THE SUMMARY.
3–4 lines, first-person implicit. Opens with who the candidate is — years of experience, core specialty, the kind of problems they solve. Conveys the kind of impact they have had. Feels specific enough to this role to not be interchangeable, but written as a career narrative rather than a pitch. No "results-driven", no "passionate about", no "leveraging synergies". Write like a thoughtful engineer describing themselves honestly.

STEP 4 — BUILD THE SKILLS SECTION.
Category-grouped (Languages, Frameworks, Databases, Cloud / DevOps, Tools, Methodologies — adjust categories to what the candidate actually has). Within each group, front-load the skills most relevant to the target role. Only list skills the candidate genuinely has. Spell out acronyms once on first appearance ("CI/CD (Continuous Integration / Continuous Deployment)"). This section carries all the keyword coverage needed — you do not need to inject keywords elsewhere.

STEP 5 — REWRITE THE EXPERIENCE BULLETS.
For each role:
  - Prioritise the bullets most relevant to this role; drop the rest if the CV is long
  - Each bullet: strong action verb + what was done + why it mattered + a quantified outcome where the source supports one
  - 1–2 lines each. Read them back to yourself; if they don't sound like something the candidate would say in a conversation, rewrite
  - Reference a technology only when it's load-bearing for the story
  - Never describe work the candidate didn't do, even if the JD asked for it. If the JD wants event-driven microservices and the candidate built a monolith, describe the monolith honestly. The skills section can list the broader tech landscape; bullets must stay grounded in the actual story.

STEP 6 — PROJECTS (if present in the source).
Same bullet style as experience. Prioritise projects whose domain or tech stack speaks to the target role. Each project gets a one-line description of what it is followed by the key outcomes.

────────────────────────────────────────────────────────────────────────
OUTPUT RULES
────────────────────────────────────────────────────────────────────────
- Plain text only. No markdown, no tables, no columns, no graphics, no box characters.
- Section headings: ALL CAPS on their own line.
- Experience entries: "Job Title, Company Name (Month Year - Month Year)" on its own line, then bullets starting with "- ".
- No visa, sponsorship, or work-authorisation notes.
- No separator lines like "---" or "___".
- Do NOT use em-dashes (—) or en-dashes (–). Use commas, semicolons, or " - ".
- Do NOT invent anything the source doesn't support.
- Keep to the length specified by the country instructions.

────────────────────────────────────────────────────────────────────────
ANTI-PATTERNS (any of these is a failure)
────────────────────────────────────────────────────────────────────────
- Bullets that read like keyword lists tacked together with filler verbs
- "Using X, Y, Z, and W" filler lists inside bullets
- Corporate-speak: "leveraging synergies", "driving impact", "results-driven", "passionate about"
- Rewriting the work to match the JD instead of the source (claiming event-driven microservices when the source describes a monolith)
- Cross-attributing technologies between roles or from projects into role descriptions
- Returning the CV mostly unchanged ("light edit")
- Generic summaries that could be copy-pasted onto any role

────────────────────────────────────────────────────────────────────────
SELF-CHECK BEFORE RETURNING
────────────────────────────────────────────────────────────────────────
1. Read every bullet out loud in your head. Would the candidate say this about their own work? If not, rewrite.
2. For every technology named in a bullet, confirm it is load-bearing for the story and is grounded in what the source says about that specific role.
3. Confirm the summary tells a career story, not a tailored pitch.
4. Confirm the skills section carries the technical breadth, freeing bullets to be prose.
5. Confirm nothing has been invented that the source doesn't support.`;

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
    private readonly projectsService: ProjectsService,
  ) {}

  async generate(
    jobId: string | null,
    jobDescription: string,
    jobTitle: string,
    company: string,
    cvProfileId: string | null,
    countryCode: string,
  ): Promise<GeneratedDocumentDto> {
    const enc = this.prisma.encryption;

    // Build the candidate knowledge base.
    // - If `cvProfileId` is given, use just that profile's body.
    // - Otherwise, combine ALL profiles into a single knowledge base so the
    //   LLM can pull the strongest matching experience from any of them.
    //   This is the "aggregate knowledge base" mode the user asked for.
    let cvText: string;
    let effectiveProfileId: string;

    if (cvProfileId) {
      const cvProfile = await this.prisma.cvProfile.findUnique({ where: { id: cvProfileId } });
      if (!cvProfile) throw new NotFoundException('CV profile not found');
      cvText = enc.decrypt(cvProfile.body);
      effectiveProfileId = cvProfile.id;
    } else {
      const allProfiles = await this.prisma.cvProfile.findMany({
        orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
      });
      if (allProfiles.length === 0) {
        throw new NotFoundException('No CV profiles found — create one first.');
      }
      // Concatenate with clear delimiters so the LLM can tell profiles apart
      // but still treat the whole thing as a single candidate's background.
      cvText = allProfiles
        .map((p) => `=== PROFILE: ${p.name} ===\n${enc.decrypt(p.body)}`)
        .join('\n\n');
      // Persist documents against the default (or most recently updated) profile.
      effectiveProfileId = allProfiles[0].id;
    }

    const countryInstructions =
      COUNTRY_CV_INSTRUCTIONS[countryCode] || COUNTRY_CV_INSTRUCTIONS['GLOBAL'];

    // Company may legitimately be empty (confidential listings). Pass a neutral
    // placeholder to the LLM so the prompt doesn't accidentally produce "Dear
    // , ..." or "interest in ." sentences.
    const effectiveCompany = company.trim() || 'the hiring company';

    // Pull standalone projects bank — the model will pick the most relevant
    // ones to include in the PROJECTS section of the generated CV.
    const projectsContext = await this.projectsService.getProjectsContext();

    // Append projects to the candidate's CV text so the model has them as
    // source material. The step-6 prompt already handles PROJECTS sections.
    const fullCandidateText = projectsContext
      ? `${cvText}\n\n=== STANDALONE PROJECTS BANK ===\n${projectsContext}`
      : cvText;

    // Generate CV and cover letter in parallel
    const [generatedCv, coverLetter] = await Promise.all([
      this.generateCv(fullCandidateText, jobDescription, jobTitle, effectiveCompany, countryInstructions, !cvProfileId),
      this.generateCoverLetter(fullCandidateText, jobDescription, jobTitle, effectiveCompany, countryCode, !company.trim()),
    ]);

    // Always save to generation history (encrypted), regardless of whether
    // there's a linked job. This is the audit trail / "past generations" list.
    await this.prisma.generationHistory.create({
      data: {
        jobTitle,
        company: company.trim(),
        countryCode,
        cvText: enc.encrypt(generatedCv),
        coverLetter: enc.encrypt(coverLetter),
        jobDescription: enc.encrypt(jobDescription.slice(0, 8000)),
      },
    }).catch((err) => {
      // Non-fatal — don't block the response if history write fails.
      this.logger.warn(`Failed to save generation history: ${(err as Error).message}`);
    });

    // If we have a job ID, also store linked to the job.
    if (jobId) {
      const doc = await this.prisma.generatedDocument.create({
        data: {
          jobId,
          cvProfileId: effectiveProfileId,
          countryCode,
          cvText: enc.encrypt(generatedCv),
          coverLetter: enc.encrypt(coverLetter),
        },
      });

      return this.toDto(doc);
    }

    // For manual generation (no job in system), return without storing
    return {
      id: 'manual',
      jobId: '',
      cvProfileId: effectiveProfileId,
      countryCode,
      cvText: generatedCv,
      coverLetter,
      generatedAt: new Date().toISOString(),
    };
  }

  async getGenerationHistory(): Promise<any[]> {
    const enc = this.prisma.encryption;
    const records = await this.prisma.generationHistory.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return records.map((r) => ({
      id: r.id,
      jobTitle: r.jobTitle,
      company: r.company,
      countryCode: r.countryCode,
      cvText: enc.decrypt(r.cvText),
      coverLetter: enc.decrypt(r.coverLetter),
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async deleteGenerationHistory(id: string): Promise<void> {
    await this.prisma.generationHistory.delete({ where: { id } });
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
      `You are an expert career writer helping a software engineer refine their CV. Apply the user's instruction. Preserve the section structure (headings in ALL CAPS). Keep the CV readable as prose — bullets should sound like something the candidate would say about their own work in a conversation, not keyword lists. Any technology named in a bullet must be load-bearing for that story. Never invent anything the source doesn't support. Return JSON: { "text": "the complete edited CV text" }`,
      `Current CV:\n\n${cvText}\n\nInstruction: ${instruction}\n\nReturn the complete edited CV as JSON.`,
    );
    return { text: result.text };
  }

  async refineDocument(
    params: {
      documentId: string;
      type: 'cv' | 'coverLetter';
      instruction: string;
      /**
       * Required when `documentId === 'manual'` — the current full texts to
       * refine. Manual documents are not persisted to the DB (they come from
       * the Generator page's ad-hoc flow), so the caller must ship the text.
       */
      currentCvText?: string;
      currentCoverLetter?: string;
    },
  ): Promise<GeneratedDocumentDto> {
    const { documentId, type, instruction } = params;
    const enc = this.prisma.encryption;
    const isManual = documentId === 'manual';

    // Resolve the current text for whichever side we're editing, and the
    // "other" side that we'll echo back untouched in the returned DTO.
    let currentCvText: string;
    let currentCoverLetter: string;
    let doc: Awaited<ReturnType<typeof this.prisma.generatedDocument.findUnique>> | null = null;

    if (isManual) {
      if (params.currentCvText === undefined || params.currentCoverLetter === undefined) {
        throw new NotFoundException(
          'Manual document refinement requires currentCvText and currentCoverLetter in the request body.',
        );
      }
      currentCvText = params.currentCvText;
      currentCoverLetter = params.currentCoverLetter;
    } else {
      doc = await this.prisma.generatedDocument.findUnique({ where: { id: documentId } });
      if (!doc) throw new NotFoundException('Document not found');
      currentCvText = enc.decrypt(doc.cvText);
      currentCoverLetter = enc.decrypt(doc.coverLetter);
    }

    const currentText = type === 'cv' ? currentCvText : currentCoverLetter;

    const result = await this.claude.promptJson<{ text: string }>(
      `You are an expert career writer refining a CV or cover letter. Apply the user's instruction. Keep the document readable as prose — bullets/sentences should sound like something the candidate would say about their own work, not keyword lists. Any technology named must be load-bearing. Never invent anything the source doesn't support. Return JSON: { "text": "the refined full document text" }`,
      `Current ${type === 'cv' ? 'CV' : 'cover letter'}:\n\n${currentText}\n\nUser instruction: ${instruction}\n\nApply the instruction and return the complete refined document as JSON.`,
      // Refinements can be long (full CV regens) — give them room.
      { model: 'claude-sonnet-4-5', maxTokens: 8192 },
    );

    // Assemble the new texts — only the side being refined changes.
    const newCvText = type === 'cv' ? result.text : currentCvText;
    const newCoverLetter = type === 'coverLetter' ? result.text : currentCoverLetter;

    if (isManual) {
      // No DB row to update — return a synthetic DTO so the frontend can
      // continue editing in memory.
      return {
        id: 'manual',
        jobId: '',
        cvProfileId: doc?.cvProfileId ?? '',
        countryCode: doc?.countryCode ?? '',
        cvText: newCvText,
        coverLetter: newCoverLetter,
        generatedAt: new Date().toISOString(),
      };
    }

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
    isCombinedKnowledgeBase: boolean,
  ): Promise<string> {
    const knowledgeBaseNote = isCombinedKnowledgeBase
      ? `\n\nNOTE: The candidate's background below is a COMBINED knowledge base drawn from multiple CV profiles (each delimited by "=== PROFILE: ... ==="). Treat it as a single candidate's full history — pull the strongest matching experience from any profile, but never invent details. The delimiters are for your reference only and must NOT appear in the output.`
      : '';

    // Give the model more room when working from a combined knowledge base.
    const bodyBudget = isCombinedKnowledgeBase ? 12000 : 5000;

    const result = await this.claude.promptJson<{ cv: string }>(
      CV_SYSTEM_PROMPT + knowledgeBaseNote,
      `Rewrite this CV for the target role below. Follow the workflow from the system prompt. The output should be materially different from the input in structure and framing — section order tuned to the market, a summary that tells a career story for this role, a complete skills block, and bullets rewritten to read as natural prose that a recruiter would enjoy. Keep keywords in the skills section, not sprinkled through bullets.

**Country / Market Instructions (follow the section order EXACTLY):**
${countryInstructions}

**Target Job:**
Title: ${jobTitle}
Company: ${company}

**Full Job Description:**
${jobDescription.slice(0, 6000)}

**Candidate's Master CV (source material — never invent beyond this):**
${cvText.slice(0, bodyBudget)}

Return JSON: { "cv": "the full rewritten CV text" }`,
      // CV generation needs Sonnet's nuance and a large output budget — a
      // full 2-page CV can run 3-5k output tokens.
      { model: 'claude-sonnet-4-5', maxTokens: 8192 },
    );
    return result.cv;
  }

  private async generateCoverLetter(
    cvText: string,
    jobDescription: string,
    jobTitle: string,
    company: string,
    countryCode: string,
    companyIsConfidential: boolean,
  ): Promise<string> {
    const companyGuidance = companyIsConfidential
      ? `\n\nIMPORTANT: The company name is confidential / not disclosed. Address the letter to "Dear Hiring Manager," and refer to the organisation generically ("your organisation", "the team", "this role"). Do NOT invent a company name. Do NOT say "confidential company".`
      : '';

    const result = await this.claude.promptJson<{ coverLetter: string }>(
      COVER_LETTER_SYSTEM_PROMPT + companyGuidance,
      `Write a cover letter for this job application.

**Job Title:** ${jobTitle}
**Company:** ${company}
**Country:** ${countryCode}

**Job Description:**
${jobDescription.slice(0, 6000)}

**Candidate's CV:**
${cvText.slice(0, 6000)}

Return JSON: { "coverLetter": "the full cover letter text" }`,
      { model: 'claude-sonnet-4-5', maxTokens: 2048 },
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
