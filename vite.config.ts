import { defineConfig, type Plugin } from 'vite';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/** Dev-server endpoint that writes one log file pair per game session into ./logs (see src/telemetry/session-log.ts). */
function sessionLogs(): Plugin {
  const dir = join(process.cwd(), 'logs');
  return {
    name: 'session-logs',
    configureServer(server) {
      server.middlewares.use('/api/log', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', (c) => { body += c; if (body.length > 5e6) req.destroy(); });
        req.on('end', () => {
          try {
            const { name, text, jsonl } = JSON.parse(body) as { name: string; text?: string; jsonl?: string };
            if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{2}-[0-9]{2}-[0-9]{2}$/.test(name)) throw new Error('bad name');
            mkdirSync(dir, { recursive: true });
            if (text) appendFileSync(join(dir, `${name}.log`), text, 'utf8');
            if (jsonl) appendFileSync(join(dir, `${name}.jsonl`), jsonl, 'utf8');
            res.statusCode = 204; res.end();
          } catch { res.statusCode = 400; res.end(); }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [sessionLogs()],
  server: {
    port: 5173,
    proxy: {
      '/ollama': {
        target: 'http://127.0.0.1:11434',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/ollama/, ''),
      },
    },
  },
});
