const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const trainBtn = document.getElementById("trainBtn");
const targetInput = document.getElementById("targetInput");
const statusEl = document.getElementById("status");
const fileMetaEl = document.getElementById("fileMeta");
const resultsCard = document.getElementById("resultsCard");
const resultsEl = document.getElementById("results");
const dashboardCard = document.getElementById("dashboardCard");
const dashboardEl = document.getElementById("dashboard");

const runIdInput = document.getElementById("runIdInput");
const fetchRunBtn = document.getElementById("fetchRunBtn");
const fetchLogsBtn = document.getElementById("fetchLogsBtn");
const rerunBtn = document.getElementById("rerunBtn");
const runDebugStatus = document.getElementById("runDebugStatus");
const runDebugOut = document.getElementById("runDebugOut");

const downloadSection = document.getElementById("downloadSection");
const downloadBtn = document.getElementById("downloadBtn");

const API_BASE = window.location.port === "5500" ? "http://127.0.0.1:5000" : "";
function apiUrl(path) {
  return `${API_BASE}${path}`;
}

const analyzerFileInput = document.getElementById("analyzerFileInput");
const analyzeBtn = document.getElementById("analyzeBtn");
const analyzerChooseBtn = document.getElementById("analyzerChooseBtn");
const analyzerFileMeta = document.getElementById("analyzerFileMeta");
const analyzerStatus = document.getElementById("analyzerStatus");
const analyzerResults = document.getElementById("analyzerResults");

let analyzerSelectedFile = null;
let currentCleanedFileInfo = null; // Store cleaned file info for persistent download link

function setStatus(msg, kind = "info") {
  statusEl.textContent = msg || "";
  statusEl.style.color = kind === "error" ? "rgba(255, 92, 124, 0.95)" : "rgba(255, 255, 255, 0.70)";
}

function setRunDebugStatus(msg, kind = "info") {
  runDebugStatus.textContent = msg || "";
  runDebugStatus.style.color = kind === "error" ? "rgba(255, 92, 124, 0.95)" : "rgba(255, 255, 255, 0.70)";
}

function renderKV(container, blocks) {
  container.innerHTML = "";
  for (const [k, v] of blocks) {
    const div = document.createElement("div");
    div.className = "kv";
    div.innerHTML = `<div class="k">${k}</div><div class="v"></div>`;
    const vEl = div.querySelector(".v");
    if (typeof v === "string" && v.trim().startsWith("{")) {
      const pre = document.createElement("pre");
      pre.textContent = v;
      vEl.appendChild(pre);
    } else if (typeof v === "string" && v.includes("\n")) {
      const pre = document.createElement("pre");
      pre.textContent = v;
      vEl.appendChild(pre);
    } else {
      vEl.textContent = String(v);
    }
    container.appendChild(div);
  }
}

function renderDashboard(container, data) {
  container.innerHTML = "";
  const task = data.task || "classification";
  const leaderboard = data.leaderboard || [];

  if (!leaderboard.length) {
    container.innerHTML = "<p>No model data available</p>";
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "dashboard-wrapper";

  const title = document.createElement("h3");
  title.textContent = `Task: ${task} | Target: ${data.target || "-"} | Best: ${data.best_model_name || "-"}`;
  wrapper.appendChild(title);

  const table = document.createElement("table");
  table.className = "dashboard-table";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  
  // Dynamic headers based on task
  const isClassification = task === "classification";
  const headers = isClassification 
    ? ["Model", "Accuracy", "F1 Macro", "ROC AUC", "Confidence", "Fit Time (s)"]
    : ["Model", "RMSE", "MAE", "R²", "Confidence", "Fit Time (s)"];
    
  headers.forEach(h => {
    const th = document.createElement("th");
    th.textContent = h;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  leaderboard.forEach(row => {
    const tr = document.createElement("tr");
    const metrics = row.metrics || {};
    const isBest = row.name === data.best_model_name;
    const hasError = row.error !== undefined;

    const tdName = document.createElement("td");
    tdName.textContent = row.name + (isBest ? " ★" : "");
    tdName.style.fontWeight = "600";
    if (isBest) tdName.style.color = "var(--ok)";
    if (hasError) tdName.style.color = "var(--danger)";
    tr.appendChild(tdName);

    if (hasError) {
      // Fill remaining cells with error indicator
      for (let i = 1; i < headers.length; i++) {
        const td = document.createElement("td");
        td.textContent = i === headers.length - 1 ? (row.fit_seconds?.toFixed(2) || "0.00") : "Error";
        td.style.color = "var(--danger)";
        td.style.fontSize = "11px";
        tr.appendChild(td);
      }
    } else if (isClassification) {
      const tdAcc = document.createElement("td");
      tdAcc.textContent = metrics.accuracy !== undefined ? metrics.accuracy.toFixed(4) : "-";
      if (isBest) tdAcc.className = "best";
      tr.appendChild(tdAcc);

      const tdF1 = document.createElement("td");
      tdF1.textContent = metrics.f1_macro !== undefined ? metrics.f1_macro.toFixed(4) : "-";
      if (isBest) tdF1.className = "best";
      tr.appendChild(tdF1);

      const tdAuc = document.createElement("td");
      tdAuc.textContent = metrics.roc_auc !== undefined ? metrics.roc_auc.toFixed(4) : "-";
      if (isBest) tdAuc.className = "best";
      tr.appendChild(tdAuc);

      const tdConf = document.createElement("td");
      const confScore = row.confidence_score !== undefined ? row.confidence_score : "-";
      tdConf.textContent = confScore !== "-" ? confScore + "%" : "-";
      if (isBest) tdConf.className = "best";
      tr.appendChild(tdConf);
    } else {
      const tdRmse = document.createElement("td");
      tdRmse.textContent = metrics.rmse !== undefined ? metrics.rmse.toFixed(4) : "-";
      if (isBest) tdRmse.className = "best";
      tr.appendChild(tdRmse);

      const tdMae = document.createElement("td");
      tdMae.textContent = metrics.mae !== undefined ? metrics.mae.toFixed(4) : "-";
      if (isBest) tdMae.className = "best";
      tr.appendChild(tdMae);

      const tdR2 = document.createElement("td");
      tdR2.textContent = metrics.r2 !== undefined ? metrics.r2.toFixed(4) : "-";
      if (isBest) tdR2.className = "best";
      tr.appendChild(tdR2);

      const tdConf = document.createElement("td");
      const confScore = row.confidence_score !== undefined ? row.confidence_score : "-";
      tdConf.textContent = confScore !== "-" ? confScore + "%" : "-";
      if (isBest) tdConf.className = "best";
      tr.appendChild(tdConf);
    }

    const tdFit = document.createElement("td");
    tdFit.textContent = row.fit_seconds !== undefined ? row.fit_seconds.toFixed(2) : "-";
    tr.appendChild(tdFit);

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrapper.appendChild(table);

  container.appendChild(wrapper);
}

async function loadDashboard(runId) {
  dashboardCard.hidden = false;
  dashboardEl.innerHTML = "<p>Loading model comparison...</p>";
  try {
    const data = await fetchJson(`/api/models/${encodeURIComponent(runId)}/leaderboard`);
    renderDashboard(dashboardEl, data);
  } catch (e) {
    dashboardEl.innerHTML = `<p style="color:var(--danger)">Failed to load dashboard: ${e.message}</p>`;
    console.error("Dashboard load error:", e);
  }
}

function prettyBytes(bytes) {
  if (!Number.isFinite(bytes)) return "";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function setSelectedFile(file) {
  selectedFile = file;
  if (!file) {
    fileMetaEl.hidden = true;
    trainBtn.disabled = true;
    return;
  }
  fileMetaEl.hidden = false;
  fileMetaEl.textContent = `Selected: ${file.name} (${prettyBytes(file.size)})`;
  trainBtn.disabled = false;
  resultsCard.hidden = true;
  resultsEl.innerHTML = "";
  dashboardCard.hidden = true;
  dashboardEl.innerHTML = "";
  downloadSection.hidden = true;
  currentRunId = null;
  setStatus("Ready. Click Run AutoML.");
}

dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") fileInput.click();
});

fileInput.addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  setSelectedFile(file || null);
});

dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dragover");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("dragover");
});

dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  setSelectedFile(file || null);
});

trainBtn.addEventListener("click", async () => {
  if (!selectedFile) return;

  trainBtn.disabled = true;
  setStatus("Uploading & training… this may take a bit.");

  const fd = new FormData();
  fd.append("file", selectedFile);
  const target = targetInput.value.trim();
  if (target) fd.append("target", target);

  try {
    const data = await fetchJson("/api/upload", { method: "POST", body: fd });

    resultsCard.hidden = false;
    resultsEl.innerHTML = "";

    const blocks = [
      ["Run ID", data.run_id],
      ["Task", data.task],
      ["Target", data.target],
      ["Best model", data.best_model_name],
      ["Metrics", JSON.stringify(data.metrics, null, 2)],
      ["Features", (data.features || []).slice(0, 80).join(", ") + ((data.features || []).length > 80 ? " …" : "")],
    ];

    renderKV(resultsEl, blocks);
    currentRunId = data.run_id;
    downloadSection.hidden = false;
    await loadDashboard(data.run_id);

    setStatus("Done. Model saved in /models on the backend.");
  } catch (err) {
    setStatus(err?.message || String(err), "error");
  } finally {
    trainBtn.disabled = false;
  }
});

