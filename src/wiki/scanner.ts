// web-tree-sitter AST pipeline for scanning TypeScript/JavaScript files

import { Parser, Language, type Node as SyntaxNode } from 'web-tree-sitter';
import { readFileSync, readdirSync, statSync } from 'node:fs';
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

export interface ASTVariable {
  name: string;
  line: number;
  kind: 'const' | 'let' | 'var';
  isExported: boolean;
}

export interface ASTInterface {
  name: string;
  line: number;
  endLine: number;
  isExported: boolean;
  properties: string[];
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
  language: 'typescript' | 'javascript' | 'tsx' | 'jsx' | 'php' | 'go' | 'html' | 'css';
  lines: number;
  functions: ASTFunction[];
  classes: ASTClass[];
  variables: ASTVariable[];
  interfaces: ASTInterface[];
  imports: ASTImport[];
}

export interface WikiScanResult {
  rootPath: string;
  files: ASTFileResult[];
  scannedAt: string;
  totalFiles: number;
  totalFunctions: number;
  totalClasses: number;
  totalConstants: number;
  totalVariables: number;
  totalInterfaces: number;
  totalImports: number;
}

export interface FileMtimeEntry {
  relativePath: string;
  absolutePath: string;
  mtimeMs: number;
}

// ============ Parser Singleton ============

let parserInstance: Parser | null = null;
const languageCache = new Map<string, Language>();

const GRAMMAR_MAP: Record<string, string> = {
  '.ts': 'tree-sitter-typescript.wasm',
  '.tsx': 'tree-sitter-tsx.wasm',
  '.js': 'tree-sitter-javascript.wasm',
  '.jsx': 'tree-sitter-javascript.wasm',
  '.php': 'tree-sitter-php.wasm',
  '.go': 'tree-sitter-go.wasm',
  '.html': 'tree-sitter-html.wasm',
  '.htm': 'tree-sitter-html.wasm',
  '.css': 'tree-sitter-css.wasm',
};

const LANG_MAP: Record<string, ASTFileResult['language']> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.php': 'php',
  '.go': 'go',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
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

function isExported(node: SyntaxNode, lang: string): boolean {
  if (lang === 'php') {
    // In PHP, public visibility = exported
    return hasVisibility(node, 'public');
  }
  const parent = node.parent;
  if (!parent) return false;
  return parent.type === 'export_statement';
}

function hasVisibility(node: SyntaxNode, visibility: string): boolean {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === 'visibility_modifier' && child.text === visibility) return true;
  }
  return false;
}

