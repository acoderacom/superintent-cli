// ── Ticket Plan ─────────────────────────────────────────────────────
// Execution blueprint attached to a ticket. Tracks implementation tasks,
// definition of done, architectural decisions, and rollback strategy.

export interface TicketPlan {
  files: string[];
  taskSteps: { task: string; steps: string[]; done: boolean }[];
  dodVerification: { dod: string; verify: string; done: boolean }[];
  decisions: { choice: string; reason: string }[];
  tradeOffs: { considered: string; rejected: string }[];
  rollback?: {
    steps: string[];
    reversibility: 'full' | 'partial' | 'none';
  };
  irreversibleActions: string[];
  edgeCases: string[];
}

// ── Tickets ─────────────────────────────────────────────────────────
// Development work items with an 8-status lifecycle.
// Type is auto-inferred from intent keywords when omitted.

export type TicketType = 'feature' | 'bugfix' | 'refactor' | 'docs' | 'chore' | 'test';

export interface Ticket {
  id: string;
  type?: TicketType;
  title?: string;
  status: 'Backlog' | 'In Progress' | 'In Review' | 'Done' | 'Blocked' | 'Paused' | 'Abandoned' | 'Superseded';
  intent: string;
  context?: string;
  constraints_use?: string[];
  constraints_avoid?: string[];
  assumptions?: string[];
  change_class?: 'A' | 'B' | 'C';
  change_class_reason?: string;
  plan?: TicketPlan;
  origin_spec_id?: string;
  derived_knowledge?: string[];
  author?: string;
  created_at?: string;
  updated_at?: string;
}

// JSON input shape for ticket create/update via --stdin (camelCase keys).
export interface TicketInput {
  id: string;
  type?: TicketType;
  title?: string;
  intent: string;
  context?: string;
  constraints?: {
    use?: string[];
    avoid?: string[];
  };
  assumptions?: string[];
  changeClass?: 'A' | 'B' | 'C';
  changeClassReason?: string;
}

// ── Comments ────────────────────────────────────────────────────────
// Polymorphic: attached to tickets, knowledge, or specs via parent_type/parent_id.

export type CommentParentType = 'ticket' | 'knowledge' | 'spec';

export interface Comment {
  id: string;
  parent_type: CommentParentType;
  parent_id: string;
  author: string;
  text: string;
  created_at?: string;
  updated_at?: string;
}

// ── Knowledge ───────────────────────────────────────────────────────
// RAG entries with 384-dim vector embeddings (snowflake-arctic-embed-s) for semantic search.
// Content follows a structured format per category:
//   pattern:      Why / When / Pattern
//   truth:        Fact / Verified
//   principle:    Rule / Why / Applies
//   architecture: Component / Responsibility / Interfaces
//   gotcha:       Attempted / Failed Because / Instead / Symptoms

export type KnowledgeCategory = 'pattern' | 'truth' | 'principle' | 'architecture' | 'gotcha';
export type DecisionScope = 'new-only' | 'backward-compatible' | 'global' | 'legacy-frozen';
export type KnowledgeSource = 'ticket' | 'discovery' | 'manual';

export interface Knowledge {
  id: string;
  namespace: string;
  chunk_index: number;
  title: string;
  content: string;
  category?: KnowledgeCategory;
  tags?: string[];
  source: KnowledgeSource;
  origin_ticket_id?: string;
  origin_ticket_type?: TicketType;
  confidence: number;
  active: boolean;
  decision_scope: DecisionScope;
  usage_count: number;
  last_used_at?: string;
  author?: string;
  branch?: string;
  created_at?: string;
  updated_at?: string;
}

// JSON input shape for knowledge create/update via --stdin (camelCase keys).
export interface KnowledgeInput {
  namespace?: string;
  title: string;
  content: string;
  category?: KnowledgeCategory;
  tags?: string[];
  source?: KnowledgeSource;
  originTicketId?: string;
  originTicketType?: TicketType;
  confidence?: number;
  decisionScope?: DecisionScope;
  author?: string;
  branch?: string;
}

export interface SearchResult extends Knowledge {
  score: number;
}

// ── Specs ───────────────────────────────────────────────────────────
// Feature specifications. Describe what to build; tickets come later.

export interface Spec {
  id: string;
  title: string;
  content: string;
  author?: string;
  created_at?: string;
  updated_at?: string;
}

// ── CLI Response ────────────────────────────────────────────────────
// Uniform JSON envelope for all CLI command output.

export interface CliResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
