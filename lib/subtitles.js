const axios = require('axios');
const NodeCache = require('node-cache');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const crypto = require('crypto');

// Promisify fs functions
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const readFile = promisify(fs.readFile);
const fileExists = promisify(fs.exists);

// Create a cache for subtitles
const subtitleCache = new NodeCache({ stdTTL: 86400 }); // Cache for 24 hours

// Create a cache for translations
const translationCache = new NodeCache({ stdTTL: 86400 }); // Cache for 24 hours

// Ensure cache directory exists
const CACHE_DIR = path.join(__dirname, '../cache');
async function ensureCacheDir() {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    return true;
  } catch (error) {
    if (error.code !== 'EEXIST') {
      console.error(`Error creating cache directory: ${error.message}`);
      return false;
    }
    return true;
  }
}

/**
 * Find subtitles for a specific content
 * @param {string} type - Type of content (movie, series, anime)
 * @param {string} mediaId - IMDb ID or Kitsu ID
 * @returns {Array} - Array of subtitle objects
 */
async function findSubtitles(type, mediaId) {
  // Check cache first
  const cacheKey = `subtitles-${type}-${mediaId}`;
  const cachedSubtitles = subtitleCache.get(cacheKey);
  
  if (cachedSubtitles) {
    console.log(`Using cached subtitles for ${mediaId}`);
    return cachedSubtitles;
  }
  
  // We'll search for subtitles from multiple sources and combine the results
  let subtitles = [];
  
  // 1. OpenSubtitles
  try {
    console.log(`Searching OpenSubtitles for ${mediaId}`);
    const osSubtitles = await searchOpenSubtitles(type, mediaId);
    subtitles = [...subtitles, ...osSubtitles];
  } catch (error) {
    console.error(`OpenSubtitles search failed: ${error.message}`);
  }
  
  // 2. Other subtitle sources could be added here
  // For example, you could add Subscene or other providers
  
  // Cache the results
  if (subtitles.length > 0) {
    subtitleCache.set(cacheKey, subtitles);
  }
  
  return subtitles;
}

/**
 * Get the best subtitle to translate from
 * @param {Array} subtitles - Array of subtitle objects
 * @param {string} preferredSourceLang - Preferred source language (default: 'en')
 * @returns {Object} - Best subtitle object
 */
function getBestSubtitle(subtitles, preferredSourceLang = 'en') {
  if (!subtitles || subtitles.length === 0) {
    return null;
  }
  
  // First, try to find a subtitle in the preferred source language
  const preferredLangSubs = subtitles.filter(sub => 
    sub.lang === preferredSourceLang && !sub.pending
  );
  
  if (preferredLangSubs.length > 0) {
    // Sort by rating (highest first)
    preferredLangSubs.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    return preferredLangSubs[0];
  }
  
  // If no preferred language subtitles, get the highest rated subtitle
  const sortedSubs = [...subtitles]
    .filter(sub => !sub.pending)
    .sort((a, b) => (b.rating || 0) - (a.rating || 0));
  
  return sortedSubs.length > 0 ? sortedSubs[0] : null;
}

/**
 * Find the best subtitle for translation based on user's target language
 * @param {Array} subtitles - Array of subtitle objects
 * @param {string} targetLang - Target language for translation
 * @returns {Object} - Best subtitle object for translation
 */
function findBestSubtitleForTranslation(subtitles, targetLang) {
  if (!subtitles || subtitles.length === 0) {
    return null;
  }
  
  // Skip subtitles that are already in the target language
  const filteredSubs = subtitles.filter(sub => 
    sub.lang !== targetLang && 
    (typeof sub.id !== 'string' || !sub.id.includes('_translate_')) // Check if id is a string before using includes
  );
  
  if (filteredSubs.length === 0) {
    return null;
  }
  
  // Prioritize English subtitles as source
  const englishSubs = filteredSubs.filter(sub => sub.lang === 'en');
  
  if (englishSubs.length > 0) {
    // Sort by rating (highest first)
    englishSubs.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    return englishSubs[0];
  }
  
  // If no English subtitles, get the highest rated subtitle
  filteredSubs.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  return filteredSubs[0];
}

