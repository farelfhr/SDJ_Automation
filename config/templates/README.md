# OpenClaw Configuration

## Webhook Setup

1. Create an OpenClaw instance at https://app.opencloud.pl
2. Configure webhook URL: `https://your-domain.com/webhook/message`
3. Set webhook secret in environment

## Environment Variables

```
OPENCLAW_WEBHOOK_SECRET=your-secret
OPENCLAW_API_KEY=your-api-key
OPENCLAW_INSTANCE_ID=your-instance-id
```

## Testing Locally

Use ngrok or similar for local development:

```bash
ngrok http 3000
```

Then configure the ngrok URL as your webhook in OpenClaw dashboard.
