---
name: multi-llm-deliberation
description: Get multi-model consensus on this code review
type: smart-action
context: review
metadata:
  emoji: "🧠"
  author: plannotator
---

Run a multi-LLM deliberation on this code review. Execute the council script to get independent perspectives from 5 AI models (Gemini, Grok, GPT-4.1, DeepSeek, Mistral), then peer-rank and synthesize a consensus.

Focus the deliberation on:
- Are there security or correctness issues?
- Is the approach idiomatic and maintainable?
- What would each model flag as the highest-priority concern?

Run: `python3 skills/multi-llm-deliberation/council.py --json "Review this code diff for correctness, security, and maintainability issues. Identify the most critical concerns: <paste diff summary>"`

Present the consensus answer and any significant disagreements between models.
