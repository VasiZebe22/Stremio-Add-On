# Building a Stremio AI Subtitle Translator Add-on

## Overview

This document provides comprehensive instructions for developing a Stremio add-on that automatically translates subtitles using AI, similar to the commercial "Subtito" add-on but offered for free.

## What is This Add-on?

This add-on enhances Stremio's subtitle capabilities by:

1. Searching for existing subtitles from various providers
2. When subtitles aren't available in the user's preferred language, using AI (Google's Gemini models) to translate from a source language
3. Delivering the translated subtitles seamlessly within Stremio's interface
4. Caching translations to improve performance and reduce API costs

## Why Build This?

- **Language Accessibility**: Makes content accessible in languages that don't have official subtitles
- **Learning Tool**: Great for language learners who want content in specific languages
- **Global Content**: Enables global enjoyment of content regardless of subtitle availability
- **Free Alternative**: Provides functionality similar to paid services

## Technical Overview

### Architecture

The add-on follows the standard Stremio add-on architecture but with specific components for subtitle processing and AI translation:

```
subtito-free/
├── server.js             # Main entry point
├── addon.js              # Core add-on logic
├── manifest.json         # Add-on manifest
├── lib/
│   ├── subtitles.js      # Subtitle handling functions
│   ├── translation.js    # AI translation service
│   └── utils.js          # Utility functions
├── cache/                # Directory for caching translations
└── .env                  # Environment variables
```

### Key Components

1. **Subtitle Handler** (`lib/subtitles.js`)
   - Searches for subtitles from external providers (OpenSubtitles, etc.)
   - Manages subtitle storage and retrieval
   - Selects the best subtitle for translation when needed

2. **Translation Service** (`lib/translation.js`)
   - Parses and processes subtitle files (SRT format)
   - Calls Google's Gemini API to translate subtitle content
   - Handles batched translation to optimize API usage
   - Caches translated subtitles to reduce costs

3. **Core Add-on Logic** (`addon.js`)
   - Implements the Stremio add-on protocol
   - Handles subtitle requests from Stremio
   - Orchestrates the subtitle search and translation process

## Setup Instructions

### 1. Prerequisites

- Node.js (v14 or higher)
- A Google Gemini API key
- An OpenSubtitles.com API key

### 2. API Keys

#### Google Gemini API Key
1. Create an account at [Google AI](https://ai.google.dev/)
2. Generate an API key from your account dashboard
3. Add it to your `.env` file as `GEMINI_API_KEY`

#### OpenSubtitles API Key
1. Create an account at [OpenSubtitles.com](https://www.opensubtitles.com)
2. Subscribe to their API service (they offer various plans including a free tier)
3. Generate an API key from your account dashboard
4. Add it to your `.env` file as `OPENSUBTITLES_API_KEY`

### 3. Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/subtito-free.git
cd subtito-free

# Install dependencies
npm install

# Create .env file and add your API keys
cp env-file.sh .env
# Edit .env and add your API keys
```

### 4. Running the Add-on

```bash
# Start the add-on
npm start
```

The add-on will be available at `http://localhost:7000/manifest.json`

### 5. Installing in Stremio

1. Open Stremio
2. Go to Add-ons
3. Click "Add Add-on"
4. Enter: `http://localhost:7000/manifest.json`
5. Click Install

## Usage

Once installed, the add-on will automatically:

1. Search for subtitles when you play a video
2. If subtitles in your preferred language aren't available, it will translate existing subtitles
3. The translated subtitles will appear in your subtitle selection menu with a 🔹 prefix

## Development Notes

### OpenSubtitles API

The add-on uses the OpenSubtitles.com API to search for and download subtitles. The API has the following limitations:

- Free tier: Limited to 10 downloads per day
- Basic tier ($5/month): 50 downloads per day
- Plus tier ($10/month): 1000 downloads per day

### Google Gemini API

The add-on uses Google's Gemini models for translation. Be aware of the following:

- API usage is billed based on token count
- The add-on implements batching to optimize API calls
- Translations are cached to reduce costs

## Deployment

For public access, deploy to a hosting service:

### Heroku Deployment
```bash
# Initialize Git repository
git init
git add .
git commit -m "Initial commit"

# Create Heroku app
heroku create your-addon-name
heroku config:set GEMINI_API_KEY=your_gemini_api_key
heroku config:set OPENSUBTITLES_API_KEY=your_opensubtitles_api_key
heroku config:set BASE_URL=https://your-addon-name.herokuapp.com

# Deploy
git push heroku main
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Stremio team for their excellent platform and add-on SDK
- OpenSubtitles.com for providing subtitle data
- Google for their powerful language models
