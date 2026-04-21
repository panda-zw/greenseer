import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { ProjectDto } from '@greenseer/shared';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<ProjectDto[]> {
    const projects = await this.prisma.project.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    return projects.map(this.toDto);
  }

  async get(id: string): Promise<ProjectDto> {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');
    return this.toDto(project);
  }

  async create(data: {
    name: string;
    description: string;
    techStack?: string[];
    url?: string;
    startDate?: string;
    endDate?: string;
    highlights?: string[];
  }): Promise<ProjectDto> {
    const project = await this.prisma.project.create({
      data: {
        name: data.name,
        description: data.description,
        techStack: JSON.stringify(data.techStack ?? []),
        url: data.url ?? null,
        startDate: data.startDate ?? null,
        endDate: data.endDate ?? null,
        highlights: JSON.stringify(data.highlights ?? []),
      },
    });
    return this.toDto(project);
  }

  async update(
    id: string,
    data: {
      name?: string;
      description?: string;
      techStack?: string[];
      url?: string | null;
      startDate?: string | null;
      endDate?: string | null;
      highlights?: string[];
    },
  ): Promise<ProjectDto> {
    const existing = await this.prisma.project.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Project not found');

    const project = await this.prisma.project.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.techStack !== undefined && { techStack: JSON.stringify(data.techStack) }),
        ...(data.url !== undefined && { url: data.url }),
        ...(data.startDate !== undefined && { startDate: data.startDate }),
        ...(data.endDate !== undefined && { endDate: data.endDate }),
        ...(data.highlights !== undefined && { highlights: JSON.stringify(data.highlights) }),
      },
    });
    return this.toDto(project);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.project.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Project not found');
    await this.prisma.project.delete({ where: { id } });
  }

  /**
   * Serialize all projects into a text block suitable for inclusion in a CV
   * generation prompt. Called by the document generator.
   */
  async getProjectsContext(): Promise<string> {
    const projects = await this.prisma.project.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    if (projects.length === 0) return '';

    return projects.map((p) => {
      const tech = this.parseJson<string[]>(p.techStack);
      const highlights = this.parseJson<string[]>(p.highlights);
      const lines = [
        `PROJECT: ${p.name}`,
        tech.length > 0 ? `Tech Stack: ${tech.join(', ')}` : '',
        p.url ? `URL: ${p.url}` : '',
        p.startDate ? `Period: ${p.startDate}${p.endDate ? ` - ${p.endDate}` : ' - Present'}` : '',
        `Description: ${p.description}`,
        ...highlights.map((h) => `- ${h}`),
      ].filter(Boolean);
      return lines.join('\n');
    }).join('\n\n');
  }

  private toDto = (project: any): ProjectDto => {
    return {
      id: project.id,
      name: project.name,
      description: project.description,
      techStack: this.parseJson<string[]>(project.techStack),
      url: project.url,
      startDate: project.startDate,
      endDate: project.endDate,
      highlights: this.parseJson<string[]>(project.highlights),
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    };
  }

  private parseJson<T>(value: string): T {
    try { return JSON.parse(value); }
    catch { return [] as unknown as T; }
  }
}
