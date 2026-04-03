export interface ExperienceEntry {
  title: string;
  company: string;
  location: string;
  startDate: string;
  endDate: string;
  bullets: string[];
}

export interface EducationEntry {
  degree: string;
  institution: string;
  year: string;
}

export interface ProjectEntry {
  name: string;
  techStack: string;
  description: string;
  url?: string;
}

export interface CertificationEntry {
  name: string;
  year: string;
}

export interface StructuredCV {
  summary: string;
  experience: ExperienceEntry[];
  education: EducationEntry[];
  projects: ProjectEntry[];
  certifications: CertificationEntry[];
  additionalInfo?: string;
}

/** Convert structured CV to plain text for AI processing */
export function structuredCvToText(cv: StructuredCV): string {
  const lines: string[] = [];

  if (cv.summary) {
    lines.push('PROFESSIONAL SUMMARY');
    lines.push(cv.summary);
    lines.push('');
  }

  if (cv.experience.length > 0) {
    lines.push('EXPERIENCE');
    for (const exp of cv.experience) {
      lines.push(`${exp.title}, ${exp.company}${exp.location ? ` - ${exp.location}` : ''}`);
      lines.push(`${exp.startDate} - ${exp.endDate}`);
      for (const bullet of exp.bullets) {
        if (bullet.trim()) lines.push(`- ${bullet.trim()}`);
      }
      lines.push('');
    }
  }

  if (cv.education.length > 0) {
    lines.push('EDUCATION');
    for (const edu of cv.education) {
      lines.push(`${edu.degree} - ${edu.institution} (${edu.year})`);
    }
    lines.push('');
  }

  if (cv.projects.length > 0) {
    lines.push('PROJECTS');
    for (const proj of cv.projects) {
      lines.push(`${proj.name}${proj.techStack ? ` - ${proj.techStack}` : ''}`);
      if (proj.description) lines.push(proj.description);
      if (proj.url) lines.push(proj.url);
      lines.push('');
    }
  }

  if (cv.certifications.length > 0) {
    lines.push('CERTIFICATIONS');
    for (const cert of cv.certifications) {
      lines.push(`${cert.name}${cert.year ? ` (${cert.year})` : ''}`);
    }
    lines.push('');
  }

  if (cv.additionalInfo) {
    lines.push('ADDITIONAL INFORMATION');
    lines.push(cv.additionalInfo);
  }

  return lines.join('\n');
}

/** Try to parse plain text CV into structured format */
export function textToStructuredCv(text: string): StructuredCV {
  const cv: StructuredCV = {
    summary: '',
    experience: [],
    education: [],
    projects: [],
    certifications: [],
  };

  if (!text.trim()) return cv;

  const lines = text.split('\n');
  let currentSection = '';
  let buffer: string[] = [];

  const flushBuffer = () => {
    const content = buffer.join('\n').trim();
    if (!content) return;

    switch (currentSection.toLowerCase()) {
      case 'professional summary':
      case 'summary':
      case 'profile':
      case 'about':
        cv.summary = content;
        break;
      case 'experience':
      case 'work experience':
      case 'employment':
        parseExperience(content, cv);
        break;
      case 'education':
        parseEducation(content, cv);
        break;
      case 'projects':
        parseProjects(content, cv);
        break;
      case 'certifications':
      case 'certificates':
        parseCertifications(content, cv);
        break;
      default:
        if (!cv.summary && !currentSection) {
          cv.summary = content;
        }
        break;
    }
    buffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const isHeading = trimmed === trimmed.toUpperCase() && trimmed.length > 2 && trimmed.length < 60 && /[A-Z]/.test(trimmed);

    if (isHeading) {
      flushBuffer();
      currentSection = trimmed;
    } else {
      buffer.push(line);
    }
  }
  flushBuffer();

  return cv;
}

function parseExperience(content: string, cv: StructuredCV) {
  // Simple heuristic: split by double newlines or lines that look like job titles
  const blocks = content.split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim());
    if (lines.length === 0) continue;

    const exp: ExperienceEntry = { title: '', company: '', location: '', startDate: '', endDate: '', bullets: [] };

    // First line is usually "Title, Company - Location" or "Title at Company"
    const firstLine = lines[0].trim();
    const commaMatch = firstLine.match(/^(.+?),\s*(.+?)(?:\s*-\s*(.+))?$/);
    if (commaMatch) {
      exp.title = commaMatch[1].trim();
      exp.company = commaMatch[2].trim();
      exp.location = commaMatch[3]?.trim() || '';
    } else {
      exp.title = firstLine;
    }

    for (let i = 1; i < lines.length; i++) {
      const l = lines[i].trim();
      // Date line
      if (/\d{4}/.test(l) && l.length < 50 && !l.startsWith('-')) {
        const parts = l.split(/\s*-\s*/);
        exp.startDate = parts[0]?.trim() || '';
        exp.endDate = parts[1]?.trim() || '';
      } else if (l.startsWith('-') || l.startsWith('•')) {
        exp.bullets.push(l.replace(/^[-•●]\s*/, ''));
      } else if (exp.bullets.length > 0) {
        // Continuation of previous bullet
        exp.bullets[exp.bullets.length - 1] += ' ' + l;
      }
    }

    if (exp.title || exp.company) cv.experience.push(exp);
  }
}

function parseEducation(content: string, cv: StructuredCV) {
  const lines = content.split('\n').filter((l) => l.trim());
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('-') || trimmed.startsWith('•')) continue;
    const yearMatch = trimmed.match(/(\d{4})/);
    cv.education.push({
      degree: trimmed.replace(/\(\d{4}\)/, '').replace(/\d{4}/, '').replace(/\s*-\s*$/, '').trim(),
      institution: '',
      year: yearMatch?.[1] || '',
    });
  }
}

function parseProjects(content: string, cv: StructuredCV) {
  const blocks = content.split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim());
    if (lines.length === 0) continue;
    cv.projects.push({
      name: lines[0].trim(),
      techStack: '',
      description: lines.slice(1).join(' ').trim(),
    });
  }
}

function parseCertifications(content: string, cv: StructuredCV) {
  const lines = content.split('\n').filter((l) => l.trim());
  for (const line of lines) {
    const trimmed = line.replace(/^[-•●]\s*/, '').trim();
    const yearMatch = trimmed.match(/(\d{4})/);
    cv.certifications.push({
      name: trimmed.replace(/\(\d{4}\)/, '').replace(/\d{4}/, '').replace(/\s*-\s*$/, '').trim(),
      year: yearMatch?.[1] || '',
    });
  }
}
