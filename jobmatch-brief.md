# JobMatch Desktop — Product Requirements Brief

**Product Name:** JobMatch  
**Type:** Desktop Application (Background Agent)  
**Author:** Panashe  
**Version:** 1.0  
**Date:** April 2026

---

## 1. Product Overview

JobMatch is a personal desktop application that runs silently in the background and automates the most painful parts of an international job search. It continuously scrapes job listings from multiple platforms, uses AI to verify whether jobs genuinely offer visa sponsorship and match your actual skillset, prepares country-formatted CVs and cover letters for jobs you select, and tracks every application through to conclusion.

The core problem it solves is that job platforms like LinkedIn surface hundreds of roles that claim to offer visa sponsorship or be remote-friendly, but the actual job descriptions tell a different story. Manually sifting through these is exhausting and wasteful. JobMatch reads the actual text of every job — not the metadata tags — and only surfaces roles that genuinely meet your criteria. On top of that, it matches each job against your master CV so you only see roles you are actually qualified for, then generates application-ready documents tailored to the hiring country's conventions and ready to submit.

---

## 2. Platform & Technology Stack

### 2.1 Desktop Framework — Tauri v2

The application is built with Tauri v2. Tauri was chosen over Electron for the following reasons:

Tauri uses the operating system's native WebView (WebView2 on Windows, WKWebView on macOS) instead of bundling a full Chromium engine. This produces an installer that is typically 5–15 MB compared to Electron's 100–200 MB, and the running application consumes a fraction of the RAM.

Tauri's Rust core handles all native operating system capabilities — system tray, native notifications, file system access, auto-launch on startup, and window management — through a well-structured plugin system introduced in Tauri v2. These are the exact capabilities JobMatch needs for its background operation.

The Rust layer also provides a meaningful security improvement. The frontend has no direct access to the operating system; all privileged actions go through explicitly declared Tauri commands that the Rust core validates and executes.

### 2.2 Process Architecture

Tauri separates the application into two processes that communicate via a message-passing bridge:

**The Rust Core** is the native layer. It owns the system tray, window lifecycle, native notifications, file system paths, and auto-launch registration. It also acts as the bridge between the UI and the backend service. Every action the UI wants to perform that touches the OS or the backend goes through a Tauri command defined in the Rust core.

**The Frontend** is a React application served by Vite, running inside the native WebView. It is responsible solely for rendering the UI and handling user interactions. It communicates with the Rust core via Tauri's invoke API.

**The NestJS Sidecar** is a Node.js process bundled as a binary alongside the Tauri app. It runs as a background sidecar managed by the Rust core — started when the app launches and stopped when it exits. The sidecar contains all the application business logic: the job scraper, the AI processing pipeline, the database layer, the document generator, and the scheduling engine. The frontend communicates with the sidecar through a local HTTP interface exposed on a fixed localhost port, exactly as it would communicate with a remote API.

This architecture keeps a clean separation of concerns: Rust handles the native OS layer, NestJS handles the business logic, and React handles the interface. It also means the entire NestJS backend can be developed and tested independently of the Tauri shell.

### 2.3 Frontend — React + Vite + TypeScript

The UI is built with React 19 and TypeScript, bundled with Vite. This combination integrates natively with Tauri's default frontend tooling and produces fast hot-module-reload during development.

All UI components use Shadcn/ui. The colour theme is Zinc — the neutral grey-based palette that Shadcn ships as its darkest and most refined built-in theme. Zinc gives the application a professional, tool-like aesthetic appropriate for a power-user productivity application. It avoids the sterile white of most enterprise software while remaining clean and focused.

Dark mode is the default and only theme for v1. The zinc dark palette provides sufficient contrast and legibility without being harsh on the eyes during extended use.

All interactive components — buttons, inputs, selects, checkboxes, dialogs, toasts, tooltips, dropdowns, badges, cards, tabs, and the kanban board — are built from Shadcn primitives. No other component library is introduced. Custom components compose from Shadcn base components.

### 2.4 Backend — NestJS + TypeScript

