import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export type SponsorConfidence = 'confirmed' | 'likely' | 'unknown' | 'unlikely' | 'rejected';

interface SponsorMatch {
  confidence: SponsorConfidence;
  reason: string;
}

// Phrases that strongly indicate NO sponsorship
const REJECT_PHRASES = [
  'no visa sponsorship', 'unable to sponsor', 'not able to sponsor',
  'cannot sponsor', 'will not sponsor', 'do not sponsor', 'does not sponsor',
  'must have right to work', 'must be authorized to work', 'must be authorised to work',
  'must be legally authorized', 'must be legally authorised',
  'must have existing right', 'must already have the right',
  'citizens and permanent residents only', 'citizens or permanent residents only',
  'must not require sponsorship', 'sponsorship is not available',
  'sponsorship not available', 'no sponsorship available',
  'not offering sponsorship', 'without requiring sponsorship',
];

// Phrases that strongly indicate YES sponsorship
const CONFIRM_PHRASES = [
  'visa sponsorship', 'sponsor visa', 'sponsorship available',
  'willing to sponsor', 'we sponsor', 'sponsorship provided',
  'relocation package', 'relocation assistance', 'relocation support',
  'work permit assistance', 'immigration support', 'immigration assistance',
  'international candidates welcome', 'international applicants encouraged',
  '482 visa', 'tss visa', 'tss sponsor', '186 visa', 'ens visa', 'approved sponsor',
  'subclass 482', 'subclass 186', 'subclass 494',
  'certificate of sponsorship', 'sponsor licence', 'skilled worker visa',
  'skilled worker sponsor', 'tier 2', 'cos holder',
  'lmia', 'global talent stream', 'work permit sponsor',
  'blue card', 'blaue karte', 'eu blue card',
  'kennismigrant', 'highly skilled migrant', '30% ruling', '30% tax ruling',
  'recognised sponsor', 'recognized sponsor', 'erkend referent',
  'aewv', 'accredited employer work visa', 'accredited employer',
  'critical skills', 'employment permit', 'stamp 1',
  'employment pass',
  'work visa', 'work authorization support',
];

@Injectable()
export class KnownSponsorsService implements OnModuleInit {
  private readonly logger = new Logger(KnownSponsorsService.name);
  private sponsorCache: Set<string> = new Set(); // all known sponsor names (lowercased)
  private userFeedback: Map<string, boolean> = new Map();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    setTimeout(() => this.loadCache(), 9000);
  }

  private async loadCache() {
    try {
      // Load from known_sponsors table
      const sponsors = await this.prisma.knownSponsor.findMany({
        select: { company: true },
      });
      this.sponsorCache = new Set(sponsors.map((s) => s.company.toLowerCase()));

      // Load user feedback
      const feedback = await this.prisma.sponsorFeedback.findMany();
      for (const f of feedback) {
        this.userFeedback.set(`${f.company.toLowerCase()}|${f.countryCode}`, f.sponsors);
      }

      this.logger.log(`Loaded ${this.sponsorCache.size} known sponsors, ${feedback.length} user feedback`);
    } catch {
      this.logger.warn('Failed to load sponsor cache (DB may not be ready)');
    }
  }

  async addFeedback(company: string, countryCode: string, sponsors: boolean) {
    const key = `${company.toLowerCase().trim()}|${countryCode}`;
    this.userFeedback.set(key, sponsors);
    await this.prisma.sponsorFeedback.upsert({
      where: { company_countryCode: { company: company.toLowerCase().trim(), countryCode } },
      create: { company: company.toLowerCase().trim(), countryCode, sponsors, source: 'user' },
      update: { sponsors, source: 'user' },
    });
  }

  preScreen(company: string, description: string, countryCode: string): SponsorMatch | null {
    const descLower = description.toLowerCase();
    const companyLower = company.toLowerCase().trim();

    // 1. User feedback (highest priority)
    const feedbackKey = `${companyLower}|${countryCode}`;
    if (this.userFeedback.has(feedbackKey)) {
      const sponsors = this.userFeedback.get(feedbackKey)!;
      return {
        confidence: sponsors ? 'confirmed' : 'rejected',
        reason: `User confirmed: ${company} ${sponsors ? 'sponsors' : 'does not sponsor'} in ${countryCode}`,
      };
    }

    // 2. Explicit rejection phrases
    for (const phrase of REJECT_PHRASES) {
      if (descLower.includes(phrase)) {
        return { confidence: 'rejected', reason: `Description contains "${phrase}"` };
      }
    }

    // 3. Explicit confirmation phrases
    for (const phrase of CONFIRM_PHRASES) {
      if (descLower.includes(phrase)) {
        return { confidence: 'confirmed', reason: `Description mentions "${phrase}"` };
      }
    }

    // 4. Known sponsors DB
    for (const sponsor of this.sponsorCache) {
      if (companyLower === sponsor || companyLower.includes(sponsor) || sponsor.includes(companyLower)) {
        return { confidence: 'likely', reason: `${company} is a known visa sponsor` };
      }
    }

    return null;
  }
}
