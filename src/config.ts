import * as variables from "@spinframework/spin-variables";

export interface Config {
  openRouterApiKey: string;
  openRouterEndpoint: string;
  models: string[];
  fallbackModel: string;
  ollamaEndpoint: string;
  ollamaApiKey: string;
}

function requireVariable(key: string): string {
  const value = variables.get(key);
  if (value === null) {
    throw new Error(`missing required variable: ${key}`);
  }
  return value;
}

export function loadConfig(): Config {
  const openRouterApiKey = requireVariable('open_router_api_key');
  const openRouterEndpoint = requireVariable('open_router_endpoint');
  const models = requireVariable('models')
    .split(',')
    .map((model) => model.trim())
    .filter((model) => model.length > 0);
  const fallbackModel = requireVariable('fallback_model');
  const ollamaEndpoint = requireVariable('ollama_endpoint');
  const ollamaApiKey = requireVariable('ollama_api_key');

  return {
    openRouterApiKey,
    openRouterEndpoint,
    models,
    fallbackModel,
    ollamaEndpoint,
    ollamaApiKey,
  };
}
