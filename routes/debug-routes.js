/**
 * Debug routes for the Stremio add-on
 * Provides endpoints for testing and debugging the add-on functionality
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const subtitleService = require('../lib/subtitles');
const translationService = require('../lib/translation');

/**
 * Debug endpoint for direct text translation
 * Accepts text in the request body and returns translated text
 */
router.post('/translate-text', async (req, res) => {
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

/**
 * Debug endpoint to translate a subtitle from URL
 * Fetches a subtitle from a URL and translates it
 */
router.get('/translate-subtitle', async (req, res) => {
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

/**
 * Debug endpoint to check API keys
 * Tests the Gemini API and OpenSubtitles API keys
 */
router.get('/check-api-keys', async (req, res) => {
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

/**
 * Debug endpoint to test Gemini API directly
 * Tests the connection to the Gemini API
 */
router.get('/test-gemini-api', async (req, res) => {
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
      
      const requestBody = {
        contents: [{
          parts: [{
            text: "Translate this to Greek: Hello, world!"
          }]
        }]
      };
      
      console.log('Sending test content generation request...');
      
      const generateResponse = await axios.post(generateUrl, requestBody);
      
      console.log('Generate API response status:', generateResponse.status);
      
      // Extract the generated text
      const generatedText = generateResponse.data.candidates[0].content.parts[0].text;
      
      return res.json({
        status: 'success',
        message: 'Gemini API is working correctly',
        models: modelsResponse.data.models.map(model => model.name),
        testTranslation: {
          original: "Hello, world!",
          translated: generatedText
        }
      });
    } catch (error) {
      console.error('API request error:', error.message);
      
      if (error.response) {
        console.error('Error response:', error.response.data);
        return res.status(500).json({
          status: 'error',
          message: 'Gemini API request failed',
          error: error.message,
          response: error.response.data
        });
      } else {
        return res.status(500).json({
          status: 'error',
          message: 'Gemini API request failed',
          error: error.message
        });
      }
    }
  } catch (error) {
    console.error('Error testing Gemini API:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Error testing Gemini API',
      error: error.message
    });
  }
});

module.exports = router;
