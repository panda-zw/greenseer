import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const PREFIX = 'enc:';

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private key: Buffer | null = null;

  constructor() {
    this.initKey();
  }

  private initKey() {
    const envKey = process.env.ENCRYPTION_KEY;
    if (envKey) {
      // Expect a 64-char hex string (32 bytes)
      this.key = Buffer.from(envKey, 'hex');
      if (this.key.length !== 32) {
        this.logger.error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
        this.key = null;
      }
    } else {
      this.logger.warn(
        'No ENCRYPTION_KEY set — sensitive fields will be stored in plaintext. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
      );
    }
  }

  encrypt(plaintext: string): string {
    if (!this.key) return plaintext;

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Format: enc:<iv>:<authTag>:<ciphertext> (all base64)
    return `${PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  decrypt(ciphertext: string): string {
    if (!this.key || !ciphertext.startsWith(PREFIX)) return ciphertext;

    try {
      const parts = ciphertext.slice(PREFIX.length).split(':');
      if (parts.length !== 3) return ciphertext;

      const iv = Buffer.from(parts[0], 'base64');
      const authTag = Buffer.from(parts[1], 'base64');
      const encrypted = Buffer.from(parts[2], 'base64');

      const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv);
      decipher.setAuthTag(authTag);
      return decipher.update(encrypted) + decipher.final('utf8');
    } catch (err: any) {
      this.logger.error(`Decryption failed: ${err.message}`);
      return ciphertext;
    }
  }

  isEncrypted(value: string): boolean {
    return value.startsWith(PREFIX);
  }
}