/**
 * Get the content of a subtitle file from a URL
 * @param {string} url - URL of the subtitle file
 * @returns {Promise<string>} - Content of the subtitle file
 */
async function getSubtitleContent(url) {
  try {
    console.log(`Fetching subtitle content from: ${url}`);
    
    // Check if this is a local URL
    if (url.includes('localhost') || url.includes('127.0.0.1')) {
      const localPath = url.split('/subtitles/')[1];
      if (localPath) {
        // This is a local subtitle file
        const filePath = path.join(CACHE_DIR, localPath);
        if (await fileExists(filePath)) {
          return await readFile(filePath, 'utf8');
        } else {
          // If this is our dummy file
          if (localPath.includes('dummy.vtt')) {
            return 'WEBVTT\n\nNOTE This is a placeholder subtitle file\n\n1\n00:00:01.000 --> 00:00:10.000\nTranslation in progress...\n\n2\n00:00:11.000 --> 00:00:20.000\nPlease wait while we translate the subtitles for you.';
          }
          throw new Error(`Local subtitle file not found: ${filePath}`);
        }
      }
    }
    
    // Fetch the subtitle content
    const response = await axios.get(url, {
      responseType: 'text',
      headers: {
        'Accept': 'text/plain, text/html, application/xhtml+xml, application/xml, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 10000 // 10 seconds timeout
    });
    
    // Check if we got a valid response
    if (response.status !== 200) {
      throw new Error(`Failed to fetch subtitle content: ${response.status} ${response.statusText}`);
    }
    
    // Check if the content is valid
    const content = response.data;
    if (!content || typeof content !== 'string') {
      throw new Error('Invalid subtitle content received');
    }
    
    // Detect the subtitle format
    let format = 'unknown';
    if (content.trim().startsWith('WEBVTT')) {
      format = 'vtt';
    } else if (/^\d+\r?\n\d{2}:\d{2}:\d{2},\d{3}\s-->\s\d{2}:\d{2}:\d{2},\d{3}/m.test(content)) {
      format = 'srt';
    }
    
    console.log(`Detected subtitle format: ${format}`);
    
    // If it's SRT but the URL ends with .vtt, convert it to VTT
    if (format === 'srt' && url.toLowerCase().endsWith('.vtt')) {
      console.log('Converting SRT to VTT format');
      return convertSrtToVtt(content);
    }
    
    // If it's VTT but the URL ends with .srt, convert it to SRT
    if (format === 'vtt' && url.toLowerCase().endsWith('.srt')) {
      console.log('Converting VTT to SRT format');
      return convertVttToSrt(content);
    }
    
    return content;
  } catch (error) {
    console.error(`Error fetching subtitle content: ${error.message}`);
    throw error;
  }
}

/**
 * Convert SRT format to WebVTT format
 * @param {string} srtContent - SRT content
 * @returns {string} - WebVTT content
 */
function convertSrtToVtt(srtContent) {
  // Start with the WEBVTT header
  let vttContent = 'WEBVTT\n\n';
  
  // Split content into blocks (each subtitle entry)
  const blocks = srtContent.split(/\r?\n\r?\n/);
  
  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    if (lines.length < 3) continue;
    
    // The first line is the index (keep it as is)
    const index = lines[0];
    
    // The second line contains the timestamps - convert from SRT to VTT format
    const timeMatch = lines[1].match(/(\d{2}:\d{2}:\d{2}),(\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}),(\d{3})/);
    if (!timeMatch) continue;
    
    const startTime = `${timeMatch[1]}.${timeMatch[2]}`;
    const endTime = `${timeMatch[3]}.${timeMatch[4]}`;
    const timeLine = `${startTime} --> ${endTime}`;
    
    // The remaining lines are the text
    const text = lines.slice(2).join('\n');
    
    // Add this block to the VTT content
    vttContent += `${index}\n${timeLine}\n${text}\n\n`;
  }
  
  return vttContent;
}

/**
 * Convert WebVTT format to SRT format
 * @param {string} vttContent - WebVTT content
 * @returns {string} - SRT content
 */
