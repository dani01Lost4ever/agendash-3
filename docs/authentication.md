# Authentication and read-only mode

Authentication is off by default. The host application turns it on with the `auth` option when it mounts
Agendash, and can make the dashboard read-only with the `readOnly` option.

```js
const { middleware } = Agendash(agenda, {
  auth: { type: 'apiKey', keys: process.env.AGENDASH_API_KEY },
  readOnly: false,
});
app.use('/dash', middleware);
```

Both options are only available in the options-object form of `Agendash()`, not in the legacy
`Agendash(agenda, connectionString, connectOptions)` form.

Invalid options throw when Agendash is created, so a typo or a missing environment variable
(`keys: undefined`) never leaves the dashboard open.

## Strategies

### `none`

No authentication. Same as omitting `auth`.

```js
auth: { type: 'none' }
```

### `apiKey`

The key is read from a header (default `X-API-Key`), from `Authorization: Bearer <key>`, and optionally from the
query string.

```js
auth: {
  type: 'apiKey',
  keys: ['key-for-ci', 'key-for-ops'],   // or a single string
  // verify: async (key, req) => ApiKeys.exists({ key }),   // instead of `keys`
  header: 'x-api-key',                   // false to disable
  bearer: true,                          // accept Authorization: Bearer <key>
  queryParam: false,                     // e.g. 'apiKey'; off by default because URLs end up in logs
}
```

Keys are compared in constant time. By default only the API (`/api/*`) is protected, so the dashboard page itself
loads and asks for the key.

### `cookie`

A cookie set by the host application (a session id, a JWT...), validated by a function the host provides.
The function accepts the request by returning a truthy value; returning a falsy value or throwing rejects it.

```js
auth: {
  type: 'cookie',
  name: 'access_token',
  verify: (token, req) => jwt.verify(token, process.env.JWT_SECRET),
  signed: false,        // true reads req.signedCookies (needs cookie-parser with a secret in the host app)
  loginUrl: '/login',   // browsers opening the dashboard without a valid cookie are redirected here
}
```

### `basic`

HTTP Basic authentication; browsers show their own login prompt.

```js
auth: {
  type: 'basic',
  users: { admin: process.env.AGENDASH_PASSWORD },
  // verify: async (username, password, req) => checkLdap(username, password),   // instead of `users`
  realm: 'Agendash',
}
```

### `custom`

Anything else, decided by the host application: either a function or an Express middleware.

```js
// A function: truthy accepts the request.
auth: { type: 'custom', verify: (req, res) => req.user?.roles.includes('admin') }

// A middleware (e.g. passport): it calls next() to accept the request and answers it itself otherwise.
auth: { type: 'custom', middleware: passport.authenticate('jwt', { session: false }) }
```

### `ticket`

For a dashboard opened from the host application, typically in an iframe, when the dashboard cannot see the host
application's own session cookie because it is served from another site. The host application creates a
short-lived, single-use ticket for the signed-in user and opens the dashboard with it
(`/dash/?ticket=...`). Agendash checks the ticket, stores its own session in a cookie and redirects to the same URL
without the ticket, so the ticket does not stay in the address bar, in the history or in later requests.

```js
// Host application: a ticket for the signed-in user, valid for one minute.
app.post('/api/agendash-ticket', requireLogin, (req, res) => {
  const ticket = jwt.sign({ sub: req.user.id, role: req.user.role }, process.env.TICKET_SECRET, { expiresIn: 60 });
  res.json({ ticket });
});

// Frontend
iframe.src = `https://jobs.example.com/dash/?ticket=${encodeURIComponent(ticket)}`;

// Agendash
const { getAgendashAuth } = require('agendash3-rework');

