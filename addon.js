const { addonBuilder } = require('stremio-addon-sdk');
const manifest = require('./manifest.json');
const subtitleService = require('./lib/subtitles');
const translationService = require('./lib/translation');
const os = require('os');
const networkInterfaces = os.networkInterfaces;

// Create the addon builder with the manifest
const builder = new addonBuilder(manifest);

// Define the subtitles handler
builder.defineSubtitlesHandler(async ({ type, id, extra }) => {
  console.log(`Subtitle request received for ${type}/${id}`);
  
  // Extract the IMDb ID or Kitsu ID
  const mediaId = id;
  
  // Get the preferred language from Stremio (or default to Greek)
  // If user has set a preferred language in the configuration, use that instead
  const userConfig = extra.config || {};
  const userLang = userConfig.targetLanguage || extra.language || 'el'; // Default to Greek
  console.log(`User language: ${userLang}`);
  
  try {
    // Step 1: Find existing subtitles for this content
    let subtitles = await subtitleService.findSubtitles(type, mediaId);
    console.log(`Found ${subtitles.length} subtitle(s)`);
    
    // Step 2: Always add our translation option regardless of available subtitles
    const targetLangName = translationService.getLanguageName(userLang);
    
    // Create a placeholder translation option that will always be visible
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 7000}`;
    
    // Get the local IP address for direct access
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
    
    console.log(`Using local IP: ${localIp}`);
    
    // Use a consistent URL structure for all videos
    // This ensures that our universal handler will catch all requests
    const directUrl = `http://${localIp}:${process.env.PORT || 7000}/subtitles/any/translate_${userLang}.vtt`;
    console.log(`Universal translation URL: ${directUrl}`);
    
    const translationOption = {
      id: `translate_${mediaId}_${userLang}`,
      // Use a direct URL that Stremio can access
      url: directUrl,
      lang: userLang,
      langName: `${targetLangName} (AI)`,
      title: `⭐ ${targetLangName} - AI Translation`,
      rating: 10
    };
    
    // Add our translation option to the list
    subtitles.push(translationOption);
    
    // Step 3: If we have actual subtitles, add specific translation options for them
    if (subtitles.length > 1) { // More than just our placeholder
      // Find the best subtitles to offer for translation (prioritize English, then others)
      const englishSubs = subtitles.filter(sub => sub.lang === 'en' && !sub.id.includes('subtito_translate_'));
      const otherSubs = subtitles.filter(sub => sub.lang !== 'en' && sub.lang !== userLang && !sub.id.includes('subtito_translate_'));
      
      // Prioritize English subtitles for translation, then others
      const subsToTranslate = englishSubs.length > 0 ? englishSubs : otherSubs;
      
      // Add translation options for the best subtitles (limit to top 3)
      for (let i = 0; i < Math.min(subsToTranslate.length, 3); i++) {
        const sub = subsToTranslate[i];
        const sourceLangName = translationService.getLanguageName(sub.lang);
        
        // Create a translation option for this specific subtitle
        const specificTranslationOption = {
          id: `${sub.id}_translate_${userLang}`,
          // Use a URL that will trigger our translation endpoint
          url: `${baseUrl}/subtitles/${mediaId}/${sub.id}_translate_${userLang}.vtt`,
          lang: userLang,
          langName: `${targetLangName} (AI)`,
          title: `🔄 ${targetLangName} [${sourceLangName} → ${targetLangName}]`,
          rating: 9 - i // Slightly lower rating than our main option
        };
        
        // Add this specific translation option
        subtitles.push(specificTranslationOption);
      }
    }
    
    // Step 4: If we have Greek subtitles, prioritize them
    const greekSubs = subtitles.filter(sub => sub.lang === 'el' && !sub.id.includes('subtito_translate_'));
    if (greekSubs.length > 0) {
      // Boost the rating of Greek subtitles to make them appear at the top
      greekSubs.forEach(sub => {
        sub.rating = 11; // Higher than our translation options
      });
    }
    
    // Log the final subtitle options
    console.log(`Returning ${subtitles.length} subtitle options`);
    
    return { subtitles };
  } catch (error) {
    console.error(`Error in subtitle handler: ${error.message}`);
    
    // Even if there's an error, return at least our translation option
    const targetLangName = translationService.getLanguageName(userLang);
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 7000}`;
    
    // Get the local IP address for direct access
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
    
    console.log(`Using local IP: ${localIp}`);
    
    // Use a consistent URL structure for all videos
    // This ensures that our universal handler will catch all requests
    const directUrl = `http://${localIp}:${process.env.PORT || 7000}/subtitles/any/translate_${userLang}.vtt`;
    console.log(`Universal translation URL: ${directUrl}`);
    
    const fallbackOption = {
      id: `translate_${mediaId}_${userLang}`,
      url: directUrl,
      lang: userLang,
      langName: `${targetLangName} (AI)`,
      title: `⭐ ${targetLangName} - AI Translation`,
      rating: 10
    };
    
    return { subtitles: [fallbackOption] };
  }
});

// Create the addon
const addon = builder.getInterface();

module.exports = addon;
