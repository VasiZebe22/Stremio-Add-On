const axios = require('axios');
const NodeCache = require('node-cache');
const { parse: parseSRT } = require('subtitle');
const { convert } = require('subtitle-converter');

// Create a cache for translations
const translationCache = new NodeCache({ stdTTL: 86400 }); // Cache for 24 hours

// Language mapping for translation
const languageMap = {
  'en': 'English',
  'el': 'Greek',
  'fr': 'French',
  'es': 'Spanish',
  'de': 'German',
  'it': 'Italian',
  'pt': 'Portuguese',
  'ru': 'Russian',
  'ja': 'Japanese',
  'ko': 'Korean',
  'zh': 'Chinese',
  'ar': 'Arabic',
  'hi': 'Hindi',
  'tr': 'Turkish',
  'nl': 'Dutch',
  'sv': 'Swedish',
  'pl': 'Polish',
  'da': 'Danish',
  'fi': 'Finnish',
  'no': 'Norwegian',
  'cs': 'Czech',
  'hu': 'Hungarian',
  'ro': 'Romanian',
  'bg': 'Bulgarian',
  'hr': 'Croatian',
  'sr': 'Serbian',
  'sk': 'Slovak',
  'sl': 'Slovenian',
  'uk': 'Ukrainian',
  'vi': 'Vietnamese',
  'th': 'Thai',
  'id': 'Indonesian',
  'ms': 'Malay',
  'he': 'Hebrew',
  'fa': 'Persian'
};

/**
 * Get the full language name from a language code
 * @param {string} langCode - The language code (e.g., 'en', 'el')
 * @returns {string} - The full language name (e.g., 'English', 'Greek')
 */
function getLanguageName(langCode) {
  return languageMap[langCode] || langCode;
}

/**
 * Parse subtitle content into an array of cues
 * @param {string} content - The subtitle content
 * @param {string} format - The subtitle format ('vtt' or 'srt')
 * @returns {Array} - Array of subtitle cues
 */
function parseSubtitleContent(content, format = 'vtt') {
  try {
    // For SRT format, use the subtitle parser
    if (format === 'srt') {
      return parseSRT(content);
    }
    
    // For VTT format, use a simple regex-based parser
    const cues = [];
    const lines = content.split('\n');
    let currentCue = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip empty lines and WEBVTT header
      if (!line || line === 'WEBVTT') continue;
      
      // Skip NOTE lines
      if (line.startsWith('NOTE')) {
        while (i < lines.length && lines[i].trim()) i++;
        continue;
      }
      
      // Check if this is a timing line (00:00:00.000 --> 00:00:00.000)
      const timingMatch = line.match(/(\d{2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3})/);
      
      if (timingMatch) {
        // If we already have a cue, push it to the array
        if (currentCue) {
          cues.push(currentCue);
        }
        
        // Start a new cue
        currentCue = {
          start: timingMatch[1],
          end: timingMatch[2],
          text: ''
        };
      } 
      // If we have a current cue and this is not a cue number, add it to the text
      else if (currentCue && !line.match(/^\d+$/)) {
        currentCue.text += (currentCue.text ? '\n' : '') + line;
      }
    }
    
    // Add the last cue
    if (currentCue) {
      cues.push(currentCue);
    }
    
    return cues;
  } catch (error) {
    console.error('Error parsing subtitle content:', error);
    return [];
  }
}

/**
 * Convert cues back to VTT format
 * @param {Array} cues - Array of subtitle cues
 * @returns {string} - VTT formatted subtitle content
 */
function convertCuesToVTT(cues) {
  let vttContent = 'WEBVTT\n\n';
  
  cues.forEach((cue, index) => {
    vttContent += `${index + 1}\n`;
    vttContent += `${cue.start} --> ${cue.end}\n`;
    vttContent += `${cue.text}\n\n`;
  });
  
  return vttContent;
}

