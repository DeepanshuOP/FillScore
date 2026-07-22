export async function authFetch(
  url: string | URL | Request,
  options: RequestInit = {},
  auth: { accessToken: string | null; refreshAccessToken: () => Promise<string | null> }
): Promise<Response> {
  const headers = new Headers(options.headers || {});
  
  if (auth.accessToken) {
    headers.set('Authorization', `Bearer ${auth.accessToken}`);
  }
  
  const fetchOptions: RequestInit = {
    ...options,
    headers,
    credentials: 'include',
  };

  let response = await fetch(url, fetchOptions);

  if (response.status === 401) {
    const newToken = await auth.refreshAccessToken();
    if (newToken) {
      headers.set('Authorization', `Bearer ${newToken}`);
      response = await fetch(url, { ...fetchOptions, headers });
    }
  }

  return response;
}
