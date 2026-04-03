import type { JobSource } from '@greenseer/shared';

export interface RawJob {
  source: JobSource;
  externalId?: string;
  title: string;
  company: string;
  location: string;
  salary?: string;
  description: string;
  url: string;
  postedAt?: string; // original posting date from source
  raw?: string; // original JSON payload
}
