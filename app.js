const API_BASE = '/api/brandguard';

const ui = {
  role: document.getElementById('userRole'),
  user: document.getElementById('userName'),
  contentTitle: document.getElementById('contentTitle'),
  contentChannel: document.getElementById('contentChannel'),
  contentBody: document.getElementById('contentBody'),
  deterministicOnly: document.getElementById('deterministicOnly'),
  imageInput: document.getElementById('imageInput'),
  altTextInput: document.getElementById('altTextInput'),
  textColorInput: document.getElementById('textColorInput'),
  backgroundColorInput: document.getElementById('backgroundColorInput'),
  submitStatus: document.getElementById('submitStatus'),
  submitBtn: document.getElementById('submitContentBtn'),
  imageCheckBtn: document.getElementById('imageCheckBtn'),
  loadSampleBtn: document.getElementById('loadSampleBtn'),
  findingsList: document.getElementById('findingsList'),
  queueList: document.getElementById('queueList'),
  adminKind: document.getElementById('adminKind'),
  adminPayload: document.getElementById('adminPayload'),
  adminList: document.getElementById('adminList'),
  saveAdminBtn: document.getElementById('saveAdminBtn'),
  loadAdminBtn: document.getElementById('loadAdminBtn'),
  tabButtons: [...document.querySelectorAll('[data-tab]')],
  panels: [...document.querySelectorAll('[data-panel]')],
  metricOpen: document.getElementById('metricOpen'),
  metricHigh: document.getElementById('metricHigh'),
  metricApproval: document.getElementById('metricApproval'),
  summaryCategory: document.getElementById('summaryCategory'),
  summaryGap: document.getElementById('summaryGap'),
  insightDismissal: document.getElementById('insightDismissal'),
  insightStale: document.getElementById('insightStale'),
  insightTime: document.getElementById('insightTime'),
  categoryChart: document.getElementById('categoryChart'),
  ruleChart: document.getElementById('ruleChart'),
};

const state = {
  findings: [],
  queue: [],
  insight: null,
};

function setStatus(node, message, tone = 'info') {
  node.className = `status ${tone}`;
  node.textContent = message;
}

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-User': ui.user.value.trim() || 'anonymous',
    'X-Role': ui.role.value || 'creator',
  };
}

function showTab(name) {
  ui.panels.forEach((panel) => {
    const isMatch = panel.dataset.panel === name;
    panel.style.display = isMatch ? '' : 'none';
  });

  ui.tabButtons.forEach((button) => {
    const selected = button.dataset.tab === name;
    button.setAttribute('aria-selected', String(selected));
  });
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: getHeaders(),
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error || 'Request failed.');
  }
  return data;
}

function isReviewerRole() {
  return ['reviewer', 'admin', 'manager'].includes((ui.role?.value || 'creator').toLowerCase());
}

function isAdminRole() {
  return (ui.role?.value || 'creator').toLowerCase() === 'admin';
}

