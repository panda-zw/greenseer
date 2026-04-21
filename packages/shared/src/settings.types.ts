export interface CountryConfig {
  code: string;
  mode: 'relocate' | 'remote';
  enabled: boolean;
}

/**
 * Reliability tier for a job source.
 *
 * - `high`    — Public API, stable. Expected to just work.
 * - `medium`  — HTML scraping of a cooperative site. Works but may break if
 *               the site changes its markup; expect occasional fixes.
 * - `low`     — Site with known anti-bot measures. May fail frequently;
 *               enabled at the user's own risk.
 * - `manual`  — Not automatable. The UI surfaces this as a reference/link
 *               only, not as a toggleable scraper.
 */
export type SourceTier = 'high' | 'medium' | 'low' | 'manual';

export interface SourceConfig {
  enabled: boolean;
}

export interface AppSettings {
  search: {
    keywords: string[];
    countries: CountryConfig[];
    minMatchScore: number;
    blocklist: string[];
    maxPagesPerSource: number;
  };
  schedule: {
    intervalHours: number;
    quietHoursStart: string | null;
    quietHoursEnd: string | null;
  };
  /**
   * Map of source id → { enabled }. See SOURCE_CATALOG below for the
   * authoritative list of ids, names, tiers, and country coverage.
   */
  sources: Record<string, SourceConfig>;
  notifications: {
    newJobs: boolean;
    scrapeErrors: boolean;
    documentReady: boolean;
    staleReminder: boolean;
    staleReminderDays: number;
  };
}

/**
 * Authoritative catalog of every job source the app knows about.
 *
 * This is the single source of truth for:
 *  - the sidecar orchestrator (which services to instantiate + call)
 *  - the Settings UI (rendering toggles, tier badges, tooltips)
 *  - the Resources page (showing manual-tier sources as external links)
 *
 * Adding a new source = add an entry here + create a service on the sidecar
 * + register it in `scraper.module.ts` + handle it in `scrape-orchestrator.service.ts`.
 */
export interface SourceCatalogEntry {
  id: string;
  name: string;
  tier: SourceTier;
  /** Short description shown under the name in the Settings UI. */
  description: string;
  /** Two-letter country codes this source covers. */
  countries: string[];
  /** Extra warning shown as a tooltip for low/manual tier sources. */
  warning?: string;
  /** Only set for `manual` tier — external link to show in Resources. */
  url?: string;
}

