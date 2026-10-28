import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { createApp } from '../src/app.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { validate } from '../src/middleware/validate.js';
import { ApiError } from '../src/utils/ApiError.js';

const app = createApp();

describe('GET /api/v1/health', () => {
  it('returns ok in the standard success shape', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
  });

  it('sets security headers via helmet', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('error responses', () => {
  it('returns a JSON 404 for unknown routes', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'ROUTE_NOT_FOUND', message: expect.any(String) },
    });
  });

  it('returns 400 INVALID_JSON for a malformed body', async () => {
    const res = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{"broken": ');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});

describe('validate middleware', () => {
  // A tiny throwaway app so the middleware is tested on its own.
  const testApp = express();
  testApp.use(express.json());
  testApp.post(
    '/items/:id',
    validate({
      params: z.object({ id: z.coerce.number().int().positive() }),
      body: z.object({ name: z.string().min(2) }),
    }),
    (req, res) => res.json({ validated: req.validated, body: req.body }),
  );
  testApp.get('/boom', () => {
    throw ApiError.conflict('Event is full', 'EVENT_FULL');
  });
  testApp.use(errorHandler);

  it('passes coerced values on req.validated and strips unknown fields', async () => {
    const res = await request(testApp).post('/items/7').send({ name: 'Talk', extra: 'x' });

    expect(res.status).toBe(200);
    expect(res.body.validated.params.id).toBe(7);
    expect(res.body.body).toEqual({ name: 'Talk' });
  });

  it('returns 400 with per-field details when input is invalid', async () => {
    const res = await request(testApp).post('/items/abc').send({ name: 'A' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const fields = res.body.error.details.map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['id', 'name']));
  });

  it('turns a thrown ApiError into its status and code', async () => {
    const res = await request(testApp).get('/boom');

    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({ code: 'EVENT_FULL', message: 'Event is full' });
  });
});
