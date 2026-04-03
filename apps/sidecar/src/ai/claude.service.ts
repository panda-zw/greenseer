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
   */
  async promptJson<T>(systemPrompt: string, userPrompt: string): Promise<T> {
    const client = this.getClient();

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
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
    const jsonStr = jsonMatch[1]!.trim();

    try {
      return JSON.parse(jsonStr) as T;
    } catch (error) {
      this.logger.error(`Failed to parse JSON response: ${jsonStr}`);
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
