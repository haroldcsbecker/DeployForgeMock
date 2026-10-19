const configuredUrl = process.env.DEPLOYFORGE_MOCK_CONTROL_URL ?? 'http://127.0.0.1:8090';
const baseUrl = new URL(configuredUrl);
const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

if (baseUrl.protocol !== 'http:' || !loopbackHosts.has(baseUrl.hostname) ||
    baseUrl.username || baseUrl.password) {
  throw new Error('Local runtime reset only permits an HTTP loopback control URL.');
}

baseUrl.pathname = '/demo/reset';
baseUrl.search = '';
baseUrl.hash = '';

const response = await fetch(baseUrl, {
  method: 'POST',
  headers: { Accept: 'application/json' },
  redirect: 'error',
  signal: AbortSignal.timeout(10_000),
});
const raw = await response.text();
let payload = {};
try {
  payload = raw ? JSON.parse(raw) : {};
} catch {
  throw new Error('Mock control API returned a non-JSON reset response.');
}

if (!response.ok || payload.ok !== true) {
  throw new Error('Local runtime reset failed with HTTP ' + response.status +
    (typeof payload.error === 'string' ? ': ' + payload.error : '.'));
}

process.stdout.write('Local generated runtime state reset.\n');
