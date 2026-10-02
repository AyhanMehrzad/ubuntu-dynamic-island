// Notion Integration Hub
class NotionManager {
  constructor() {
    this.token = localStorage.getItem('notion_token') || '';
    this.databaseId = localStorage.getItem('notion_database_id') || '';
    this.recentNotes = JSON.parse(localStorage.getItem('notion_recent_notes') || '[]');
  }

  init() {
    this.updateStatusUI();
    this.renderRecentNotes();
  }

  isConfigured() {
    return !!this.token;
  }

  setCredentials(token, databaseId) {
    this.token = token.trim();
    this.databaseId = (databaseId || '').trim();
    localStorage.setItem('notion_token', this.token);
    localStorage.setItem('notion_database_id', this.databaseId);
    this.updateStatusUI();
  }

  updateStatusUI() {
    const badge = document.getElementById('notion-status-badge');
    if (!badge) return;

    if (this.isConfigured()) {
      badge.textContent = 'Connected';
      badge.className = 'card-badge';
    } else {
      badge.textContent = 'Not Configured';
      badge.className = 'card-badge pending';
    }
  }

  async createQuickNote(title, content) {
    if (!title && !content) return { success: false, error: 'Empty note' };

    const noteItem = {
      id: Date.now(),
      title: title || 'Untitled Quick Note',
      content: content || '',
      date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      synced: false
    };

    if (this.isConfigured() && window.electronAPI && window.electronAPI.callNotion) {
      try {
        const body = {
          parent: this.databaseId ? { database_id: this.databaseId } : { page_id: 'default' },
          properties: {
            title: [
              {
                text: { content: noteItem.title }
              }
            ]
          },
          children: [
            {
              object: 'block',
              type: 'paragraph',
              paragraph: {
                rich_text: [
                  {
                    type: 'text',
                    text: { content: noteItem.content }
                  }
                ]
              }
            }
          ]
        };

        const res = await window.electronAPI.callNotion({
          endpoint: 'pages',
          method: 'POST',
          body,
          token: this.token
        });

        if (res.ok) {
          noteItem.synced = true;
          noteItem.url = res.data.url;
        }
      } catch (err) {
        console.warn('Notion API sync error:', err);
      }
    }

    this.recentNotes.unshift(noteItem);
    if (this.recentNotes.length > 8) this.recentNotes.pop();
    localStorage.setItem('notion_recent_notes', JSON.stringify(this.recentNotes));
    this.renderRecentNotes();
    return { success: true, note: noteItem };
  }

  renderRecentNotes() {
    const listEl = document.getElementById('notion-recent-list');
    if (!listEl) return;

    if (this.recentNotes.length === 0) {
      listEl.innerHTML = `
        <div style="font-size: 12px; color: var(--text-muted); text-align: center; padding: 14px; background: var(--bg-surface); border-radius: 12px;">
          No notes created yet. Use the form above or tell Dio "Create a note in Notion..."
        </div>
      `;
      return;
    }

    listEl.innerHTML = this.recentNotes.map(n => `
      <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 10px; padding: 10px 12px; display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <div style="font-size: 13px; font-weight: 600; color: var(--text-main);">${escapeHtml(n.title)}</div>
          <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 3px;">${escapeHtml(n.content.slice(0, 80))}${n.content.length > 80 ? '...' : ''}</div>
        </div>
        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
          <span style="font-size: 10px; color: var(--text-subtle);">${n.date}</span>
          <span class="card-badge ${n.synced ? '' : 'pending'}" style="font-size: 9px;">${n.synced ? 'Synced' : 'Saved Locally'}</span>
        </div>
      </div>
    `).join('');
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

window.notionManager = new NotionManager();
