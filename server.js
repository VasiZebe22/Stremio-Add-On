#!/usr/bin/env node

/**
 * Stremio Add-on Server
 * Provides subtitle translation functionality for Stremio
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Import middleware
const logger = require('./middleware/logger');
const errorHandler = require('./middleware/error-handler');

// Import route modules
const stremioRoutes = require('./routes/stremio-routes');
const subtitleRoutes = require('./routes/subtitle-routes');
const debugRoutes = require('./routes/debug-routes');
const utilityRoutes = require('./routes/utility-routes');

// Import services
const subtitleService = require('./lib/subtitles');
const translationService = require('./lib/translation');

// Load environment variables
if (!process.env.GEMINI_API_KEY) {
  console.warn('Warning: GEMINI_API_KEY not found in environment variables');
}

if (!process.env.OPENSUBTITLES_API_KEY) {
  console.warn('Warning: OPENSUBTITLES_API_KEY not found in environment variables');
}

// Create the Express app
const app = express();
const port = process.env.PORT || 7000;

// Configure middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(logger.requestLogger);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Create necessary directories if they don't exist
const translationsDir = path.join(__dirname, 'public', 'translations');
if (!fs.existsSync(translationsDir)) {
  fs.mkdirSync(translationsDir, { recursive: true });
  console.log(`Created translations directory: ${translationsDir}`);
}

// Log uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception:', err);
});

// Configure routes
app.use('/subtitles', subtitleRoutes);
app.use('/debug', debugRoutes);
app.use('/', stremioRoutes);
app.use('/', utilityRoutes);

// Error handling middleware
app.use(errorHandler.notFoundHandler);
app.use(errorHandler.errorHandler);

// Start the server
app.listen(port, () => {
  logger.log(`Addon interface loaded successfully`);
  
  // Check if the API keys are configured
  const geminiKeyConfigured = !!process.env.GEMINI_API_KEY;
  const openSubtitlesKeyConfigured = !!process.env.OPENSUBTITLES_API_KEY;
  
  logger.log(`Server started on port ${port}`);
  logger.log(`Gemini API key configured: ${geminiKeyConfigured ? 'Yes' : 'No'}`);
  logger.log(`OpenSubtitles API key configured: ${openSubtitlesKeyConfigured ? 'Yes' : 'No'}`);
  
  // Log the add-on URL
  const baseUrl = process.env.BASE_URL || `http://127.0.0.1:${port}`;
  logger.log(`Add-on URL: ${baseUrl}/manifest.json`);
});
