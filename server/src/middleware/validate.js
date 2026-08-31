import { badRequest } from '../lib/errors.js';

/**
 * validate({ body, query, params }) — each value is a Zod schema.
 * Parsed (and coerced) output replaces the original req value.
 */
export const validate = (schemas) => (req, _res, next) => {
  try {
    for (const key of ['params', 'query', 'body']) {
      if (schemas[key]) req[key] = schemas[key].parse(req[key] ?? {});
    }
    next();
  } catch (err) {
    const details = err?.issues?.map((i) => ({ path: i.path.join('.'), message: i.message })) ?? String(err);
    next(badRequest('Validation failed', details));
  }
};
