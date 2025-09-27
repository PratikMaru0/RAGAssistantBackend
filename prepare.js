import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import fs from "fs";
import path from "path";
import createEmbedding from "./embed.js";

const folderPath = "./companyDocs";

function getAllFilesInFolder(folderPath) {
  return fs.readdirSync(folderPath);
}

export async function indexTheDocument() {
  const filesName = getAllFilesInFolder(folderPath);
  let finalContent = "";

  // 1. Load the document - pdf, text
  // Loop through all files and load them and then returning whole content in single string
  for (let i = 0; i < filesName.length; i++) {
    const filePath = path.join(folderPath, filesName[i]);
    const loader = new PDFLoader(filePath, { splitPages: false });
    const doc = await loader.load();
    finalContent += doc[0].pageContent + "\n";
  }

  // 2. Chunk the document
  const textSplitter = new RecursiveCharacterTextSplitter({
    // Represents the size of each chunk of text in characters.
    // Chunks will be split into blocks of this size before being processed.
    chunkSize: 500, // Maximum text chunk size in characters.
    chunkOverlap: 100, // Number of characters to overlap between chunks.

    // Note :- 100 and 500 are best metrics.
  });
  const texts = await textSplitter.splitText(finalContent);

  // 3. Generate vector embeddings and store in Pinecone
  const embeddings = await createEmbedding(texts);

  return embeddings;
}
