'use strict';

const express = require('express');
const versionRouter = require('./routes/version');

const app = express();

app.use(express.json());

// Routes
app.use('/', versionRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server only when run directly
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

module.exports = app;
