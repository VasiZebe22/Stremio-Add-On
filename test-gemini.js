// Simple script to test the Google Gemini API
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testGeminiAPI() {
  console.log('Testing Gemini API...');
  console.log(`API Key: ${process.env.GEMINI_API_KEY.substring(0, 5)}...${process.env.GEMINI_API_KEY.substring(process.env.GEMINI_API_KEY.length - 5)}`);
  
  try {
    // Initialize the API
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    console.log('API initialized successfully');
    
    // Get the model
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    console.log('Model retrieved successfully');
    
    // Simple test prompt
    const prompt = "Translate this to Greek: Hello, how are you?";
    console.log(`Sending prompt: "${prompt}"`);
    
    // Generate content
    const result = await model.generateContent(prompt);
    console.log('Response received');
    
    // Get the response
    const response = result.response;
    const text = response.text();
    
    console.log('Translation result:');
    console.log(text);
    
    console.log('Test completed successfully!');
  } catch (error) {
    console.error('Error testing Gemini API:');
    console.error(error);
  }
}

// Run the test
testGeminiAPI();
