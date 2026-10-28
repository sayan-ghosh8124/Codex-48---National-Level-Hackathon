// Nova Power BI - Interactive Report Engine

// State Management
let currentData = null;
let selectedVisual = null;
let visuals = [];
let currentPage = 1;
let zoomLevel = 100;
let selectedFields = [];

// DOM Elements
const canvas = document.getElementById('reportCanvas');
const dataModal = document.getElementById('dataModal');
const toastContainer = document.getElementById('toastContainer');
const fileInput = document.getElementById('fileInput');

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  loadSampleData();
});

// Event Listeners
function setupEventListeners() {
  // Ribbon tabs
  document.querySelectorAll('.ribbon-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.ribbon-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Show/hide ribbon toolbars based on selected tab
      const tabName = tab.dataset.tab;
      document.querySelectorAll('.ribbon-toolbar').forEach(toolbar => {
        toolbar.classList.add('hidden');
      });
      
      if (tabName === 'home') {
        document.getElementById('ribbonHome')?.classList.remove('hidden');
      } else if (tabName === 'view') {
        document.getElementById('ribbonView')?.classList.remove('hidden');
      }
    });
  });

  // Pane tabs
  document.querySelectorAll('.pane-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const pane = tab.closest('.left-pane, .right-pane');
      const targetPane = tab.dataset.pane;
      
      pane.querySelectorAll('.pane-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      pane.querySelectorAll('.pane-content').forEach(c => c.classList.add('hidden'));
      pane.querySelector(`#${targetPane}Pane`).classList.remove('hidden');
      
      // Special handling for Model tab - show model diagram on canvas
      if (targetPane === 'model') {
        showModelViewOnCanvas();
      } else {
        // Hide model view from canvas when switching to other tabs
        hideModelViewFromCanvas();
      }
    });
  });

  // Get Data button
  document.getElementById('getDataBtn')?.addEventListener('click', () => {
    dataModal.classList.add('active');
  });

  // Refresh button
  document.getElementById('refreshBtn')?.addEventListener('click', () => {
    showToast('Refreshing data...', 'success');
    document.getElementById('lastRefresh').textContent = 'Last refresh: Just now';
  });

  // View Table Data button
  document.getElementById('viewTableDataBtn')?.addEventListener('click', () => {
    if (currentData && currentData.tables.length > 0) {
      showTablePreview(0); // Show first table
    } else {
      showToast('No data loaded. Please upload a file first.', 'warning');
    }
  });

  // File input
  fileInput?.addEventListener('change', handleFileUpload);

  // Get Started button
  document.getElementById('getStartedBtn')?.addEventListener('click', () => {
    document.getElementById('canvasPlaceholder').style.display = 'none';
    showToast('Ready to build your report! Select a visual from the Visualizations pane.', 'success');
  });

  // Visual items
  document.querySelectorAll('.viz-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.viz-item').forEach(v => v.classList.remove('active'));
      item.classList.add('active');
      selectedVisual = item.dataset.type;
      
      console.log('Viz item clicked:', selectedVisual);
      
      // Get fields from wells (try multiple sources)
      let xField = window.fieldWellsData?.xAxis;
      let yField = window.fieldWellsData?.yAxis;
      
      // Fallback to dropzone datasets
      if (!xField) {
        const xDropzone = document.getElementById('xAxisWell');
        if (xDropzone?.dataset.fieldName) {
          xField = { name: xDropzone.dataset.fieldName, type: xDropzone.dataset.fieldType || 'text' };
        }
      }
      if (!yField) {
        const yDropzone = document.getElementById('yAxisWell');
        if (yDropzone?.dataset.fieldName) {
          yField = { name: yDropzone.dataset.fieldName, type: yDropzone.dataset.fieldType || 'text' };
        }
      }
      
      // Create visual with or without fields
      if (xField && yField) {
        console.log('Creating chart with fields:', xField.name, yField.name);
        createVisualOnCanvas(selectedVisual, xField.name, yField.name);
      } else {
        console.log('Creating empty visual:', selectedVisual);
        createVisualOnCanvas(selectedVisual);
      }
    });
  });

  // Zoom controls
  document.getElementById('zoomIn')?.addEventListener('click', () => {
    zoomLevel = Math.min(zoomLevel + 10, 200);
    updateZoom();
  });

  document.getElementById('zoomOut')?.addEventListener('click', () => {
    zoomLevel = Math.max(zoomLevel - 10, 50);
    updateZoom();
  });

  // Page navigation
  document.getElementById('prevPage')?.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      updatePageIndicator();
    }
  });

  document.getElementById('nextPage')?.addEventListener('click', () => {
    currentPage++;
    updatePageIndicator();
  });

  // Add page button
  document.querySelector('.add-page-btn')?.addEventListener('click', () => {
    showToast('New page added', 'success');
  });

  // Canvas tabs
  document.querySelectorAll('.canvas-tabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.canvas-tabs .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentPage = parseInt(tab.dataset.page);
      updatePageIndicator();
    });
  });

  // Drag and drop for field items
  setupDragAndDrop();
}

// Load Sample Data - Now starts empty, waits for upload
function loadSampleData() {
  // Start with empty data - no sample tables
  currentData = {
    tables: [],
    measures: [],
    relationships: []
  };

  renderTablesList();
  updateStatus();
}

// Render Tables List - Shows empty state if no data
function renderTablesList() {
  const container = document.getElementById('tablesList');
  if (!container) return;

  // Show empty state if no data
  if (!currentData || currentData.tables.length === 0) {
    container.innerHTML = `
      <div class="empty-data-state">
        <div class="empty-icon">📁</div>
        <p class="empty-title">No data loaded</p>
        <p class="empty-hint">Click "Get Data" to upload your Excel or CSV file</p>
      </div>
    `;
    renderModelView();
    return;
  }

  let html = '';
  currentData.tables.forEach((table, index) => {
    html += `
      <div class="table-item" data-table="${table.name}" data-index="${index}">
        <span class="field-icon">📊</span>
        <span>${table.name}</span>
        <span style="margin-left: auto; font-size: 10px; color: var(--text-muted);">${table.fields.length} fields</span>
      </div>
      <div class="table-fields expanded" id="fields-${table.name}">
        ${table.fields.map(field => `
          <div class="field-item" draggable="true" data-field="${field.name}" data-type="${field.type}" title="${field.name} (${field.type})">
            <span class="field-icon ${field.type}">${getFieldIcon(field.type)}</span>
            <span class="field-name">${field.name}</span>
          </div>
        `).join('')}
      </div>
    `;
  });

  container.innerHTML = html;

  // Add click listeners to table items
  container.querySelectorAll('.table-item').forEach(item => {
    item.style.cursor = 'pointer';
    item.addEventListener('click', (e) => {
      const index = parseInt(item.dataset.index);
      console.log('Table clicked, index:', index);
      showTablePreview(index);
    });
  });

  // Add drag listeners
  container.querySelectorAll('.field-item').forEach(item => {
    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('field', item.dataset.field);
      e.dataTransfer.setData('type', item.dataset.type);
      item.style.opacity = '0.5';
    });
    item.addEventListener('dragend', (e) => {
      item.style.opacity = '1';
    });
  });

  // Update model view
  renderModelView();
}

// Render Model View with table cards
function renderModelView() {
  const container = document.getElementById('modelViewContainer');
  if (!container) return;

  // Show empty state if no data
  if (!currentData || currentData.tables.length === 0) {
    container.innerHTML = `
      <div class="model-empty-state">
        <div class="empty-icon">📊</div>
        <p class="empty-title">No tables loaded</p>
        <p class="empty-hint">Upload data to see tables in Model view</p>
      </div>
    `;
    return;
  }

  // Show simplified list in sidebar, actual cards on canvas
  let html = '<div class="model-sidebar-list">';
  currentData.tables.forEach((table, index) => {
    html += `
      <div class="model-sidebar-item t3d" data-index="${index}">
        <span class="model-sidebar-icon">📊</span>
        <span>${table.name}</span>
        <span style="margin-left: auto; font-size: 11px; color: var(--text-muted);">${table.fields.length} fields</span>
      </div>
    `;
  });
  html += '</div>';
  
  container.innerHTML = html;

  // Add click listeners to sidebar items
  container.querySelectorAll('.model-sidebar-item').forEach(item => {
    item.style.cursor = 'pointer';
    item.addEventListener('click', () => {
      const index = parseInt(item.dataset.index);
      // Switch to Model tab and show on canvas
      document.querySelector('[data-pane="model"]')?.click();
      showLargeTablePreviewOnCanvas(index);
    });
  });
}

// Toggle model card collapse
function toggleModelCard(btn) {
  const card = btn.closest('.model-table-card');
  const fieldsList = card.querySelector('.model-fields-list');
  const isCollapsed = fieldsList.style.display === 'none';
  
  fieldsList.style.display = isCollapsed ? 'block' : 'none';
  btn.innerHTML = isCollapsed ? 'Collapse <span>⌃</span>' : 'Expand <span>⌄</span>';
}

