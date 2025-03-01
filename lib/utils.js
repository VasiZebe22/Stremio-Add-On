/**
 * utils.js - Utility functions for the subtitle add-on
 */

const path = require('path');
const fs = require('fs');
const util = require('util');
const crypto = require('crypto');
const axios = require('axios');

// Promisify fs functions
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const mkdir = util.promisify(fs.mkdir);
const access = util.promisify(fs.access);

/**
 * Generates a hash from a string
 * @param {string} str - String to hash
 * @returns {string} - MD5 hash
 */
function generateHash(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

/**
 * Creates a directory if it doesn't exist
 * @param {string} dirPath - Path to directory
 * @returns {Promise<boolean>} - True if successful
 */
async function ensureDirectoryExists(dirPath) {
  try {
    await access(dirPath, fs.constants.F_OK);
    return true; // Directory exists
  } catch (err) {
    // Directory doesn't exist, create it
    try {
      await mkdir(dirPath, { recursive: true });
      return true;
    } catch (mkdirErr) {
      console.error(`Error creating directory: ${mkdirErr.message}`);
      return false;
    }
  }
}

/**
 * Safely downloads a file from a URL
 * @param {string} url - URL to download from
 * @param {string} outputPath - Path to save the file
 * @returns {Promise<boolean>} - True if successful
 */
async function downloadFile(url, outputPath) {
  try {
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream'
    });

    const writer = fs.createWriteStream(outputPath);

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(true));
      writer.on('error', err => {
        console.error(`Error writing file: ${err.message}`);
        reject(err);
      });
    });
  } catch (error) {
    console.error(`Error downloading file: ${error.message}`);
    return false;
  }
}

/**
 * Converts language codes between formats (ISO 639-1, ISO 639-2, English name)
 * @param {string} lang - Language code or name
 * @param {string} targetFormat - Format to convert to ('iso1', 'iso2', 'name')
 * @returns {string} - Converted language code or name
 */
function convertLanguageCode(lang, targetFormat = 'iso1') {
  // Common language mappings
  const languageMappings = {
    // ISO 639-1 : [ISO 639-2, English Name]
    'en': ['eng', 'English'],
    'es': ['spa', 'Spanish'],
    'fr': ['fra', 'French'],
    'de': ['deu', 'German'],
    'it': ['ita', 'Italian'],
    'pt': ['por', 'Portuguese'],
    'ru': ['rus', 'Russian'],
    'ja': ['jpn', 'Japanese'],
    'zh': ['zho', 'Chinese'],
    'ko': ['kor', 'Korean'],
    'ar': ['ara', 'Arabic'],
    'hi': ['hin', 'Hindi'],
    'tr': ['tur', 'Turkish'],
    'pl': ['pol', 'Polish'],
    'nl': ['nld', 'Dutch'],
    'sv': ['swe', 'Swedish'],
    'el': ['ell', 'Greek'],
    'he': ['heb', 'Hebrew'],
    'vi': ['vie', 'Vietnamese'],
    'th': ['tha', 'Thai'],
    'no': ['nor', 'Norwegian'],
    'fi': ['fin', 'Finnish'],
    'da': ['dan', 'Danish'],
    'cs': ['ces', 'Czech'],
    'hu': ['hun', 'Hungarian'],
    'ro': ['ron', 'Romanian'],
    'uk': ['ukr', 'Ukrainian'],
    'id': ['ind', 'Indonesian'],
    'fa': ['fas', 'Persian'],
    'ms': ['msa', 'Malay']
  };

  // Handle different input formats
  let iso1;
  let targetValue;

  // Determine the input format
  if (lang.length === 2 && languageMappings[lang.toLowerCase()]) {
    // Input is ISO 639-1
    iso1 = lang.toLowerCase();
  } else if (lang.length === 3) {
    // Input might be ISO 639-2
    for (const [key, value] of Object.entries(languageMappings)) {
      if (value[0].toLowerCase() === lang.toLowerCase()) {
        iso1 = key;
        break;
      }
    }
  } else {
    // Input might be a language name
    for (const [key, value] of Object.entries(languageMappings)) {
      if (value[1].toLowerCase() === lang.toLowerCase()) {
        iso1 = key;
        break;
      }
    }
  }

  // If we couldn't determine the input format, return the original input
  if (!iso1) return lang;

  // Convert to target format
  switch (targetFormat) {
    case 'iso1':
      targetValue = iso1;
      break;
    case 'iso2':
      targetValue = languageMappings[iso1][0];
      break;
    case 'name':
      targetValue = languageMappings[iso1][1];
      break;
    default:
      targetValue = iso1;
  }

  return targetValue;
}

