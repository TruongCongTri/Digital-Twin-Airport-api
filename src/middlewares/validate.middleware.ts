/**
 * @file validate.middleware.ts
 * @description Request validation middleware using Zod schemas.
 * Intercepts requests to validate body, params, and query before reaching controllers.
 * @module Middlewares/Validate
 */
import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

interface ValidatedRequest {
  body?: any;
  query?: any;
  params?: any;
  cookies?: any;
}

/**
 * @function validate
 * @description Express middleware to validate incoming requests against a Zod schema.
 * Crucially, it captures the validated data and reassigns it back to the `req` object.
 * This ensures that default values, type coercions, and transformations defined in
 * the Zod schema are perfectly preserved for the downstream controllers and services.
 * @param schema - The Zod schema defining the expected request shape
 * @returns An Express middleware function
 */
export const validate = (schema: ZodSchema) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const validatedData = (await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
        cookies: req.cookies,
      })) as ValidatedRequest;

      // 1. req.body is defined by body-parser middleware and is safely writable
      if (validatedData.body !== undefined) {
        req.body = validatedData.body;
      }

      // 2. req.query has a getter. We clear the existing object and assign new properties.
      if (validatedData.query !== undefined) {
        for (const key in req.query) delete req.query[key];
        Object.assign(req.query, validatedData.query);
      }

      // 3. req.params has a getter. Mutate instead of replace.
      if (validatedData.params !== undefined) {
        for (const key in req.params) delete req.params[key];
        Object.assign(req.params, validatedData.params);
      }

      // 4. req.cookies (if cookie-parser is used)
      if (validatedData.cookies !== undefined) {
        for (const key in req.cookies) delete req.cookies[key];
        Object.assign(req.cookies, validatedData.cookies);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