async function fetchJson(url, options) {
  const res = await fetch(apiUrl(url), options);
  const text = await res.text().catch(() => "");
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      // Not JSON; keep as {}
      data = {};
    }
  }
  if (!res.ok) {
    const msg = data?.error || text || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

async function fetchText(url) {
  const res = await fetch(apiUrl(url));
  const text = await res.text();
  if (!res.ok) throw new Error(text || `Request failed (${res.status})`);
  return text;
}

function getRunId() {
  return (runIdInput.value || "").trim();
}

fetchRunBtn.addEventListener("click", async () => {
  const id = getRunId();
  if (!id) return setRunDebugStatus("Enter a Run ID first.", "error");

  setRunDebugStatus("Fetching run details…");
  runDebugOut.innerHTML = "";
  try {
    const data = await fetchJson(`/api/runs/${encodeURIComponent(id)}`);
    const blocks = [
      ["Run ID", data?.run?.run_id || id],
      ["Status", data?.status?.status || "unknown"],
      ["Error", data?.status?.error || ""],
      ["Dataset", data?.run?.original_filename || data?.run?.dataset_path || ""],
      ["Target hint", data?.run?.target_hint || ""],
      ["Artifacts", JSON.stringify(data?.artifacts || {}, null, 2)],
    ];
    renderKV(runDebugOut, blocks);
    setRunDebugStatus("Done.");
  } catch (e) {
    // Fallback for older Run IDs: we may only have <run_id>.meta.json.
    try {
      setRunDebugStatus("Run record not found; trying meta.json fallback…");
      const meta = await fetchJson(`/api/models/${encodeURIComponent(id)}/meta`);
      const blocks = [
        ["Run ID", id],
        ["Status", "unknown (meta-only Run ID)"],
        ["Error", "This Run ID was created before run.json/logs were persisted. Details available from meta.json only."],
        ["Best model", meta?.best_model_name || ""],
        ["Task", meta?.task || ""],
        ["Target", meta?.target || ""],
        ["Metrics", JSON.stringify(meta?.metrics || {}, null, 2)],
      ];
      renderKV(runDebugOut, blocks);
      setRunDebugStatus("Done (meta-only).");
    } catch (e2) {
      setRunDebugStatus(e?.message || String(e), "error");
    }
  }
});

fetchLogsBtn.addEventListener("click", async () => {
  const id = getRunId();
  if (!id) return setRunDebugStatus("Enter a Run ID first.", "error");

  setRunDebugStatus("Fetching logs…");
  runDebugOut.innerHTML = "";
  try {
    const text = await fetchText(`/api/runs/${encodeURIComponent(id)}/logs`);
    renderKV(runDebugOut, [["Logs", text]]);
    setRunDebugStatus("Done.");
  } catch (e) {
    // Fallback: logs not available for older runs.
    try {
      setRunDebugStatus("Logs not found for this Run ID. Trying meta fallback…");
      const meta = await fetchJson(`/api/models/${encodeURIComponent(id)}/meta`);
      const blocks = [
        ["Status", "unknown (logs not persisted for this Run ID)"],
        ["Error", "This Run ID was created before run.json/log persistence. You can still view meta.json (best model + metrics)."],
        ["Best model", meta?.best_model_name || ""],
        ["Metrics", JSON.stringify(meta?.metrics || {}, null, 2)],
      ];
      renderKV(runDebugOut, blocks);
      setRunDebugStatus("Done (meta-only).");
    } catch (e2) {
      setRunDebugStatus(e?.message || String(e), "error");
    }
  }
});

rerunBtn.addEventListener("click", async () => {
  const id = getRunId();
  if (!id) return setRunDebugStatus("Enter a Run ID first.", "error");

  setRunDebugStatus("Re-running… this may take a bit.");
  runDebugOut.innerHTML = "";
  try {
    const data = await fetchJson(`/api/runs/${encodeURIComponent(id)}/rerun`, { method: "POST" });
    const blocks = [
      ["Run ID", data.run_id],
      ["Task", data.task],
      ["Target", data.target],
      ["Best model", data.best_model_name],
      ["Metrics", JSON.stringify(data.metrics, null, 2)],
    ];
    renderKV(runDebugOut, blocks);
    setRunDebugStatus("Done.");
  } catch (e) {
    const msg = e?.message || String(e);
    // Friendly hint for older Run IDs.
    if (msg.toLowerCase().includes("run record missing") || msg.toLowerCase().includes("run record")) {
      setRunDebugStatus(msg + " Re-run AutoML to generate a new Run ID.", "error");
    } else {
      setRunDebugStatus(msg, "error");
    }
  }
});

downloadBtn.addEventListener("click", async () => {
  if (!currentRunId) return;
  try {
    const res = await fetch(apiUrl(`/api/models/${encodeURIComponent(currentRunId)}/download`));
    if (!res.ok) throw new Error("Download failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `model_${currentRunId}.pkl`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    setStatus("Download failed: " + e.message, "error");
  }
});

function setAnalyzerStatus(msg, kind = "info") {
  analyzerStatus.textContent = msg || "";
  analyzerStatus.style.color = kind === "error" ? "rgba(255, 92, 124, 0.95)" : "rgba(255, 255, 255, 0.70)";
}

function renderAnalyzerResults(data) {
  analyzerResults.hidden = false;
  analyzerResults.innerHTML = "";

  const wrapper = document.createElement("div");
  wrapper.className = "analyzer-wrapper";

  // Summary stats
  const summaryDiv = document.createElement("div");
  summaryDiv.className = "analyzer-summary";
  
  // Calculate total null values
  const totalNullValues = data.column_stats.reduce((sum, col) => sum + (col.missing_count || 0), 0);
  
  summaryDiv.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card t3d">
        <div class="stat-value">${data.num_rows.toLocaleString()}</div>
        <div class="stat-label">Rows</div>
      </div>
      <div class="stat-card t3d">
        <div class="stat-value">${data.num_columns}</div>
        <div class="stat-label">Columns</div>
      </div>
      <div class="stat-card t3d">
        <div class="stat-value">${data.duplicate_rows.toLocaleString()}</div>
        <div class="stat-label">Duplicates</div>
      </div>
      <div class="stat-card t3d ${totalNullValues > 0 ? 'has-nulls' : ''}">
        <div class="stat-value ${totalNullValues > 0 ? 'text-danger' : ''}">${totalNullValues.toLocaleString()}</div>
        <div class="stat-label">TOTAL MISSING VALUE</div>
      </div>
      <div class="stat-card t3d">
        <div class="stat-value">${data.memory_usage_mb} MB</div>
        <div class="stat-label">Memory</div>
      </div>
    </div>
  `;
  wrapper.appendChild(summaryDiv);

  // Column details table
  const tableDiv = document.createElement("div");
  tableDiv.className = "analyzer-table-wrapper";
  
  const tableTitle = document.createElement("h4");
  tableTitle.textContent = "Column Details - Select columns to drop";
  tableDiv.appendChild(tableTitle);

  const table = document.createElement("table");
  table.className = "analyzer-table";

  const thead = document.createElement("thead");
  thead.innerHTML = `
    <tr>
      <th><input type="checkbox" id="selectAllColumns" title="Select all columns"></th>
      <th>Column</th>
      <th>Type</th>
      <th>Missing</th>
      <th>Unique</th>
      <th>Min/Max/Mean or Most Common</th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  data.column_stats.forEach((col, index) => {
    const tr = document.createElement("tr");
    
    let extraInfo = "-";
    if (col.min !== undefined) {
      extraInfo = `Min: ${col.min?.toFixed ? col.min.toFixed(2) : col.min}, Max: ${col.max?.toFixed ? col.max.toFixed(2) : col.max}, Mean: ${col.mean?.toFixed ? col.mean.toFixed(2) : col.mean}`;
    } else if (col.most_common) {
      extraInfo = `"${col.most_common}" (${col.most_common_count})`;
    }

    tr.innerHTML = `
      <td><input type="checkbox" class="column-select-checkbox" data-column="${col.column}" data-index="${index}"></td>
      <td><strong>${col.column}</strong>${col.missing_count > 0 ? ' <span class="null-badge">NULL</span>' : ''}</td>
      <td><span class="type-badge type-${col.type.replace(/\//g, '-')}">${col.type}</span></td>
      <td>${col.missing_count > 0 ? `<span class="missing-warning">${col.missing_count} (${col.missing_percentage}%)</span>` : '0'}</td>
      <td>${col.unique_values.toLocaleString()}</td>
      <td>${extraInfo}</td>
    `;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  tableDiv.appendChild(table);

  // Add drop selected columns button
  const dropButtonDiv = document.createElement("div");
  dropButtonDiv.className = "column-drop-actions";
  dropButtonDiv.style.marginTop = "16px";
  dropButtonDiv.style.display = "flex";
  dropButtonDiv.style.gap = "10px";
  dropButtonDiv.innerHTML = `
    <button id="dropSelectedColumnsBtn" class="btn btn-danger" disabled>
      🗑️ Drop Selected Columns
    </button>
    <span id="selectedColumnsCount" style="color: var(--muted); align-self: center;">0 columns selected</span>
  `;
  tableDiv.appendChild(dropButtonDiv);

  wrapper.appendChild(tableDiv);

  // Add download link if cleaned file exists
  if (currentCleanedFileInfo) {
    setTimeout(() => addDownloadLinkToTable(), 100);
  }

  // Add event listeners for column selection
  setTimeout(() => {
    const selectAllCheckbox = document.getElementById('selectAllColumns');
    const columnCheckboxes = document.querySelectorAll('.column-select-checkbox');
    const dropBtn = document.getElementById('dropSelectedColumnsBtn');
    const countSpan = document.getElementById('selectedColumnsCount');

    function updateDropButton() {
      const checked = document.querySelectorAll('.column-select-checkbox:checked');
      dropBtn.disabled = checked.length === 0;
      countSpan.textContent = `${checked.length} column${checked.length !== 1 ? 's' : ''} selected`;
    }

    if (selectAllCheckbox) {
      selectAllCheckbox.addEventListener('change', (e) => {
        columnCheckboxes.forEach(cb => cb.checked = e.target.checked);
        updateDropButton();
      });
    }

    columnCheckboxes.forEach(cb => {
      cb.addEventListener('change', updateDropButton);
    });

    if (dropBtn) {
      dropBtn.addEventListener('click', async () => {
        const selectedColumns = Array.from(document.querySelectorAll('.column-select-checkbox:checked'))
          .map(cb => cb.dataset.column);
        
        if (selectedColumns.length === 0) return;
        
        if (!confirm(`Are you sure you want to drop ${selectedColumns.length} column(s): ${selectedColumns.join(', ')}?`)) {
          return;
        }

        // Create cleaning actions for selected columns
        const actions = selectedColumns.map(col => ({
          type: 'manual_drop_column',
          column: col,
          action: 'drop_column'
        }));

        // Apply the cleaning
        const fd = new FormData();
        fd.append("file", analyzerSelectedFile);
        fd.append("actions", JSON.stringify(actions));

        try {
          const result = await fetchJson("/api/clean-apply", { method: "POST", body: fd });
          
          alert(`Successfully dropped ${result.columns_removed} column(s):\n\n🗑️ ${selectedColumns.join('\n🗑️ ')}\n\nCleaned dataset now has ${result.final_shape[1]} columns.`);
          
          // Download the cleaned file automatically
          if (result.download_url) {
            const downloadRes = await fetch(apiUrl(result.download_url));
            const blob = await downloadRes.blob();
            
            // Create new file from blob
            const cleanedFile = new File([blob], result.cleaned_filename, { type: blob.type });
            
            // Replace the current file with cleaned file
            analyzerSelectedFile = cleanedFile;
            
            // Update file metadata display
            analyzerFileMeta.textContent = `Selected: ${cleanedFile.name} (${prettyBytes(cleanedFile.size)}) - Cleaned`;
            
            // Store cleaned file info for persistent download link
            currentCleanedFileInfo = {
              blob: blob,
              filename: result.cleaned_filename,
              url: URL.createObjectURL(blob)
            };
            
            // Show download link for user
            addDownloadLinkToTable();
          }
          
          // Refresh the analysis with cleaned data
          setTimeout(() => {
            analyzeBtn.click();
          }, 500);
        } catch (err) {
          alert("Error dropping columns: " + (err?.message || String(err)));
        }
      });
    }
  }, 0);

  analyzerResults.appendChild(wrapper);
}

function setAnalyzerSelectedFile(file) {
  analyzerSelectedFile = file;
  if (!file) {
    analyzerFileMeta.hidden = true;
    analyzeBtn.disabled = true;
    return;
  }
  analyzerFileMeta.hidden = false;
  analyzerFileMeta.textContent = `Selected: ${file.name} (${prettyBytes(file.size)})`;
  analyzeBtn.disabled = false;
  analyzerResults.hidden = true;
  analyzerResults.innerHTML = "";
  setAnalyzerStatus("Ready. Click Analyze Dataset.");
}

// Function to add persistent download link for cleaned dataset
function addDownloadLinkToTable() {
  if (!currentCleanedFileInfo) return;
  
  const tableWrapper = document.querySelector('.analyzer-table-wrapper');
  if (!tableWrapper) return;
  
  // Remove existing link if any
  const existingLink = document.getElementById('downloadCleanedLink');
  if (existingLink) {
    existingLink.remove();
  }
  
  // Create new download link
  const downloadLink = document.createElement('a');
  downloadLink.id = 'downloadCleanedLink';
  downloadLink.href = currentCleanedFileInfo.url;
  downloadLink.download = currentCleanedFileInfo.filename;
  downloadLink.textContent = '📥 Download Cleaned Dataset';
  downloadLink.className = 'btn btn-ghost';
  downloadLink.style.marginTop = '16px';
  downloadLink.style.display = 'inline-block';
  
  tableWrapper.appendChild(downloadLink);
}

analyzeBtn.addEventListener("click", async () => {
  if (!analyzerSelectedFile) return;

  analyzeBtn.disabled = true;
  setAnalyzerStatus("Analyzing dataset… this may take a bit.");

  const fd = new FormData();
  fd.append("file", analyzerSelectedFile);

  try {
    const data = await fetchJson("/api/analyze", { method: "POST", body: fd });

    renderAnalyzerResults(data);
    setAnalyzerStatus("Analysis complete!");
  } catch (err) {
    setAnalyzerStatus(err?.message || String(err), "error");
  } finally {
    analyzeBtn.disabled = false;
  }
});

analyzerChooseBtn.addEventListener("click", () => {
  analyzerFileInput.click();
});

analyzerFileInput.addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  setAnalyzerSelectedFile(file || null);
});

setAnalyzerStatus("Click 'Choose File' to select a dataset.");
setStatus("Upload a dataset to begin.");

// Auto Clean Recommendation functionality
const autoCleanFileInput = document.getElementById("autoCleanFileInput");
const autoCleanBtn = document.getElementById("autoCleanBtn");
const autoCleanChooseBtn = document.getElementById("autoCleanChooseBtn");
const autoCleanFileMeta = document.getElementById("autoCleanFileMeta");
const autoCleanStatus = document.getElementById("autoCleanStatus");
const autoCleanResults = document.getElementById("autoCleanResults");
const riskMeter = document.getElementById("riskMeter");
const impactPreview = document.getElementById("impactPreview");
const recommendationsList = document.getElementById("recommendationsList");
const cleaningLog = document.getElementById("cleaningLog");
const safeWarnings = document.getElementById("safeWarnings");
const cleaningActions = document.getElementById("cleaningActions");
const actionsList = document.getElementById("actionsList");
const applyActionsBtn = document.getElementById("applyActionsBtn");
const selectAllBtn = document.getElementById("selectAllBtn");
const selectSafeBtn = document.getElementById("selectSafeBtn");
const cleanedResult = document.getElementById("cleanedResult");
const cleaningSummary = document.getElementById("cleaningSummary");
const downloadCleanedBtn = document.getElementById("downloadCleanedBtn");

let autoCleanSelectedFile = null;
let currentRecommendations = [];
let currentDownloadUrl = null;

function setAutoCleanStatus(msg, kind = "info") {
  autoCleanStatus.textContent = msg || "";
  autoCleanStatus.style.color = kind === "error" ? "rgba(255, 92, 124, 0.95)" : "rgba(255, 255, 255, 0.70)";
}

function renderRiskMeter(riskData) {
  const riskColor = riskData.color;
  const riskPercent = riskData.score;
  
  riskMeter.innerHTML = `
    <div class="risk-meter-container">
      <h4>Risk Meter</h4>
      <div class="risk-gauge">
        <div class="risk-bar-bg">
          <div class="risk-bar-fill risk-${riskColor}" style="width: ${riskPercent}%"></div>
        </div>
        <div class="risk-value risk-${riskColor}">${riskPercent}% - ${riskData.level}</div>
      </div>
      <div class="risk-details">
        <span>Missing: ${riskData.missing_percentage}%</span>
        <span>Duplicates: ${riskData.duplicate_percentage}%</span>
      </div>
    </div>
  `;
}

function renderImpactPreview(impactData) {
  impactPreview.innerHTML = `
    <div class="impact-container">
      <h4>Cleaning Impact Preview</h4>
      <div class="impact-stats">
        <div class="impact-row">
          <span>Original Rows:</span>
          <strong>${impactData.original_rows.toLocaleString()}</strong>
        </div>
        <div class="impact-row">
          <span>After Duplicate Removal:</span>
          <strong>${impactData.rows_after_duplicate_cleanup.toLocaleString()}</strong>
        </div>
        <div class="impact-row highlight">
          <span>Estimated Data Loss:</span>
          <strong class="${impactData.data_loss_percentage > 10 ? 'warning' : 'safe'}">${impactData.data_loss_percentage}%</strong>
        </div>
      </div>
    </div>
  `;
}

function renderRecommendations(recommendations) {
  if (!recommendations.length) {
    recommendationsList.innerHTML = '<div class="no-issues">No cleaning issues found!</div>';
    return;
  }
  
  // Create a copy before sorting to avoid modifying the original array
  // (which would break the index mapping in renderCleaningActions)
  const sortedRecs = [...recommendations];
  const severityOrder = { high: 3, medium: 2, low: 1 };
  sortedRecs.sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity]);
  
  recommendationsList.innerHTML = `
    <h4>Recommendations (${recommendations.length})</h4>
    <div class="recommendations-table-wrapper">
      <table class="recommendations-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Column</th>
            <th>Severity</th>
            <th>Action</th>
            <th>Impact</th>
            <th>Safe</th>
          </tr>
        </thead>
        <tbody>
          ${sortedRecs.map(rec => `
            <tr class="severity-${rec.severity}">
              <td>${rec.type.replace(/_/g, ' ')}</td>
              <td><strong>${rec.column}</strong></td>
              <td><span class="severity-badge severity-${rec.severity}">${rec.severity}</span></td>
              <td>${rec.action.replace(/_/g, ' ')}</td>
              <td>${rec.impact}</td>
              <td>${rec.safe ? '✅' : '⚠️'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderCleaningLog(logs) {
  if (!logs.length) {
    cleaningLog.innerHTML = '';
    return;
  }
  
  cleaningLog.innerHTML = `
    <div class="cleaning-log-container">
      <h4>Cleaning Log</h4>
      <div class="log-entries">
        ${logs.map(log => `<div class="log-entry">${log}</div>`).join('')}
      </div>
    </div>
  `;
}

function renderSafeWarnings(warnings) {
  if (!warnings.length) {
    safeWarnings.innerHTML = '';
    return;
  }
  
  safeWarnings.innerHTML = `
    <div class="warnings-container">
      <h4>Safe Warnings</h4>
      ${warnings.map(warning => `
        <div class="warning-item">
          <span class="warning-icon">⚠️</span>
          <span class="warning-text">${warning}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderCleaningActions(recommendations) {
  if (!cleaningActions) {
    return;
  }
  
  if (!recommendations || !recommendations.length) {
    cleaningActions.hidden = true;
    return;
  }
  
  currentRecommendations = recommendations;
  cleaningActions.hidden = false;
  cleanedResult.hidden = true;
  
  let html = '';
  for (let index = 0; index < recommendations.length; index++) {
    const rec = recommendations[index];
    const isFillText = rec.action === "fill_mode" || rec.action === "fill_text";
    const fillInput = isFillText ? 
      `<input type="text" id="fill-text-${index}" class="fill-text-input" placeholder="Enter value to fill" data-index="${index}" style="margin-left: 10px; padding: 4px 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.05); color: white; width: 150px;" />` 
      : '';
    
    html += `
      <div class="action-item severity-${rec.severity}" data-index="${index}">
        <label class="action-label">
          <input type="checkbox" class="action-checkbox" data-index="${index}" data-safe="${rec.safe}">
          <span class="action-text">
            <strong>${rec.action.replace(/_/g, ' ')}</strong> on <strong>${rec.column}</strong>
            <span class="action-impact">${rec.impact}</span>
          </span>
          ${fillInput}
        </label>
      </div>
    `;
  }
  
  actionsList.innerHTML = html;
  
  // Add change listeners to checkboxes
  const checkboxes = actionsList.querySelectorAll('.action-checkbox');
  checkboxes.forEach(cb => {
    cb.addEventListener('change', updateApplyButton);
  });
  
  updateApplyButton();
}

function updateApplyButton() {
  const checked = actionsList.querySelectorAll('.action-checkbox:checked');
  applyActionsBtn.disabled = checked.length === 0;
}

function getSelectedActions() {
  const selected = [];
  const checkedBoxes = actionsList.querySelectorAll('.action-checkbox:checked');
  console.log("[DEBUG] Checked boxes count:", checkedBoxes.length);
  
  checkedBoxes.forEach(cb => {
    const index = parseInt(cb.dataset.index);
    const rec = currentRecommendations[index];
    console.log("[DEBUG] Checkbox index:", index, "rec:", rec ? {type: rec.type, column: rec.column, action: rec.action} : "UNDEFINED");
    
    if (!rec) {
      console.error("[DEBUG] No recommendation found for index:", index);
      return;
    }
    
    const action = {
      type: rec.type,
      column: rec.column,
      action: rec.action
    };
    
    // If fill_text action, get the custom value
    if (rec.action === "fill_mode" || rec.action === "fill_text") {
      const fillInput = document.getElementById(`fill-text-${index}`);
      if (fillInput && fillInput.value.trim()) {
        action.action = "fill_text";
        action.fill_value = fillInput.value.trim();
      }
    }
    
    // If outlier action, include the bounds
    if (rec.type === "outliers" && rec.bounds) {
      action.bounds = rec.bounds;
      console.log("[DEBUG] Added bounds for outlier:", action.bounds);
    }
    
    selected.push(action);
  });
  
  console.log("[DEBUG] Selected actions:", selected);
  return selected;
}

selectAllBtn.addEventListener("click", () => {
  actionsList.querySelectorAll('.action-checkbox').forEach(cb => cb.checked = true);
  updateApplyButton();
});

selectSafeBtn.addEventListener("click", () => {
  actionsList.querySelectorAll('.action-checkbox').forEach(cb => {
    cb.checked = cb.dataset.safe === "true";
  });
  updateApplyButton();
});

applyActionsBtn.addEventListener("click", async () => {
  if (!autoCleanSelectedFile) return;
  
  console.log("[DEBUG] Apply button clicked");
  const selectedActions = getSelectedActions();
  console.log("[DEBUG] Actions to send:", JSON.stringify(selectedActions, null, 2));
  
  if (!selectedActions.length) {
    setAutoCleanStatus("Please select at least one action", "error");
    return;
  }
  
  applyActionsBtn.disabled = true;
  setAutoCleanStatus("Applying cleaning actions…");
  
  const fd = new FormData();
  fd.append("file", autoCleanSelectedFile);
  fd.append("actions", JSON.stringify(selectedActions));
  
  try {
    const data = await fetchJson("/api/clean-apply", { method: "POST", body: fd });
    console.log("[DEBUG] Backend response:", data);
    
    // Show results
    cleanedResult.hidden = false;
    cleaningSummary.innerHTML = `
      <div class="summary-stats">
        <div class="summary-row">
          <span>Original:</span>
          <strong>${data.original_shape[0].toLocaleString()} rows × ${data.original_shape[1]} cols</strong>
        </div>
        <div class="summary-row">
          <span>Final:</span>
          <strong>${data.final_shape[0].toLocaleString()} rows × ${data.final_shape[1]} cols</strong>
        </div>
        <div class="summary-row highlight">
          <span>Rows Removed:</span>
          <strong>${data.rows_removed.toLocaleString()}</strong>
        </div>
        <div class="summary-row">
          <span>Columns Removed:</span>
          <strong>${data.columns_removed}</strong>
        </div>
        <div class="summary-row">
          <span>Actions Applied:</span>
          <strong>${data.actions_applied}</strong>
        </div>
      </div>
      <div class="action-log">
        ${data.action_log.map(log => `<div class="log-entry">${log}</div>`).join('')}
      </div>
    `;
    
    currentDownloadUrl = data.download_url;
    setAutoCleanStatus("Cleaning complete! Download your cleaned dataset.");
    
    // Scroll to results
    cleanedResult.scrollIntoView({ behavior: 'smooth' });
    
  } catch (err) {
    setAutoCleanStatus(err?.message || String(err), "error");
    applyActionsBtn.disabled = false;
  }
});

downloadCleanedBtn.addEventListener("click", async () => {
  if (!currentDownloadUrl) return;
  
  try {
    const res = await fetch(apiUrl(currentDownloadUrl));
    if (!res.ok) throw new Error("Download failed");
    
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = currentDownloadUrl.split('/').pop();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    setAutoCleanStatus("Cleaned dataset downloaded!");
  } catch (e) {
    setAutoCleanStatus("Download failed: " + e.message, "error");
  }
});

function renderAutoCleanResults(data) {
  autoCleanResults.hidden = false;
  renderRiskMeter(data.risk_meter);
  renderImpactPreview(data.impact_preview);
  renderCleaningActions(data.recommendations);
  renderRecommendations(data.recommendations);
  renderCleaningLog(data.cleaning_log);
  renderSafeWarnings(data.safe_warnings);
  cleanedResult.hidden = true;
}

function setAutoCleanSelectedFile(file) {
  autoCleanSelectedFile = file;
  if (!file) {
    autoCleanFileMeta.hidden = true;
    autoCleanBtn.disabled = true;
    return;
  }
  autoCleanFileMeta.hidden = false;
  autoCleanFileMeta.textContent = `Selected: ${file.name} (${prettyBytes(file.size)})`;
  autoCleanBtn.disabled = false;
  autoCleanResults.hidden = true;
  setAutoCleanStatus("Ready. Click 'Analyze & Recommend'.");
}

autoCleanChooseBtn.addEventListener("click", () => {
  autoCleanFileInput.click();
});

autoCleanFileInput.addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  setAutoCleanSelectedFile(file || null);
});

autoCleanBtn.addEventListener("click", async () => {
  if (!autoCleanSelectedFile) return;

  autoCleanBtn.disabled = true;
  setAutoCleanStatus("Analyzing dataset and generating recommendations…");

  const fd = new FormData();
  fd.append("file", autoCleanSelectedFile);

  try {
    const data = await fetchJson("/api/clean-recommend", { method: "POST", body: fd });

    renderAutoCleanResults(data);
    setAutoCleanStatus(`Analysis complete! Found ${data.total_issues} issues. Risk Level: ${data.risk_meter.level}`);
  } catch (err) {
    setAutoCleanStatus(err?.message || String(err), "error");
  } finally {
    autoCleanBtn.disabled = false;
  }
});

setAutoCleanStatus("Click 'Choose File' to select a dataset for cleaning analysis.");

// Power BI Entry Card functionality - Updated for two datasets
const powerBIFileInput1 = document.getElementById('powerBIFileInput1');
const powerBIFileInput2 = document.getElementById('powerBIFileInput2');
const powerBIChooseBtn1 = document.getElementById('powerBIChooseBtn1');
const powerBIChooseBtn2 = document.getElementById('powerBIChooseBtn2');
const powerBIOpenBtn = document.getElementById('powerBIOpenBtn');
const powerBIFileMeta1 = document.getElementById('powerBIFileMeta1');
const powerBIFileMeta2 = document.getElementById('powerBIFileMeta2');
const powerBIStatus = document.getElementById('powerBIStatus');

let powerBISelectedFile1 = null;
let powerBISelectedFile2 = null;

function setPowerBIStatus(msg, kind = "info") {
  if (!powerBIStatus) return;
  powerBIStatus.textContent = msg || "";
  powerBIStatus.style.color = kind === "error" ? "rgba(255, 92, 124, 0.95)" : "rgba(255, 255, 255, 0.70)";
}

function updateOpenButton() {
  // Enable button if at least dataset 1 is selected
  powerBIOpenBtn.disabled = !powerBISelectedFile1;
}

function setPowerBIFile1(file) {
  powerBISelectedFile1 = file;
  if (!file) {
    powerBIFileMeta1.hidden = true;
    powerBIChooseBtn1.textContent = "Choose File";
  } else {
    powerBIFileMeta1.hidden = false;
    powerBIFileMeta1.textContent = `✓ ${file.name} (${prettyBytes(file.size)})`;
    powerBIChooseBtn1.textContent = "Change File";
  }
  updateOpenButton();
}

function setPowerBIFile2(file) {
  powerBISelectedFile2 = file;
  if (!file) {
    powerBIFileMeta2.hidden = true;
    powerBIChooseBtn2.textContent = "Choose File";
  } else {
    powerBIFileMeta2.hidden = false;
    powerBIFileMeta2.textContent = `✓ ${file.name} (${prettyBytes(file.size)})`;
    powerBIChooseBtn2.textContent = "Change File";
  }
}

powerBIChooseBtn1?.addEventListener('click', () => powerBIFileInput1.click());
powerBIChooseBtn2?.addEventListener('click', () => powerBIFileInput2.click());

powerBIFileInput1?.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  setPowerBIFile1(file || null);
  setPowerBIStatus(powerBISelectedFile1 ? "Dataset 1 selected. Optional: Select Dataset 2 for relationships." : "Please select Dataset 1");
});

