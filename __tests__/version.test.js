'use strict';

const request = require('supertest');
const app = require('../app');

describe('GET /version', () => {
  it('returns HTTP 200', async () => {
    const res = await request(app).get('/version');
    expect(res.statusCode).toBe(200);
  });

  it('returns { version: "1.0.0" }', async () => {
    const res = await request(app).get('/version');
    expect(res.body).toEqual({ version: '1.0.0' });
  });

  it('responds with application/json content-type', async () => {
    const res = await request(app).get('/version');
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});