The NestJS sidecar contains all business logic. It is built with NestJS and TypeScript, matching the development team's existing skill set. It exposes a RESTful API on localhost that the React frontend consumes. The API is not authenticated since it is only accessible on the loopback interface.

NestJS modules map directly to the application's functional areas: one module for scraping, one for AI processing, one for job management, one for CV management, one for document generation, one for application tracking, and one for settings.

BullMQ handles the job processing queue within the sidecar. For the desktop context, BullMQ is configured to use an in-memory queue rather than a Redis dependency, keeping the deployment self-contained.

### 2.5 Database — SQLite via Prisma

The database is SQLite. SQLite is the correct choice for a single-user desktop application — it requires no external server process, the entire database is a single file on the user's machine, and it handles the read/write patterns of this application without any performance concerns.

Prisma is the ORM. The schema and all queries are written identically to how they would be written for MySQL. If the application is ever productised into a multi-user web service, the only change required is the Prisma connection string.

The database file is stored in the application's data directory as managed by Tauri — on Windows this is the AppData/Roaming folder, on macOS it is the Application Support folder.

---

## 3. System Architecture

The application has five internal layers:

**Scheduler Layer** — A cron-based service inside the NestJS sidecar that fires at configurable intervals (default every six hours) to trigger job scraping. It runs regardless of whether the main window is open. On first launch after setup it runs immediately.

**Scraping Layer** — A collection of source-specific modules that fetch raw job listings from LinkedIn, Seek, and the Adzuna API. Each source is an independent NestJS service so new sources can be added without touching the rest of the system. All scrapers normalise their output to a standardised job object before handing off to the next stage.

**Processing Layer** — A BullMQ pipeline that takes each raw job through three sequential stages: deduplication, visa and scope verification via AI, and CV matching via AI. Jobs that fail deduplication are discarded immediately. Jobs that fail visa verification are stored but marked ineligible and not shown in the main feed. Only jobs that pass both stages and meet the minimum match score are surfaced to the user.

**Storage Layer** — SQLite via Prisma persisting everything: raw jobs, analysis results, CV profiles, generated documents, and the full application tracking history.

**UI Layer** — The React frontend reading from and writing to the NestJS API. The UI performs no business logic and makes no AI calls directly. All intelligence lives in the sidecar.

---

## 4. Core Modules

### 4.1 System Tray & Background Operation

The application installs to the system tray on both Windows and macOS using Tauri's tray plugin. It runs persistently without the main window being open. The tray icon displays a numeric badge showing the count of new unreviewed eligible jobs.

Left-clicking the tray icon opens the main window. Right-clicking shows a context menu with the following options: Open JobMatch, Run Scrape Now, Pause Scraping (toggle), and Quit.

On first install the app registers itself for auto-launch on system startup via Tauri's autostart plugin. The user can disable this in Settings.

System notifications are sent via Tauri's notification plugin, which uses the OS's native notification system. Notifications appear in the standard Windows Action Centre or macOS Notification Centre.

The Rust core is responsible for starting and stopping the NestJS sidecar process. If the sidecar crashes it is automatically restarted. The UI shows a status indicator (visible in Settings) confirming the sidecar is running.

---

### 4.2 CV Manager

The CV Manager stores the user's master CV — a comprehensive document containing their complete professional history, every technology they have worked with, every certification and qualification, every project. This is not a polished one-page CV; it is an exhaustive data store that the AI draws from when producing tailored output for specific applications.

Multiple CV profiles are supported. A user might maintain a backend-focused profile, a full-stack profile, and a DevOps profile, each emphasising different aspects of their experience. One profile is designated as the active default at any time.

The editor is a plain-text editor rendered in the UI. The user types or pastes directly. Basic structure is encouraged through a template provided on first use, with clearly labelled sections for Professional Summary, Work Experience, Education, Technical Skills, Projects, and Certifications.

When a CV profile is saved, the NestJS backend parses it to extract a skills inventory — a flat list of technologies, frameworks, languages, tools, and domain areas detected in the text. This inventory is displayed as a tag cloud in the UI. The user can manually add tags the AI missed and remove any it incorrectly detected. The skills inventory is what gets compared against job requirements during the matching stage.

