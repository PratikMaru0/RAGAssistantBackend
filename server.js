import express from "express";
import { chat } from "./chat.js";

const app = express();
app.use(express.json());
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
