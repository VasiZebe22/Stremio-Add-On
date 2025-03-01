# Create project directory
mkdir subtito-free
cd subtito-free

# Initialize npm project
npm init -y

# Install dependencies
npm install stremio-addon-sdk express axios openai node-cache

# Create basic file structure
mkdir -p lib cache
touch server.js
touch manifest.json
touch addon.js
touch lib/subtitles.js
touch lib/translation.js
touch lib/utils.js
touch .env