Each save is versioned. The user can view previous versions of any profile and restore an earlier version if needed.

---

### 4.3 Job Scraper

The scraper service runs on a schedule and pulls listings from three sources. The Rust core wakes the NestJS sidecar at the scheduled interval; the sidecar's scheduler then fires each enabled source in sequence.

**Adzuna API** is integrated first as the foundation source. It is called via its official REST API using the user's free API key (ten thousand calls per month on the free tier). Adzuna covers the UK, Australia, Canada, New Zealand, and several European markets with structured, clean data. Each API call returns job title, company, location, salary range where available, a description, and a direct URL. No scraping or browser automation is required.

**LinkedIn** is scraped using a headless Chromium session managed by Playwright running inside the NestJS sidecar. The scraper performs a keyword search on LinkedIn Jobs, filtered by location and the built-in visa sponsorship toggle as a loose pre-filter only. It collects the job title, company, location, salary if listed, the full description text from the expanded job panel, and the URL. The scraper applies polite request delays between page loads to avoid triggering rate limiting or account restrictions.

**Seek** is scraped with Playwright targeting the Australian and New Zealand markets specifically, where it provides meaningful coverage of tech roles that commonly offer 482 TSS sponsorship. Seek's job listing pages are structurally stable and less aggressively protected than LinkedIn.

Each scraper module is independently configurable. The user can enable or disable any source from Settings. Each source records its last successful run time, the number of jobs returned, and any error encountered. This data is visible in the Settings screen.

---

### 4.4 Deduplication Engine

Before any AI processing begins, every incoming job is checked against the existing database to determine whether it has been seen before.

A deduplication fingerprint is generated from a normalised combination of the company name, job title, and location. Normalisation lowercases the string, removes punctuation, and strips common suffixes like "Ltd", "Inc", and "Pty". If a job with a matching fingerprint already exists in the database it is discarded without any further processing. This ensures the same role appearing on multiple sources is only ever analysed once.

Beyond duplicate detection, a job is permanently suppressed if the user has previously taken any action on it — marked it as Not Interested, Hidden, Applied, or any other application status. Once a user acts on a job it is excluded from all future scrape cycles unconditionally. This is the mechanism that ensures jobs already applied to never re-appear.

The suppression list is maintained as a fast-lookup set in memory (populated from the database on startup) so deduplication adds negligible overhead to the pipeline.

---

### 4.5 AI Analysis Engine

Every job that clears deduplication enters a two-stage AI pipeline. Both stages use the Claude API with the Haiku model, which provides sufficient accuracy for this task at a cost of a fraction of a cent per job.

**Stage 1 — Visa and Scope Verification**

The AI reads the full job description and makes two determinations. First, does this employer genuinely offer visa sponsorship — not just carry the metadata tag, but actually state in their description that they will sponsor the required visa for an international candidate? Second, is the location or remote scope compatible with the user's configured criteria for this country?

The AI is given country-specific context for each analysis. For Australia it checks for references to being an approved 482 TSS sponsor or 186 ENS sponsor. For the UK it checks for Skilled Worker sponsor licence language. For Canada it checks for LMIA willingness or Express Entry support. For Germany it checks for EU Blue Card sponsorship. For each country, the AI knows what genuine sponsorship language looks like and what disqualifying language looks like — phrases like "must have right to work", "no sponsorship available", or "citizens and permanent residents only".

The stage returns a structured result: a pass or fail for visa sponsorship with a plain-English explanation, a pass or fail for location scope with a plain-English explanation, an overall eligibility verdict, and a confidence level. The explanation notes are displayed directly on the job card in the UI so the user can see exactly why a job was marked as eligible or not.

**Stage 2 — CV Matching**

Jobs that pass Stage 1 are then matched against the user's active CV profile. The AI compares the technical skills, experience level, and domain expertise in the CV against the requirements stated in the job description.

