/* eslint-disable @typescript-eslint/no-explicit-any */
import * as esbuild from "esbuild";
import * as path from "path";
import * as fs from "fs/promises";
import { execSync } from "child_process";
import * as ts from "typescript";

interface PackageJson {
  dependencies: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies: Record<string, string>;
}

interface ImportAnalysis {
  nodeModules: Set<string>; // External dependencies
  localFiles: Set<string>; // Local file paths that need to be analyzed
}

interface RepoInfo {
  path: string;
  dependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
}

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

function isNodeModule(importPath: string, packageJson: PackageJson): boolean {
  console.log("Checking if node module", importPath);
  console.log("Import path:", importPath);

  return !!(
    packageJson.dependencies?.[importPath] ||
    packageJson.peerDependencies?.[importPath] ||
    packageJson.devDependencies?.[importPath]
  );
}

/* 
async function findImportsInFile(
  filePath: string,
  repoPath: string,
  packageJson: PackageJson,
  pathAliases: Map<string, string>
): Promise<ImportAnalysis> {
  // First, let's verify the file exists with proper extension
  const resolvedPath = await resolveFilePath(filePath);
  if (!resolvedPath) {
    throw new Error(`Could not resolve file: ${filePath}`);
  }

  const content = await fs.readFile(resolvedPath, "utf-8");
  const analysis: ImportAnalysis = {
    nodeModules: new Set<string>(),
    localFiles: new Set<string>(),
  };

  // Create source file for TypeScript parsing
  const sourceFile = ts.createSourceFile(
    resolvedPath,
    content,
    ts.ScriptTarget.Latest,
    true
  );

  // Recursive function to visit all nodes in the AST
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node)) {
      if (ts.isStringLiteral(node.moduleSpecifier)) {
        processImportPath(node.moduleSpecifier.text);
      }
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      if (ts.isStringLiteral(node.moduleSpecifier)) {
        processImportPath(node.moduleSpecifier.text);
      }
    }

    ts.forEachChild(node, visit);
  }

  async function processImportPath(importPath: string) {
    console.log("Processing import path", importPath);
    // Handle relative imports
    if (importPath.startsWith(".") && resolvedPath) {
      const absolutePath = path.join(path.dirname(resolvedPath), importPath);
      const resolvedImport = await resolveFilePath(absolutePath);
      if (resolvedImport) {
        analysis.localFiles.add(resolvedImport);
      }
      return;
    }

    // Handle path aliases
    for (const [alias, targetPath] of pathAliases) {
      if (importPath.startsWith(`${alias}/`)) {
        console.log("Found alias", alias, targetPath);
        console.log("Import path", importPath);
        console.log("Target path", targetPath);
        const resolvedPath = importPath.replace(alias, targetPath);
        console.log("Resolved path", resolvedPath);
        const resolvedImport = await resolveFilePath(resolvedPath);
        console.log("Resolved import", resolvedImport);
        if (resolvedImport) {
          analysis.localFiles.add(resolvedImport);
          return;
        }
      }
    }

    // Handle node modules
    if (isNodeModule(importPath, packageJson)) {
      analysis.nodeModules.add(importPath);
    } else {
      // If not in package.json, try resolving as a local module
      const localPath = path.join(repoPath, importPath);
      const resolvedLocal = await resolveFilePath(localPath);
      if (resolvedLocal) {
        analysis.localFiles.add(resolvedLocal);
      }
    }
  }

  // Start the AST traversal
  visit(sourceFile);

  return analysis;
} */