export const SOURCE_CATALOG: SourceCatalogEntry[] = [
  // ── High tier (public APIs) ─────────────────────────────────────────────
  {
    id: 'adzuna',
    name: 'Adzuna',
    tier: 'high',
    description: 'Public jobs API covering US, UK, DE, NL, CA, AU, NZ, SG.',
    countries: ['US', 'UK', 'DE', 'NL', 'CA', 'AU', 'NZ', 'SG'],
  },
  {
    id: 'arbeitnow',
    name: 'Arbeitnow',
    tier: 'high',
    description: 'Europe-focused jobs API with a visa-sponsorship filter. Strong for DE and NL.',
    countries: ['DE', 'NL', 'UK', 'IE'],
  },

  // ── Medium tier (HTML scraping, may break) ──────────────────────────────
  {
    id: 'linkedin',
    name: 'LinkedIn',
    tier: 'medium',
    description: 'Guest-view scraping via Playwright. Requires Chrome.',
    countries: ['AU', 'UK', 'CA', 'US', 'DE', 'NL', 'SG', 'AE', 'NZ', 'IE'],
    warning: 'Requires Google Chrome or Chromium installed locally.',
  },
  {
    id: 'seek',
    name: 'Seek',
    tier: 'medium',
    description: 'AU + NZ job board. Hybrid JSON API / HTML fallback.',
    countries: ['AU', 'NZ'],
  },
  {
    id: 'relocateMe',
    name: 'Relocate.me',
    tier: 'medium',
    description: 'Every listing explicitly offers visa sponsorship + relocation. Best starting point.',
    countries: ['DE', 'NL', 'IE', 'UK', 'US', 'CA'],
  },
  {
    id: 'nextLevelJobs',
    name: 'Next Level Jobs EU',
    tier: 'medium',
    description: 'EU-focused listings from companies that hire internationally.',
    countries: ['DE', 'NL', 'IE', 'UK'],
  },
  {
    id: 'irishJobs',
    name: 'IrishJobs.ie',
    tier: 'low',
    description: "Ireland's dominant local job board. Silicon Docks companies post here first.",
    countries: ['IE'],
    warning: 'Confirmed blocking non-browser requests with 403. Needs a stealth browser to work reliably.',
  },
  {
    id: 'jobsIe',
    name: 'Jobs.ie',
    tier: 'medium',
    description: "Irish SME and scale-up listings that don't always appear on LinkedIn.",
    countries: ['IE'],
  },
  {
    id: 'jaabz',
    name: 'Jaabz',
    tier: 'medium',
    description: 'Tech jobs with visa sponsorship + relocation packages. Strong DE/NL coverage.',
    countries: ['DE', 'NL', 'IE', 'UK'],
  },
  {
    id: 'makeItInGermany',
    name: 'Make it in Germany',
    tier: 'medium',
    description: "German government's official international recruitment portal.",
    countries: ['DE'],
  },

  // ── Low tier (experimental, anti-bot heavy) ─────────────────────────────
  {
    id: 'stepstone',
    name: 'StepStone.de',
    tier: 'low',
    description: "Germany's equivalent of Indeed. Most German companies post here.",
    countries: ['DE'],
    warning: 'StepStone has strong anti-bot measures. Expect frequent breakages.',
  },
  {
    id: 'glassdoor',
    name: 'Glassdoor',
    tier: 'low',
    description: 'Useful for salary benchmarking alongside job listings.',
    countries: ['DE', 'NL', 'UK', 'US'],
    warning: 'Glassdoor aggressively blocks scrapers. Enable at your own risk.',
  },
  {
    id: 'xing',
    name: 'Xing',
    tier: 'low',
    description: "Germany's professional network. Useful for German-speaking firms not on LinkedIn.",
    countries: ['DE'],
    warning: 'Xing requires a logged-in session for most listings. Expect failures.',
  },

  // ── Manual tier (external references, not scrapable) ────────────────────
  {
    id: 'indRegister',
    name: 'IND Recognised Sponsors (NL)',
    tier: 'manual',
    description: "Dutch government's list of companies that can legally sponsor Kennismigrant visas.",
    countries: ['NL'],
    warning: 'This is a sponsor list, not a job feed. Use the Sponsors tab to import it.',
    url: 'https://ind.nl/en/public-register-recognised-sponsors',
  },
  {
    id: 'awesomeDailyVisa',
    name: 'Awesome Daily Visa Jobs (GitHub)',
    tier: 'manual',
    description: 'Daily-updated open-source list of roles offering visa sponsorship.',
    countries: ['NL', 'DE', 'IE', 'UK'],
    url: 'https://github.com/Lamiiine/Awesome-daily-list-of-visa-sponsored-jobs',
  },
  {
    id: 'techJobsRelocation',
    name: 'Tech Jobs with Relocation (GitHub)',
    tier: 'manual',
    description: '5,000+ relocation-friendly tech jobs, curated weekly.',
    countries: ['DE', 'NL', 'IE', 'UK', 'US', 'CA'],
    url: 'https://github.com/AndrewStetsenko/tech-jobs-with-relocation',
  },
  {
    id: 'hackerNewsHiring',
    name: 'Hacker News — Who\'s Hiring?',
    tier: 'manual',
    description: 'Monthly thread. Startups and scale-ups post relocation roles here frequently.',
    countries: ['DE', 'NL', 'IE', 'UK', 'US'],
    url: 'https://news.ycombinator.com/submitted?id=whoishiring',
  },
  {
    id: 'recruitroo',
    name: 'Recruitroo',
    tier: 'manual',
    description: 'Immigration-focused Irish recruiter placing international candidates with CSEP sponsors.',
    countries: ['IE'],
    url: 'https://recruitroo.com',
  },
  {
    id: 'togetherAbroad',
    name: 'Together Abroad',
    tier: 'manual',
    description: 'Specifically built for international job seekers in the Netherlands.',
    countries: ['NL'],
    url: 'https://togetherabroad.nl',
  },
  {
    id: 'arrowLancer',
    name: 'ArrowLancer',
    tier: 'manual',
    description: 'Connects candidates directly with IND recognised sponsors hiring in the Netherlands.',
    countries: ['NL'],
    url: 'https://arrowlancer.com',
  },
];

