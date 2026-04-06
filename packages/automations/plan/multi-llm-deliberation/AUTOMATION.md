---
name: multi-llm-deliberation
description: Get consensus from multiple AI models on this plan
type: smart-action
context: plan
metadata:
  emoji: "🧠"
  author: plannotator
---

Run a multi-LLM deliberation on this plan. Execute the council script to get independent perspectives from 5 AI models (Gemini, Grok, GPT-4.1, DeepSeek, Mistral), then peer-rank and synthesize a consensus.

Focus the deliberation on:
- Is this the right architectural approach?
- Are there simpler alternatives?
- What edge cases or failure modes are missing?
- What would each model do differently?

Run: `python3 skills/multi-llm-deliberation/council.py --json "Review this implementation plan and identify the strongest approach, missing considerations, and simpler alternatives: <paste plan summary>"`

Present the consensus answer and any significant disagreements between models.
