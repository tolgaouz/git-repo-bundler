/* eslint-disable @typescript-eslint/no-explicit-any */
import * as esbuild from "esbuild";
import * as path from "path";
import * as fs from "fs/promises";
import { execSync } from "child_process";
import { PackageJson } from "type-fest";

async function getPackageInfo(repoPath: string): Promise<PackageJson> {
  try {
    const content = await fs.readFile(
      path.join(repoPath, "package.json"),
      "utf-8"
    );
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to read package.json: ${error}`);
  }
}

async function cloneRepo(repoUrl: string, branch = "main"): Promise<string> {
  const tmpBaseDir = path.join(process.cwd(), ".tmp");
  await fs.mkdir(tmpBaseDir, { recursive: true });

  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 15);
  const tmpDir = path.join(
    tmpBaseDir,
    `repo-bundler-${timestamp}-${randomSuffix}`
  );
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    // Clone the repository
    execSync(`git clone --depth 1 --branch ${branch} ${repoUrl} ${tmpDir}`, {
      stdio: "pipe",
    });

    return tmpDir;
  } catch (error) {
    if (branch !== "main") {
      return cloneRepo(repoUrl, "main");
    }
    throw new Error(`Failed to clone repository: ${error}`);
  }
}

async function getTsConfig(repoPath: string): Promise<any> {
  try {
    const content = await fs.readFile(
      path.join(repoPath, "tsconfig.json"),
      "utf-8"
    );
    return JSON.parse(content);
  } catch (e) {
    console.warn("No tsconfig.json found");
    return null;
  }
}

function getPathAliasesFromTsConfig(
  tsconfig: any,
  repoPath: string
): Map<string, string> {
  if (!tsconfig?.compilerOptions?.paths) {
    return new Map();
  }

  const baseUrl = tsconfig.compilerOptions.baseUrl || ".";
  const paths = Object.entries(tsconfig.compilerOptions.paths) as [
    string,
    string[]
  ][];
  const aliases = new Map();

  for (const [alias, [targetPath]] of paths) {
    const cleanAlias = alias.replace(/\/\*$/, "");
    const cleanPath = targetPath.replace(/\/\*$/, "");
    const absolutePath = path.join(repoPath, baseUrl, cleanPath);
    aliases.set(cleanAlias, absolutePath);
  }

  return aliases;
}

async function findGlobalCssFiles(repoDir: string): Promise<string[]> {
  const globalCssPatterns = [
    "globals.css",
    "global.css",
    "app.css",
    "styles.css",
    "index.css",
  ];
  const cssFiles: string[] = [];

  async function searchDirectory(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory() && !entry.name.includes("node_modules")) {
        await searchDirectory(fullPath);
      } else if (
        entry.isFile() &&
        globalCssPatterns.includes(entry.name.toLowerCase())
      ) {
        cssFiles.push(fullPath);
      }
    }
  }

  await searchDirectory(repoDir);
  return cssFiles;
}

async function generateHtmlTemplate(bundledJs: string): Promise<string> {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <script src="https://cdn.tailwindcss.com"></script>
      <script>
        tailwind.config = {
          theme: {
            fontFamily: {
              sans: ['geist'],
              mono: ['geist-mono'],
            },
            extend: {
              borderRadius: {
                lg: 'var(--radius)',
                md: 'calc(var(--radius) - 2px)',
                sm: 'calc(var(--radius) - 4px)',
              },
              colors: {
                background: 'hsl(var(--background))',
                foreground: 'hsl(var(--foreground))',
                card: {
                  DEFAULT: 'hsl(var(--card))',
                  foreground: 'hsl(var(--card-foreground))',
                },
                popover: {
                  DEFAULT: 'hsl(var(--popover))',
                  foreground: 'hsl(var(--popover-foreground))',
                },
                primary: {
                  DEFAULT: 'hsl(var(--primary))',
                  foreground: 'hsl(var(--primary-foreground))',
                },
                secondary: {
                  DEFAULT: 'hsl(var(--secondary))',
                  foreground: 'hsl(var(--secondary-foreground))',
                },
                muted: {
                  DEFAULT: 'hsl(var(--muted))',
                  foreground: 'hsl(var(--muted-foreground))',
                },
                accent: {
                  DEFAULT: 'hsl(var(--accent))',
                  foreground: 'hsl(var(--accent-foreground))',
                },
                destructive: {
                  DEFAULT: 'hsl(var(--destructive))',
                  foreground: 'hsl(var(--destructive-foreground))',
                },
                border: 'hsl(var(--border))',
                input: 'hsl(var(--input))',
                ring: 'hsl(var(--ring))',
                chart: {
                  '1': 'hsl(var(--chart-1))',
                  '2': 'hsl(var(--chart-2))',
                  '3': 'hsl(var(--chart-3))',
                  '4': 'hsl(var(--chart-4))',
                  '5': 'hsl(var(--chart-5))',
                },
                sidebar: {
                  DEFAULT: 'hsl(var(--sidebar-background))',
                  foreground: 'hsl(var(--sidebar-foreground))',
                  primary: 'hsl(var(--sidebar-primary))',
                  'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
                  accent: 'hsl(var(--sidebar-accent))',
                  'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
                  border: 'hsl(var(--sidebar-border))',
                  ring: 'hsl(var(--sidebar-ring))',
                },
              },
            },
          }
        }
      </script>
    </head>
    <body>
      <div id="root"></div>
      <script type="module">
        ${bundledJs}
      </script>
    </body>
    </html>`;
}

export async function generateBundle({
  repoUrl,
  branch = "main",
  debug = false,
  entryFileContent = "const View = () => { return <Button>Some Mock Data</Button> }",
  imports = ["import { Button } from '@/components/ui/button'"],
}: {
  repoUrl: string;
  entryFileContent?: string;
  imports?: string[];
  branch?: string;
  debug?: boolean;
}) {
  let repoDir: string | null = null;

  try {
    console.log("Cloning repo:", repoUrl, branch);
    repoDir = await cloneRepo(repoUrl, branch);

    // Find all global CSS files
    const globalCssFiles = await findGlobalCssFiles(repoDir);
    console.log("Found global CSS files:", globalCssFiles);

    const tsConfig = await getTsConfig(repoDir);
    const pathAliases = getPathAliasesFromTsConfig(tsConfig, repoDir);
    const packageJson = await getPackageInfo(repoDir);

    console.log(repoDir);

    // Run bun install
    execSync(`NODE_OPTIONS="--max-old-space-size=384" bun install`, {
      cwd: repoDir,
      stdio: "inherit",
    });

    // Create entry file with global CSS imports
    const entryFile = path.join(repoDir, "__entry.tsx");
    const cssImports = globalCssFiles
      .map(
        (file) => `import '${path.relative(path.dirname(entryFile), file)}';`
      )
      .join("\n");

    await fs.writeFile(
      entryFile,
      `
      ${cssImports}
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      ${imports.join(";\n")}
    
      const container = document.getElementById('root');
      if (!container) throw new Error('Root element not found');

      ${entryFileContent}
      
      const root = createRoot(container);
      root.render(
        <React.StrictMode>
          <View />
        </React.StrictMode>
      );
      `
    );

    const jsBundle = await esbuild.build({
      entryPoints: [entryFile],
      bundle: true,
      format: "esm",
      minify: true,
      write: debug,
      ...(debug && { outfile: path.join(process.cwd(), "dist", "bundle.js") }),
      nodePaths: [path.join(repoDir, "node_modules")],
      sourcemap: false,
      platform: "browser",
      tsconfigRaw: {
        compilerOptions: {
          module: "CommonJS",
          target: "es2022",
          esModuleInterop: true,
          strict: true,
        },
      },
      loader: {
        ".js": "jsx",
        ".jsx": "jsx",
        ".ts": "tsx",
        ".tsx": "tsx",
        ".css": "css",
        ".scss": "css",
      },
      resolveExtensions: [".tsx", ".ts", ".jsx", ".js"],
      absWorkingDir: repoDir,
      plugins: [
        {
          name: "css-collector",
          setup(build) {
            let template = (css: string) =>
              `typeof document<'u'&&` +
              `document.head.appendChild(document.createElement('style'))` +
              `.appendChild(document.createTextNode(${JSON.stringify(css)}))`;
            // Collect CSS content
            build.onLoad({ filter: /\.css$/ }, async (args) => {
              const css = await fs.readFile(args.path, "utf8");
              return { contents: template(css) };
            });
          },
        },
        {
          name: "css-handler",
          setup(build) {
            // Handle CSS modules
            build.onResolve({ filter: /\.module\.(css|scss)$/ }, (args) => {
              return {
                path: path.resolve(path.dirname(args.importer), args.path),
                namespace: "css-module",
              };
            });

            // Handle global CSS files
            build.onResolve({ filter: /\.(css|scss)$/ }, (args) => {
              if (!args.path.includes(".module.")) {
                return {
                  path: path.resolve(path.dirname(args.importer), args.path),
                  namespace: "css-global",
                };
              }
              return null;
            });

            // Load CSS modules
            build.onLoad(
              { filter: /\.module\.(css|scss)$/, namespace: "css-module" },
              async (args) => {
                const css = await fs.readFile(args.path, "utf8");
                const cssModuleNames: Record<string, string> = {};
                const transformedCss = css.replace(
                  /\.([a-zA-Z_][a-zA-Z0-9_-]*)/g,
                  (match, className) => {
                    const uniqueName = `${className}_${Math.random()
                      .toString(36)
                      .slice(2, 8)}`;
                    cssModuleNames[className] = uniqueName;
                    return `.${uniqueName}`;
                  }
                );

                return {
                  contents: transformedCss,
                  loader: "css",
                  resolveDir: path.dirname(args.path),
                  watchFiles: [args.path],
                };
              }
            );

            // Load global CSS
            build.onLoad(
              { filter: /\.(css|scss)$/, namespace: "css-global" },
              async (args) => {
                let css = await fs.readFile(args.path, "utf8");

                // Remove @font-face rules
                css = css.replace(/@font-face\s*{[^}]*}/g, "");

                // Remove @import statements for fonts
                css = css.replace(/@import\s+url\([^)]*\)(.*?);/g, (match) => {
                  // Keep the import if it's not font-related
                  return match.toLowerCase().includes("font") ? "" : match;
                });

                // Remove Google Fonts imports
                css = css.replace(
                  /@import\s+url\(['"]https?:\/\/fonts\.googleapis\.com[^'"]*['"]\)[^;]*;/g,
                  ""
                );

                return {
                  contents: css,
                  loader: "css",
                  resolveDir: path.dirname(args.path),
                };
              }
            );
          },
        },
        {
          name: "resolve-path-aliases",
          setup(build) {
            // Create a regex pattern from the path aliases
            const aliasPatterns = Array.from(pathAliases.keys())
              .map((alias) => `^${alias}/`)
              .join("|");
            const aliasRegex = new RegExp(aliasPatterns);

            build.onResolve({ filter: aliasRegex }, async (args) => {
              console.log("Resolving alias:", args.path, "from", args.importer);

              const workingDir = build.initialOptions.absWorkingDir;
              if (!workingDir) {
                throw new Error("No working directory specified");
              }

              // Find matching alias
              for (const [alias, targetPath] of Array.from(
                pathAliases.entries()
              )) {
                if (args.path.startsWith(`${alias}/`)) {
                  const resolvedPath = args.path.replace(alias, targetPath);
                  console.log(`Resolved alias ${alias} to ${resolvedPath}`);

                  // Verify the file exists
                  for (const ext of [".ts", ".tsx", ".js", ".jsx"]) {
                    const fullPath = resolvedPath + ext;
                    try {
                      await fs.access(fullPath);
                      return { path: fullPath };
                    } catch {}
                  }

                  // Try index files
                  for (const ext of [".ts", ".tsx", ".js", ".jsx"]) {
                    const indexPath = path.join(resolvedPath, `index${ext}`);
                    try {
                      await fs.access(indexPath);
                      return { path: indexPath };
                    } catch {}
                  }
                }
              }

              // If we reach here, we couldn't resolve the aliased path
              throw new Error(`Could not resolve aliased module: ${args.path}`);
            });
          },
        },
      ],
    });

    // Get the bundled JS
    const bundledJs = jsBundle.outputFiles?.[0]?.text || "";

    // Generate HTML with inline JS bundle
    const htmlContent = await generateHtmlTemplate(bundledJs);

    // If debug mode is on, write files to dist directory
    if (debug) {
      const distDir = path.join(process.cwd(), "dist");
      console.log("Writing debug files to:", distDir);
      await fs.mkdir(distDir, { recursive: true });

      // Write HTML file
      await fs.writeFile(path.join(distDir, "index.html"), htmlContent);

      console.log("Debug files written to:", distDir);
    }

    // Clean up

    return {
      html: htmlContent,
      js: bundledJs,
    };
  } catch (error) {
    console.error("Error in bundleComponent:", error);
    return {
      html: null,
      js: null,
    };
  }
}
