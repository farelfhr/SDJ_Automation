AI Provider Configuration
========================

This folder contains AI model configurations for SDJ Assistant.

## Providers

### Groq (Primary)
- Model: llama-3.3-70b-versatile
- Use case: Fast command interpretation
- Rate limit: 30 requests/minute

### Google Gemini (Fallback)
- Model: gemini-2.0-flash
- Use case: Alternative interpretation
- Rate limit: 15 requests/minute

### Zhipu GLM (Secondary Fallback)
- Model: glm-4-flash
- Use case: Secondary fallback
- Rate limit: 60 requests/minute

## Configuration

AI settings are managed via environment variables:

```
GROQ_API_KEY=gsk_...
GEMINI_API_KEY=AQ.0...
GLM_API_KEY=nvapi-...

AI_QUOTA_USER_PER_MINUTE=5
AI_QUOTA_USER_PER_DAY=50
ENABLE_AI_INTERPRETATION=true
```