function renderFindings(list, emptyMessage = 'No findings yet. Submit content to review.') {
  const items = Array.isArray(list) ? list : [];
  if (!items.length) {
    ui.findingsList.innerHTML = `<div class="empty-state">${emptyMessage}</div>`;
    return;
  }

  const findings = items;

  ui.findingsList.innerHTML = findings.map((finding) => {
    const severity = (finding.severity || 'low').toLowerCase();
    const sourceText = finding.source_id ? `${finding.source_type || 'rule'}:${finding.source_id}` : 'source: none';
    const excerpt = finding.text ? finding.text : 'Review note';
    const confidenceText = (finding.confidence || '').toLowerCase() === 'low' ? '<span class="badge source">Low confidence</span>' : '';
    return `
      <article class="finding-card">
        <div>
          <span class="badge severity-${severity}">${(finding.severity || 'low').toUpperCase()}</span>
          <span class="badge source">${sourceText}</span>
          <span class="badge rule">${finding.category || 'general'}</span>
          ${confidenceText}
        </div>
        <h4>${finding.category || 'General'} finding</h4>
        <div class="finding-text"><mark>${excerpt}</mark></div>
        <p>${finding.explanation || 'No explanation provided.'}</p>
        <p><strong>Suggestion:</strong> ${finding.suggestion || 'No suggestion available.'}</p>
        <div class="finding-actions">
          <button class="ghost-btn" type="button" data-decision="accept" data-finding-id="${finding.id}">Accept</button>
          <button class="secondary-btn" type="button" data-decision="edit" data-finding-id="${finding.id}">Edit</button>
          <button class="ghost-btn" type="button" data-decision="dismiss" data-finding-id="${finding.id}">Dismiss</button>
        </div>
      </article>
    `;
  }).join('');

  document.querySelectorAll('[data-decision]').forEach((button) => {
    button.addEventListener('click', async () => {
      const decision = button.dataset.decision;
      const findingId = button.dataset.findingId;
      let reason = '';
      let editedText = '';

      if (decision === 'dismiss') {
        reason = window.prompt('Reason for dismissal:', 'Please revise the wording to align with policy guidance.');
        if (reason === null) {
          setStatus(ui.submitStatus, 'Dismissal requires a reason.', 'error');
          return;
        }
        reason = reason.trim();
        if (!reason) {
          setStatus(ui.submitStatus, 'Dismissal requires a reason before saving.', 'error');
          return;
        }
      }

      if (decision === 'edit') {
        const card = button.closest('.finding-card');
        const currentText = card?.querySelector('.finding-text')?.textContent?.trim() || '';
        editedText = window.prompt('Suggested revised text:', currentText) || '';
        if (editedText === null || editedText.trim() === '') {
          setStatus(ui.submitStatus, 'Edit requires a replacement value.', 'error');
          return;
        }
        reason = editedText.trim();
      }

      try {
        await fetchJson(`${API_BASE}/findings/${findingId}/decision`, {
          method: 'POST',
          body: JSON.stringify({ decision, reason, edited_text: editedText }),
        });
        setStatus(ui.submitStatus, `Finding marked as ${decision}.`, 'success');

        if (decision !== 'edit') {
          state.findings = state.findings.filter((item) => item.id !== findingId);
          renderFindings(state.findings);
        } else {
          const card = button.closest('.finding-card');
          if (card) {
            card.querySelector('.finding-text').innerHTML = `<mark>${editedText}</mark>`;
          }
        }
      } catch (error) {
        setStatus(ui.submitStatus, error.message, 'error');
      }
    });
  });
}

function renderQueue(list) {
  if (!list.length) {
    ui.queueList.innerHTML = '<div class="empty-state">No content is waiting for review.</div>';
    return;
  }

  ui.queueList.innerHTML = list.map((item) => `
    <article class="queue-item">
      <h4>${item.title || 'Untitled content'}</h4>
      <p>${(item.body || '').slice(0, 180)}${(item.body || '').length > 180 ? '…' : ''}</p>
      <div class="inline-actions" style="margin-top: 12px;">
        <button class="secondary-btn" type="button" data-queue-approve="${item.id}">Approve</button>
        <button class="ghost-btn" type="button" data-queue-request="${item.id}">Request changes</button>
      </div>
    </article>
  `).join('');

  document.querySelectorAll('[data-queue-approve]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.queueApprove;
      try {
        await fetchJson(`${API_BASE}/content/${id}/approval`, {
          method: 'POST',
          body: JSON.stringify({ decision: 'approve', note: 'Approved from BrandGuard UI' }),
        });
        setStatus(ui.submitStatus, 'Content approved.', 'success');
        loadQueue();
      } catch (error) {
        setStatus(ui.submitStatus, error.message, 'error');
      }
    });
  });

  document.querySelectorAll('[data-queue-request]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.queueRequest;
      try {
        await fetchJson(`${API_BASE}/content/${id}/approval`, {
          method: 'POST',
          body: JSON.stringify({ decision: 'request_changes', note: 'Changes requested via BrandGuard UI' }),
        });
        setStatus(ui.submitStatus, 'Changes requested.', 'success');
        loadQueue();
      } catch (error) {
        setStatus(ui.submitStatus, error.message, 'error');
      }
    });
  });
}

function renderAdminList(items) {
  if (!items.length) {
    ui.adminList.innerHTML = '<div class="empty-state">No items in this knowledge set.</div>';
    return;
  }

  ui.adminList.innerHTML = items.map((item) => `
    <article class="rule-item">
      <h4>${item.id || item.preferred || 'Item'}</h4>
      <p>${item.text || item.statement || item.note || item.preferred || ''}</p>
    </article>
  `).join('');
}

function buildSummaryFromFindings(findings = []) {
  const categoryCounts = new Map();
  const ruleCounts = new Map();

  for (const finding of findings) {
    const category = (finding.category || 'general').toLowerCase();
    categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);

    const ruleId = finding.source_id || 'none';
    if (ruleId !== 'none') {
      ruleCounts.set(ruleId, (ruleCounts.get(ruleId) || 0) + 1);
    }
  }

  const categoryBreakdown = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1]);
  const ruleBreakdown = [...ruleCounts.entries()].sort((a, b) => b[1] - a[1]);

  return {
    open_items: findings.length,
    high_severity_count: findings.filter((item) => ['high', 'critical'].includes((item.severity || '').toLowerCase())).length,
    approval_rate: 0,
    most_common_category: categoryBreakdown[0]?.[0] || 'none',
    flagged_rule_gap: ruleBreakdown[0]?.[0] || 'none',
    dismissal_rate: 0,
    stale_facts: 0,
    avg_approval_days: 0,
    category_breakdown: categoryBreakdown,
    rule_breakdown: ruleBreakdown,
  };
}

