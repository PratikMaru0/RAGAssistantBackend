import express from "express";
import { chat } from "./chat.js";
import cors from "cors";

const app = express();
app.use(express.json());
app.use(cors());
const port = 3000;

// Working fine.
app.post("/send", async (req, res) => {
  const { userQuery } = req.body;
  const respsonse = await chat(userQuery);
  res.send(respsonse);
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