/* // Helper function to resolve file paths with extensions
async function resolveFilePath(basePath: string): Promise<string | null> {
  console.log("Trying to access file path", basePath);
  // First try the exact path
  try {
    await fs.access(basePath);
    return basePath;
  } catch (e) {
    console.log("Failed to access file path", e);
  }

  console.log("Trying different extensions");

  // Try different extensions
  // This could be a Promise.all map over iteration of extensions
  // but i'm being optimistic and constraining us to the typescript extensions first
  // so this would run only a couple times compared to Promise.all where it runs for each extension
  const extensions = [".ts", ".tsx", ".js", ".jsx", ".json"];

  // Try with extensions
  for (const ext of extensions) {
    const pathWithExt = basePath + ext;
    console.log("Trying path with extension", pathWithExt);
    try {
      await fs.access(pathWithExt);
      return pathWithExt;
    } catch {}
  }

  return null;
} */

/* 
async function analyzeImports(
  repoPath: string,
  componentPath: string,
  packageJson: PackageJson,
  pathAliases: Map<string, string>
): Promise<Set<string>> {
  const seenFiles = new Set<string>();
  const requiredPackages = new Set<string>();
  const filesToProcess = [path.join(repoPath, componentPath)];

  while (filesToProcess.length > 0) {
    const currentFile = filesToProcess.pop()!;
    if (seenFiles.has(currentFile)) continue;

    seenFiles.add(currentFile);
    try {
      const analysis = await findImportsInFile(
        currentFile,
        repoPath,
        packageJson,
        pathAliases
      );

      console.log("Found imports in file:", currentFile, analysis);

      // Add node modules to required packages
      for (const pkg of analysis.nodeModules) {
        requiredPackages.add(pkg);
      }

      // Add resolved local files to processing queue
      for (const file of analysis.localFiles) {
        if (!seenFiles.has(file)) {
          filesToProcess.push(file);
        }
      }
    } catch (error) {
      console.warn(`Could not analyze imports for ${currentFile}:`, error);
    }
  }

  return requiredPackages;
} */