powerBIFileInput2?.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  setPowerBIFile2(file || null);
  setPowerBIStatus(powerBISelectedFile2 ? "Both datasets selected! Click 'Open Dashboard' to proceed." : powerBISelectedFile1 ? "Dataset 1 selected. Optional: Select Dataset 2." : "Please select Dataset 1");
});

powerBIOpenBtn?.addEventListener('click', async () => {
  if (!powerBISelectedFile1) return;

  powerBIOpenBtn.disabled = true;
  setPowerBIStatus("Loading datasets...");

  try {
    // Analyze first dataset
    const fd1 = new FormData();
    fd1.append("file", powerBISelectedFile1);
    const data1 = await fetchJson("/api/analyze", { method: "POST", body: fd1 });
    currentReportData = data1;

    // Analyze second dataset if provided
    table2Data = null;
    if (powerBISelectedFile2) {
      const fd2 = new FormData();
      fd2.append("file", powerBISelectedFile2);
      const data2 = await fetchJson("/api/analyze", { method: "POST", body: fd2 });
      table2Data = data2;
    }
    
    // Hide entry card and show report/model view cards
    document.getElementById('powerBIEntryCard').hidden = true;
    powerBIReportCard.hidden = false;
    modelViewCard.hidden = false;
    
    // Scroll to report view
    powerBIReportCard.scrollIntoView({ behavior: 'smooth' });
    
    // Render fields
    renderFieldSelection();
    
    // Render model view - one or two tables
    if (table2Data) {
      renderTwoTableModelView();
      startRelationshipCreation();
    } else {
      renderModelView(data1);
    }
    
    // Auto-generate dashboard
    setTimeout(() => {
      autoDashboardBtn.click();
    }, 500);
    
    setPowerBIStatus("Dashboard loaded successfully!");
  } catch (err) {
    setPowerBIStatus(err?.message || String(err), "error");
    powerBIOpenBtn.disabled = false;
  }
});

