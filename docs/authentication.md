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

A `custom` strategy with a `middleware` always runs last, because it answers rejected requests itself.

## Common options

These go next to `type` (single strategy) or next to `strategies`.

| Option | Default | Meaning |
| --- | --- | --- |
| `scope` | `'api'` when every strategy is `apiKey`, `'all'` otherwise | `'all'` protects the dashboard page and the API; `'api'` only the API. |
| `loginUrl` | none | String or `(req) => string`. Browsers opening a protected page are redirected there. |
| `csrf` | `true` | State-changing requests authenticated by a cookie, basic or custom strategy must carry the `X-Requested-With` header, which blocks cross-site request forgery. The dashboard UI always sends it. |
| `onUnauthorized` | JSON 401 | `(req, res, next) => void` to answer rejected requests yourself. |

A rejected API request gets a `401` with a JSON body that tells the dashboard UI how to authenticate (strategy
names, the API key header, the login URL); it never contains secrets.

## Read-only mode

```js
readOnly: true                               // nobody can create, requeue or delete jobs
readOnly: (req) => !req.user?.isAdmin        // decided per request, after authentication
```

Refused requests get a `403`. `GET api/config` returns `{ "readOnly": true | false }` for the current user, so
the UI can hide the actions that would fail.

## Using the middleware on its own

The same guards are exported for hosts that build their own routing:

```js
const { createAuthMiddleware, createReadOnlyGuard } = require('agendash3-rework');

app.use('/dash', createAuthMiddleware({ type: 'basic', users: { admin: 'secret' } }), createReadOnlyGuard(true), dashboard);
```
