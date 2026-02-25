export const CREATE_TICKETS_TABLE = `
CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  type TEXT,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'Backlog',
  intent TEXT NOT NULL,
  context TEXT,
  constraints_use TEXT,
  constraints_avoid TEXT,
  assumptions TEXT,
  change_class TEXT,
  change_class_reason TEXT,
  plan TEXT,
  derived_knowledge TEXT,
  origin_spec_id TEXT,
  author TEXT DEFAULT 'unknown',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
)`;

export const CREATE_TICKETS_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_created ON tickets(created_at);
CREATE INDEX IF NOT EXISTS idx_tickets_author ON tickets(author)`;

export const CREATE_KNOWLEDGE_TABLE = `
CREATE TABLE IF NOT EXISTS knowledge (
  id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL DEFAULT 'global',
  chunk_index INTEGER DEFAULT 0,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding F32_BLOB(384),
  category TEXT,
  tags TEXT,
  citations TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  origin_ticket_id TEXT,
  origin_ticket_type TEXT,
  confidence REAL DEFAULT 1.0,
  active INTEGER DEFAULT 1,
  decision_scope TEXT NOT NULL DEFAULT 'global',
  usage_count INTEGER DEFAULT 0,
  last_used_at TEXT,
  author TEXT DEFAULT 'unknown',
  branch TEXT DEFAULT 'main',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (origin_ticket_id) REFERENCES tickets(id)
)`;

export const CREATE_KNOWLEDGE_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_knowledge_namespace ON knowledge(namespace);
CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge(category);
CREATE INDEX IF NOT EXISTS idx_knowledge_active ON knowledge(active);
CREATE INDEX IF NOT EXISTS idx_knowledge_scope ON knowledge(decision_scope);
CREATE INDEX IF NOT EXISTS idx_knowledge_author ON knowledge(author);
CREATE INDEX IF NOT EXISTS idx_knowledge_branch ON knowledge(branch)`;

export const CREATE_VECTOR_INDEX = `
CREATE INDEX IF NOT EXISTS knowledge_embedding_idx ON knowledge(libsql_vector_idx(embedding))`;

export const CREATE_SPECS_TABLE = `
CREATE TABLE IF NOT EXISTS specs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author TEXT DEFAULT 'unknown',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
)`;

export const CREATE_SPECS_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_specs_created ON specs(created_at);
CREATE INDEX IF NOT EXISTS idx_specs_author ON specs(author)`;

export const CREATE_COMMENTS_TABLE = `
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  parent_type TEXT NOT NULL,
  parent_id TEXT NOT NULL,
  author TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
)`;

export const CREATE_COMMENTS_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_type, parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_created ON comments(created_at)`;

export const CREATE_WIKI_PAGES_TABLE = `
CREATE TABLE IF NOT EXISTS wiki_pages (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'file',
  data TEXT,
  mtime INTEGER,
  updated_at TEXT DEFAULT (datetime('now'))
)`;

export const CREATE_WIKI_PAGES_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_wiki_pages_path ON wiki_pages(path);
CREATE INDEX IF NOT EXISTS idx_wiki_pages_type ON wiki_pages(type)`;

export const CREATE_WIKI_CITATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS wiki_citations (
  id TEXT PRIMARY KEY,
  wiki_page_id TEXT NOT NULL,
  knowledge_id TEXT NOT NULL,
  function_name TEXT,
  start_line INTEGER,
  end_line INTEGER,
  match_type TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (wiki_page_id) REFERENCES wiki_pages(id),
  FOREIGN KEY (knowledge_id) REFERENCES knowledge(id)
)`;

export const CREATE_WIKI_CITATIONS_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_wiki_citations_page ON wiki_citations(wiki_page_id);
CREATE INDEX IF NOT EXISTS idx_wiki_citations_knowledge ON wiki_citations(knowledge_id)`;

