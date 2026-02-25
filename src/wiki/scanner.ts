// web-tree-sitter AST pipeline for scanning TypeScript/JavaScript files

import { Parser, Language, type Node as SyntaxNode } from 'web-tree-sitter';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanCache } from './cache.js';

// ============ Types ============

export interface ASTFunction {
  name: string;
  line: number;
  endLine: number;
  params: string[];
  isAsync: boolean;
  isExported: boolean;
  kind: 'function' | 'arrow' | 'method';
}

export interface ASTClass {
  name: string;
  line: number;
  endLine: number;
  isExported: boolean;
  methods: ASTFunction[];
}

export interface ASTImport {
  source: string;
  specifiers: string[];
  line: number;
  isTypeOnly: boolean;
}

export interface ASTFileResult {
  path: string;
  relativePath: string;
  language: 'typescript' | 'javascript' | 'tsx' | 'jsx';
  lines: number;
  functions: ASTFunction[];
  classes: ASTClass[];
  imports: ASTImport[];
}

export interface WikiScanResult {
  rootPath: string;
  files: ASTFileResult[];
  scannedAt: string;
  totalFiles: number;
  totalFunctions: number;
  totalClasses: number;
}

// ============ Parser Singleton ============

let parserInstance: Parser | null = null;
const languageCache = new Map<string, Language>();

const GRAMMAR_MAP: Record<string, string> = {
  '.ts': 'tree-sitter-typescript.wasm',
  '.tsx': 'tree-sitter-tsx.wasm',
  '.js': 'tree-sitter-javascript.wasm',
  '.jsx': 'tree-sitter-javascript.wasm',
};

const LANG_MAP: Record<string, ASTFileResult['language']> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'jsx',
};

function getGrammarsDir(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  // In dist: dist/wiki/scanner.js → project root is ../../
  return join(currentDir, '..', '..', 'grammars');
}

export async function initParser(): Promise<Parser> {
  if (parserInstance) return parserInstance;

  await Parser.init({
    locateFile: () => {
      return join(getGrammarsDir(), 'tree-sitter.wasm');
    },
  });

  parserInstance = new Parser();
  return parserInstance;
}

async function getLanguage(ext: string): Promise<Language> {
  const cached = languageCache.get(ext);
  if (cached) return cached;

  const wasmFile = GRAMMAR_MAP[ext];
  if (!wasmFile) throw new Error(`No grammar for extension: ${ext}`);

  const wasmPath = join(getGrammarsDir(), wasmFile);
  const lang = await Language.load(wasmPath);
  languageCache.set(ext, lang);
  return lang;
}

// ============ AST Extraction ============

function isExported(node: SyntaxNode): boolean {
  const parent = node.parent;
  if (!parent) return false;
  return parent.type === 'export_statement';
}

function extractParams(node: SyntaxNode): string[] {
  const params: string[] = [];
  const paramsNode = node.childForFieldName('parameters');
  if (!paramsNode) return params;

  for (const child of paramsNode.namedChildren) {
    if (child.type === 'required_parameter' || child.type === 'optional_parameter') {
      const pattern = child.childForFieldName('pattern');
      if (pattern) params.push(pattern.text);
    } else if (child.type === 'identifier') {
      params.push(child.text);
    } else if (child.type === 'rest_pattern') {
      params.push('...' + (child.namedChildren[0]?.text || ''));
    } else if (child.type === 'assignment_pattern') {
      const left = child.childForFieldName('left');
      if (left) params.push(left.text);
    }
  }
  return params;
}

function checkAsync(node: SyntaxNode): boolean {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === 'async') return true;
  }
  return false;
}

function extractFunctions(rootNode: SyntaxNode): ASTFunction[] {
  const functions: ASTFunction[] = [];

  // Function declarations
  const funcDecls = rootNode.descendantsOfType('function_declaration');
  for (const node of funcDecls) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) continue;
    functions.push({
      name: nameNode.text,
      line: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      params: extractParams(node),
      isAsync: checkAsync(node),
      isExported: isExported(node),
      kind: 'function',
    });
  }

  // Arrow functions in variable declarations
  const varDeclarators = rootNode.descendantsOfType('variable_declarator');
  for (const declarator of varDeclarators) {
    const valueNode = declarator.childForFieldName('value');
    if (!valueNode) continue;
    if (valueNode.type !== 'arrow_function') continue;

    const nameNode = declarator.childForFieldName('name');
    if (!nameNode) continue;

    // Skip arrow functions inside class bodies
    let parent = declarator.parent;
    let insideClass = false;
    while (parent) {
      if (parent.type === 'class_body') { insideClass = true; break; }
      parent = parent.parent;
    }
    if (insideClass) continue;

    // Check export: lexical_declaration → export_statement
    const lexDecl = declarator.parent;
    const exported = lexDecl ? isExported(lexDecl) : false;

    functions.push({
      name: nameNode.text,
      line: declarator.startPosition.row + 1,
      endLine: valueNode.endPosition.row + 1,
      params: extractParams(valueNode),
      isAsync: checkAsync(valueNode),
      isExported: exported,
      kind: 'arrow',
    });
  }

  return functions;
}

