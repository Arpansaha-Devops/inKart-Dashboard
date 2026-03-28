import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Proxy to bypass CORS
  app.all("/api/proxy/*", async (req, res) => {
    // Use req.path instead of req.url to avoid duplicate query params
    const pathWithoutProxy = req.path.replace("/api/proxy", "");
    const targetUrl = `https://inkart-virid.vercel.app/api/v1${pathWithoutProxy}`;
    
    try {
      const proxyHeaders: any = {};
      const allowedHeaders = ['authorization', 'content-type', 'accept'];
      allowedHeaders.forEach(h => {
        if (req.headers[h]) proxyHeaders[h] = req.headers[h];
      });

      console.log(`[Proxy] ${req.method} ${targetUrl}`, req.query);

      const response = await axios({
        method: req.method,
        url: targetUrl,
        data: req.body,
        headers: {
          ...proxyHeaders,
          'User-Agent': 'InkArt-Admin-Panel/1.0',
        },
        params: req.query, // Axios will correctly append these to the URL
      });
      
      console.log(`[Proxy] Success: ${response.status} from ${targetUrl}`);
      console.log(`[Proxy] Response Data Sample:`, JSON.stringify(response.data).substring(0, 200));
      res.status(response.status).json(response.data);
    } catch (error: any) {
      const status = error.response?.status || 500;
      const data = error.response?.data || { message: error.message };
      console.error(`[Proxy] Error ${status} for ${targetUrl}:`, data);
      res.status(status).json(data);
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
