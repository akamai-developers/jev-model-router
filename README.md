# Jev Model Router

A lightweight model router built as a single WebAssembly component with [Spin](https://spinframework.dev/) and TypeScript.

It exposes a single HTTP endpoint (`POST /ask`). For each incoming prompt it asks [Jev](https://openrouter.ai/blog/insights/what-is-jev/) (TypeSafe's decision model, via OpenRouter) which model should handle the request, forwards the prompt to that model on an [Ollama](https://ollama.com/) instance, and returns the generated answer. Jev's calibrated confidence score is used as a safety net to escalate low-confidence prompts to a stronger model.

> 📝 This sample accompanies the blog post [Build a Model Router with Jev, Spin & TypeScript](https://developers.akamai.com/blog/build-a-model-router-with-jev-spin-and-typescript/).

## Prerequisites

- [Spin CLI](https://spinframework.dev/v4/install) (v3 or newer)
- [Node.js](https://nodejs.org/) (v24 or newer)
- An [OpenRouter](https://openrouter.ai/) API key (to reach Jev)
- A running [Ollama](https://ollama.com/) instance serving the models listed in the `models` variable

## Configuration

The application is configured through Spin variables in [`spin.toml`](./spin.toml):

| Variable | Description |
| -------- | ----------- |
| `decition_model_api_key` | API key used to call Jev through OpenRouter (secret) |
| `decision_model_endpoint` | OpenRouter base URL (default: `https://openrouter.ai`) |
| `decision_model_name` | Decision Model name (default: `typesafe/jev-1.13`) |
| `llm_endpoint` | Base URL of your Ollama instance |
| `llm_api_key` | API key sent to Ollama (secret) |
| `llm_names` | Comma-separated list of models Jev may route to (default: see below table) |
| `llm_fallback_name` | Model used when Jev cannot make a decision (default: `gpt-4:latest`) |

The default value for `llm_names` is `gpt-4:latest,llama3.2:1b,qwen2.5-coder:7b,deepseek-v4-flash:cloud,deepseek-v3.2:cloud,qwen3.5:4b`

> **Note:** The model names in `models` are hard-coded for demonstration purposes. Every name must be served by your Ollama instance.

## Build & Run

Build and start the component locally, supplying the required secrets:

```bash
spin up --build \
  --variable decition_model_api_key="{your_openrouter_api_key}" \
  --variable llm_endpoint="https://my-ollama:8080" \
  --variable llm_api_key="{your_ollama_api_key}"
```

Spin compiles the TypeScript to WebAssembly and starts listening on port `3000`. Send it a prompt from another terminal:

```bash
curl -iX POST \
  -d '{ "prompt": "Write a Python function to reverse a linked list" }' \
  -H 'content-type:application/json' \
  http://localhost:3000/ask
```


```bash
curl -iX POST \
  -d '{ "prompt": "Write a poem about WebAssembly in priate style" }' \
  -H 'content-type:application/json' \
  http://localhost:3000/ask
```