Agendash(agenda, {
  frameAncestors: ['https://app.example.com'],
  auth: {
    type: 'ticket',
    verifyTicket: (ticket, req) => {
      const { sub, role } = jwt.verify(ticket, process.env.TICKET_SECRET);
      return { sub, role };
    },
    session: { secret: process.env.AGENDASH_SESSION_SECRET },
  },
  readOnly: (req) => getAgendashAuth(req)?.principal?.role !== 'admin',
});
```

`verifyTicket(ticket, req)` accepts the ticket by returning a truthy value; returning a falsy value or throwing
rejects it. When it returns a plain object, the object is kept in the session and is the `principal` of every
later request (see [Read-only mode](#read-only-mode)). The session cookie is signed, not encrypted: keep the object
small and free of secrets.

The ticket is swapped on a `GET` of any dashboard page (`?ticket=` by default, `queryParam` to rename it). A
ticket that was already used, or that `verifyTicket` rejects, is also removed from the URL, without a session.
Each Agendash process refuses a ticket it has already seen for 10 minutes; with several instances behind a load
balancer, keep tickets short-lived or make `verifyTicket` enforce single use (for example with a `jti` claim
stored by the host application).

| `session` option | Default | Meaning |
| --- | --- | --- |
| `secret` | required | At least 32 characters; signs the session cookie (HMAC-SHA256). Changing it ends every session. |
| `name` | `'agendash_session'` | Cookie name. |
| `maxAge` | `28800` (8 hours) | Session length in seconds. It is not extended; afterwards the dashboard asks to be opened again from the application. |
| `sameSite` | `'none'` | `'none'` for an iframe on another site; `'lax'` or `'strict'` when the dashboard and the application share a site. |
| `secure` | `true` | Required with `sameSite: 'none'`. Browsers treat `http://localhost` as secure, so local development works. |
| `partitioned` | `true` with `sameSite: 'none'` | Adds the `Partitioned` attribute (CHIPS), see [Embedding in an iframe](#embedding-in-an-iframe). |
| `path` | the mount path | Cookie path. |
| `domain` | none | Cookie domain. |

The cookie is always `HttpOnly`. Like a `cookie` strategy, a ticket session needs the `X-Requested-With` header on
state-changing requests (see `csrf` below); the dashboard UI sends it.

## Combining strategies

With `strategies`, a request is accepted as soon as one strategy accepts it. For example, people log in through
the host application's session cookie while scripts use an API key:

```js
auth: {
  strategies: [
    { type: 'cookie', name: 'access_token', verify: (token) => jwt.verify(token, secret) },
    { type: 'apiKey', keys: process.env.AGENDASH_API_KEY },
  ],
  loginUrl: '/login',
}
```

A `custom` strategy with a `middleware` always runs last, because it answers rejected requests itself. A `ticket`
strategy combines with the others too, for example with an API key for scripts.

## Common options

These go next to `type` (single strategy) or next to `strategies`.

| Option | Default | Meaning |
| --- | --- | --- |
| `scope` | `'api'` when every strategy is `apiKey`, `'all'` otherwise | `'all'` protects the dashboard page and the API; `'api'` only the API. |
| `loginUrl` | none | String or `(req) => string`. Browsers opening a protected page are redirected there. |
| `csrf` | `true` | State-changing requests authenticated by a cookie, ticket, basic or custom strategy must carry the `X-Requested-With` header, which blocks cross-site request forgery. The dashboard UI always sends it. |
| `onUnauthorized` | 401 | `(req, res, next) => void` to answer rejected requests yourself. |

A rejected API request gets a `401` with a JSON body that tells the dashboard UI how to authenticate (strategy
names, the API key header, the login URL); it never contains secrets. A browser opening a protected page without
a `loginUrl` to go to gets a short "Sign-in required" page instead.

## In the dashboard UI

The dashboard's HTTP client (`ui/src/api.ts`, with `ui/src/auth.ts`) works with every strategy:

- it sends `X-Requested-With: XMLHttpRequest` with every API request;
- when the API answers 401 with a `loginUrl`, it sends the browser there;
- with `apiKey`, it shows a login screen, remembers the key for the browser tab (sessionStorage) and
  retries the request; a refused key shows an error on the same screen, and a **Sign out** button in
  the top bar forgets the key;
- a key in the page URL fragment (`/dash/#apiKey=...`) is used once and removed from the address bar, which is
  handy for links from an internal tool. Browsers never send the fragment to the server or in the `Referer`
  header, so the key stays out of access logs and proxies;
- with `basic`, the browser shows its own prompt;
- when the API refuses a request and there is neither a key to ask for nor a login page (a `cookie` or `ticket`
  session that ended), it shows a "Session ended" screen asking to open the dashboard again from the application.

## Read-only mode

```js
readOnly: true                               // nobody can create, requeue or delete jobs
readOnly: (req) => !req.user?.isAdmin        // decided per request, after authentication
```

`getAgendashAuth(req)` tells who the auth middleware let in: `{ strategy, principal }`, where `principal` is what the
strategy's verify function returned (`undefined` for the `keys` and `users` lists, or when it returned `true`):

```js
const { getAgendashAuth } = require('agendash3-rework');

readOnly: (req) => getAgendashAuth(req)?.principal?.role !== 'admin'
```

Refused requests get a `403`. `GET api/config` returns `{ "readOnly": true | false }` for the current user.
When it is `true`, the UI sets `data-agendash-readonly` on `<html>` and hides every element with the
`agendash-write` class (new job, requeue, delete); UI code can also read the `readOnly` ref exported by
`ui/src/auth.ts`. Give that class to any new control that changes jobs.

## Embedding in an iframe

1. Allow the application's origin to frame the dashboard with the `frameAncestors` option (see the README).
2. Pick how the iframe authenticates:
   - **Same site (most robust).** Serve the dashboard from the application's own host, for example
     `https://app.example.com/dash` through its reverse proxy (an Azure Application Gateway or Front Door rule,
     nginx...), or from a subdomain that receives the application's session cookie. The browser then sends the
     application's cookie to the dashboard like to any other page, and a `cookie` or `custom` strategy checks it.
     Nothing depends on third-party cookies.
   - **Another site.** Use the `ticket` strategy. Its session cookie is then a third-party cookie inside the
     iframe, which browsers may refuse. It is `Partitioned` by default (CHIPS): the browser keeps it only for
     that embedding site, and Chromium-based browsers accept it even when third-party cookies are blocked (checked
     with Chromium's third-party cookie blocking). Other browsers depend on their version and privacy settings,
     Safari being the strictest, so test the ones your users have.
3. Give users a way out. When the cookie is refused, the iframe shows a "Sign-in required" page saying that the
   browser may block cookies in embedded pages. An "Open in a new tab" link in the application that requests a
   new ticket and opens `/dash/?ticket=...` in a top-level tab always works, because the cookie is then
   first-party.

An `apiKey` in the iframe URL (`/dash/#apiKey=...`) also works, but the key is then visible to anyone who can read
the application's page; keep it for internal tools.

A ticket appears in the URL of one request: the dashboard's access log (and the reverse proxy's, if any) records
it, which is why it must be short-lived and single-use. The redirect keeps it out of the address bar, the
history, the `Referer` of the dashboard's own requests and any cache (`Cache-Control: no-store`).

## Using the middleware on its own

The same guards are exported for hosts that build their own routing:

```js
const { createAuthMiddleware, createReadOnlyGuard } = require('agendash3-rework');

app.use('/dash', createAuthMiddleware({ type: 'basic', users: { admin: 'secret' } }), createReadOnlyGuard(true), dashboard);
```
