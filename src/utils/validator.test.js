import { describe, it, expect } from 'vitest';
import {
  verifyWebhookSignature,
  computeHmacSha256,
  constantTimeCompare,
} from './validator.js';

describe('Webhook Signature Verification', () => {
  describe('computeHmacSha256', () => {
    it('should compute correct HMAC-SHA256 signature', async () => {
      const payload = 'test payload';
      const secret = 'test-secret';

      const signature = await computeHmacSha256(payload, secret);

      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');
      expect(signature.length).toBe(64); // SHA256 hex is 64 characters
    });

    it('should produce consistent signatures for same input', async () => {
      const payload = 'test payload';
      const secret = 'test-secret';

      const signature1 = await computeHmacSha256(payload, secret);
      const signature2 = await computeHmacSha256(payload, secret);

      expect(signature1).toBe(signature2);
    });

    it('should produce different signatures for different payloads', async () => {
      const secret = 'test-secret';

      const signature1 = await computeHmacSha256('payload1', secret);
      const signature2 = await computeHmacSha256('payload2', secret);

      expect(signature1).not.toBe(signature2);
    });

    it('should produce different signatures for different secrets', async () => {
      const payload = 'test payload';

      const signature1 = await computeHmacSha256(payload, 'secret1');
      const signature2 = await computeHmacSha256(payload, 'secret2');

      expect(signature1).not.toBe(signature2);
    });
  });

  describe('constantTimeCompare', () => {
    it('should return true for identical strings', () => {
      const result = constantTimeCompare('test123', 'test123');
      expect(result).toBe(true);
    });

    it('should return false for different strings', () => {
      const result = constantTimeCompare('test123', 'test456');
      expect(result).toBe(false);
    });

    it('should return false for strings of different lengths', () => {
      const result = constantTimeCompare('short', 'longer string');
      expect(result).toBe(false);
    });

    it('should return false for non-string inputs', () => {
      expect(constantTimeCompare(null, 'test')).toBe(false);
      expect(constantTimeCompare('test', null)).toBe(false);
      expect(constantTimeCompare(123, 'test')).toBe(false);
    });

    it('should handle empty strings', () => {
      expect(constantTimeCompare('', '')).toBe(true);
      expect(constantTimeCompare('', 'test')).toBe(false);
    });
  });

  describe('verifyWebhookSignature', () => {
    it('should verify valid signature', async () => {
      const payload = '{"test": "data"}';
      const secret = 'my-secret';

      // Compute expected signature
      const expectedSig = await computeHmacSha256(payload, secret);
      const signature = `sha256=${expectedSig}`;

      const isValid = await verifyWebhookSignature(payload, signature, secret);

      expect(isValid).toBe(true);
    });

    it('should reject invalid signature', async () => {
      const payload = '{"test": "data"}';
      const secret = 'my-secret';
      const signature = 'sha256=invalid_signature_here';

      const isValid = await verifyWebhookSignature(payload, signature, secret);

      expect(isValid).toBe(false);
    });

    it('should reject signature with wrong secret', async () => {
      const payload = '{"test": "data"}';
      const correctSecret = 'correct-secret';
      const wrongSecret = 'wrong-secret';

      const expectedSig = await computeHmacSha256(payload, correctSecret);
      const signature = `sha256=${expectedSig}`;

      const isValid = await verifyWebhookSignature(payload, signature, wrongSecret);

      expect(isValid).toBe(false);
    });

    it('should reject signature with wrong format', async () => {
      const payload = '{"test": "data"}';
      const secret = 'my-secret';

      // Missing sha256= prefix
      const signature = 'abcdef123456';

      const isValid = await verifyWebhookSignature(payload, signature, secret);

      expect(isValid).toBe(false);
    });

    it('should reject missing signature', async () => {
      const payload = '{"test": "data"}';
      const secret = 'my-secret';

      const isValid = await verifyWebhookSignature(payload, null, secret);

      expect(isValid).toBe(false);
    });

    it('should reject signature with wrong algorithm', async () => {
      const payload = '{"test": "data"}';
      const secret = 'my-secret';

      const signature = 'sha1=abcdef123456';

      const isValid = await verifyWebhookSignature(payload, signature, secret);

      expect(isValid).toBe(false);
    });
  });
});