function convertVttToSrt(vttContent) {
  // Remove the WEBVTT header and any NOTE sections
  const contentWithoutHeader = vttContent.replace(/^WEBVTT.*?(?:\r?\n\r?\n)/s, '');
  const cleanedContent = contentWithoutHeader.replace(/NOTE.*?(?:\r?\n\r?\n)/gs, '');
  
  // Split content into blocks (each subtitle entry)
  const blocks = cleanedContent.split(/\r?\n\r?\n/);
  
  let srtContent = '';
  let index = 1;
  
  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    if (lines.length < 2) continue;
    
    // Find the line with the timestamp
    let timeLineIndex = 0;
    let timeLine = lines[timeLineIndex];
    
    // If the first line is a cue identifier (could be a number or text), skip it
    if (!timeLine.includes('-->')) {
      timeLineIndex++;
      if (timeLineIndex >= lines.length) continue;
      timeLine = lines[timeLineIndex];
    }
    
    // Parse the timestamp line and convert from VTT to SRT format
    const timeMatch = timeLine.match(/(\d{2}:\d{2}:\d{2})\.(\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2})\.(\d{3})/);
    if (!timeMatch) continue;
    
    const startTime = `${timeMatch[1]},${timeMatch[2]}`;
    const endTime = `${timeMatch[3]},${timeMatch[4]}`;
    const srtTimeLine = `${startTime} --> ${endTime}`;
    
    // The remaining lines are the text
    const text = lines.slice(timeLineIndex + 1).join('\n');
    
    // Add this block to the SRT content
    srtContent += `${index}\n${srtTimeLine}\n${text}\n\n`;
    
    index++;
  }
  
  return srtContent;
}

/**
 * Save a translated subtitle to disk and return a subtitle object
 * @param {string} mediaId - IMDb ID or Kitsu ID
 * @param {string} content - Translated subtitle content
 * @param {string} lang - Language code
 * @param {string} title - Title of the subtitle
 * @returns {Object} - Subtitle object
 */
