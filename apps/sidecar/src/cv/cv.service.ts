import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ClaudeService } from '../ai/claude.service';
import { SkillsExtractionService } from './skills-extraction.service';
import type { CvProfileDto, StructuredCV } from '@greenseer/shared';
import { structuredCvToText, textToStructuredCv } from '@greenseer/shared';

export interface VersionSnapshot {
  body: string;
  skills: string[];
  savedAt: string;
}

const STRUCTURED_PARSE_SYSTEM_PROMPT = `You are an expert CV parser. You receive a raw CV text and return a JSON object matching this exact schema:

{
  "summary": string,
  "experience": [{ "title": string, "company": string, "location": string, "startDate": string, "endDate": string, "bullets": string[] }],
  "education": [{ "degree": string, "institution": string, "year": string }],
  "projects": [{ "name": string, "techStack": string, "description": string, "url": string }],
  "certifications": [{ "name": string, "year": string }],
  "additionalInfo": string
}

Rules:
- Extract ALL information from the CV. Do not omit anything.
- Preserve the user's exact wording in bullets, summary and descriptions — do NOT rewrite.
- "startDate"/"endDate" should be short forms like "Oct 2021" or "Present".
- If a field is unknown, use an empty string (not null).
- "bullets" should be the raw achievement bullets for each role, stripped of leading dashes/asterisks.
- "additionalInfo" should capture anything not fitting the other sections (languages, interests, references, etc.).
- Return ONLY the JSON object, no prose.`;

@Injectable()
export class CvService {
  private readonly logger = new Logger(CvService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly skillsExtraction: SkillsExtractionService,
    private readonly claude: ClaudeService,
  ) {}

  async listProfiles(): Promise<CvProfileDto[]> {
    const profiles = await this.prisma.cvProfile.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    return profiles.map((p) => this.toDto(p));
  }

  async getProfile(id: string): Promise<CvProfileDto> {
    const profile = await this.prisma.cvProfile.findUnique({ where: { id } });
    if (!profile) throw new NotFoundException('CV profile not found');
    return this.toDto(profile);
  }

  async createProfile(name: string, body: string): Promise<CvProfileDto> {
    // Extract skills via AI
    const skills = await this.skillsExtraction.extractSkills(body);

    // If this is the first profile, make it default
    const count = await this.prisma.cvProfile.count();

    const enc = this.prisma.encryption;
    const profile = await this.prisma.cvProfile.create({
      data: {
        name,
        body: enc.encrypt(body),
        skills: JSON.stringify(skills),
        isDefault: count === 0,
        versions: JSON.stringify([
          { body: enc.encrypt(body), skills, savedAt: new Date().toISOString() },
        ]),
      },
    });

    return this.toDto(profile);
  }

  /**
   * Update a CV profile. Accepts `name`, `body`, and/or `structured` independently.
   *
   * Rules:
   * - `body` (raw text) is the canonical source of truth. When provided, it is
   *   saved verbatim — no trimming, no reformatting. Saving a new `body`
   *   invalidates (nulls out) the cached `structured` so it will be re-derived
   *   the next time the structured view is opened.
   * - `structured` is a derived view. When provided, it is saved as-is. If the
   *   current `body` is empty, the structured data is serialized to text and
   *   backfilled into `body` (the "first save is structured" exception). If
   *   `body` is non-empty, `body` is left untouched — structured edits never
   *   overwrite the canonical raw text.
   */
  async updateProfile(
    id: string,
    data: { name?: string; body?: string; structured?: StructuredCV | null },
  ): Promise<CvProfileDto> {
    const existing = await this.prisma.cvProfile.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('CV profile not found');

    let skills: string[] = [];
    try { skills = JSON.parse(existing.skills); } catch { /* empty */ }

    let versions: VersionSnapshot[] = [];
    try { versions = JSON.parse(existing.versions); } catch { /* empty */ }

    const enc = this.prisma.encryption;
    const existingBody = enc.decrypt(existing.body);

    // Decide new body + new structured cache based on which fields were sent.
    let newBody = existingBody;
    let newStructuredJson: string | null = existing.structured;
    let bodyChanged = false;

    if (data.body !== undefined) {
      // Explicit raw-text save. Verbatim — no transforms.
      newBody = data.body;
      bodyChanged = data.body !== existingBody;
      if (bodyChanged) {
        // Invalidate the structured cache: it will be re-derived on next view.
        newStructuredJson = null;
      }
    }

    if (data.structured !== undefined) {
      // Structured save path.
      newStructuredJson = data.structured === null ? null : JSON.stringify(data.structured);

      // Exception: if the canonical body is still empty, backfill it from the
      // structured data so document generation has something to work with.
      if (!newBody.trim() && data.structured) {
        newBody = structuredCvToText(data.structured);
        bodyChanged = true;
      }
    }

    if (bodyChanged) {
      try {
        skills = await this.skillsExtraction.extractSkills(newBody);
      } catch (err) {
        this.logger.warn(`Skill extraction failed, keeping existing skills: ${(err as Error).message}`);
      }
      versions.push({
        body: enc.encrypt(newBody),
        skills,
        savedAt: new Date().toISOString(),
      });
      if (versions.length > 20) versions = versions.slice(-20);
    }

    const profile = await this.prisma.cvProfile.update({
      where: { id },
      data: {
        name: data.name ?? existing.name,
        body: bodyChanged ? enc.encrypt(newBody) : existing.body,
        structured: newStructuredJson === null ? null : enc.encrypt(newStructuredJson),
        skills: JSON.stringify(skills),
        versions: JSON.stringify(versions),
      },
    });

    return this.toDto(profile);
  }

