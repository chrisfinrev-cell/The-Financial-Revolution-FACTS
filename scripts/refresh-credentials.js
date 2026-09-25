/**
 * Credential Refresh — Neon DB password rotation recovery
 *
 * On every startup, fetches the current connection string from Neon Management API
 * and refreshes the DATABASE_URL env var so the app can connect even after
 * Neon rotates the owner password.
 *
 * Polsia injects POLSIA_NEON_API_KEY as an env var — use that to authenticate.
 * Falls back silently if the API call fails (leaves existing DATABASE_URL intact).
 *
 * Endpoint: GET https://console.neon.tech/api/v2/projects/{id}/connection_uri
 * Response: { connection_uri: "REDACTED/);
  return match ? match[1] : '';
}

refreshCredentials().then(() => {
  console.log('[refresh-credentials] Done');
});