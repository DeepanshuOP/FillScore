import React from 'react';
import { apiBase } from '../lib/apiBase';
import { buttonClass } from '../ui/buttonClass';

const LINK = 'no-underline';

/** The two sign-in providers. They are links: the browser leaves for the provider through the API. */
export default function OAuthLinks() {
  const base = apiBase();
  return (
    <div className="flex flex-col gap-3">
      <a href={`${base}/auth/google`} className={buttonClass('secondary', 'md', LINK)}>Continue with Google</a>
      <a href={`${base}/auth/github`} className={buttonClass('secondary', 'md', LINK)}>Continue with GitHub</a>
    </div>
  );
}
