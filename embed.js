import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import { Pinecone } from "@pinecone-database/pinecone";

dotenv.config();

// Initialize the GoogleGenerativeAI client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_EMBEDDING_API_KEY);

// Initialize Pinecone client
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});

const index = pinecone.index(process.env.PINECONE_INDEX_NAME);

// Using Gemini API keys which have 768 dimensions
async function createEmbedding(document) {
  // 'document' is your array of text chunks
  try {
    // Access the embedding model
    const model = genAI.getGenerativeModel({ model: "text-embedding-004" });

    console.log("Creating embeddings in a single batch, please wait...");

    // 1. Map the input array to the required request format
    const requests = document.map((text) => ({
      content: { parts: [{ text: text }] },
      taskType: "RETRIEVAL_DOCUMENT",
    }));

    // 2. Call the batch method with all requests at once
    const result = await model.batchEmbedContents({ requests: requests });

    // 3. The result contains a list of all embeddings
    const finalVectorEmbeddings = result.embeddings.map(
      (embedding) => embedding.values
    );

    console.log("Total embeddings created:", finalVectorEmbeddings.length);

    // 4. Store embeddings in Pinecone
    console.log("Storing embeddings in Pinecone...");
    const vectors = finalVectorEmbeddings.map((embedding, i) => ({
      id: `doc_${i}`, // Unique ID for each vector
      values: embedding,
      metadata: {
        text: document[i], // Store the original text for retrieval
        chunkIndex: i,
      },
    }));

    await index.namespace("__default__").deleteAll();

    // Upload to Pinecone in batches of 100 (Pinecone recommendation)
    const batchSize = 100;
    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = vectors.slice(i, i + batchSize);
      await index.upsert(batch);
      console.log(
        `Uploaded batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(
          vectors.length / batchSize
        )}`
      );
    }

    console.log("All embeddings stored successfully in Pinecone!");
    return finalVectorEmbeddings;
  } catch (error) {
    console.error("An error occurred during batch embedding:", error);
  }
}

export default createEmbedding;
