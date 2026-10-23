import { assetLinks } from '@/lib/asset-links';

// Read from the settings on every request, so the file follows them without a new build.
export const dynamic = 'force-dynamic';

/** https://<site>/.well-known/assetlinks.json, for the Android app (M18b). */
export function GET(): Response {
  const links = assetLinks(process.env.ANDROID_PACKAGE, process.env.ANDROID_CERT_SHA256);
  if (!links) return new Response('Not found', { status: 404 });
  return Response.json(links, { headers: { 'Cache-Control': 'public, max-age=300' } });
}