The stage returns a match score from zero to one hundred, a list of skills from the job description that are present in the CV, a list of skills the job requires that are missing or weak in the CV, a two-sentence plain-English summary of the match, and a boolean recommendation of whether to apply. A job scoring below the user's configured minimum threshold (default fifty, adjustable in Settings) is stored in the database but hidden from the main feed unless the user explicitly chooses to view low-match jobs.

---

### 4.6 Job Feed

The Job Feed is the primary screen of the application. It displays all jobs that have passed both AI stages and meet the configured match threshold, ordered by match score descending by default.

Each job is displayed as a card built from Shadcn Card components in the zinc dark theme. The card shows the job title, company name, location, salary range where available, the source it was scraped from, the match score as a circular progress indicator, the AI's visa verification note, matched skills as green Shadcn Badge components, missing skills as red Badge components, and the two-sentence AI match summary. The full job description is expandable within the card via a Collapsible component.

The toolbar above the feed provides filter and sort controls. Filters include target country, minimum match score (a range slider), visa eligibility status, and whether documents have been generated. Sort options are match score, date found, and salary. All filter state persists across sessions.

Actions available on each job card:

- **Save** — bookmarks the job. It moves to a Saved state in the tracker but no documents are generated yet.
- **Generate & Apply** — triggers immediate document generation and moves the job to a Ready to Apply state in the tracker. The user is shown a loading state while documents generate, then taken to the document view.
- **Not Interested** — permanently dismisses the job. It is added to the suppression list and will never appear again.
- **Open Listing** — opens the original job URL in the user's default browser via Tauri's shell plugin.

A badge in the tray icon and a count indicator in the tab label show how many unreviewed jobs are waiting.

---

### 4.7 Document Generator

The Document Generator produces two outputs for each job application: a country-formatted, ATS-optimised CV and a targeted cover letter.

**CV Generation**

The NestJS backend sends the user's master CV text, the full job description, and the target country to the Claude API with detailed formatting instructions specific to that country. The AI rewrites and reformats the CV according to local conventions:

For Australia and New Zealand, the output is titled "Resume", capped at two pages, contains no photo, uses Australian spelling, includes a two to three line professional summary, and adds a note near the contact details indicating that the candidate requires 482 TSS visa sponsorship.

For the United Kingdom and Ireland, the output is titled "CV", leads with a three to four line personal statement, uses British spelling, and notes the Skilled Worker visa sponsorship requirement.

For Canada and the United States, the output is titled "Resume", strictly excludes all personal information beyond name, email, phone, and LinkedIn URL, and emphasises quantified achievements throughout.

For Germany, the output follows Lebenslauf conventions with a formal structure, includes a placeholder note for a professional photo, notes date of birth and nationality as expected in that market, and structures experience in reverse chronological order with detailed entries.

For Netherlands, Singapore, and the UAE, locally appropriate conventions are applied based on the tech industry norms in each market.

In all cases the AI weaves relevant keywords from the job description naturally into the CV text, reorders bullet points to lead with the most relevant experience, and structures the output with no tables, no columns, and no text boxes so it passes ATS parsing correctly.

**Cover Letter Generation**

The cover letter is generated in parallel with the CV using the same inputs. The AI produces a three to four paragraph letter that opens with genuine specific interest in the company rather than a generic opener, connects two or three concrete experiences from the CV to the job's stated requirements, addresses the visa sponsorship requirement directly and framing it confidently as a straightforward process, and closes with a clear call to action.

**Storage and Access**

Both documents are stored in the database linked to the specific job, the CV profile used, and the target country. The user can view either document in a full-screen reader built with Shadcn's ScrollArea component, copy the text to clipboard with a single click, download it as a plain text file via Tauri's file system plugin, or trigger a regeneration if they are not satisfied with the output.

The Document Generator is also accessible independently from the job feed. The user can paste any job description manually — useful for jobs found on a company's own careers page — select the target country, and generate documents without the job needing to be in the system.

---

### 4.8 Application Tracker

The Application Tracker provides full visibility into every job the user has actioned, from first interest through to a final outcome.

