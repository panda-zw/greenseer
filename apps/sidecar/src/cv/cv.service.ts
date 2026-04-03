import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { SkillsExtractionService } from './skills-extraction.service';
import type { CvProfileDto } from '@greenseer/shared';

export interface VersionSnapshot {
  body: string;
  skills: string[];
  savedAt: string;
}

@Injectable()
export class CvService {
  private readonly logger = new Logger(CvService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly skillsExtraction: SkillsExtractionService,
  ) {}

  async listProfiles(): Promise<CvProfileDto[]> {
    const profiles = await this.prisma.cvProfile.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    return profiles.map(this.toDto);
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

  async updateProfile(
    id: string,
    data: { name?: string; body?: string },
  ): Promise<CvProfileDto> {
    const existing = await this.prisma.cvProfile.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('CV profile not found');

    let skills: string[] = [];
    try {
      skills = JSON.parse(existing.skills);
    } catch { /* empty */ }

    // If body changed, re-extract skills and add version snapshot
    let versions: VersionSnapshot[] = [];
    try {
      versions = JSON.parse(existing.versions);
    } catch { /* empty */ }

    const enc = this.prisma.encryption;
    const existingBody = enc.decrypt(existing.body);

    if (data.body && data.body !== existingBody) {
      skills = await this.skillsExtraction.extractSkills(data.body);
      versions.push({
        body: enc.encrypt(data.body),
        skills,
        savedAt: new Date().toISOString(),
      });
      // Keep last 20 versions
      if (versions.length > 20) {
        versions = versions.slice(-20);
      }
    }

    const profile = await this.prisma.cvProfile.update({
      where: { id },
      data: {
        name: data.name ?? existing.name,
        body: data.body ? enc.encrypt(data.body) : existing.body,
        skills: JSON.stringify(skills),
        versions: JSON.stringify(versions),
      },
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
        skills: JSON.stringify(version.skills),
      },
    });

    return this.toDto(profile);
  }

  private toDto(profile: any): CvProfileDto {
    let skills: string[] = [];
    try {
      skills = JSON.parse(profile.skills);
    } catch { /* empty */ }

    return {
      id: profile.id,
      name: profile.name,
      body: this.prisma.encryption.decrypt(profile.body),
      skills,
      isDefault: profile.isDefault,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    };
  }
}
