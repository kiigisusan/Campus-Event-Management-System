/**
 * Builds the Express application.
 *
 * Kept separate from server.js (which calls listen) so tests can import the
 * app and send requests to it with Supertest without opening a real port.
 */
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { openApiSpec } from './docs/openapi.js';
import { RENEWED_TOKEN_HEADER } from './middleware/authenticate.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import apiRoutes from './routes/index.js';

export function createApp() {
  const app = express();

  // Behind a reverse proxy (nginx in Docker, Render/Railway in production) the
  // client IP arrives in X-Forwarded-For. Trusting one hop lets rate limiting
  // and audit logs see the real IP instead of the proxy's.
  app.set('trust proxy', 1);

  // API documentation. Mounted BEFORE helmet on purpose: helmet's strict
  // Content-Security-Policy would block Swagger UI's own scripts and styles.
  // The docs page serves no user data, so this is safe.
  app.get('/api/docs.json', (_req, res) => res.json(openApiSpec));
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiSpec, {
      customSiteTitle: 'CEMS API Docs',
      swaggerOptions: { persistAuthorization: true },
    }),
  );

  // Security headers (CSP, X-Frame-Options, HSTS, no X-Powered-By, ...).
  app.use(helmet());

  // Only the React app may call the API from a browser. The renewed session
  // token header must be exposed or the browser hides it from JavaScript.
  app.use(cors({ origin: env.CLIENT_URL, exposedHeaders: [RENEWED_TOKEN_HEADER] }));

  // Small body limit: the API only receives JSON forms (images use a separate upload route).
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));

  if (!env.isTest) {
    app.use(morgan(env.isProduction ? 'combined' : 'dev'));
  }

  app.use('/api/v1', apiRoutes);

  // These two must stay last: unmatched routes, then the central error handler.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}