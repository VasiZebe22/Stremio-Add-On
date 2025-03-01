#!/usr/bin/env node

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { networkInterfaces } = require('os');
require('dotenv').config();
const axios = require('axios');
const util = require('util');

// Import the addon interface only after dotenv is configured
const addonInterface = require('./addon');
const subtitleService = require('./lib/subtitles');
const translationService = require('./lib/translation');

// Load environment variables
if (!process.env.GEMINI_API_KEY) {
  console.warn('Warning: GEMINI_API_KEY not found in environment variables');
}

if (!process.env.OPENSUBTITLES_API_KEY) {
  console.warn('Warning: OPENSUBTITLES_API_KEY not found in environment variables');
}

const app = express();
const port = process.env.PORT || 7000;

// Add file-based logging
const logFile = fs.createWriteStream(path.join(__dirname, 'server.log'), { flags: 'a' });

// Override console.log and console.error to write to both console and log file
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

console.log = function() {
  const timestamp = new Date().toISOString();
  const args = Array.from(arguments);
  const message = util.format.apply(null, args);
  const logMessage = `[${timestamp}] [INFO] ${message}\n`;
  
  logFile.write(logMessage);
  originalConsoleLog.apply(console, arguments);
};

console.error = function() {
  const timestamp = new Date().toISOString();
  const args = Array.from(arguments);
  const message = util.format.apply(null, args);
  const logMessage = `[${timestamp}] [ERROR] ${message}\n`;
  
  logFile.write(logMessage);
  originalConsoleError.apply(console, arguments);
};

// Log uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

// Log unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
});

// Enable CORS
app.use(cors());

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Debug endpoint to log subtitle requests
app.use('/subtitles', (req, res, next) => {
  console.log('Subtitle request received:');
  console.log(`URL: ${req.url}`);
  console.log(`Method: ${req.method}`);
  console.log(`Headers:`, req.headers);
  console.log(`Query:`, req.query);
  
  // Continue processing the request
  next();
});

// Add route to serve the dummy subtitle file with special handling
app.get('/dummy.vtt', async (req, res) => {
  console.log('Dummy subtitle request received');
  console.log(`Request headers:`, JSON.stringify(req.headers, null, 2));
  
  // Set CORS headers
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  
  // Set the correct content type for VTT files
  res.setHeader('Content-Type', 'text/vtt');
  
  // Read the file content directly
  try {
    const filePath = path.join(__dirname, 'public', 'dummy.vtt');
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Log the content being sent
    console.log('Sending subtitle content:', content.substring(0, 100) + '...');
    
    // Send the content directly
    return res.send(content);
  } catch (error) {
    console.error('Error reading dummy.vtt:', error);
    return res.status(500).send('Error reading subtitle file');
  }
});

// Add a universal subtitle route that works for all videos
app.get('/universal-subtitle.vtt', async (req, res) => {
  console.log('Universal subtitle request received');
  console.log(`Request headers:`, JSON.stringify(req.headers, null, 2));
  
  // Set CORS headers
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  
  // Set the correct content type for VTT files
  res.setHeader('Content-Type', 'text/vtt');
  
  // Read the file content directly
  try {
    const filePath = path.join(__dirname, 'public', 'dummy.vtt');
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Log the content being sent
    console.log('Sending universal subtitle content:', content.substring(0, 100) + '...');
    
    // Send the content directly
    return res.send(content);
  } catch (error) {
    console.error('Error reading dummy.vtt:', error);
    return res.status(500).send('Error reading subtitle file');
  }
});

