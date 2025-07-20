import { createHash } from 'crypto';
import { URL } from 'url';

/**
 * Base62 character set for short code generation
 * Using alphanumeric characters (0-9, a-z, A-Z) for readability and URL safety
 */
const BASE62_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const BASE = BASE62_CHARS.length;

/**
 * Default short code length
 */
const DEFAULT_CODE_LENGTH = 7;

/**
 * Maximum number of collision resolution attempts
 */
const MAX_COLLISION_ATTEMPTS = 5;

/**
 * Generate a unique short code using base62 encoding
 * 
 * @param input - Input string to encode (usually URL + timestamp + user ID)
 * @param length - Length of the short code to generate
 * @returns Base62 encoded short code
 */
export function generateShortCode(input: string, length: number = DEFAULT_CODE_LENGTH): string {
  // Create SHA-256 hash of the input
  const hash = createHash('sha256').update(input).digest('hex');
  
  // Convert the first 10 characters of the hash to a number
  const num = parseInt(hash.substring(0, 10), 16);
  
  // Convert to base62
  let shortCode = '';
  let n = num;
  
  // Generate at least 'length' characters
  while (shortCode.length < length) {
    shortCode = BASE62_CHARS[n % BASE] + shortCode;
    n = Math.floor(n / BASE);
    
    // If we've exhausted the number, use more characters from the hash
    if (n === 0 && shortCode.length < length) {
      const nextPart = hash.substring(shortCode.length * 2, shortCode.length * 2 + 10);
      n = parseInt(nextPart, 16);
    }
  }
  
  // Ensure exactly 'length' characters by truncating if necessary
  return shortCode.substring(0, length);
}

/**
 * Generate a unique short code with collision detection
 * 
 * @param originalUrl - Original URL to shorten
 * @param userId - User ID for uniqueness
 * @param length - Length of the short code
 * @param isAvailableCallback - Function to check if a code is available
 * @returns Promise resolving to a unique short code
 */
export async function generateUniqueShortCode(
  originalUrl: string,
  userId: string,
  length: number = DEFAULT_CODE_LENGTH,
  isAvailableCallback: (code: string) => Promise<boolean> = async () => true
): Promise<string> {
  // First attempt with just the URL and user ID
  const baseInput = `${originalUrl}|${userId}`;
  let shortCode = generateShortCode(baseInput, length);
  
  // Check if the code is available
  if (await isAvailableCallback(shortCode)) {
    return shortCode;
  }
  
  // Handle collisions by adding timestamp and attempt number
  for (let attempt = 1; attempt <= MAX_COLLISION_ATTEMPTS; attempt++) {
    const timestamp = Date.now();
    const input = `${baseInput}|${timestamp}|${attempt}`;
    shortCode = generateShortCode(input, length);
    
    if (await isAvailableCallback(shortCode)) {
      return shortCode;
    }
  }
  
  // If we still have collisions, increase the length
  return generateUniqueShortCode(originalUrl, userId, length + 1, isAvailableCallback);
}

/**
 * Validate and sanitize a URL
 * 
 * @param urlString - URL string to validate
 * @returns Sanitized URL string or throws an error if invalid
 */
export function validateAndSanitizeUrl(urlString: string): string {
  try {
    // Check if the URL has a protocol, add https:// if missing
    if (!urlString.match(/^[a-zA-Z]+:\/\//)) {
      urlString = `https://${urlString}`;
    }
    
    // Parse the URL to validate it
    const url = new URL(urlString);
    
    // Ensure the URL has a valid protocol (http or https)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('URL must use HTTP or HTTPS protocol');
    }
    
    // Ensure the URL has a hostname
    if (!url.hostname) {
      throw new Error('URL must have a valid hostname');
    }
    
    // Sanitize: remove fragments like #section
    url.hash = '';
    
    // Return the sanitized URL
    return url.toString();
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Invalid URL: ${error.message}`);
    }
    throw new Error('Invalid URL');
  }
}

/**
 * Check if a URL is potentially malicious
 * 
 * @param url - URL to check
 * @returns True if the URL is potentially malicious
 */
export function isMaliciousUrl(url: string): boolean {
  // Convert to lowercase for case-insensitive matching
  const lowercaseUrl = url.toLowerCase();
  
  // List of suspicious patterns
  const suspiciousPatterns = [
    /phish/i,
    /malware/i,
    /virus/i,
    /trojan/i,
    /hack/i,
    /exploit/i,
    /attack/i,
    /scam/i,
    /fraud/i,
  ];
  
  // Check for suspicious patterns
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(lowercaseUrl)) {
      return true;
    }
  }
  
  // Check for excessive subdomains (potential phishing)
  const subdomainCount = (lowercaseUrl.match(/\./g) || []).length;
  if (subdomainCount > 5) {
    return true;
  }
  
  // This is a simple check - in production, you would use more sophisticated methods
  // such as checking against URL reputation databases, domain age, etc.
  return false;
}

/**
 * Format a short URL with the base domain
 * 
 * @param shortCode - Short code to format
 * @param baseDomain - Base domain for the short URL
 * @returns Formatted short URL
 */
export function formatShortUrl(shortCode: string, baseDomain: string = process.env.SHORT_URL_DOMAIN || 'short.ly'): string {
  // Ensure the base domain has a protocol
  if (!baseDomain.startsWith('http')) {
    baseDomain = `https://${baseDomain}`;
  }
  
  // Ensure the base domain ends with a slash
  if (!baseDomain.endsWith('/')) {
    baseDomain = `${baseDomain}/`;
  }
  
  return `${baseDomain}${shortCode}`;
}