/**
 * Parses and validates an IMDb ID
 * @param {string} id - ID to validate
 * @returns {string|null} - Normalized IMDb ID or null if invalid
 */
function parseImdbId(id) {
  // IMDb IDs start with 'tt' followed by at least 7 digits
  const imdbRegex = /^(tt)?(\d{7,})/i;
  const match = id.match(imdbRegex);
  
  if (match) {
    return `tt${match[2]}`;
  }
  
  return null;
}

/**
 * Safely reads a JSON file
 * @param {string} filePath - Path to JSON file
 * @param {any} defaultValue - Default value if file doesn't exist or is invalid
 * @returns {Promise<any>} - Parsed JSON or default value
 */
async function readJsonFile(filePath, defaultValue = null) {
  try {
    const content = await readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist
      return defaultValue;
    }
    
    console.error(`Error reading JSON file: ${error.message}`);
    return defaultValue;
  }
}

/**
 * Safely writes a JSON file
 * @param {string} filePath - Path to save JSON file
 * @param {any} data - Data to write
 * @returns {Promise<boolean>} - True if successful
 */
async function writeJsonFile(filePath, data) {
  try {
    const dirPath = path.dirname(filePath);
    await ensureDirectoryExists(dirPath);
    
    await writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error(`Error writing JSON file: ${error.message}`);
    return false;
  }
}

/**
 * Formats a timestamp in SRT format (00:00:00,000)
 * @param {number} seconds - Time in seconds
 * @returns {string} - Formatted timestamp
 */
function formatSrtTimestamp(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const milliseconds = Math.floor((seconds % 1) * 1000);
  
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
}

/**
 * Parses an SRT timestamp to seconds
 * @param {string} timestamp - SRT format timestamp (00:00:00,000)
 * @returns {number} - Time in seconds
 */
function parseSrtTimestamp(timestamp) {
  const regex = /(\d{2}):(\d{2}):(\d{2}),(\d{3})/;
  const match = timestamp.match(regex);
  
  if (!match) return 0;
  
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  const milliseconds = parseInt(match[4], 10);
  
  return hours * 3600 + minutes * 60 + seconds + (milliseconds / 1000);
}

/**
 * Gets a valid file path for a subtitle file based on media ID and language
 * @param {string} mediaId - IMDb ID or other media identifier
 * @param {string} lang - Language code
 * @param {string} suffix - Optional suffix
 * @returns {string} - Valid file path
 */
function getSubtitleFilePath(mediaId, lang, suffix = '') {
  const baseDir = path.join(__dirname, '../cache/subtitles');
  const hash = suffix ? generateHash(`${suffix}`) : '';
  return path.join(baseDir, `${mediaId}_${lang}${hash ? '_' + hash : ''}.srt`);
}

/**
 * Creates a delay (sleep)
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Implements exponential backoff for retrying operations
 * @param {Function} operation - Function to execute
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} baseDelay - Base delay in milliseconds
 * @returns {Promise<any>} - Result of operation
 */
async function retryWithExponentialBackoff(operation, maxRetries = 3, baseDelay = 1000) {
  let retries = 0;
  
  while (true) {
    try {
      return await operation();
    } catch (error) {
      retries++;
      
      if (retries > maxRetries) {
        console.error(`Max retries (${maxRetries}) exceeded`);
        throw error;
      }
      
      const delayTime = baseDelay * Math.pow(2, retries - 1);
      console.log(`Retry ${retries} after ${delayTime}ms`);
      await delay(delayTime);
    }
  }
}

module.exports = {
  generateHash,
  ensureDirectoryExists,
  downloadFile,
  convertLanguageCode,
  parseImdbId,
  readJsonFile,
  writeJsonFile,
  formatSrtTimestamp,
  parseSrtTimestamp,
  getSubtitleFilePath,
  delay,
  retryWithExponentialBackoff
};