export const SUPPORTED_COUNTRIES: { code: string; name: string }[] = [
  { code: 'GLOBAL', name: 'Global / Unspecified' },
  { code: 'EMEA', name: 'EMEA Region' },
  { code: 'AFRICA', name: 'Africa Region' },
  { code: 'AU', name: 'Australia' },
  { code: 'UK', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'US', name: 'United States' },
  { code: 'DE', name: 'Germany' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'SG', name: 'Singapore' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'IE', name: 'Ireland' },
  // African tech markets — ordered by tech job density
  { code: 'ZA', name: 'South Africa' },
  { code: 'KE', name: 'Kenya' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'EG', name: 'Egypt' },
  { code: 'MA', name: 'Morocco' },
  { code: 'MU', name: 'Mauritius' },
  { code: 'RW', name: 'Rwanda' },
  { code: 'GH', name: 'Ghana' },
  { code: 'ZW', name: 'Zimbabwe' },
];

export const DEFAULT_SETTINGS: AppSettings = {
  search: {
    keywords: ['software engineer', 'developer'],
    maxPagesPerSource: 2,
    countries: [
      { code: 'AU', mode: 'relocate', enabled: false },
      { code: 'UK', mode: 'relocate', enabled: false },
      { code: 'CA', mode: 'relocate', enabled: false },
      { code: 'US', mode: 'remote', enabled: false },
      { code: 'DE', mode: 'relocate', enabled: false },
      { code: 'NL', mode: 'relocate', enabled: false },
      { code: 'SG', mode: 'relocate', enabled: false },
      { code: 'AE', mode: 'relocate', enabled: false },
      { code: 'NZ', mode: 'relocate', enabled: false },
      { code: 'IE', mode: 'relocate', enabled: false },
      { code: 'ZA', mode: 'relocate', enabled: false },
      { code: 'KE', mode: 'relocate', enabled: false },
      { code: 'NG', mode: 'relocate', enabled: false },
      { code: 'EG', mode: 'relocate', enabled: false },
      { code: 'MA', mode: 'relocate', enabled: false },
      { code: 'MU', mode: 'relocate', enabled: false },
      { code: 'RW', mode: 'relocate', enabled: false },
      { code: 'GH', mode: 'relocate', enabled: false },
      { code: 'ZW', mode: 'relocate', enabled: false },
    ],
    minMatchScore: 50,
    blocklist: [],
  },
  schedule: {
    intervalHours: 6,
    quietHoursStart: null,
    quietHoursEnd: null,
  },
  // Only high-tier sources enabled by default. Medium-tier sources are off
  // so the user opts in knowing they may break; low-tier sources start off
  // and carry warnings in the UI.
  sources: {
    adzuna: { enabled: true },
    arbeitnow: { enabled: true },
    linkedin: { enabled: false },
    seek: { enabled: false },
    relocateMe: { enabled: false },
    nextLevelJobs: { enabled: false },
    irishJobs: { enabled: false },
    jobsIe: { enabled: false },
    jaabz: { enabled: false },
    makeItInGermany: { enabled: false },
    stepstone: { enabled: false },
    glassdoor: { enabled: false },
    xing: { enabled: false },
  },
  notifications: {
    newJobs: true,
    scrapeErrors: true,
    documentReady: true,
    staleReminder: true,
    staleReminderDays: 21,
  },
};
