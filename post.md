# Build a Model Router With Jev, Spin & TypeScript

In this article, I will show you how to build a lightweight model router and run it as a single WebAssembly component with Spin. Instead of hard-coding which Large Language Model (LLM) answers which request, we'll let [Jev](https://openrouter.ai/blog/insights/what-is-jev/) make that call for us - then forward the user's prompt to the model Jev picked, running on a local [Ollama](https://ollama.com/) instance, and hand the real answer back to the caller. Along the way we'll use Jev's calibrated confidence score to build a safety net that escalates to a stronger model whenever Jev is unsure.

The whole thing is roughly a hundred lines of TypeScript. The remarkable DX provided by Spin makes the rest a breeze: a single component, deny-by-default outbound networking, and configuration you can change without re-compiling a single line of code.

## What Is Jev?

Before we route anything, let's talk about the model doing the routing.

Jev is the first _System One Model_ from TypeSafe AI. Unlike the chat models you're used to, Jev does not generate text. You hand it some unstructured state plus a typed question, and it hands back a typed, probabilistic decision your code can act on directly. TypeSafe frames it nicely: think of Jev as a frontier-intelligence function call - unstructured state in, typed decisions out.

That distinction matters more than it sounds. Because the shape of the answer is defined by _your_ schema before the call ever happens, there's nothing to parse, nothing to coerce, and no retry loop for malformed JSON. The API exposes a small set of question primitives - `choice` for categorical classification, `score` for ratings, and `noul` for yes/no probabilities. For a model router, `choice` is exactly what we need: "Given this prompt, which of my models should answer it?"

Every decision also ships with a **calibrated confidence** value. Standard LLMs are famously overconfident, even when you explicitly ask them for a probability. Jev's confidence reflects how concentrated its probability distribution is - in other words, how torn it is between the options you gave it. That single number is what turns a classifier into a router you can actually trust in production.

Best of all, Jev is available straight through OpenRouter as `typesafe/jev-1.13`. You need nothing more than an OpenRouter API key, and you're billed per input token (output is free).

## What We Will Build

Our router is a Spin application consisting of a single WebAssembly component, implemented in TypeScript. It exposes one HTTP endpoint - `POST /ask` - that accepts a user prompt, asks Jev which model should handle it, forwards the prompt to that model on Ollama, and returns the model's actual answer.

The interesting bit is the decision, but we don't stop there: once Jev has made its pick, the component calls Ollama's chat endpoint, forwards the user's prompt to the chosen model, and hands the real response straight back to the caller.

Four ingredients make it tick:

- **Spin variables** let us change the candidate models, the fallback, the Ollama endpoint, and the API keys without re-compiling.
- **The Jev decision call**, where all the magic happens.
- **A confidence-based safety net**, so a low-confidence guess never silently ends up in front of a user.
- **The Ollama call**, which forwards the prompt to the chosen model and returns a real answer.

Let me walk you through the highlights.

## Configuring the Router

Everything configurable lives in application variables, declared in the application manifest (`spin.toml`). That's the list of models Jev is allowed to choose from, a fallback model, the Ollama endpoint and its API key, and - crucially - the two precise holes we punch into Spin's deny-by-default sandbox so the component may talk to OpenRouter and our Ollama instance, and nothing else.

```toml
[variables]
open_router_api_key = { required = true, secret = true }
open_router_endpoint = { default = "https://openrouter.ai" }
ollama_endpoint = { default = "http://localhost:11434" }
ollama_api_key = { required = true, secret = true }
models = { default = "gpt-4:latest,llama3.2:1b,qwen2.5-coder:7b,deepseek-v3.2:cloud" }
fallback_model = { default = "gpt-4:latest" }

[component.jev-model-router-ts]
allowed_outbound_hosts = ["{{ open_router_endpoint }}", "{{ ollama_endpoint }}"]

[component.jev-model-router-ts.variables]
open_router_api_key = "{{ open_router_api_key }}"
ollama_endpoint = "{{ ollama_endpoint }}"
ollama_api_key = "{{ ollama_api_key }}"
models = "{{ models }}"
fallback_model = "{{ fallback_model }}"
```

Two new variables earn their place here: `ollama_endpoint` points at the Ollama instance (a plain URL like `http://localhost:11434`), and `ollama_api_key` is the secret we send along with each chat request. Adding `ollama_endpoint` to `allowed_outbound_hosts` punches a second, equally precise hole in the sandbox - the component can now reach OpenRouter for the decision and Ollama for the answer, and still nothing else.

Notice that `models` is just a comma-separated string. On the TypeScript side, a small `loadConfig` function reads each variable, splits the model list, and throws early if a required value is missing - so a misconfigured deployment fails loudly instead of halfway through a request.

**Note:** For the sake of this demonstration, the names in `models` are **hard-coded** in `spin.toml`, and every one of them must actually be served by your Ollama instance for the forwarding step to succeed. In a real-world setting you wouldn't pin them like this. You could resolve the list at compile time, or discover it in-flight by querying Ollama's own list-models endpoint (`GET /api/tags`) at runtime and feeding whatever is actually available straight into Jev's criteria - so the router can never pick a model Ollama can't serve.

## Making the Decision

This is the heart of the router, and it's shorter than you might expect. Using the OpenRouter SDK, we turn our list of candidate models into Jev's `criteria`, pose a single `choice` question, and pass the user's prompt as `state`:

```typescript
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
```

That's it. No chat history, no system prompt gymnastics, no JSON schema wrestling. We asked a typed question and we'll get a typed answer back - `answer.choice` will always be one of the models we provided, because those are the only values Jev is allowed to return.

## Building a Safety Net With Confidence

Here's where Jev earns its keep. Every answer carries a `confidence` value, and that's our signal for building a cascade: trust Jev when it's sure, and escalate to a more capable model when it isn't.

```typescript
let choice = answer.choice;

if (answer.confidence !== undefined) {
  console.log(`Confidence: ${answer.confidence.toFixed(2)}`);

  // Fall back to a more capable model if Jev is unsure
  if (answer.confidence < 0.6) {
    console.log("Low confidence detected. Escalating...");
    choice = 'opus';
  }
}
```

Pick the threshold that matches how expensive your mistakes are - a cheap internal tool can tolerate a low bar, while anything user-facing probably wants to escalate much more eagerly. And if Jev can't produce a decision at all, we quietly fall back to the configured `fallback_model` rather than failing the request.

**Note:** The confidence number is a measure of how concentrated Jev's probabilities are, not a guarantee of correctness. Treat it as a ranking signal and tune your threshold against your own traffic - calibration holds in aggregate, not on any single call.

## Forwarding the Prompt to Ollama

With a model chosen, the last step is to actually answer the user. A small `src/ollama.ts` module POSTs the prompt to Ollama's chat endpoint using the model Jev picked, and returns the generated text:

```typescript
const res = await fetch(`${cfg.ollamaEndpoint}/api/chat`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    authorization: `Bearer ${cfg.ollamaApiKey}`,
  },
  body: JSON.stringify({
    model,
    messages: [{ role: 'user', content: prompt }],
    stream: false,
  }),
});

const data = await res.json();
return data.message.content;
```

That's the whole forwarding path: one request, the chosen `model`, the user's prompt as a single message, and `stream: false` so we get the complete answer back in one shot. We pull the text out of `data.message.content` and return it - the caller never has to know which model produced it.

## Exposing It Over HTTP

The HTTP surface is deliberately thin. We use [Hono](https://hono.dev/) with Spin's service-worker adapter, read the incoming prompt, call into our decision logic, forward the prompt to the chosen model on Ollama, and return the generated answer:

```typescript
app.post('/ask', async (c: Context) => {
  const cfg = loadConfig();
  const req = await c.req.json<RequestModel>();

  const decision = await decideWhichModelToUse(req.prompt, cfg);
  const answer = await askOllama(req.prompt, decision.model, cfg);
  return c.json({ model: decision.model, answer });
});
```

Validation, error handling, and logging round it out, but the shape stays this simple. That's the point - the router is a thin, well-behaved HTTP component, Jev does the routing, and Ollama produces the answer.

## Running It Locally

Testing a Spin app on your local machine is a single command. You compile to WebAssembly and start the component while supplying your configuration, all in one go:

```bash
spin up --build \
  --variable open_router_api_key="{your_openrouter_api_key}" \
  --variable ollama_endpoint="http://localhost:11434" \
  --variable ollama_api_key="{your_ollama_api_key}"
```

Make sure your Ollama instance is running and already serving every model listed in `models` - the router can only forward to a model Ollama actually has.

Once Spin reports that your component is listening on port 3000, send it a prompt from a second terminal:

```bash
curl -iX POST \
  -d '{ "prompt": "Write a Python function to reverse a linked list" }' \
  -H 'content-type:application/json' \
  http://localhost:3000/ask
```

This time you get back a JSON payload telling you both which model Jev routed to and the answer it generated:

```json
{
  "model": "qwen2.5-coder:7b",
  "answer": "def reverse_linked_list(head):\n    prev = None\n    while head:\n        head.next, prev, head = prev, head, head.next\n    return prev"
}
```

Watch the logs, and you'll see Jev's chosen route and its confidence for every request. Send it a coding prompt and a casual chat prompt back to back, and you'll see the router hand each one to a different model - and return the answer that model produced, which is exactly the behaviour we were after.

## Get the Code

I've kept this walkthrough to the highlights on purpose - the full application, including the complete manifest, configuration loader, and decision logic, is ready for you to clone and run:

```bash
git clone https://github.com/akamai-developers/jev-model-router
```

Grab an OpenRouter API key, point the component at a running Ollama instance, drop both into the `spin up` command above, and you'll have a working model router in under a minute.

## Recap

We built a model router that:

- runs as a single WebAssembly component with Spin, inside the strict deny-by-default sandbox
- hands the routing decision to Jev, getting back a typed answer that's guaranteed to be one of our models
- uses Jev's calibrated confidence to escalate low-confidence prompts to a stronger model
- forwards the prompt to the chosen model on Ollama and returns its real answer to the caller
- is fully configurable through Spin variables, with zero re-compilation

System One Models like Jev open up a genuinely new building block: fast, typed, calibrated decisions that software can act on without parsing a single token of free-form text. Pairing that with the portability and tiny footprint of a WebAssembly component - and a real downstream model producing the answer - feels like a very natural fit.

Are you routing between models, or using Jev for something else entirely? Join the Edge Case, our developer community over on Discord, and let me know - I'm genuinely curious what you're building.
