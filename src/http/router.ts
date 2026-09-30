import path from 'path';
import express, { type RequestHandler } from 'express';

import type { AgendashController } from '../controllers/agendash';
import { AgendashError } from '../errors';
import { contentSecurityPolicy, type ContentSecurityPolicyOptions } from './csp';

// The dashboard bundle built by Vite (`npm run build:ui`). Resolves to <package root>/dist/public
// both from src/http (tests, dev) and dist/http (published build).
const PUBLIC_DIR = path.join(__dirname, '..', '..', 'dist', 'public');

export interface MiddlewareOptions extends ContentSecurityPolicyOptions {
  /** Run before everything else, static UI files included (e.g. authentication). */
  before?: RequestHandler[];
  /** Run before the API routes only. */
  beforeApi?: RequestHandler[];
}

/** The Express app a host mounts, e.g. `app.use('/dash', middleware)`. */
export function createMiddleware(
  agendash: AgendashController,
  { before = [], beforeApi = [], frameAncestors }: MiddlewareOptions = {},
): express.Express {
  const expressApp = express();
  expressApp.disable('x-powered-by');

  expressApp.use(contentSecurityPolicy({ frameAncestors }));
  expressApp.use(redirectToTrailingSlash());
  if (before.length > 0) {
    expressApp.use(before);
  }
  expressApp.use('/api', ...beforeApi, createApiRouter(agendash));
  expressApp.use(express.static(PUBLIC_DIR));

  return expressApp;
}

/**
 * The UI loads its assets and calls the API with relative URLs, which only resolve under the
 * mount path when the page URL ends with a slash: `/dash` is redirected to `/dash/`.
 */
function redirectToTrailingSlash(): RequestHandler {
  return (request, response, next) => {
    const queryStart = request.originalUrl.indexOf('?');
    const pathname = queryStart === -1 ? request.originalUrl : request.originalUrl.slice(0, queryStart);
    const isRoot = request.path === '/';
    if (isRoot && !pathname.endsWith('/') && (request.method === 'GET' || request.method === 'HEAD')) {
      // Relative target, so the redirect also works behind a proxy that adds a path prefix.
      // The leading `./` keeps a segment such as `org:42` from being read as a URL scheme.
      const lastSegment = pathname.slice(pathname.lastIndexOf('/') + 1);
      const search = queryStart === -1 ? '' : request.originalUrl.slice(queryStart);
      response.redirect(302, `./${lastSegment}/${search}`);
      return;
    }
    next();
  };
}

/**
 * Answers `{ message }`. Request errors (AgendashError) carry their own status and message; any
 * other error, e.g. from the driver, is logged and answered with a generic message and 500,
 * since its fields describe the database servers (addresses, topology).
 */
function sendError(response: express.Response, error: unknown, fallback: string): void {
  if (error instanceof AgendashError) {
    response.status(error.status).json({ message: error.message });
    return;
  }
  console.error(`Agendash: ${fallback}`, error);
  response.status(500).json({ message: fallback });
}

type Handler<Params> = (request: express.Request<Params>, response: express.Response) => Promise<void>;

// Express 4 does not catch rejected promises of async handlers.
function handle<Params = Record<string, string>>(fallback: string, handler: Handler<Params>): RequestHandler<Params> {
  return (request, response) => {
    handler(request, response).catch((error: unknown) => sendError(response, error, fallback));
  };
}

type JobParams = { jobId: string };

function jobIdsOf(request: express.Request): unknown {
  return (request.body as { jobIds?: unknown } | undefined)?.jobIds;
}

export function createApiRouter(agendash: AgendashController): express.Router {
  const router = express.Router();

  router.use(express.json());
  router.use(express.urlencoded({ extended: false }));

  router.get('/', handle('Could not load the jobs', async (request, response) => {
    const { job, state, skip, limit, q, property, isObjectId, sortBy, sortDir } = request.query as Record<
      string,
      string | undefined
    >;
    const apiResponse = await agendash.api(job ?? '', state ?? '', {
      query: q,
      property,
      isObjectId,
      skip,
      limit,
      sortBy,
      sortDir,
    });
    response.json(apiResponse);
  }));

  router.get('/jobs/:jobId', handle<JobParams>('Could not load the job', async (request, response) => {
    response.json(await agendash.getJob(request.params.jobId));
  }));

  router.get('/jobs/:jobId/logs', handle<JobParams>('Could not load the task logs', async (request, response) => {
    response.json(await agendash.getTaskLogs(request.params.jobId));
  }));

  router.post('/jobs/requeue', handle('Could not requeue the jobs', async (request, response) => {
    response.send(await agendash.requeueJobs(jobIdsOf(request)));
  }));

  router.post('/jobs/run', handle('Could not run the jobs', async (request, response) => {
    response.json(await agendash.runJobsNow(jobIdsOf(request)));
  }));

  router.post('/jobs/disable', handle('Could not disable the jobs', async (request, response) => {
    response.json(await agendash.disableJobs(jobIdsOf(request)));
  }));

  router.post('/jobs/enable', handle('Could not enable the jobs', async (request, response) => {
    response.json(await agendash.enableJobs(jobIdsOf(request)));
  }));

  router.post('/jobs/delete', handle('Could not delete the jobs', async (request, response) => {
    const deleted = await agendash.deleteJobs(jobIdsOf(request));
    if (deleted) {
      response.json({ deleted: true });
    } else {
      response.json({ message: 'Jobs not deleted' });
    }
  }));

  router.post('/jobs/create', handle('Could not create the job', async (request, response) => {
    const body = (request.body ?? {}) as {
      jobName: string;
      jobSchedule?: string;
      jobRepeatEvery?: string;
      jobData?: Record<string, unknown>;
    };
    await agendash.createJob(body.jobName, body.jobSchedule, body.jobRepeatEvery, body.jobData);
    response.json({ created: true });
  }));

  return router;
}
