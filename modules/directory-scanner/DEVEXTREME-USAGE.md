# DevExtreme FileManager Integration Guide

This guide shows how to use the directory scanner's DevExtreme export format in your Angular application with DevExtreme FileManager.

## Overview

The directory scanner can export scanned directory structures in three formats compatible with DevExtreme FileManager:

1. **Hierarchical** - Tree structure with nested `items`
2. **Flat** - Flat array with `parentKey` references
3. **DataSource** - Ready-to-use DevExtreme data source configuration

## Export Formats

### 1. Hierarchical Format (Recommended)

```javascript
// Agent export
{
  "format": "hierarchical",
  "data": [
    {
      "name": "Documents",
      "isDirectory": true,
      "size": 0,
      "dateModified": "2024-01-06T10:30:00.000Z",
      "items": [
        {
          "name": "report.pdf",
          "isDirectory": false,
          "size": 1024000,
          "dateModified": "2024-01-05T15:20:00.000Z",
          "extension": ".pdf",
          "fileType": "document"
        }
      ]
    }
  ],
  "statistics": {
    "totalFiles": 150,
    "totalFolders": 25,
    "totalSize": 45678900,
    "maxDepth": 5
  }
}
```

### 2. Flat Format

```javascript
// Agent export
{
  "format": "flat",
  "data": [
    {
      "key": "/Users/name/Documents",
      "name": "Documents",
      "isDirectory": true,
      "parentKey": null
    },
    {
      "key": "/Users/name/Documents/report.pdf",
      "name": "report.pdf",
      "isDirectory": false,
      "parentKey": "/Users/name/Documents",
      "size": 1024000
    }
  ]
}
```

### 3. DataSource Format

```javascript
// Agent export - Ready-to-use configuration
{
  "format": "datasource",
  "data": {
    "dataStructure": "tree",
    "data": [...],
    "keyExpr": "path",
    "displayExpr": "name",
    "hasItemsExpr": "isDirectory"
  }
}
```

## Angular Implementation

### Step 1: Install DevExtreme

```bash
npm install devextreme devextreme-angular
```

### Step 2: Import DevExtreme Module

```typescript
// app.module.ts
import { DxFileManagerModule } from 'devextreme-angular';

@NgModule({
  imports: [
    DxFileManagerModule,
    // ... other imports
  ]
})
export class AppModule { }
```

### Step 3: Create Component

```typescript
// directory-viewer.component.ts
import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-directory-viewer',
  templateUrl: './directory-viewer.component.html',
  styleUrls: ['./directory-viewer.component.css']
})
export class DirectoryViewerComponent implements OnInit {
  fileSystemData: any[] = [];
  isLoading = true;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadDirectoryData();
  }

  loadDirectoryData() {
    // Fetch from BytePhase API
    this.http.get('/api/directory-scanner/latest')
      .subscribe((response: any) => {
        if (response.format === 'hierarchical') {
          this.fileSystemData = response.data;
        }
        this.isLoading = false;
      });
  }

  // Or load from exported JSON file
  loadFromFile(jsonData: any) {
    this.fileSystemData = jsonData.data;
  }
}
```

### Step 4: Add Template

```html
<!-- directory-viewer.component.html -->
<div class="directory-viewer">
  <h2>Directory Scanner Results</h2>

  <dx-file-manager
    *ngIf="!isLoading"
    [fileSystemProvider]="fileSystemData"
    [height]="600">

    <!-- Customize columns -->
    <dxo-item-view [showParentFolder]="false">
      <dxi-column dataField="name" caption="Name" [width]="300"></dxi-column>
      <dxi-column dataField="dateModified" caption="Modified" [width]="150" dataType="datetime"></dxi-column>
      <dxi-column dataField="size" caption="Size" [width]="100"></dxi-column>
      <dxi-column dataField="fileType" caption="Type" [width]="100"></dxi-column>
    </dxo-item-view>

    <!-- Enable features -->
    <dxo-permissions
      [create]="false"
      [copy]="false"
      [move]="false"
      [delete]="false"
      [rename]="false"
      [upload]="false"
      [download]="true">
    </dxo-permissions>

    <!-- Toolbar items -->
    <dxi-toolbar-item name="showNavPane" location="before"></dxi-toolbar-item>
    <dxi-toolbar-item name="separator" location="before"></dxi-toolbar-item>
    <dxi-toolbar-item name="switchView" location="after"></dxi-toolbar-item>
  </dx-file-manager>

  <div *ngIf="isLoading" class="loading">
    Loading directory structure...
  </div>
</div>
```

### Step 5: Add Styling

```css
/* directory-viewer.component.css */
.directory-viewer {
  padding: 20px;
}

.loading {
  text-align: center;
  padding: 40px;
  font-size: 18px;
  color: #666;
}
```

## Using with BytePhase CRM API

### Backend Integration (Laravel)

