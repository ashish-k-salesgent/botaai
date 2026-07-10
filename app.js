'use strict';

const express = require('express');
const healthRouter = require('./routes/health');

const app = express();

// Parse JSON request bodies
app.use(express.json());

// Routes
app.use('/health', healthRouter);

// Start the server only when this file is run directly
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`BotaAI app listening on port ${PORT}`);
  });
}

module.exports = app;
