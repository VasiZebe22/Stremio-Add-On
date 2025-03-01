/**
 * Subtitle routes for the Stremio add-on
 * Handles all subtitle-related requests including translation
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const subtitleService = require('../lib/subtitles');
const translationService = require('../lib/translation');

/**
 * Main subtitle route that handles both regular subtitles and translation requests
 * Supports both direct subtitle retrieval and translation requests
 */
router.get('/:mediaId/:subtitleId', async (req, res) => {
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
      
      // Parse the subtitle ID to get the target language
      // Format: translate_targetLang
      const parts = subtitleId.split('_');
      
      if (parts.length < 2) {
        console.error(`Invalid translation request format: ${subtitleId}`);
        return res.status(400).send('Invalid translation request format');
      }
      
      const targetLang = parts[1];
      
      console.log(`Translation request: targetLang=${targetLang}`);
      
      // Set the content type to WebVTT
      res.setHeader('Content-Type', 'text/vtt');
      
      // Get our dummy subtitle content
      const dummyPath = path.join(__dirname, '..', 'public', 'dummy.vtt');
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
      // This is a regular subtitle request
      console.log(`Regular subtitle request: ${subtitleId}`);
      
      // Try to find the subtitle
      const subtitle = await subtitleService.getSubtitle(subtitleId, mediaId);
      
      if (!subtitle || !subtitle.content) {
        console.error(`Subtitle not found: ${subtitleId}`);
        return res.status(404).send('Subtitle not found');
      }
      
      // Set the content type based on the file extension
      if (subtitleId.endsWith('.vtt')) {
        res.setHeader('Content-Type', 'text/vtt');
      } else if (subtitleId.endsWith('.srt')) {
        res.setHeader('Content-Type', 'text/plain');
      } else {
        res.setHeader('Content-Type', 'text/vtt');
      }
      
      return res.send(subtitle.content);
    }
  } catch (error) {
    console.error(`Error handling subtitle request: ${error.message}`);
    return res.status(500).send(`Error: ${error.message}`);
  }
});

/**
 * Fallback route for translation requests
 * This is used when the specific subtitle ID is not known
 */
router.get('/:mediaId/translate_:lang.vtt', async (req, res) => {
  const { mediaId, lang } = req.params;
  
  console.log(`Main translation request received: ${mediaId} to ${lang}`);
  
  // Set CORS headers
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  
  // Set the content type to WebVTT
  res.setHeader('Content-Type', 'text/vtt');
  
  try {
    // Get our dummy subtitle content
    const dummyPath = path.join(__dirname, '..', 'public', 'dummy.vtt');
    let content = fs.readFileSync(dummyPath, 'utf8');
    
    // Try to translate it
    try {
      content = await translationService.translateSubtitle(
        content,
        'en', // Source language
        lang
      );
      console.log(`Successfully translated subtitle to ${lang}`);
    } catch (translationError) {
      console.error(`Translation error: ${translationError.message}`);
      // Continue with original content if translation fails
    }
    
    return res.send(content);
  } catch (error) {
    console.error(`Error handling translation request: ${error.message}`);
    
    // Even if there's an error, try to send something
    try {
      const backupContent = 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:10.000\nSubtitle unavailable.';
      return res.send(backupContent);
    } catch (e) {
      return res.status(500).send('Error reading subtitle file');
    }
  }
});

module.exports = router;
