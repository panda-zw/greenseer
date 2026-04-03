# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability in Greenseer, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, please email **security@greenseer.dev** with:

1. A description of the vulnerability
2. Steps to reproduce
3. Potential impact
4. Suggested fix (if any)

You should receive a response within 48 hours. We will work with you to understand the issue and coordinate a fix before any public disclosure.

## Security Practices

Greenseer implements the following security measures:

- **Credential storage**: API keys are stored in the OS-native keychain (macOS Keychain, Windows Credential Manager), never in the database or config files
- **Sidecar authentication**: Communication between the Tauri shell and NestJS sidecar is authenticated with a per-session cryptographic secret
- **Data encryption**: Sensitive fields (CV text, generated documents) are encrypted at rest using AES-256-GCM
- **Content Security Policy**: The Tauri webview restricts script execution and network connections
- **Input validation**: All API inputs are validated via NestJS ValidationPipe
- **CORS restrictions**: The sidecar only accepts requests from the Tauri webview origin
- **Rate limiting**: API endpoints are rate-limited to prevent abuse
- **File upload limits**: Upload endpoints enforce size limits and MIME type filtering
- **URL allowlisting**: Job enrichment only fetches from known job site domains
- **No SQL injection**: All database queries use Prisma's typed query builder (no raw queries)

## Scope

The following are in scope for security reports:

- Authentication/authorization bypass
- Data exposure or leakage
- Injection vulnerabilities (XSS, SQL injection, command injection)
- Credential handling issues
- Cryptographic weaknesses
- Path traversal or file access issues

The following are out of scope:

- Denial of service against the local desktop app
- Issues requiring physical access to the machine
- Social engineering
- Third-party service vulnerabilities (Anthropic API, Adzuna API)
