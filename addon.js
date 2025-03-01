/**
 * Stremio Add-on Definition
 * Provides subtitle translation functionality for all video types
 */

const { addonBuilder } = require('stremio-addon-sdk');
const manifest = require('./manifest.json');
const translationService = require('./lib/translation');
const os = require('os');
const networkInterfaces = os.networkInterfaces;

// Get the local IP address for direct access
const getLocalIp = () => {
  const interfaces = networkInterfaces();
  let localIp = 'localhost';
  
  // Find a suitable IP address
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        localIp = iface.address;
        break;
      }
    }
  }
  
  return localIp;
};

// Create the addon builder with the manifest
const builder = new addonBuilder(manifest);

/**
 * Define the subtitles handler for ALL video types
 * This is called by Stremio when it needs subtitle options for a video
 */
builder.defineSubtitlesHandler((args, callback) => {
  const { type, id } = args;
  console.log(`Subtitle request received for ${type}/${id}`);
  
  // Default to Greek if no language is specified
  const userLang = 'el';
  
  try {
    // Get the local IP and port
    const localIp = getLocalIp();
    const port = process.env.PORT || 7000;
    
    // Get the language name for display
    const targetLangName = translationService.getLanguageName(userLang);
    
    // Create our subtitle option
    const subtitles = [
      {
        id: `translate_${userLang}`,
        url: `http://${localIp}:${port}/subtitles/${id}/translate_${userLang}.vtt`,
        lang: userLang,
        langName: `${targetLangName} (AI)`,
        title: `⭐ ${targetLangName} - AI Translation`,
        rating: 10
      }
    ];
    
    console.log(`Returning ${subtitles.length} subtitle options`);
    callback(null, { subtitles });
  } catch (error) {
    console.error(`Error in subtitle handler: ${error.message}`);
    
    // Even if there's an error, return at least our translation option
    const localIp = getLocalIp();
    const port = process.env.PORT || 7000;
    const targetLangName = translationService.getLanguageName(userLang);
    
    callback(null, {
      subtitles: [{
        id: `translate_${userLang}`,
        url: `http://${localIp}:${port}/subtitles/${id}/translate_${userLang}.vtt`,
        lang: userLang,
        langName: `${targetLangName} (AI)`,
        title: `⭐ ${targetLangName} - AI Translation`,
        rating: 10
      }]
    });
  }
});

// Create the addon interface
const addon = builder.getInterface();

module.exports = addon;
