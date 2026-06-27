const logger = require('../config/logger');

/**
 * Extracts structured information from an attachment (PDF or image) using Gemini Vision.
 *
 * This is a progressive enhancement — any error silently returns null so text-only
 * planning continues uninterrupted.
 *
 * @param {Array<{ base64: string, mimeType: string }>} attachments
 * @param {object} model  - Gemini model instance (passed in to avoid circular deps)
 * @param {string} requestId
 * @returns {Promise<object|null>} Extracted fields or null on any error
 */
const analyzeAttachment = async (attachments, model, requestId) => {
  try {
    // Find the first attachment that has both base64 data and a mimeType
    const first = Array.isArray(attachments)
      ? attachments.find((a) => a && a.base64 && a.mimeType)
      : null;

    if (!first) {
      logger.debug('analyzeAttachment: no valid attachment found', { requestId });
      return null;
    }

    const { base64, mimeType } = first;

    const prompt = `You are an AI assistant that extracts structured information from academic or work documents.
Analyze the provided document and extract the following fields.
Return ONLY valid JSON — no markdown, no code fences, no prose before or after the JSON.

Required JSON format:
{
  "requirements": ["<requirement>"],
  "deliverables": ["<deliverable>"],
  "deadlineHint": "<date string or null>",
  "keywords": ["<keyword>"],
  "constraints": ["<constraint>"],
  "gradingCriteria": ["<criterion>"],
  "marks": <number or null>,
  "submissionFormat": "<format string or null>",
  "importantDates": ["<date string>"],
  "referenceLinks": ["<url>"]
}

Use empty arrays [] for list fields when nothing is found. Use null for scalar fields when nothing is found.
Do not invent information — only extract what is explicitly present in the document.`;

    logger.debug('analyzeAttachment: calling Gemini Vision', { requestId, mimeType });

    const result = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType, data: base64 } },
          ],
        },
      ],
    });

    const rawText = result.response.text();

    logger.info('analyzeAttachment: raw response received', { requestId, rawText });

    const parsed = JSON.parse(rawText);
    return parsed;
  } catch (err) {
    logger.warn('analyzeAttachment: failed, falling back to text-only planning', {
      requestId,
      error: err.message,
    });
    return null;
  }
};

module.exports = { analyzeAttachment };