function renderInsights(payload) {
  const dismissRate = Number(payload?.dismissal_rate ?? 0);
  const stale = payload?.stale_facts ?? 0;
  const time = payload?.avg_approval_days ?? 0;
  const approvalRateRaw = Number(payload?.approval_rate ?? 0);
  const approvalRate = approvalRateRaw > 1 ? approvalRateRaw / 100 : approvalRateRaw;
  const dismissalRate = dismissRate > 1 ? dismissRate / 100 : dismissRate;

  ui.metricOpen.textContent = String(payload?.open_items ?? 0);
  ui.metricHigh.textContent = String(payload?.high_severity_count ?? 0);
  ui.metricApproval.textContent = `${Math.round((approvalRate || 0) * 100)}%`;
  ui.summaryCategory.textContent = payload?.most_common_category || '—';
  ui.summaryGap.textContent = payload?.flagged_rule_gap || '—';
  ui.insightDismissal.textContent = `${Math.round((dismissalRate || 0) * 100)}%`;
  ui.insightStale.textContent = String(stale);
  ui.insightTime.textContent = `${time}d`;

  const makeBar = (label, value, max = 100) => {
    const safeValue = Number.isFinite(value) ? value : 0;
    const safeMax = Number.isFinite(max) && max > 0 ? max : 1;
    const width = Math.max(8, Math.min(100, (safeValue / safeMax) * 100));
    return `<div style="margin-top:8px;"><small>${label}</small><div style="height:10px;border-radius:999px;background:rgba(255,255,255,0.05);margin-top:6px;overflow:hidden"><div style="height:100%;width:${width}%;background:linear-gradient(90deg,#7c5cff,#35d2ff)"></div></div></div>`;
  };

  const categorySeries = payload?.category_breakdown || [];
  const ruleSeries = payload?.rule_breakdown || [];
  const categoryMax = Math.max(...categorySeries.map(([, itemValue]) => Number(itemValue) || 0), 1);
  const ruleMax = Math.max(...ruleSeries.map(([, itemValue]) => Number(itemValue) || 0), 1);

  ui.categoryChart.innerHTML = categorySeries.length ? categorySeries.map(([key, val]) => makeBar(key, val, categoryMax)).join('') : '<div class="empty-state">No category data yet.</div>';
  ui.ruleChart.innerHTML = ruleSeries.length ? ruleSeries.map(([key, val]) => makeBar(key, val, ruleMax)).join('') : '<div class="empty-state">No rule data yet.</div>';
}

async function loadInsights() {
  try {
    const payload = await fetchJson(`${API_BASE}/insights`);
    renderInsights(payload);
  } catch (error) {
    setStatus(ui.submitStatus, error.message, 'error');
  }
}

