'use strict';

const request = require('supertest');
const app = require('../app');

describe('GET /version', () => {
  it('should return status 200', async () => {
    const res = await request(app).get('/version');
    expect(res.statusCode).toBe(200);
  });

  it('should return { version: "1.0.0" }', async () => {
    const res = await request(app).get('/version');
    expect(res.body).toEqual({ version: '1.0.0' });
  });

  it('should respond with Content-Type application/json', async () => {
    const res = await request(app).get('/version');
    expect(res.headers['content-type']).toMatch(/json/);
  });
});
