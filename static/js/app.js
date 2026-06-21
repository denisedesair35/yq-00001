const API = '/api';
let currentUser = null;
let categories = [];
let statusMap = { tool: {}, borrow: {} };
let currentBorrowTool = null;
let currentApproveRecord = null;
let currentStatusTool = null;

async function http(url, options = {}) {
  const opts = { headers: { 'Content-Type': 'application/json' }, ...options };
  if (opts.body && typeof opts.body === 'object') opts.body = JSON.stringify(opts.body);
  try {
    const res = await fetch(API + url, opts);
    return await res.json();
  } catch (e) {
    showToast('网络错误: ' + e.message, 'error');
    return { success: false, msg: e.message };
  }
}

function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.className = 'toast ' + type + ' show';
  t.textContent = msg;
  setTimeout(() => t.classList.remove('show'), 2500);
}

function openModal(id) { document.getElementById(id).classList.add('show'); }
function closeModal(id) {
  document.getElementById(id).classList.remove('show');
  if (id === 'approveModal') document.getElementById('rejectArea').classList.add('hidden');
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-' + name));
  if (name === 'tools') loadTools();
  else if (name === 'borrows') loadBorrows();
  else if (name === 'dashboard') loadDashboard();
  else if (name === 'register') { initFormCategories(); }
}

function statusClassTool(s) {
  return 'status-badge status-' + s;
}
function statusTextTool(s) {
  return statusMap.tool[s] || s;
}
function statusClassBorrow(s) {
  return 'status-badge status-' + s;
}
function statusTextBorrow(s) {
  return statusMap.borrow[s] || s;
}

function showLogin() {
  document.getElementById('loginName').value = currentUser ? currentUser.username : '';
  document.getElementById('loginPhone').value = currentUser ? (currentUser.phone || '') : '';
  openModal('loginModal');
}

async function doLogin() {
  const username = document.getElementById('loginName').value.trim();
  const phone = document.getElementById('loginPhone').value.trim();
  if (!username) { showToast('请输入用户名', 'error'); return; }
  const res = await http('/users/login', { method: 'POST', body: { username, phone } });
  if (res.success) {
    currentUser = res.user;
    localStorage.setItem('tool_user', JSON.stringify(currentUser));
    updateUserDisplay();
    closeModal('loginModal');
    showToast('登录成功', 'success');
    loadTools();
  } else {
    showToast(res.msg || '登录失败', 'error');
  }
}

function updateUserDisplay() {
  const el = document.getElementById('currentUser');
  if (!currentUser) { el.textContent = '未登录'; return; }
  const role = currentUser.role === 'admin' ? '管理员' : '居民';
  el.textContent = `${currentUser.username}（${role}）`;
}

function ensureLogin() {
  if (!currentUser) { showLogin(); return false; }
  return true;
}

function isAdmin() {
  return currentUser && currentUser.role === 'admin';
}

function initFormCategories() {
  const sel = document.getElementById('toolCategory');
  sel.innerHTML = '<option value="">请选择分类</option>' +
    categories.map(c => `<option value="${c}">${c}</option>`).join('');
  const filter = document.getElementById('filterCategory');
  filter.innerHTML = '<option value="">全部分类</option>' +
    categories.map(c => `<option value="${c}">${c}</option>`).join('');
}

async function submitTool(e) {
  e.preventDefault();
  if (!ensureLogin()) return;
  const data = {
    name: document.getElementById('toolName').value.trim(),
    category: document.getElementById('toolCategory').value,
    max_days: parseInt(document.getElementById('toolMaxDays').value),
    deposit: parseFloat(document.getElementById('toolDeposit').value),
    location: document.getElementById('toolLocation').value.trim(),
    owner_id: currentUser.id,
    owner_name: currentUser.username,
    description: document.getElementById('toolDesc').value.trim()
  };
  const res = await http('/tools', { method: 'POST', body: data });
  if (res.success) {
    showToast('登记成功！', 'success');
    document.getElementById('toolForm').reset();
    switchTab('tools');
  } else {
    showToast(res.msg || '登记失败', 'error');
  }
}

