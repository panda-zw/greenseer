import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { JobEnrichmentService } from './job-enrichment.service';
import { KnownSponsorsService } from '../ai/known-sponsors.service';
import { JobProcessorService } from '../ai/job-processor.service';
import { PrismaService } from '../database/prisma.service';

@Controller('jobs')
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly enrichment: JobEnrichmentService,
    private readonly knownSponsors: KnownSponsorsService,
    private readonly jobProcessor: JobProcessorService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('feed')
  getFeed(
    @Query('countryCode') countryCode?: string,
    @Query('minScore') minScore?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('statusFilter') statusFilter?: string,
  ) {
    return this.jobsService.getFeed({
      countryCode,
      minScore: minScore ? parseInt(minScore, 10) : undefined,
      sortBy: sortBy as any,
      sortOrder: sortOrder as any,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      statusFilter,
    });
  }

  @Get(':id')
  getJob(@Param('id') id: string) {
    return this.jobsService.getJob(id);
  }

  @Post(':id/save')
  saveJob(@Param('id') id: string) {
    return this.jobsService.saveJob(id);
  }

  @Post(':id/dismiss')
  dismissJob(@Param('id') id: string) {
    return this.jobsService.dismissJob(id);
  }

  @Post(':id/enrich')
  async enrichJob(@Param('id') id: string) {
    const description = await this.enrichment.enrichDescription(id);
    return { description, enriched: description !== null && description.length > 100 };
  }

  @Post(':id/reanalyze')
  async reanalyzeJob(@Param('id') id: string) {
    // Delete existing analysis so it gets reprocessed
    await this.prisma.jobAnalysis.deleteMany({ where: { jobId: id } });
    await this.prisma.jobMatch.deleteMany({ where: { jobId: id } });
    // Re-enqueue for processing
    await this.jobProcessor.enqueue(id);
    return { ok: true, message: 'Job queued for re-analysis' };
  }

  @Post(':id/enrich-and-reanalyze')
  async enrichAndReanalyze(@Param('id') id: string) {
    // First enrich the description
    await this.enrichment.enrichDescription(id);
    // Then delete old analysis and reprocess
    await this.prisma.jobAnalysis.deleteMany({ where: { jobId: id } });
    await this.prisma.jobMatch.deleteMany({ where: { jobId: id } });
    await this.jobProcessor.enqueue(id);
    return { ok: true, message: 'Job enriched and queued for re-analysis' };
  }

  @Post('clear')
  async clearAllJobs(@Body() body: { olderThanDays?: number } = {}) {
    const where: any = {};
    if (body.olderThanDays) {
      const cutoff = new Date(Date.now() - body.olderThanDays * 86400000);
      where.createdAt = { lt: cutoff };
    }
    // Delete in correct order due to foreign keys
    await this.prisma.generatedDocument.deleteMany({ where: { job: where.createdAt ? where : undefined } });
    await this.prisma.jobMatch.deleteMany({ where: { job: where.createdAt ? where : undefined } });
    await this.prisma.jobAnalysis.deleteMany({ where: { job: where.createdAt ? where : undefined } });
    await this.prisma.application.deleteMany({ where: { job: where.createdAt ? where : undefined } });
    const result = await this.prisma.job.deleteMany({ where });
    return { deleted: result.count };
  }

  @Post('sponsor-feedback')
  async sponsorFeedback(
    @Body() body: { company: string; countryCode: string; sponsors: boolean },
  ) {
    await this.knownSponsors.addFeedback(body.company, body.countryCode, body.sponsors);
    return { ok: true };
  }
}