// Back button functionality
const powerBIBackBtn = document.getElementById('powerBIBackBtn');
powerBIBackBtn?.addEventListener('click', () => {
  powerBIReportCard.hidden = true;
  modelViewCard.hidden = true;
  document.getElementById('powerBIEntryCard').hidden = false;
  
  // Reset state
  powerBISelectedFile1 = null;
  powerBISelectedFile2 = null;
  powerBIFileInput1.value = '';
  powerBIFileInput2.value = '';
  table2Data = null;
  relationships = [];
  resetRelationshipCreation();
  
  setPowerBIFile1(null);
  setPowerBIFile2(null);
  setPowerBIStatus("Upload one or two datasets to open Power BI Dashboard.");
  
  document.getElementById('powerBIEntryCard').scrollIntoView({ behavior: 'smooth' });
});

setPowerBIStatus("Upload one or two datasets to open Power BI Dashboard.");

// Power BI Report View functionality
let currentReportData = null;
let selectedVisualType = null;
let selectedFields = [];

const powerBIReportCard = document.getElementById('powerBIReportCard');
const modelViewCard = document.getElementById('modelViewCard');
const reportFields = document.getElementById('reportFields');
const reportCanvas = document.getElementById('reportCanvas');
const modelDiagram = document.getElementById('modelDiagram');
const modelProperties = document.getElementById('modelProperties');
const autoDashboardBtn = document.getElementById('autoDashboardBtn');

