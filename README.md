# BotaAI

A simple Express.js application.

## Getting Started

### Install dependencies

```bash
npm install
```

### Run the server

```bash
npm start
```

The server listens on port `3000` by default (override with the `PORT` environment variable).

## API Endpoints

### `GET /health`

Returns a health-check response.

**Response `200 OK`:**
```json
{
  "status": "ok",
  "message": "hey botaai its ashish and your app is working"
}
```

## Running Tests

```bash
npm test
```

Tests are written with [Jest](https://jestjs.io/) and [Supertest](https://github.com/ladjs/supertest).