function extractParams(node: SyntaxNode, lang: string): string[] {
  const params: string[] = [];
  const paramsNode = node.childForFieldName('parameters');
  if (!paramsNode) return params;

  for (const child of paramsNode.namedChildren) {
    if (lang === 'php') {
      if (child.type === 'simple_parameter') {
        const nameNode = child.childForFieldName('name');
        if (nameNode) params.push(nameNode.text);
      } else if (child.type === 'variadic_parameter') {
        const nameNode = child.childForFieldName('name');
        if (nameNode) params.push('...' + nameNode.text);
      }
    } else if (lang === 'go') {
      if (child.type === 'parameter_declaration') {
        const nameNode = child.childForFieldName('name');
        if (nameNode) params.push(nameNode.text);
      } else if (child.type === 'variadic_parameter_declaration') {
        const nameNode = child.childForFieldName('name');
        if (nameNode) params.push('...' + nameNode.text);
      }
    } else {
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

function extractFunctions(rootNode: SyntaxNode, lang: string): ASTFunction[] {
  const functions: ASTFunction[] = [];

  if (lang === 'html' || lang === 'css') return functions;

  if (lang === 'php') {
    // PHP: function_definition for top-level functions
    const funcDefs = rootNode.descendantsOfType('function_definition');
    for (const node of funcDefs) {
      // Skip methods inside class bodies
      let parent = node.parent;
      let insideClass = false;
      while (parent) {
        if (parent.type === 'declaration_list') { insideClass = true; break; }
        parent = parent.parent;
      }
      if (insideClass) continue;

      const nameNode = node.childForFieldName('name');
      if (!nameNode) continue;
      functions.push({
        name: nameNode.text,
        line: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        params: extractParams(node, lang),
        isAsync: false,
        isExported: false,
        kind: 'function',
      });
    }
    return functions;
  }

  if (lang === 'go') {
    // Go: function_declaration (top-level functions)
    const funcDecls = rootNode.descendantsOfType('function_declaration');
    for (const node of funcDecls) {
      const nameNode = node.childForFieldName('name');
      if (!nameNode) continue;
      const name = nameNode.text;
      functions.push({
        name,
        line: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        params: extractParams(node, lang),
        isAsync: false,
        isExported: name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase(),
        kind: 'function',
      });
    }
    // Go: method_declaration (receiver methods) — treat as top-level functions with 'method' kind
    const methodDecls = rootNode.descendantsOfType('method_declaration');
    for (const node of methodDecls) {
      const nameNode = node.childForFieldName('name');
      if (!nameNode) continue;
      const name = nameNode.text;
      functions.push({
        name: name,
        line: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        params: extractParams(node, lang),
        isAsync: false,
        isExported: name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase(),
        kind: 'method',
      });
    }
    return functions;
  }

  // JS/TS: Function declarations
  const funcDecls = rootNode.descendantsOfType('function_declaration');
  for (const node of funcDecls) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) continue;
    functions.push({
      name: nameNode.text,
      line: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      params: extractParams(node, lang),
      isAsync: checkAsync(node),
      isExported: isExported(node, lang),
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
    const exported = lexDecl ? isExported(lexDecl, lang) : false;

    functions.push({
      name: nameNode.text,
      line: declarator.startPosition.row + 1,
      endLine: valueNode.endPosition.row + 1,
      params: extractParams(valueNode, lang),
      isAsync: checkAsync(valueNode),
      isExported: exported,
      kind: 'arrow',
    });
  }

  return functions;
}

function extractMethods(classBody: SyntaxNode, lang: string): ASTFunction[] {
  const methods: ASTFunction[] = [];
  const nodeType = lang === 'php' ? 'method_declaration' : 'method_definition';
  const methodDefs = classBody.descendantsOfType(nodeType);

  for (const node of methodDefs) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) continue;
    methods.push({
      name: nameNode.text,
      line: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      params: extractParams(node, lang),
      isAsync: lang === 'php' ? false : checkAsync(node),
      isExported: lang === 'php' ? hasVisibility(node, 'public') : false,
      kind: 'method',
    });
  }

  return methods;
}

function extractClasses(rootNode: SyntaxNode, lang: string): ASTClass[] {
  const classes: ASTClass[] = [];

  if (lang === 'html' || lang === 'css') return classes;

  if (lang === 'go') {
    // Go: type_spec with struct_type (type Foo struct { ... })
    const typeSpecs = rootNode.descendantsOfType('type_spec');
    for (const node of typeSpecs) {
      const nameNode = node.childForFieldName('name');
      const typeNode = node.childForFieldName('type');
      if (!nameNode || !typeNode || typeNode.type !== 'struct_type') continue;

      const name = nameNode.text;
      classes.push({
        name,
        line: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        isExported: name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase(),
        methods: [], // Go methods are at top level, already captured in extractFunctions
      });
    }
    return classes;
  }

  const classDecls = rootNode.descendantsOfType('class_declaration');

  for (const node of classDecls) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) continue;

    const body = node.childForFieldName('body');
    const methods = body ? extractMethods(body, lang) : [];

    classes.push({
      name: nameNode.text,
      line: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      isExported: isExported(node, lang),
      methods,
    });
  }

  return classes;
}

function extractVariables(rootNode: SyntaxNode, lang: string): ASTVariable[] {
  const variables: ASTVariable[] = [];

  // Variables only apply to JS/TS and CSS (custom properties)
  if (lang === 'php' || lang === 'go' || lang === 'html') return variables;

  if (lang === 'css') return extractCssCustomProperties(rootNode);

  const lexDecls = rootNode.descendantsOfType('lexical_declaration');
  const varDecls = rootNode.descendantsOfType('variable_declaration');

  for (const node of [...lexDecls, ...varDecls]) {
    // Skip declarations inside functions or class bodies
    let parent = node.parent;
    let nested = false;
    while (parent) {
      if (parent.type === 'function_declaration' || parent.type === 'arrow_function' ||
          parent.type === 'method_definition' || parent.type === 'class_body' ||
          parent.type === 'function' || parent.type === 'statement_block') {
        // Allow export_statement → lexical_declaration at top level
        if (parent.type === 'statement_block' && parent.parent?.type !== 'program') {
          nested = true;
          break;
        }
        if (parent.type !== 'statement_block') {
          nested = true;
          break;
        }
      }
      parent = parent.parent;
    }
    if (nested) continue;

    const kindNode = node.children[0];
    const kind = (kindNode?.text === 'let' ? 'let' : kindNode?.text === 'var' ? 'var' : 'const') as ASTVariable['kind'];
    const exported = isExported(node, lang);

    for (const declarator of node.descendantsOfType('variable_declarator')) {
      const valueNode = declarator.childForFieldName('value');
      // Skip arrow functions — already captured as functions
      if (valueNode && valueNode.type === 'arrow_function') continue;

      const nameNode = declarator.childForFieldName('name');
      if (!nameNode) continue;

      variables.push({
        name: nameNode.text,
        line: declarator.startPosition.row + 1,
        kind,
        isExported: exported,
      });
    }
  }

  return variables;
}

