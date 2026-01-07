/**
 * HtmlGenerator - Generate Snap2HTML-like directory snapshots
 *
 * Creates a beautiful, interactive HTML page showing
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
    const title = options.title || `Directory Snapshot - ${tree.name}`;

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
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 20px;
      min-height: 100vh;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
    }

    .header {
      background: white;
      padding: 30px;
      border-radius: 12px;
      margin-bottom: 20px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2);
    }

    .header h1 {
      color: #667eea;
      margin-bottom: 15px;
      font-size: 32px;
      display: flex;
      align-items: center;
      gap: 15px;
    }

    .header-icon {
      font-size: 40px;
    }

    .header-info {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-top: 20px;
    }

    .info-item {
      padding: 12px;
      background: #f8f9fa;
      border-radius: 8px;
      border-left: 4px solid #667eea;
    }

    .info-label {
      font-size: 12px;
      color: #6c757d;
      margin-bottom: 5px;
    }

    .info-value {
      font-size: 16px;
      font-weight: bold;
      color: #212529;
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-top: 20px;
    }

    .stat-card {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 25px;
      border-radius: 12px;
      box-shadow: 0 5px 15px rgba(0,0,0,0.2);
      transition: transform 0.2s;
    }

    .stat-card:hover {
      transform: translateY(-5px);
    }

    .stat-icon {
      font-size: 32px;
      margin-bottom: 10px;
    }

    .stat-label {
      font-size: 13px;
      opacity: 0.9;
      margin-bottom: 8px;
    }

    .stat-value {
      font-size: 28px;
      font-weight: bold;
    }

    .tree-container {
      background: white;
      padding: 30px;
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2);
      margin-top: 20px;
    }

    .search-box {
      margin-bottom: 20px;
    }

    .search-input {
      width: 100%;
      padding: 15px 20px;
      border: 2px solid #e2e8f0;
      border-radius: 10px;
      font-size: 16px;
      transition: border-color 0.2s;
    }

    .search-input:focus {
      outline: none;
      border-color: #667eea;
    }

    .tree {
      font-family: 'Courier New', monospace;
      font-size: 14px;
      line-height: 1.8;
    }

    .tree-item {
      padding: 6px 0;
      cursor: pointer;
      transition: background 0.2s;
      border-radius: 4px;
      padding-left: 10px;
    }

    .tree-item:hover {
      background: #f8f9fa;
    }

    .tree-item.directory {
      color: #667eea;
      font-weight: 500;
    }

    .tree-item.file {
      color: #495057;
    }

    .tree-item.collapsed > .children {
      display: none;
    }

    .indent {
      display: inline-block;
      width: 24px;
    }

    .icon {
      margin-right: 8px;
      font-size: 16px;
    }

    .size {
      color: #94a3b8;
      margin-left: 15px;
      font-size: 12px;
    }

    .date {
      color: #cbd5e1;
      margin-left: 10px;
      font-size: 11px;
    }

    .toggle {
      display: inline-block;
      width: 16px;
      text-align: center;
      margin-right: 5px;
      color: #94a3b8;
      font-size: 12px;
    }

    .children {
      margin-left: 20px;
    }

    .no-results {
      text-align: center;
      padding: 40px;
      color: #94a3b8;
      font-size: 16px;
    }

    .footer {
      text-align: center;
      margin-top: 30px;
      color: white;
      opacity: 0.8;
      font-size: 14px;
    }

    .file-type-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 10px;
      margin-left: 8px;
      font-weight: bold;
    }

    .file-type-image { background: #e3f2fd; color: #1976d2; }
    .file-type-video { background: #fce4ec; color: #c2185b; }
    .file-type-audio { background: #f3e5f5; color: #7b1fa2; }
    .file-type-document { background: #e8f5e9; color: #388e3c; }
    .file-type-archive { background: #fff3e0; color: #f57c00; }
    .file-type-code { background: #e0f2f1; color: #00796b; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>
        <span class="header-icon">📁</span>
        ${title}
      </h1>

      <div class="header-info">
        <div class="info-item">
          <div class="info-label">Path</div>
          <div class="info-value">${this.escapeHtml(tree.path)}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Scanned</div>
          <div class="info-value">${new Date().toLocaleString()}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Depth</div>
          <div class="info-value" id="max-depth">-</div>
        </div>
      </div>

      <div class="stats">
        <div class="stat-card">
          <div class="stat-icon">📄</div>
          <div class="stat-label">Total Files</div>
          <div class="stat-value" id="total-files">0</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">📂</div>
          <div class="stat-label">Total Folders</div>
          <div class="stat-value" id="total-folders">0</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">💾</div>
          <div class="stat-label">Total Size</div>
          <div class="stat-value" id="total-size">0 MB</div>
        </div>
      </div>
    </div>

    <div class="tree-container">
      <div class="search-box">
        <input
          type="text"
          class="search-input"
          id="search"
          placeholder="🔍 Search files and folders..."
        >
      </div>
      <div class="tree" id="tree"></div>
      <div class="no-results" id="no-results" style="display: none;">
        No results found
      </div>
    </div>

    <div class="footer">
      Generated by BytePhase Agent - Directory Scanner Module
    </div>
  </div>

  <script>
    const treeData = ${JSON.stringify(tree, null, 2)};

    let stats = {
      files: 0,
      folders: 0,
      size: 0,
      maxDepth: 0
    };

    function formatSize(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function formatDate(dateString) {
      const date = new Date(dateString);
      return date.toLocaleDateString();
    }

    function getFileTypeIcon(type) {
      const icons = {
        'image': '🖼️',
        'video': '🎬',
        'audio': '🎵',
        'document': '📄',
        'archive': '📦',
        'code': '💻',
        'directory': '📁',
        'file': '📄'
      };
      return icons[type] || '📄';
    }

    function renderTree(node, parentElement, depth = 0) {
      const indent = depth * 24;

      if (node.type === 'directory') {
        stats.folders++;
        stats.maxDepth = Math.max(stats.maxDepth, depth);

        const item = document.createElement('div');
        item.className = 'tree-item directory';
        item.dataset.path = node.path;
        item.dataset.name = node.name.toLowerCase();

        const toggle = node.children && node.children.length > 0 ? '▼' : ' ';

        item.innerHTML = \`
          <span style="margin-left: \${indent}px">
            <span class="toggle">\${toggle}</span>
            <span class="icon">\${getFileTypeIcon('directory')}</span>
            \${node.name}
            <span class="size">(\${node.childCount || 0} items)</span>
          </span>
        \`;

        parentElement.appendChild(item);

        if (node.children && node.children.length > 0) {
          const childContainer = document.createElement('div');
          childContainer.className = 'children';

          node.children.forEach(child => {
            renderTree(child, childContainer, depth + 1);
          });

          parentElement.appendChild(childContainer);

          item.addEventListener('click', (e) => {
            e.stopPropagation();
            item.classList.toggle('collapsed');
          });
        }
      } else {
        stats.files++;
        stats.size += node.size;

        const item = document.createElement('div');
        item.className = 'tree-item file';
        item.dataset.path = node.path;
        item.dataset.name = node.name.toLowerCase();

        const fileTypeBadge = node.fileType && node.fileType !== 'other'
          ? \`<span class="file-type-badge file-type-\${node.fileType}">\${node.fileType}</span>\`
          : '';

        item.innerHTML = \`
          <span style="margin-left: \${indent}px">
            <span class="toggle"> </span>
            <span class="icon">\${getFileTypeIcon(node.fileType || 'file')}</span>
            \${node.name}
            \${fileTypeBadge}
            <span class="size">\${formatSize(node.size)}</span>
            <span class="date">\${formatDate(node.modified)}</span>
          </span>
        \`;

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
    document.getElementById('max-depth').textContent = stats.maxDepth;

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

        items.forEach(item => {
          const name = item.dataset.name;
          const matches = !query || name.includes(query);

          item.style.display = matches ? 'block' : 'none';

          if (matches) visibleCount++;
        });

        noResults.style.display = visibleCount === 0 ? 'block' : 'none';
        treeContainer.style.display = visibleCount === 0 ? 'none' : 'block';
      }, 300);
    });
  </script>
</body>
</html>`;

    return html;
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