async function saveTranslatedSubtitle(mediaId, content, lang, title) {
  // Ensure cache directory exists
  const dirExists = await ensureCacheDir();
  if (!dirExists) {
    throw new Error('Could not create cache directory');
  }
  
  // Generate a unique ID for this subtitle
  const subtitleId = crypto.randomBytes(8).toString('hex');
  
  // Determine the file extension based on content
  const isVtt = content.trim().startsWith('WEBVTT');
  const fileExtension = isVtt ? 'vtt' : 'srt';
  
  // Create a file path - use a format that's easy to find later
  const fileName = `${mediaId}-${lang}-${subtitleId}.${fileExtension}`;
  const filePath = path.join(CACHE_DIR, fileName);
  
  console.log(`Saving translated subtitle to: ${filePath}`);
  
  // Write the content to disk
  await writeFile(filePath, content, 'utf8');
  
  // Create a subtitle object with special properties to make it appear at the top
  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 7000}`;
  const subtitle = {
    id: `${lang}-${subtitleId}`,
    url: `${baseUrl}/subtitles/${mediaId}/${lang}-${subtitleId}.${fileExtension}`,
    lang,
    title,
    // Add special properties to make our translated subtitles appear at the top
    // and be more noticeable to the user
    downloads: 999999, // Very high number to ensure it's sorted to the top
    rating: 10,        // Maximum rating to ensure it's prioritized
    isTranslated: true // Custom flag to identify our translations
  };
  
  // Update the cache to include this new subtitle
  const cacheKey = `subtitles-${mediaId}`;
  const cachedSubtitles = subtitleCache.get(cacheKey) || [];
  
  // Add the new subtitle at the beginning of the array to prioritize it
  subtitleCache.set(cacheKey, [subtitle, ...cachedSubtitles]);
  
  return subtitle;
}

/**
 * Handles a subtitle translation request
 * @param {string} originalId - The ID of the original subtitle to translate
 * @param {string} mediaId - The ID of the media
 * @param {string} targetLang - The target language code
 * @param {Object} translationService - The translation service to use
 * @returns {Promise<Object>} - The translated subtitle object
 */
async function handleTranslationRequest(originalId, mediaId, targetLang, translationService) {
  console.log(`Translation request: originalId=${originalId}, mediaId=${mediaId}, targetLang=${targetLang}`);
  
  try {
    // Generate a cache key for this translation
    const cacheKey = `translation_${originalId}_${targetLang}`;
    
    // Check if we have a cached translation
    const cachedTranslation = subtitleCache.get(cacheKey);
    if (cachedTranslation) {
      console.log(`Using cached translation for ${originalId} to ${targetLang}`);
      return cachedTranslation;
    }
    
    // Get the cached subtitles for this media
    const cachedSubtitles = subtitleCache.get(mediaId);
    if (!cachedSubtitles || cachedSubtitles.length === 0) {
      console.log(`No cached subtitles found for ${mediaId}, fetching from API`);
      
      // Try to fetch subtitles from the API
      await fetchSubtitlesFromAPI(mediaId);
    }
    
    // Check again after potential fetch
    const subtitles = subtitleCache.get(mediaId) || [];
    
    // Find the original subtitle by ID
    const originalSubtitle = subtitles.find(sub => sub.id === originalId);
    
    if (!originalSubtitle) {
      console.error(`Original subtitle ${originalId} not found for media ${mediaId}`);
      
      // Create a fallback subtitle with a static message
      const fallbackSubtitle = {
        id: `translate_${originalId}_${targetLang}`,
        url: path.join(__dirname, '..', 'public', 'dummy.vtt'),
        lang: targetLang,
        format: 'vtt'
      };
      
      // Cache this fallback to avoid repeated failures
      subtitleCache.set(cacheKey, fallbackSubtitle);
      
      return fallbackSubtitle;
    }
    
    console.log(`Found original subtitle: ${originalSubtitle.id}, format: ${originalSubtitle.format}`);
    
    // Get the content of the original subtitle
    let subtitleContent;
    
    try {
      // Check if the subtitle URL is a local path or a remote URL
      if (originalSubtitle.url.startsWith('http')) {
        // Fetch from remote URL
        const response = await axios.get(originalSubtitle.url);
        subtitleContent = response.data;
      } else {
        // Read from local file
        subtitleContent = fs.readFileSync(originalSubtitle.url, 'utf8');
      }
    } catch (error) {
      console.error(`Error fetching original subtitle content: ${error.message}`);
      
      // Use a dummy subtitle file as fallback
      const dummyPath = path.join(__dirname, '..', 'public', 'dummy.vtt');
      subtitleContent = fs.readFileSync(dummyPath, 'utf8');
    }
    
    // Translate the subtitle content
    console.log(`Translating subtitle from ${originalSubtitle.lang} to ${targetLang}`);
    const translatedContent = await translationService.translateSubtitle(
      subtitleContent,
      originalSubtitle.lang || 'en',
      targetLang
    );
    
    // Create a temporary file for the translated subtitle
    const translatedFileName = `translate_${originalId}_${targetLang}.${originalSubtitle.format || 'vtt'}`;
    const translatedFilePath = path.join(__dirname, '..', 'public', 'translations', translatedFileName);
    
    // Ensure the translations directory exists
    if (!fs.existsSync(path.join(__dirname, '..', 'public', 'translations'))) {
      fs.mkdirSync(path.join(__dirname, '..', 'public', 'translations'), { recursive: true });
    }
    
    // Write the translated content to the file
    fs.writeFileSync(translatedFilePath, translatedContent);
    
    // Create a subtitle object for the translation
    const translatedSubtitle = {
      id: `translate_${originalId}_${targetLang}`,
      url: translatedFilePath,
      lang: targetLang,
      format: originalSubtitle.format || 'vtt'
    };
    
    // Cache the translated subtitle
    subtitleCache.set(cacheKey, translatedSubtitle);
    
    return translatedSubtitle;
  } catch (error) {
    console.error(`Error handling translation request: ${error.message}`);
    
    // Create a fallback subtitle with a static message
    const fallbackSubtitle = {
      id: `translate_${originalId}_${targetLang}`,
      url: path.join(__dirname, '..', 'public', 'dummy.vtt'),
      lang: targetLang,
      format: 'vtt'
    };
    
    return fallbackSubtitle;
  }
}

/**
 * Find a cached translation for a subtitle
 * @param {string} subtitleId - The ID of the original subtitle
 * @param {string} targetLang - The target language code
 * @returns {Object|null} - The cached translation or null if not found
 */
function findCachedTranslation(subtitleId, targetLang) {
  const cacheDir = getCacheDir();
  const cacheFilePath = path.join(cacheDir, `${subtitleId}_${targetLang}.json`);
  
  if (fs.existsSync(cacheFilePath)) {
    try {
      const cachedData = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
      console.log(`Found cached translation for subtitle ${subtitleId} in ${targetLang}`);
      return cachedData;
    } catch (error) {
      console.error(`Error reading cached translation: ${error.message}`);
    }
  }
  
  return null;
}

/**
 * Search for subtitles on OpenSubtitles.org
 * @param {string} type - Type of content (movie, series, anime)
 * @param {string} mediaId - IMDb ID or Kitsu ID
 * @returns {Array} - Array of subtitle objects
 */
async function searchOpenSubtitles(type, mediaId) {
  const apiKey = process.env.OPENSUBTITLES_API_KEY;
  
  if (!apiKey) {
    console.warn('OpenSubtitles API key not found in environment variables');
    return [];
  }
  
  try {
    // Format the IMDb ID correctly (OpenSubtitles expects it without 'tt' prefix)
    let imdbId = mediaId;
    if (mediaId.startsWith('tt')) {
      imdbId = mediaId.replace('tt', '');
    }
    
    // For Kitsu IDs, we would need to handle them differently or skip
    if (mediaId.includes('kitsu')) {
      console.log('Kitsu IDs not supported for OpenSubtitles search');
      return [];
    }
    
    // Make the API request
    const response = await axios.get('https://api.opensubtitles.com/api/v1/subtitles', {
      params: {
        imdb_id: imdbId,
        type: type === 'movie' ? 'movie' : 'episode'
      },
      headers: {
        'Api-Key': apiKey,
        'Content-Type': 'application/json'
      }
    });
    
    // Check if we have results
    if (!response.data || !response.data.data || !Array.isArray(response.data.data)) {
      return [];
    }
    
    // Format the results
    return response.data.data.map(item => ({
      id: item.attributes.files[0].file_id,
      url: `https://api.opensubtitles.com/api/v1/download`, // We'll need to download this separately
      download_url: item.attributes.files[0].file_id, // Store the file_id for later download
      lang: item.attributes.language,
      title: item.attributes.release,
      downloads: item.attributes.download_count || 0,
      rating: item.attributes.ratings > 0 ? item.attributes.ratings / item.attributes.votes : 0
    }));
  } catch (error) {
    console.error(`OpenSubtitles API error: ${error.message}`);
    return [];
  }
}