**Board View**

The default view is a kanban board implemented with a drag-and-drop library (dnd-kit is recommended for its accessibility and TypeScript support). The board has the following columns:

- **Saved** — bookmarked, no action taken yet
- **Ready to Apply** — documents generated, application not yet submitted
- **Applied** — application submitted to the employer
- **Screening** — in contact with HR or a recruiter
- **Interviewing** — technical, cultural, or panel interviews in progress
- **Offer Received** — an offer has been made
- **Rejected** — rejected at any stage of the process
- **Withdrawn** — the user chose to withdraw their application

Each card on the board shows the job title, company, country flag, match score badge, and the number of days it has been in the current column. Cards are dragged between columns to update the status. A status change is recorded in the history log automatically.

**List View**

An alternate list view shows all applications in a Shadcn DataTable with sortable columns for company, role, country, match score, current status, date applied, and days since last update. This is useful for reviewing large numbers of applications at once and for spotting applications that have gone stale.

**Application Detail Panel**

Clicking any card or row opens a full detail panel as a Shadcn Sheet component sliding in from the right. The panel contains:

The job title, company, salary, and source at the top. Below that, the status history showing every column the card has moved through with timestamps. Then the full AI analysis notes — visa verification reasoning and CV match breakdown. Then the generated CV and cover letter with copy and download actions. Then a notes field where the user can record anything relevant — the name of the recruiter, feedback received after an interview, questions asked, compensation discussed, or any other context. Finally, a salary field to record the offered package if an offer is received.

**Summary Statistics**

A statistics panel accessible from the tracker header shows: total applications by status, average days to hear back from Applied to Screening, average days from Screening to Interview, interview to offer conversion rate, and overall response rate. These accumulate over time and become a useful reference for understanding which types of companies and roles are most responsive.

---

### 4.9 Settings

The Settings screen is structured as a tabbed panel using Shadcn Tabs.

**Search Preferences tab** — The user selects which countries to target. For each enabled country they set the mode: Relocate (in-person roles where the employer will sponsor a visa to work in that country) or Remote (globally remote roles accessible from Zimbabwe). They also set the minimum CV match score below which jobs are hidden from the main feed, and a keywords blocklist for terms that should exclude a job (for example, "10+ years" or "senior principal").

**Schedule tab** — How frequently the scraper runs, in hours, set via a Shadcn Select component. Options range from every two hours to once daily. Quiet hours can be defined — a time range during which no scraping runs and no notifications are shown.

**Sources tab** — Each job source (Adzuna, LinkedIn, Seek) is listed with a toggle to enable or disable it, a display of the last successful run time, the number of jobs it returned in the last run, and a button to trigger an immediate manual run of that source only.

**API & Keys tab** — Input fields for the Anthropic API key and the Adzuna API key. Both are stored encrypted in the OS credential store via Tauri's credential plugin rather than in the SQLite database or any plain text file. The tab also displays usage statistics: total AI analysis calls made, estimated total API cost based on token counts, and a rolling thirty-day cost chart.

**About tab** — Application version, a link to documentation, and a database management section with options to export the full database as a backup file or clear all scraped jobs older than a specified number of days.

---

## 5. Data Model

**jobs** stores every job that has been scraped, regardless of whether it passed analysis. Fields include the source platform, job title, company name, location string, salary string, full description text, original URL, deduplication fingerprint hash, and the timestamp when it was first seen. A job written to this table is never scraped again.

**job_analysis** stores the Stage 1 AI result for each job. It is linked to the jobs table and records the visa sponsorship verdict (boolean), the sponsorship explanation note, the location scope verdict (boolean), the scope explanation note, the overall eligibility flag, the AI confidence level, and the timestamp of the analysis.

**job_matches** stores the Stage 2 CV matching result. It links to both jobs and cv_profiles and records the numeric match score, the array of matched skill names, the array of missing skill names, the plain-English match summary, the apply recommendation flag, and the analysis timestamp.

