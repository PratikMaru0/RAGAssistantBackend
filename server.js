import express from "express";
import { chat } from "./chat.js";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "node:crypto";
import multer from "multer";
import { indexTheDocument } from "./vectorEmbedding.js";
import { Pinecone } from "@pinecone-database/pinecone";

dotenv.config();

// ImageKit client-side uploads need auth params from the server.
// Implement a lightweight endpoint using Node's crypto to avoid SDK issues.
// Expose public values for the frontend to use.
const IK_PRIVATE_KEY = process.env.IMAGEKIT_PRIVATE_KEY || "";
const IK_PUBLIC_KEY = process.env.IMAGEKIT_PUBLIC_KEY || "";
const IK_URL_ENDPOINT = process.env.IMAGEKIT_URL_ENDPOINT || "";

const app = express();
app.use(express.json());
app.use(cors());
const port = 3000;
const upload = multer();

// Working fine.
app.post("/send", async (req, res) => {
  const { userQuery } = req.body;
  const respsonse = await chat(userQuery);
  res.send(respsonse);
});

// Returns auth parameters for ImageKit client-side uploads
// token + expire + signature (HMAC-SHA1 of token+expire using PRIVATE_KEY)
app.get("/imagekit-auth", (req, res) => {
  if (!IK_PRIVATE_KEY) {
    return res
      .status(500)
      .json({ error: "ImageKit PRIVATE_KEY is not configured" });
  }
  const token = crypto.randomBytes(16).toString("hex");
  const expire = Math.floor(Date.now() / 1000) + 4 * 60; // 4 mins
  const signature = crypto
    .createHmac("sha1", IK_PRIVATE_KEY)
    .update(token + expire)
    .digest("hex");

  res.json({
    token,
    expire,
    signature,
    publicKey: IK_PUBLIC_KEY,
    urlEndpoint: IK_URL_ENDPOINT,
  });
});

// Accepts a PDF upload and forwards it to ImageKit securely using server-side auth
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!IK_PRIVATE_KEY) {
      return res
        .status(500)
        .json({ error: "ImageKit PRIVATE_KEY is not configured" });
    }
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { originalname, buffer, mimetype } = req.file;
    if (mimetype !== "application/pdf") {
      return res.status(400).json({ error: "Only PDF files are allowed" });
    }

    const form = new FormData();
    // ImageKit expects either a binary file or a base64 data URI string
    const base64 = buffer.toString("base64");
    form.append("file", `data:${mimetype};base64,${base64}`);
    form.append("fileName", originalname);
    form.append("useUniqueFileName", "true");
    form.append("folder", "/RAG");

    const auth =
      "Basic " + Buffer.from(IK_PRIVATE_KEY + ":").toString("base64");
    const resp = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
      method: "POST",
      headers: {
        Authorization: auth,
      },
      body: form,
    });

    const data = await resp.json();
    if (!resp.ok) {
      return res
        .status(resp.status)
        .json({ error: data?.message || "Upload failed", details: data });
    }
    return res.json(data);
  } catch (err) {
    console.error("/upload error", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// List files in ImageKit folder /RAG for the UI
app.get("/files", async (req, res) => {
  try {
    if (!IK_PRIVATE_KEY) {
      return res
        .status(500)
        .json({ error: "ImageKit PRIVATE_KEY is not configured" });
    }

    const params = new URLSearchParams({
      path: "/RAG",
      limit: "100",
      sort: "ASC_CREATED",
    });

    const auth =
      "Basic " + Buffer.from(IK_PRIVATE_KEY + ":").toString("base64");
    const resp = await fetch(
      `https://api.imagekit.io/v1/files?${params.toString()}`,
      {
        method: "GET",
        headers: {
          Authorization: auth,
        },
      }
    );

    const data = await resp.json();
    if (!resp.ok) {
      return res
        .status(resp.status)
        .json({ error: data?.message || "List files failed", details: data });
    }

    // Normalize for UI
    const files = (Array.isArray(data) ? data : []).map((f) => ({
      id: f.fileId,
      name: f.name,
      size: f.size,
      uploadDate: f.createdAt,
      url: f.url,
      thumbnail: f.thumbnailUrl,
      fileType: f.fileType,
    }));

    return res.json({ files });
  } catch (err) {
    console.error("/files error", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

app.delete("/deleteContext", async (req, res) => {
  try {
    // Initialize Pinecone client
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    });

    const index = pinecone.index(process.env.PINECONE_INDEX_NAME);
    const namespaceList = await index.listNamespaces();

    if (namespaceList.namespaces.length === 0) {
      return res.send("No context found");
    }
    await index.namespace("__default__").deleteAll();
    return res.send("Context deleted successfully");
  } catch (err) {
    console.error("/deleteContext error", err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", message: err });
  }
});

// Used to create vector embeddings
app.post("/createVectorEmbeddings", async (req, res) => {
  try {
    const resp = await fetch("http://localhost:3000/files");
    const data = await resp.json();
    if (!resp.ok) {
      return res
        .status(resp.status)
        .json({ error: data?.error || "Failed to fetch files" });
    }

    const filesUrl = Array.isArray(data?.files)
      ? data.files.map((file) => file.url)
      : [];

    const embeddings = await indexTheDocument(filesUrl);
    return res.send("Context created successfully");
  } catch (err) {
    console.error("/createVectorEmbeddings error", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// Delete a file in ImageKit by fileId
app.delete("/files/:id", async (req, res) => {
  try {
    if (!IK_PRIVATE_KEY) {
      return res
        .status(500)
        .json({ error: "ImageKit PRIVATE_KEY is not configured" });
    }
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "Missing file id" });
    }

    const auth =
      "Basic " + Buffer.from(IK_PRIVATE_KEY + ":").toString("base64");
    const resp = await fetch(`https://api.imagekit.io/v1/files/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: auth,
      },
    });

    if (resp.status === 204) {
      return res.status(204).send();
    }
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return res
        .status(resp.status)
        .json({ error: data?.message || "Delete failed", details: data });
    }
    return res.json(data);
  } catch (err) {
    console.error("DELETE /files/:id error", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
