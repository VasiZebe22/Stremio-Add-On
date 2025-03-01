/**
 * Logger middleware for the Stremio add-on
 * Provides consistent logging across the application
 */

const fs = require('fs');
const path = require('path');
const util = require('util');

// Create a write stream for the log file
const logStream = fs.createWriteStream(path.join(__dirname, '..', 'server.log'), { flags: 'a' });

/**
 * Log a message to the console and log file
 * @param {string} message - The message to log
 * @param {Object} data - Optional data to include in the log
 */
function log(message, data = null) {
  const timestamp = new Date().toISOString();
  let logMessage = `[${timestamp}] ${message}`;
  
  if (data) {
    logMessage += '\n' + util.inspect(data, { depth: null, colors: false });
  }
  
  console.log(logMessage);
  logStream.write(logMessage + '\n');
}

/**
 * Log an error message to the console and log file
 * @param {string} message - The error message
 * @param {Error} error - The error object
 */
function error(message, error = null) {
  const timestamp = new Date().toISOString();
  let errorMessage = `[${timestamp}] ERROR: ${message}`;
  
  if (error) {
    errorMessage += '\n' + util.inspect(error, { depth: null, colors: false });
    if (error.stack) {
      errorMessage += '\n' + error.stack;
    }
  }
  
  console.error(errorMessage);
  logStream.write(errorMessage + '\n');
}

/**
 * Express middleware for logging requests
 */
function requestLogger(req, res, next) {
  const start = Date.now();
  const timestamp = new Date().toISOString();
  
  // Log the request
  const requestLog = `[${timestamp}] ${req.method} ${req.url}`;
  console.log(requestLog);
  logStream.write(requestLog + '\n');
  
  // Log request headers if debug is enabled
  if (process.env.DEBUG_LOGGING === 'true') {
    const headersLog = `Request Headers: ${JSON.stringify(req.headers)}`;
    console.log(headersLog);
    logStream.write(headersLog + '\n');
  }
  
  // Capture the original end method
  const originalEnd = res.end;
  
  // Override the end method
  res.end = function(chunk, encoding) {
    // Calculate request duration
    const duration = Date.now() - start;
    
    // Log the response
    const responseLog = `[${timestamp}] ${req.method} ${req.url} ${res.statusCode} ${duration}ms`;
    console.log(responseLog);
    logStream.write(responseLog + '\n');
    
    // Call the original end method
    originalEnd.call(this, chunk, encoding);
  };
  
  next();
}

module.exports = {
  log,
  error,
  requestLogger
};