// Show Model View on Canvas - Display all tables as cards in center
function showModelViewOnCanvas() {
  // Always hide placeholder first
  const placeholder = document.getElementById('canvasPlaceholder');
  if (placeholder) {
    placeholder.style.display = 'none';
  }
  
  if (!currentData || currentData.tables.length === 0) {
    // Show empty state message on canvas instead of placeholder
    showToast('No tables to display. Please upload data first.', 'warning');
    return;
  }
  
  // Remove existing model view visuals
  hideModelViewFromCanvas();
  
  // Calculate grid layout for tables
  const canvasWidth = canvas.offsetWidth || 1200;
  const canvasHeight = canvas.offsetHeight || 800;
  const cardWidth = 280;
  const cardHeight = 350;
  const gapX = 40;
  const gapY = 40;
  const startX = 50;
  const startY = 50;
  const cols = Math.floor((canvasWidth - startX * 2) / (cardWidth + gapX)) || 3;
  
  // Create model diagram container
  const modelContainerId = 'model-view-diagram';
  const modelContainer = document.createElement('div');
  modelContainer.id = modelContainerId;
  modelContainer.className = 'model-diagram-container';
  modelContainer.style.cssText = `
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    z-index: 50;
    background: rgba(13, 115, 119, 0.05);
  `;
  
  // Add close button at top
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '❌ Close Model View';
  closeBtn.style.cssText = `
    position: absolute;
    top: 20px;
    right: 20px;
    padding: 10px 20px;
    background: #dc3545;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    z-index: 60;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  `;
  closeBtn.onclick = () => hideModelViewFromCanvas();
  modelContainer.appendChild(closeBtn);
  
  // Add Create Relationship button
  const relBtn = document.createElement('button');
  relBtn.innerHTML = '🔗 Create Relationship';
  relBtn.style.cssText = `
    position: absolute;
    top: 20px;
    right: 170px;
    padding: 10px 20px;
    background: #7C5CFF;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    z-index: 60;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  `;
  relBtn.onclick = () => showCreateRelationshipDialog(0, currentData.tables.length > 1 ? 1 : 0);
  modelContainer.appendChild(relBtn);
  
  // Add title
  const title = document.createElement('div');
  title.innerHTML = '📊 Model View - All Tables';
  title.style.cssText = `
    position: absolute;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 18px;
    font-weight: 600;
    color: #212529;
    z-index: 60;
    background: white;
    padding: 10px 30px;
    border-radius: 30px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  `;
  modelContainer.appendChild(title);
  
  // Create table cards for each table
  currentData.tables.forEach((table, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const left = startX + col * (cardWidth + gapX);
    const top = startY + row * (cardHeight + gapY);
    
    const cardId = `model-card-${index}`;
    const card = document.createElement('div');
    card.id = cardId;
    card.className = 'model-table-card-canvas';
    card.style.cssText = `
      position: absolute;
      left: ${left}px;
      top: ${top}px;
      width: ${cardWidth}px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      overflow: hidden;
      z-index: 51;
    `;
    
    card.innerHTML = `
      <div class="model-table-header-canvas" style="
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background: #f8f9fa;
        border-bottom: 1px solid #e9ecef;
      ">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="font-size: 20px;">📊</div>
          <span style="font-weight: 600; font-size: 14px; color: #212529;">${table.name}</span>
        </div>
        <button onclick="showLargeTablePreviewOnCanvas(${index})" style="
          padding: 4px 8px;
          font-size: 11px;
          background: #0d7377;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        ">📋 Data</button>
      </div>
      <div class="model-fields-list-canvas" style="
        max-height: 250px;
        overflow-y: auto;
        padding: 8px 0;
      ">
        ${table.fields.map(field => `
          <div style="
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 6px 16px;
            font-size: 13px;
            color: #495057;
          ">
            <span style="
              width: 18px;
              height: 18px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 12px;
              color: ${field.type === 'numeric' ? '#28a745' : '#6c757d'};
            ">${field.type === 'numeric' ? '∑' : (field.type === 'date' ? '📅' : 'ABC')}</span>
            <span>${field.name}</span>
          </div>
        `).join('')}
      </div>
      <div style="
        padding: 8px 16px;
        border-top: 1px solid #e9ecef;
        background: #f8f9fa;
        font-size: 11px;
        color: #6c757d;
        text-align: center;
      ">
        ${table.fields.length} fields · ${table.totalRows} rows
      </div>
    `;
    
    modelContainer.appendChild(card);
    makeDraggable(card);
  });
  
  // Draw relationship lines if any exist
  setTimeout(() => drawRelationshipLines(), 100);
  
  canvas.appendChild(modelContainer);
  showToast(`📊 Model view: ${currentData.tables.length} tables displayed`, 'success');
}

// Hide Model View from Canvas
function hideModelViewFromCanvas() {
  const existingModel = document.getElementById('model-view-diagram');
  if (existingModel) {
    existingModel.remove();
  }
  
  // Show placeholder only if no other visuals and no data
  if (visuals.length === 0 && (!currentData || currentData.tables.length === 0)) {
    const placeholder = document.getElementById('canvasPlaceholder');
    if (placeholder) {
      placeholder.style.display = 'flex';
    }
  }
}

// Get icon for field type
function getFieldIcon(type) {
  const icons = {
    numeric: '123',
    date: '📅',
    text: 'ABC'
  };
  return icons[type] || 'ABC';
}

