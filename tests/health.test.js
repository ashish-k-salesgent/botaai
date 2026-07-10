'use strict';

const request = require('supertest');
const app = require('../app');

describe('GET /health', () => {
  it('should return HTTP 200 with the expected JSON body', async () => {
    const response = await request(app)
      .get('/health')
      .expect('Content-Type', /application\/json/)
      .expect(200);

    expect(response.body).toEqual({
      status: 'ok',
      message: 'hey botaai its ashish and your app is working'
    });
  });

  it('should return status "ok" in the response body', async () => {
    const response = await request(app).get('/health');
    expect(response.body.status).toBe('ok');
  });

  it('should return the correct message in the response body', async () => {
    const response = await request(app).get('/health');
    expect(response.body.message).toBe(
      'hey botaai its ashish and your app is working'
    );
  });
});
