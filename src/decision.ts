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
    apiKey: cfg.openRouterApiKey,
  });

  const res = await client.alpha.decisions.create({
    decisionsRequest: {
      model: 'typesafe/jev-1.13',
      questions: {
        model_route: {
          type: 'choice',
          criteria: convertModelNamesToCriteria(cfg.models),
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
  if (answer && answer.type === 'choice') {
    let choice = answer.choice;

    if (answer.confidence !== undefined) {
      console.log(`Confidence: ${answer.confidence.toFixed(2)}`);

      if (answer.confidence < 0.6) {
        console.log("Low confidence detected. Escalating to 'opus'...");
        choice = 'opus';
      }
    }

    return { model: choice };
  }

  if (cfg.fallbackModel !== '') {
    return { model: cfg.fallbackModel };
  }

  throw new Error('no decision could be made');
}
