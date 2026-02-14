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