// Subtitle route that handles both regular subtitles and translation requests
app.get('/subtitles/:mediaId/:subtitleId', async (req, res) => {
  const { mediaId, subtitleId } = req.params;
  
  console.log(`Subtitle request: mediaId=${mediaId}, subtitleId=${subtitleId}`);
  
  // Set CORS headers
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  
  try {
    // Check if this is a translation request
    if (subtitleId.startsWith('translate_')) {
      console.log('This is a translation request');
      
      // Parse the subtitle ID to get the original ID and target language
      // Format: translate_originalId_targetLang
      const parts = subtitleId.split('_');
      
      if (parts.length < 3) {
        console.error(`Invalid translation request format: ${subtitleId}`);
        return res.status(400).send('Invalid translation request format');
      }
      
      const originalId = parts[1];
      const targetLang = parts[2];
      
      console.log(`Translation request: originalId=${originalId}, targetLang=${targetLang}`);
      
      // Handle the translation request
      const translatedSubtitle = await subtitleService.handleTranslationRequest(
        originalId,
        mediaId,
        targetLang,
        translationService
      );
      
      // Set the content type based on the subtitle format
      if (translatedSubtitle.format === 'vtt') {
        res.setHeader('Content-Type', 'text/vtt');
      } else if (translatedSubtitle.format === 'srt') {
        res.setHeader('Content-Type', 'text/plain');
      } else {
        res.setHeader('Content-Type', 'text/vtt');
      }
      
      // Send the translated subtitle
      if (typeof translatedSubtitle === 'string') {
        // If it's a string, send it directly
        return res.send(translatedSubtitle);
      } else if (translatedSubtitle.url) {
        // If it's an object with a URL, read the file and send it
        const content = fs.readFileSync(translatedSubtitle.url, 'utf8');
        return res.send(content);
      } else {
        // Fallback to dummy subtitle
        const dummyPath = path.join(__dirname, 'public', 'dummy.vtt');
        const content = fs.readFileSync(dummyPath, 'utf8');
        return res.send(content);
      }
    } else {
      // This is a regular subtitle request
      console.log(`Regular subtitle request: ${subtitleId}`);
      
      // Fetch the subtitle from the API or cache
      const subtitle = await subtitleService.getSubtitle(mediaId, subtitleId);
      
      if (!subtitle) {
        console.error(`Subtitle not found: ${subtitleId}`);
        return res.status(404).send('Subtitle not found');
      }
      
      // Set the content type based on the subtitle format
      if (subtitle.format === 'vtt') {
        res.setHeader('Content-Type', 'text/vtt');
      } else if (subtitle.format === 'srt') {
        res.setHeader('Content-Type', 'text/plain');
      } else {
        res.setHeader('Content-Type', 'text/vtt');
      }
      
      // Send the subtitle content
      if (typeof subtitle === 'string') {
        return res.send(subtitle);
      } else if (subtitle.url) {
        // Check if the URL is a local path or a remote URL
        if (subtitle.url.startsWith('http')) {
          // Fetch from remote URL and forward the content
          const response = await axios.get(subtitle.url);
          return res.send(response.data);
        } else {
          // Read from local file
          const content = fs.readFileSync(subtitle.url, 'utf8');
          return res.send(content);
        }
      } else {
        // Fallback to dummy subtitle
        const dummyPath = path.join(__dirname, 'public', 'dummy.vtt');
        const content = fs.readFileSync(dummyPath, 'utf8');
        return res.send(content);
      }
    }
  } catch (error) {
    console.error(`Error handling subtitle request: ${error.message}`);
    
    // Serve the universal subtitle as a fallback
    res.setHeader('Content-Type', 'text/vtt');
    const dummyPath = path.join(__dirname, 'public', 'dummy.vtt');
    const content = fs.readFileSync(dummyPath, 'utf8');
    return res.send(content);
  }
});

