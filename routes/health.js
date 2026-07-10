'use strict';

const { Router } = require('express');

const router = Router();

/**
 * GET /health
 * Returns a simple health-check JSON response.
 */
router.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'hey botaai its ashish and your app is working'
  });
});

module.exports = router;
