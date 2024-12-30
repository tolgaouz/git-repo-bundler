import { generateBundle } from "./bundler";

const port = 3001;

const server = Bun.serve({
  port,
  hostname: "0.0.0.0",
  async fetch(req) {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Accept",
        },
      });
    }

    // Add CORS headers to all responses
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
    };

    const url = new URL(req.url);

    // Health check endpoint
    if (url.pathname === "/health" && req.method === "GET") {
      return Response.json({ status: "ok" }, { headers: corsHeaders });
    }

    // Bundle endpoint
    if (url.pathname === "/bundle" && req.method === "POST") {
      try {
        const body = (await req.json()) as {
          repoUrl: string;
          branch?: string;
          entryFileContent?: string;
          imports?: string[];
        };
        const { repoUrl, branch = "main", entryFileContent, imports } = body;

        console.log("Received request:", { repoUrl, branch });

        if (!repoUrl) {
          return Response.json(
            {
              html: null,
              js: null,
              error: "Missing required parameters: repoUrl is required",
            },
            {
              status: 400,
              headers: corsHeaders,
            }
          );
        }

        const result = await generateBundle({
          repoUrl,
          branch,
          entryFileContent,
          imports,
        });
        return Response.json(result, { headers: corsHeaders });
      } catch (error) {
        console.error("Bundle error:", error);
        return Response.json(
          {
            html: null,
            js: null,
            error:
              error instanceof Error ? error.message : "Unknown error occurred",
          },
          {
            status: 500,
            headers: corsHeaders,
          }
        );
      }
    }

    // 404 for everything else
    return new Response("Not Found", {
      status: 404,
      headers: corsHeaders,
    });
  },
});

console.log(`Server running at http://localhost:${port}`);