**cv_profiles** stores each of the user's CV profiles. Fields include a display name, the full CV body text, a parsed skills array, a default flag, and version history stored as a JSON array of timestamped snapshots.

**generated_documents** stores each generated CV and cover letter output. It links to jobs and cv_profiles and records the target country code, the CV text, the cover letter text, and the generation timestamp. Multiple versions per job are retained.

**applications** is the tracking record. One row per job the user has taken action on. It stores the current status string, a JSON array of status change history entries (each with a status, timestamp, and optional note), a free-text notes field, and a salary recorded field for offers.

**scrape_log** records every scrape run. Fields include the source, start time, end time, number of raw jobs returned, number of jobs after deduplication, and an error message if the run failed.

**settings** is a single-row key-value store for all user configuration. Stored as a JSON column to allow flexible schema evolution without migrations for simple settings changes.

---

## 6. User Flows

### First Launch & Onboarding

The user opens the application for the first time. A Shadcn Dialog walks them through four steps: entering their Anthropic and Adzuna API keys, pasting or typing their master CV into the editor, selecting their target countries and the mode for each, and confirming their minimum match score. On completion the first scrape runs immediately in the background. The main window opens to the Job Feed which populates in real time as jobs are processed. The app moves to the tray.

### Daily Use

The user sees a notification or badge count indicating new jobs. They open the app and scan the feed, sorted by match score. For interesting jobs they expand the description inline to read the detail. Jobs that are genuinely appealing they click Generate & Apply on — documents are generated in the background while they continue browsing. Jobs that are clearly irrelevant they dismiss with Not Interested. Once documents are ready they download the CV and cover letter, submit the application externally, then open the tracker and drag the card from Ready to Apply to Applied.

### Tracking an Application

As the application progresses the user drags the card across the board columns. Before an interview they open the detail panel to re-read the job description and their generated CV to refresh their memory. After the interview they add notes to the detail panel recording questions asked and feedback. If an offer arrives they record the salary and move the card to Offer Received.

### Using the Generator for an External Job

The user finds a role on a company's own careers page that is not in the feed. They open the Document Generator tab, paste the full job description, select the target country, and click generate. Both documents are produced. If they decide to apply they can manually add the job to the tracker by filling in the basic details in a simple form.

---

## 7. Notifications

Tauri's native notification plugin is used for all system notifications. The following events trigger a notification:

A scrape run completes and found new eligible jobs — the notification states the count and the top match score found. A scrape run fails due to a network error, authentication problem, or site structure change — the notification names the source that failed. A document generation job completes — useful if the user triggered generation and minimised the window. An application in the Applied column has not had a status update in twenty-one days — a gentle reminder to follow up or close out the record. This last notification is optional and can be disabled in Settings.

---

## 8. Supported Platforms

Version 1 targets Windows 10 and above, and macOS 12 (Monterey) and above. Both are supported natively by Tauri v2 with no platform-specific divergence in the application code.

Windows packaging produces an NSIS installer (.exe). macOS packaging produces a disk image (.dmg) with optional Apple notarisation for distribution outside the App Store.

Linux support is possible with minimal additional effort given Tauri's cross-platform build system, but is explicitly out of scope for the first release.

---

## 9. Development Phases

### Phase 1 — Foundation
Scaffold the Tauri v2 project with the React + Vite + TypeScript frontend. Configure Shadcn/ui with the zinc dark theme as the base. Set up the NestJS sidecar project structure and verify it launches correctly as a Tauri sidecar process. Establish the Tauri command bridge between the frontend and the sidecar. Implement SQLite via Prisma with all schema tables defined. Implement the Settings screen in full — API key storage via the OS credential store, country selection, schedule configuration. Implement the system tray with context menu. Verify auto-launch on startup on both platforms.

### Phase 2 — Scraping Pipeline
Implement the Adzuna API integration as the first and cleanest source. Build the deduplication engine. Implement the scrape scheduler with configurable interval. Add the scrape log and surface it in the Sources settings tab. Add the LinkedIn Playwright scraper. Add the Seek Playwright scraper. Build the Scrape Now manual trigger. Verify the full flow from scheduled scrape through to jobs written to the database without duplicates.

