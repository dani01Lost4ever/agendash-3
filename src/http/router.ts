import path from 'path';
import express, { type RequestHandler } from 'express';

import type { AgendashController } from '../controllers/agendash';
import { contentSecurityPolicy } from './csp';

// Resolves to <package root>/public both from src/http (tests, dev) and dist/http (published build).
const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');

export interface MiddlewareOptions {
  /** Run before everything else, static UI files included (e.g. authentication). */
  before?: RequestHandler[];
  /** Run before the API routes only. */
  beforeApi?: RequestHandler[];
}

/** The Express app a host mounts, e.g. `app.use('/dash', middleware)`. */
export function createMiddleware(
  agendash: AgendashController,
  { before = [], beforeApi = [] }: MiddlewareOptions = {},
): express.Express {
  const expressApp = express();
  expressApp.disable('x-powered-by');

  expressApp.use(contentSecurityPolicy());
  if (before.length > 0) {
    expressApp.use(before);
  }
  expressApp.use('/api', ...beforeApi, createApiRouter(agendash));
  expressApp.use(express.static(PUBLIC_DIR));

  return expressApp;
}

export function createApiRouter(agendash: AgendashController): express.Router {
  const router = express.Router();

  router.use(express.json());
  router.use(express.urlencoded({ extended: false }));

  router.get('/', async (request, response) => {
    try {
      const {
        job,
        state,
        skip,
        limit,
        q,
        property,
        isObjectId,
      } = request.query as {
        job: string;
        state: string;
        skip: string;
        limit: string;
        q: string;
        property: string;
        isObjectId: string;
      };
      const apiResponse = await agendash.api(job, state, {
        query: q,
        property,
        isObjectId,
        skip,
        limit,
      });
      response.json(apiResponse);
    } catch (error) {
      response.status(400).json(error);
    }
  });

  router.get('/jobs/:jobId/logs', async (request, response) => {
    try {
      const logs = await agendash.getTaskLogs(request.params.jobId);
      response.json(logs);
    } catch (error) {
      response.status(400).json(error);
    }
  });

  router.post('/jobs/requeue', async (request, response) => {
    try {
      const newJobs = await agendash.requeueJobs(request.body.jobIds);
      response.send(newJobs);
    } catch (error) {
      response.status(404).json(error);
    }
  });

  router.post('/jobs/delete', async (request, response) => {
    try {
      const body = request.body as { jobIds: string[] };
      const deleted = await agendash.deleteJobs(body.jobIds);
      if (deleted) {
        response.json({ deleted: true });
      } else {
        response.json({ message: 'Jobs not deleted' });
      }
    } catch (error) {
      response.status(404).json(error);
    }
  });

  router.post('/jobs/create', async (request, response) => {
    try {
      const body = request.body as {
        jobName: string;
        jobSchedule: string;
        jobRepeatEvery: string;
        jobData: any;
      };
      await agendash.createJob(
        body.jobName,
        body.jobSchedule,
        body.jobRepeatEvery,
        body.jobData,
      );
      response.json({ created: true });
    } catch (error) {
      response.status(400).json(error);
    }
  });

  return router;
}
