import { defineConfig } from 'vite';
import worker from './edge/worker.js';

function arvanEdgeDevPlugin() {
  return {
    name: 'arvan-edge-dev-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/')) return next();
        try {
          const host = req.headers.host || 'localhost:5173';
          const url = new URL(req.url, `http://${host}`);
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const body = chunks.length ? Buffer.concat(chunks) : undefined;

          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
            else if (typeof value === 'string') headers.set(key, value);
          }

          const webRequest = new Request(url, {
            method: req.method,
            headers,
            body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
          });

          const webResponse = await worker.fetch(webRequest);
          res.statusCode = webResponse.status;
          webResponse.headers.forEach((value, key) => {
            if (key.toLowerCase() !== 'content-encoding') res.setHeader(key, value);
          });
          res.end(Buffer.from(await webResponse.arrayBuffer()));
        } catch (error) {
          console.error('Local Edge API Error:', error);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ ok: false, error: 'خطا در اجرای محلی سرویس بازی' }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [arvanEdgeDevPlugin()],
});