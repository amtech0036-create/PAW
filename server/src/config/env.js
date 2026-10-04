const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Search for .env files in likely locations:
// 1. Root directory (where .env.example lives and README instructs to place .env)
// 2. Server directory
// 3. Current working directory
const candidates = [
  path.resolve(__dirname, '../../../.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(process.cwd(), '.env'),
];

for (const candidate of candidates) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate });
  }
}

module.exports = process.env;