```php
// DirectoryScannerController.php
public function getLatestScan(Request $request)
{
    $shop = $request->user()->shop;

    // Get latest scan result from agent
    $scan = DirectoryScan::where('shop_id', $shop->id)
        ->latest()
        ->first();

    if (!$scan) {
        return response()->json(['error' => 'No scans found'], 404);
    }

    // Return DevExtreme formatted data
    return response()->json([
        'format' => $scan->format,
        'data' => json_decode($scan->data),
        'statistics' => json_decode($scan->statistics),
        'scannedAt' => $scan->scanned_at
    ]);
}

// Trigger scan from agent
public function requestScan(Request $request)
{
    $shop = $request->user()->shop;
    $agent = $shop->agents()->where('status', 'online')->first();

    if (!$agent) {
        return response()->json(['error' => 'No online agent found'], 404);
    }

    // Queue job for agent
    $job = AgentJob::create([
        'agent_id' => $agent->id,
        'type' => 'scanner.directory.scan',
        'payload' => [
            'directoryPath' => $request->input('path'),
            'options' => [
                'maxDepth' => 10,
                'includeHidden' => false
            ]
        ],
        'status' => 'pending'
    ]);

    return response()->json([
        'message' => 'Scan requested',
        'job_id' => $job->id
    ]);
}
```

### Angular Service

```typescript
// directory-scanner.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DirectoryScannerService {
  private apiUrl = '/api/directory-scanner';

  constructor(private http: HttpClient) {}

  // Request new scan
  requestScan(directoryPath: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/request`, {
      path: directoryPath
    });
  }

  // Get latest scan
  getLatestScan(): Observable<any> {
    return this.http.get(`${this.apiUrl}/latest`);
  }

  // Get scan by ID
  getScanById(scanId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/${scanId}`);
  }

  // List all scans
  listScans(): Observable<any> {
    return this.http.get(`${this.apiUrl}`);
  }
}
```

## Advanced Features

### 1. Custom File Icons

```typescript
// In component
getFileIcon(item: any): string {
  if (item.isDirectory) {
    return 'folder';
  }

  const iconMap = {
    'image': 'image',
    'video': 'video',
    'audio': 'music',
    'document': 'doc',
    'archive': 'box',
    'code': 'code'
  };

  return iconMap[item.fileType] || 'file';
}
```

### 2. Search and Filter

```html
<dx-file-manager>
  <dxo-toolbar>
    <dxi-item name="searchPanel"></dxi-item>
  </dxo-toolbar>
</dx-file-manager>
```

### 3. Custom Context Menu

```typescript
onContextMenuPreparing(e: any) {
  e.items.push({
    text: 'View Details',
    icon: 'info',
    onClick: () => this.showFileDetails(e.fileSystemItem)
  });
}
```

## Export Options

When requesting DevExtreme export from the agent:

```javascript
// Option 1: Hierarchical (Best for tree view)
{
  type: 'scanner.export.devextreme',
  payload: {
    tree: scanResult.tree,
    format: 'hierarchical',
    includeRoot: false,
    pretty: true
  }
}

// Option 2: Flat (Best for large datasets)
{
  type: 'scanner.export.devextreme',
  payload: {
    tree: scanResult.tree,
    format: 'flat',
    includeRoot: false
  }
}

// Option 3: DataSource config (Ready to use)
{
  type: 'scanner.export.devextreme',
  payload: {
    tree: scanResult.tree,
    format: 'datasource',
    includeRoot: false
  }
}
```

## Example Response Structure

```json
{
  "format": "hierarchical",
  "formatType": "hierarchical tree structure",
  "data": [
    {
      "name": "Projects",
      "isDirectory": true,
      "size": 0,
      "dateModified": "2024-01-06T08:30:00.000Z",
      "dateCreated": "2024-01-01T10:00:00.000Z",
      "path": "/Users/john/Projects",
      "itemCount": 3,
      "items": [
        {
          "name": "app.js",
          "isDirectory": false,
          "size": 5120,
          "dateModified": "2024-01-05T14:20:00.000Z",
          "extension": ".js",
          "fileType": "code",
          "path": "/Users/john/Projects/app.js"
        }
      ]
    }
  ],
  "statistics": {
    "totalFiles": 342,
    "totalFolders": 48,
    "totalSize": 156789234,
    "maxDepth": 6
  },
  "generatedAt": "2024-01-06T10:45:30.000Z"
}
```

## Performance Tips

1. **Use includeRoot: false** for cleaner data structure
2. **Use flat format** for very large directory trees (100k+ items)
3. **Enable virtual scrolling** in DevExtreme for large datasets
4. **Paginate** scan results on the backend for huge directories
5. **Cache** scan results in your Angular service

## Resources

- [DevExtreme FileManager Documentation](https://js.devexpress.com/Documentation/ApiReference/UI_Components/dxFileManager/)
- [DevExtreme Angular Integration](https://js.devexpress.com/Documentation/Guide/Angular_Components/Getting_Started/Add_DevExtreme_to_an_Angular_CLI_Application/)
- [BytePhase Agent API Documentation](../../../docs/API.md)