// Visual type selection
document.querySelectorAll('.visual-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.visual-item').forEach(v => v.classList.remove('active'));
    item.classList.add('active');
    selectedVisualType = item.dataset.type;
    renderFieldSelection();
  });
});

// Render fields for selection
function renderFieldSelection() {
  if (!currentReportData || !currentReportData.column_stats) {
    reportFields.innerHTML = '<p class="field-placeholder">Upload a dataset to see fields</p>';
    return;
  }
  
  let html = '';
  currentReportData.column_stats.forEach((col, index) => {
    const isNumeric = col.type === 'integer' || col.type === 'float';
    const iconClass = isNumeric ? 'numeric' : 'text';
    const iconText = isNumeric ? '123' : 'ABC';
    const isSelected = selectedFields.includes(col.column) ? 'selected' : '';
    
    html += `
      <div class="field-item ${isSelected}" data-column="${col.column}" data-type="${col.type}" data-index="${index}">
        <span class="field-icon ${iconClass}">${iconText}</span>
        <span>${col.column}</span>
      </div>
    `;
  });
  
  reportFields.innerHTML = html;
  
  // Add click handlers
  document.querySelectorAll('.field-item').forEach(item => {
    item.addEventListener('click', () => {
      const col = item.dataset.column;
      if (selectedFields.includes(col)) {
        selectedFields = selectedFields.filter(f => f !== col);
        item.classList.remove('selected');
      } else {
        // Limit to 2 fields for most visuals
        if (selectedFields.length < 2 || selectedVisualType === 'table') {
          selectedFields.push(col);
          item.classList.add('selected');
        } else {
          alert('Select up to 2 fields (X and Y axis) or choose Table for more fields');
        }
      }
      
      if (selectedFields.length > 0 && selectedVisualType) {
        renderChart();
      }
    });
  });
}

// Render chart in canvas
function renderChart() {
  if (!selectedVisualType || selectedFields.length === 0) return;
  
  const cols = selectedFields;
  const data = currentReportData.column_stats;
  
  // Get sample data for the chart (use the actual data if available)
  // For now, we'll create a summary visualization
  let chartHTML = '<div class="dashboard-grid">';
  
  if (selectedVisualType === 'card' && cols.length > 0) {
    const col = data.find(c => c.column === cols[0]);
    const value = col ? (col.mean || col.unique_values || 0).toFixed(2) : '0';
    chartHTML += `
      <div class="dashboard-chart" style="text-align: center; padding: 40px;">
        <h5>${cols[0]}</h5>
        <div style="font-size: 48px; font-weight: 700; color: var(--accent2); margin: 20px 0;">${value}</div>
        <div style="color: var(--muted);">${col ? col.type : ''}</div>
      </div>
    `;
  } else if (selectedVisualType === 'table') {
    chartHTML += `
      <div class="dashboard-chart" style="grid-column: 1 / -1;">
        <h5>Data Table</h5>
        <table class="analyzer-table">
          <thead>
            <tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr>
          </thead>
          <tbody>
            <tr>${cols.map(() => '<td>Sample Data</td>').join('')}</tr>
          </tbody>
        </table>
      </div>
    `;
  } else {
    // Bar, Line, Pie, Scatter - create simple bar chart visualization
    chartHTML += `
      <div class="dashboard-chart" style="grid-column: 1 / -1;">
        <h5>${selectedVisualType.toUpperCase()} Chart: ${cols.join(' vs ')}</h5>
        <div class="chart-container" id="chartContainer">
          <div style="display: flex; align-items: end; justify-content: space-around; height: 100%; padding: 20px;">
    `;
    
    // Create sample bars for visualization
    const bars = [65, 40, 85, 55, 70, 90, 30];
    const colors = ['#7C5CFF', '#35D2FF', '#3DDC97', '#FFB347', '#FF6B6B', '#7C5CFF', '#35D2FF'];
    
    bars.forEach((height, i) => {
      chartHTML += `
        <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
          <div style="width: 40px; height: ${height * 2}px; background: ${colors[i]}; border-radius: 4px 4px 0 0; transition: height 0.3s;"></div>
          <span style="font-size: 12px; color: var(--muted);">Cat${i+1}</span>
        </div>
      `;
    });
    
    chartHTML += `
          </div>
        </div>
      </div>
    `;
  }
  
  chartHTML += '</div>';
  reportCanvas.innerHTML = chartHTML;
}

// Auto Generate Dashboard
autoDashboardBtn?.addEventListener('click', async () => {
  if (!currentReportData || !currentReportData.column_stats) {
    alert('Please analyze a dataset first');
    return;
  }
  
  // If we have two datasets with relationships, use the relationship-based dashboard API
  if (table2Data && relationships.length > 0 && powerBISelectedFile1 && powerBISelectedFile2) {
    autoDashboardBtn.disabled = true;
    autoDashboardBtn.textContent = 'Generating Relationship Dashboard...';
    
    try {
      const fd = new FormData();
      fd.append('file1', powerBISelectedFile1);
      fd.append('file2', powerBISelectedFile2);
      fd.append('relationships', JSON.stringify(relationships));
      
      const data = await fetchJson('/api/relationship-dashboard', { method: 'POST', body: fd });
      
      renderRelationshipDashboard(data);
    } catch (err) {
      alert(err?.message || 'Failed to generate relationship dashboard');
      // Fallback to regular dashboard
      generateRegularDashboard();
    } finally {
      autoDashboardBtn.disabled = false;
      autoDashboardBtn.textContent = 'Auto Generate Dashboard';
    }
    return;
  }
  
  // Regular single-table dashboard
  generateRegularDashboard();
});

