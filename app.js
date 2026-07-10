'use strict';

const express = require('express');
const app = express();

app.use(express.json());

// Routes
const versionRouter = require('./routes/version');
app.use('/version', versionRouter);

// Start server only when run directly (not during tests)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
