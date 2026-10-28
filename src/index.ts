import { Hono } from 'hono';
import { fire } from 'hono/service-worker';
import type { Context } from 'hono';
import { logger } from 'hono/logger';
import { Config, loadConfig } from './config';
import { decideWhichModelToUse } from './decision';
import { askOllama } from './ollama';

interface RequestModel {
  prompt: string;
}

const app = new Hono();

app.use(logger());

app.post('/ask', async (c: Context) => {
  let cfg: Config;
  try{
    cfg = loadConfig();
  } catch {
    c.status(500);
    return c.text("Invalid Application Configuration");
  }
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
