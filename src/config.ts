import * as variables from "@spinframework/spin-variables";

export interface Config {
  decisionModel: DecisionModel;
  llm: LargeLanguageModels;

}

export interface DecisionModel {
  endpoint: string;
  apiKey: string;
  name: string
}

export interface LargeLanguageModels {
  endpoint: string;
  apiKey: string;
  fallbackName: string;
  names: string[]
}

function requireVariable(key: string): string {
  const value = variables.get(key);
  if (value === null) {
    throw new Error(`missing required variable: ${key}`);
  }
  return value;
}

export function loadConfig(): Config {
  const decisionModelApiKey = requireVariable('decision_model_api_key');
  const decisionModelEndpoint = requireVariable('decision_model_endpoint');
  const decisionModelName = requireVariable('decision_model_name');
  const llmNames = requireVariable('llm_names')
    .split(',')
    .map((model) => model.trim())
    .filter((model) => model.length > 0);
  const llmFallbackModel = requireVariable('llm_fallback_name');
  const llmEndpoint = requireVariable('llm_endpoint');
  const llmApiKey = requireVariable('llm_api_key');

  return {
    decisionModel: {
      endpoint: decisionModelEndpoint,
      apiKey: decisionModelApiKey,
      name: decisionModelName
    } as DecisionModel,
    llm: {
      endpoint: llmEndpoint,
      apiKey: llmApiKey,
      fallbackName: llmFallbackModel,
      names: llmNames
    } as LargeLanguageModels

  };
}
