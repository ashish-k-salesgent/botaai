'use strict';

const { Router } = require('express');

const router = Router();

router.get('/version', (req, res) => {
  res.json({ version: '1.0.0' });
});

module.exports = router;
