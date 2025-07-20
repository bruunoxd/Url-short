import { describe, it, expect } from 'vitest';
import { 
  generateShortCode, 
  validateAndSanitizeUrl, 
  isMaliciousUrl, 
  formatShortUrl
} from '../utils/urlUtils';

describe('URL Utils', () => {
  describe('generateShortCode', () => {
    it('should generate a short code of the specified length', () => {
      const code = generateShortCode('https://example.com', 7);
      expect(code).toHaveLength(7);
    });

    it('should generate different codes for different inputs', () => {
      const code1 = generateShortCode('https://example.com');
      const code2 = generateShortCode('https://example.org');
      expect(code1).not.toEqual(code2);
    });

    it('should generate consistent codes for the same input', () => {
      const code1 = generateShortCode('https://example.com');
      const code2 = generateShortCode('https://example.com');
      expect(code1).toEqual(code2);
    });

    it('should only use alphanumeric characters', () => {
      const code = generateShortCode('https://example.com');
      expect(code).toMatch(/^[0-9a-zA-Z]+$/);
    });
  });

  describe('validateAndSanitizeUrl', () => {
    it('should add https:// to URLs without protocol', () => {
      const sanitized = validateAndSanitizeUrl('example.com');
      expect(sanitized).toBe('https://example.com/');
    });

    it('should keep existing protocol if present', () => {
      const sanitized = validateAndSanitizeUrl('http://example.com');
      expect(sanitized).toBe('http://example.com/');
    });

    it('should remove hash fragments', () => {
      const sanitized = validateAndSanitizeUrl('https://example.com/page#section');
      expect(sanitized).toBe('https://example.com/page');
    });

    it('should throw an error for invalid URLs', () => {
      expect(() => validateAndSanitizeUrl('not a url')).toThrow('Invalid URL');
    });

    it('should throw an error for non-HTTP/HTTPS protocols', () => {
      expect(() => validateAndSanitizeUrl('ftp://example.com')).toThrow('URL must use HTTP or HTTPS protocol');
    });
  });

  describe('isMaliciousUrl', () => {
    it('should detect URLs with suspicious keywords', () => {
      expect(isMaliciousUrl('https://phishing-site.com')).toBe(true);
      expect(isMaliciousUrl('https://example.com/malware.exe')).toBe(true);
      expect(isMaliciousUrl('https://virus.example.com')).toBe(true);
    });

    it('should detect URLs with excessive subdomains', () => {
      expect(isMaliciousUrl('https://a.b.c.d.e.f.g.example.com')).toBe(true);
    });

    it('should pass legitimate URLs', () => {
      expect(isMaliciousUrl('https://example.com')).toBe(false);
      expect(isMaliciousUrl('https://google.com/search?q=test')).toBe(false);
      expect(isMaliciousUrl('https://sub.domain.example.com')).toBe(false);
    });
  });

  describe('formatShortUrl', () => {
    it('should format short URL with default domain', () => {
      const formatted = formatShortUrl('abc123');
      expect(formatted).toBe('https://short.ly/abc123');
    });

    it('should format short URL with custom domain', () => {
      const formatted = formatShortUrl('abc123', 'custom.domain');
      expect(formatted).toBe('https://custom.domain/abc123');
    });

    it('should handle domains with protocol', () => {
      const formatted = formatShortUrl('abc123', 'http://custom.domain');
      expect(formatted).toBe('http://custom.domain/abc123');
    });

    it('should handle domains with trailing slash', () => {
      const formatted = formatShortUrl('abc123', 'https://custom.domain/');
      expect(formatted).toBe('https://custom.domain/abc123');
    });
  });
});