// Add a special route to serve the main translation file
app.get('/subtitles/:mediaId/translate_:lang.vtt', async (req, res) => {
  const { mediaId, lang } = req.params;
  
  console.log(`Main translation request received: ${mediaId} to ${lang}`);
  console.log(`Request headers:`, JSON.stringify(req.headers, null, 2));
  
  try {
    // Handle the translation request
    const translatedSubtitle = await subtitleService.handleTranslationRequest(
      `translate_${mediaId}_${lang}`,
      mediaId,
      lang,
      translationService
    );
    
    console.log(`Translation successful, serving content directly from: ${translatedSubtitle.url}`);
    
    // Instead of redirecting, get the content and serve it directly
    try {
      // Extract the file path from the URL
      const filePath = translatedSubtitle.url.includes('/subtitles/') 
        ? path.join(subtitleService.getCacheDir(), translatedSubtitle.url.split('/subtitles/')[1].replace('/', '-'))
        : path.join(subtitleService.getCacheDir(), `${mediaId}-${translatedSubtitle.id}.vtt`);
      
      console.log(`Looking for translated subtitle at: ${filePath}`);
      
      if (fs.existsSync(filePath)) {
        // Read the file content
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Set the content type and send the content
        res.setHeader('Content-Type', 'text/vtt');
        return res.send(content);
      } else {
        console.error(`Translated subtitle file not found at: ${filePath}`);
        
        // Serve a dummy file as fallback
        const dummyContent = `WEBVTT

NOTE This is a fallback subtitle file

1
00:00:01.000 --> 00:00:10.000
Translation in progress...

2
00:00:11.000 --> 00:00:20.000
We're working on translating subtitles to ${translationService.getLanguageName(lang)}.

3
00:00:21.000 --> 00:00:30.000
Please wait a moment and try again.`;
        
        res.setHeader('Content-Type', 'text/vtt');
        return res.send(dummyContent);
      }
    } catch (fileError) {
      console.error(`Error serving translated subtitle: ${fileError.message}`);
      throw fileError;
    }
  } catch (translationError) {
    console.error(`Translation error: ${translationError.message}`);
    console.error(translationError.stack);
    
    // Serve a dummy file as fallback
    const dummyContent = `WEBVTT

NOTE Translation error occurred

1
00:00:01.000 --> 00:00:10.000
Sorry, we encountered an error while translating.

2
00:00:11.000 --> 00:00:20.000
Error: ${translationError.message}

3
00:00:21.000 --> 00:00:30.000
Please try again or select a different subtitle.`;
    
    res.setHeader('Content-Type', 'text/vtt');
    return res.send(dummyContent);
  }
});

// Add route to serve subtitle files
app.get('/subtitles/:mediaId/:subtitleId', async (req, res) => {
  const { mediaId, subtitleId } = req.params;
  
  try {
    console.log(`Subtitle request: ${mediaId}/${subtitleId}`);
    console.log(`User agent: ${req.headers['user-agent']}`);
    console.log(`Request headers:`, JSON.stringify(req.headers, null, 2));
    
    // Check if this is a translation request
    if (subtitleId.includes('translate')) {
      // Extract the target language from the subtitle ID
      let targetLang, originalId;
      
      if (subtitleId.startsWith('translate_')) {
        // This is our main translation option
        // Format: translate_mediaId_targetLang.vtt
        targetLang = subtitleId.split('_')[2].split('.')[0];
        originalId = subtitleId;
      } else {
        // This is a specific subtitle translation
        // Format: originalId_translate_targetLang.vtt
        targetLang = subtitleId.split('_translate_')[1].split('.')[0];
        originalId = subtitleId.split('_translate_')[0];
      }
      
      console.log(`Translation request detected: ${originalId} to ${targetLang}`);
      
      try {
        // Handle the translation request
        const translatedSubtitle = await subtitleService.handleTranslationRequest(
          originalId,
          mediaId,
          targetLang,
          translationService
        );
        
        console.log(`Translation successful, serving content directly from: ${translatedSubtitle.url}`);
        
        // Instead of redirecting, get the content and serve it directly
        try {
          // Extract the file path from the URL
          const filePath = translatedSubtitle.url.includes('/subtitles/') 
            ? path.join(subtitleService.getCacheDir(), translatedSubtitle.url.split('/subtitles/')[1].replace('/', '-'))
            : path.join(subtitleService.getCacheDir(), `${mediaId}-${translatedSubtitle.id}.srt`);
          
          console.log(`Looking for translated subtitle at: ${filePath}`);
          
          if (fs.existsSync(filePath)) {
            // Read the file content
            const content = fs.readFileSync(filePath, 'utf8');
            
            // Determine content type based on file extension
            const fileExtension = translatedSubtitle.url.split('.').pop().toLowerCase();
            let contentType = 'text/plain';
            
            if (fileExtension === 'vtt') {
              contentType = 'text/vtt';
            } else if (fileExtension === 'srt') {
              contentType = 'application/x-subrip';
            }
            
            // Set the content type and send the content
            res.setHeader('Content-Type', contentType);
            return res.send(content);
          } else {
            console.error(`Translated subtitle file not found at: ${filePath}`);
            throw new Error('Translated subtitle file not found');
          }
        } catch (fileError) {
          console.error(`Error serving translated subtitle: ${fileError.message}`);
          throw fileError;
        }
      } catch (translationError) {
        console.error(`Translation error: ${translationError.message}`);
        console.error(translationError.stack);
        
        // Serve the dummy file as a fallback
        console.log('Serving dummy subtitle file as fallback');
        const dummyContent = 'WEBVTT\n\nNOTE Translation failed - please try again\n\n1\n00:00:01.000 --> 00:00:10.000\nTranslation in progress...\n\n2\n00:00:11.000 --> 00:00:20.000\nPlease wait while we translate the subtitles for you.';
        res.setHeader('Content-Type', 'text/vtt');
        return res.send(dummyContent);
      }
    }
    
    // This is a regular subtitle request
    const filePath = path.join(subtitleService.getCacheDir(), `${mediaId}-${subtitleId}`);
    
    // Check if the file exists
    if (!fs.existsSync(filePath)) {
      // Check if this is a request for the dummy file
      if (subtitleId === 'dummy.vtt') {
        // Serve the dummy VTT file
        const dummyContent = 'WEBVTT\n\nNOTE This is a placeholder subtitle file\n\n1\n00:00:01.000 --> 00:00:10.000\nTranslation in progress...\n\n2\n00:00:11.000 --> 00:00:20.000\nPlease wait while we translate the subtitles for you.';
        res.setHeader('Content-Type', 'text/vtt');
        return res.send(dummyContent);
      }
      
      return res.status(404).send('Subtitle file not found');
    }
    
    // Determine the content type based on the file extension
    const fileExtension = subtitleId.split('.').pop().toLowerCase();
    let contentType = 'text/plain';
    
    if (fileExtension === 'vtt') {
      contentType = 'text/vtt';
    } else if (fileExtension === 'srt') {
      contentType = 'application/x-subrip';
    }
    
    // Set the appropriate content type
    res.setHeader('Content-Type', contentType);
    
    // Stream the file to the response
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error(`Error serving subtitle: ${error.message}`);
    res.status(500).send(`Error: ${error.message}`);
  }
});

