import { ERROR_MESSAGES } from '../constants.js';

/**
 * Validator utility for webhook signature verification
 * Implements HMAC-SHA256 signature verification with constant-time comparison
 */

/**
 * Verify GitHub webhook signature using HMAC-SHA256
 * @param {string} payload - Raw request body as string
 * @param {string} signature - X-Hub-Signature-256 header value (format: sha256=<hex>)
 * @param {string} secret - Webhook secret for this repository
 * @returns {Promise<boolean>} True if signature is valid
 */
export async function verifyWebhookSignature(payload, signature, secret) {
  if (!signature) {
    return false;
  }

  // GitHub signature format: sha256=<hex_digest>
  const signatureParts = signature.split('=');
  if (signatureParts.length !== 2 || signatureParts[0] !== 'sha256') {
    return false;
  }

  const providedSignature = signatureParts[1];

  // Compute expected signature using HMAC-SHA256
  const expectedSignature = await computeHmacSha256(payload, secret);

  // Use constant-time comparison to prevent timing attacks
  return constantTimeCompare(providedSignature, expectedSignature);
}

/**
 * Compute HMAC-SHA256 signature
 * @param {string} payload - Data to sign
 * @param {string} secret - Secret key
 * @returns {Promise<string>} Hex-encoded signature
 */
export async function computeHmacSha256(payload, secret) {
  // Encode the secret and payload as Uint8Array
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const payloadData = encoder.encode(payload);

  // Import the secret as a CryptoKey
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  // Sign the payload
  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, payloadData);

  // Convert to hex string
  return bufferToHex(signatureBuffer);
}

/**
 * Convert ArrayBuffer to hex string
 * @param {ArrayBuffer} buffer - Buffer to convert
 * @returns {string} Hex-encoded string
 */
function bufferToHex(buffer) {
  const byteArray = new Uint8Array(buffer);
  return Array.from(byteArray)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Constant-time string comparison to prevent timing attacks
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {boolean} True if strings are equal
 */
export function constantTimeCompare(a, b) {
  // If lengths differ, we still need to do a constant-time operation
  // to avoid leaking length information
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  // Use the longer length to ensure constant time regardless of input
  const maxLength = Math.max(a.length, b.length);
  
  // Pad both strings to the same length (this doesn't leak info since we use maxLength)
  const paddedA = a.padEnd(maxLength, '\0');
  const paddedB = b.padEnd(maxLength, '\0');

  let result = 0;

  // XOR each character code - any difference will set bits in result
  for (let i = 0; i < maxLength; i++) {
    result |= paddedA.charCodeAt(i) ^ paddedB.charCodeAt(i);
  }

  // Also check if original lengths were equal
  // This is done after the loop to maintain constant time
  result |= a.length ^ b.length;

  return result === 0;
}

/**
 * Validation result object
 */
export class ValidationResult {
  constructor(isValid, error = null) {
    this.isValid = isValid;
    this.error = error;
  }

  static success() {
    return new ValidationResult(true);
  }

  static failure(error) {
    return new ValidationResult(false, error);
  }
}

/**
 * Validate webhook request signature
 * @param {Request} request - Incoming request object
 * @param {string} body - Request body as string
 * @param {string} secret - Webhook secret
 * @param {Logger} logger - Logger instance
 * @returns {Promise<ValidationResult>} Validation result
 */
export async function validateWebhookRequest(request, body, secret, logger) {
  // Extract signature header
  const signature = request.headers.get('X-Hub-Signature-256');

  if (!signature) {
    logger.warn('Missing signature header', {
      header: 'X-Hub-Signature-256',
    });
    return ValidationResult.failure(ERROR_MESSAGES.MISSING_SIGNATURE);
  }

  // Verify signature
  const isValid = await verifyWebhookSignature(body, signature, secret);

  if (!isValid) {
    logger.warn('Signature verification failed', {
      providedSignature: signature.substring(0, 20) + '...', // Log partial for debugging
    });
    return ValidationResult.failure(ERROR_MESSAGES.INVALID_SIGNATURE);
  }

  logger.debug('Signature verification successful');
  return ValidationResult.success();
}