function generateRegularDashboard() {
  const cols = currentReportData.column_stats;
  const numericCols = cols.filter(c => c.type === 'integer' || c.type === 'float');
  const categoricalCols = cols.filter(c => c.type === 'string/object');
  
  let dashboardHTML = '<div class="dashboard-grid">';
  
  // Add summary cards
  dashboardHTML += `
    <div class="dashboard-chart">
      <h5>📊 Dataset Overview</h5>
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-top: 12px;">
        <div style="text-align: center; padding: 12px; background: rgba(124, 92, 255, 0.1); border-radius: 8px;">
          <div style="font-size: 24px; font-weight: 700; color: var(--accent);">${currentReportData.num_rows?.toLocaleString() || '0'}</div>
          <div style="font-size: 11px; color: var(--muted);">Rows</div>
        </div>
        <div style="text-align: center; padding: 12px; background: rgba(61, 220, 151, 0.1); border-radius: 8px;">
          <div style="font-size: 24px; font-weight: 700; color: var(--ok);">${currentReportData.num_columns || '0'}</div>
          <div style="font-size: 11px; color: var(--muted);">Columns</div>
        </div>
      </div>
    </div>
  `;
    // Add charts for numeric columns
  numericCols.slice(0, 4).forEach((col, i) => {
    const colors = ['#7C5CFF', '#35D2FF', '#3DDC97', '#FFB347'];
    const randomValues = Array.from({length: 7}, () => Math.floor(Math.random() * 80) + 20);
    
    dashboardHTML += `
      <div class="dashboard-chart">
        <h5>📈 ${col.column} Distribution</h5>
        <div style="display: flex; align-items: end; justify-content: space-around; height: 160px; padding: 10px; gap: 4px;">
          ${randomValues.map((h, j) => `
            <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; flex: 1; min-width: 0;">
              <div style="width: 24px; height: ${h}px; background: ${colors[i]}; border-radius: 3px 3px 0 0; opacity: 0.8;"></div>
              <span style="font-size: 9px; color: var(--muted); text-align: center; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${j+1}</span>
            </div>
          `).join('')}
        </div>
        <div style="display: flex; justify-content: space-between; margin-top: 8px; font-size: 11px; color: var(--muted);">
          <span>Min: ${col.min?.toFixed(2) || 'N/A'}</span>
          <span>Mean: ${col.mean?.toFixed(2) || 'N/A'}</span>
          <span>Max: ${col.max?.toFixed(2) || 'N/A'}</span>
        </div>
      </div>
    `;
  });
  
  // Add pie chart for categorical columns
  if (categoricalCols.length > 0) {
    const catCol = categoricalCols[0];
    dashboardHTML += `
      <div class="dashboard-chart">
        <h5 class="dashboard-chart h5" style="margin: 0 0 12px 0; font-size: 14px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">🥧 ${catCol.column} Composition</h5>
        <div style="display: flex; align-items: center; justify-content: center; height: 160px; gap: 20px;">
          <div style="position: relative; width: 120px; height: 120px; border-radius: 50%; background: conic-gradient(
            #7C5CFF 0deg 120deg,
            #35D2FF 120deg 200deg,
            #3DDC97 200deg 280deg,
            #FFB347 280deg 360deg
          );"></div>
          <div style="font-size: 10px;">
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;"><span style="width: 10px; height: 10px; background: #7C5CFF; border-radius: 2px;"></span> Group A</div>
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;"><span style="width: 10px; height: 10px; background: #35D2FF; border-radius: 2px;"></span> Group B</div>
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;"><span style="width: 10px; height: 10px; background: #3DDC97; border-radius: 2px;"></span> Group C</div>
            <div style="display: flex; align-items: center; gap: 6px;"><span style="width: 10px; height: 10px; background: #FFB347; border-radius: 2px;"></span> Group D</div>
          </div>
        </div>
      </div>
    `;
  }
  
  dashboardHTML += '</div>';
  reportCanvas.innerHTML = dashboardHTML;
}

