/**
 * This script tests the Gemini API directly with a simple request
 * to verify if the API key is working correctly.
 */

require('dotenv').config();
const axios = require('axios');

// Get the API key from environment variables
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error('Error: GEMINI_API_KEY not found in environment variables');
  process.exit(1);
}

// Function to test the Gemini API
async function testGeminiApi() {
  try {
    console.log('Testing Gemini API connection...');
    
    // First, try to list models to check API connectivity
    const modelsUrl = `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`;
    
    console.log(`Fetching models from Gemini API...`);
    
    const modelsResponse = await axios.get(modelsUrl);
    console.log('Models API response status:', modelsResponse.status);
    console.log('Available models:');
    
    // Display the first 5 models
    modelsResponse.data.models.slice(0, 5).forEach(model => {
      console.log(`- ${model.name}`);
    });
    
    // Now try a simple content generation
    const generateUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent?key=${apiKey}`;
    
    console.log('\nTesting content generation...');
    
    const generateResponse = await axios.post(generateUrl, {
      contents: [
        {
          parts: [
            {
              text: "Hello, please respond with a simple 'Hello, world!'"
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 100,
      }
    });
    
    console.log('Generate API response status:', generateResponse.status);
    
    // Extract the response text
    const responseText = generateResponse.data.candidates[0].content.parts[0].text;
    console.log('API response:', responseText);
    
    console.log('\n✅ Gemini API is working correctly!');
  } catch (error) {
    console.error('\n❌ Gemini API test failed:');
    
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error(`Status: ${error.response.status}`);
      console.error('Response data:', error.response.data);
      
      if (error.response.status === 400) {
        console.error('\nPossible issues:');
        console.error('- API key might be invalid or expired');
        console.error('- Request format might be incorrect');
      } else if (error.response.status === 403) {
        console.error('\nPossible issues:');
        console.error('- API key might not have permission to access this resource');
        console.error('- API key might be restricted to certain domains or IPs');
      } else if (error.response.status === 404) {
        console.error('\nPossible issues:');
        console.error('- The API endpoint URL might be incorrect');
        console.error('- The model name might be incorrect or not available');
      }
    } else if (error.request) {
      // The request was made but no response was received
      console.error('No response received from API. Network issues or API endpoint might be down.');
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('Error:', error.message);
    }
    
    console.error('\nCheck your API key and try again.');
  }
}

// Run the test
testGeminiApi();
