import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { DedupService } from '../scraper/dedup.service';
import type { JobFeedItem, JobProcessingStatus, ApplicationStatus } from '@greenseer/shared';

export interface FeedQuery {
  countryCode?: string;
  minScore?: number;
  hasDocuments?: boolean;
  sortBy?: 'matchScore' | 'createdAt' | 'salary';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
  statusFilter?: string; // 'all' | 'pending' | 'eligible' | 'ineligible' | 'matched'
}

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dedup: DedupService,
  ) {}

  async getFeed(query: FeedQuery): Promise<{ jobs: JobFeedItem[]; total: number; counts: Record<string, number> }> {
    const page = query.page || 1;
    const limit = query.limit || 50;
    const skip = (page - 1) * limit;

    // Base: exclude dismissed
    const baseWhere: any = {
      OR: [
        { application: null },
        { application: { status: { not: 'withdrawn' } } },
      ],
    };

    if (query.countryCode) {
      baseWhere.analysis = { countryCode: query.countryCode };
    }

    // Get ALL jobs for counting
    const allJobs = await this.prisma.job.findMany({
      where: baseWhere,
      include: {
        analysis: true,
        matches: { take: 1, orderBy: { analyzedAt: 'desc' } },
        application: { select: { status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Compute processing status for each job
    let feedItems: JobFeedItem[] = allJobs.map((job) => {
      const match = job.matches[0];
      let matchedSkills: string[] = [];
      let missingSkills: string[] = [];
      try {
        if (match?.matchedSkills) matchedSkills = JSON.parse(match.matchedSkills);
        if (match?.missingSkills) missingSkills = JSON.parse(match.missingSkills);
      } catch { /* ignore */ }

      let processingStatus: JobProcessingStatus = 'pending';
      if (job.analysis) {
        if (job.analysis.overallEligible) {
          processingStatus = match ? 'matched' : 'eligible';
        } else {
          processingStatus = 'ineligible';
        }
      }

      return {
        id: job.id,
        source: job.source as any,
        title: job.title,
        company: job.company,
        location: job.location,
        salary: job.salary,
        description: job.description,
        url: job.url,
        postedAt: (job as any).postedAt?.toISOString() || null,
        createdAt: job.createdAt.toISOString(),
        processingStatus,
        applicationStatus: (job as any).application?.status || null,
        analysis: job.analysis
          ? {
              visaSponsorship: job.analysis.visaSponsorship,
              visaExplanation: job.analysis.visaExplanation,
              sponsorTier: (job.analysis as any).sponsorTier || 'unknown',
              locationScopePass: job.analysis.locationScopePass,
              scopeExplanation: job.analysis.scopeExplanation,
              overallEligible: job.analysis.overallEligible,
              confidence: job.analysis.confidence,
              countryCode: job.analysis.countryCode,
            }
          : null,
        match: match
          ? {
              matchScore: match.matchScore,
              matchedSkills,
              missingSkills,
              summary: match.summary,
              recommendApply: match.recommendApply,
            }
          : null,
      };
    });

    // Count by status
    const counts: Record<string, number> = { all: feedItems.length, pending: 0, eligible: 0, ineligible: 0, matched: 0 };
    for (const item of feedItems) {
      counts[item.processingStatus] = (counts[item.processingStatus] || 0) + 1;
    }

    // Apply status filter
    const statusFilter = query.statusFilter || 'all';
    if (statusFilter !== 'all') {
      feedItems = feedItems.filter((j) => j.processingStatus === statusFilter);
    }

    // Apply minScore filter
    if (query.minScore && query.minScore > 0) {
      feedItems = feedItems.filter((j) => (j.match?.matchScore ?? 0) >= query.minScore!);
    }

    const sortByScore = query.sortBy === 'matchScore';
    if (sortByScore) {
      feedItems.sort((a, b) => {
        const scoreA = a.match?.matchScore ?? -1;
        const scoreB = b.match?.matchScore ?? -1;
        return query.sortOrder === 'asc' ? scoreA - scoreB : scoreB - scoreA;
      });
    }

    // Paginate
    const total = feedItems.length;
    feedItems = feedItems.slice(skip, skip + limit);

    return { jobs: feedItems, total, counts };
  }

  async getJob(id: string): Promise<JobFeedItem | null> {
    const job = await this.prisma.job.findUnique({
      where: { id },
      include: {
        analysis: true,
        matches: { take: 1, orderBy: { analyzedAt: 'desc' } },
      },
    });

    if (!job) return null;

    const match = job.matches[0];
    let matchedSkills: string[] = [];
    let missingSkills: string[] = [];
    try {
      if (match?.matchedSkills) matchedSkills = JSON.parse(match.matchedSkills);
      if (match?.missingSkills) missingSkills = JSON.parse(match.missingSkills);
    } catch { /* ignore */ }

    let processingStatus: JobProcessingStatus = 'pending';
    if (job.analysis) {
      processingStatus = job.analysis.overallEligible ? (match ? 'matched' : 'eligible') : 'ineligible';
    }

    return {
      id: job.id,
      source: job.source as any,
      title: job.title,
      company: job.company,
      location: job.location,
      salary: job.salary,
      description: job.description,
      url: job.url,
      postedAt: (job as any).postedAt?.toISOString() || null,
      createdAt: job.createdAt.toISOString(),
      processingStatus,
      applicationStatus: null,
      analysis: job.analysis
        ? {
            visaSponsorship: job.analysis.visaSponsorship,
            visaExplanation: job.analysis.visaExplanation,
            sponsorTier: (job.analysis as any).sponsorTier || 'unknown',
            locationScopePass: job.analysis.locationScopePass,
            scopeExplanation: job.analysis.scopeExplanation,
            overallEligible: job.analysis.overallEligible,
            confidence: job.analysis.confidence,
            countryCode: job.analysis.countryCode,
          }
        : null,
      match: match
        ? {
            matchScore: match.matchScore,
            matchedSkills,
            missingSkills,
            summary: match.summary,
            recommendApply: match.recommendApply,
          }
        : null,
    };
  }

  async dismissJob(jobId: string): Promise<void> {
    // Create application record with "not interested" equivalent — use withdrawn
    // and add to suppression list
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: { fingerprint: true },
    });

    if (job) {
      await this.prisma.application.upsert({
        where: { jobId },
        create: {
          jobId,
          status: 'withdrawn',
          history: JSON.stringify([
            { status: 'withdrawn', timestamp: new Date().toISOString(), note: 'Not interested' },
          ]),
        },
        update: {
          status: 'withdrawn',
        },
      });
      this.dedup.suppress(job.fingerprint);
    }
  }

  async saveJob(jobId: string): Promise<void> {
    await this.prisma.application.upsert({
      where: { jobId },
      create: {
        jobId,
        status: 'saved',
        history: JSON.stringify([
          { status: 'saved', timestamp: new Date().toISOString() },
        ]),
      },
      update: {},
    });
  }

  private buildOrderBy(
    sortBy?: string,
    sortOrder?: string,
  ): any {
    const order = sortOrder === 'asc' ? 'asc' : 'desc';

    switch (sortBy) {
      case 'matchScore':
        return { matches: { _count: order } }; // Approximate — sort by having matches
      case 'salary':
        return { salary: order };
      case 'createdAt':
      default:
        return { createdAt: order };
    }
  }
}
