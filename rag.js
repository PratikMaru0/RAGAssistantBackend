import { indexTheDocument } from "./prepare.js";
import fs from "fs";

/**
* Impletmentation plan 

Stage 1 Indexing 
    1. 🟢 Load the document - pdf, text 
    2. 🟢 Chunk the document 
    3. 🟢 Generate vector embeddings 
    4. 🟢 Store in vector database 

Stage 2 Using the chatbot 
    1. 🟢 Setup LLM 
    2. Add retrieval logic 
    3. Pass input + relevent information 
    4. Generate and return response 

 **/

const content = await indexTheDocument();

fs.writeFileSync("output.txt", JSON.stringify(content, null, 2));
