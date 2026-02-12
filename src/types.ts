// Plan structure - synced with Ticket (Tasks → Steps, DoD → Verification)
export interface TicketPlan {
  files: string[];                                    // Files to edit
  taskSteps: { task: string; steps: string[] }[];    // Each task → implementation steps
  dodVerification: { dod: string; verify: string }[]; // Each DoD → verification method
  decisions: { choice: string; reason: string }[];   // Key decisions made
  tradeOffs: { considered: string; rejected: string }[]; // Alternatives rejected & why
  rollback?: {                                        // How to undo (required for Class B/C)
    steps: string[];
    reversibility: 'full' | 'partial' | 'none';
  };
  irreversibleActions: string[];                     // Actions that can't be undone
  edgeCases: string[];                               // Conditions that might cause issues
}

// Ticket type (AI-inferred from intent)
export type TicketType = 'feature' | 'bugfix' | 'refactor' | 'docs' | 'chore' | 'test';

// Ticket types
export interface Ticket {
  id: string;
  type?: TicketType;                                  // AI-inferred from intent
  title?: string;
  status: 'Backlog' | 'In Progress' | 'In Review' | 'Done' | 'Blocked' | 'Paused' | 'Abandoned' | 'Superseded';
  intent: string;
  context?: string;
  constraints_use?: string[];
  constraints_avoid?: string[];
  assumptions?: string[];
  tasks?: TaskItem[];
  definition_of_done?: TaskItem[];
  change_class?: 'A' | 'B' | 'C';
  change_class_reason?: string;
  plan?: TicketPlan;
  origin_spec_id?: string;
  derived_knowledge?: string[];
  comments?: TicketComment[];
  created_at?: string;
  updated_at?: string;
}

export interface TaskItem {
  text: string;
  done: boolean;
}

export interface TicketComment {
  text: string;
  timestamp: string;
}

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
  tasks?: string[] | TaskItem[];
  definitionOfDone?: string[] | TaskItem[];
  changeClass?: 'A' | 'B' | 'C';
  changeClassReason?: string;
}

// Knowledge types (RAG-based)
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
  origin_ticket_type?: TicketType;                    // What kind of ticket spawned this
  confidence: number;
  active: boolean;
  decision_scope: DecisionScope;
  usage_count: number;
  last_used_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface KnowledgeInput {
  namespace?: string;  // Defaults to 'global'
  title: string;
  content: string;    // Structured format: Why:\n...\n\nWhen:\n...\n\nPattern:\n...
  category?: KnowledgeCategory;
  tags?: string[];
  source?: KnowledgeSource;  // Defaults to 'manual'
  originTicketId?: string;
  originTicketType?: TicketType;  // What kind of ticket spawned this
  confidence?: number;
  decisionScope?: DecisionScope;  // Defaults to 'global'
}

// Content format by category:
// - pattern:   Why:\n...\n\nWhen:\n...\n\nPattern:\n...
// - truth:     Fact:\n...\n\nVerified:\n...
// - principle: Rule:\n...\n\nWhy:\n...\n\nApplies:\n...
// - architecture: Component:\n...\n\nResponsibility:\n...\n\nInterfaces:\n...
// - gotcha:    Attempted:\n...\n\nFailed Because:\n...\n\nInstead:\n...\n\nSymptoms:\n...

export interface SearchResult extends Knowledge {
  score: number;
}

// Spec types
export interface Spec {
  id: string;
  title: string;
  content: string;
  created_at?: string;
  updated_at?: string;
}

// CLI output types
export interface CliResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
