'use strict';

const request = require('supertest');
const app = require('../app');

describe('GET /version', () => {
  it('returns 200 and version 1.0.0', async () => {
    const res = await request(app).get('/version');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body).toEqual({ version: '1.0.0' });
  });
});
