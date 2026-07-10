'use strict';

const express = require('express');
const versionRouter = require('./routes/version');

const app = express();

app.use(express.json());

// Routes
app.use('/version', versionRouter);

module.exports = app;