// Add route to handle translation requests
app.get('/translate/:mediaId/:subtitleId/:targetLang', async (req, res) => {
  const { mediaId, subtitleId, targetLang } = req.params;
  
  try {
    console.log(`Translation request: ${mediaId}/${subtitleId} to ${targetLang}`);
    
    // Handle the translation request
    const translatedSubtitle = await subtitleService.handleTranslationRequest(
      subtitleId,
      mediaId,
      targetLang,
      translationService
    );
    
    // Return the translated subtitle information
    res.json(translatedSubtitle);
  } catch (error) {
    console.error(`Error handling translation request: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint to test subtitle functionality
app.get('/debug/subtitles/:type/:id', async (req, res) => {
  const { type, id } = req.params;
  
  try {
    const subtitles = await subtitleService.findSubtitles(type, id);
    res.json(subtitles);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint to test subtitle content
app.get('/debug/subtitle-content', async (req, res) => {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }
  
  try {
    const content = await subtitleService.getSubtitleContent(url);
    res.type('text/plain').send(content);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint to test translation directly
app.get('/debug/translate', async (req, res) => {
  try {
    // Get the text to translate from the query parameters
    const { text, from, to } = req.query;
    
    if (!text) {
      return res.status(400).json({ error: 'Text parameter is required' });
    }
    
    // Default languages if not provided
    const fromLang = from || 'en';
    const toLang = to || 'el';
    
    console.log(`Debug translation request: ${fromLang} -> ${toLang}`);
    console.log(`Text to translate: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);
    
    // Make a direct API call to Gemini
    try {
      // This is the correct API URL for Gemini 1.5 Pro
      const apiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`;
      
      console.log(`Using API URL: ${apiUrl.replace(process.env.GEMINI_API_KEY, 'API_KEY_HIDDEN')}`);
      
      const prompt = `Translate the following text from ${fromLang} to ${toLang}. Return ONLY the translated text without any explanations:

${text}`;
      
      const apiResponse = await axios.post(apiUrl, {
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 8192,
        }
      });
      
      // Check if we have a valid response
      if (!apiResponse.data || !apiResponse.data.candidates || apiResponse.data.candidates.length === 0) {
        throw new Error('Empty response from Gemini API');
      }
      
      // Extract the translated text
      const translatedText = apiResponse.data.candidates[0].content.parts[0].text;
      
      // Log the result
      console.log(`Translation result: ${translatedText.substring(0, 100)}${translatedText.length > 100 ? '...' : ''}`);
      
      // Return both the original and translated text
      res.json({
        original: text,
        translated: translatedText,
        from: fromLang,
        to: toLang
      });
    } catch (error) {
      console.error(`Error in direct API call: ${error.message}`);
      if (error.response) {
        console.error(`Status: ${error.response.status}`);
        console.error(`Data:`, error.response.data);
        
        res.status(error.response.status).json({
          status: 'error',
          error: error.message,
          responseStatus: error.response.status,
          responseData: error.response.data,
          apiKeyValid: false
        });
      } else {
        res.status(500).json({
          status: 'error',
          error: error.message,
          apiKeyValid: false
        });
      }
    }
  } catch (error) {
    console.error(`Error in debug translation: ${error.message}`);
    res.status(500).json({ 
      error: error.message, 
      original: req.query.text,
      translated: `[Translation Error: ${error.message}] ${req.query.text}`,
      from: req.query.from || 'en',
      to: req.query.to || 'el'
    });
  }
});

// Debug endpoint to translate a subtitle from URL
app.get('/debug/translate-subtitle', async (req, res) => {
  try {
    const { url, to } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }
    
    // Default target language if not provided
    const toLang = to || 'el';
    
    console.log(`Debug subtitle translation request for URL: ${url}`);
    console.log(`Target language: ${toLang}`);
    
    // Fetch the subtitle content
    try {
      const response = await axios.get(url, {
        responseType: 'text',
        headers: {
          'Accept': 'text/plain, text/html, application/xhtml+xml, application/xml, */*',
        }
      });
      
      const subtitleContent = response.data;
      console.log(`Fetched subtitle content (${subtitleContent.length} bytes)`);
      
      // Detect the source language (assuming English if not specified)
      const fromLang = 'en';
      
      // Translate the subtitle content
      const translatedContent = await translationService.translateSubtitle(
        subtitleContent,
        fromLang,
        toLang
      );
      
      // Return the translated content
      res.header('Content-Type', 'text/plain');
      res.send(translatedContent);
    } catch (error) {
      console.error(`Error fetching or translating subtitle: ${error.message}`);
      if (error.response) {
        console.error(`Status: ${error.response.status}`);
      }
      throw new Error(`Failed to fetch or translate subtitle: ${error.message}`);
    }
  } catch (error) {
    console.error(`Error in debug subtitle translation: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint to check API keys
app.get('/debug/check-api-keys', async (req, res) => {
  const results = {};
  
  // Check Gemini API key
  if (process.env.GEMINI_API_KEY) {
    try {
      // Try a simple translation as a test
      const testResult = await translationService.translateSubtitle(
        'WEBVTT\n\n1\n00:00:01.000 --> 00:00:05.000\nHello, this is a test.',
        'en',
        'el'
      );
      
      if (testResult && testResult.length > 0) {
        results.gemini = {
          valid: true,
          message: 'Gemini API key is valid and working'
        };
      } else {
        results.gemini = {
          valid: false,
          message: 'Gemini API key seems valid but returned empty result'
        };
      }
    } catch (error) {
      results.gemini = {
        valid: false,
        message: `Gemini API key error: ${error.message}`
      };
    }
  } else {
    results.gemini = {
      valid: false,
      message: 'Gemini API key is not set in environment variables'
    };
  }
  
  // Check OpenSubtitles API key
  if (process.env.OPENSUBTITLES_API_KEY) {
    try {
      // Try a simple search as a test
      const testResult = await subtitleService.searchOpenSubtitles('movie', 'tt0111161');
      
      results.opensubtitles = {
        valid: true,
        message: 'OpenSubtitles API key is valid and working'
      };
    } catch (error) {
      results.opensubtitles = {
        valid: false,
        message: `OpenSubtitles API key error: ${error.message}`
      };
    }
  } else {
    results.opensubtitles = {
      valid: false,
      message: 'OpenSubtitles API key is not set in environment variables'
    };
  }
  
  res.json(results);
});

// Debug endpoint to test Gemini API directly
app.get('/debug/test-gemini-api', async (req, res) => {
  try {
    console.log('Testing Gemini API connection...');
    
    if (!process.env.GEMINI_API_KEY) {
      return res.status(400).json({ error: 'Gemini API key not configured' });
    }
    
    // First, try to list models to check API connectivity
    const modelsUrl = `https://generativelanguage.googleapis.com/v1/models?key=${process.env.GEMINI_API_KEY}`;
    
    console.log(`Fetching models from: ${modelsUrl.replace(process.env.GEMINI_API_KEY, 'API_KEY_HIDDEN')}`);
    
    try {
      const modelsResponse = await axios.get(modelsUrl);
      console.log('Models API response status:', modelsResponse.status);
      
      // Now try a simple content generation
      const generateUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`;
      
      console.log(`Generating content with: ${generateUrl.replace(process.env.GEMINI_API_KEY, 'API_KEY_HIDDEN')}`);
      
      const generateResponse = await axios.post(generateUrl, {
        contents: [
          {
            parts: [
              {
                text: "Hello, please respond with a simple 'Hello, world!'"
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 100,
        }
      });
      
      console.log('Generate API response status:', generateResponse.status);
      
      // Extract the response text
      const responseText = generateResponse.data.candidates[0].content.parts[0].text;
      
      res.json({
        status: 'success',
        models: modelsResponse.data.models.slice(0, 5).map(m => m.name), // Just show first 5 models
        testResponse: responseText,
        apiKeyValid: true
      });
    } catch (error) {
      console.error('Gemini API test error:', error.message);
      if (error.response) {
        console.error('Status:', error.response.status);
        console.error('Data:', error.response.data);
        
        res.status(error.response.status).json({
          status: 'error',
          error: error.message,
          responseStatus: error.response.status,
          responseData: error.response.data,
          apiKeyValid: false
        });
      } else {
        res.status(500).json({
          status: 'error',
          error: error.message,
          apiKeyValid: false
        });
      }
    }
  } catch (error) {
    console.error('General error in Gemini API test:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

// Debug endpoint for direct text translation
app.post('/debug/translate-text', async (req, res) => {
  try {
    const { text, from, to } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text parameter is required' });
    }
    
    // Default languages if not provided
    const fromLang = from || 'en';
    const toLang = to || 'el';
    
    console.log(`Debug text translation request: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);
    console.log(`From: ${fromLang}, To: ${toLang}`);
    
    // Create a simple VTT format for the text
    const vttContent = `WEBVTT\n\n1\n00:00:01.000 --> 00:00:10.000\n${text}`;
    
    // Translate using our subtitle translation function
    const translatedVtt = await translationService.translateSubtitle(
      vttContent,
      fromLang,
      toLang
    );
    
    // Extract the translated text from the VTT
    const translatedText = translatedVtt.split('\n').slice(4).join('\n').trim();
    
    // Return both original and translated text
    res.json({
      original: {
        text: text,
        lang: fromLang
      },
      translated: {
        text: translatedText,
        lang: toLang
      }
    });
  } catch (error) {
    console.error(`Error in direct text translation: ${error.message}`);
    res.status(500).json({ 
      error: error.message, 
      original: req.body.text,
      translated: `[Translation Error: ${error.message}] ${req.body.text}`
    });
  }
});

// Get local IP address
app.get('/ip', (req, res) => {
  const interfaces = networkInterfaces();
  let ipAddress = 'localhost';
  
  Object.keys(interfaces).forEach((interfaceName) => {
    interfaces[interfaceName].forEach((iface) => {
      if (iface.family === 'IPv4' && !iface.internal) {
        ipAddress = iface.address;
      }
    });
  });
  
  res.json({ ip: ipAddress });
});

// Add a health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve the addon interface
app.get('/manifest.json', (req, res) => {
  res.json(addonInterface.manifest);
});

// Handle all addon requests
app.get('/:resource/:type/:id/:extra?', async (req, res) => {
  try {
    const { resource, type, id } = req.params;
    
    // Parse the extra parameter if it exists
    let extra = {};
    if (req.params.extra) {
      try {
        extra = JSON.parse(decodeURIComponent(req.params.extra));
      } catch (e) {
        console.warn(`Failed to parse extra parameter: ${e.message}`);
      }
    }
    
    console.log(`Addon request: ${resource}/${type}/${id} with extra:`, extra);
    
    // Use the get method from addonInterface
    const result = await addonInterface.get(resource, type, id, extra);
    
    console.log(`Returning ${result && result.subtitles ? result.subtitles.length : 0} subtitles`);
    
    res.setHeader('Cache-Control', 'max-age=86400, public');
    res.json(result);
  } catch (error) {
    console.error(`Error handling addon request: ${error.message}`);
    console.error(error.stack);
    res.status(500).json({ error: error.message });
  }
});

// Add route to serve the static subtitle file
app.get('/static-subtitle.vtt', (req, res) => {
  console.log('Static subtitle request received');
  console.log(`Request headers:`, JSON.stringify(req.headers, null, 2));
  
  // Serve the static subtitle file
  res.sendFile(path.join(__dirname, 'public', 'static-subtitle.vtt'));
});

// Add a universal route that catches all subtitle requests
app.get('*', async (req, res, next) => {
  const url = req.url;
  
  // Check if this is a subtitle request (ends with .vtt or .srt)
  if (url.endsWith('.vtt') || url.endsWith('.srt') || url.includes('translate_')) {
    console.log(`Universal subtitle handler caught request: ${url}`);
    console.log(`User agent: ${req.headers['user-agent']}`);
    
    // Set CORS headers
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    
    // Set the correct content type based on the file extension
    if (url.endsWith('.vtt')) {
      res.setHeader('Content-Type', 'text/vtt');
    } else if (url.endsWith('.srt')) {
      res.setHeader('Content-Type', 'text/plain');
    } else {
      res.setHeader('Content-Type', 'text/vtt');
    }
    
    try {
      // Check if this is a translation request
      if (url.includes('translate_')) {
        // Extract target language from URL
        const langMatch = url.match(/translate_([a-z]{2})/i);
        const targetLang = langMatch ? langMatch[1] : 'el'; // Default to Greek
        
        console.log(`Universal handler detected translation request to ${targetLang}`);
        
        // Get our dummy subtitle content
        const dummyPath = path.join(__dirname, 'public', 'dummy.vtt');
        let content = fs.readFileSync(dummyPath, 'utf8');
        
        // Try to translate it
        try {
          content = await translationService.translateSubtitle(
            content,
            'en', // Source language
            targetLang
          );
          console.log(`Successfully translated subtitle to ${targetLang}`);
        } catch (translationError) {
          console.error(`Translation error: ${translationError.message}`);
          // Continue with original content if translation fails
        }
        
        return res.send(content);
      } else {
        // Serve our static subtitle file for regular subtitle requests
        const filePath = path.join(__dirname, 'public', 'dummy.vtt');
        const content = fs.readFileSync(filePath, 'utf8');
        
        console.log(`Universal handler serving static subtitle for: ${url}`);
        return res.send(content);
      }
    } catch (error) {
      console.error(`Universal handler error: ${error.message}`);
      
      // Even if there's an error, try to send something
      try {
        const backupContent = 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:10.000\nSubtitle unavailable.';
        return res.send(backupContent);
      } catch (e) {
        return res.status(500).send('Error reading subtitle file');
      }
    }
  }
  
  // Not a subtitle request, continue to the next middleware
  next();
});

// Start the server
app.listen(port, () => {
  console.log(`Addon interface loaded successfully`);
  
  // Check if the API keys are configured
  const geminiKeyConfigured = !!process.env.GEMINI_API_KEY;
  const openSubtitlesKeyConfigured = !!process.env.OPENSUBTITLES_API_KEY;
  
  console.log(`Gemini API key status: ${geminiKeyConfigured ? 'Configured' : 'Not configured'}`);
  console.log(`OpenSubtitles API key status: ${openSubtitlesKeyConfigured ? 'Configured' : 'Not configured'}`);
  
  // Log local IP addresses for easier access
  const nets = networkInterfaces();
  
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`Subtito Free add-on running at http://${net.address}:${port}/manifest.json`);
        console.log(`Installation page accessible at: http://${net.address}:${port}/`);
        break;
      }
    }
  }
});
