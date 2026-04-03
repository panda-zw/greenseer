import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { EncryptionService } from './encryption.service';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(public readonly encryption: EncryptionService) {
    super({
      datasources: {
        db: {
          url: process.env.DATABASE_URL || 'file:./dev.db',
        },
      },
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connected');

    // Create tables if they don't exist (replaces npx prisma db push)
    await this.ensureSchema();
  }

  private async ensureSchema() {
    try {
      // Check if we need to initialize
      const tables = await this.$queryRawUnsafe<{ name: string }[]>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='jobs'`,
      );

      if (tables.length === 0) {
        this.logger.log('Initializing database schema...');
        await this.runMigrations();
        this.logger.log('Schema initialized');
      } else {
        // Run additive migrations for columns/tables added after init
        await this.runAdditiveMigrations();
      }
    } catch (e: any) {
      this.logger.error(`Schema sync failed: ${e.message?.slice(0, 300)}`);
    }
  }

  private async runMigrations() {
    const statements = INIT_SQL.split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const sql of statements) {
      await this.$executeRawUnsafe(sql);
    }
  }

  private async runAdditiveMigrations() {
    // Add columns that may not exist yet (ALTER TABLE is safe to re-run with IF NOT EXISTS pattern)
    const addColumn = async (table: string, column: string, type: string, defaultVal?: string) => {
      try {
        const cols = await this.$queryRawUnsafe<{ name: string }[]>(
          `PRAGMA table_info(${table})`,
        );
        if (!cols.some((c) => c.name === column)) {
          const def = defaultVal !== undefined ? ` DEFAULT ${defaultVal}` : '';
          await this.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${type}${def}`);
          this.logger.log(`Added column ${table}.${column}`);
        }
      } catch { /* column may already exist */ }
    };

    // postedAt added to jobs
    await addColumn('jobs', 'postedAt', 'DATETIME');
    // sponsorTier added to job_analysis
    await addColumn('job_analysis', 'sponsorTier', 'TEXT', "'unknown'");

    // Create tables that may not exist
    const createIfNotExists = async (sql: string) => {
      try {
        await this.$executeRawUnsafe(sql);
      } catch { /* already exists */ }
    };

    await createIfNotExists(`
      CREATE TABLE IF NOT EXISTS "sponsor_feedback" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "company" TEXT NOT NULL,
        "countryCode" TEXT NOT NULL,
        "feedback" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await createIfNotExists(`
      CREATE TABLE IF NOT EXISTS "known_sponsors" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "company" TEXT NOT NULL,
        "companyNormalized" TEXT NOT NULL,
        "countryCode" TEXT NOT NULL,
        "source" TEXT NOT NULL DEFAULT 'manual',
        "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await createIfNotExists(
      `CREATE UNIQUE INDEX IF NOT EXISTS "known_sponsors_companyNormalized_countryCode_key" ON "known_sponsors"("companyNormalized", "countryCode")`,
    );
    await createIfNotExists(
      `CREATE INDEX IF NOT EXISTS "known_sponsors_countryCode_idx" ON "known_sponsors"("countryCode")`,
    );
    await createIfNotExists(
      `CREATE INDEX IF NOT EXISTS "sponsor_feedback_company_idx" ON "sponsor_feedback"("company")`,
    );
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

// Full initial migration SQL
const INIT_SQL = `
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "externalId" TEXT,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "salary" TEXT,
    "description" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "raw" TEXT,
    "postedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "job_analysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "visaSponsorship" BOOLEAN NOT NULL,
    "visaExplanation" TEXT NOT NULL,
    "locationScopePass" BOOLEAN NOT NULL,
    "scopeExplanation" TEXT NOT NULL,
    "overallEligible" BOOLEAN NOT NULL,
    "confidence" REAL NOT NULL,
    "countryCode" TEXT NOT NULL,
    "sponsorTier" TEXT NOT NULL DEFAULT 'unknown',
    "analyzedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "job_analysis_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "job_matches" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "cvProfileId" TEXT NOT NULL,
    "matchScore" INTEGER NOT NULL,
    "matchedSkills" TEXT NOT NULL DEFAULT '[]',
    "missingSkills" TEXT NOT NULL DEFAULT '[]',
    "summary" TEXT NOT NULL,
    "recommendApply" BOOLEAN NOT NULL,
    "analyzedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "job_matches_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "job_matches_cvProfileId_fkey" FOREIGN KEY ("cvProfileId") REFERENCES "cv_profiles" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "cv_profiles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "skills" TEXT NOT NULL DEFAULT '[]',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "versions" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "generated_documents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "cvProfileId" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "cvText" TEXT NOT NULL,
    "coverLetter" TEXT NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "generated_documents_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "generated_documents_cvProfileId_fkey" FOREIGN KEY ("cvProfileId") REFERENCES "cv_profiles" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "applications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'saved',
    "history" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT NOT NULL DEFAULT '',
    "salaryOffer" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "applications_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "scrape_log" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "jobsFound" INTEGER NOT NULL DEFAULT 0,
    "jobsAfterDedup" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT
);

CREATE TABLE "settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "value" TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE "sponsor_feedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "company" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "feedback" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "known_sponsors" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "company" TEXT NOT NULL,
    "companyNormalized" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "jobs_fingerprint_key" ON "jobs"("fingerprint");
CREATE INDEX "jobs_source_createdAt_idx" ON "jobs"("source", "createdAt");
CREATE INDEX "jobs_createdAt_idx" ON "jobs"("createdAt");
CREATE UNIQUE INDEX "job_analysis_jobId_key" ON "job_analysis"("jobId");
CREATE INDEX "job_analysis_overallEligible_idx" ON "job_analysis"("overallEligible");
CREATE INDEX "job_matches_matchScore_idx" ON "job_matches"("matchScore");
CREATE UNIQUE INDEX "job_matches_jobId_cvProfileId_key" ON "job_matches"("jobId", "cvProfileId");
CREATE INDEX "generated_documents_jobId_idx" ON "generated_documents"("jobId");
CREATE INDEX "generated_documents_cvProfileId_idx" ON "generated_documents"("cvProfileId");
CREATE UNIQUE INDEX "applications_jobId_key" ON "applications"("jobId");
CREATE INDEX "applications_status_idx" ON "applications"("status");
CREATE INDEX "scrape_log_source_startedAt_idx" ON "scrape_log"("source", "startedAt");
CREATE UNIQUE INDEX "known_sponsors_companyNormalized_countryCode_key" ON "known_sponsors"("companyNormalized", "countryCode");
CREATE INDEX "known_sponsors_countryCode_idx" ON "known_sponsors"("countryCode");
CREATE INDEX "sponsor_feedback_company_idx" ON "sponsor_feedback"("company")
`;
