import Groq from "groq-sdk";
import dotenv from "dotenv";
import { Pinecone } from "@pinecone-database/pinecone";
import { GoogleGenerativeAI } from "@google/generative-ai";
dotenv.config();

// Initialize clients
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_EMBEDDING_API_KEY);

const index = pc.index(process.env.PINECONE_INDEX_NAME);

// Function to embed query text
async function embedQuery(text) {
  const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
  const result = await model.embedContent({
    content: { parts: [{ text }] },
    taskType: "RETRIEVAL_QUERY",
  });
  return result.embedding.values;
}

// Function to retrieve relevant context
async function retrieveContext(query, topK = 3) {
  const queryVector = await embedQuery(query);

  const response = await index.query({
    topK,
    vector: queryVector,
    includeMetadata: true,
  });

  // Merging all the top 3 relevant results context.
  return response.matches.map((match) => match.metadata.text).join("\n\n");
}

const messages = [
  {
    role: "system",
    content: `You are a helpful assistant for question answering tasks. Use the provided context to answer questions accurately. If the context doesn't contain the answer, say so. Always return normal text - no tables or code blocks.
  current date and time : ${new Date().toUTCString()}`,
  },
];

export async function chat(userQuery) {
  // Retrieval - get relevant context from Pinecone
  const context = await retrieveContext(userQuery);

  // Create messages with context for this specific query
  const messagesWithContext = [
    messages[0], // System message
    {
      role: "user",
      content: `Context: ${context}\n\nQuestion: ${userQuery}`,
    },
  ];

  const completion = await groq.chat.completions.create({
    model: "openai/gpt-oss-20b",
    messages: messagesWithContext,
  });
  console.log("Assistant: ", completion.choices[0]?.message?.content);
  messages.push({
    role: "assistant",
    content: completion.choices[0]?.message?.content,
  });
  return completion.choices[0]?.message?.content;
}