async function submitContent() {
  try {
    const payload = {
      title: ui.contentTitle.value.trim(),
      channel: ui.contentChannel.value,
      body: ui.contentBody.value.trim(),
      deterministic_only: ui.deterministicOnly.checked,
    };

    if (!payload.body) {
      throw new Error('Please enter content to review.');
    }

    setStatus(ui.submitStatus, 'Submitting content...', 'info');
    const response = await fetchJson(`${API_BASE}/content`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const findings = Array.isArray(response.findings) ? response.findings : [];
    state.findings = findings;
    renderFindings(findings, findings.length ? 'No findings detected for this content.' : (response.notice || 'No findings yet. Submit content to review.'));
    renderInsights(buildSummaryFromFindings(findings));
    setStatus(ui.submitStatus, response.notice || (findings.length ? 'Review complete.' : 'Review complete: no findings detected.'), findings.length ? 'success' : 'info');
    showTab('findings');
  } catch (error) {
    setStatus(ui.submitStatus, error.message, 'error');
  }
}

async function loadQueue() {
  if (!isReviewerRole()) {
    ui.queueList.innerHTML = '<div class="empty-state">Review queue is available for managers, reviewers, and admins.</div>';
    return;
  }

  try {
    const data = await fetchJson(`${API_BASE}/queue`);
    state.queue = data.queue || [];
    renderQueue(state.queue);
  } catch (error) {
    setStatus(ui.submitStatus, error.message, 'error');
  }
}

async function loadAdminList() {
  if (!isAdminRole()) {
    ui.adminList.innerHTML = '<div class="empty-state">Admin knowledge tools are available only to the admin role.</div>';
    return;
  }

  const kind = ui.adminKind.value;
  try {
    const data = await fetchJson(`${API_BASE}/admin/${kind}`);
    renderAdminList(data.rules || data.facts || data.terms || []);
  } catch (error) {
    setStatus(ui.submitStatus, error.message, 'error');
  }
}

async function saveAdminItem() {
  const kind = ui.adminKind.value;
  const payload = ui.adminPayload.value.trim();
  if (!payload) {
    setStatus(ui.submitStatus, 'Paste a JSON object before saving.', 'error');
    return;
  }

  try {
    const parsed = JSON.parse(payload);
    await fetchJson(`${API_BASE}/admin/${kind}`, {
      method: 'POST',
      body: JSON.stringify(parsed),
    });
    setStatus(ui.submitStatus, 'Knowledge item saved.', 'success');
    ui.adminPayload.value = '';
    await loadAdminList();
  } catch (error) {
    setStatus(ui.submitStatus, error.message, 'error');
  }
}

function loadSample() {
  ui.contentTitle.value = 'Lumio launch teaser';
  ui.contentChannel.value = 'social';
  ui.contentBody.value = 'Lumio is the best team workspace and guarantees 100% faster teamwork with zero risk. Everyone loves it.';
  ui.altTextInput.value = 'Lumio product workspace dashboard preview';
  ui.textColorInput.value = '#F5F7FF';
  ui.backgroundColorInput.value = '#05070F';
  ui.deterministicOnly.checked = false;
}

async function checkImageAccessibility() {
  const file = ui.imageInput.files && ui.imageInput.files[0];
  if (!file) {
    setStatus(ui.submitStatus, 'Upload a PNG or JPG file before checking accessibility.', 'error');
    return;
  }

  const altText = ui.altTextInput.value.trim();
  if (!altText) {
    setStatus(ui.submitStatus, 'Alt text is required for accessibility validation.', 'error');
    return;
  }

  try {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const result = await fetchJson(`${API_BASE}/image-check`, {
          method: 'POST',
          body: JSON.stringify({
            image_base64: reader.result,
            alt_text: altText,
            text_color: ui.textColorInput.value,
            background_color: ui.backgroundColorInput.value,
          }),
        });
        const findings = Array.isArray(result.findings) ? result.findings : [];
        state.findings = findings;
        renderFindings(findings, findings.length ? 'No findings detected for this content.' : 'Image accessibility review complete: no issues found.');
        renderInsights(buildSummaryFromFindings(findings));
        setStatus(ui.submitStatus, `Image accessibility review complete: ${findings.length} findings.`, findings.length ? 'info' : 'success');
        showTab('findings');
      } catch (error) {
        setStatus(ui.submitStatus, error.message, 'error');
      }
    };
    reader.readAsDataURL(file);
  } catch (error) {
    setStatus(ui.submitStatus, error.message, 'error');
  }
}

ui.role.addEventListener('change', () => {
  if (ui.role.value === 'admin') {
    loadAdminList();
  } else {
    ui.adminList.innerHTML = '<div class="empty-state">Admin knowledge tools are available only to the admin role.</div>';
  }

  if (['reviewer', 'admin', 'manager'].includes(ui.role.value)) {
    loadQueue();
  } else {
    ui.queueList.innerHTML = '<div class="empty-state">Review queue is available for managers, reviewers, and admins.</div>';
  }
});

ui.tabButtons.forEach((button) => {
  button.addEventListener('click', () => {
    showTab(button.dataset.tab);
    if (button.dataset.tab === 'insights') {
      loadInsights();
    }
    if (button.dataset.tab === 'review') {
      loadQueue();
    }
    if (button.dataset.tab === 'admin') {
      loadAdminList();
    }
  });
});

ui.submitBtn.addEventListener('click', submitContent);
ui.imageCheckBtn.addEventListener('click', checkImageAccessibility);
ui.loadSampleBtn.addEventListener('click', loadSample);
ui.loadAdminBtn.addEventListener('click', loadAdminList);
ui.saveAdminBtn.addEventListener('click', saveAdminItem);

showTab('submit');
loadQueue();
loadAdminList();
loadInsights();
renderFindings(state.findings);
renderInsights({
  open_items: 0,
  high_severity_count: 0,
  approval_rate: 0,
  most_common_category: 'none',
  flagged_rule_gap: 'none',
  dismissal_rate: 0,
  stale_facts: 0,
  avg_approval_days: 0,
  category_breakdown: [],
  rule_breakdown: [],
});
