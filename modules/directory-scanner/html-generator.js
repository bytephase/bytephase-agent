/**
 * HtmlGenerator - Generate clean directory snapshots for CRM display
 *
 * Creates a clean, interactive HTML page showing
 * the directory structure with search and statistics.
 */

class HtmlGenerator {
  /**
   * Generate HTML from directory tree
   *
   * @param {object} tree - Directory tree
   * @param {object} options - Generation options
   * @returns {string} - HTML string
   */
  static generate(tree, options = {}) {
    const title = options.title || `Scan Summary & Review`;
    const scannedAt = options.scannedAt || new Date().toISOString();

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: #f8fafc;
      padding: 24px;
      min-height: 100vh;
      color: #1e293b;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
    }

    /* Main Card */
    .main-card {
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 20px;
    }

    .card-title {
      font-size: 24px;
      font-weight: 600;
      color: #1e293b;
      margin-bottom: 20px;
    }

    /* Stats Row */
    .stats-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }

    @media (max-width: 768px) {
      .stats-row {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    .stat-card {
      padding: 16px 20px;
      border-radius: 10px;
      border: 1px solid transparent;
    }

    .stat-card.folders {
      background: #eff6ff;
      border-color: #bfdbfe;
    }

    .stat-card.files {
      background: #ecfdf5;
      border-color: #a7f3d0;
    }

    .stat-card.size {
      background: #f5f3ff;
      border-color: #ddd6fe;
    }

    .stat-card.date {
      background: #f8fafc;
      border-color: #e2e8f0;
    }

    .stat-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    .stat-icon {
      width: 20px;
      height: 20px;
    }

    .stat-icon.folders { color: #3b82f6; }
    .stat-icon.files { color: #10b981; }
    .stat-icon.size { color: #8b5cf6; }
    .stat-icon.date { color: #64748b; }

    .stat-label {
      font-size: 13px;
      font-weight: 500;
    }

    .stat-label.folders { color: #3b82f6; }
    .stat-label.files { color: #10b981; }
    .stat-label.size { color: #8b5cf6; }
    .stat-label.date { color: #64748b; }

    .stat-value {
      font-size: 28px;
      font-weight: 700;
      color: #1e293b;
    }

    .stat-value.date {
      font-size: 16px;
      font-weight: 600;
    }

    /* Section Title */
    .section-title {
      font-size: 16px;
      font-weight: 600;
      color: #1e293b;
      margin-bottom: 16px;
    }

    /* Search Box */
    .search-container {
      margin-bottom: 16px;
    }

    .search-input {
      width: 100%;
      max-width: 400px;
      padding: 10px 16px 10px 40px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 14px;
      background: white url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cpath d='m21 21-4.35-4.35'/%3E%3C/svg%3E") no-repeat 12px center;
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    .search-input:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .search-input::placeholder {
      color: #94a3b8;
    }

    /* Tree Container */
    .tree-container {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px;
      max-height: 400px;
      overflow-y: auto;
    }

    .tree {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.6;
    }

    .tree-item {
      display: flex;
      align-items: center;
      padding: 6px 8px;
      cursor: pointer;
      border-radius: 6px;
      transition: background 0.15s;
      user-select: none;
    }

    .tree-item:hover {
      background: #e2e8f0;
    }

    .tree-item.directory {
      color: #1e293b;
      font-weight: 500;
    }

    .tree-item.file {
      color: #475569;
      font-weight: 400;
      cursor: default;
    }

    .tree-item.file:hover {
      background: #f1f5f9;
    }

    .toggle {
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 4px;
      color: #94a3b8;
      font-size: 10px;
      transition: transform 0.2s;
    }

    .tree-item.directory:not(.collapsed) .toggle {
      transform: rotate(90deg);
    }

    .icon {
      width: 18px;
      height: 18px;
      margin-right: 8px;
      flex-shrink: 0;
    }

    .icon.folder {
      color: #3b82f6;
    }

    .icon.file {
      color: #64748b;
    }

    .name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .meta {
      font-size: 12px;
      color: #94a3b8;
      margin-left: 12px;
      flex-shrink: 0;
    }

    .children {
      margin-left: 24px;
    }

    .children.hidden {
      display: none;
    }

    .no-results {
      text-align: center;
      padding: 40px;
      color: #94a3b8;
      font-size: 14px;
    }

    .tree-note {
      font-size: 13px;
      color: #64748b;
      margin-top: 12px;
    }

    /* Buttons */
    .button-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 24px;
      padding-top: 24px;
      border-top: 1px solid #e2e8f0;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      border: none;
    }

    .btn-secondary {
      background: #f1f5f9;
      color: #475569;
      border: 1px solid #e2e8f0;
    }

    .btn-secondary:hover {
      background: #e2e8f0;
    }

    .btn-primary {
      background: #3b82f6;
      color: white;
    }

    .btn-primary:hover {
      background: #2563eb;
    }

    .btn svg {
      width: 16px;
      height: 16px;
    }

    /* Expand/Collapse Controls */
    .tree-controls {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
    }

    .control-btn {
      padding: 6px 12px;
      font-size: 12px;
      color: #64748b;
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .control-btn:hover {
      background: #f1f5f9;
      color: #1e293b;
    }

    /* Search result highlight */
    .highlight {
      background: #fef08a;
      border-radius: 2px;
    }

    /* Footer */
    .footer {
      text-align: center;
      margin-top: 24px;
      color: #94a3b8;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="main-card">
      <h1 class="card-title">Scan Summary & Review</h1>

      <!-- Stats Row -->
      <div class="stats-row">
        <div class="stat-card folders">
          <div class="stat-header">
            <svg class="stat-icon folders" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            <span class="stat-label folders">Folders</span>
          </div>
          <div class="stat-value" id="total-folders">0</div>
        </div>

        <div class="stat-card files">
          <div class="stat-header">
            <svg class="stat-icon files" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span class="stat-label files">Files</span>
          </div>
          <div class="stat-value" id="total-files">0</div>
        </div>

        <div class="stat-card size">
          <div class="stat-header">
            <svg class="stat-icon size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            </svg>
            <span class="stat-label size">Total Size</span>
          </div>
          <div class="stat-value" id="total-size">0 B</div>
        </div>

        <div class="stat-card date">
          <div class="stat-header">
            <svg class="stat-icon date" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <span class="stat-label date">Scanned</span>
          </div>
          <div class="stat-value date" id="scan-date">${this.formatDateTime(scannedAt)}</div>
        </div>
      </div>

      <!-- Folder Tree Preview -->
      <h2 class="section-title">Folder Tree Preview</h2>

      <div class="search-container">
        <input
          type="text"
          class="search-input"
          id="search"
          placeholder="Search files and folders..."
        >
      </div>

      <div class="tree-controls">
        <button class="control-btn" id="expand-all">Expand All</button>
        <button class="control-btn" id="collapse-all">Collapse All</button>
      </div>

      <div class="tree-container">
        <div class="tree" id="tree"></div>
        <div class="no-results" id="no-results" style="display: none;">
          No files or folders match your search
        </div>
      </div>

      <p class="tree-note">This is a read-only preview. Customer will see the full interactive tree.</p>

      <!-- Action Buttons -->
      <div class="button-row">
        <button class="btn btn-secondary" id="rerun-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 4v6h-6"/>
            <path d="M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          Re-run Scan
        </button>
        <button class="btn btn-primary" id="proceed-btn">
          Proceed to Customer Verification
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="5" y1="12" x2="19" y2="12"/>
            <polyline points="12 5 19 12 12 19"/>
          </svg>
        </button>
      </div>
    </div>

    <div class="footer">
      Generated by BytePhase Agent
    </div>
  </div>

  <script>
    const treeData = ${JSON.stringify(tree, null, 2)};

    let stats = {
      files: 0,
      folders: 0,
      size: 0
    };

    function formatSize(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function createIcon(isDirectory) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'icon ' + (isDirectory ? 'folder' : 'file'));
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '2');

      if (isDirectory) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z');
        svg.appendChild(path);
      } else {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z');
        svg.appendChild(path);
        const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        polyline.setAttribute('points', '14 2 14 8 20 8');
        svg.appendChild(polyline);
      }

      return svg;
    }

    function renderTree(node, parentElement, depth = 0) {
      if (node.type === 'directory') {
        stats.folders++;

        const item = document.createElement('div');
        item.className = depth === 0 ? 'tree-item directory' : 'tree-item directory collapsed';
        item.dataset.name = node.name.toLowerCase();

        const hasChildren = node.children && node.children.length > 0;

        // Toggle arrow
        const toggle = document.createElement('span');
        toggle.className = 'toggle';
        toggle.innerHTML = hasChildren ? '&#9654;' : '';
        item.appendChild(toggle);

        // Folder icon
        item.appendChild(createIcon(true));

        // Name
        const name = document.createElement('span');
        name.className = 'name';
        name.textContent = node.name;
        item.appendChild(name);

        parentElement.appendChild(item);

        if (hasChildren) {
          const childContainer = document.createElement('div');
          childContainer.className = depth === 0 ? 'children' : 'children hidden';

          node.children.forEach(child => {
            renderTree(child, childContainer, depth + 1);
          });

          parentElement.appendChild(childContainer);
          item.childrenContainer = childContainer;

          item.addEventListener('click', (e) => {
            e.stopPropagation();
            const isCollapsed = item.classList.toggle('collapsed');
            childContainer.classList.toggle('hidden', isCollapsed);
          });
        }
      } else {
        stats.files++;
        stats.size += node.size || 0;

        const item = document.createElement('div');
        item.className = 'tree-item file';
        item.dataset.name = node.name.toLowerCase();

        // Empty toggle space
        const toggle = document.createElement('span');
        toggle.className = 'toggle';
        item.appendChild(toggle);

        // File icon
        item.appendChild(createIcon(false));

        // Name
        const name = document.createElement('span');
        name.className = 'name';
        name.textContent = node.name;
        item.appendChild(name);

        // Size
        if (node.size) {
          const meta = document.createElement('span');
          meta.className = 'meta';
          meta.textContent = formatSize(node.size);
          item.appendChild(meta);
        }

        parentElement.appendChild(item);
      }
    }

    // Render tree
    const treeContainer = document.getElementById('tree');
    renderTree(treeData, treeContainer);

    // Update stats
    document.getElementById('total-files').textContent = stats.files.toLocaleString();
    document.getElementById('total-folders').textContent = stats.folders.toLocaleString();
    document.getElementById('total-size').textContent = formatSize(stats.size);

    // Search functionality
    const searchInput = document.getElementById('search');
    const noResults = document.getElementById('no-results');
    let searchTimeout;

    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);

      searchTimeout = setTimeout(() => {
        const query = e.target.value.toLowerCase().trim();
        const items = document.querySelectorAll('.tree-item');
        let visibleCount = 0;

        if (!query) {
          // Reset all visibility
          items.forEach(item => {
            item.style.display = 'flex';
          });
          document.querySelectorAll('.children').forEach(child => {
            if (child.parentElement.querySelector('.tree-item.collapsed')) {
              child.classList.add('hidden');
            }
          });
          noResults.style.display = 'none';
          treeContainer.style.display = 'block';
          return;
        }

        // Show all children containers for search
        document.querySelectorAll('.children').forEach(child => {
          child.classList.remove('hidden');
        });

        items.forEach(item => {
          const name = item.dataset.name;
          const matches = name.includes(query);
          item.style.display = matches ? 'flex' : 'none';
          if (matches) visibleCount++;
        });

        noResults.style.display = visibleCount === 0 ? 'block' : 'none';
        treeContainer.style.display = visibleCount === 0 ? 'none' : 'block';
      }, 200);
    });

    // Expand All
    document.getElementById('expand-all').addEventListener('click', () => {
      document.querySelectorAll('.tree-item.directory').forEach(dir => {
        dir.classList.remove('collapsed');
      });
      document.querySelectorAll('.children').forEach(child => {
        child.classList.remove('hidden');
      });
    });

    // Collapse All
    document.getElementById('collapse-all').addEventListener('click', () => {
      document.querySelectorAll('.tree-item.directory').forEach((dir, index) => {
        if (index > 0) {
          dir.classList.add('collapsed');
        }
      });
      document.querySelectorAll('.children').forEach((child, index) => {
        if (index > 0) {
          child.classList.add('hidden');
        }
      });
    });

    // Button handlers (for embedding in CRM)
    document.getElementById('rerun-btn').addEventListener('click', () => {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ action: 'rerun-scan' }, '*');
      }
    });

    document.getElementById('proceed-btn').addEventListener('click', () => {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ action: 'proceed-verification' }, '*');
      }
    });
  </script>
</body>
</html>`;

    return html;
  }

  /**
   * Format date time for display
   */
  static formatDateTime(isoString) {
    const date = new Date(isoString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  /**
   * Escape HTML special characters
   *
   * @param {string} text - Text to escape
   * @returns {string} - Escaped text
   */
  static escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };

    return text.replace(/[&<>"']/g, m => map[m]);
  }
}

module.exports = HtmlGenerator;