### Phase 3 — AI Processing Pipeline
Integrate the Claude API in the NestJS sidecar. Implement Stage 1 visa and scope verification with country-specific prompts for all ten target countries. Implement Stage 2 CV matching with match score, skills comparison, and recommendation output. Wire the BullMQ processing queue so scraped jobs automatically flow through both stages after deduplication. Build the Job Feed UI with job cards, match score indicators, skill badges, filter controls, and job actions. Verify the full pipeline end-to-end from scrape to visible job card.

### Phase 4 — CV Manager
Build the CV Manager screen with the plain-text editor, multiple profile support, and save functionality. Implement the skills inventory parser that extracts a tag list from CV text. Build the tag editor for manual skill additions and removals. Implement CV versioning with the ability to view and restore previous versions.

### Phase 5 — Document Generator
Implement CV reformatting with country-specific prompts for all ten countries. Implement cover letter generation. Build the Document Generator UI — job feed integration, manual paste flow, country selector, and document viewer with copy and download actions. Wire the Generate & Apply button in the job feed to produce documents and transition the job to the tracker. Test ATS compliance of generated output across the supported countries.

### Phase 6 — Application Tracker
Build the kanban board with dnd-kit drag-and-drop between all status columns. Build the list view with the sortable data table. Build the application detail panel as a side sheet with status history, notes, documents, and salary recording. Implement the summary statistics panel. Connect all job action buttons in the feed (Save, Generate & Apply, Not Interested) to the tracker correctly.

### Phase 7 — Polish & Distribution
Implement all notification events. Add error states and recovery flows for scrape failures and API errors. Performance profiling of the background sidecar to ensure it does not measurably affect system resources. Build the Windows NSIS installer and macOS DMG with notarisation. Test installation, update, and uninstallation on clean machines. Test the full user journey from onboarding to application tracking.

---

## 10. Out of Scope for Version 1

- DOCX file export. Documents download as plain text in v1. Formatted DOCX export is planned for v2 using the docx npm library in the NestJS sidecar.
- Application update mechanism. v1 is manually installed. Auto-update via Tauri's updater plugin is a v2 feature.
- Cloud sync or database backup to a remote service.
- Browser extension for one-click job capture from any page.
- Interview preparation features (common questions, company research).
- Salary benchmarking or market rate comparisons.
- Email or calendar integration for automatic status detection.
- Mobile companion application.
- Multi-user support.

---

## 11. Key Technical Decisions & Constraints

**Tauri sidecar for NestJS.** Running NestJS as a Tauri sidecar rather than compiling the backend logic into Rust keeps the entire application logic in TypeScript, matching the team's existing skills. The Rust core is kept thin — only native OS capabilities go there. The NestJS sidecar binary is produced with pkg or a similar Node.js bundler and shipped alongside the Tauri binary in the installer.

**No external processes required by the user.** The installer ships everything: the Tauri shell, the NestJS sidecar binary, and the SQLite database is created on first run. The user installs one application and nothing else.

**API keys belong to the user.** The application does not proxy Claude or Adzuna API calls through any server. The user provides their own keys. This keeps the operating cost directly in the user's control, requires no subscription infrastructure, and means the application has no recurring cost to operate beyond what the user pays for their own API usage.

**All data is local.** No job data, CV content, application history, or generated documents are ever transmitted anywhere except the Claude and Adzuna API endpoints, which require only job descriptions and CV text. No analytics, no telemetry, no third-party data collection.

**Scraping is personal use.** LinkedIn's terms of service restrict automated scraping. The application performs scraping for a single user's personal job search, not as a commercial data service. This is the same category of personal automation as a user manually searching and copying data, and the application makes no attempt to store, aggregate, or redistribute scraped data beyond the single user's local machine.

**Playwright is bundled.** The Playwright browser binary is bundled with the application so the user does not need to install a separate browser. This increases the installer size but eliminates a dependency and potential setup failure point. Only Chromium is bundled, not Firefox or WebKit.
