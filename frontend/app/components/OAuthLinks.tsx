import React from 'react';
import { apiBase } from '../lib/apiBase';

const LINK = 'inline-flex min-h-10 items-center justify-center rounded-ui border border-ui-edge px-4 py-2 text-sm font-medium text-ui-ink no-underline hover:bg-ui-raised';

/** The two sign-in providers. They are links: the browser leaves for the provider through the API. */
export default function OAuthLinks() {
  const base = apiBase();
  return (
    <div className="flex flex-col gap-3">
      <a href={`${base}/auth/google`} className={LINK}>Continue with Google</a>
      <a href={`${base}/auth/github`} className={LINK}>Continue with GitHub</a>
    </div>
  );
}
