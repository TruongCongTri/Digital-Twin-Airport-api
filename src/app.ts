/**
 * @file app.ts
 * @description Core Express application configuration.
 * Sets up security headers, CORS policies, request parsers, and global error handling.
 * @module App
 */
import express, { Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { env } from './common/configs/env';
import { errorHandler } from './middlewares/error-handler.middleware';
import { API_VERSION } from './constants/endpoints';
import v1Router from './routes/v1';

const app = express();

/**
 * --- PROXY CONFIGURATION ---
 * Required for correct IP tracking and cookie security when behind
 * load balancers or platforms like Heroku/Vercel.
 */
app.set('trust proxy', 1);

/**
 * --- SECURITY MIDDLEWARE ---
 * Helmet: Sets secure HTTP headers to protect against common web vulnerabilities.
 * CORS: Restricts cross-origin requests to the validated CLIENT_URL.
 */
app.use(helmet());

const whitelist = env.CLIENT_URL.split(',');
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || whitelist.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true, // Allow cookies to be sent in CORS requests
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  })
);

/**
 * --- REQUEST PARSING ---
 */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Health Check Route
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'OK', message: 'API is running 🚀' });
});

// TODO: Import routes and mount them here
/**
 * --- API ROUTES ---
 */
app.use(API_VERSION, v1Router);

/**
 * --- ERROR HANDLING ---
 * Must be mounted last to catch all errors bubbled up from routes and controllers.
 */
app.use(errorHandler);

export default app;