async function loadTools() {
  const kw = document.getElementById('searchKeyword').value;
  const cat = document.getElementById('filterCategory').value;
  const st = document.getElementById('filterStatus').value;
  const q = new URLSearchParams();
  if (kw) q.set('keyword', kw);
  if (cat) q.set('category', cat);
  if (st) q.set('status', st);
  const list = await http('/tools' + (q.toString() ? '?' + q.toString() : ''));
  const container = document.getElementById('toolsList');
  if (!list.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📦</div><p>暂无工具，点击"登记新工具"来添加第一个共享工具吧~</p></div>`;
    return;
  }
  container.innerHTML = list.map(t => {
    const canBorrow = t.status === 'available' && currentUser && currentUser.id !== t.owner_id;
    const isOwner = currentUser && currentUser.id === t.owner_id;
    const actions = [];
    if (canBorrow) actions.push(`<button class="btn btn-primary btn-sm" onclick="openBorrowModal(${t.id})">申请借用</button>`);
    if (isOwner || isAdmin()) actions.push(`<button class="btn btn-sm" onclick="openStatusModal(${t.id})">管理状态</button>`);
    return `
    <div class="tool-card">
      <div class="tool-header">
        <span class="tool-name">${escapeHtml(t.name)}</span>
        <span class="tool-category">${escapeHtml(t.category)}</span>
      </div>
      <div class="tool-meta">
        <span>⏱️ 可借 ${t.max_days} 天</span>
        <span>💰 押金 ¥${t.deposit}</span>
      </div>
      <div class="tool-meta">
        <span>📍 ${escapeHtml(t.location)}</span>
      </div>
      ${t.description ? `<div class="tool-desc">${escapeHtml(t.description)}</div>` : ''}
      <div class="tool-footer">
        <div class="tool-owner">👤 ${escapeHtml(t.owner_name)}</div>
        <div class="tool-actions">
          <span class="${statusClassTool(t.status)}">${statusTextTool(t.status)}</span>
          ${actions.join('')}
        </div>
      </div>
    </div>`;
  }).join('');
}

async function openBorrowModal(toolId) {
  if (!ensureLogin()) return;
  const tool = await http('/tools/' + toolId);
  if (!tool || tool.id === undefined) { showToast('工具不存在', 'error'); return; }
  currentBorrowTool = tool;
  document.getElementById('borrowToolInfo').innerHTML = `
    <div class="info-name">${escapeHtml(tool.name)}</div>
    <div>📂 分类：${escapeHtml(tool.category)} &nbsp; ⏱️ 最多可借 ${tool.max_days} 天</div>
    <div>💰 押金：¥${tool.deposit} &nbsp; 📍 存放：${escapeHtml(tool.location)}</div>
    <div>👤 登记人：${escapeHtml(tool.owner_name)}</div>
  `;
  document.getElementById('borrowerName').value = currentUser.username;
  document.getElementById('borrowerPhone').value = currentUser.phone || '';
  document.getElementById('borrowReason').value = '';
  openModal('borrowModal');
}

async function submitBorrow() {
  if (!currentBorrowTool) return;
  const data = {
    tool_id: currentBorrowTool.id,
    borrower_id: currentUser.id,
    borrower_name: currentUser.username,
    borrower_phone: document.getElementById('borrowerPhone').value.trim(),
    apply_reason: document.getElementById('borrowReason').value.trim()
  };
  const res = await http('/borrows', { method: 'POST', body: data });
  if (res.success) {
    closeModal('borrowModal');
    showToast('申请提交成功，请等待管理员审核', 'success');
    loadTools();
  } else {
    showToast(res.msg || '提交失败', 'error');
  }
}

async function loadBorrows() {
  const status = document.getElementById('borrowFilter').value;
  const onlyMine = document.getElementById('onlyMyBorrows').checked;
  const q = new URLSearchParams();
  if (status) q.set('status', status);
  if (onlyMine && currentUser) q.set('borrower_id', currentUser.id);
  const list = await http('/borrows' + (q.toString() ? '?' + q.toString() : ''));
  const container = document.getElementById('borrowsList');
  if (!list.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><p>暂无借还记录</p></div>`;
    return;
  }
  container.innerHTML = list.map(r => renderRecord(r)).join('');
}

