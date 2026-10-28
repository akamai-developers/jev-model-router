import { OpenRouter } from '@openrouter/sdk';
import type { Config } from './config';

export interface Decision {
  model: string;
}

function convertModelNamesToCriteria(
  models: string[],
): Record<string, string> {
  const criteria: Record<string, string> = {};
  for (const model of models) {
    criteria[model] = model;
  }
  return criteria;
}

export async function decideWhichModelToUse(
  prompt: string,
  cfg: Config,
): Promise<Decision> {
  const client = new OpenRouter({
    apiKey: cfg.decisionModel.apiKey,
    serverURL: cfg.decisionModel.endpoint,
  });

  const res = await client.alpha.decisions.create({
    decisionsRequest: {
      model: cfg.decisionModel.name,
      questions: {
        model_route: {
          type: 'choice',
          criteria: convertModelNamesToCriteria(cfg.llm.names),
          instructions:
            'Which of the following models should be used to answer the users prompt?',
        },
      },
      state: {
        user_prompt: prompt,
      },
    },
  });

  const answer = res?.answers['model_route'];
  const usage = res?.usage;
  if (!!usage) {
    console.log(`Burned ${usage.inputTokens} input and ${usage.outputTokens} output tokens (cost: \$${usage.cost?.toFixed(2)} [${usage.cost}])`)
  }
  if (answer && answer.type === 'choice') {
    let choice = answer.choice;

    if (answer.confidence !== undefined) {

      console.log(`Selected ${answer.choice} with a confidence of ${answer.confidence.toFixed(2)}`);

      if (answer.confidence < 0.6) {
        console.log(`Low confidence detected. Escalating to ${cfg.llm.fallbackName} ...`);
        choice = cfg.llm.fallbackName;
      }
    }

    return { model: choice };
  }

  if (!!cfg.llm.fallbackName) {
    return { model: cfg.llm.fallbackName };
  }

  throw new Error('no decision could be made');
}
