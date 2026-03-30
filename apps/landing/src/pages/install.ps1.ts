import type { APIRoute } from 'astro';
import { fetchInstaller } from '../lib/fetch-installer';

const script = await fetchInstaller('install.ps1');

export const GET: APIRoute = () => {
  return new Response(script, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
};