/**
 * Translate subtitle content using the Gemini API
 * @param {string} content - The subtitle content to translate
 * @param {string} sourceLang - The source language code
 * @param {string} targetLang - The target language code
 * @param {Object} options - Additional options
 * @returns {Promise<string>} - The translated subtitle content
 */
async function translateSubtitle(content, sourceLang, targetLang, options = {}) {
  console.log(`Translating subtitle from ${sourceLang} to ${targetLang}`);
  
  // Generate a cache key based on content hash and languages
  const contentHash = require('crypto').createHash('md5').update(content).digest('hex');
  const cacheKey = `${contentHash}_${sourceLang}_${targetLang}`;
  
  // Check if we have a cached translation
  const cachedTranslation = translationCache.get(cacheKey);
  if (cachedTranslation) {
    console.log('Using cached translation');
    return cachedTranslation;
  }
  
  try {
    // Parse the subtitle content into cues
    const format = content.trim().startsWith('WEBVTT') ? 'vtt' : 'srt';
    const cues = parseSubtitleContent(content, format);
    
    if (cues.length === 0) {
      console.error('No subtitle cues found');
      return content;
    }
    
    console.log(`Found ${cues.length} subtitle cues to translate`);
    
    // Prepare text for translation (batch cues to avoid token limits)
    const batchSize = 10; // Translate 10 cues at a time
    const batches = [];
    
    for (let i = 0; i < cues.length; i += batchSize) {
      batches.push(cues.slice(i, i + batchSize));
    }
    
    console.log(`Split into ${batches.length} batches for translation`);
    
    // Translate each batch
    const translatedBatches = await Promise.all(batches.map(async (batch, batchIndex) => {
      // Extract text from cues
      const textsToTranslate = batch.map(cue => cue.text);
      
      // Prepare the prompt for Gemini
      const prompt = `Translate the following subtitles from ${getLanguageName(sourceLang)} to ${getLanguageName(targetLang)}. 
Keep the same meaning and tone. Return ONLY the translations in order, one per line, with no additional text:

${textsToTranslate.join('\n---\n')}`;
      
      console.log(`Translating batch ${batchIndex + 1}/${batches.length}`);
      
      // Call the Gemini API
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent`,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 8192,
          }
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': process.env.GEMINI_API_KEY
          }
        }
      );
      
      // Check if the response is valid
      if (!response.data || !response.data.candidates || !response.data.candidates[0] || !response.data.candidates[0].content) {
        console.error('Invalid response from Gemini API:', response.data);
        throw new Error('Invalid response from Gemini API');
      }
      
      // Extract the translated text
      const translatedText = response.data.candidates[0].content.parts[0].text;
      
      // Split the translated text into individual translations
      const translations = translatedText.split('\n---\n');
      
      if (translations.length !== batch.length) {
        // If the number of translations doesn't match, try a simpler split
        const simpleSplit = translatedText.split('\n').filter(line => line.trim());
        
        if (simpleSplit.length >= batch.length) {
          return simpleSplit.slice(0, batch.length);
        }
        
        console.warn(`Translation count mismatch: got ${translations.length}, expected ${batch.length}`);
        // Return the original texts if we can't match them
        return textsToTranslate;
      }
      
      return translations;
    }));
    
    // Apply translations to the cues
    let translatedCueIndex = 0;
    translatedBatches.forEach(batchTranslations => {
      batchTranslations.forEach(translation => {
        if (translatedCueIndex < cues.length) {
          cues[translatedCueIndex].text = translation.trim();
          translatedCueIndex++;
        }
      });
    });
    
    // Convert back to VTT
    const translatedContent = convertCuesToVTT(cues);
    
    // Cache the translation
    translationCache.set(cacheKey, translatedContent);
    
    return translatedContent;
  } catch (error) {
    console.error('Error translating subtitle:', error);
    
    // Return the original content if translation fails
    return content;
  }
}

module.exports = {
  getLanguageName,
  translateSubtitle
};