function extractInterfaces(rootNode: SyntaxNode, lang: string): ASTInterface[] {
  const interfaces: ASTInterface[] = [];

  if (lang === 'html' || lang === 'css') return interfaces;

  if (lang === 'go') {
    // Go: type_spec with interface_type
    const typeSpecs = rootNode.descendantsOfType('type_spec');
    for (const node of typeSpecs) {
      const nameNode = node.childForFieldName('name');
      const typeNode = node.childForFieldName('type');
      if (!nameNode || !typeNode || typeNode.type !== 'interface_type') continue;

      const name = nameNode.text;
      const properties: string[] = [];
      const methodSpecs = typeNode.descendantsOfType('method_spec');
      for (const ms of methodSpecs) {
        const mn = ms.childForFieldName('name');
        if (mn) properties.push(mn.text);
      }

      interfaces.push({
        name,
        line: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        isExported: name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase(),
        properties,
      });
    }
    return interfaces;
  }

  // PHP has no interfaces in this context
  if (lang === 'php') return interfaces;

  // JS/TS: interface_declaration
  const ifaceDecls = rootNode.descendantsOfType('interface_declaration');
  for (const node of ifaceDecls) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) continue;

    const properties: string[] = [];
    const body = node.childForFieldName('body');
    if (body) {
      for (const child of body.namedChildren) {
        if (child.type === 'property_signature' || child.type === 'method_signature') {
          const propName = child.childForFieldName('name');
          if (propName) properties.push(propName.text);
        }
      }
    }

    interfaces.push({
      name: nameNode.text,
      line: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      isExported: isExported(node, lang),
      properties,
    });
  }

  // TS: type_alias_declaration (type Foo = ...)
  const typeAliasDecls = rootNode.descendantsOfType('type_alias_declaration');
  for (const node of typeAliasDecls) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) continue;

    interfaces.push({
      name: nameNode.text,
      line: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      isExported: isExported(node, lang),
      properties: [],
    });
  }

  return interfaces;
}

function extractCssCustomProperties(rootNode: SyntaxNode): ASTVariable[] {
  const variables: ASTVariable[] = [];
  const declarations = rootNode.descendantsOfType('declaration');
  for (const decl of declarations) {
    const propNode = decl.descendantsOfType('property_name')[0];
    if (!propNode || !propNode.text.startsWith('--')) continue;
    variables.push({
      name: propNode.text,
      line: decl.startPosition.row + 1,
      kind: 'const',
      isExported: false,
    });
  }
  return variables;
}

function extractHtmlImports(rootNode: SyntaxNode): ASTImport[] {
  const imports: ASTImport[] = [];

  // <script src="...">
  const scriptElements = rootNode.descendantsOfType('script_element');
  for (const el of scriptElements) {
    const startTag = el.descendantsOfType('start_tag')[0];
    if (!startTag) continue;
    const src = getAttrValue(startTag, 'src');
    if (src) {
      imports.push({
        source: src,
        specifiers: ['script'],
        line: el.startPosition.row + 1,
        isTypeOnly: false,
      });
    }
  }

  // <link href="..."> (stylesheets, icons, etc.)
  // link is a self_closing_tag or element with tag_name "link"
  const allElements = [
    ...rootNode.descendantsOfType('element'),
    ...rootNode.descendantsOfType('self_closing_tag'),
  ];
  for (const el of allElements) {
    const tag = el.type === 'self_closing_tag' ? el : el.descendantsOfType('start_tag')[0];
    if (!tag) continue;
    const tagName = tag.descendantsOfType('tag_name')[0];
    if (!tagName || tagName.text !== 'link') continue;
    const href = getAttrValue(tag, 'href');
    if (href) {
      const rel = getAttrValue(tag, 'rel') || 'link';
      imports.push({
        source: href,
        specifiers: [rel],
        line: el.startPosition.row + 1,
        isTypeOnly: false,
      });
    }
  }

  return imports;
}

