# Agendash Enhanced Dashboard

A significantly enhanced dashboard for [Agenda](https://github.com/agenda/agenda), based on the original [Agendash](https://github.com/sealos/agendash).

This version focuses on providing a modern user interface, detailed task execution logging, and improved usability.

---

## ✨ Key Enhancements in this Version

*   **Modern User Interface:** Complete overhaul of the frontend using Bootstrap 4/5 principles for a cleaner, more responsive, and visually appealing experience across all components (Sidebar, Job List, Job Details, Modals, etc.).
*   **Task Execution Logging:**
  *   Introduced automatic logging for job `start`, `complete`, and `fail` events.
  *   Logs are stored in a dedicated MongoDB collection (`tasklogs` by default) using Mongoose.
  *   Added a "Show Execution Logs" button in the Job Details modal to view the specific logs for a selected job.
*   **Dedicated Mongoose Connection:**
  *   Agendash now requires a **separate Mongoose connection string** during initialization.
  *   This connection is used exclusively for the internal task logging model, keeping it independent from your main application's Mongoose connection or Agenda's internal driver connection.
*   **Improved Modals:** Enhanced styling and user feedback for confirmation modals (Delete, Requeue) and the new Job creation modal, including loading states.
*   **Code Refinements:** Updated backend logic, improved aggregation queries, and added better error handling. Frontend components were refactored for clarity (e.g., dedicated `task-logs` component).
*   **Automatic Index Creation:** Necessary Agenda database indexes for sorting are now created automatically when Agenda emits the `ready` event.

---

### Features (Including Original)

*   Job status auto-refreshes (polling interval configurable via frontend search bar).
*   Schedule a new job from the UI.
*   Dive in to see more details about the job, like the JSON data.
*   **View detailed execution logs for each job.**
*   Requeue a job (creates a new instance to run immediately).
*   Delete jobs.
*   Search jobs by name and metadata (supports querying by Mongo Object ID, numbers, strings, and basic regex).
*   Pagination.
*   **Modern, Responsive UI.**

---

### Screenshots

#### Dashboard

![Auto-refresh list of jobs](all-jobs.png)

---

#### Create jobs

![See job details, requeue or delete jobs](create-job.png)

---

#### Search by name, metadata, job status

![Search for a job by name or metadata ](search.png)

---

#### Responsive UI

![Mobile UI small devices](mobile-ui-sm.png)

![Mobile UI extra small devices](mobile-ui-xs.png)

---


# Troubleshooting

### Index for sorting

It may be required to create the following index for faster sorting (see [#24](https://github.com/sealos/agendash/issues/24))

```
db.agendaJobs.ensureIndex({
    "nextRunAt" : -1,
    "lastRunAt" : -1,
    "lastFinishedAt" : -1
}, "agendash")
```

### Install

```
npm i agendash3-rework
```

_Note_: `Agendash` requires mongodb version >2.6.0 to perform the needed aggregate queries. This is your mongo database version, not your node package version! To check your database version, connect to mongo and run `db.version()`.

### Middleware usage

#### Express

Agendash provides Express middleware you can use at a specified path, for example this will
make Agendash available on your site at the `/dash` path. Note: Do not try to mount Agendash
at the root level like `app.use('/', Agendash(agenda))`.

```js
var express = require("express");
var app = express();

// ... your other express middleware like body-parser

var Agenda = require("agenda");
var Agendash = require("agendash");

var agenda = new Agenda({ db: { address: "mongodb://127.0.0.1/agendaDb" } });
// or provide your own mongo client:
// var agenda = new Agenda({mongo: myMongoClient})

const agendash = Agendash(agenda, "mongodb://127.0.0.1/agendaDb");
app.use('/dash', agendash.middleware);

// ... your other routes

// ... start your server
```

By mounting Agendash as middleware on a specific path, you may provide your
own authentication for that path. For example if you have an authenticated
session using passport, you can protect the dashboard path like this:

```js
app.use(
    "/dash",
    function (req, res, next) {
        if (!req.user || !req.user.is_admin) {
            res.send(401);
        } else {
            next();
        }
    },
    AgendashController(agenda)
);
```

Other middlewares will come soon in the folder `/lib/middlewares/`.
You'll just have to update the last line to require the middleware you need:

```js
app.use(
    "/agendash",
    AgendashController(agenda, {
        middleware: "connect",
    })
);
```

Note that if you use a CSRF protection middleware like [`csurf`](https://www.npmjs.com/package/csurf), you might need to [configure it off](https://github.com/sealos/agendash/issues/23#issuecomment-270917949) for Agendash-routes.

#### Hapi

A minimum Node.js version 12 is required for `@hapi/hapi` dependency.

```shell
npm i @hapi/inert @hapi/hapi
```

```js
const agenda = new Agenda().database(
    "mongodb://127.0.0.1/agendaDb",
    "agendaJobs"
);

const server = require("@hapi/hapi").server({
    port: 3002,
    host: "localhost",
});
await server.register(require("@hapi/inert"));
await server.register(
    AgendashController(agenda, {
        middleware: "hapi",
    })
);

await server.start();
```

Then browse to `http://localhost:3002/`.

#### Koa

```shell
npm i koa koa-bodyparser koa-router koa-static
```

```js
const agenda = new Agenda().database(
    "mongodb://127.0.0.1/agendaDb",
    "agendaJobs"
);

const Koa = require("koa");
const app = new Koa();
const middlewares = AgendashController(agenda, {
    middleware: "koa",
});
for (const middleware of middlewares) {
    app.use(middleware);
}

await app.listen(3002);
```

Then browse to `http://localhost:3002/`.

#### Fastify

```shell
npm i fastify
```

```js
const agenda = new Agenda().database(
    "mongodb://127.0.0.1/agendaDb",
    "agendaJobs"
);

const Fastify = require("fastify");
const fastify = new Fastify();

fastify.register(
    AgendashController(
        agenda,
        { middleware: "fastify" }
    );
)
;

await fastify.listen(3002);
```

Then browse to `http://localhost:3002/`.

### Standalone usage

Agendash comes with a standalone Express app which you can use like this:

```bash
./node_modules/.bin/agendash3-rework --db=mongodb://localhost/agendaDb --collection=agendaCollection --port=3002
```

or like this, for default collection `agendaJobs` and default port `3000`:

```bash
./node_modules/.bin/agendash3-rework --db=mongodb://localhost/agendaDb
```

If you are using npm >= 5.2, then you can use [npx](https://medium.com/@maybekatz/introducing-npx-an-npm-package-runner-55f7d4bd282b):

```bash
npx agendash3-rework --db=mongodb://localhost/agendaDb --collection=agendaCollection --port=3002
```

Then browse to `http://localhost:3002/`.

### Docker usage

Agendash can also be run within a Docker container like this:

```bash
docker run -p 3000:3000 \
  --env MONGODB_URI=mongo://myUser:myPass@myHost/myDb \
  --env COLLECTION=myAgendaCollection sealos/agendash
```

Then browse to `http://localhost:3000/`.
