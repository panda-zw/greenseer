import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { KeyStoreService } from '../keystore.service';

@Injectable()
export class ClaudeService {
  private readonly logger = new Logger(ClaudeService.name);
  private client: Anthropic | null = null;
  private lastKey: string | null = null;

  constructor(private readonly keyStore: KeyStoreService) {}

  private getClient(): Anthropic {
    const keys = this.keyStore.getKeys();
    if (!keys.anthropicKey) {
      throw new Error('Anthropic API key not configured');
    }

    if (!this.client || this.lastKey !== keys.anthropicKey) {
      this.lastKey = keys.anthropicKey;
      this.client = new Anthropic({ apiKey: keys.anthropicKey });
    }
    return this.client;
  }

  /**
   * Send a prompt to Claude and parse a JSON response.
   *
   * Defaults to Haiku (fast + cheap) with a generous token budget. Callers
   * that need higher quality (e.g. CV generation) should pass
   * `{ model: 'claude-sonnet-4-6', maxTokens: 8192 }`.
   */
  async promptJson<T>(
    systemPrompt: string,
    userPrompt: string,
    options?: { model?: string; maxTokens?: number },
  ): Promise<T> {
    const client = this.getClient();

    const response = await client.messages.create({
      model: options?.model ?? 'claude-haiku-4-5-20251001',
      // 2048 is far too small for long-form outputs like full CVs. 4096 is a
      // safer default that still keeps latency low for short prompts.
      max_tokens: options?.maxTokens ?? 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text =
      response.content[0].type === 'text' ? response.content[0].text : '';

    // Extract JSON from the response (handle markdown code blocks)
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [
      null,
      text,
    ];
    const rawJson = jsonMatch[1]!.trim();

    // Claude frequently returns JSON where multi-line string values (like a
    // generated CV body) contain RAW newlines/tabs inside the quotes. JSON
    // spec requires those to be escaped (`\n`, `\t`), so `JSON.parse` throws
    // "Bad control character in string literal". Sanitize them before parsing.
    const sanitized = sanitizeJsonControlChars(rawJson);

    try {
      return JSON.parse(sanitized) as T;
    } catch (error) {
      this.logger.error(`Failed to parse JSON response: ${sanitized.slice(0, 500)}`);
      throw new Error(`AI returned invalid JSON: ${error}`);
    }
  }

  /**
   * Refresh the client (e.g., after API key update).
   */
  refreshClient() {
    this.client = null;
  }
}

/**
 * Walk a JSON-ish string and escape any raw control characters (\n, \r, \t,
 * and the rest of the 0x00-0x1F range) that appear *inside* string literals.
 * Characters outside string literals are untouched. Already-escaped sequences
 * (preceded by an odd number of backslashes) are left alone.
 *
 * This is a pragmatic fix for LLM output that returns multi-line content
 * without escaping — Claude does this frequently for long `cv` values.
 */
function sanitizeJsonControlChars(input: string): string {
  let out = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const code = ch.charCodeAt(0);

    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }

    if (ch === '\\') {
      out += ch;
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      out += ch;
      continue;
    }

    if (inString && code < 0x20) {
      // Escape raw control characters inside string literals.
      switch (ch) {
        case '\n': out += '\\n'; break;
        case '\r': out += '\\r'; break;
        case '\t': out += '\\t'; break;
        case '\b': out += '\\b'; break;
        case '\f': out += '\\f'; break;
        default:
          out += '\\u' + code.toString(16).padStart(4, '0');
      }
      continue;
    }

    out += ch;
  }

  return out;
}
