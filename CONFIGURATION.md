# API Configuration Guide

This document explains how to configure API keys and settings for the Python Test application.

## Configuration Methods

The application supports two configuration methods:

### 1. Environment Variables (Recommended for Development)

Create a `.env.local` file in the project root directory and fill in your API keys:

```bash
# Copy .env.example to .env.local and edit it
cp .env.example .env.local
```

Then edit `.env.local` with your actual API keys.

### 2. Runtime Configuration (User Interface)

You can also configure API keys through the Settings UI in the application. These settings are saved to `localStorage` and persist across sessions.

## Priority Order

1. **Runtime Settings** (localStorage) - Highest priority, user-specific
2. **Environment Variables** (.env.local) - Build-time defaults
3. **Built-in Defaults** - Fallback values

## Available Configuration Options

| Variable | Description | Example |
|----------|-------------|---------|
| `DEEPSEEK_API_KEY` | DeepSeek API Key | `sk-xxxxx` |
| `QWEN_API_KEY` | Qwen (Tongyi Qianwen) API Key | `sk-xxxxx` |
| `ZHIPU_API_KEY` | Zhipu AI API Key | `sk-xxxxx` |
| `MOONSHOT_API_KEY` | Moonshot API Key | `sk-xxxxx` |
| `BAICHUAN_API_KEY` | Baichuan API Key | `sk-xxxxx` |
| `HUNYUAN_API_KEY` | HunYuan API Key (for OpenRouter) | `sk-xxxxx` |
| `ERNIE_API_KEY` | ERNIE Bot API Key (for OpenRouter) | `sk-xxxxx` |
| `OPENROUTER_API_KEY` | OpenRouter API Key | `sk-xxxxx` |
| `DEFAULT_OPENROUTER_MODEL` | Default OpenRouter model | `openai/gpt-4o` |
| `CUSTOM_API_ENDPOINT` | Custom API endpoint URL | `https://api.example.com/v1` |
| `CUSTOM_API_KEY` | Custom API key | `sk-xxxxx` |
| `DEFAULT_AI_MODEL` | Default AI model | `deepseek` |

## First-Time Setup

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Edit `.env.local` with your API keys

3. Start the application:
   ```bash
   npm run dev
   ```

4. The application will use your configured API keys automatically

## Updating Configuration

- **For development**: Update `.env.local` and restart the development server
- **For production builds**: Update `.env.local` before building, or use the Settings UI after deployment
- **For end users**: Use the Settings UI to configure API keys (saved to localStorage)

## Security Notes

- Never commit `.env.local` to version control
- The `.env.local` file is automatically ignored by git (added to `.gitignore`)
- API keys configured via UI are stored in browser localStorage and are not shared with the server

## Troubleshooting

- If API keys are not working, check the browser console for errors
- Ensure you're using the correct API key format for each service
- Some services may require specific model names or additional configuration