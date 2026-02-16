import { escapeHtml } from './utils.js';
import type { Comment, CommentParentType } from '../../types.js';

/**
 * Render the full comments section: list + inline add form.
 */
export function renderCommentsSection(comments: Comment[], parentType: CommentParentType, parentId: string): string {
  return `
    <div class="mb-4" id="comments-section">
      <h3 class="text-sm font-semibold text-gray-700 mb-2">Comments</h3>
      <div class="space-y-2 mb-3">
        ${comments.length > 0
          ? comments.map(c => renderCommentCard(c)).join('')
          : '<p class="text-xs text-gray-400">No comments yet</p>'
        }
      </div>
      ${renderInlineCommentForm(parentType, parentId)}
    </div>
  `;
}

/**
 * Render a single comment card with edit/delete actions.
 */
function renderCommentCard(comment: Comment): string {
  const isAi = !comment.author || comment.author === 'anonymous' || ['claude', 'openai', 'gemini', 'gpt'].some(a => comment.author.toLowerCase().includes(a));
  const authorBadge = isAi
    ? `<span class="px-1.5 py-0.5 text-[10px] font-medium rounded bg-orange-100 text-orange-700">${escapeHtml(comment.author)}</span>`
    : `<span class="px-1.5 py-0.5 text-[10px] font-medium rounded bg-gray-200 text-gray-700">${escapeHtml(comment.author)}</span>`;

  return `
    <div class="bg-gray-100 rounded-lg p-3 group" id="comment-${escapeHtml(comment.id)}">
      <div class="flex items-center justify-between mb-1">
        <div class="flex items-center gap-2">
          ${authorBadge}
          <span class="text-xs text-gray-400">${comment.created_at ? new Date(comment.created_at).toLocaleString() : ''}</span>
        </div>
        <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button type="button"
                  class="p-1 text-gray-400 hover:text-blue-600 rounded transition-colors cursor-pointer"
                  title="Edit comment"
                  hx-get="/partials/edit-comment/${encodeURIComponent(comment.id)}"
                  hx-target="#comment-${escapeHtml(comment.id)}"
                  hx-swap="outerHTML">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
            </svg>
          </button>
          <button type="button"
                  class="p-1 text-gray-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                  title="Delete comment"
                  hx-delete="/api/comments/${encodeURIComponent(comment.id)}"
                  hx-target="#comment-${escapeHtml(comment.id)}"
                  hx-swap="outerHTML"
                  hx-confirm="Delete this comment?">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
            </svg>
          </button>
        </div>
      </div>
      <div class="text-sm text-gray-700">${escapeHtml(comment.text)}</div>
    </div>
  `;
}

/**
 * Render an inline edit form for a comment.
 */
export function renderEditCommentForm(comment: Comment): string {
  return `
    <div class="bg-gray-100 rounded-lg p-3" id="comment-${escapeHtml(comment.id)}">
      <form hx-patch="/api/comments/${encodeURIComponent(comment.id)}"
            hx-target="#comments-section"
            hx-swap="outerHTML">
        <textarea name="text" rows="2"
                  class="w-full px-2 py-1.5 text-sm border rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">${escapeHtml(comment.text)}</textarea>
        <div class="flex justify-end gap-2 mt-2">
          <button type="button"
                  class="px-2 py-1 text-xs text-gray-600 hover:text-gray-800 cursor-pointer"
                  hx-get="/partials/comment/${encodeURIComponent(comment.id)}"
                  hx-target="#comments-section"
                  hx-swap="outerHTML">
            Cancel
          </button>
          <button type="submit"
                  class="px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 cursor-pointer">
            Save
          </button>
        </div>
      </form>
    </div>
  `;
}

/**
 * Render the inline "add comment" form at the bottom of the comments section.
 */
function renderInlineCommentForm(parentType: CommentParentType, parentId: string): string {
  return `
    <form hx-post="/api/comments"
          hx-target="#comments-section"
          hx-swap="outerHTML"
          class="flex gap-2">
      <input type="hidden" name="parent_type" value="${parentType}">
      <input type="hidden" name="parent_id" value="${escapeHtml(parentId)}">
      <input type="text" name="text" placeholder="Add a comment..."
             required
             class="flex-1 px-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
      <button type="submit"
              class="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 shrink-0 cursor-pointer">
        Comment
      </button>
    </form>
  `;
}
