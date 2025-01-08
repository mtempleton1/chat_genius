import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { setupAuth } from "./auth";
import { db } from "@db";
import { users } from "@db/schema";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Setup auth first
setupAuth(app);

// Add CORS headers
app.use((req, res, next) => {
  // Allow the actual origin instead of '*' for WebSocket support
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  next();
});

// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    // Test database connection before starting the server
    await db.select().from(users).limit(1);
    log("Database connection successful");

    const server = registerRoutes(app);

    // Error handling middleware
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      console.error('Server error:', err);
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      res.status(status).json({ message });
    });

    // Setup Vite or static serving based on environment
    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    // Try different ports if the default port is in use
    const tryPort = async (port: number): Promise<void> => {
      try {
        await new Promise<void>((resolve, reject) => {
          server.listen(port, "0.0.0.0", () => {
            log(`Server started on port ${port}`);
            resolve();
          }).on('error', (error: NodeJS.ErrnoException) => {
            if (error.code === 'EADDRINUSE') {
              // Port is in use, reject to try next port
              reject(new Error(`Port ${port} is in use`));
            } else {
              console.error('Server error:', error);
              process.exit(1);
            }
          });
        });
      } catch (error) {
        if (port < 5010) { // Try up to port 5010
          await tryPort(port + 1);
        } else {
          throw error;
        }
      }
    };

    // Start with port 5000 and try alternatives if needed
    await tryPort(5000);
  } catch (error) {
    console.error('Failed to start server:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
})();