async function cloneRepo(
  repoUrl: string,
  componentPath: string,
  branch = "main"
): Promise<RepoInfo> {
  const tmpBaseDir = path.join(process.cwd(), ".tmp");
  await fs.mkdir(tmpBaseDir, { recursive: true });

  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 15);
  const tmpDir = path.join(
    tmpBaseDir,
    `component-bundler-${timestamp}-${randomSuffix}`
  );
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    // Clone the repository
    execSync(`git clone --depth 1 --branch ${branch} ${repoUrl} ${tmpDir}`, {
      stdio: "pipe",
    });

    // Read package.json for dependency information
    const packageJson = await getPackageInfo(tmpDir);

    // Get path aliases from tsconfig
    const tsConfig = await getTsConfig(tmpDir);

    const pathAliases = getPathAliasesFromTsConfig(tsConfig, tmpDir);

    console.log("Installing only required dependencies...");
    execSync(`cd ${tmpDir} && npm install --legacy-peer-deps`, {
      stdio: "inherit",
    });

    return {
      path: tmpDir,
      dependencies: packageJson.dependencies,
      peerDependencies: packageJson.peerDependencies || {},
    };
  } catch (error) {
    if (branch !== "main") {
      return cloneRepo(repoUrl, componentPath, "main");
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

async function analyzeExports(filePath: string) {
  // Read the source file
  const sourceText = await fs.readFile(filePath, "utf-8");

  // Create a TypeScript program
  const program = ts.createProgram([filePath], {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    jsx: ts.JsxEmit.React,
  });

  const sourceFile = program.getSourceFile(filePath);
  const exports: {
    namedExports: string[];
    interfaces: string[];
    mainComponent: string | null;
  } = {
    namedExports: [],
    interfaces: [],
    mainComponent: null,
  };

  // Function to recursively visit nodes
  function visit(node: ts.Node) {
    // Check for export declarations
    if (ts.isExportDeclaration(node)) {
      const exportClause = node.exportClause;
      if (exportClause && ts.isNamedExports(exportClause)) {
        exportClause.elements.forEach((element) => {
          console.log("Named export", element);
          exports.namedExports.push(element.name.text);
        });
      }
    }

    // Check for exported interfaces
    if (
      ts.isInterfaceDeclaration(node) &&
      node.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      exports.interfaces.push(node.name.text);
    }

    // Look for React component declarations
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      node.initializer.expression.getText().includes("React.forwardRef")
    ) {
      if (node.name && ts.isIdentifier(node.name)) {
        exports.mainComponent = node.name.text;
      }
    }

    ts.forEachChild(node, visit);
  }

  if (sourceFile) {
    visit(sourceFile);
  }

  return exports;
}

async function bundleComponent(
  repoUrl: string,
  componentPath: string,
  branch = "main"
) {
  let repoDir: string | null = null;

  try {
    const repoInfo = await cloneRepo(repoUrl, componentPath, branch);
    repoDir = repoInfo.path;

    const tsConfig = await getTsConfig(repoDir);
    const pathAliases = getPathAliasesFromTsConfig(tsConfig, repoDir);

    console.log("Path aliases:", pathAliases);

    // Improve dependency detection to handle scoped packages
    const depNames = Object.keys({
      ...repoInfo.dependencies,
      ...repoInfo.peerDependencies,
    });

    // Create the entry file
    const entryFile = path.join(repoDir, "__entry.tsx");
    await fs.writeFile(
      entryFile,
      `
      import {Button} from './${componentPath}';
      import React from "react";
      import ReactDOM from "react-dom";
      import App from "./App";

      const rootElement = document.getElementById("root");
      ReactDOM.render(<Button />, rootElement);
      `
    );

    await fs.mkdir(path.join(repoDir, "dist"), { recursive: true });

    const result = await esbuild.build({
      entryPoints: [entryFile],
      bundle: true,
      format: "esm",
      outfile: path.join(repoDir, "dist/bundle.js"),
      sourcemap: true,
      platform: "browser",
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
          name: "resolve-imports",
          setup(build) {
            build.onResolve({ filter: /.*/ }, async (args) => {
              console.log("Resolving:", args.path, "from", args.importer);

              console.log("Dep names:", depNames);

              // Handle path aliases (like @/lib/utils)
              for (const [alias, targetPath] of pathAliases) {
                console.log("Alias:", alias, targetPath);
                console.log("Args path:", args.path);
                if (args.path.startsWith(`${alias}/`)) {
                  // Make sure we resolve the path relative to the repo root
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

              // Handle relative imports
              if (args.path.startsWith(".")) {
                const resolvedPath = path.resolve(
                  path.dirname(args.importer),
                  args.path
                );
                console.log(`Resolved relative import to ${resolvedPath}`);
                return { path: resolvedPath };
              }

              // Handle node modules by looking in the local node_modules directory
              try {
                const modulePath = require.resolve(args.path, {
                  paths: [path.join(repoDir as string, "node_modules")],
                });
                return { path: modulePath };
              } catch (error) {
                console.warn(`Could not resolve module: ${args.path}`);
                return null;
              }
            });
          },
        },
      ],
    });

    const bundleContent = await fs.readFile(
      path.join(repoDir, "dist/bundle.js"),
      "utf-8"
    );

    // Write bundle to file
    await fs.writeFile(
      path.join(process.cwd(), "dist/bundle.js"),
      bundleContent
    );

    // Clean up
    await fs.rm(repoDir, { recursive: true, force: true });

    return {
      success: true,
      bundle: bundleContent,
      warnings: result.warnings,
      dependencies: {
        ...repoInfo.dependencies,
        ...repoInfo.peerDependencies,
      },
    };
  } catch (error) {
    // Clean up on error
    if (repoDir) {
      await fs.rm(repoDir, { recursive: true, force: true });
    }

    return {
      success: false,
      error: error,
    };
  }
}

bundleComponent(
  "https://github.com/vercel/ai-chatbot",
  "components/ui/button.tsx",
  "main"
).then((result) => {
  if (result.success) {
    console.log("Bundle created successfully");
    console.log("Dependencies:", result.dependencies);
  } else {
    console.error("Failed to create bundle:", result.error);
  }
});