/**
 * Download a subtitle file from OpenSubtitles
 * @param {string} fileId - File ID from OpenSubtitles
 * @returns {string} - Subtitle content
 */
async function downloadOpenSubtitlesFile(fileId) {
  const apiKey = process.env.OPENSUBTITLES_API_KEY;
  
  if (!apiKey) {
    throw new Error('OpenSubtitles API key not found in environment variables');
  }
  
  try {
    // Request a download
    const response = await axios.post('https://api.opensubtitles.com/api/v1/download', 
      { file_id: fileId },
      {
        headers: {
          'Api-Key': apiKey,
          'Content-Type': 'application/json'
        }
      }
    );
    
    // Get the download link
    const downloadLink = response.data.link;
    
    // Download the actual subtitle file
    const subtitleResponse = await axios.get(downloadLink);
    return subtitleResponse.data;
  } catch (error) {
    console.error(`Error downloading subtitle from OpenSubtitles: ${error.message}`);
    throw error;
  }
}

/**
 * Get the cache directory path
 * @returns {string} - Path to the cache directory
 */
function getCacheDir() {
  return CACHE_DIR;
}

module.exports = {
  findSubtitles,
  getSubtitleContent,
  handleTranslationRequest,
  saveTranslatedSubtitle,
  findCachedTranslation,
  findBestSubtitleForTranslation,
  getCacheDir,
  searchOpenSubtitles
};
