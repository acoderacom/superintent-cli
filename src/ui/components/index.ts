// Barrel export for UI components

// Comment components
export {
  renderCommentsSection,
  renderEditCommentForm,
} from './comments.js';
// Dashboard components
export {
  renderDashboardGrid,
  renderDashboardView,
} from './dashboard.js';
// Graph components
export {
  getGraphScript,
  renderGraphView,
} from './graph.js';

// Knowledge components
export {
  renderKnowledgeList,
  renderKnowledgeModal,
  renderKnowledgeMore,
  renderKnowledgeView,
} from './knowledge.js';
// Layout
export { getHtml } from './layout.js';
// Search components
export {
  renderSearchResults,
  renderSearchView,
} from './search.js';
// Spec components
export {
  renderEditSpecModal,
  renderNewSpecModal,
  renderSpecCard,
  renderSpecList,
  renderSpecModal,
  renderSpecMore,
  renderSpecView,
} from './spec.js';
// Ticket components
export {
  renderColumnMore,
  renderEditTicketModal,
  renderKanbanColumns,
  renderKanbanView,
  renderNewTicketModal,
  renderTicketCard,
  renderTicketModal,
} from './ticket.js';
// Utils
export { ColumnData, escapeHtml, renderMarkdownEditor } from './utils.js';
export type { WikiSearchHit } from './wiki.js';
// Wiki components
export {
  renderWikiDirectory,
  renderWikiFile,
  renderWikiOverview,
  renderWikiSearchResults,
  renderWikiTree,
  renderWikiView,
} from './wiki.js';
