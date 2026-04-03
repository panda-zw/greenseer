import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { ApplicationDto, ApplicationStatus, StatusHistoryEntry } from '@greenseer/shared';

@Injectable()
export class TrackerService {
  constructor(private readonly prisma: PrismaService) {}

  async getApplications(status?: string): Promise<ApplicationDto[]> {
    const apps = await this.prisma.application.findMany({
      where: status ? { status } : undefined,
      include: {
        job: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    return apps.map((app) => this.toDto(app));
  }

  async getApplication(id: string): Promise<ApplicationDto> {
    const app = await this.prisma.application.findUnique({
      where: { id },
      include: { job: true },
    });
    if (!app) throw new NotFoundException('Application not found');
    return this.toDto(app);
  }

  async updateStatus(
    id: string,
    newStatus: ApplicationStatus,
    note?: string,
  ): Promise<ApplicationDto> {
    const app = await this.prisma.application.findUnique({ where: { id } });
    if (!app) throw new NotFoundException('Application not found');

    let history: StatusHistoryEntry[] = [];
    try {
      history = JSON.parse(app.history);
    } catch { /* empty */ }

    history.push({
      status: newStatus,
      timestamp: new Date().toISOString(),
      note,
    });

    const updated = await this.prisma.application.update({
      where: { id },
      data: {
        status: newStatus,
        history: JSON.stringify(history),
      },
      include: { job: true },
    });

    return this.toDto(updated);
  }

  async updateNotes(id: string, notes: string): Promise<ApplicationDto> {
    const updated = await this.prisma.application.update({
      where: { id },
      data: { notes },
      include: { job: true },
    });
    return this.toDto(updated);
  }

  async updateSalary(id: string, salaryOffer: string): Promise<ApplicationDto> {
    const updated = await this.prisma.application.update({
      where: { id },
      data: { salaryOffer },
      include: { job: true },
    });
    return this.toDto(updated);
  }

  async createFromJob(
    jobId: string,
    status: ApplicationStatus = 'saved',
  ): Promise<ApplicationDto> {
    const app = await this.prisma.application.upsert({
      where: { jobId },
      create: {
        jobId,
        status,
        history: JSON.stringify([
          { status, timestamp: new Date().toISOString() },
        ]),
      },
      update: {},
      include: { job: true },
    });
    return this.toDto(app);
  }

  async getStatistics() {
    const apps = await this.prisma.application.findMany({
      select: { status: true, history: true, createdAt: true },
    });

    const byStatus: Record<string, number> = {};
    let totalApplied = 0;
    let totalScreening = 0;
    let totalInterviewing = 0;
    let totalOffer = 0;
    let daysToScreening: number[] = [];
    let daysToInterview: number[] = [];

    for (const app of apps) {
      byStatus[app.status] = (byStatus[app.status] || 0) + 1;

      let history: StatusHistoryEntry[] = [];
      try {
        history = JSON.parse(app.history);
      } catch { continue; }

      const findTimestamp = (s: string) =>
        history.find((h) => h.status === s)?.timestamp;

      const appliedAt = findTimestamp('applied');
      const screeningAt = findTimestamp('screening');
      const interviewingAt = findTimestamp('interviewing');
      const offerAt = findTimestamp('offer');

      if (appliedAt) totalApplied++;
      if (screeningAt) totalScreening++;
      if (interviewingAt) totalInterviewing++;
      if (offerAt) totalOffer++;

      if (appliedAt && screeningAt) {
        const days = (new Date(screeningAt).getTime() - new Date(appliedAt).getTime()) / 86400000;
        daysToScreening.push(days);
      }
      if (screeningAt && interviewingAt) {
        const days = (new Date(interviewingAt).getTime() - new Date(screeningAt).getTime()) / 86400000;
        daysToInterview.push(days);
      }
    }

    const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

    return {
      byStatus,
      total: apps.length,
      avgDaysToScreening: avg(daysToScreening),
      avgDaysToInterview: avg(daysToInterview),
      interviewToOfferRate: totalInterviewing > 0 ? Math.round((totalOffer / totalInterviewing) * 100) : null,
      responseRate: totalApplied > 0 ? Math.round((totalScreening / totalApplied) * 100) : null,
    };
  }

  private toDto(app: any): ApplicationDto {
    let history: StatusHistoryEntry[] = [];
    try {
      history = JSON.parse(app.history);
    } catch { /* empty */ }

    return {
      id: app.id,
      jobId: app.jobId,
      status: app.status as ApplicationStatus,
      history,
      notes: app.notes,
      salaryOffer: app.salaryOffer,
      createdAt: app.createdAt.toISOString(),
      updatedAt: app.updatedAt.toISOString(),
      job: app.job
        ? {
            id: app.job.id,
            source: app.job.source,
            title: app.job.title,
            company: app.job.company,
            location: app.job.location,
            salary: app.job.salary,
            description: app.job.description,
            url: app.job.url,
            postedAt: (app.job as any).postedAt?.toISOString() || null,
            createdAt: app.job.createdAt.toISOString(),
          }
        : undefined,
    };
  }
}
