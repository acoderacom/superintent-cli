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
  tasks TEXT,
  definition_of_done TEXT,
  change_class TEXT,
  change_class_reason TEXT,
  plan TEXT,
  derived_knowledge TEXT,
  comments TEXT,
  origin_spec_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
)`;
export const CREATE_TICKETS_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_created ON tickets(created_at)`;
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
  source TEXT NOT NULL DEFAULT 'manual',
  origin_ticket_id TEXT,
  origin_ticket_type TEXT,
  confidence REAL DEFAULT 1.0,
  active INTEGER DEFAULT 1,
  decision_scope TEXT NOT NULL DEFAULT 'global',
  usage_count INTEGER DEFAULT 0,
  last_used_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (origin_ticket_id) REFERENCES tickets(id)
)`;
export const CREATE_KNOWLEDGE_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_knowledge_namespace ON knowledge(namespace);
CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge(category);
CREATE INDEX IF NOT EXISTS idx_knowledge_active ON knowledge(active);
CREATE INDEX IF NOT EXISTS idx_knowledge_scope ON knowledge(decision_scope)`;
export const CREATE_VECTOR_INDEX = `
CREATE INDEX IF NOT EXISTS knowledge_embedding_idx ON knowledge(libsql_vector_idx(embedding))`;
export const CREATE_SPECS_TABLE = `
CREATE TABLE IF NOT EXISTS specs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
)`;
export const CREATE_SPECS_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_specs_created ON specs(created_at)`;
