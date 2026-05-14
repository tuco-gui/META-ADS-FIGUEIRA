import { createApp } from "./app.js";
import { env } from "./config/env.js";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`Meta Ads OpenAI Assistant API listening on http://localhost:${env.PORT}`);
});
