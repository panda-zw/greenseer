import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL || 'file:./dev.db' } },
});

async function main() {
  console.log('Seeding database...');

  // 1. Create CV Profile
  const cvProfile = await prisma.cvProfile.create({
    data: {
      name: 'Full Stack Developer',
      body: `PROFESSIONAL SUMMARY
Full-stack software engineer with 5+ years of experience building scalable web applications. Expert in TypeScript, React, Node.js, and cloud infrastructure. Passionate about clean architecture and developer experience.

WORK EXPERIENCE

Senior Software Engineer — TechCorp Inc, Harare
Jan 2022 – Present
- Led migration of monolithic application to microservices architecture serving 500K+ users
- Built real-time notification system using WebSockets reducing user response time by 40%
- Designed and implemented CI/CD pipeline reducing deployment time from 2 hours to 15 minutes
- Mentored team of 4 junior developers

Software Engineer — StartupXYZ, Remote
Mar 2019 – Dec 2021
- Developed customer-facing dashboard using React and TypeScript
- Built REST APIs with Node.js/Express handling 10K requests/minute
- Implemented PostgreSQL database schema supporting multi-tenant architecture
- Set up Docker containerization and AWS ECS deployment

EDUCATION
BSc Computer Science — University of Zimbabwe, 2018

TECHNICAL SKILLS
TypeScript, JavaScript, Python, React, Next.js, Node.js, NestJS, Express, PostgreSQL, MongoDB, Redis, Docker, Kubernetes, AWS (EC2, S3, RDS, Lambda), Git, CI/CD, GraphQL, REST APIs, Tailwind CSS

CERTIFICATIONS
AWS Solutions Architect Associate — 2023`,
      skills: JSON.stringify([
        'TypeScript', 'JavaScript', 'Python', 'React', 'Next.js', 'Node.js',
        'NestJS', 'Express', 'PostgreSQL', 'MongoDB', 'Redis', 'Docker',
        'Kubernetes', 'AWS', 'Git', 'CI/CD', 'GraphQL', 'REST APIs', 'Tailwind CSS',
      ]),
      isDefault: true,
      versions: JSON.stringify([{
        body: 'Initial version',
        skills: ['TypeScript', 'React', 'Node.js'],
        savedAt: new Date(Date.now() - 7 * 86400000).toISOString(),
      }]),
    },
  });
  console.log(`Created CV profile: ${cvProfile.id}`);

  // 2. Create Jobs with Analysis and Matches
  const jobs = [
    {
      source: 'adzuna', title: 'Senior Full Stack Developer', company: 'Atlassian',
      location: 'Sydney, Australia', salary: '$140,000 - $180,000 AUD',
      description: `We are looking for a Senior Full Stack Developer to join our Cloud Platform team in Sydney. You will work on building next-generation collaboration tools used by millions worldwide.\n\nRequirements:\n- 5+ years experience with TypeScript and React\n- Strong Node.js/backend experience\n- Experience with cloud infrastructure (AWS preferred)\n- PostgreSQL or similar relational database experience\n- Experience with microservices architecture\n\nWe are an approved 482 TSS visa sponsor and welcome international candidates. Relocation assistance provided.\n\nNice to have:\n- Kubernetes/Docker experience\n- GraphQL experience\n- Experience with CI/CD pipelines`,
      url: 'https://example.com/atlassian-senior-fullstack',
      visa: true, visaNote: 'Employer explicitly states they are an approved 482 TSS visa sponsor and welcome international candidates.',
      scope: true, scopeNote: 'Role is based in Sydney, Australia — compatible with relocate mode.',
      eligible: true, confidence: 0.95, country: 'AU',
      matchScore: 87, matchedSkills: ['TypeScript', 'React', 'Node.js', 'AWS', 'PostgreSQL', 'Docker', 'Kubernetes', 'CI/CD', 'GraphQL'],
      missingSkills: [], summary: 'Excellent match. Candidate has all required skills including TypeScript, React, Node.js, and AWS. 5+ years experience requirement met. Cloud and microservices experience is strong.',
      recommend: true,
    },
    {
      source: 'linkedin', title: 'Backend Engineer', company: 'Canva',
      location: 'Melbourne, Australia', salary: '$130,000 - $160,000 AUD',
      description: `Canva is hiring a Backend Engineer for our Melbourne office. You'll build the APIs that power our design platform used by 100M+ users.\n\nWhat you'll do:\n- Design and build scalable backend services\n- Work with Java and Kotlin microservices\n- Optimize database performance\n- Contribute to API design and architecture\n\nRequirements:\n- 3+ years backend development experience\n- Strong Java or Kotlin experience\n- Experience with distributed systems\n- SQL database expertise\n\nCanva is a certified 482 sponsor. We provide visa sponsorship and relocation support for successful candidates.`,
      url: 'https://example.com/canva-backend',
      visa: true, visaNote: 'Canva explicitly states they are a certified 482 sponsor with visa sponsorship and relocation support.',
      scope: true, scopeNote: 'Melbourne, Australia — compatible with relocate mode.',
      eligible: true, confidence: 0.92, country: 'AU',
      matchScore: 52, matchedSkills: ['PostgreSQL', 'REST APIs', 'Docker', 'Kubernetes'],
      missingSkills: ['Java', 'Kotlin', 'Distributed Systems'], summary: 'Partial match. Candidate has strong backend fundamentals but lacks Java/Kotlin which are primary requirements. Database and infrastructure skills transfer well.',
      recommend: false,
    },
    {
      source: 'adzuna', title: 'React Developer', company: 'Wise',
      location: 'London, United Kingdom', salary: '£70,000 - £95,000',
      description: `Wise is looking for a React Developer to join our Payments team in London. You'll build the interfaces that help millions of people move money globally.\n\nWhat we need:\n- 3+ years with React and TypeScript\n- Experience building complex SPAs\n- Familiarity with state management (Redux, Zustand, or similar)\n- Testing experience (Jest, React Testing Library)\n- CSS-in-JS or Tailwind experience\n\nWe hold a Skilled Worker sponsor licence and actively sponsor visas for international hires. We believe in hiring the best talent regardless of location.\n\nBenefits include relocation package, stock options, and flexible working.`,
      url: 'https://example.com/wise-react',
      visa: true, visaNote: 'Wise holds a Skilled Worker sponsor licence and actively sponsors visas for international hires.',
      scope: true, scopeNote: 'London, UK — compatible with relocate mode.',
      eligible: true, confidence: 0.97, country: 'UK',
      matchScore: 78, matchedSkills: ['React', 'TypeScript', 'Tailwind CSS', 'REST APIs'],
      missingSkills: ['Redux/Zustand', 'Jest', 'React Testing Library'], summary: 'Good match. Strong React and TypeScript skills align well. Missing specific testing framework experience and state management library preference, but these are learnable.',
      recommend: true,
    },
    {
      source: 'adzuna', title: 'Cloud Infrastructure Engineer', company: 'Shopify',
      location: 'Toronto, Canada', salary: '$150,000 - $200,000 CAD',
      description: `Shopify is hiring a Cloud Infrastructure Engineer to work on the platform that powers 2M+ merchants.\n\nRequirements:\n- 4+ years in cloud infrastructure/DevOps\n- Expert-level AWS or GCP experience\n- Kubernetes orchestration at scale\n- Infrastructure as Code (Terraform, Pulumi)\n- Strong Linux systems knowledge\n- Go or Python scripting\n\nWe support LMIA-based work permits and Global Talent Stream applications for exceptional candidates outside Canada.\n\nMust be comfortable working in EST timezone.`,
      url: 'https://example.com/shopify-cloud',
      visa: true, visaNote: 'Shopify supports LMIA-based work permits and Global Talent Stream applications.',
      scope: true, scopeNote: 'Toronto, Canada — compatible with relocate mode.',
      eligible: true, confidence: 0.88, country: 'CA',
      matchScore: 61, matchedSkills: ['AWS', 'Kubernetes', 'Docker', 'Python', 'CI/CD'],
      missingSkills: ['Terraform/Pulumi', 'Go', 'Linux Systems', 'GCP'], summary: 'Moderate match. Candidate has AWS and Kubernetes experience but lacks Infrastructure as Code tools and Go language. Python and CI/CD skills are relevant.',
      recommend: true,
    },
    {
      source: 'linkedin', title: 'Full Stack Engineer', company: 'Delivery Hero',
      location: 'Berlin, Germany', salary: '€70,000 - €90,000',
      description: `Join Delivery Hero as a Full Stack Engineer in Berlin! Work on our logistics platform that delivers food to millions.\n\nTech stack: React, TypeScript, Node.js, PostgreSQL, Kubernetes\n\nRequirements:\n- 3+ years full stack experience\n- React + TypeScript\n- Node.js backend development\n- SQL databases\n- Docker/Kubernetes experience preferred\n\nWe sponsor EU Blue Card visas for qualified candidates from outside the EU. Relocation package included.\n\nGerman language is NOT required — our team works in English.`,
      url: 'https://example.com/deliveryhero-fullstack',
      visa: true, visaNote: 'Delivery Hero sponsors EU Blue Card visas for qualified non-EU candidates. German language not required.',
      scope: true, scopeNote: 'Berlin, Germany — compatible with relocate mode.',
      eligible: true, confidence: 0.94, country: 'DE',
      matchScore: 91, matchedSkills: ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'Docker', 'Kubernetes'],
      missingSkills: [], summary: 'Excellent match. Candidate perfectly fits the required tech stack — React, TypeScript, Node.js, PostgreSQL with Docker/Kubernetes experience. 5+ years exceeds the 3-year requirement.',
      recommend: true,
    },
    {
      source: 'seek', title: 'Software Developer', company: 'Xero',
      location: 'Wellington, New Zealand', salary: '$110,000 - $140,000 NZD',
      description: `Xero is looking for a Software Developer to join our platform team in Wellington.\n\nAbout the role:\n- Build and maintain APIs for our accounting platform\n- Work with C# .NET microservices\n- Collaborate with product and design teams\n\nRequirements:\n- 3+ years software development\n- C# / .NET Core experience required\n- Experience with Azure or AWS\n- SQL Server or PostgreSQL\n\nXero is an accredited AEWV employer. We welcome applications from international candidates.\n\nNote: Must have the right to work in New Zealand or be eligible for AEWV sponsorship.`,
      url: 'https://example.com/xero-developer',
      visa: true, visaNote: 'Xero is an accredited AEWV employer and welcomes international candidates.',
      scope: true, scopeNote: 'Wellington, NZ — compatible with relocate mode.',
      eligible: true, confidence: 0.85, country: 'NZ',
      matchScore: 38, matchedSkills: ['PostgreSQL', 'AWS', 'REST APIs'],
      missingSkills: ['C#', '.NET Core', 'Azure', 'SQL Server'], summary: 'Weak match. Core requirement is C# / .NET which candidate lacks. Database and cloud skills partially transfer but primary tech stack is different.',
      recommend: false,
    },
    {
      source: 'adzuna', title: 'Senior Frontend Engineer', company: 'N26',
      location: 'Amsterdam, Netherlands', salary: '€75,000 - €95,000',
      description: `N26 is hiring a Senior Frontend Engineer in Amsterdam to build the future of mobile banking.\n\nRequirements:\n- 5+ years frontend development\n- Expert React and TypeScript\n- Experience with design systems\n- Performance optimization expertise\n- Mobile-responsive development\n\nWe are a recognized sponsor (erkend referent) and offer Kennismigrant (HSM) visa sponsorship for international talent.`,
      url: 'https://example.com/n26-frontend',
      visa: true, visaNote: 'N26 is a recognized sponsor offering Kennismigrant (HSM) visa sponsorship.',
      scope: true, scopeNote: 'Amsterdam, Netherlands — compatible with relocate mode.',
      eligible: true, confidence: 0.93, country: 'NL',
      matchScore: 74, matchedSkills: ['React', 'TypeScript', 'Tailwind CSS', 'JavaScript'],
      missingSkills: ['Design Systems', 'Performance Optimization'], summary: 'Good match. Strong React/TypeScript skills with 5+ years experience. Missing specific design system and performance optimization expertise but has solid foundation.',
      recommend: true,
    },
    {
      source: 'linkedin', title: 'Platform Engineer', company: 'TechCo',
      location: 'Dublin, Ireland', salary: '€80,000 - €110,000',
      description: `Join our engineering team in Dublin as a Platform Engineer.\n\nRequirements:\n- Kubernetes, Terraform, AWS\n- Go or Rust programming\n- Monitoring and observability (Prometheus, Grafana)\n\nNote: Candidates must have existing right to work in Ireland or the EU. We are unable to provide visa sponsorship for this role.`,
      url: 'https://example.com/techco-platform',
      visa: false, visaNote: 'Employer explicitly states they are unable to provide visa sponsorship for this role.',
      scope: true, scopeNote: 'Dublin, Ireland — location is compatible.',
      eligible: false, confidence: 0.98, country: 'IE',
      matchScore: 0, matchedSkills: [], missingSkills: [],
      summary: '', recommend: false,
    },
  ];

  for (const j of jobs) {
    const fingerprint = `seed_${j.company.toLowerCase().replace(/\s/g, '')}_${j.title.toLowerCase().replace(/\s/g, '')}`.slice(0, 32);

    const job = await prisma.job.create({
      data: {
        source: j.source,
        title: j.title,
        company: j.company,
        location: j.location,
        salary: j.salary,
        description: j.description,
        url: j.url,
        fingerprint,
      },
    });

    await prisma.jobAnalysis.create({
      data: {
        jobId: job.id,
        visaSponsorship: j.visa,
        visaExplanation: j.visaNote,
        locationScopePass: j.scope,
        scopeExplanation: j.scopeNote,
        overallEligible: j.eligible,
        confidence: j.confidence,
        countryCode: j.country,
      },
    });

    if (j.eligible && j.matchScore > 0) {
      await prisma.jobMatch.create({
        data: {
          jobId: job.id,
          cvProfileId: cvProfile.id,
          matchScore: j.matchScore,
          matchedSkills: JSON.stringify(j.matchedSkills),
          missingSkills: JSON.stringify(j.missingSkills),
          summary: j.summary,
          recommendApply: j.recommend,
        },
      });
    }

    console.log(`  ${j.eligible ? '✓' : '✗'} ${j.title} @ ${j.company} (score: ${j.matchScore})`);
  }

  // 3. Create some applications in different stages
  const allJobs = await prisma.job.findMany({ orderBy: { createdAt: 'asc' } });

  // Atlassian — Applied, in Screening
  if (allJobs[0]) {
    await prisma.application.create({
      data: {
        jobId: allJobs[0].id,
        status: 'screening',
        history: JSON.stringify([
          { status: 'saved', timestamp: new Date(Date.now() - 14 * 86400000).toISOString() },
          { status: 'ready_to_apply', timestamp: new Date(Date.now() - 13 * 86400000).toISOString() },
          { status: 'applied', timestamp: new Date(Date.now() - 12 * 86400000).toISOString() },
          { status: 'screening', timestamp: new Date(Date.now() - 5 * 86400000).toISOString(), note: 'Recruiter call scheduled for next week' },
        ]),
        notes: 'Recruiter: Sarah Chen. Phone screen scheduled for Monday 10am AEST.',
      },
    });
  }

  // Wise — Applied
  if (allJobs[2]) {
    await prisma.application.create({
      data: {
        jobId: allJobs[2].id,
        status: 'applied',
        history: JSON.stringify([
          { status: 'saved', timestamp: new Date(Date.now() - 10 * 86400000).toISOString() },
          { status: 'ready_to_apply', timestamp: new Date(Date.now() - 9 * 86400000).toISOString() },
          { status: 'applied', timestamp: new Date(Date.now() - 8 * 86400000).toISOString() },
        ]),
        notes: 'Applied via careers page. Cover letter emphasised payments experience.',
      },
    });
  }

  // Delivery Hero — Saved
  if (allJobs[4]) {
    await prisma.application.create({
      data: {
        jobId: allJobs[4].id,
        status: 'saved',
        history: JSON.stringify([
          { status: 'saved', timestamp: new Date(Date.now() - 3 * 86400000).toISOString() },
        ]),
      },
    });
  }

  // 4. Create scrape logs
  await prisma.scrapeLog.create({
    data: {
      source: 'adzuna',
      startedAt: new Date(Date.now() - 6 * 3600000),
      completedAt: new Date(Date.now() - 6 * 3600000 + 45000),
      jobsFound: 87,
      jobsAfterDedup: 4,
    },
  });
  await prisma.scrapeLog.create({
    data: {
      source: 'linkedin',
      startedAt: new Date(Date.now() - 6 * 3600000 + 60000),
      completedAt: new Date(Date.now() - 6 * 3600000 + 180000),
      jobsFound: 32,
      jobsAfterDedup: 2,
    },
  });
  await prisma.scrapeLog.create({
    data: {
      source: 'seek',
      startedAt: new Date(Date.now() - 6 * 3600000 + 200000),
      completedAt: new Date(Date.now() - 6 * 3600000 + 310000),
      jobsFound: 18,
      jobsAfterDedup: 2,
    },
  });

  // 5. Set settings with some countries enabled
  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: {
      id: 'singleton',
      value: JSON.stringify({
        search: {
          countries: [
            { code: 'AU', mode: 'relocate', enabled: true },
            { code: 'UK', mode: 'relocate', enabled: true },
            { code: 'CA', mode: 'relocate', enabled: true },
            { code: 'US', mode: 'remote', enabled: false },
            { code: 'DE', mode: 'relocate', enabled: true },
            { code: 'NL', mode: 'relocate', enabled: true },
            { code: 'SG', mode: 'relocate', enabled: false },
            { code: 'AE', mode: 'relocate', enabled: false },
            { code: 'NZ', mode: 'relocate', enabled: true },
            { code: 'IE', mode: 'relocate', enabled: true },
          ],
          minMatchScore: 50,
          blocklist: ['principal', '10+ years'],
        },
        schedule: { intervalHours: 6, quietHoursStart: '22:00', quietHoursEnd: '07:00' },
        sources: { adzuna: { enabled: true }, linkedin: { enabled: true }, seek: { enabled: true } },
        notifications: { newJobs: true, scrapeErrors: true, documentReady: true, staleReminder: true, staleReminderDays: 21 },
      }),
    },
    update: {
      value: JSON.stringify({
        search: {
          countries: [
            { code: 'AU', mode: 'relocate', enabled: true },
            { code: 'UK', mode: 'relocate', enabled: true },
            { code: 'CA', mode: 'relocate', enabled: true },
            { code: 'US', mode: 'remote', enabled: false },
            { code: 'DE', mode: 'relocate', enabled: true },
            { code: 'NL', mode: 'relocate', enabled: true },
            { code: 'SG', mode: 'relocate', enabled: false },
            { code: 'AE', mode: 'relocate', enabled: false },
            { code: 'NZ', mode: 'relocate', enabled: true },
            { code: 'IE', mode: 'relocate', enabled: true },
          ],
          minMatchScore: 50,
          blocklist: ['principal', '10+ years'],
        },
        schedule: { intervalHours: 6, quietHoursStart: '22:00', quietHoursEnd: '07:00' },
        sources: { adzuna: { enabled: true }, linkedin: { enabled: true }, seek: { enabled: true } },
        notifications: { newJobs: true, scrapeErrors: true, documentReady: true, staleReminder: true, staleReminderDays: 21 },
      }),
    },
  });

  console.log('\nSeed complete!');
  console.log(`  - 1 CV profile`);
  console.log(`  - ${jobs.length} jobs (${jobs.filter(j => j.eligible).length} eligible)`);
  console.log(`  - 3 applications (screening, applied, saved)`);
  console.log(`  - 3 scrape logs`);
  console.log(`  - Settings configured with 7 countries enabled`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