function renderRecord(r) {
  const actions = [];
  if (r.status === 'pending' && isAdmin()) {
    actions.push(`<button class="btn btn-primary btn-sm" onclick="openApproveModal(${r.id})">审核</button>`);
  }
  if ((r.status === 'approved' || r.status === 'overdue') && (isAdmin() || (currentUser && currentUser.id === r.borrower_id))) {
    actions.push(`<button class="btn btn-success btn-sm" onclick="confirmReturn(${r.id})">确认归还</button>`);
  }
  const overdueBadge = r.status === 'overdue' || r.overdue_days > 0
    ? `<span class="record-overdue">⚠️ 已逾期 ${r.overdue_days} 天</span>` : '';

  return `
  <div class="record-card">
    <div class="record-header">
      <div class="record-title">${escapeHtml(r.tool_name)} ${overdueBadge}</div>
      <span class="${statusClassBorrow(r.status)}">${statusTextBorrow(r.status)}</span>
    </div>
    <div class="record-body">
      <div><b>借用人：</b>${escapeHtml(r.borrower_name)}</div>
      <div><b>工具分类：</b>${escapeHtml(r.tool_category || '-')}</div>
      <div><b>存放位置：</b>${escapeHtml(r.tool_location || '-')}</div>
      <div><b>押金：</b>¥${r.tool_deposit || 0}</div>
      <div><b>申请时间：</b>${r.created_at || '-'}</div>
      ${r.borrow_time ? `<div><b>借出时间：</b>${r.borrow_time}</div>` : ''}
      ${r.expected_return_time ? `<div><b>预计归还：</b>${r.expected_return_time}</div>` : ''}
      ${r.actual_return_time ? `<div><b>实际归还：</b>${r.actual_return_time}</div>` : ''}
    </div>
    ${r.apply_reason ? `<div class="record-reason">📝 借用说明：${escapeHtml(r.apply_reason)}</div>` : ''}
    ${r.reject_reason ? `<div class="record-reason" style="background:#fee2e2;color:#991b1b;">❌ 拒绝原因：${escapeHtml(r.reject_reason)}</div>` : ''}
    <div class="record-footer">
      <div style="font-size:13px;color:#6b7280;">记录ID: #${r.id}</div>
      <div class="tool-actions">${actions.join('')}</div>
    </div>
  </div>`;
}

async function openApproveModal(recordId) {
  const list = await http('/borrows');
  const r = list.find(x => x.id === recordId);
  if (!r) { showToast('记录不存在', 'error'); return; }
  currentApproveRecord = r;
  document.getElementById('approveInfo').innerHTML = `
    <div class="info-name">${escapeHtml(r.tool_name)}</div>
    <div>👤 借用人：${escapeHtml(r.borrower_name)} ${r.borrower_phone ? '(' + escapeHtml(r.borrower_phone) + ')' : ''}</div>
    <div>⏱️ 工具默认可借 ${r.tool_max_days} 天 &nbsp; 💰 押金 ¥${r.tool_deposit}</div>
    ${r.apply_reason ? `<div style="margin-top:6px;">📝 申请说明：${escapeHtml(r.apply_reason)}</div>` : ''}
  `;
  document.getElementById('approveDays').value = r.tool_max_days;
  document.getElementById('rejectReason').value = '';
  document.getElementById('rejectArea').classList.add('hidden');
  openModal('approveModal');
}

function showRejectInput() {
  document.getElementById('rejectArea').classList.remove('hidden');
}

async function doApprove() {
  if (!currentApproveRecord) return;
  const days = parseInt(document.getElementById('approveDays').value) || 0;
  const res = await http(`/borrows/${currentApproveRecord.id}/approve`, { method: 'POST', body: { days } });
  if (res.success) {
    closeModal('approveModal');
    showToast('已同意出借', 'success');
    loadBorrows();
  } else {
    showToast(res.msg || '操作失败', 'error');
  }
}

async function doReject() {
  if (!currentApproveRecord) return;
  const reason = document.getElementById('rejectReason').value.trim();
  const res = await http(`/borrows/${currentApproveRecord.id}/reject`, { method: 'POST', body: { reason } });
  if (res.success) {
    closeModal('approveModal');
    showToast('已拒绝申请', 'success');
    loadBorrows();
  } else {
    showToast(res.msg || '操作失败', 'error');
  }
}