// Show Large Table Preview on Canvas
function showLargeTablePreviewOnCanvas(tableIndex) {
  console.log('showLargeTablePreviewOnCanvas called with index:', tableIndex);
  console.log('canvas element:', canvas);
  
  if (!currentData || !currentData.tables || !currentData.tables[tableIndex]) {
    showToast('No table data available', 'error');
    return;
  }
  
  const table = currentData.tables[tableIndex];
  
  // Check canvas exists
  if (!canvas) {
    console.error('Canvas element not found!');
    showToast('Canvas not found', 'error');
    return;
  }
  
  // Hide placeholder
  const placeholder = document.getElementById('canvasPlaceholder');
  if (placeholder) {
    placeholder.style.display = 'none';
  }
  
  // Calculate staggered position for multiple visuals
  const existingTableVisuals = visuals.filter(v => v.type === 'table-preview');
  const offsetX = (existingTableVisuals.length % 3) * 50; // Stagger horizontally
  const offsetY = Math.floor(existingTableVisuals.length / 3) * 50; // Stagger vertically every 3 tables
  
  // Create large table visual
  const visualId = 'table-preview-' + Date.now();
  const visual = document.createElement('div');
  visual.className = 'visual-element table-preview-visual';
  visual.id = visualId;
  visual.style.left = (50 + offsetX) + 'px';
  visual.style.top = (50 + offsetY) + 'px';
  visual.style.width = '800px';
  visual.style.height = '500px';
  visual.style.zIndex = '100';
  
  const headers = table.fields.map(f => f.name);
  const rowsToShow = table.rows ? table.rows.slice(0, 100) : [];
  const totalRows = table.totalRows || rowsToShow.length;
  
  console.log('Creating visual with', headers.length, 'columns and', rowsToShow.length, 'rows');
  
  visual.innerHTML = `
    <div class="visual-header">
      <span class="visual-title">📊 ${table.name} (${totalRows} rows)</span>
      <div class="visual-actions">
        <button class="visual-action-btn" onclick="removeVisual('${visualId}')" title="Remove">🗑</button>
      </div>
    </div>
    <div class="visual-content" style="overflow: auto; padding: 0; max-height: calc(100% - 50px);">
      ${rowsToShow.length > 0 ? `
      <table class="preview-table large-preview-table">
        <thead>
          <tr>
            ${headers.map(h => `<th>${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rowsToShow.map(row => `
            <tr>
              ${headers.map(h => `<td>${row[h] !== undefined ? row[h] : ''}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
      ` : '<div style="padding: 40px; text-align: center; color: var(--text-muted);"><p>No preview data available</p></div>'}
    </div>
    <div class="resize-handle"></div>
  `;
  
  canvas.appendChild(visual);
  console.log('Visual appended to canvas, ID:', visualId);
  
  visuals.push({ id: visualId, type: 'table-preview', tableIndex });
  
  // Make draggable
  makeDraggable(visual);
  
  // Update viz count
  const vizCountEl = document.getElementById('vizCount');
  if (vizCountEl) {
    vizCountEl.textContent = `${visuals.length} visual${visuals.length > 1 ? 's' : ''}`;
  }
  
  showToast(`📊 ${table.name} added to canvas (${visuals.length} visuals)`, 'success');
}

// Show Table Preview Modal (small popup version)
function showTablePreview(tableIndex) {
  console.log('showTablePreview called with index:', tableIndex);
  console.log('currentData:', currentData);
  
  if (!currentData || !currentData.tables || !currentData.tables[tableIndex]) {
    showToast('No table data available', 'error');
    return;
  }
  
  const table = currentData.tables[tableIndex];
  console.log('Table:', table);
  
  // Create preview modal
  const modalId = 'tablePreviewModal';
  let modal = document.getElementById(modalId);
  
  if (!modal) {
    modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal';
    document.body.appendChild(modal);
  }
  
  // Build table HTML
  const headers = table.fields.map(f => f.name);
  const rowsToShow = table.rows ? table.rows.slice(0, 50) : []; // Show first 50 rows if available
  const totalRows = table.totalRows || rowsToShow.length;
  
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 95vw; width: 1000px; max-height: 85vh;">
      <div class="modal-header">
        <h3>📊 ${table.name} Preview (${totalRows} rows)</h3>
        <button class="modal-close" onclick="document.getElementById('${modalId}').classList.remove('active')">×</button>
      </div>
      <div class="modal-body" style="overflow: auto; padding: 0; max-height: calc(85vh - 60px);">
        ${rowsToShow.length > 0 ? `
        <table class="preview-table">
          <thead>
            <tr>
              ${headers.map(h => `<th>${h}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${rowsToShow.map(row => `
              <tr>
                ${headers.map(h => `<td>${row[h] !== undefined ? row[h] : ''}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
        ` : '<div style="padding: 40px; text-align: center; color: var(--text-muted);"><p>No preview data available</p><p style="font-size: 12px;">Upload CSV again to see preview</p></div>'}
      </div>
    </div>
  `;
  
  modal.classList.add('active');
  
  // Close on background click
  modal.onclick = (e) => {
    if (e.target === modal) modal.classList.remove('active');
  };
}

function setupDragAndDrop() {
  // Canvas drop
  canvas?.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  canvas?.addEventListener('drop', (e) => {
    e.preventDefault();
    const field = e.dataTransfer.getData('field');
    const type = e.dataTransfer.getData('type');
    
    if (field) {
      createVisualFromField(field, type, e.clientX, e.clientY);
    }
  });
}

// Create Visual on Canvas
function createVisualOnCanvas(type, xField, yField) {
  document.getElementById('canvasPlaceholder').style.display = 'none';
  
  const visualId = 'viz-' + Date.now();
  const visual = document.createElement('div');
  visual.className = 'visual-element';
  visual.id = visualId;
  visual.style.left = '100px';
  visual.style.top = '100px';
  visual.style.width = '500px';
  visual.style.height = '400px';
  
  const title = xField && yField ? `${yField} by ${xField}` : getVisualTitle(type);
  const chartCanvasId = 'chart-' + visualId;
  
  // If we have xField and yField, create chart content directly
  const contentHtml = xField && yField 
    ? `<canvas id="${chartCanvasId}" style="width: 100%; height: 320px; display: block;"></canvas>`
    : `<div style="display: flex; align-items: center; justify-content: center; height: 200px; color: var(--text-muted);"><p>Drag fields to build this ${type}</p></div>`;
  
  visual.innerHTML = `
    <div class="visual-header">
      <span class="visual-title">${title}</span>
      <div class="ribbon-right">
        <button class="btn-icon" title="Undo">↩️</button>
        <button class="btn-icon" title="Redo">↪️</button>
        <button class="btn-primary" onclick="downloadDashboard()" title="Download Dashboard">� Download</button>
        <button class="btn-primary" id="publishBtn" onclick="publishReport()">📤 Publish</button>
      </div>
    </div>
    <div class="visual-content" id="content-${visualId}" style="padding: 10px; overflow: hidden; height: calc(100% - 50px);">
      ${contentHtml}
    </div>
    <div class="resize-handle"></div>
  `;
  
  canvas.appendChild(visual);
  visuals.push({ id: visualId, type, data: { xField, yField } });
  
  // Make draggable
  makeDraggable(visual);
  
  // If we have xField and yField, render the chart with real data
  if (xField && yField) {
    setTimeout(() => {
      const canvasEl = document.getElementById(chartCanvasId);
      if (canvasEl) {
        renderChartWithData(chartCanvasId, type, xField, yField);
      } else {
        console.error('Canvas element not found:', chartCanvasId);
      }
    }, 200);
  }
  
  // Update viz count
  document.getElementById('vizCount').textContent = `${visuals.length} visual${visuals.length > 1 ? 's' : ''}`;
  
  showToast(`${title} created`, 'success');
}

// Render chart with actual data from tables
function renderChartWithData(canvasId, chartType, xField, yField) {
  const canvasEl = document.getElementById(canvasId);
  if (!canvasEl) {
    console.error('Canvas element not found:', canvasId);
    return;
  }
  
  // Get 2D context
  const ctx = canvasEl.getContext('2d');
  if (!ctx) {
    console.error('Could not get 2D context for canvas:', canvasId);
    return;
  }
  
  console.log('Rendering chart:', chartType, 'X:', xField, 'Y:', yField);
  
  // Check if currentData exists
  if (!currentData || !currentData.tables || currentData.tables.length === 0) {
    console.log('No data available, showing sample data');
  }
  
  // Get data from tables
  let chartData = [];
  let foundTable = null;
  let xFieldType = 'text';
  let yFieldType = 'numeric';
  let xAxisLabel = xField;  // Store original field names for display
  let yAxisLabel = yField;
  
  if (currentData && currentData.tables) {
    for (const table of currentData.tables) {
      const hasXField = table.fields && table.fields.some(f => f.name === xField);
      const hasYField = table.fields && table.fields.some(f => f.name === yField);
      
      // Get field types
      const xFieldInfo = table.fields?.find(f => f.name === xField);
      const yFieldInfo = table.fields?.find(f => f.name === yField);
      xFieldType = xFieldInfo?.type || 'text';
      yFieldType = yFieldInfo?.type || 'text';
      
      console.log('Using fields: X=' + xField + ' (' + xFieldType + '), Y=' + yField + ' (' + yFieldType + ')');
      
      if (hasXField && hasYField && table.rows && table.rows.length > 0) {
        foundTable = table;
        console.log('Found table with both fields:', table.name);
        
        const isHorizontal = xFieldType === 'numeric' && yFieldType === 'text';
        const catField = isHorizontal ? yField : xField;
        const numField = isHorizontal ? xField : yField;
        
        // Aggregate data: group by catField, sum numField
        const aggregated = {};
        for (const row of table.rows) {
          const catValue = row[catField];
          const numValue = parseFloat(row[numField]) || 0;
          
          if (catValue !== undefined && catValue !== null && catValue !== '') {
            if (!aggregated[catValue]) {
              aggregated[catValue] = { sum: 0, count: 0 };
            }
            aggregated[catValue].sum += numValue;
            aggregated[catValue].count += 1;
          }
        }
        
        const isAvg = (numField.toLowerCase().match(/(age|year|rate|rating|score|hour|percent|ratio|gpa|time|margin|temp)/)) !== null;
        
        let aggregatedData = Object.entries(aggregated)
          .map(([key, value]) => ({
            category: key,
            value: isAvg ? (value.sum / value.count) : value.sum
          }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 20); // Limit to 20 categories
          
        chartData = aggregatedData.map(d => {
            if (isHorizontal) {
                return { x: d.value, y: d.category };
            } else {
                return { x: d.category, y: d.value };
            }
        });
        
        xAxisLabel = xField;
        yAxisLabel = yField;
        window.currentChartIsHorizontal = isHorizontal;
        
        console.log('Chart data prepared:', chartData.length, 'items');
        console.log('Data fields: X=' + xField + ', Y=' + yField);
        console.log('Axis labels: X=' + xAxisLabel + ', Y=' + yAxisLabel);
        break;
      }
    }
  }
  
  // If no data found, create sample data
  if (chartData.length === 0) {
    console.log('Using sample data');
    chartData = [
      { x: 'Category A', y: Math.floor(Math.random() * 100) + 50 },
      { x: 'Category B', y: Math.floor(Math.random() * 100) + 50 },
      { x: 'Category C', y: Math.floor(Math.random() * 100) + 50 },
      { x: 'Category D', y: Math.floor(Math.random() * 100) + 50 },
      { x: 'Category E', y: Math.floor(Math.random() * 100) + 50 }
    ];
  }
  
  // Map chart types to Chart.js types
  const chartTypeMap = {
    'bar': 'bar',
    'column': 'bar',
    'line': 'line',
    'area': 'line',
    'pie': 'pie',
    'donut': 'doughnut',
    'scatter': 'scatter',
    'bubble': 'bubble'
  };
  
  // Check if this is a special chart type that needs custom handling
  const specialTypes = ['funnel', 'gauge', 'treemap', 'waterfall', 'table', 'matrix', 'card', 'multicard', 'slicer', 'button-slicer', 'map'];
  console.log('Chart type:', chartType, 'Special types includes:', specialTypes.includes(chartType));
  if (specialTypes.includes(chartType)) {
    renderSpecialChart(canvasId, chartType, xField, yField, chartData);
    return;
  }
  
  const actualChartType = chartTypeMap[chartType] || 'bar';
  const isLineChart = actualChartType === 'line';
  const isPieChart = actualChartType === 'pie' || actualChartType === 'doughnut';
  
  console.log('Creating Chart.js instance, type:', actualChartType);
  
  // Destroy existing chart if any
  if (window[canvasId + '_chart']) {
    window[canvasId + '_chart'].destroy();
  }
  
  try {
    // Create the chart
    const isHorizontal = window.currentChartIsHorizontal || false;
    window[canvasId + '_chart'] = new Chart(ctx, {
      type: actualChartType,
      data: {
        labels: isHorizontal ? chartData.map(d => d.y) : chartData.map(d => d.x),
        datasets: [{
          label: isHorizontal ? xField : yField,
          data: isHorizontal ? chartData.map(d => d.x) : chartData.map(d => d.y),
          backgroundColor: isLineChart ? 'rgba(124, 92, 255, 0.3)' : 
                            isPieChart ? [
                              '#7C5CFF', '#35D2FF', '#3DDC97', '#FFB347', '#FF6B6B', 
                              '#9B59B6', '#3498db', '#e74c3c', '#2ecc71', '#f39c12'
                            ] : '#7C5CFF',
          borderColor: '#7C5CFF',
          borderWidth: isLineChart ? 3 : 1,
          fill: chartType === 'area',
          tension: 0.4,
          pointRadius: isLineChart ? 5 : 0,
          pointBackgroundColor: '#7C5CFF'
        }]
      },
      options: {
        indexAxis: (isHorizontal && actualChartType === 'bar') ? 'y' : 'x',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: !isPieChart,
            position: 'top',
            labels: { color: '#ffffff', font: { size: 12 } }
          },
          title: {
            display: true,
            text: `${yField} by ${xField}`,
            font: { size: 16, weight: 'bold' },
            color: '#ffffff',
            padding: { top: 10, bottom: 20 }
          }
        },
        scales: isPieChart ? {} : {
          x: {
            display: true,
            title: {
              display: true,
              text: xAxisLabel || xField,
              color: '#a0a0a0',
              font: { size: 12 }
            },
            ticks: {
              color: '#a0a0a0',
              maxRotation: 45
            },
            grid: {
              color: 'rgba(255,255,255,0.1)'
            }
          },
          y: {
            display: true,
            title: {
              display: true,
              text: yAxisLabel || yField,
              color: '#a0a0a0',
              font: { size: 12 }
            },
            ticks: {
              color: '#a0a0a0'
            },
            grid: {
              color: 'rgba(255,255,255,0.1)'
            },
            beginAtZero: true
          }
        }
      }
    });
    
    console.log('Chart created successfully');
  } catch (error) {
    console.error('Error creating chart:', error);
    // Show error message in the canvas area
    const parent = canvasEl.parentElement;
    if (parent) {
      parent.innerHTML += `<div style="color: #ff6b6b; padding: 10px; text-align: center;">Error creating chart: ${error.message}</div>`;
    }
  }
}

// Render special chart types (funnel, gauge, table, matrix, card, slicer, map, treemap, waterfall)
function renderSpecialChart(canvasId, chartType, xField, yField, chartData) {
  const canvasEl = document.getElementById(canvasId);
  const parent = canvasEl.parentElement;
  
  // Remove the canvas and replace with custom HTML
  canvasEl.style.display = 'none';
  
  let html = '';
  
  switch(chartType) {
    case 'table':
    case 'matrix':
      html = `
        <div style="width: 100%; height: 100%; overflow: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
              <tr style="background: rgba(124, 92, 255, 0.2);">
                <th style="padding: 8px; text-align: left; color: #fff; border-bottom: 1px solid rgba(124, 92, 255, 0.3);">${xField}</th>
                <th style="padding: 8px; text-align: right; color: #fff; border-bottom: 1px solid rgba(124, 92, 255, 0.3);">${yField}</th>
              </tr>
            </thead>
            <tbody>
              ${chartData.map((d, i) => `
                <tr style="background: ${i % 2 === 0 ? 'rgba(255,255,255,0.05)' : 'transparent'};">
                  <td style="padding: 8px; color: #ccc; border-bottom: 1px solid rgba(255,255,255,0.1);">${d.x}</td>
                  <td style="padding: 8px; color: #7C5CFF; text-align: right; font-weight: 600; border-bottom: 1px solid rgba(255,255,255,0.1);">${d.y.toLocaleString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
      break;
      
    case 'card':
      const total = chartData.reduce((sum, d) => sum + d.y, 0);
      html = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 20px;">
          <div style="font-size: 48px; font-weight: 700; color: #7C5CFF; text-shadow: 0 0 20px rgba(124, 92, 255, 0.5);">${total.toLocaleString()}</div>
          <div style="font-size: 14px; color: #a0a0a0; margin-top: 10px;">${yField}</div>
          <div style="font-size: 12px; color: #666; margin-top: 5px;">by ${xField}</div>
        </div>
      `;
      break;
      
    case 'multicard':
      html = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 15px; padding: 15px; height: 100%; overflow: auto;">
          ${chartData.slice(0, 6).map(d => `
            <div style="background: rgba(124, 92, 255, 0.1); border-radius: 8px; padding: 15px; text-align: center; border: 1px solid rgba(124, 92, 255, 0.2);">
              <div style="font-size: 11px; color: #a0a0a0; margin-bottom: 5px;">${d.x}</div>
              <div style="font-size: 24px; font-weight: 700; color: #7C5CFF;">${d.y.toLocaleString()}</div>
            </div>
          `).join('')}
        </div>
      `;
      break;
      
    case 'funnel':
      const maxVal = Math.max(...chartData.map(d => d.y));
      html = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 20px; gap: 8px;">
          ${chartData.map((d, i) => {
            const width = (d.y / maxVal) * 80 + 20;
            const colors = ['#7C5CFF', '#9B7BFF', '#B5A0FF', '#CFC0FF', '#E8E0FF'];
            return `
              <div style="width: ${width}%; background: ${colors[i % colors.length]}; height: 40px; border-radius: 4px; display: flex; align-items: center; justify-content: space-between; padding: 0 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.2);">
                <span style="color: ${i < 2 ? '#fff' : '#333'}; font-weight: 600; font-size: 12px;">${d.x}</span>
                <span style="color: ${i < 2 ? '#fff' : '#333'}; font-weight: 700; font-size: 14px;">${d.y.toLocaleString()}</span>
              </div>
            `;
          }).join('')}
        </div>
      `;
      break;
      
    case 'gauge':
      const gaugeValue = chartData[0]?.y || 0;
      const gaugeMax = Math.max(...chartData.map(d => d.y)) * 1.2;
      const percentage = (gaugeValue / gaugeMax) * 100;
      const rotation = (percentage / 100) * 180 - 90;
      html = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 20px;">
          <div style="position: relative; width: 200px; height: 100px; overflow: hidden;">
            <div style="position: absolute; width: 200px; height: 200px; border-radius: 50%; background: conic-gradient(from 180deg, #7C5CFF 0deg, #35D2FF ${percentage * 1.8}deg, rgba(255,255,255,0.1) ${percentage * 1.8}deg, rgba(255,255,255,0.1) 180deg); transform: rotate(-90deg);"></div>
            <div style="position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); width: 150px; height: 75px; background: #1a1d21; border-radius: 150px 150px 0 0;"></div>
            <div style="position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%); text-align: center;">
              <div style="font-size: 32px; font-weight: 700; color: #7C5CFF;">${gaugeValue.toLocaleString()}</div>
              <div style="font-size: 11px; color: #666;">${chartData[0]?.x || yField}</div>
            </div>
          </div>
          <div style="font-size: 12px; color: #a0a0a0; margin-top: 10px;">${yField} - ${percentage.toFixed(1)}% of max</div>
        </div>
      `;
      break;
      
    case 'treemap':
      const totalValue = chartData.reduce((sum, d) => sum + d.y, 0);
      html = `
        <div style="display: flex; flex-wrap: wrap; gap: 4px; padding: 15px; height: 100%; align-content: flex-start;">
          ${chartData.map((d, i) => {
            const size = (d.y / totalValue) * 100;
            const colors = ['#7C5CFF', '#35D2FF', '#3DDC97', '#FFB347', '#FF6B6B', '#9B59B6'];
            return `
              <div style="flex: ${size}; min-width: 60px; min-height: 40px; background: ${colors[i % colors.length]}; border-radius: 4px; padding: 8px; display: flex; flex-direction: column; justify-content: center; align-items: center;">
                <span style="color: #fff; font-size: 10px; text-align: center; font-weight: 600;">${d.x}</span>
                <span style="color: rgba(255,255,255,0.9); font-size: 12px; font-weight: 700;">${d.y.toLocaleString()}</span>
              </div>
            `;
          }).join('')}
        </div>
      `;
      break;
      
    case 'waterfall':
      let cumulative = 0;
      const waterfallData = chartData.map(d => {
        const start = cumulative;
        cumulative += d.y;
        return { ...d, start, end: cumulative };
      });
      const maxWaterfall = Math.max(...waterfallData.map(d => d.end));
      html = `
        <div style="display: flex; align-items: flex-end; justify-content: center; height: 100%; padding: 20px; gap: 8px;">
          ${waterfallData.map((d, i) => {
            const height = (d.y / maxWaterfall) * 60;
            const bottom = (d.start / maxWaterfall) * 60;
            return `
              <div style="display: flex; flex-direction: column; align-items: center;">
                <div style="width: 40px; height: ${height}px; background: ${d.y >= 0 ? '#3DDC97' : '#FF6B6B'}; border-radius: 4px 4px 0 0; position: relative; bottom: 0;"></div>
                <div style="font-size: 10px; color: #666; margin-top: 5px; transform: rotate(-45deg); white-space: nowrap;">${d.x}</div>
              </div>
            `;
          }).join('')}
        </div>
      `;
      break;
      
    case 'slicer':
      html = `
        <div style="padding: 15px; height: 100%; overflow: auto;">
          <div style="font-size: 12px; color: #a0a0a0; margin-bottom: 10px;">Select ${xField}</div>
          ${chartData.map((d, i) => `
            <div style="display: flex; align-items: center; padding: 8px; margin-bottom: 4px; background: rgba(124, 92, 255, 0.1); border-radius: 4px; cursor: pointer; transition: background 0.2s;" onmouseenter="this.style.background='rgba(124, 92, 255, 0.2)'" onmouseleave="this.style.background='rgba(124, 92, 255, 0.1)'">
              <input type="checkbox" style="margin-right: 10px; accent-color: #7C5CFF;">
              <span style="flex: 1; color: #fff; font-size: 13px;">${d.x}</span>
              <span style="color: #7C5CFF; font-size: 12px; font-weight: 600;">${d.y.toLocaleString()}</span>
            </div>
          `).join('')}
        </div>
      `;
      break;
      
    case 'button-slicer':
      html = `
        <div style="padding: 15px; height: 100%; overflow: auto;">
          <div style="font-size: 12px; color: #a0a0a0; margin-bottom: 12px;">Select ${xField}</div>
          <div style="display: flex; flex-wrap: wrap; gap: 8px;">
            ${chartData.map((d, i) => `
              <button class="slicer-btn" data-value="${d.x}" data-index="${i}" onclick="this.classList.toggle('selected'); if(this.classList.contains('selected')){this.style.background='#7C5CFF';this.style.borderColor='#7C5CFF';}else{this.style.background='rgba(124, 92, 255, 0.1)';this.style.borderColor='rgba(124, 92, 255, 0.3)';}" 
                style="padding: 10px 16px; background: rgba(124, 92, 255, 0.1); border: 1px solid rgba(124, 92, 255, 0.3); border-radius: 20px; color: #fff; font-size: 13px; cursor: pointer; transition: all 0.2s;">
                ${d.x}
                <span style="background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; margin-left: 8px;">${d.y.toLocaleString()}</span>
              </button>
            `).join('')}
          </div>
        </div>
      `;
      break;
      
    case 'map':
      html = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 20px;">
          <div style="font-size: 64px; margin-bottom: 15px;">🗺️</div>
          <div style="font-size: 16px; color: #a0a0a0; text-align: center;">Map Visualization</div>
          <div style="font-size: 12px; color: #666; margin-top: 10px; text-align: center;">${xField} vs ${yField}</div>
          <div style="margin-top: 20px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
            ${chartData.slice(0, 4).map(d => `
              <div style="background: rgba(124, 92, 255, 0.1); padding: 8px 12px; border-radius: 4px; text-align: center;">
                <div style="font-size: 11px; color: #666;">${d.x}</div>
                <div style="font-size: 16px; color: #7C5CFF; font-weight: 700;">${d.y.toLocaleString()}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
      break;
      
    default:
      html = `<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #666;">${chartType} visualization coming soon</div>`;
  }
  
  // Create a div to hold the special chart content
  const contentDiv = document.createElement('div');
  contentDiv.style.cssText = 'width: 100%; height: 100%;';
  contentDiv.innerHTML = html;
  parent.appendChild(contentDiv);
  
  console.log('Special chart rendered:', chartType);
}

// Create Visual from Field Drop
function createVisualFromField(field, type, x, y) {
  document.getElementById('canvasPlaceholder').style.display = 'none';
  
  const visualId = 'viz-' + Date.now();
  const visual = document.createElement('div');
  visual.className = 'visual-element';
  visual.id = visualId;
  visual.style.left = (x - canvas.offsetLeft - 50) + 'px';
  visual.style.top = (y - canvas.offsetTop - 50) + 'px';
  visual.style.width = '350px';
  visual.style.height = '250px';
  
  const vizType = type === 'numeric' ? 'card' : 'table';
  
  visual.innerHTML = `
    <div class="visual-header">
      <span class="visual-title">${field}</span>
      <div class="visual-actions">
        <button class="visual-action-btn" onclick="removeVisual('${visualId}')" title="Delete">✕</button>
      </div>
    </div>
    <div class="visual-content" id="content-${visualId}">
      ${renderVisualContent(vizType, field)}
    </div>
    <div class="resize-handle"></div>
  `;
  
  canvas.appendChild(visual);
  makeDraggable(visual);
  
  visuals.push({ id: visualId, type: vizType, field });
  document.getElementById('vizCount').textContent = `${visuals.length} visual${visuals.length > 1 ? 's' : ''}`;
}

// Render Visual Content
function renderVisualContent(type, field) {
  if (type === 'card') {
    const randomValue = Math.floor(Math.random() * 10000) + 1000;
    return `
      <div class="viz-card">
        <div class="viz-card-value">${randomValue.toLocaleString()}</div>
        <div class="viz-card-label">${field}</div>
      </div>
    `;
  }
  
  if (type === 'table') {
    return `
      <table class="viz-table">
        <thead>
          <tr><th>${field}</th><th>Value</th></tr>
        </thead>
        <tbody>
          <tr><td>Item 1</td><td>${Math.floor(Math.random() * 100)}</td></tr>
          <tr><td>Item 2</td><td>${Math.floor(Math.random() * 100)}</td></tr>
          <tr><td>Item 3</td><td>${Math.floor(Math.random() * 100)}</td></tr>
        </tbody>
      </table>
    `;
  }
  
  return `<canvas id="chart-${Date.now()}"></canvas>`;
}

// Make Element Draggable
function makeDraggable(element) {
  let isDragging = false;
  let startX, startY, startLeft, startTop;
  
  element.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('resize-handle')) return;
    
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = parseInt(element.style.left || 0);
    startTop = parseInt(element.style.top || 0);
    
    element.classList.add('selected');
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
  
  function onMouseMove(e) {
    if (!isDragging) return;
    
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    
    element.style.left = (startLeft + dx) + 'px';
    element.style.top = (startTop + dy) + 'px';
  }
  
  function onMouseUp() {
    isDragging = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }
  
  // Resize handle
  const resizeHandle = element.querySelector('.resize-handle');
  if (resizeHandle) {
    resizeHandle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      
      let isResizing = true;
      let startWidth = element.offsetWidth;
      let startHeight = element.offsetHeight;
      let startX = e.clientX;
      let startY = e.clientY;
      
      document.addEventListener('mousemove', onResizeMove);
      document.addEventListener('mouseup', onResizeUp);
      
      function onResizeMove(e) {
        if (!isResizing) return;
        
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        
        element.style.width = Math.max(200, startWidth + dx) + 'px';
        element.style.height = Math.max(150, startHeight + dy) + 'px';
      }
      
      function onResizeUp() {
        isResizing = false;
        document.removeEventListener('mousemove', onResizeMove);
        document.removeEventListener('mouseup', onResizeUp);
      }
    });
  }
}

// Remove Visual
function removeVisual(id) {
  const visual = document.getElementById(id);
  if (visual) {
    visual.remove();
    visuals = visuals.filter(v => v.id !== id);
    document.getElementById('vizCount').textContent = `${visuals.length} visual${visuals.length !== 1 ? 's' : ''}`;
    
    if (visuals.length === 0) {
      document.getElementById('canvasPlaceholder').style.display = 'flex';
    }
  }
}

// Configure Visual
function configureVisual(id) {
  showToast('Visual configuration panel opened', 'success');
  
  // Switch to format pane
  document.querySelectorAll('.right-pane .pane-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('[data-pane="format"]').classList.add('active');
  document.querySelectorAll('.right-pane .pane-content').forEach(c => c.classList.add('hidden'));
  document.getElementById('formatPane').classList.remove('hidden');
}

// Create Sample Visual
function createSampleVisual() {
  createVisualOnCanvas('column');
}

// Get Visual Title
function getVisualTitle(type) {
  const titles = {
    table: 'Table',
    matrix: 'Matrix',
    card: 'Card',
    multicard: 'Multi-row Card',
    bar: 'Bar Chart',
    column: 'Column Chart',
    line: 'Line Chart',
    area: 'Area Chart',
    pie: 'Pie Chart',
    donut: 'Donut Chart',
    scatter: 'Scatter Chart',
    bubble: 'Bubble Chart',
    map: 'Map',
    funnel: 'Funnel',
    gauge: 'Gauge',
    slicer: 'Slicer',
    'button-slicer': 'Button Slicer',
    treemap: 'Treemap',
    waterfall: 'Waterfall'
  };
  return titles[type] || 'Visual';
}

// Handle File Upload - Parse CSV and show columns
function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  showToast(`Loading ${file.name}...`, 'success');
  
  // Parse CSV file
  const reader = new FileReader();
  reader.onload = (event) => {
    const text = event.target.result;
    const lines = text.split('\n').filter(line => line.trim());
    
    if (lines.length > 0) {
      // Extract headers from first line
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      
      // Detect column types from second line if available
      const sampleData = lines[1] ? lines[1].split(',').map(v => v.trim().replace(/"/g, '')) : [];
      
      // Create fields with detected types
      const fields = headers.map((header, index) => {
        const sampleValue = sampleData[index] || '';
        const type = detectColumnType(sampleValue);
        return { name: header, type: type };
      });
      
      // Store full data for preview
      const allRows = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
        const row = {};
        headers.forEach((h, i) => row[h] = values[i] || '');
        return row;
      }).filter(row => Object.values(row).some(v => v !== ''));
      
      // Get table name from filename
      const tableName = file.name.replace(/\.[^/.]+$/, '');
      
      // Initialize currentData if not exists
      if (!currentData) {
        currentData = { tables: [], measures: [] };
      }
      
      // Check if table with same name already exists
      const existingIndex = currentData.tables.findIndex(t => t.name === tableName);
      const newTable = {
        name: tableName,
        fields: fields,
        rows: allRows.slice(0, 100), // Store first 100 rows for preview
        totalRows: allRows.length
      };
      
      if (existingIndex >= 0) {
        // Replace existing table
        currentData.tables[existingIndex] = newTable;
        showToast(`♻️ ${file.name} updated with ${fields.length} columns, ${allRows.length} rows!`, 'success');
      } else {
        // Add new table
        currentData.tables.push(newTable);
        showToast(`✅ ${file.name} loaded with ${fields.length} columns, ${allRows.length} rows!`, 'success');
      }
      
      // Re-render tables list
      renderTablesList();
      updateStatus();
      
      closeModal();
      document.getElementById('dataStatus').textContent = `✅ ${currentData.tables.length} tables loaded`;
      document.getElementById('lastRefresh').textContent = 'Last refresh: Just now';
    }
  };
  
  reader.onerror = () => {
    showToast('❌ Error reading file', 'error');
  };
  
  reader.readAsText(file);
}

// Detect column type based on sample value
function detectColumnType(value) {
  if (!value) return 'text';
  
  // Check for date patterns
  if (/^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}$/.test(value)) return 'date';
  
  // Check for numeric (including decimals)
  if (/^-?\d+\.?\d*$/.test(value) && !isNaN(parseFloat(value))) return 'numeric';
  
  return 'text';
}

// Upload File
function uploadFile() {
  fileInput?.click();
}

// Close Modal
function closeModal() {
  dataModal?.classList.remove('active');
}

// Toggle Section
function toggleSection(header) {
  header.classList.toggle('collapsed');
  const content = header.nextElementSibling;
  content.classList.toggle('expanded');
}

// Toggle Format Section
function toggleFormat(header) {
  header.classList.toggle('collapsed');
  const content = header.nextElementSibling;
  content.classList.toggle('expanded');
}

// Track field wells data - make it globally accessible
window.fieldWellsData = {
  xAxis: null,
  yAxis: null,
  legend: null,
  tooltips: null,
  filters: null
};

let autoVisualCreated = false;

// Drop to Field Well
function dropToWell(e, wellType) {
  e.preventDefault();
  
  // Try to get data from dataTransfer
  let field = e.dataTransfer.getData('field');
  let fieldType = e.dataTransfer.getData('type');
  
  // If dataTransfer is empty, try to get from the drag source element
  if (!field) {
    // Get the element being dragged (if available)
    const dragSource = document.querySelector('.field-item[style*="opacity: 0.5"]');
    if (dragSource) {
      field = dragSource.dataset.field;
      fieldType = dragSource.dataset.type;
      console.log('Got field from DOM element:', field, fieldType);
    }
  }
  
  console.log('Drop to well:', wellType, 'Field:', field, 'Type:', fieldType);
  
  if (field) {
    const dropzone = e.target.closest('.well-dropzone');
    if (!dropzone) return;
    
    // Clear drag-over class
    dropzone.classList.remove('drag-over');
    
    // Update the dropzone with the field
    dropzone.innerHTML = `<span class="well-field" style="color: #7C5CFF; font-weight: 600; padding: 4px 8px; background: rgba(124, 92, 255, 0.1); border-radius: 4px; display: inline-block;">${field}</span>`;
    showToast(`${field} added to ${wellType}`, 'success');
    
    // Track the field in our data structure
    const wellKey = wellType.replace('-', ''); // x-axis -> xAxis
    window.fieldWellsData[wellKey] = {
      name: field,
      type: fieldType || 'text'
    };
    
    // Also store directly on the dropzone for backup
    dropzone.dataset.fieldName = field;
    dropzone.dataset.fieldType = fieldType || 'text';
    
    console.log('Field wells data updated:', window.fieldWellsData);
    
    // Check if both X and Y axis have fields - auto create visualization
    if (window.fieldWellsData.xAxis && window.fieldWellsData.yAxis && !autoVisualCreated) {
      autoVisualCreated = true;
      console.log('Both fields present, creating auto chart...');
      setTimeout(() => {
        createAutoChart();
      }, 300);
    }
  } else {
    console.error('No field data received in drop event');
    showToast('Error: Could not get field data', 'error');
  }
}

// Create automatic chart when both X and Y axis have fields
function createAutoChart() {
  if (!currentData || currentData.tables.length === 0) {
    showToast('Please load data first', 'warning');
    return;
  }
  
  const xFieldData = window.fieldWellsData.xAxis;
  const yFieldData = window.fieldWellsData.yAxis;
  
  if (!xFieldData || !yFieldData) return;
  
  // Hide placeholder
  const placeholder = document.getElementById('canvasPlaceholder');
  if (placeholder) {
    placeholder.style.display = 'none';
  }
  
  // Use fields directly without swapping
  let xField = xFieldData.name;
  let yField = yFieldData.name;
  
  // Determine chart type based on field types
  let chartType = 'bar';
  if (yFieldData.type === 'numeric' || xFieldData.type === 'numeric') {
    if (xFieldData.type === 'date' || yFieldData.type === 'date') {
      chartType = 'line';
    } else {
      chartType = 'bar';
    }
  }
  
  // Create the visualization
  createVisualOnCanvas(chartType, xField, yField);
  
  showToast(`📊 Auto-generated ${chartType} chart: ${yField} by ${xField}`, 'success');
}

// Allow Drop
function allowDrop(e) {
  e.preventDefault();
  const dropzone = e.target.closest('.well-dropzone');
  if (dropzone) {
    dropzone.classList.add('drag-over');
    // Add visual feedback
    dropzone.style.borderColor = '#7C5CFF';
    dropzone.style.background = 'rgba(124, 92, 255, 0.05)';
  }
}

// Remove drag-over styling when leaving
function removeDragOver(e) {
  const dropzone = e.target.closest('.well-dropzone');
  if (dropzone) {
    dropzone.classList.remove('drag-over');
    dropzone.style.borderColor = '';
    dropzone.style.background = '';
  }
}

// Clear all field wells
function clearFieldWells() {
  window.fieldWellsData = {
    xAxis: null,
    yAxis: null,
    legend: null,
    tooltips: null,
    filters: null
  };
  autoVisualCreated = false;
  
  // Reset all dropzones
  document.querySelectorAll('.well-dropzone').forEach(zone => {
    zone.innerHTML = '<span class="well-hint">Add data fields here</span>';
    zone.classList.remove('drag-over');
    zone.style.borderColor = '';
    zone.style.background = '';
  });
  
  showToast('Field wells cleared', 'info');
}

// Generate chart directly from field wells
function generateChartFromWells() {
  console.log('Generate chart clicked, current data:', window.fieldWellsData);
  
  // Try to get fields from window.fieldWellsData first
  let xFieldData = window.fieldWellsData.xAxis;
  let yFieldData = window.fieldWellsData.yAxis;
  
  // If not found, try to get from dropzone datasets
  if (!xFieldData) {
    const xDropzone = document.getElementById('xAxisWell');
    if (xDropzone && xDropzone.dataset.fieldName) {
      xFieldData = {
        name: xDropzone.dataset.fieldName,
        type: xDropzone.dataset.fieldType || 'text'
      };
      console.log('Got X field from dropzone dataset:', xFieldData);
    }
  }
  
  if (!yFieldData) {
    const yDropzone = document.getElementById('yAxisWell');
    if (yDropzone && yDropzone.dataset.fieldName) {
      yFieldData = {
        name: yDropzone.dataset.fieldName,
        type: yDropzone.dataset.fieldType || 'text'
      };
      console.log('Got Y field from dropzone dataset:', yFieldData);
    }
  }
  
  if (!xFieldData || !yFieldData) {
    showToast('Please add fields to both X-axis and Y-axis first', 'warning');
    return;
  }
  
  // Use fields directly without swapping
  let xField = xFieldData.name;
  let yField = yFieldData.name;
  
  // Determine chart type
  let chartType = 'bar';
  if (yFieldData.type === 'numeric' || xFieldData.type === 'numeric') {
    if (xFieldData.type === 'date' || yFieldData.type === 'date') {
      chartType = 'line';
    } else {
      chartType = 'bar';
    }
  }
  
  // Hide placeholder
  const placeholder = document.getElementById('canvasPlaceholder');
  if (placeholder) {
    placeholder.style.display = 'none';
  }
  
  // Create the chart
  createVisualOnCanvas(chartType, xField, yField);
  
  showToast(`📊 ${chartType} chart created: ${yField} by ${xField}`, 'success');
}

// Update Zoom
function updateZoom() {
  canvas.style.transform = `scale(${zoomLevel / 100})`;
  canvas.style.transformOrigin = 'top left';
  document.getElementById('zoomLevel').textContent = zoomLevel + '%';
}

// Download Dashboard as Image
function downloadDashboard() {
  console.log('Download dashboard clicked');
  
  // Show download options modal
  const modalId = 'downloadModal';
  let modal = document.getElementById(modalId);
  
  if (!modal) {
    modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal';
    document.body.appendChild(modal);
  }
  
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 400px;">
      <div class="modal-header">
        <h3>📥 Download Dashboard</h3>
        <button class="modal-close" onclick="document.getElementById('${modalId}').classList.remove('active')">×</button>
      </div>
      <div class="modal-body">
        <div style="padding: 20px;">
          <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #fff;">Download Format</label>
            <div style="display: flex; justify-content: center;">
              <label style="display: flex; align-items: center; gap: 8px; padding: 12px; background: #1a1d21; border-radius: 6px; cursor: pointer; border: 2px solid #7C5CFF;">
                <input type="radio" name="downloadFormat" value="png" checked>
                <span style="color: #fff; font-weight: 500;">🖼️ PNG Image</span>
              </label>
            </div>
          </div>
          
          <div style="background: rgba(124, 92, 255, 0.1); padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            <h4 style="margin: 0 0 10px 0; color: #7C5CFF;">📊 Dashboard Summary</h4>
            <p style="margin: 0; font-size: 13px; color: #fff;">
              Visuals: <strong>${visuals.length}</strong> | 
              Pages: <strong>${currentPage}</strong>
            </p>
          </div>
          
          <button onclick="confirmDownloadDashboard()" style="width: 100%; padding: 12px; background: #7C5CFF; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px;">
            📥 Download Dashboard
          </button>
        </div>
      </div>
    </div>
  `;
  
  modal.classList.add('active');
  
  modal.onclick = (e) => {
    if (e.target === modal) modal.classList.remove('active');
  };
}

// Confirm Dashboard Download
function confirmDownloadDashboard() {
  console.log('Downloading dashboard as PNG');
  
  // Close modal
  document.getElementById('downloadModal')?.classList.remove('active');
  
  // Download as PNG image
  downloadCanvasAsImage();
}

// Download canvas as PNG image using html2canvas
async function downloadCanvasAsImage() {
  const canvasEl = document.getElementById('reportCanvas');
  if (!canvasEl) {
    showToast('Canvas not found', 'error');
    return;
  }
  
  try {
    showToast('📸 Capturing dashboard...', 'info');
    
    // Create a wrapper for capture with proper sizing
    const wrapper = document.createElement('div');
    const canvasRect = canvasEl.getBoundingClientRect();
    wrapper.style.cssText = `
      background: #0d1117;
      padding: 20px;
      font-family: "Segoe UI", Arial, sans-serif;
      width: ${canvasRect.width}px;
      min-height: ${canvasRect.height + 150}px;
      position: relative;
    `;
    
    // Add header
    const header = document.createElement('div');
    header.style.cssText = 'margin-bottom: 20px; color: #fff; padding: 10px;';
    header.innerHTML = `
      <h1 style="margin: 0 0 10px 0; font-size: 28px; font-weight: 600;">Nova BI Dashboard</h1>
      <p style="margin: 0 0 5px 0; font-size: 14px; color: #8b949e;">Generated: ${new Date().toLocaleString()}</p>
      <p style="margin: 0; font-size: 16px; color: #7C5CFF; font-weight: 600;">Visuals: ${visuals.length} | Page: ${currentPage}</p>
    `;
    
    // Create container for visuals with grid layout
    const visualsContainer = document.createElement('div');
    visualsContainer.style.cssText = `
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 20px;
      padding: 10px;
    `;
    
    // Clone each visual element individually and add to grid
    const visualElements = canvasEl.querySelectorAll('.visual-element');
    
    for (const visualEl of visualElements) {
      // Clone the visual
      const clone = visualEl.cloneNode(true);
      
      // Reset positioning styles
      clone.style.position = 'relative';
      clone.style.left = 'auto';
      clone.style.top = 'auto';
      clone.style.transform = 'none';
      clone.style.margin = '0';
      clone.style.width = '100%';
      clone.style.minWidth = '380px';
      clone.style.minHeight = '300px';
      
      // Hide action buttons in the clone
      const actionBtns = clone.querySelectorAll('.visual-actions, .download-btn, button');
      actionBtns.forEach(btn => btn.style.display = 'none');
      
      // Handle canvas elements - convert to images
      const origCanvas = visualEl.querySelector('canvas');
      const clonedCanvas = clone.querySelector('canvas');
      
      if (origCanvas && clonedCanvas) {
        try {
          const dataUrl = origCanvas.toDataURL('image/png');
          const img = document.createElement('img');
          img.src = dataUrl;
          img.style.width = '100%';
          img.style.height = '100%';
          img.style.objectFit = 'contain';
          clonedCanvas.parentNode.replaceChild(img, clonedCanvas);
        } catch (e) {
          console.log('Could not convert canvas to image:', e);
        }
      }
      
      visualsContainer.appendChild(clone);
    }
    
    wrapper.appendChild(header);
    wrapper.appendChild(visualsContainer);
    
    // Temporarily add to body (hidden but rendered)
    wrapper.style.position = 'absolute';
    wrapper.style.left = '-9999px';
    wrapper.style.top = '0';
    document.body.appendChild(wrapper);
    
    // Wait for images to load
    const images = wrapper.querySelectorAll('img');
    await Promise.all(Array.from(images).map(img => {
      return new Promise((resolve) => {
        if (img.complete) resolve();
        img.onload = resolve;
        img.onerror = resolve;
      });
    }));
    
    // Use html2canvas to capture
    const canvas = await html2canvas(wrapper, {
      backgroundColor: '#0d1117',
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      windowWidth: wrapper.scrollWidth,
      windowHeight: wrapper.scrollHeight
    });
    
    // Download
    const link = document.createElement('a');
    link.download = `dashboard_${new Date().toISOString().slice(0, 10)}.png`;
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Cleanup
    document.body.removeChild(wrapper);
    
    showToast('🖼️ Dashboard downloaded!', 'success');
  } catch (error) {
    console.error('Download error:', error);
    showToast('Error: ' + error.message, 'error');
  }
}

// Download dashboard as JSON
function downloadDashboardAsJSON() {
  const dashboardData = {
    metadata: {
      name: 'Nova BI Dashboard',
      created: new Date().toISOString(),
      version: '1.0'
    },
    visuals: visuals.map(v => ({
      id: v.id,
      type: v.type,
      data: v.data,
      field: v.field
    })),
    data: {
      tables: currentData?.tables || [],
      fieldWells: window.fieldWellsData
    },
    page: currentPage
  };
  
  const jsonStr = JSON.stringify(dashboardData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `dashboard_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  
  showToast('📄 Dashboard JSON downloaded!', 'success');
}

// Save Report
function saveReport() {
  console.log('Save report clicked');
  
  // Prepare report data
  const reportData = {
    tables: currentData?.tables || [],
    visuals: visuals.map(v => ({
      id: v.id,
      type: v.type,
      data: v.data
    })),
    fieldWells: window.fieldWellsData,
    savedAt: new Date().toISOString()
  };
  
  // Convert to JSON
  const jsonData = JSON.stringify(reportData, null, 2);
  
  // Create a blob and download
  const blob = new Blob([jsonData], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `report_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  showToast('💾 Report saved successfully!', 'success');
}

// Publish Report
function publishReport() {
  console.log('Publish report clicked');
  
  // Show publish dialog
  const modalId = 'publishModal';
  let modal = document.getElementById(modalId);
  
  if (!modal) {
    modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal';
    document.body.appendChild(modal);
  }
  
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 500px;">
      <div class="modal-header">
        <h3>📤 Publish Report</h3>
        <button class="modal-close" onclick="document.getElementById('${modalId}').classList.remove('active')">×</button>
      </div>
      <div class="modal-body">
        <div style="padding: 20px;">
          <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 600;">Report Name</label>
            <input type="text" id="publishReportName" value="My BI Report" style="width: 100%; padding: 10px; border: 1px solid #dee2e6; border-radius: 6px; font-size: 14px;">
          </div>
          
          <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #fff;">Publish To</label>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
              <label style="display: flex; align-items: center; gap: 8px; padding: 12px; background: #1a1d21; border-radius: 6px; cursor: pointer; border: 2px solid #7C5CFF;">
                <input type="radio" name="publishTarget" value="workspace" checked>
                <span style="color: #fff; font-weight: 500;">🏢 Workspace</span>
              </label>
              <label style="display: flex; align-items: center; gap: 8px; padding: 12px; background: #1a1d21; border-radius: 6px; cursor: pointer; border: 2px solid transparent;">
                <input type="radio" name="publishTarget" value="web">
                <span style="color: #fff; font-weight: 500;">🌐 Web</span>
              </label>
            </div>
          </div>
          
          <div style="background: #e8f4f8; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            <h4 style="margin: 0 0 10px 0; color: #0d7377;">📊 Report Summary</h4>
            <p style="margin: 0; font-size: 13px; color: #495057;">
              Tables: <strong>${currentData?.tables?.length || 0}</strong> | 
              Visuals: <strong>${visuals.length}</strong> | 
              Data Rows: <strong>${currentData?.tables?.reduce((sum, t) => sum + (t.totalRows || 0), 0) || 0}</strong>
            </p>
          </div>
          
          <button onclick="confirmPublish()" style="width: 100%; padding: 12px; background: #7C5CFF; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px;">
            📤 Publish Report
          </button>
        </div>
      </div>
    </div>
  `;
  
  modal.classList.add('active');
  
  modal.onclick = (e) => {
    if (e.target === modal) modal.classList.remove('active');
  };
}

// Confirm Publish
function confirmPublish() {
  const reportName = document.getElementById('publishReportName')?.value || 'Untitled Report';
  const target = document.querySelector('input[name="publishTarget"]:checked')?.value || 'workspace';
  
  console.log('Publishing report:', reportName, 'to', target);
  
  // Close modal
  document.getElementById('publishModal')?.classList.remove('active');
  
  // Show success message
  showToast(`📤 Report "${reportName}" published successfully!`, 'success');
  
  // Simulate publish delay and show second confirmation
  setTimeout(() => {
    showToast(`✅ Report is now live on ${target === 'web' ? 'Web' : 'Workspace'}!`, 'success');
  }, 1500);
}

// Update Page Indicator
function updatePageIndicator() {
  document.querySelector('.page-indicator').textContent = `Page ${currentPage} of 2`;
}

// Update Status
function updateStatus() {
  if (currentData) {
    const tableCount = currentData.tables.length;
    const fieldCount = currentData.tables.reduce((sum, t) => sum + t.fields.length, 0);
    document.getElementById('dataStatus').textContent = `${tableCount} tables, ${fieldCount} fields`;
  }
}

// Show Toast
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  
  toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// Search Fields
document.getElementById('fieldSearch')?.addEventListener('input', (e) => {
  const search = e.target.value.toLowerCase();
  document.querySelectorAll('.field-item').forEach(item => {
    const text = item.textContent.toLowerCase();
    item.style.display = text.includes(search) ? 'flex' : 'none';
  });
});

// Relationship Management Functions
let selectedTableForRelation = null;
let relationshipMode = false;

// Toggle relationship creation mode
function toggleRelationshipMode() {
  relationshipMode = !relationshipMode;
  selectedTableForRelation = null;
  
  if (relationshipMode) {
    showToast('Relationship Mode: Click first table to start', 'info');
    document.body.classList.add('relationship-mode');
  } else {
    showToast('Relationship Mode: Off', 'info');
    document.body.classList.remove('relationship-mode');
  }
}

// Add relationship between two tables
function addRelationship(fromTable, toTable, fromField, toField, type, fromFieldsArr, toFieldsArr) {
  if (!currentData.relationships) {
    currentData.relationships = [];
  }
  
  const relationship = {
    id: 'rel-' + Date.now(),
    fromTable: fromTable,
    toTable: toTable,
    fromField: fromField,
    toField: toField,
    fromFields: fromFieldsArr || [fromField],
    toFields: toFieldsArr || [toField],
    type: type,
    active: true
  };
  
  currentData.relationships.push(relationship);
  showToast(`Relationship created: ${fromTable} ${getRelationSymbol(type)} ${toTable}`, 'success');
  
  // Redraw model view to show new relationship
  if (document.getElementById('model-view-diagram')) {
    drawRelationshipLines();
  }
  
  return relationship;
}

// Get relationship symbol for display
function getRelationSymbol(type) {
  const symbols = {
    'one-to-one': '1—1',
    'one-to-many': '1—∞',
    'many-to-one': '∞—1',
    'many-to-many': '∞—∞'
  };
  return symbols[type] || '—';
}

// Get relationship description
function getRelationDescription(type) {
  const descriptions = {
    'one-to-one': 'One to One',
    'one-to-many': 'One to Many',
    'many-to-one': 'Many to One',
    'many-to-many': 'Many to Many'
  };
  return descriptions[type] || type;
}

// Get a distinct color for each relationship type (so a type change is visible)
function getRelationColor(type) {
  const colors = {
    'one-to-one': '#3DDC97',
    'one-to-many': '#7C5CFF',
    'many-to-one': '#35D2FF',
    'many-to-many': '#FFB347'
  };
  return colors[type] || '#7C5CFF';
}

// Lighten a #rrggbb color toward white by amount (0..1)
function lightenColor(hex, amount = 0.28) {
  const c = hex.replace('#', '');
  if (c.length < 6) return hex;
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return `rgb(${lr}, ${lg}, ${lb})`;
}

// Convert #rrggbb to rgba(...) with the given alpha
function hexToRgba(hex, alpha = 0.15) {
  const c = hex.replace('#', '');
  if (c.length < 6) return hex;
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Render the four color-coded relationship-type option boxes
function relationTypeOptionsHtml(groupName, selectedType) {
  const types = ['one-to-one', 'one-to-many', 'many-to-one', 'many-to-many'];
  const labels = {
    'one-to-one': 'One to One (1—1)',
    'one-to-many': 'One to Many (1—∞)',
    'many-to-one': 'Many to One (∞—1)',
    'many-to-many': 'Many to Many (∞—∞)'
  };
  const boxes = types.map(t => {
    const c = getRelationColor(t);
    return `<label class="rel-type-option" style="--rc:${c}; --rc-soft:${hexToRgba(c, 0.15)};">
      <input type="radio" name="${groupName}" value="${t}" ${t === selectedType ? 'checked' : ''}>
      <span class="rel-type-dot" style="background:${c};"></span>
      <span>${labels[t]}</span>
    </label>`;
  }).join('');
  return `<div class="rel-type-grid">${boxes}</div>`;
}

// Draw relationship lines on model view
function drawRelationshipLines() {
  // Remove existing lines
  document.querySelectorAll('.relationship-line-container').forEach(line => line.remove());
  document.querySelectorAll('.relationship-label').forEach(label => label.remove());
  
  if (!currentData.relationships || currentData.relationships.length === 0) return;
  
  const container = document.getElementById('model-view-diagram');
  if (!container) return;

  const svgNS = 'http://www.w3.org/2000/svg';

  currentData.relationships.forEach(rel => {
    if (!rel.active) return;

    const fromCard = document.getElementById(`model-card-${getTableIndex(rel.fromTable)}`);
    const toCard = document.getElementById(`model-card-${getTableIndex(rel.toTable)}`);

    if (!fromCard || !toCard) return;

    const color = getRelationColor(rel.type);
    const hoverColor = lightenColor(color);

    const fromRect = fromCard.getBoundingClientRect();
    const toRect = toCard.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    // Calculate center points relative to container
    const x1 = fromRect.left + fromRect.width / 2 - containerRect.left;
    const y1 = fromRect.top + fromRect.height / 2 - containerRect.top;
    const x2 = toRect.left + toRect.width / 2 - containerRect.left;
    const y2 = toRect.top + toRect.height / 2 - containerRect.top;

    // Line holder (does NOT capture full-area clicks — only the line/label are clickable)
    const lineContainer = document.createElement('div');
    lineContainer.className = 'relationship-line-container';
    lineContainer.dataset.relId = rel.id;
    lineContainer.style.cssText = `
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 48;
    `;
    lineContainer.title = `${rel.fromTable} → ${rel.toTable} (${getRelationDescription(rel.type)})`;

    // SVG canvas for this relationship
    const svg = document.createElementNS(svgNS, 'svg');
    svg.classList.add('relationship-line');
    svg.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      overflow: visible;
    `;

    // Type-colored arrowhead (unique id per relationship)
    const markerId = 'arrowhead-' + rel.id;
    const defs = document.createElementNS(svgNS, 'defs');
    const marker = document.createElementNS(svgNS, 'marker');
    marker.setAttribute('id', markerId);
    marker.setAttribute('markerWidth', '10');
    marker.setAttribute('markerHeight', '10');
    marker.setAttribute('refX', '8');
    marker.setAttribute('refY', '5');
    marker.setAttribute('orient', 'auto');
    const markerPath = document.createElementNS(svgNS, 'path');
    markerPath.setAttribute('d', 'M0,0 L10,5 L0,10 Z');
    markerPath.setAttribute('fill', color);
    marker.appendChild(markerPath);
    defs.appendChild(marker);
    svg.appendChild(defs);

    // Invisible wide hit-line: the ONLY clickable part of the line
    const hitLine = document.createElementNS(svgNS, 'line');
    hitLine.setAttribute('x1', x1);
    hitLine.setAttribute('y1', y1);
    hitLine.setAttribute('x2', x2);
    hitLine.setAttribute('y2', y2);
    hitLine.setAttribute('stroke', 'transparent');
    hitLine.setAttribute('stroke-width', '16');
    hitLine.setAttribute('stroke-linecap', 'round');
    hitLine.style.cssText = 'pointer-events: stroke; cursor: pointer;';

    // Visible, type-colored line
    const path = document.createElementNS(svgNS, 'line');
    path.setAttribute('x1', x1);
    path.setAttribute('y1', y1);
    path.setAttribute('x2', x2);
    path.setAttribute('y2', y2);
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', '3');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('marker-end', `url(#${markerId})`);
    path.style.cssText = 'pointer-events: none;';

    hitLine.onmouseenter = () => {
      path.setAttribute('stroke', hoverColor);
      path.setAttribute('stroke-width', '5');
    };
    hitLine.onmouseleave = () => {
      path.setAttribute('stroke', color);
      path.setAttribute('stroke-width', '3');
    };
    hitLine.onclick = (e) => {
      e.stopPropagation();
      showRelationshipDetails(rel.id);
    };

    svg.appendChild(hitLine);
    svg.appendChild(path);
    lineContainer.appendChild(svg);
    container.appendChild(lineContainer);

    // Add relationship label (type-colored pill showing the symbol)
    const label = document.createElement('div');
    label.className = 'relationship-label';
    label.innerHTML = getRelationSymbol(rel.type);
    label.title = `${getRelationDescription(rel.type)}\n${rel.fromTable}.${rel.fromField} → ${rel.toTable}.${rel.toField}`;
    label.style.cssText = `
      position: absolute;
      left: ${(x1 + x2) / 2 - 24}px;
      top: ${(y1 + y2) / 2 - 14}px;
      background: ${color};
      color: white;
      padding: 6px 12px;
      border-radius: 16px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      z-index: 52;
      box-shadow: 0 3px 10px rgba(0,0,0,0.35);
      transition: all 0.2s ease;
      user-select: none;
    `;
    label.onmouseenter = () => {
      label.style.transform = 'scale(1.1)';
      label.style.background = hoverColor;
    };
    label.onmouseleave = () => {
      label.style.transform = 'scale(1)';
      label.style.background = color;
    };
    label.onclick = (e) => {
      e.stopPropagation();
      showRelationshipDetails(rel.id);
    };
    container.appendChild(label);
  });
}

// Get table index by name
function getTableIndex(tableName) {
  return currentData.tables.findIndex(t => t.name === tableName);
}

// Show relationship details modal
function showRelationshipDetails(relId) {
  const rel = currentData.relationships.find(r => r.id === relId);
  if (!rel) return;
  
  const modalId = 'relationshipModal';
  let modal = document.getElementById(modalId);
  
  if (!modal) {
    modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal';
    document.body.appendChild(modal);
  }
  
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 500px;">
      <div class="modal-header">
        <h3>🔗 Relationship Details</h3>
        <button class="modal-close" onclick="document.getElementById('${modalId}').classList.remove('active')">×</button>
      </div>
      <div class="modal-body">
        <div style="padding: 20px;">
          <div style="display: flex; align-items: center; justify-content: center; gap: 20px; margin-bottom: 30px;">
            <div style="text-align: center; padding: 15px; background: #f8f9fa; border-radius: 8px;">
              <div style="font-size: 24px; margin-bottom: 5px;">📊</div>
              <div style="font-weight: 600;">${rel.fromTable}</div>
              <div style="font-size: 12px; color: #6c757d;">${rel.fromField}</div>
            </div>
            <div style="font-size: 24px; font-weight: 700; color: #7C5CFF;">
              ${getRelationSymbol(rel.type)}
            </div>
            <div style="text-align: center; padding: 15px; background: #f8f9fa; border-radius: 8px;">
              <div style="font-size: 24px; margin-bottom: 5px;">📊</div>
              <div style="font-weight: 600;">${rel.toTable}</div>
              <div style="font-size: 12px; color: #6c757d;">${rel.toField}</div>
            </div>
          </div>
          
          <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            <h4 style="margin: 0 0 10px 0; color: #495057;">Relationship Type</h4>
            <p style="margin: 0; font-size: 16px; font-weight: 600; color: #7C5CFF;">${getRelationDescription(rel.type)}</p>
            <p style="margin: 10px 0 0 0; font-size: 13px; color: #6c757d;">
              ${getRelationExplanation(rel.type)}
            </p>
          </div>
          
          <div style="display: flex; gap: 10px;">
            <button onclick="editRelationship('${rel.id}')" style="flex: 1; padding: 10px; background: #0d7377; color: white; border: none; border-radius: 6px; cursor: pointer;">
              ✏️ Edit
            </button>
            <button onclick="deleteRelationship('${rel.id}')" style="flex: 1; padding: 10px; background: #dc3545; color: white; border: none; border-radius: 6px; cursor: pointer;">
              🗑️ Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
  
  modal.classList.add('active');
  
  modal.onclick = (e) => {
    if (e.target === modal) modal.classList.remove('active');
  };
}

// Get explanation for relationship type
function getRelationExplanation(type) {
  const explanations = {
    'one-to-one': 'Each record in the first table relates to exactly one record in the second table.',
    'one-to-many': 'Each record in the first table can relate to multiple records in the second table.',
    'many-to-one': 'Multiple records in the first table can relate to a single record in the second table.',
    'many-to-many': 'Multiple records in the first table can relate to multiple records in the second table.'
  };
  return explanations[type] || '';
}

// Delete relationship
function deleteRelationship(relId) {
  currentData.relationships = currentData.relationships.filter(r => r.id !== relId);
  document.getElementById('relationshipModal')?.classList.remove('active');
  showToast('Relationship deleted', 'success');
  drawRelationshipLines();
}

// Edit relationship (show edit form)
function editRelationship(relId) {
  const rel = currentData.relationships.find(r => r.id === relId);
  if (!rel) return;
  
  const types = ['one-to-one', 'one-to-many', 'many-to-one', 'many-to-many'];
  
  const modal = document.getElementById('relationshipModal');
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 400px;">
      <div class="modal-header">
        <h3>✏️ Edit Relationship</h3>
        <button class="modal-close" onclick="document.getElementById('relationshipModal').classList.remove('active')">×</button>
      </div>
      <div class="modal-body">
        <div style="padding: 20px;">
          <p style="margin-bottom: 15px;"><strong>${rel.fromTable}.${rel.fromField}</strong> → <strong>${rel.toTable}.${rel.toField}</strong></p>
          
          <label style="display: block; margin-bottom: 10px; font-weight: 600;">Relationship Type:</label>
          <div style="margin-bottom: 20px;">${relationTypeOptionsHtml('editRelType', rel.type)}</div>
          
          <button onclick="saveRelationshipEdit('${rel.id}')" style="width: 100%; padding: 12px; background: #28a745; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
            💾 Save Changes
          </button>
        </div>
      </div>
    </div>
  `;
}

// Save relationship edit
function saveRelationshipEdit(relId) {
  const rel = currentData.relationships.find(r => r.id === relId);
  const sel = document.querySelector('input[name="editRelType"]:checked');
  if (rel && sel) {
    rel.type = sel.value;
    showToast('Relationship updated', 'success');
    document.getElementById('relationshipModal').classList.remove('active');
    drawRelationshipLines();
  }
}

// Show relationship creation dialog with multiple field selection
function showCreateRelationshipDialog(fromTableIndex, toTableIndex) {
  const fromTable = currentData.tables[fromTableIndex];
  const toTable = currentData.tables[toTableIndex];
  
  const modalId = 'createRelModal';
  let modal = document.getElementById(modalId);
  
  if (!modal) {
    modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal';
    document.body.appendChild(modal);
  }
  
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 600px; max-height: 85vh; overflow-y: auto;">
      <div class="modal-header">
        <h3>🔗 Create Relationship</h3>
        <button class="modal-close" onclick="document.getElementById('${modalId}').classList.remove('active')">×</button>
      </div>
      <div class="modal-body">
        <div style="padding: 20px;">
          <div style="display: flex; gap: 15px; margin-bottom: 20px;">
            <div style="flex: 1;">
              <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #495057;">From Table</label>
              <select id="relFromTable" style="width: 100%; padding: 8px; border: 1px solid #dee2e6; border-radius: 6px;" onchange="updateFieldCheckboxes('from')">
                ${currentData.tables.map((t, i) => `<option value="${i}" ${i === fromTableIndex ? 'selected' : ''}>${t.name}</option>`).join('')}
              </select>
            </div>
            <div style="flex: 1;">
              <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #495057;">To Table</label>
              <select id="relToTable" style="width: 100%; padding: 8px; border: 1px solid #dee2e6; border-radius: 6px;" onchange="updateFieldCheckboxes('to')">
                ${currentData.tables.map((t, i) => `<option value="${i}" ${i === toTableIndex ? 'selected' : ''}>${t.name}</option>`).join('')}
              </select>
            </div>
          </div>
          
          <div style="display: flex; gap: 15px; margin-bottom: 20px;">
            <div style="flex: 1;">
              <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #495057;">
                From Fields <span style="font-size: 12px; color: #6c757d; font-weight: 400;">(Select one or more)</span>
              </label>
              <div id="relFromFields" style="max-height: 180px; overflow-y: auto; border: 1px solid #dee2e6; border-radius: 6px; padding: 10px; background: #f8f9fa;">
                ${fromTable.fields.map((f, i) => `
                  <label style="display: flex; align-items: center; gap: 8px; padding: 6px; cursor: pointer; border-radius: 4px; transition: background 0.2s; color: #212529;" onmouseenter="this.style.background='#e9ecef'" onmouseleave="this.style.background='transparent'">
                    <input type="checkbox" name="fromField" value="${f.name}" ${i === 0 ? 'checked' : ''}>
                    <span style="font-size: 13px; color: #212529; font-weight: 500;">${f.name}</span>
                    <span style="font-size: 11px; color: #6c757d; margin-left: auto; font-weight: 600;">${f.type === 'numeric' ? '123' : (f.type === 'date' ? '📅' : 'ABC')}</span>
                  </label>
                `).join('')}
              </div>
            </div>
            <div style="flex: 1;">
              <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #495057;">
                To Fields <span style="font-size: 12px; color: #6c757d; font-weight: 400;">(Select one or more)</span>
              </label>
              <div id="relToFields" style="max-height: 180px; overflow-y: auto; border: 1px solid #dee2e6; border-radius: 6px; padding: 10px; background: #f8f9fa;">
                ${toTable.fields.map((f, i) => `
                  <label style="display: flex; align-items: center; gap: 8px; padding: 6px; cursor: pointer; border-radius: 4px; transition: background 0.2s; color: #212529;" onmouseenter="this.style.background='#e9ecef'" onmouseleave="this.style.background='transparent'">
                    <input type="checkbox" name="toField" value="${f.name}" ${i === 0 ? 'checked' : ''}>
                    <span style="font-size: 13px; color: #212529; font-weight: 500;">${f.name}</span>
                    <span style="font-size: 11px; color: #6c757d; margin-left: auto; font-weight: 600;">${f.type === 'numeric' ? '123' : (f.type === 'date' ? '📅' : 'ABC')}</span>
                  </label>
                `).join('')}
              </div>
            </div>
          </div>
          
          <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 10px; font-weight: 600; color: #495057;">Relationship Type</label>
            ${relationTypeOptionsHtml('relType', 'one-to-one')}
          </div>
          
          <button onclick="createRelationshipFromDialog()" style="width: 100%; padding: 12px; background: #7C5CFF; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px;">
            ➕ Create Relationship
          </button>
        </div>
      </div>
    </div>
  `;
  
  modal.classList.add('active');
  
  modal.onclick = (e) => {
    if (e.target === modal) modal.classList.remove('active');
  };
}

// Update field checkboxes when table changes
function updateFieldCheckboxes(which) {
  const tableIndex = document.getElementById(`rel${which.charAt(0).toUpperCase() + which.slice(1)}Table`).value;
  const table = currentData.tables[tableIndex];
  const container = document.getElementById(`rel${which.charAt(0).toUpperCase() + which.slice(1)}Fields`);
  
  container.innerHTML = table.fields.map((f, i) => `
    <label style="display: flex; align-items: center; gap: 8px; padding: 6px; cursor: pointer; border-radius: 4px; transition: background 0.2s; color: #212529;" onmouseenter="this.style.background='#e9ecef'" onmouseleave="this.style.background='transparent'">
      <input type="checkbox" name="${which}Field" value="${f.name}" ${i === 0 ? 'checked' : ''}>
      <span style="font-size: 13px; color: #212529; font-weight: 500;">${f.name}</span>
      <span style="font-size: 11px; color: #6c757d; margin-left: auto; font-weight: 600;">${f.type === 'numeric' ? '123' : (f.type === 'date' ? '📅' : 'ABC')}</span>
    </label>
  `).join('');
}

// Create relationship from dialog with multiple fields
function createRelationshipFromDialog() {
  const fromTableIndex = document.getElementById('relFromTable').value;
  const toTableIndex = document.getElementById('relToTable').value;
  const type = document.querySelector('input[name="relType"]:checked').value;
  
  // Get all selected fields
  const fromFields = Array.from(document.querySelectorAll('input[name="fromField"]:checked')).map(cb => cb.value);
  const toFields = Array.from(document.querySelectorAll('input[name="toField"]:checked')).map(cb => cb.value);
  
  if (fromFields.length === 0 || toFields.length === 0) {
    showToast('Please select at least one field from each table', 'error');
    return;
  }
  
  const fromTable = currentData.tables[fromTableIndex].name;
  const toTable = currentData.tables[toTableIndex].name;
  
  // Join multiple fields with comma for display
  const fromFieldStr = fromFields.join(', ');
  const toFieldStr = toFields.join(', ');
  
  addRelationship(fromTable, toTable, fromFieldStr, toFieldStr, type, fromFields, toFields);
  document.getElementById('createRelModal').classList.remove('active');
}

// Export functions for global access
window.removeVisual = removeVisual;
window.configureVisual = configureVisual;
window.toggleSection = toggleSection;
window.toggleFormat = toggleFormat;
window.dropToWell = dropToWell;
window.allowDrop = allowDrop;
window.closeModal = closeModal;
window.uploadFile = uploadFile;
window.showTablePreview = showTablePreview;
window.showLargeTablePreviewOnCanvas = showLargeTablePreviewOnCanvas;
window.toggleModelCard = toggleModelCard;
window.showModelViewOnCanvas = showModelViewOnCanvas;
window.hideModelViewFromCanvas = hideModelViewFromCanvas;
window.toggleRelationshipMode = toggleRelationshipMode;
window.addRelationship = addRelationship;
window.deleteRelationship = deleteRelationship;
window.editRelationship = editRelationship;
window.saveRelationshipEdit = saveRelationshipEdit;
window.showCreateRelationshipDialog = showCreateRelationshipDialog;
window.showRelationshipDetails = showRelationshipDetails;
window.updateFieldCheckboxes = updateFieldCheckboxes;
window.createRelationshipFromDialog = createRelationshipFromDialog;
window.clearFieldWells = clearFieldWells;
window.generateChartFromWells = generateChartFromWells;
window.removeDragOver = removeDragOver;
window.downloadDashboard = downloadDashboard;
window.confirmDownloadDashboard = confirmDownloadDashboard;
window.downloadCanvasAsImage = downloadCanvasAsImage;
window.downloadDashboardAsJSON = downloadDashboardAsJSON;
window.saveReport = saveReport;
window.publishReport = publishReport;
window.confirmPublish = confirmPublish;
