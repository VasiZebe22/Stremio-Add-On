/**
 * Error handling middleware for the Stremio add-on
 * Provides consistent error handling across the application
 */

const logger = require('./logger');

/**
 * Express middleware for handling errors
 * Catches any errors thrown in routes and returns an appropriate response
 */
function errorHandler(err, req, res, next) {
  // Log the error
  logger.error(`Error handling request: ${req.method} ${req.url}`, err);
  
  // Set status code
  const statusCode = err.statusCode || 500;
  
  // Determine if this is a JSON request
  const isJson = req.headers.accept && req.headers.accept.includes('application/json');
  
  // Return an appropriate response
  if (isJson) {
    res.status(statusCode).json({
      error: err.message,
      status: statusCode
    });
  } else {
    // For subtitle requests, return a basic subtitle file
    if (req.url.endsWith('.vtt') || req.url.endsWith('.srt')) {
      res.status(200);
      
      if (req.url.endsWith('.vtt')) {
        res.setHeader('Content-Type', 'text/vtt');
        res.send('WEBVTT\n\n1\n00:00:01.000 --> 00:00:10.000\nError: ' + err.message);
      } else {
        res.setHeader('Content-Type', 'text/plain');
        res.send('1\n00:00:01,000 --> 00:00:10,000\nError: ' + err.message);
      }
    } else {
      // For HTML requests, return a simple error page
      res.status(statusCode).send(`
        <html>
          <head>
            <title>Error - Stremio Add-on</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                margin: 0;
                padding: 20px;
                background-color: #f5f5f5;
              }
              .error-container {
                max-width: 800px;
                margin: 0 auto;
                background-color: #fff;
                border-radius: 5px;
                box-shadow: 0 2px 5px rgba(0,0,0,0.1);
                padding: 20px;
              }
              h1 {
                color: #e53935;
                margin-top: 0;
              }
              pre {
                background-color: #f5f5f5;
                padding: 10px;
                border-radius: 5px;
                overflow-x: auto;
              }
            </style>
          </head>
          <body>
            <div class="error-container">
              <h1>Error</h1>
              <p>An error occurred while processing your request:</p>
              <pre>${err.message}</pre>
              <p>Please try again later or contact the administrator if the problem persists.</p>
            </div>
          </body>
        </html>
      `);
    }
  }
}

/**
 * Express middleware for handling 404 errors
 * Catches requests to non-existent routes
 */
function notFoundHandler(req, res, next) {
  // Log the 404
  logger.log(`404 Not Found: ${req.method} ${req.url}`);
  
  // Determine if this is a JSON request
  const isJson = req.headers.accept && req.headers.accept.includes('application/json');
  
  // Return an appropriate response
  if (isJson) {
    res.status(404).json({
      error: 'Not Found',
      status: 404
    });
  } else {
    // For subtitle requests, return a basic subtitle file
    if (req.url.endsWith('.vtt') || req.url.endsWith('.srt')) {
      res.status(200);
      
      if (req.url.endsWith('.vtt')) {
        res.setHeader('Content-Type', 'text/vtt');
        res.send('WEBVTT\n\n1\n00:00:01.000 --> 00:00:10.000\nSubtitle not found.');
      } else {
        res.setHeader('Content-Type', 'text/plain');
        res.send('1\n00:00:01,000 --> 00:00:10,000\nSubtitle not found.');
      }
    } else {
      // For HTML requests, return a simple 404 page
      res.status(404).send(`
        <html>
          <head>
            <title>404 Not Found - Stremio Add-on</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                margin: 0;
                padding: 20px;
                background-color: #f5f5f5;
              }
              .error-container {
                max-width: 800px;
                margin: 0 auto;
                background-color: #fff;
                border-radius: 5px;
                box-shadow: 0 2px 5px rgba(0,0,0,0.1);
                padding: 20px;
              }
              h1 {
                color: #2196f3;
                margin-top: 0;
              }
              pre {
                background-color: #f5f5f5;
                padding: 10px;
                border-radius: 5px;
                overflow-x: auto;
              }
            </style>
          </head>
          <body>
            <div class="error-container">
              <h1>404 Not Found</h1>
              <p>The requested resource could not be found:</p>
              <pre>${req.method} ${req.url}</pre>
              <p>Please check the URL and try again.</p>
            </div>
          </body>
        </html>
      `);
    }
  }
}

module.exports = {
  errorHandler,
  notFoundHandler
};