async function confirmReturn(recordId) {
  if (!confirm('确认该工具已归还？')) return;
  const res = await http(`/borrows/${recordId}/return`, { method: 'POST' });
  if (res.success) {
    showToast('归还确认成功', 'success');
    loadBorrows();
    loadTools();
  } else {
    showToast(res.msg || '操作失败', 'error');
  }
}

async function showOverdueList() {
  const list = await http('/borrows?only_overdue=1');
  const container = document.getElementById('overdueList');
  if (!list.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🎉</div><p>暂无逾期记录，一切正常！</p></div>`;
  } else {
    container.innerHTML = list.map(r => renderRecord(r)).join('');
  }
  openModal('overdueModal');
}

async function openStatusModal(toolId) {
  const tool = await http('/tools/' + toolId);
  if (!tool || tool.id === undefined) { showToast('工具不存在', 'error'); return; }
  currentStatusTool = tool;
  document.getElementById('statusToolInfo').innerHTML = `
    <div class="info-name">${escapeHtml(tool.name)}</div>
    <div>📂 分类：${escapeHtml(tool.category)} &nbsp; 👤 登记人：${escapeHtml(tool.owner_name)}</div>
    <div>当前状态：<span class="${statusClassTool(tool.status)}">${statusTextTool(tool.status)}</span></div>
  `;
  document.getElementById('newToolStatus').value = tool.status;
  openModal('statusModal');
}

async function doChangeStatus() {
  if (!currentStatusTool) return;
  const status = document.getElementById('newToolStatus').value;
  const res = await http(`/tools/${currentStatusTool.id}/status`, { method: 'PUT', body: { status } });
  if (res.success) {
    closeModal('statusModal');
    showToast('状态已更新', 'success');
    loadTools();
  } else {
    showToast(res.msg || '操作失败', 'error');
  }
}

async function loadDashboard() {
  const d = await http('/dashboard');
  const cards = [
    { label: '工具总数', value: d.tool_total, icon: '📦', color: 'linear-gradient(135deg,#667eea,#764ba2)' },
    { label: '可用工具', value: d.tool_available, icon: '✅', color: 'linear-gradient(135deg,#10b981,#059669)' },
    { label: '维修中', value: d.tool_repairing, icon: '🔧', color: 'linear-gradient(135deg,#f59e0b,#d97706)' },
    { label: '已下架', value: d.tool_offline, icon: '⛔', color: 'linear-gradient(135deg,#6b7280,#4b5563)' },
    { label: '待审核', value: d.borrow_pending, icon: '⏳', color: 'linear-gradient(135deg,#3b82f6,#2563eb)' },
    { label: '借出中', value: d.borrow_approved, icon: '📤', color: 'linear-gradient(135deg,#8b5cf6,#7c3aed)' },
    { label: '已逾期', value: d.borrow_overdue, icon: '⚠️', color: 'linear-gradient(135deg,#ef4444,#dc2626)' },
    { label: '已归还', value: d.borrow_returned, icon: '📥', color: 'linear-gradient(135deg,#14b8a6,#0d9488)' },
    { label: '用户总数', value: d.user_total, icon: '👥', color: 'linear-gradient(135deg,#ec4899,#db2777)' },
  ];
  document.getElementById('dashboardCards').innerHTML = cards.map(c => `
    <div class="dash-card" style="background:${c.color}">
      <span class="icon">${c.icon}</span>
      <div class="label">${c.label}</div>
      <div class="value">${c.value}</div>
    </div>
  `).join('');
}

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

async function init() {
  try {
    categories = await http('/categories');
    statusMap = await http('/status-map');
    initFormCategories();
  } catch (e) { console.error(e); }

  const saved = localStorage.getItem('tool_user');
  if (saved) {
    try {
      currentUser = JSON.parse(saved);
      updateUserDisplay();
    } catch (e) {}
  }
  if (!currentUser) {
    setTimeout(showLogin, 300);
  }

  loadTools();
}

document.addEventListener('DOMContentLoaded', init);
