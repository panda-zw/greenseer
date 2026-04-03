import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { ActivityService } from '../activity/activity.service';
import { KeyStoreService } from '../keystore.service';
import { VisaVerificationService } from './visa-verification.service';
import { CvMatchingService } from './cv-matching.service';
import { KnownSponsorsService } from './known-sponsors.service';

@Injectable()
export class JobProcessorService implements OnModuleInit {
  private readonly logger = new Logger(JobProcessorService.name);
  private queue: string[] = [];
  private processing = false;
  private stats = { waiting: 0, active: 0, completed: 0, failed: 0 };

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly settings: SettingsService,
    private readonly keyStore: KeyStoreService,
    private readonly knownSponsors: KnownSponsorsService,
    private readonly visaVerification: VisaVerificationService,
    private readonly cvMatching: CvMatchingService,
  ) {}

  async onModuleInit() {
    this.logger.log('Job processing queue initialized (in-memory)');

    // Re-queue unprocessed jobs from previous runs (delayed to let DB init)
    setTimeout(() => this.requeuePendingJobs(), 10000);
  }

  private async requeuePendingJobs() {
    try {
      // Find all jobs that have no analysis record
      const unprocessed = await this.prisma.job.findMany({
        where: { analysis: null },
        select: { id: true },
        orderBy: { createdAt: 'desc' },
      });

      if (unprocessed.length > 0) {
        this.logger.log(`Re-queuing ${unprocessed.length} unprocessed jobs from DB`);
        this.activity.info('AI', `Re-queuing ${unprocessed.length} pending jobs for analysis`);
        await this.enqueueMany(unprocessed.map((j) => j.id));
      }
    } catch (error: any) {
      this.logger.error(`Failed to requeue pending jobs: ${error.message}`);
    }
  }

  async enqueue(jobId: string) {
    this.queue.push(jobId);
    this.stats.waiting++;
    this.processNext();
  }

  async enqueueMany(jobIds: string[]) {
    this.queue.push(...jobIds);
    this.stats.waiting += jobIds.length;
    this.logger.log(`Enqueued ${jobIds.length} jobs for processing`);
    this.processNext();
  }

  getStats() {
    return { ...this.stats, waiting: this.queue.length };
  }

  private async processNext() {
    if (this.processing) return;
    if (this.queue.length === 0) return;

    if (!this.keyStore.hasAnthropicKey()) {
      this.logger.warn('No Anthropic key — pausing AI processing');
      this.activity.warn('AI', 'AI analysis paused — no Anthropic API key', 'Add your key in Settings > API Keys');
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      // Take a batch of up to 5
      const batchSize = Math.min(5, this.queue.length);
      const batchIds = this.queue.splice(0, batchSize);
      this.stats.active += batchIds.length;

      try {
        await this.processBatch(batchIds);
        this.stats.completed += batchIds.length;
      } catch (error: any) {
        this.stats.failed += batchIds.length;
        this.logger.error(`Batch processing failed: ${error}`);
        this.activity.error('AI', `Batch analysis failed (${batchIds.length} jobs)`, error?.message || String(error));
      }

      this.stats.active -= batchIds.length;

      // Rate limit between batches
      await this.delay(2000);
    }

    this.processing = false;
  }

  private async processBatch(jobIds: string[]) {
    const appSettings = await this.settings.getSettings();
    const needsAi: { id: string; description: string; title: string; company: string; location: string; countryCode: string; mode: 'relocate' | 'remote' }[] = [];

    // Phase 1: Pre-filter each job (0 tokens)
    for (const jobId of jobIds) {
      await this.processJob(jobId, appSettings, needsAi);
    }

    // Phase 2: Batch AI call for remaining jobs
    if (needsAi.length > 0) {
      this.activity.info('AI', `Batch analyzing ${needsAi.length} jobs...`);

      const results = await this.visaVerification.verifyBatch(needsAi);

      for (const job of needsAi) {
        const result = results.get(job.id);
        if (!result) continue;

        let sponsorTier = 'unknown';
        if (result.visaSponsorship && result.confidence >= 0.8) sponsorTier = 'confirmed';
        else if (result.visaSponsorship && result.confidence >= 0.5) sponsorTier = 'likely';
        else if (!result.visaSponsorship && result.confidence >= 0.8) sponsorTier = 'rejected';
        else if (!result.visaSponsorship) sponsorTier = 'unlikely';

        await this.prisma.jobAnalysis.create({
          data: {
            jobId: job.id,
            visaSponsorship: result.visaSponsorship,
            visaExplanation: result.visaExplanation,
            sponsorTier,
            locationScopePass: result.locationScopePass,
            scopeExplanation: result.scopeExplanation,
            overallEligible: result.overallEligible,
            confidence: result.confidence,
            countryCode: job.countryCode,
          },
        });

        this.activity.info('AI', `Visa check: ${job.title} @ ${job.company}`, `${sponsorTier} — ${result.visaExplanation.split('.')[0]}`);

        if (result.overallEligible) {
          await this.runStage2IfNeeded(job.id);
        }
      }
    }
  }

  private async processJob(jobId: string, existingSettings?: any, batchQueue?: any[]) {
    const jobResult = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: { analysis: true },
    });

    if (!jobResult) {
      this.logger.warn(`Job ${jobId} not found, skipping`);
      return;
    }

    // Make mutable copy for enrichment
    let job = { ...jobResult, description: jobResult.description };

    // Skip if already analyzed
    if (jobResult.analysis) {
      this.logger.debug(`Job ${jobId} already analyzed, checking Stage 2`);
      await this.runStage2IfNeeded(jobId);
      return;
    }

    const appSettings = existingSettings || await this.settings.getSettings();

    // Pre-filter: check blocklist keywords (no AI tokens used)
    const blocklist = appSettings.search.blocklist || [];
    const textLower = `${job.title} ${job.description}`.toLowerCase();
    const blockedTerm = blocklist.find((term: string) => textLower.includes(term.toLowerCase()));
    if (blockedTerm) {
      await this.prisma.jobAnalysis.create({
        data: {
          jobId: job.id,
          visaSponsorship: false,
          visaExplanation: `Blocked by keyword: "${blockedTerm}"`,
          locationScopePass: false,
          scopeExplanation: 'Skipped due to blocklist match',
          overallEligible: false,
          confidence: 1.0,
          countryCode: 'XX',
        },
      });
      return;
    }

    // Pre-filter: if description is too short, try enrichment first
    if (job.description.length < 100) {
      // Try to fetch the full description from the source
      try {
        const axios = (await import('axios')).default;
        const res = await axios.get(job.url, {
          timeout: 10000,
          headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
        });
        const html = res.data as string;
        const descMatch = html.match(/class="show-more-less-html__markup[^"]*"[^>]*>([\s\S]*?)<\/div>/)
          || html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
        if (descMatch) {
          let enrichedDesc = descMatch[1]
            .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<li[^>]*>/gi, '- ')
            .replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim();
          // Try JSON-LD
          if (enrichedDesc.startsWith('{')) {
            try { enrichedDesc = JSON.parse(enrichedDesc).description || enrichedDesc; } catch {}
          }
          if (enrichedDesc.length > job.description.length) {
            await this.prisma.job.update({ where: { id: job.id }, data: { description: enrichedDesc } });
            job = { ...job, description: enrichedDesc };
            this.logger.log(`Auto-enriched job ${job.id}: ${enrichedDesc.length} chars`);
          }
        }
      } catch { /* enrichment failed, continue with what we have */ }
    }

    // If still too short after enrichment attempt, mark as needs manual review
    if (job.description.length < 50) {
      await this.prisma.jobAnalysis.create({
        data: {
          jobId: job.id,
          visaSponsorship: false,
          visaExplanation: 'Job description too short to analyze - click "Fetch Full Description" to retry',
          locationScopePass: false,
          scopeExplanation: 'Insufficient information',
          overallEligible: false,
          confidence: 0.5,
          countryCode: 'XX',
        },
      });
      return;
    }

    const countryConfig = this.findCountryForJob(job.location, appSettings.search.countries);
    if (!countryConfig) {
      // No country match — mark as ineligible without using AI
      await this.prisma.jobAnalysis.create({
        data: {
          jobId: job.id,
          visaSponsorship: false,
          visaExplanation: 'Job location does not match any enabled target country',
          locationScopePass: false,
          scopeExplanation: `Location "${job.location}" not in target countries`,
          overallEligible: false,
          confidence: 0.8,
          countryCode: 'XX',
        },
      });
      return;
    }

    // Pre-screen with known sponsors database (0 tokens)
    const preScreen = this.knownSponsors.preScreen(
      job.company,
      job.description,
      countryConfig.code,
    );

    if (preScreen) {
      const isEligible = preScreen.confidence === 'confirmed' || preScreen.confidence === 'likely';
      const isRejected = preScreen.confidence === 'rejected';

      if (isRejected || isEligible) {
        // Strong signal — skip AI, save tokens
        await this.prisma.jobAnalysis.create({
          data: {
            jobId: job.id,
            visaSponsorship: isEligible,
            visaExplanation: preScreen.reason,
            sponsorTier: preScreen.confidence,
            locationScopePass: true,
            scopeExplanation: `${job.location} — ${countryConfig.mode} mode`,
            overallEligible: isEligible,
            confidence: isRejected ? 0.95 : 0.85,
            countryCode: countryConfig.code,
          },
        });

        this.activity.info('AI', `Pre-screened: ${job.title} @ ${job.company}`, `${preScreen.confidence} — ${preScreen.reason} (0 tokens)`);

        if (isEligible) {
          await this.runStage2IfNeeded(job.id);
        }
        return;
      }
    }

    // Add to batch queue for AI processing (if caller provided one)
    if (batchQueue) {
      batchQueue.push({
        id: job.id,
        description: job.description,
        title: job.title,
        company: job.company,
        location: job.location,
        countryCode: countryConfig.code,
        mode: countryConfig.mode,
      });
      return;
    }

    // Fallback: individual AI call (when not batching)
    const result = await this.visaVerification.verify(
      job.description, job.title, job.company, job.location, countryConfig.code, countryConfig.mode,
    );

    let sponsorTier = 'unknown';
    if (result.visaSponsorship && result.confidence >= 0.8) sponsorTier = 'confirmed';
    else if (result.visaSponsorship && result.confidence >= 0.5) sponsorTier = 'likely';
    else if (!result.visaSponsorship && result.confidence >= 0.8) sponsorTier = 'rejected';
    else if (!result.visaSponsorship) sponsorTier = 'unlikely';

    await this.prisma.jobAnalysis.create({
      data: {
        jobId: job.id, visaSponsorship: result.visaSponsorship, visaExplanation: result.visaExplanation,
        sponsorTier, locationScopePass: result.locationScopePass, scopeExplanation: result.scopeExplanation,
        overallEligible: result.overallEligible, confidence: result.confidence, countryCode: countryConfig.code,
      },
    });

    this.activity.info('AI', `Visa check: ${job.title} @ ${job.company}`, `${sponsorTier} — ${result.visaExplanation.split('.')[0]}`);
    if (result.overallEligible) await this.runStage2IfNeeded(job.id);
  }

  private async runStage2IfNeeded(jobId: string) {
    const cvProfile = await this.prisma.cvProfile.findFirst({
      where: { isDefault: true },
    });

    if (!cvProfile) {
      this.logger.debug('No default CV profile set, skipping Stage 2');
      return;
    }

    const existing = await this.prisma.jobMatch.findUnique({
      where: { jobId_cvProfileId: { jobId, cvProfileId: cvProfile.id } },
    });

    if (existing) return;

    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) return;

    let skills: string[] = [];
    try {
      skills = JSON.parse(cvProfile.skills);
    } catch { /* empty */ }

    const result = await this.cvMatching.match(
      cvProfile.body,
      skills,
      job.description,
      job.title,
      job.company,
    );

    await this.prisma.jobMatch.create({
      data: {
        jobId: job.id,
        cvProfileId: cvProfile.id,
        matchScore: result.matchScore,
        matchedSkills: JSON.stringify(result.matchedSkills),
        missingSkills: JSON.stringify(result.missingSkills),
        summary: result.summary,
        recommendApply: result.recommendApply,
      },
    });

    this.logger.debug(
      `Stage 2 for ${job.id}: score=${result.matchScore}, recommend=${result.recommendApply}`,
    );
    this.activity.success('AI', `CV match: ${result.matchScore}% — ${job.title} @ ${job.company}`, result.summary);
  }

  private findCountryForJob(
    location: string,
    countries: { code: string; mode: 'relocate' | 'remote'; enabled: boolean }[],
  ): { code: string; mode: 'relocate' | 'remote' } | null {
    const loc = location.toLowerCase();

    const countryKeywords: Record<string, string[]> = {
      AU: ['australia', 'sydney', 'melbourne', 'brisbane', 'perth', 'adelaide', 'canberra'],
      UK: ['united kingdom', 'london', 'manchester', 'birmingham', 'edinburgh', 'glasgow', 'bristol', 'leeds', 'england', 'scotland', 'wales'],
      CA: ['canada', 'toronto', 'vancouver', 'montreal', 'ottawa', 'calgary', 'edmonton'],
      US: ['united states', 'new york', 'san francisco', 'seattle', 'austin', 'boston', 'chicago', 'los angeles', 'usa'],
      DE: ['germany', 'berlin', 'munich', 'hamburg', 'frankfurt', 'stuttgart', 'düsseldorf', 'münchen'],
      NL: ['netherlands', 'amsterdam', 'rotterdam', 'the hague', 'eindhoven', 'utrecht'],
      SG: ['singapore'],
      AE: ['united arab emirates', 'dubai', 'abu dhabi', 'uae'],
      NZ: ['new zealand', 'auckland', 'wellington', 'christchurch'],
      IE: ['ireland', 'dublin', 'cork', 'galway', 'limerick'],
    };

    for (const country of countries) {
      if (!country.enabled) continue;
      const keywords = countryKeywords[country.code];
      if (keywords && keywords.some((kw) => loc.includes(kw))) {
        return { code: country.code, mode: country.mode };
      }
    }

    if (loc.includes('remote')) {
      const remoteCountry = countries.find((c) => c.enabled && c.mode === 'remote');
      if (remoteCountry) return { code: remoteCountry.code, mode: 'remote' };
    }

    const first = countries.find((c) => c.enabled);
    return first ? { code: first.code, mode: first.mode } : null;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
