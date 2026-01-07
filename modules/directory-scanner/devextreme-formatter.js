/**
 * DevExtreme FileManager Formatter
 *
 * Converts directory tree to DevExtreme FileManager compatible format
 * https://js.devexpress.com/Documentation/ApiReference/UI_Components/dxFileManager/
 */

class DevExtremeFormatter {
  /**
   * Transform directory tree to DevExtreme format
   *
   * @param {object} tree - Directory tree from scanner
   * @param {object} options - Formatting options
   * @returns {object} - DevExtreme compatible data
   */
  static transform(tree, options = {}) {
    const includeRoot = options.includeRoot !== false;
    const includePath = options.includePath !== false;
    const includeExtension = options.includeExtension !== false;
    const includeFileType = options.includeFileType !== false;

    // Transform the tree
    const transformed = this.transformNode(tree, {
      includePath,
      includeExtension,
      includeFileType
    });

    // If includeRoot is false, return items array directly
    if (!includeRoot && transformed.items) {
      return transformed.items;
    }

    // Otherwise return the root node
    return [transformed];
  }

  /**
   * Transform a single node
   *
   * @param {object} node - Tree node
   * @param {object} options - Transform options
   * @returns {object} - DevExtreme formatted node
   */
  static transformNode(node, options = {}) {
    const devExtremeNode = {
      name: node.name,
      isDirectory: node.type === 'directory',
      size: node.size || 0,
      dateModified: node.modified
    };

    // Add optional fields
    if (options.includePath) {
      devExtremeNode.path = node.path;
    }

    if (node.created) {
      devExtremeNode.dateCreated = node.created;
    }

    // For directories
    if (node.type === 'directory') {
      // Add items (children)
      if (node.children && node.children.length > 0) {
        devExtremeNode.items = node.children.map(child =>
          this.transformNode(child, options)
        );
      } else {
        devExtremeNode.items = [];
      }

      // Add item count
      devExtremeNode.itemCount = node.childCount || 0;
    }
    // For files
    else {
      if (options.includeExtension && node.extension) {
        devExtremeNode.extension = node.extension;
      }

      if (options.includeFileType && node.fileType) {
        devExtremeNode.fileType = node.fileType;
      }

      // DevExtreme doesn't need items for files
      // but we can add custom metadata
      if (node.hash) {
        devExtremeNode.hash = node.hash;
      }
    }

    return devExtremeNode;
  }

  /**
   * Flatten tree to single-level array (useful for some DevExtreme configurations)
   *
   * @param {object} tree - Directory tree
   * @param {object} options - Formatting options
   * @returns {array} - Flat array of items with parent references
   */
  static flatten(tree, options = {}) {
    const items = [];
    const includeRoot = options.includeRoot !== false;

    const traverse = (node, parentKey = null) => {
      const key = node.path || `${parentKey}/${node.name}`;

      const item = {
        key: key,
        name: node.name,
        isDirectory: node.type === 'directory',
        size: node.size || 0,
        dateModified: node.modified,
        parentKey: parentKey
      };

      if (node.created) {
        item.dateCreated = node.created;
      }

      if (node.type === 'file') {
        if (node.extension) item.extension = node.extension;
        if (node.fileType) item.fileType = node.fileType;
      }

      items.push(item);

      // Traverse children
      if (node.children && node.children.length > 0) {
        node.children.forEach(child => traverse(child, key));
      }
    };

    traverse(tree, null);

    // Remove root if not included
    if (!includeRoot && items.length > 0) {
      items.shift();
    }

    return items;
  }

  /**
   * Create DevExtreme FileManager data source configuration
   *
   * @param {object} tree - Directory tree
   * @param {object} options - Configuration options
   * @returns {object} - DevExtreme data source config
   */
  static createDataSource(tree, options = {}) {
    const hierarchical = options.hierarchical !== false;

    if (hierarchical) {
      // Hierarchical data structure
      return {
        dataStructure: 'tree',
        data: this.transform(tree, options),
        keyExpr: 'path',
        displayExpr: 'name',
        hasItemsExpr: 'isDirectory'
      };
    } else {
      // Flat data structure with parentKey
      return {
        dataStructure: 'plain',
        data: this.flatten(tree, options),
        keyExpr: 'key',
        displayExpr: 'name',
        parentKeyExpr: 'parentKey',
        hasItemsExpr: 'isDirectory'
      };
    }
  }

  /**
   * Get statistics from tree
   *
   * @param {object} tree - Directory tree
   * @returns {object} - Statistics
   */
  static getStatistics(tree) {
    let stats = {
      totalFiles: 0,
      totalFolders: 0,
      totalSize: 0,
      maxDepth: 0
    };

    const traverse = (node, depth = 0) => {
      stats.maxDepth = Math.max(stats.maxDepth, depth);

      if (node.type === 'directory') {
        stats.totalFolders++;
        if (node.children) {
          node.children.forEach(child => traverse(child, depth + 1));
        }
      } else {
        stats.totalFiles++;
        stats.totalSize += node.size || 0;
      }
    };

    traverse(tree);

    return stats;
  }
}

module.exports = DevExtremeFormatter;