function extractCssImports(rootNode: SyntaxNode): ASTImport[] {
  const imports: ASTImport[] = [];
  const importStmts = rootNode.descendantsOfType('import_statement');
  for (const node of importStmts) {
    // @import can have a string_value or call_expression (url(...))
    const strVal = node.descendantsOfType('string_value')[0];
    const callExpr = node.descendantsOfType('call_expression')[0];
    let source = '';
    if (strVal) {
      source = strVal.text.replace(/['"]/g, '');
    } else if (callExpr) {
      const args = callExpr.descendantsOfType('string_value')[0];
      source = args ? args.text.replace(/['"]/g, '') : callExpr.text;
    }
    if (source) {
      imports.push({
        source,
        specifiers: ['@import'],
        line: node.startPosition.row + 1,
        isTypeOnly: false,
      });
    }
  }
  return imports;
}

function getAttrValue(tag: SyntaxNode, attrName: string): string | null {
  const attrs = tag.descendantsOfType('attribute');
  for (const attr of attrs) {
    const nameNode = attr.descendantsOfType('attribute_name')[0];
    if (!nameNode || nameNode.text !== attrName) continue;
    const quoted = attr.descendantsOfType('quoted_attribute_value')[0];
    if (quoted) {
      const val = quoted.descendantsOfType('attribute_value')[0];
      return val ? val.text : null;
    }
    const unquoted = attr.descendantsOfType('attribute_value')[0];
    return unquoted ? unquoted.text : null;
  }
  return null;
}

function extractImports(rootNode: SyntaxNode, lang: string): ASTImport[] {
  const imports: ASTImport[] = [];

  if (lang === 'html') return extractHtmlImports(rootNode);
  if (lang === 'css') return extractCssImports(rootNode);

  if (lang === 'go') {
    // Go: import_declaration with import_spec
    const importDecls = rootNode.descendantsOfType('import_declaration');
    for (const node of importDecls) {
      const specs = node.descendantsOfType('import_spec');
      for (const spec of specs) {
        const pathNode = spec.childForFieldName('path');
        if (!pathNode) continue;
        const source = pathNode.text.replace(/"/g, '');
        const parts = source.split('/');
        const nameNode = spec.childForFieldName('name');
        const specifier = nameNode?.text || parts[parts.length - 1];
        imports.push({
          source,
          specifiers: [specifier],
          line: spec.startPosition.row + 1,
          isTypeOnly: false,
        });
      }
    }
    return imports;
  }

  if (lang === 'php') {
    // PHP: namespace_use_declaration (use statements)
    const useDecls = rootNode.descendantsOfType('namespace_use_declaration');
    for (const node of useDecls) {
      const clauses = node.descendantsOfType('namespace_use_clause');
      for (const clause of clauses) {
        const qualifiedName = clause.descendantsOfType('qualified_name')[0]
          || clause.descendantsOfType('name')[0];
        if (!qualifiedName) continue;

        const source = qualifiedName.text;
        const parts = source.split('\\');
        const aliasNode = clause.childForFieldName('alias');
        const specifier = aliasNode?.text || parts[parts.length - 1];

        imports.push({
          source,
          specifiers: [specifier],
          line: node.startPosition.row + 1,
          isTypeOnly: false,
        });
      }
      // If no clauses found, try the node itself
      if (clauses.length === 0) {
        const qualifiedName = node.descendantsOfType('qualified_name')[0]
          || node.descendantsOfType('name')[0];
        if (qualifiedName) {
          const source = qualifiedName.text;
          const parts = source.split('\\');
          imports.push({
            source,
            specifiers: [parts[parts.length - 1]],
            line: node.startPosition.row + 1,
            isTypeOnly: false,
          });
        }
      }
    }
    return imports;
  }

  // JS/TS: import_statement
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
  'vendor',
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
  const lang = LANG_MAP[ext];

  const functions = extractFunctions(rootNode, lang);
  const classes = extractClasses(rootNode, lang);
  const variables = extractVariables(rootNode, lang);
  const interfaces = extractInterfaces(rootNode, lang);
  const imports = extractImports(rootNode, lang);

  tree.delete();

  return {
    path: filePath,
    relativePath: relative(rootPath, filePath),
    language: lang,
    lines: lineCount,
    functions,
    classes,
    variables,
    interfaces,
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

// Collect files with their modification times for incremental scanning
export function collectFilesWithMtimes(rootPath: string): FileMtimeEntry[] {
  const filePaths = collectFiles(rootPath);
  const entries: FileMtimeEntry[] = [];

  for (const fp of filePaths) {
    try {
      const stat = statSync(fp);
      entries.push({
        relativePath: relative(rootPath, fp),
        absolutePath: fp,
        mtimeMs: Math.floor(stat.mtimeMs),
      });
    } catch {
      // File may have been deleted between collect and stat
    }
  }

  return entries;
}

// Scan only a specified subset of files (for incremental indexing)
export async function scanFiles(filePaths: string[], rootPath: string): Promise<ASTFileResult[]> {
  const results: ASTFileResult[] = [];
  for (const fp of filePaths) {
    const result = await scanFile(fp, rootPath);
    if (result) results.push(result);
  }
  return results;
}

// Get file mtime in epoch ms, or null if file doesn't exist
export function getMtimeForFile(filePath: string): number | null {
  try {
    return Math.floor(statSync(filePath).mtimeMs);
  } catch {
    return null;
  }
}

export function buildScanResult(rootPath: string, files: ASTFileResult[]): WikiScanResult {
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  const totalFunctions = files.reduce((sum, f) =>
    sum + f.functions.length + f.classes.reduce((s, c) => s + c.methods.length, 0), 0);
  const totalClasses = files.reduce((sum, f) => sum + f.classes.length, 0);
  const allVars = files.flatMap(f => f.variables || []);
  const totalConstants = allVars.filter(v => v.kind === 'const').length;
  const totalVariables = allVars.filter(v => v.kind !== 'const').length;
  const totalInterfaces = files.reduce((sum, f) => sum + (f.interfaces?.length || 0), 0);
  const totalImports = files.reduce((sum, f) => sum + f.imports.length, 0);

  return {
    rootPath,
    files,
    scannedAt: new Date().toISOString(),
    totalFiles: files.length,
    totalFunctions,
    totalClasses,
    totalConstants,
    totalVariables,
    totalInterfaces,
    totalImports,
  };
}

export async function scanProject(rootPath: string): Promise<WikiScanResult> {
  // Check cache — with mtime spot-check validation
  if (scanCache.has(rootPath)) {
    const cachedMtimes = scanCache.getValidatorData(rootPath) as Record<string, number> | null;
    if (cachedMtimes) {
      // Sample up to 10 files and compare mtimes
      const paths = Object.keys(cachedMtimes);
      const sampleSize = Math.min(10, paths.length);
      const sampled = paths.length <= sampleSize
        ? paths
        : paths.sort(() => Math.random() - 0.5).slice(0, sampleSize);

      let allMatch = true;
      for (const relPath of sampled) {
        const absPath = join(rootPath, relPath);
        const currentMtime = getMtimeForFile(absPath);
        if (currentMtime === null || currentMtime !== cachedMtimes[relPath]) {
          allMatch = false;
          break;
        }
      }

      if (allMatch) {
        return scanCache.get(rootPath) as WikiScanResult;
      }
      // Mtime changed — invalidate and re-scan
      scanCache.invalidate(rootPath);
    } else {
      // No validator data but cache exists — return cached
      const cached = scanCache.get(rootPath);
      if (cached) return cached as WikiScanResult;
    }
  }

  const filePaths = collectFiles(rootPath);
  const files: ASTFileResult[] = [];
  const mtimeMap: Record<string, number> = {};

  for (const fp of filePaths) {
    const result = await scanFile(fp, rootPath);
    if (result) {
      files.push(result);
      const mtime = getMtimeForFile(fp);
      if (mtime !== null) {
        mtimeMap[result.relativePath] = mtime;
      }
    }
  }

  const result = buildScanResult(rootPath, files);

  scanCache.set(rootPath, result, mtimeMap);
  return result;
}
