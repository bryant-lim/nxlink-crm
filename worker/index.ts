import { Env } from './types';
import { handleManageUser } from './routes/manage-user';
import { handleIngestCrm } from './routes/ingest-crm';
import { handlePushWebhook } from './routes/push-webhook';
import { handleSyncNxlink, runNxlinkSync } from './routes/sync-nxlink';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Handle CORS preflight for all API and functions routes
    if (
      request.method === 'OPTIONS' &&
      (pathname.startsWith('/api/') || pathname.startsWith('/.netlify/functions/'))
    ) {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, client_id, client_secret',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
        }
      });
    }

    // Route matching (supports both /api/ and legacy /.netlify/functions/ paths)
    if (pathname === '/api/manage-user' || pathname === '/.netlify/functions/manage-user') {
      return handleManageUser(request, env);
    }

    if (pathname === '/api/ingest-crm' || pathname === '/.netlify/functions/ingest-crm') {
      return handleIngestCrm(request, env);
    }

    if (pathname === '/api/push-webhook' || pathname === '/.netlify/functions/push-webhook') {
      return handlePushWebhook(request, env);
    }

    if (pathname === '/api/sync-nxlink' || pathname === '/.netlify/functions/sync-nxlink') {
      return handleSyncNxlink(request, env);
    }

    // Default to serving static assets (dist/) with SPA fallback
    return env.ASSETS.fetch(request);
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runNxlinkSync(env));
  }
};
