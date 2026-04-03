import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      {
        name: 'bff-auth',
        configureServer(server) {
          server.middlewares.use('/api/bff/login', async (req, res, next) => {
            if (req.method !== 'POST') {
              return next();
            }
            try {
              const adminEmail = process.env.ADMIN_EMAIL || env.ADMIN_EMAIL;
              const adminPassword = process.env.ADMIN_PASSWORD || env.ADMIN_PASSWORD;

              if (!adminEmail || !adminPassword) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ message: 'BFF Error: Missing ADMIN_EMAIL or ADMIN_PASSWORD in environment variables.' }));
              }

              const response = await fetch('https://inkart-virid.vercel.app/api/v1/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: adminEmail, password: adminPassword })
              });

              const text = await response.text();
              let data;
              try {
                data = JSON.parse(text);
              } catch {
                res.statusCode = 502;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ message: 'BFF Error: Invalid JSON response from upstream' }));
              }
              res.statusCode = response.status;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(data));
            } catch (e: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ message: 'BFF Login Request Failed', error: e.message }));
            }
          });
        }
      }
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api/proxy': {
          target: 'https://inkart-virid.vercel.app/api/v1',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/proxy/, ''),
          configure: (proxy, options) => {
            proxy.on('proxyReq', (proxyReq, req, res) => {
              proxyReq.setHeader('User-Agent', 'InkArt-Admin-Panel/1.0');
            });
          }
        }
      }
    },
  };
});
