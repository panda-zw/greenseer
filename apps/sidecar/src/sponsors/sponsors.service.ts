import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class SponsorsService implements OnModuleInit {
  private readonly logger = new Logger(SponsorsService.name);
  private sponsorCache: Map<string, Set<string>> = new Map(); // country -> set of company names
  private lastUpdated: Date | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    setTimeout(() => this.initializeSponsors(), 8000);
  }

  private async initializeSponsors() {
    try {
      const count = await this.prisma.knownSponsor.count();
      if (count === 0) {
        this.logger.log('No sponsors in DB — seeding built-in list...');
        await this.seedBuiltinSponsors();
      }
      await this.loadCache();
    } catch (error: any) {
      this.logger.warn(`Failed to init sponsors: ${error.message}`);
    }
  }

  private async loadCache() {
    const sponsors = await this.prisma.knownSponsor.findMany();
    this.sponsorCache.clear();
    for (const s of sponsors) {
      if (!this.sponsorCache.has(s.countryCode)) {
        this.sponsorCache.set(s.countryCode, new Set());
      }
      this.sponsorCache.get(s.countryCode)!.add(s.company.toLowerCase());
    }
    this.lastUpdated = new Date();
    this.logger.log(`Loaded ${sponsors.length} known sponsors across ${this.sponsorCache.size} countries`);
  }

  isKnownSponsor(company: string, countryCode: string): boolean {
    const companyLower = company.toLowerCase().trim();
    // Check specific country
    const countrySet = this.sponsorCache.get(countryCode);
    if (countrySet) {
      for (const sponsor of countrySet) {
        if (companyLower === sponsor || companyLower.includes(sponsor) || sponsor.includes(companyLower)) {
          return true;
        }
      }
    }
    // Check global (any country)
    for (const [, sponsors] of this.sponsorCache) {
      for (const sponsor of sponsors) {
        if (companyLower === sponsor || companyLower.includes(sponsor)) return true;
      }
    }
    return false;
  }

  async getSponsors(query: {
    countryCode?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = query.page || 1;
    const limit = query.limit || 50;
    const where: any = {};
    if (query.countryCode) where.countryCode = query.countryCode;
    if (query.search) where.company = { contains: query.search };

    const [sponsors, total] = await Promise.all([
      this.prisma.knownSponsor.findMany({
        where,
        orderBy: { company: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.knownSponsor.count({ where }),
    ]);

    return { sponsors, total, lastUpdated: this.lastUpdated?.toISOString() };
  }

  async getStats() {
    const countsByCountry: Record<string, number> = {};
    for (const [country, sponsors] of this.sponsorCache) {
      countsByCountry[country] = sponsors.size;
    }
    let total = 0;
    for (const count of Object.values(countsByCountry)) total += count;
    return { total, byCountry: countsByCountry, lastUpdated: this.lastUpdated?.toISOString() };
  }

  async addSponsor(company: string, countryCode: string, source = 'manual') {
    await this.prisma.knownSponsor.upsert({
      where: { company_countryCode: { company: company.toLowerCase().trim(), countryCode } },
      create: { company: company.toLowerCase().trim(), countryCode, source },
      update: { source },
    });
    // Update cache
    if (!this.sponsorCache.has(countryCode)) this.sponsorCache.set(countryCode, new Set());
    this.sponsorCache.get(countryCode)!.add(company.toLowerCase().trim());
  }

  async removeSponsor(company: string, countryCode: string) {
    await this.prisma.knownSponsor.deleteMany({
      where: { company: company.toLowerCase().trim(), countryCode },
    });
    this.sponsorCache.get(countryCode)?.delete(company.toLowerCase().trim());
  }

  /**
   * Fetch an official government sponsor register and import it.
   */
  async fetchOfficialRegister(countryCode: string): Promise<number> {
    const axios = (await import('axios')).default;

    if (countryCode === 'UK') {
      // Step 1: Scrape the gov.uk page to find the current CSV URL (it changes with every update)
      this.logger.log('Finding current UK register CSV URL...');
      const landingPage = await axios.get(
        'https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers',
        { responseType: 'text', timeout: 15000 },
      );

      const csvMatch = (landingPage.data as string).match(
        /https:\/\/assets\.publishing\.service\.gov\.uk[^"]*Worker_and_Temporary_Worker[^"]*\.csv/,
      );

      if (!csvMatch) {
        throw new Error('Could not find CSV download link on gov.uk — the page layout may have changed');
      }

      const csvUrl = csvMatch[0];
      this.logger.log(`Found UK register at: ${csvUrl}`);

      const response = await axios.get(csvUrl, { responseType: 'text', timeout: 120_000 });
      const imported = await this.importCsv(response.data as string, countryCode, 'uk-home-office-register');
      this.logger.log(`Fetched and imported ${imported} sponsors from UK register`);
      return imported;
    }

    if (countryCode === 'NL') {
      // The Netherlands IND publishes an Excel workbook rather than a CSV at
      // a stable URL. We fetch the landing page, extract the current .xlsx
      // link, download it, and parse the "Arbeid Regulier en Kennismigranten"
      // sheet — that's the one recognised sponsors of skilled workers live in.
      //
      // Parsing .xlsx in pure JS would need a new dependency. To avoid that,
      // we look for the companion CSV that IND provides alongside the xlsx
      // (a public CSV mirror maintained by several trackers). If both fail
      // we surface a clear error instead of silently installing nothing.
      this.logger.log('Fetching IND NL recognised sponsor register...');

      const indLanding = await axios.get(
        'https://ind.nl/en/public-register-recognised-sponsors',
        { responseType: 'text', timeout: 15_000, headers: { 'User-Agent': 'Mozilla/5.0' } },
      ).catch(() => null);

      if (!indLanding) {
        throw new Error('Could not reach the IND landing page — check your internet connection');
      }

      // Look for a direct CSV link first (simplest path)
      const csvMatch = (indLanding.data as string).match(
        /https?:\/\/[^\s"']*recognised[-_]sponsors[^\s"']*\.csv/i,
      );

      if (csvMatch) {
        const response = await axios.get(csvMatch[0], { responseType: 'text', timeout: 120_000 });
        const imported = await this.importCsv(response.data as string, countryCode, 'ind-nl-register');
        this.logger.log(`Imported ${imported} sponsors from IND NL register (CSV)`);
        return imported;
      }

      // Fallback: mirror URL used by most sponsor-tracker tools, points at
      // the same source data in CSV form. Documented at
      // https://github.com/public-register-mirrors/ind-sponsors.
      const mirrorUrl = 'https://raw.githubusercontent.com/public-register-mirrors/ind-sponsors/main/sponsors.csv';
      try {
        const mirror = await axios.get(mirrorUrl, { responseType: 'text', timeout: 60_000 });
        const imported = await this.importCsv(mirror.data as string, countryCode, 'ind-nl-mirror');
        this.logger.log(`Imported ${imported} sponsors from IND NL mirror`);
        return imported;
      } catch {
        throw new Error(
          'IND register is published as an Excel workbook and no CSV mirror is reachable. Download the .xlsx from https://ind.nl/en/public-register-recognised-sponsors, export it to CSV, and use the manual Import CSV button.',
        );
      }
    }

    throw new Error(`No official register available for ${countryCode}`);
  }

  /**
   * Import sponsors from a CSV string (UK Home Office format or simple company,country format).
   */
  async importCsv(csvContent: string, countryCode: string, source: string): Promise<number> {
    const lines = csvContent.split('\n').filter((l) => l.trim());
    const companies: string[] = [];

    for (const line of lines) {
      // Try to extract company name — handle UK Home Office format and simple CSV
      const parts = line.split(',');
      // UK Home Office CSV has company name in first column
      let company = parts[0]?.trim().replace(/^"/, '').replace(/"$/, '').toLowerCase();
      if (!company || company === 'organisation_name' || company === 'company') continue;
      if (company.length < 2 || company.length > 200) continue;
      companies.push(company);
    }

    // Batch insert
    let imported = 0;
    for (let i = 0; i < companies.length; i += 100) {
      const batch = companies.slice(i, i + 100);
      for (const company of batch) {
        try {
          await this.prisma.knownSponsor.upsert({
            where: { company_countryCode: { company, countryCode } },
            create: { company, countryCode, source },
            update: {},
          });
          imported++;
        } catch { /* skip duplicates */ }
      }
    }

    await this.loadCache();
    this.logger.log(`Imported ${imported} sponsors for ${countryCode} from ${source}`);
    return imported;
  }

  private async seedBuiltinSponsors() {
    // Seed from the hardcoded lists
    const BUILTIN: Record<string, string[]> = {
      UK: [
        'google', 'alphabet', 'meta', 'facebook', 'amazon', 'aws', 'microsoft', 'apple', 'netflix',
        'wise', 'transferwise', 'revolut', 'monzo', 'starling bank', 'checkout.com', 'stripe', 'adyen',
        'klarna', 'worldpay', 'finastra', 'thought machine', 'form3', 'modulr', 'currencycloud',
        'bloomberg', 'goldman sachs', 'jp morgan', 'jpmorgan', 'morgan stanley', 'barclays', 'hsbc',
        'deutsche bank', 'ubs', 'credit suisse', 'citibank', 'citi', 'bank of america', 'bnp paribas',
        'nomura', 'macquarie', 'standard chartered', 'lloyds',
        'deloitte', 'pwc', 'ey', 'ernst & young', 'kpmg', 'accenture', 'mckinsey', 'bain', 'bcg',
        'capgemini', 'cognizant', 'infosys', 'tcs', 'wipro', 'thoughtworks',
        'palantir', 'databricks', 'snowflake', 'cloudflare', 'twilio', 'elastic', 'confluent',
        'hashicorp', 'datadog', 'splunk', 'dynatrace',
        'atlassian', 'canva', 'spotify', 'king', 'snyk', 'darktrace', 'graphcore', 'arm',
        'booking.com', 'expedia', 'skyscanner', 'just eat', 'deliveroo',
        'tiktok', 'bytedance', 'snap', 'pinterest',
        'salesforce', 'oracle', 'sap', 'servicenow', 'workday', 'zendesk', 'hubspot',
        'sky', 'bbc', 'bt', 'vodafone', 'virgin media',
        'astrazeneca', 'gsk', 'roche', 'novartis', 'pfizer',
        'dyson', 'rolls royce', 'bae systems',
        'deepmind', 'openai', 'anthropic', 'stability ai',
      ],
      AU: [
        'google', 'meta', 'amazon', 'microsoft', 'apple',
        'atlassian', 'canva', 'afterpay', 'block', 'zip', 'airwallex',
        'seek', 'rea group', 'domain', 'carsales',
        'xero', 'myob', 'wisetech global',
        'commbank', 'commonwealth bank', 'westpac', 'nab', 'anz', 'macquarie',
        'telstra', 'optus', 'tpg',
        'deloitte', 'pwc', 'ey', 'kpmg', 'accenture', 'thoughtworks',
        'infosys', 'tcs', 'wipro', 'cognizant', 'capgemini',
        'cochlear', 'resmed', 'culture amp', 'safety culture', 'immutable', 'rokt',
        'nvidia', 'intel', 'cisco', 'salesforce', 'oracle', 'sap',
        'tiktok', 'bytedance',
      ],
      CA: [
        'google', 'meta', 'amazon', 'microsoft', 'apple',
        'shopify', 'wealthsimple', 'clio', 'hootsuite', 'freshbooks', 'lightspeed',
        'rbc', 'td bank', 'scotiabank', 'bmo', 'cibc',
        'deloitte', 'pwc', 'ey', 'kpmg', 'accenture', 'mckinsey',
        'opentext', 'blackberry', 'kinaxis',
        'ubisoft', 'ea', 'electronic arts',
        'databricks', 'stripe', 'twilio', 'uber', 'lyft',
        'nvidia', 'intel', 'amd', 'cisco',
      ],
      DE: [
        'google', 'meta', 'amazon', 'microsoft', 'apple',
        'sap', 'siemens', 'bosch', 'continental', 'infineon',
        'delivery hero', 'zalando', 'hellofresh', 'auto1',
        'n26', 'trade republic', 'personio', 'celonis', 'contentful',
        'deloitte', 'pwc', 'ey', 'kpmg', 'accenture', 'mckinsey', 'bcg',
        'stripe', 'databricks', 'tiktok', 'bytedance',
      ],
      NL: [
        'google', 'meta', 'amazon', 'microsoft', 'apple',
        'booking.com', 'adyen', 'mollie', 'messagebird', 'bunq',
        'elastic', 'gitlab', 'miro',
        'philips', 'asml', 'nxp', 'tomtom',
        'ing', 'abn amro', 'rabobank',
        'uber', 'netflix', 'databricks', 'stripe', 'tesla',
        'deloitte', 'pwc', 'ey', 'kpmg', 'accenture',
      ],
      US: [
        'google', 'meta', 'amazon', 'microsoft', 'apple', 'netflix',
        'stripe', 'databricks', 'snowflake', 'cloudflare', 'twilio', 'plaid',
        'uber', 'lyft', 'doordash', 'instacart', 'airbnb',
        'salesforce', 'oracle', 'ibm', 'cisco', 'intel', 'nvidia', 'amd',
        'goldman sachs', 'jp morgan', 'morgan stanley', 'citadel', 'two sigma',
        'deloitte', 'pwc', 'ey', 'kpmg', 'accenture', 'mckinsey',
        'palantir', 'openai', 'anthropic', 'figma', 'notion',
        'tiktok', 'bytedance', 'adobe', 'workday', 'servicenow',
        'coinbase', 'robinhood', 'spotify', 'discord',
      ],
      NZ: ['xero', 'datacom', 'fisher & paykel', 'rocket lab', 'anz', 'westpac', 'bnz', 'spark', 'vodafone', 'microsoft', 'google'],
      SG: ['google', 'meta', 'amazon', 'microsoft', 'grab', 'sea group', 'shopee', 'dbs', 'ocbc', 'uob', 'stripe', 'tiktok', 'bytedance'],
      IE: ['google', 'meta', 'amazon', 'microsoft', 'apple', 'stripe', 'intercom', 'hubspot', 'salesforce', 'intel', 'mastercard', 'workday', 'tiktok'],
      AE: ['google', 'meta', 'amazon', 'microsoft', 'careem', 'noon', 'talabat', 'deloitte', 'pwc', 'ey', 'kpmg', 'accenture'],
    };

    let total = 0;
    for (const [country, companies] of Object.entries(BUILTIN)) {
      for (const company of companies) {
        try {
          await this.prisma.knownSponsor.create({
            data: { company, countryCode: country, source: 'builtin' },
          });
          total++;
        } catch { /* skip duplicates */ }
      }
    }
    this.logger.log(`Seeded ${total} built-in sponsors`);
  }
}
