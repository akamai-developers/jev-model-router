import type { Config } from './config';

interface OllamaChatRequest {
  model: string;
  messages: { role: string; content: string }[];
  stream: boolean;
}

interface OllamaChatResponse {
  message: {
    role: string;
    content: string;
  };
}

export async function askOllama(
  prompt: string,
  model: string,
  cfg: Config,
): Promise<string> {
  const body: OllamaChatRequest = {
    model,
    messages: [{ role: 'user', content: prompt }],
    stream: false,
  };

  const res = await fetch(`${cfg.ollamaEndpoint}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.ollamaApiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const details = await res.text();
    throw new Error(
      `Ollama request failed with status ${res.status}: ${details}`,
    );
  }

  const data = (await res.json()) as OllamaChatResponse;
  return data.message.content;
}
