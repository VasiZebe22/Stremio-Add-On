/**
 * Stremio routes for the add-on
 * Handles the main Stremio add-on API endpoints
 */

const express = require('express');
const router = express.Router();
const addonInterface = require('../addon');

/**
 * Main route for the Stremio add-on manifest
 * Returns the add-on manifest in JSON format
 */
router.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.send(JSON.stringify(addonInterface.manifest));
});

/**
 * Route for catalog requests
 * Returns catalog data for the specified type and id
 */
router.get('/catalog/:type/:id.json', (req, res) => {
  const { type, id } = req.params;
  
  console.log(`Catalog request: ${type}/${id}`);
  
  // Set headers
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Get the catalog handler from the addon interface
  const handler = addonInterface.catalog;
  
  if (!handler) {
    console.error('No catalog handler defined');
    return res.status(404).send(JSON.stringify({ metas: [] }));
  }
  
  // Call the handler
  handler({ type, id }, (err, resp) => {
    if (err) {
      console.error(`Catalog error: ${err.message}`);
      return res.status(500).send(JSON.stringify({ error: err.message }));
    }
    
    res.send(JSON.stringify(resp));
  });
});

/**
 * Route for metadata requests
 * Returns metadata for the specified type and id
 */
router.get('/meta/:type/:id.json', (req, res) => {
  const { type, id } = req.params;
  
  console.log(`Meta request: ${type}/${id}`);
  
  // Set headers
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Get the meta handler from the addon interface
  const handler = addonInterface.meta;
  
  if (!handler) {
    console.error('No meta handler defined');
    return res.status(404).send(JSON.stringify({ meta: null }));
  }
  
  // Call the handler
  handler({ type, id }, (err, resp) => {
    if (err) {
      console.error(`Meta error: ${err.message}`);
      return res.status(500).send(JSON.stringify({ error: err.message }));
    }
    
    res.send(JSON.stringify(resp));
  });
});

/**
 * Route for stream requests
 * Returns stream data for the specified type and id
 */
router.get('/stream/:type/:id.json', (req, res) => {
  const { type, id } = req.params;
  
  console.log(`Stream request: ${type}/${id}`);
  
  // Set headers
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Get the stream handler from the addon interface
  const handler = addonInterface.stream;
  
  if (!handler) {
    console.error('No stream handler defined');
    return res.status(404).send(JSON.stringify({ streams: [] }));
  }
  
  // Call the handler
  handler({ type, id }, (err, resp) => {
    if (err) {
      console.error(`Stream error: ${err.message}`);
      return res.status(500).send(JSON.stringify({ error: err.message }));
    }
    
    res.send(JSON.stringify(resp));
  });
});

/**
 * Route for subtitle requests
 * Returns subtitle data for the specified type and id
 */
router.get('/subtitles/:type/:id.json', (req, res) => {
  const { type, id } = req.params;
  
  console.log(`Subtitle info request: ${type}/${id}`);
  
  // Set headers
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Get the subtitle handler from the addon interface
  const handler = addonInterface.subtitles;
  
  if (!handler) {
    console.error('No subtitles handler defined');
    return res.status(404).send(JSON.stringify({ subtitles: [] }));
  }
  
  // Call the handler
  handler({ type, id }, (err, resp) => {
    if (err) {
      console.error(`Subtitles error: ${err.message}`);
      return res.status(500).send(JSON.stringify({ error: err.message }));
    }
    
    console.log(`Sending subtitle response: ${JSON.stringify(resp)}`);
    res.send(JSON.stringify(resp));
  });
});

/**
 * Fallback route for subtitle requests
 * This ensures that even if the specific route isn't matched, we still return our subtitle
 */
router.get('/subtitles/:type/:id/:extra?.json', (req, res) => {
  const { type, id } = req.params;
  
  console.log(`Fallback subtitle info request: ${type}/${id}`);
  
  // Set headers
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Get the subtitle handler from the addon interface
  const handler = addonInterface.subtitles;
  
  if (!handler) {
    console.error('No subtitles handler defined');
    return res.status(404).send(JSON.stringify({ subtitles: [] }));
  }
  
  // Call the handler
  handler({ type, id }, (err, resp) => {
    if (err) {
      console.error(`Subtitles error: ${err.message}`);
      return res.status(500).send(JSON.stringify({ error: err.message }));
    }
    
    console.log(`Sending subtitle response: ${JSON.stringify(resp)}`);
    res.send(JSON.stringify(resp));
  });
});

/**
 * Generic route for all other Stremio API requests
 * Handles any resource type with optional extra parameters
 */
router.get('/:resource/:type/:id/:extra?', async (req, res) => {
  try {
    const { resource, type, id } = req.params;
    
    // Parse the extra parameter if it exists
    const extra = req.params.extra ? req.params.extra.split('.')[0] : null;
    
    console.log(`Generic Stremio request: ${resource}/${type}/${id}${extra ? `/${extra}` : ''}`);
    
    // Set headers
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // Get the handler from the addon interface
    const handler = addonInterface[resource];
    
    if (!handler) {
      console.error(`No handler defined for resource: ${resource}`);
      return res.status(404).send(JSON.stringify({ error: `No handler for ${resource}` }));
    }
    
    // Call the handler
    handler({ type, id, extra }, (err, resp) => {
      if (err) {
        console.error(`Handler error: ${err.message}`);
        return res.status(500).send(JSON.stringify({ error: err.message }));
      }
      
      res.send(JSON.stringify(resp));
    });
  } catch (error) {
    console.error(`Error handling generic request: ${error.message}`);
    res.status(500).send(JSON.stringify({ error: error.message }));
  }
});

module.exports = router;
