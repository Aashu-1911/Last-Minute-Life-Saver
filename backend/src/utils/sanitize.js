const INJECTION_PATTERNS = [
  /ignore previous instructions/gi,
  /you are now/gi,
  /disregard/gi,
  /system:/gi,
];

/**
 * Sanitizes a task title for safe use in AI prompts.
 * - Strips control characters and non-printable characters
 * - Removes known prompt-injection phrases (case-insensitive)
 * - Trims whitespace
 * @param {string} title - Raw user-supplied title
 * @returns {string} Cleaned title (may be empty — caller must check)
 */
const sanitizeTitle = (title) => {
  // Strip control characters (0x00–0x1F, 0x7F) and non-printable characters
  let cleaned = title.replace(/[\x00-\x1F\x7F-\x9F]/g, '');

  // Remove injection phrases
  for (const pattern of INJECTION_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }

  return cleaned.trim();
};

module.exports = { sanitizeTitle };
