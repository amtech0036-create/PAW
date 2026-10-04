require('./src/config/env');

const { createApp } = require('./src/app');
const { connectDatabase } = require('./src/config/database');

const PORT = process.env.PORT || 5000;

async function main() {
  await connectDatabase();

  const app = createApp();

  app.listen(PORT, () => {
    console.log(`[server] Personal Cash Flow Tracker API listening on http://localhost:${PORT}`);
  });
}

main();