  /**
   * Parse the current body into structured form using Claude and store it.
   * Called when the user opens structured mode for a profile whose structured
   * cache is null (e.g., after a raw-text edit invalidated it).
   */
  async parseStructured(id: string): Promise<CvProfileDto> {
    const existing = await this.prisma.cvProfile.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('CV profile not found');

    const enc = this.prisma.encryption;
    const body = enc.decrypt(existing.body);

    if (!body.trim()) {
      // Nothing to parse — return an empty skeleton.
      const empty: StructuredCV = {
        summary: '', experience: [], education: [], projects: [], certifications: [],
      };
      const profile = await this.prisma.cvProfile.update({
        where: { id },
        data: { structured: enc.encrypt(JSON.stringify(empty)) },
      });
      return this.toDto(profile);
    }

    let structured: StructuredCV;
    try {
      structured = await this.claude.promptJson<StructuredCV>(
        STRUCTURED_PARSE_SYSTEM_PROMPT,
        `Raw CV text:\n\n${body.slice(0, 12000)}\n\nReturn the JSON now.`,
      );
      // Normalize: make sure all required arrays exist.
      structured = {
        summary: structured.summary ?? '',
        experience: structured.experience ?? [],
        education: structured.education ?? [],
        projects: structured.projects ?? [],
        certifications: structured.certifications ?? [],
        additionalInfo: structured.additionalInfo ?? '',
      };
    } catch (err) {
      this.logger.error(`AI parse failed, falling back to heuristic: ${(err as Error).message}`);
      structured = textToStructuredCv(body);
    }

    const profile = await this.prisma.cvProfile.update({
      where: { id },
      data: { structured: enc.encrypt(JSON.stringify(structured)) },
    });
    return this.toDto(profile);
  }

  async deleteProfile(id: string): Promise<void> {
    const profile = await this.prisma.cvProfile.findUnique({ where: { id } });
    if (!profile) throw new NotFoundException('CV profile not found');

    await this.prisma.cvProfile.delete({ where: { id } });

    // If deleted profile was default, set another as default
    if (profile.isDefault) {
      const next = await this.prisma.cvProfile.findFirst();
      if (next) {
        await this.prisma.cvProfile.update({
          where: { id: next.id },
          data: { isDefault: true },
        });
      }
    }
  }

  async setDefault(id: string): Promise<CvProfileDto> {
    // Unset current default
    await this.prisma.cvProfile.updateMany({
      where: { isDefault: true },
      data: { isDefault: false },
    });

    const profile = await this.prisma.cvProfile.update({
      where: { id },
      data: { isDefault: true },
    });

    return this.toDto(profile);
  }

  async updateSkills(
    id: string,
    skills: string[],
  ): Promise<CvProfileDto> {
    const profile = await this.prisma.cvProfile.update({
      where: { id },
      data: { skills: JSON.stringify(skills) },
    });
    return this.toDto(profile);
  }

  async getVersions(id: string): Promise<VersionSnapshot[]> {
    const profile = await this.prisma.cvProfile.findUnique({ where: { id } });
    if (!profile) throw new NotFoundException('CV profile not found');

    try {
      const versions: VersionSnapshot[] = JSON.parse(profile.versions);
      // Decrypt body in each version snapshot
      const enc = this.prisma.encryption;
      return versions.map((v) => ({ ...v, body: enc.decrypt(v.body) }));
    } catch {
      return [];
    }
  }

  async restoreVersion(id: string, versionIndex: number): Promise<CvProfileDto> {
    const versions = await this.getVersions(id);
    if (versionIndex < 0 || versionIndex >= versions.length) {
      throw new NotFoundException('Version not found');
    }

    const version = versions[versionIndex];
    // version.body is already decrypted by getVersions, re-encrypt for storage
    const enc = this.prisma.encryption;
    const profile = await this.prisma.cvProfile.update({
      where: { id },
      data: {
        body: enc.encrypt(version.body),
        // Body changed — invalidate the structured cache.
        structured: null,
        skills: JSON.stringify(version.skills),
      },
    });

    return this.toDto(profile);
  }

  private toDto(profile: any): CvProfileDto {
    let skills: string[] = [];
    try { skills = JSON.parse(profile.skills); } catch { /* empty */ }

    let structured: StructuredCV | null = null;
    if (profile.structured) {
      try {
        const decrypted = this.prisma.encryption.decrypt(profile.structured);
        structured = JSON.parse(decrypted);
      } catch (err) {
        this.logger.warn(`Failed to decode structured cache for ${profile.id}: ${(err as Error).message}`);
      }
    }

    return {
      id: profile.id,
      name: profile.name,
      body: this.prisma.encryption.decrypt(profile.body),
      structured,
      skills,
      isDefault: profile.isDefault,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    };
  }
}
