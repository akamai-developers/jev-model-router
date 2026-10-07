import { Hono } from 'hono';
import { fire } from 'hono/service-worker';
import type { Context } from 'hono';
import { logger } from 'hono/logger';
import { loadConfig } from './config';
import { decideWhichModelToUse } from './decision';
import { askOllama } from './ollama';

interface RequestModel {
  prompt: string;
}


const app = new Hono();

// Logging to stdout via built-in middleware
app.use(logger());

app.post('/ask', async (c: Context) => {
  const cfg = loadConfig();
  let req: RequestModel;
  try {
    req = await c.req.json<RequestModel>();
  } catch (err) {
    return c.text(`Failed to decode request: ${err}`, 400);
  }

  let decision;
  try {
    decision = await decideWhichModelToUse(req.prompt, cfg);
  } catch (err) {
    return c.text(`Failed to decide which model to use: ${err}`, 500);
  }

  try {
    const answer = await askOllama(req.prompt, decision.model, cfg);
    return c.json({ model: decision.model, answer });
  } catch (err) {
    return c.text(`Failed to get answer from Ollama: ${err}`, 502);
  }
});

fire(app);