// Render dashboard based on joined relationship data
function renderRelationshipDashboard(data) {
  const visualizations = data.visualizations || [];
  const joinInfo = data.join_info || [];
  
  let dashboardHTML = '<div class="dashboard-grid">';
  
  // Add relationship info card
  if (joinInfo.length > 0) {
    dashboardHTML += `
      <div class="dashboard-chart" style="grid-column: 1 / -1;">
        <h5 class="dashboard-chart h5" style="margin: 0 0 12px 0; font-size: 14px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">🔗 Joined Data Overview</h5>
        <div style="display: flex; gap: 16px; flex-wrap: wrap; margin-top: 12px; align-items: center;">
          <div style="padding: 12px 16px; background: rgba(124, 92, 255, 0.1); border-radius: 8px; min-width: 120px;">
            <div style="font-size: 20px; font-weight: 700; color: var(--accent);">${data.total_rows?.toLocaleString() || '0'}</div>
            <div style="font-size: 11px; color: var(--muted);">Joined Rows</div>
          </div>
          ${joinInfo.map(ji => `
            <div style="padding: 12px 16px; background: rgba(61, 220, 151, 0.1); border-radius: 8px; min-width: 150px;">
              <div style="font-size: 13px; font-weight: 600; color: var(--ok); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${ji.source_column} → ${ji.target_column}</div>
              <div style="font-size: 11px; color: var(--muted);">${ji.type} (${ji.joined_rows} rows)</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
  
  // Render each visualization
  visualizations.forEach((viz, i) => {
    if (!viz) return;
    
    const colors = ['#7C5CFF', '#35D2FF', '#3DDC97', '#FFB347', '#FF6B6B', '#9B59B6'];
    
    if (viz.type === 'bar' && viz.values && viz.labels) {
      const maxVal = Math.max(...viz.values) || 1;
      const displayLabels = viz.labels.slice(0, 6); // Limit to 6 labels max for better spacing
      const displayValues = viz.values.slice(0, 6);
      
      dashboardHTML += `
        <div class="dashboard-chart">
          <h5>📊 ${viz.title}</h5>
          <div style="display: flex; align-items: end; justify-content: space-around; height: 160px; padding: 10px; gap: 12px;">
            ${displayLabels.map((label, j) => `
              <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; flex: 1; min-width: 0; max-width: 80px;">
                <div style="width: 28px; height: ${(displayValues[j] / maxVal * 140)}px; background: ${colors[j % colors.length]}; border-radius: 3px 3px 0 0; opacity: 0.9; min-height: 4px;"></div>
                <span style="font-size: 9px; color: var(--muted); text-align: center; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; writing-mode: vertical-rl; text-orientation: mixed; height: 50px; display: flex; align-items: center; justify-content: center;" title="${label}">${label.length > 12 ? label.substring(0, 10) + '..' : label}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else if (viz.type === 'pie' && viz.values && viz.labels) {
      const total = viz.values.reduce((a, b) => a + b, 0);
      let currentAngle = 0;
      let gradientParts = [];
      viz.values.forEach((val, j) => {
        const angle = (val / total) * 360;
        gradientParts.push(`${colors[j % colors.length]} ${currentAngle}deg ${currentAngle + angle}deg`);
        currentAngle += angle;
      });
      
      dashboardHTML += `
        <div class="dashboard-chart">
          <h5>🥧 ${viz.title}</h5>
          <div style="display: flex; align-items: center; justify-content: center; height: 160px; gap: 20px;">
            <div style="width: 100px; height: 100px; border-radius: 50%; background: conic-gradient(${gradientParts.join(', ')});"></div>
            <div style="font-size: 10px;">
              ${viz.labels.map((label, j) => `
                <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                  <span style="width: 10px; height: 10px; background: ${colors[j % colors.length]}; border-radius: 2px;"></span>
                  <span style="color: var(--muted);">${label}: ${viz.values[j]}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
    } else if (viz.type === 'scatter' && viz.x_data && viz.y_data) {
      dashboardHTML += `
        <div class="dashboard-chart">
          <h5>📈 ${viz.title}</h5>
          <div style="position: relative; height: 160px; padding: 10px; background: rgba(0,0,0,0.1); border-radius: 8px;">
            ${viz.x_data.map((x, j) => {
              const xPercent = (j / viz.x_data.length) * 80 + 10;
              const yPercent = 100 - ((viz.y_data[j] / Math.max(...viz.y_data)) * 80 + 10);
              return `<div style="position: absolute; left: ${xPercent}%; top: ${yPercent}%; width: 6px; height: 6px; background: ${colors[j % colors.length]}; border-radius: 50%;"></div>`;
            }).join('')}
          </div>
        </div>
      `;
    } else if (viz.type === 'histogram' && viz.data) {
      dashboardHTML += `
        <div class="dashboard-chart">
          <h5>📊 ${viz.title}</h5>
          <div style="display: flex; align-items: end; justify-content: space-around; height: 160px; padding: 10px;">
            ${viz.data.slice(0, 20).map((val, j) => `
              <div style="width: 8px; height: ${Math.abs(val) || 10}px; background: ${colors[j % colors.length]}; border-radius: 2px 2px 0 0; opacity: 0.8;"></div>
            `).join('')}
          </div>
        </div>
      `;
    }
  });
  
  dashboardHTML += '</div>';
  reportCanvas.innerHTML = dashboardHTML;
}

// Model View functionality
function renderModelView(data) {
  if (!data || !data.column_stats) {
    modelDiagram.innerHTML = '<div class="model-placeholder"><p>Upload a dataset to see the model diagram</p></div>';
    return;
  }
  
  const cols = data.column_stats;
  const numericCols = cols.filter(c => c.type === 'integer' || c.type === 'float');
  const categoricalCols = cols.filter(c => c.type === 'string/object');
  
  // Create a single table view (like Power BI model view)
  let html = '<div style="display: flex; gap: 40px; flex-wrap: wrap;">';
  
  // Main table
  html += `
    <div class="table-box">
      <h5>📋 Dataset Table</h5>
      <ul class="table-columns">
  `;
  
  cols.forEach((col, index) => {
    const isPK = index === 0; // First column as PK
    const iconClass = isPK ? 'pk' : '';
    const iconText = isPK ? 'PK' : (col.type === 'integer' || col.type === 'float' ? '#' : 'T');
    
    html += `
      <li data-column="${col.column}" onclick="showColumnProperties('${col.column}')">
        <span class="col-icon ${iconClass}">${iconText}</span>
        <span>${col.column}</span>
        <span style="margin-left: auto; color: var(--muted); font-size: 10px;">${col.type}</span>
      </li>
    `;
  });
  
  html += `
      </ul>
    </div>
  `;
  
  // Summary box
  html += `
    <div class="table-box" style="background: rgba(61, 220, 151, 0.1); border-color: rgba(61, 220, 151, 0.3);">
      <h5 style="color: var(--ok);">📊 Column Summary</h5>
      <div style="font-size: 12px; color: var(--text);">
        <div style="margin-bottom: 8px;">🔢 Numeric: <strong>${numericCols.length}</strong></div>
        <div style="margin-bottom: 8px;">📝 Text: <strong>${categoricalCols.length}</strong></div>
        <div style="margin-bottom: 8px;">⚠️ With Nulls: <strong>${cols.filter(c => c.missing_count > 0).length}</strong></div>
        <div>📊 Total: <strong>${cols.length}</strong></div>
      </div>
    </div>
  `;
  
  html += '</div>';
  modelDiagram.innerHTML = html;
}

// Show column properties
function showColumnProperties(columnName) {
  if (!currentReportData) return;
  
  const col = currentReportData.column_stats.find(c => c.column === columnName);
  if (!col) return;
  
  let html = `
    <h4>🔧 ${col.column} Properties</h4>
    <div class="property-row">
      <span>Data Type</span>
      <strong>${col.type}</strong>
    </div>
    <div class="property-row">
      <span>Unique Values</span>
      <strong>${col.unique_values?.toLocaleString() || 'N/A'}</strong>
    </div>
    <div class="property-row">
      <span>Missing Values</span>
      <strong style="color: ${col.missing_count > 0 ? 'var(--danger)' : 'var(--ok)'}">${col.missing_count || 0}</strong>
    </div>
  `;
  
  if (col.min !== undefined) {
    html += `
      <div class="property-row">
        <span>Min</span>
        <strong>${col.min.toFixed(2)}</strong>
      </div>
      <div class="property-row">
        <span>Max</span>
        <strong>${col.max.toFixed(2)}</strong>
      </div>
      <div class="property-row">
        <span>Mean</span>
        <strong>${col.mean.toFixed(2)}</strong>
      </div>
    `;
  }
  
  if (col.most_common) {
    html += `
      <div class="property-row">
        <span>Most Common</span>
        <strong>${col.most_common}</strong>
      </div>
      <div class="property-row">
        <span>Most Common Count</span>
        <strong>${col.most_common_count}</strong>
      </div>
    `;
  }
  
  modelProperties.innerHTML = html;
}

// Make function global for onclick
window.showColumnProperties = showColumnProperties;

// Relationship functionality
let table1Data = null;
let table2Data = null;
let table2File = null;
let relationships = [];
let isCreatingRelationship = false;
let selectedSourceColumn = null;
let selectedTargetColumn = null;

// Relationship controls
const relationshipControls = document.getElementById('relationshipControls');
const relationshipType = document.getElementById('relationshipType');
const cancelRelationshipBtn = document.getElementById('cancelRelationshipBtn');
const saveRelationshipBtn = document.getElementById('saveRelationshipBtn');
const relationshipStatus = document.getElementById('relationshipStatus');
const existingRelationships = document.getElementById('existingRelationships');
const relationshipsList = document.getElementById('relationshipsList');
const relationshipLines = document.getElementById('relationshipLines');
const modelViewBackBtn = document.getElementById('modelViewBackBtn');

// Render two tables in model view
function renderTwoTableModelView() {
  if (!currentReportData && !table2Data) return;
  
  const t1 = currentReportData;
  const t2 = table2Data;
  
  let html = `
    <div class="two-tables-layout">
      <!-- Table 1 -->
      <div class="table-box" id="table1Box" data-table="1">
        <h5>📋 ${t1?.filename || 'Table 1'}</h5>
        <ul class="table-columns" id="table1Columns">
  `;
  
  if (t1?.column_stats) {
    t1.column_stats.forEach((col, index) => {
      const isPK = index === 0;
      const iconClass = isPK ? 'pk' : '';
      const iconText = isPK ? 'PK' : (col.type === 'integer' || col.type === 'float' ? '#' : 'T');
      
      html += `
        <li data-column="${col.column}" data-table="1" data-type="${col.type}" onclick="selectColumnForRelationship(this)">
          <span class="col-icon ${iconClass}">${iconText}</span>
          <span>${col.column}</span>
          <span style="margin-left: auto; color: var(--muted); font-size: 10px;">${col.type}</span>
        </li>
      `;
    });
  }
  
  html += `
        </ul>
      </div>
      
      <!-- Table 2 -->
      <div class="table-box" id="table2Box" data-table="2" style="background: rgba(61, 220, 151, 0.1); border-color: rgba(61, 220, 151, 0.3);">
        <h5 style="color: var(--ok);">📋 ${t2?.filename || 'Table 2'}</h5>
        <ul class="table-columns" id="table2Columns">
  `;
  
  if (t2?.column_stats) {
    t2.column_stats.forEach((col, index) => {
      const isPK = index === 0;
      const iconClass = isPK ? 'pk' : '';
      const iconText = isPK ? 'PK' : (col.type === 'integer' || col.type === 'float' ? '#' : 'T');
      
      html += `
        <li data-column="${col.column}" data-table="2" data-type="${col.type}" onclick="selectColumnForRelationship(this)">
          <span class="col-icon ${iconClass}">${iconText}</span>
          <span>${col.column}</span>
          <span style="margin-left: auto; color: var(--muted); font-size: 10px;">${col.type}</span>
        </li>
      `;
    });
  }
  
  html += `
        </ul>
      </div>
    </div>
  `;
  
  modelDiagram.innerHTML = html;
  
  // Re-add SVG layer
  modelDiagram.innerHTML += '<svg id="relationshipLines" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1;"></svg>';
  
  // Draw existing relationships
  drawRelationshipLines();
}

// Start relationship creation
function startRelationshipCreation() {
  isCreatingRelationship = true;
  selectedSourceColumn = null;
  selectedTargetColumn = null;
  
  // Reset dropdown to first option
  relationshipType.value = 'one-to-one';
  
  // Update badge to match
  const badge = document.getElementById('relationshipTypeBadge');
  badge.textContent = 'ONE TO ONE';
  badge.style.background = '#7C5CFF';
  
  relationshipControls.hidden = false;
  document.getElementById('table1Box').classList.add('selecting');
  relationshipStatus.textContent = "Step 1: Click a column from Table 1 (source)";
  saveRelationshipBtn.disabled = true;
}

// Update relationship type badge when dropdown changes
relationshipType?.addEventListener('change', () => {
  const type = relationshipType.value;
  const badge = document.getElementById('relationshipTypeBadge');
  const colors = {
    'one-to-one': '#7C5CFF',
    'one-to-many': '#3DDC97',
    'many-to-many': '#FFB347'
  };
  const labels = {
    'one-to-one': 'ONE TO ONE',
    'one-to-many': 'ONE TO MANY',
    'many-to-many': 'MANY TO MANY'
  };
  
  badge.textContent = labels[type];
  badge.style.background = colors[type];
  
  if (selectedSourceColumn && selectedTargetColumn) {
    drawPreviewLine();
  }
});

// Global function to update relationship badge
window.updateRelationshipBadge = function() {
  const type = document.getElementById('relationshipType').value;
  const badge = document.getElementById('relationshipTypeBadge');
  const colors = {
    'one-to-one': '#7C5CFF',
    'one-to-many': '#3DDC97',
    'many-to-many': '#FFB347'
  };
  const labels = {
    'one-to-one': 'ONE TO ONE',
    'one-to-many': 'ONE TO MANY',
    'many-to-many': 'MANY TO MANY'
  };
  
  badge.textContent = labels[type];
  badge.style.background = colors[type];
  
  // Also update preview line if both columns selected
  if (selectedSourceColumn && selectedTargetColumn) {
    drawPreviewLine();
  }
};

// Global function for column selection
window.selectColumnForRelationship = function(element) {
  const colName = element.dataset.column;
  const tableNum = element.dataset.table;
  
  // Always show properties first
  const data = tableNum === '1' ? currentReportData : table2Data;
  if (data && colName) {
    showColumnPropertiesFromTable(colName, data);
  }
  
  // If in relationship creation mode, also handle relationship selection
  if (!isCreatingRelationship) {
    return;
  }
  
  if (!selectedSourceColumn && tableNum === '1') {
    // Select source from table 1
    selectedSourceColumn = { table: 1, column: colName, element: element };
    element.classList.add('selected-source');
    
    // Switch to table 2 selection
    document.getElementById('table1Box').classList.remove('selecting');
    document.getElementById('table2Box').classList.add('selecting');
    relationshipStatus.textContent = "Step 2: Click a column from Table 2 (target)";
    
    // Highlight all columns in table 2
    document.querySelectorAll('#table2Columns li').forEach(li => li.classList.add('selecting'));
    
  } else if (selectedSourceColumn && !selectedTargetColumn && tableNum === '2') {
    // Select target from table 2
    selectedTargetColumn = { table: 2, column: colName, element: element };
    element.classList.add('selected-target');
    
    document.getElementById('table2Box').classList.remove('selecting');
    document.querySelectorAll('#table2Columns li').forEach(li => li.classList.remove('selecting'));
    
    relationshipStatus.textContent = `Creating: ${selectedSourceColumn.column} → ${selectedTargetColumn.column}`;
    saveRelationshipBtn.disabled = false;
    
    // Draw preview line
    drawPreviewLine();
  }
};

// Draw preview line between selected columns
function drawPreviewLine() {
  if (!selectedSourceColumn || !selectedTargetColumn) return;
  
  const svg = document.getElementById('relationshipLines');
  const sourceRect = selectedSourceColumn.element.getBoundingClientRect();
  const targetRect = selectedTargetColumn.element.getBoundingClientRect();
  const diagramRect = modelDiagram.getBoundingClientRect();
  
  const x1 = sourceRect.right - diagramRect.left;
  const y1 = sourceRect.top + sourceRect.height / 2 - diagramRect.top;
  const x2 = targetRect.left - diagramRect.left;
  const y2 = targetRect.top + targetRect.height / 2 - diagramRect.top;
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  
  const type = relationshipType.value;
  const strokeColor = type === 'one-to-one' ? '#7C5CFF' : type === 'one-to-many' ? '#3DDC97' : '#FFB347';
  const dashArray = type === 'many-to-many' ? '8,4' : '';
  const typeLabel = type === 'one-to-one' ? '1:1' : type === 'one-to-many' ? '1:N' : 'N:M';
  
  svg.innerHTML = `
    <defs>
      <marker id="arrowhead-${type}" markerWidth="12" markerHeight="8" refX="10" refY="4" orient="auto">
        <polygon points="0 0, 12 4, 0 8" fill="${strokeColor}"/>
      </marker>
    </defs>
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="relationship-line ${type}"
          stroke="${strokeColor}" marker-end="url(#arrowhead-${type})"
          stroke-dasharray="${dashArray}" />
    <text x="${midX}" y="${midY - 8}" class="relationship-label">${typeLabel}</text>
  `;
}

// Save relationship
saveRelationshipBtn?.addEventListener('click', () => {
  if (!selectedSourceColumn || !selectedTargetColumn) return;
  
  const relationship = {
    id: Date.now(),
    type: relationshipType.value,
    source: { table: 1, column: selectedSourceColumn.column },
    target: { table: 2, column: selectedTargetColumn.column }
  };
  
  relationships.push(relationship);
  
  // Show success and restart for next relationship
  relationshipStatus.textContent = `✅ Saved: ${relationship.source.column} → ${relationship.target.column} (${relationshipType.value})`;
  
  // Keep relationship creation mode active
  isCreatingRelationship = true;
  
  // Clear selection but keep creating more relationships
  selectedSourceColumn = null;
  selectedTargetColumn = null;
  document.querySelectorAll('.table-columns li').forEach(li => {
    li.classList.remove('selecting', 'selected-source', 'selected-target');
  });
  saveRelationshipBtn.disabled = true;
  
  // Clear preview line
  const svg = document.getElementById('relationshipLines');
  if (svg) svg.innerHTML = '';
  
  // Restart for next relationship - start from table 1 again
  document.getElementById('table1Box').classList.add('selecting');
  document.getElementById('table2Box').classList.remove('selecting');
  relationshipStatus.textContent += " | Step 1: Click a column from Table 1 (source)";
  
  // Keep controls visible
  relationshipControls.hidden = false;
  
  // Update UI
  renderRelationshipsList();
  drawRelationshipLines();
});

// Cancel relationship creation
cancelRelationshipBtn?.addEventListener('click', () => {
  resetRelationshipCreation();
});

// Reset relationship creation state
function resetRelationshipCreation() {
  isCreatingRelationship = false;
  selectedSourceColumn = null;
  selectedTargetColumn = null;
  
  document.querySelectorAll('.table-box').forEach(box => box.classList.remove('selecting'));
  document.querySelectorAll('.table-columns li').forEach(li => {
    li.classList.remove('selecting', 'selected-source', 'selected-target');
  });
  
  relationshipControls.hidden = true;
  relationshipStatus.textContent = '';
  
  // Keep existing relationships visible
  drawRelationshipLines();
}

// Render relationships list
function renderRelationshipsList() {
  if (relationships.length === 0) {
    existingRelationships.hidden = true;
    return;
  }
  
  existingRelationships.hidden = false;
  
  let html = '';
  relationships.forEach(rel => {
    const typeLabels = {
      'one-to-one': '1:1',
      'one-to-many': '1:N',
      'many-to-many': 'N:M'
    };
    const typeNames = {
      'one-to-one': 'One to One',
      'one-to-many': 'One to Many',
      'many-to-many': 'Many to Many'
    };
    
    html += `
      <div class="relationship-badge" onclick="showRelationshipProperties(${rel.id})" style="cursor: pointer;">
        <span class="type">${typeLabels[rel.type]}</span>
        <span class="columns">${rel.source.column} → ${rel.target.column}</span>
        <span class="delete-btn" onclick="event.stopPropagation(); deleteRelationship(${rel.id})">×</span>
      </div>
    `;
  });
  
  relationshipsList.innerHTML = html;
}

// Show relationship properties in the properties panel
window.showRelationshipProperties = function(id) {
  const rel = relationships.find(r => r.id === id);
  if (!rel) return;
  
  const typeNames = {
    'one-to-one': 'One to One',
    'one-to-many': 'One to Many',
    'many-to-many': 'Many to Many'
  };
  const typeDescriptions = {
    'one-to-one': 'Each row in Table 1 matches exactly one row in Table 2',
    'one-to-many': 'Each row in Table 1 can match multiple rows in Table 2',
    'many-to-many': 'Multiple rows in Table 1 can match multiple rows in Table 2'
  };
  
  let html = `
    <h4>🔗 Relationship Properties</h4>
    <div class="property-row">
      <span>Type</span>
      <strong style="color: ${rel.type === 'one-to-one' ? '#7C5CFF' : rel.type === 'one-to-many' ? '#3DDC97' : '#FFB347'}">${typeNames[rel.type]}</strong>
    </div>
    <div class="property-row">
      <span>Source</span>
      <strong>Table 1: ${rel.source.column}</strong>
    </div>
    <div class="property-row">
      <span>Target</span>
      <strong>Table 2: ${rel.target.column}</strong>
    </div>
    <div style="margin-top: 12px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 6px; font-size: 12px; color: var(--muted);">
      ${typeDescriptions[rel.type]}
    </div>
  `;
  
  modelProperties.innerHTML = html;
};

// Delete relationship
window.deleteRelationship = function(id) {
  relationships = relationships.filter(r => r.id !== id);
  renderRelationshipsList();
  drawRelationshipLines();
};

// Draw all relationship lines
function drawRelationshipLines() {
  const svg = document.getElementById('relationshipLines');
  if (!svg || relationships.length === 0) return;
  
  let html = '<defs>';
  
  // Define markers for each type
  const typeColors = {
    'one-to-one': '#7C5CFF',
    'one-to-many': '#3DDC97',
    'many-to-many': '#FFB347'
  };
  
  Object.entries(typeColors).forEach(([type, color]) => {
    html += `
      <marker id="arrow-${type}" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="${color}"/>
      </marker>
    `;
  });
  
  html += '</defs>';
  
  const diagramRect = modelDiagram.getBoundingClientRect();
  
  const typeLabels = {
      'one-to-one': '1:1',
      'one-to-many': '1:N',
      'many-to-many': 'N:M'
    };
  
  relationships.forEach(rel => {
    const sourceLi = document.querySelector(`#table1Columns li[data-column="${rel.source.column}"]`);
    const targetLi = document.querySelector(`#table2Columns li[data-column="${rel.target.column}"]`);
    
    if (sourceLi && targetLi) {
      const sourceRect = sourceLi.getBoundingClientRect();
      const targetRect = targetLi.getBoundingClientRect();
      
      const x1 = sourceRect.right - diagramRect.left;
      const y1 = sourceRect.top + sourceRect.height / 2 - diagramRect.top;
      const x2 = targetRect.left - diagramRect.left;
      const y2 = targetRect.top + targetRect.height / 2 - diagramRect.top;
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      
      const color = typeColors[rel.type];
      const dashArray = rel.type === 'many-to-many' ? '8,4' : '';
      const label = typeLabels[rel.type];
      
      html += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="relationship-line ${rel.type}"
                     stroke="${color}" marker-end="url(#arrow-${rel.type})"
                     stroke-dasharray="${dashArray}" />`;
      html += `<text x="${midX}" y="${midY - 8}" class="relationship-label">${label}</text>`;
    }
  });
  
  svg.innerHTML = html;
}

// Show column properties from specific table
function showColumnPropertiesFromTable(columnName, data) {
  const col = data.column_stats.find(c => c.column === columnName);
  if (!col) return;
  
  let html = `
    <h4>🔧 ${col.column} Properties</h4>
    <div class="property-row">
      <span>Data Type</span>
      <strong>${col.type}</strong>
    </div>
    <div class="property-row">
      <span>Unique Values</span>
      <strong>${col.unique_values?.toLocaleString() || 'N/A'}</strong>
    </div>
    <div class="property-row">
      <span>Missing Values</span>
      <strong style="color: ${col.missing_count > 0 ? 'var(--danger)' : 'var(--ok)'}">${col.missing_count || 0}</strong>
    </div>
  `;
  
  if (col.min !== undefined) {
    html += `
      <div class="property-row"><span>Min</span><strong>${col.min.toFixed(2)}</strong></div>
      <div class="property-row"><span>Max</span><strong>${col.max.toFixed(2)}</strong></div>
      <div class="property-row"><span>Mean</span><strong>${col.mean.toFixed(2)}</strong></div>
    `;
  }
  
  if (col.most_common) {
    html += `
      <div class="property-row"><span>Most Common</span><strong>${col.most_common}</strong></div>
      <div class="property-row"><span>Count</span><strong>${col.most_common_count}</strong></div>
    `;
  }
  
  modelProperties.innerHTML = html;
}

// Model View Back button
modelViewBackBtn?.addEventListener('click', () => {
  modelViewCard.hidden = true;
  document.getElementById('powerBIEntryCard').hidden = false;
  
  // Reset state
  table2Data = null;
  relationships = [];
  resetRelationshipCreation();
  existingRelationships.hidden = true;
  
  document.getElementById('powerBIEntryCard').scrollIntoView({ behavior: 'smooth' });
});

// Power BI Report View functionality
