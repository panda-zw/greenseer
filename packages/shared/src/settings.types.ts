export interface CountryConfig {
  code: string;
  mode: 'relocate' | 'remote';
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
  sources: {
    adzuna: { enabled: boolean };
    linkedin: { enabled: boolean };
    seek: { enabled: boolean };
  };
  notifications: {
    newJobs: boolean;
    scrapeErrors: boolean;
    documentReady: boolean;
    staleReminder: boolean;
    staleReminderDays: number;
  };
}

export const SUPPORTED_COUNTRIES: { code: string; name: string }[] = [
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
    ],
    minMatchScore: 50,
    blocklist: [],
  },
  schedule: {
    intervalHours: 6,
    quietHoursStart: null,
    quietHoursEnd: null,
  },
  sources: {
    adzuna: { enabled: true },
    linkedin: { enabled: false },
    seek: { enabled: false },
  },
  notifications: {
    newJobs: true,
    scrapeErrors: true,
    documentReady: true,
    staleReminder: true,
    staleReminderDays: 21,
  },
};
