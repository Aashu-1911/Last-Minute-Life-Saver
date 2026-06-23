const { GoogleGenerativeAI } = require('@google/generative-ai');

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error('GEMINI_API_KEY environment variable is not set');
}

const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const genAI = new GoogleGenerativeAI(apiKey);

const model = genAI.getGenerativeModel({ model: modelName });

module.exports = model;
