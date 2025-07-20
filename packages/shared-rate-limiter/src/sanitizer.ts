/**
 * HTML sanitization utility to prevent XSS attacks
 * 
 * This is a simple implementation. In a production environment,
 * you would typically use a library like DOMPurify or sanitize-html.
 */
export function sanitizeHtml(input: string): string {
  if (!input || typeof input !== 'string') {
    return input;
  }
  
  // Replace HTML special characters with their entity equivalents
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * URL sanitization to prevent javascript: protocol and other potentially dangerous URLs
 */
export function sanitizeUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    return url;
  }
  
  // Trim the URL
  let sanitized = url.trim();
  
  // Check for javascript: protocol and other dangerous protocols
  const dangerousProtocols = [
    'javascript:',
    'data:',
    'vbscript:',
    'file:',
    'about:',
    'blob:'
  ];
  
  // Convert to lowercase for case-insensitive comparison
  const lowerUrl = sanitized.toLowerCase();
  
  // Check if the URL starts with any dangerous protocol
  for (const protocol of dangerousProtocols) {
    if (lowerUrl.startsWith(protocol)) {
      // Replace with a safe protocol or return empty string
      return 'https://example.com/invalid-url';
    }
  }
  
  return sanitized;
}

/**
 * SQL injection prevention for raw SQL inputs
 * Note: This is a basic implementation. In practice, always use parameterized queries.
 */
export function sanitizeSql(input: string): string {
  if (!input || typeof input !== 'string') {
    return input;
  }
  
  // Replace single quotes with double single quotes (SQL escape)
  return input.replace(/'/g, "''");
}

/**
 * Sanitize a filename to prevent directory traversal attacks
 */
export function sanitizeFilename(filename: string): string {
  if (!filename || typeof filename !== 'string') {
    return filename;
  }
  
  // Remove path traversal sequences and invalid characters
  return filename
    .replace(/\.\.\//g, '') // Remove "../"
    .replace(/\.\.\\/g, '') // Remove "..\"
    .replace(/[\/\\]/g, '') // Remove slashes
    .replace(/[<>:"|?*]/g, ''); // Remove invalid filename characters
}

/**
 * Validate and sanitize an email address
 */
export function sanitizeEmail(email: string): string {
  if (!email || typeof email !== 'string') {
    return email;
  }
  
  // Basic email validation regex
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  
  if (!emailRegex.test(email)) {
    return ''; // Return empty string for invalid emails
  }
  
  return email.trim().toLowerCase();
}