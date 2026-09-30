import { reactive, ref } from 'vue';

/** How the server wants the API key sent, from the `auth.apiKey` hint of a 401 response. */
interface ApiKeyHint {
  header: string | null;
  bearer: boolean;
}

interface Credentials extends ApiKeyHint {
  key: string;
}

interface UnauthorizedBody {
  auth?: { loginUrl?: string | null; apiKey?: ApiKeyHint };
}

// One key per dashboard, in case several are mounted on the same origin.
const storageKey = `agendash.apiKey:${new URL('.', document.baseURI).pathname}`;

let credentials = readStoredCredentials();
let keyFromUrl = takeKeyFromUrl();
let pendingLogin: Promise<boolean> | null = null;

/**
 * Login state shown by LoginDialog.vue; `version` changes whenever the credentials do.
 * `signedOut` is set when the server refuses a request the dashboard cannot sign in for itself,
 * e.g. an expired session of the host application.
 */
export const session = reactive({
  signedIn: credentials !== null,
  version: 0,
  loginOpen: false,
  rejected: false,
  signedOut: false,
});

let submitKey: ((key: string) => void) | null = null;

/**
 * Whether the current user may only look at jobs. When true, `data-agendash-readonly` is set on
 * <html> and every element with the `agendash-write` class is hidden (see styles/auth.css).
 */
export const readOnly = ref(false);

export function setReadOnly(value: boolean): void {
  readOnly.value = value;
  document.documentElement.toggleAttribute('data-agendash-readonly', value);
}

function readStoredCredentials(): Credentials | null {
  try {
    return JSON.parse(window.sessionStorage.getItem(storageKey) ?? 'null') as Credentials | null;
  } catch {
    return null;
  }
}

function storeCredentials(value: Credentials | null): void {
  credentials = value;
  session.signedIn = value !== null;
  session.version++;
  try {
    if (value) {
      window.sessionStorage.setItem(storageKey, JSON.stringify(value));
    } else {
      window.sessionStorage.removeItem(storageKey);
    }
  } catch {
    // Storage disabled: the key stays in memory for this page.
  }
}

/**
 * A key in the page URL (`#apiKey=...`) is used once, then removed from the address bar. It is
 * read from the fragment, which browsers never send to the server or in the Referer header, so
 * the key stays out of access logs and proxies.
 */
function takeKeyFromUrl(): string | null {
  const url = new URL(window.location.href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const key = fragment.get('apiKey');
  if (!key) {
    return null;
  }
  fragment.delete('apiKey');
  url.hash = fragment.toString();
  window.history.replaceState(window.history.state, '', url);
  return key;
}

/** Adds the stored API key to `headers`. Returns the key sent, for `shouldRetry`. */
export function applyCredentials(headers: Headers): string | null {
  if (!credentials) {
    return null;
  }
  if (credentials.header) {
    headers.set(credentials.header, credentials.key);
  } else if (credentials.bearer) {
    headers.set('Authorization', `Bearer ${credentials.key}`);
  }
  return credentials.key;
}

/**
 * Handles a 401 from the API using the hints in its body: redirects to the host's login page, or
 * asks for the API key. Resolves to true when the request should be sent again.
 */
export function shouldRetry(body: unknown, sentKey: string | null): Promise<boolean> {
  const auth = (body as UnauthorizedBody | null)?.auth;
  if (auth?.loginUrl) {
    window.location.assign(auth.loginUrl);
    return new Promise<boolean>(() => {}); // The page is navigating away.
  }
  const hint = auth?.apiKey;
  if (!hint) {
    session.signedOut = auth !== undefined;
    return Promise.resolve(false);
  }
  if (credentials && credentials.key !== sentKey) {
    // Another request signed in while this one was in flight.
    return Promise.resolve(true);
  }
  if (keyFromUrl) {
    storeCredentials({ header: hint.header, bearer: hint.bearer, key: keyFromUrl });
    keyFromUrl = null;
    return Promise.resolve(true);
  }
  if (!pendingLogin) {
    storeCredentials(null);
    session.rejected = sentKey !== null;
    session.loginOpen = true;
    pendingLogin = new Promise<boolean>((resolve) => {
      submitKey = (key) => {
        submitKey = null;
        pendingLogin = null;
        session.loginOpen = false;
        storeCredentials({ header: hint.header, bearer: hint.bearer, key });
        resolve(true);
      };
    });
  }
  return pendingLogin;
}

/** Called by the login screen with the key the user typed. */
export function submitLogin(key: string): void {
  submitKey?.(key);
}

/** Forgets the API key and reloads, which shows the login screen again. */
export function logout(): void {
  storeCredentials(null);
  window.location.reload();
}