function extractMethods(classBody: SyntaxNode): ASTFunction[] {
  const methods: ASTFunction[] = [];
  const methodDefs = classBody.descendantsOfType('method_definition');

  for (const node of methodDefs) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) continue;
    methods.push({
      name: nameNode.text,
      line: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      params: extractParams(node),
      isAsync: checkAsync(node),
      isExported: false,
      kind: 'method',
    });
  }

  return methods;
}

function extractClasses(rootNode: SyntaxNode): ASTClass[] {
  const classes: ASTClass[] = [];
  const classDecls = rootNode.descendantsOfType('class_declaration');

  for (const node of classDecls) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) continue;

    const body = node.childForFieldName('body');
    const methods = body ? extractMethods(body) : [];

    classes.push({
      name: nameNode.text,
      line: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      isExported: isExported(node),
      methods,
    });
  }

  return classes;
}

function extractImports(rootNode: SyntaxNode): ASTImport[] {
  const imports: ASTImport[] = [];
  const importStmts = rootNode.descendantsOfType('import_statement');

  for (const node of importStmts) {
    const sourceNode = node.childForFieldName('source');
    if (!sourceNode) continue;

    const source = sourceNode.text.replace(/['"]/g, '');
    const specifiers: string[] = [];
    let isTypeOnly = false;

    // Check for type-only import: `import type { ... }`
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && child.type === 'type' && child.text === 'type') {
        isTypeOnly = true;
      }
    }

    // Extract specifiers from import clause
    const importClause = node.children.find(c =>
      c.type === 'import_clause' || c.type === 'named_imports'
    );
    if (importClause) {
      const namedImports = importClause.type === 'named_imports'
        ? importClause
        : importClause.descendantsOfType('named_imports')[0];
      if (namedImports) {
        for (const spec of namedImports.namedChildren) {
          if (spec.type === 'import_specifier') {
            const specNameNode = spec.childForFieldName('name');
            const aliasNode = spec.childForFieldName('alias');
            specifiers.push(aliasNode?.text || specNameNode?.text || spec.text);
          }
        }
      }
      // Default import
      const defaultImport = importClause.children?.find(c => c.type === 'identifier');
      if (defaultImport) {
        specifiers.unshift(defaultImport.text);
      }
      // Namespace import
      const nsImport = importClause.descendantsOfType('namespace_import');
      if (nsImport.length > 0) {
        specifiers.push(nsImport[0].text);
      }
    }

    imports.push({
      source,
      specifiers,
      line: node.startPosition.row + 1,
      isTypeOnly,
    });
  }

  return imports;
}

// ============ File & Project Scanning ============

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.superintent', 'dist', '.next',
  '.nuxt', '.svelte-kit', 'coverage', '.turbo', '.cache',
]);

const SUPPORTED_EXTS = new Set(Object.keys(GRAMMAR_MAP));

export async function scanFile(filePath: string, rootPath: string): Promise<ASTFileResult | null> {
  const ext = extname(filePath);
  if (!SUPPORTED_EXTS.has(ext)) return null;

  const parser = await initParser();
  const language = await getLanguage(ext);
  parser.setLanguage(language);

  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }

  const tree = parser.parse(content);
  if (!tree) return null;

  const rootNode = tree.rootNode;
  const lineCount = content.split('\n').length;

  const functions = extractFunctions(rootNode);
  const classes = extractClasses(rootNode);
  const imports = extractImports(rootNode);

  tree.delete();

  return {
    path: filePath,
    relativePath: relative(rootPath, filePath),
    language: LANG_MAP[ext],
    lines: lineCount,
    functions,
    classes,
    imports,
  };
}

function collectFiles(dir: string): string[] {
  const files: string[] = [];

  let entries: { name: string; isDirectory(): boolean; isFile(): boolean }[];
  try {
    entries = readdirSync(dir, { withFileTypes: true }) as { name: string; isDirectory(): boolean; isFile(): boolean }[];
  } catch {
    return files;
  }

  for (const entry of entries) {
    const name = String(entry.name);
    if (SKIP_DIRS.has(name)) continue;

    const fullPath = join(dir, name);

    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath));
    } else if (entry.isFile() && SUPPORTED_EXTS.has(extname(name))) {
      files.push(fullPath);
    }
  }

  return files;
}

export async function scanProject(rootPath: string): Promise<WikiScanResult> {
  // Check cache
  const cached = scanCache.get(rootPath) as WikiScanResult | null;
  if (cached) return cached;

  const filePaths = collectFiles(rootPath);
  const files: ASTFileResult[] = [];

  for (const fp of filePaths) {
    const result = await scanFile(fp, rootPath);
    if (result) files.push(result);
  }

  // Sort by relative path
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  const totalFunctions = files.reduce((sum, f) =>
    sum + f.functions.length + f.classes.reduce((s, c) => s + c.methods.length, 0), 0);
  const totalClasses = files.reduce((sum, f) => sum + f.classes.length, 0);

  const result: WikiScanResult = {
    rootPath,
    files,
    scannedAt: new Date().toISOString(),
    totalFiles: files.length,
    totalFunctions,
    totalClasses,
  };

  scanCache.set(rootPath, result);
  return result;
}
