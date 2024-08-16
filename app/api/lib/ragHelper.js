// /pages/api/lib/ragHelper.js
import { PineconeClient } from '@pinecone-database/client';
import OpenAI from 'openai';

export async function getRAGContext(resumeText) {
  const pinecone = new PineconeClient();
  await pinecone.init({
    apiKey: process.env.PINECONE_API_KEY,
    environment: process.env.PINECONE_ENV,
  });

  const index = pinecone.Index('resume-index');
  const queryResponse = await index.query({
    vector: resumeText, // Convert resume text to a vector
    topK: 5,            // Retrieve top 5 relevant documents
  });

  return queryResponse.matches.map((match) => match.text).join(' ');
};

export async function generateFeedback(resumeText, context) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: resumeText },
    { role: 'assistant', content: context },
  ];

  const response = await openai.chat.completions.create({
    messages,
    model: 'gpt-4',
  });

  return response.choices[0].message.content;
};
