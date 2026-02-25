// Barrel export for UI components

// Utils
export { escapeHtml, ColumnData, renderMarkdownEditor } from './utils.js';

// Layout
export { getHtml } from './layout.js';

// Ticket components
export {
  renderTicketCard,
  renderKanbanView,
  renderKanbanColumns,
  renderColumnMore,
  renderTicketModal,
  renderNewTicketModal,
  renderEditTicketModal,
} from './ticket.js';

// Knowledge components
export {
  renderKnowledgeView,
  renderKnowledgeList,
  renderKnowledgeMore,
  renderKnowledgeModal,
} from './knowledge.js';

// Search components
export {
  renderSearchView,
  renderSearchResults,
} from './search.js';

// Comment components
export {
  renderCommentsSection,
  renderEditCommentForm,
} from './comments.js';

// Graph components
export {
  renderGraphView,
  getGraphScript,
} from './graph.js';

// Spec components
export {
  renderSpecView,
  renderSpecList,
  renderSpecMore,
  renderSpecCard,
  renderSpecModal,
  renderNewSpecModal,
  renderEditSpecModal,
} from './spec.js';

// Dashboard components
export {
  renderDashboardView,
  renderDashboardGrid,
} from './dashboard.js';

// Wiki components
export {
  renderWikiView,
  renderWikiTree,
  renderWikiOverview,
  renderWikiDirectory,
  renderWikiFile,
  renderWikiSearchResults,
} from './wiki.js';
export type { WikiSearchHit } from './wiki.js';
