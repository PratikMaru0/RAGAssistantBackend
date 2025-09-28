import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import createEmbedding from "./embed.js";
import { WebPDFLoader } from "@langchain/community/document_loaders/web/pdf";

export async function indexTheDocument(filesUrl) {
  let finalContent = "";

  // Load and extract text from each remote PDF URL
  for (let i = 0; i < filesUrl.length; i++) {
    const url = filesUrl[i];
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        console.error(`Failed to fetch PDF: ${url} status=${resp.status}`);
        continue;
      }
      const arrayBuffer = await resp.arrayBuffer();
      const blob = new Blob([arrayBuffer], { type: "application/pdf" });

      const loader = new WebPDFLoader(blob, { splitPages: false });
      const docs = await loader.load();
      if (Array.isArray(docs) && docs.length) {
        finalContent += docs.map((d) => d.pageContent || "").join("\n") + "\n";
      }
    } catch (err) {
      console.error(`Error loading PDF from URL: ${url}`, err);
    }
  }

  // If no text was extracted, skip embedding to avoid empty-batch errors
  if (!finalContent.trim()) {
    console.warn("No text extracted from PDFs; skipping embedding.");
    return [];
  }

  // Chunk the aggregated text
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 100,
  });
  const texts = await textSplitter.splitText(finalContent);

  // Generate vector embeddings and store in Pinecone (via createEmbedding)
  const embeddings = await createEmbedding(texts);
  return embeddings;
}
