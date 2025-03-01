/**
 * Utility routes for the Stremio add-on
 * Provides various utility endpoints and fallback handlers
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { networkInterfaces } = require('os');

/**
 * Route to get the local IP address
 * Returns the local IP address of the server
 */
router.get('/ip', (req, res) => {
  const interfaces = networkInterfaces();
  let ipAddress = 'localhost';
  
  // Find the first non-internal IPv4 address
  Object.keys(interfaces).forEach((ifname) => {
    interfaces[ifname].forEach((iface) => {
      if (iface.family === 'IPv4' && !iface.internal) {
        ipAddress = iface.address;
      }
    });
  });
  
  res.json({ ip: ipAddress });
});

/**
 * Route to get the server status
 * Returns basic information about the server
 */
router.get('/status', (req, res) => {
  const uptime = process.uptime();
  const memory = process.memoryUsage();
  
  res.json({
    status: 'running',
    uptime: uptime,
    memory: {
      rss: Math.round(memory.rss / 1024 / 1024) + ' MB',
      heapTotal: Math.round(memory.heapTotal / 1024 / 1024) + ' MB',
      heapUsed: Math.round(memory.heapUsed / 1024 / 1024) + ' MB'
    },
    environment: process.env.NODE_ENV || 'development',
    version: process.version
  });
});

/**
 * Universal fallback route for subtitle requests
 * Catches all requests that might be subtitle-related but weren't caught by specific routes
 */
router.get('*', async (req, res, next) => {
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
        const dummyPath = path.join(__dirname, '..', 'public', 'dummy.vtt');
        let content = fs.readFileSync(dummyPath, 'utf8');
        
        // Try to translate it
        try {
          const translationService = require('../lib/translation');
          content = await translationService.translateSubtitle(
            content,
            'en', // Source language
            targetLang
          );
          console.log(`Successfully translated subtitle to ${targetLang}`);
        } catch (translationError) {
          console.error(`Translation error in universal handler: ${translationError.message}`);
          // Continue with original content if translation fails
        }
        
        return res.send(content);
      } else {
        // Serve our static subtitle file for regular subtitle requests
        const filePath = path.join(__dirname, '..', 'public', 'dummy.vtt');
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

module.exports = router;
