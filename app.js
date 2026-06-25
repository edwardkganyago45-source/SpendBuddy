/* SpendBuddy AI — app.js */
'use strict';

// ─── Constants ───────────────────────────────────────────────────────────────
const KEYS = {
  transactions: 'spendbuddy_transactions',
  budgets:      'spendbuddy_budgets',
  goals:        'spendbuddy_goals',
  settings:     'spendbuddy_settings',
  auth:         'spendbuddy_auth',
};

const INCOME_CATEGORIES = ['Salary','Freelance','Business','Investment','Gift','Other'];
const EXPENSE_CATEGORIES = ['Food','Transport','Entertainment','Shopping','Utilities','Education','Healthcare','Rent','Other'];

const CATEGORY_ICONS = {
  Salary:'💼', Freelance:'💻', Business:'🏢', Investment:'📈', Gift:'🎁',
  Food:'🍔', Transport:'🚗', Entertainment:'🎬', Shopping:'🛍️',
  Utilities:'💡', Education:'📚', Healthcare:'🏥', Rent:'🏠', Other:'📦',
};

const CATEGORY_COLORS = {
  Salary:'#3B82F6', Freelance:'#8B5CF6', Business:'#06B6D4', Investment:'#10B981', Gift:'#F59E0B',
  Food:'#F97316', Transport:'#14B8A6', Entertainment:'#EC4899', Shopping:'#8B5CF6',
  Utilities:'#F59E0B', Education:'#3B82F6', Healthcare:'#EF4444', Rent:'#6366F1', Other:'#6B7280',
};

const PAGE_TITLES = {
  dashboard:'Dashboard', income:'Income', expenses:'Expenses',
  analytics:'Analytics', budget:'Budget Planner', goals:'Savings Goals',
  ai:'AI Insights', settings:'Settings',
};

// ─── State ────────────────────────────────────────────────────────────────────
let currentPage = 'dashboard';
let activeCharts = {};
let inactivityTimer = null;
let filterState = { income: 'all', expense: 'all', search: '' };

// ─── Storage Helpers ──────────────────────────────────────────────────────────
function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function save(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

function getTransactions() { return load(KEYS.transactions, []); }
function getBudgets()      { return load(KEYS.budgets, {}); }
function getGoals()        { return load(KEYS.goals, []); }
function getSettings() {
  return { pin:'1234', darkMode:false, currency:'R', theme:'default', ...load(KEYS.settings, {}) };
}
function getAuth() { return load(KEYS.auth, { isAuthenticated: false, lastActivity: null }); }

function saveTransactions(t) { save(KEYS.transactions, t); }
function saveBudgets(b)      { save(KEYS.budgets, b); }
function saveGoals(g)        { save(KEYS.goals, g); }
function saveSettings(s)     { save(KEYS.settings, s); }
function saveAuth(a)         { save(KEYS.auth, a); }

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function today() { return new Date().toISOString().split('T')[0]; }

function fmt(amount) {
  const s = getSettings();
  return `${s.currency} ${Number(amount).toLocaleString('en-ZA', { minimumFractionDigits:2, maximumFractionDigits:2 })}`;
}
function fmtShort(amount) {
  const s = getSettings();
  const n = Math.abs(Number(amount));
  if (n >= 1_000_000) return `${s.currency} ${(n/1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${s.currency} ${(n/1_000).toFixed(1)}k`;
  return `${s.currency} ${n.toFixed(2)}`;
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  const icons = { success:'✅', error:'❌', info:'ℹ️', warning:'⚠️' };
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span>${icons[type]||'📢'}</span><span class="flex-1">${message}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('hiding');
    setTimeout(() => el.remove(), 300);
  }, duration);
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function openModal(html, onOpen) {
  const overlay = document.getElementById('modal-overlay');
  const box     = document.getElementById('modal-box');
  const content = document.getElementById('modal-content');
  content.innerHTML = html;
  overlay.classList.add('active');
  overlay.classList.remove('hidden');
  requestAnimationFrame(() => {
    box.classList.remove('scale-95','opacity-0');
    box.classList.add('scale-100','opacity-100');
  });
  if (onOpen) onOpen();
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  const box     = document.getElementById('modal-box');
  box.classList.add('scale-95','opacity-0');
  box.classList.remove('scale-100','opacity-100');
  setTimeout(() => {
    overlay.classList.remove('active');
    overlay.classList.add('hidden');
    document.getElementById('modal-content').innerHTML = '';
  }, 200);
}

document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
});

// ─── PIN / Auth ───────────────────────────────────────────────────────────────
let pinBuffer = '';

function setupPinScreen() {
  const pad   = document.getElementById('pin-pad');
  const dots  = document.querySelectorAll('.pin-dot');
  const label = document.getElementById('pin-label');

  function updateDots() {
    dots.forEach((d, i) => {
      d.classList.toggle('filled', i < pinBuffer.length);
    });
  }

  function checkPin() {
    const s = getSettings();
    if (pinBuffer === s.pin) {
      const auth = { isAuthenticated: true, lastActivity: Date.now() };
      saveAuth(auth);
      document.getElementById('lock-screen').style.display = 'none';
      document.getElementById('app-shell').classList.remove('hidden');
      document.getElementById('app-shell').classList.add('flex');
      startInactivityTimer();
      navigate(location.hash.replace('#','') || 'dashboard');
    } else {
      label.textContent = 'Incorrect PIN. Try again.';
      label.classList.add('text-red-300');
      const dotsEl = document.getElementById('pin-dots');
      dotsEl.classList.add('pin-error');
      setTimeout(() => {
        dotsEl.classList.remove('pin-error');
        label.textContent = 'Enter your 4-digit PIN';
        label.classList.remove('text-red-300');
      }, 600);
      pinBuffer = '';
      updateDots();
    }
  }

  pad.addEventListener('click', (e) => {
    const btn = e.target.closest('.pin-btn');
    if (!btn) return;
    const digit  = btn.dataset.digit;
    const action = btn.dataset.action;
    if (digit !== undefined && pinBuffer.length < 4) {
      pinBuffer += digit;
      updateDots();
      if (pinBuffer.length === 4) setTimeout(checkPin, 100);
    } else if (action === 'delete') {
      pinBuffer = pinBuffer.slice(0, -1);
      updateDots();
    } else if (action === 'clear') {
      pinBuffer = '';
      updateDots();
    }
  });
}

function lockApp() {
  pinBuffer = '';
  document.querySelectorAll('.pin-dot').forEach(d => d.classList.remove('filled'));
  document.getElementById('pin-label').textContent = 'Enter your 4-digit PIN';
  document.getElementById('lock-screen').style.display = 'flex';
  document.getElementById('app-shell').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('flex');
  saveAuth({ isAuthenticated: false, lastActivity: null });
  clearTimeout(inactivityTimer);
}

function startInactivityTimer() {
  clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(lockApp, 5 * 60 * 1000);
}

function resetInactivity() {
  const auth = getAuth();
  if (auth.isAuthenticated) startInactivityTimer();
}

document.addEventListener('click', resetInactivity);
document.addEventListener('keydown', resetInactivity);

// ─── Router ───────────────────────────────────────────────────────────────────
function navigate(page) {
  if (!PAGE_TITLES[page]) page = 'dashboard';
  currentPage = page;
  location.hash = page;

  // Update nav links
  document.querySelectorAll('.nav-link, .mobile-nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  document.getElementById('page-title').textContent = PAGE_TITLES[page];

  // Destroy previous charts
  Object.values(activeCharts).forEach(c => { try { c.destroy(); } catch {} });
  activeCharts = {};

  // Close sidebar on mobile
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.add('hidden');

  renderPage(page);
}

window.addEventListener('hashchange', () => {
  const auth = getAuth();
  if (!auth.isAuthenticated) return;
  navigate(location.hash.replace('#','') || 'dashboard');
});

function renderPage(page) {
  const content = document.getElementById('page-content');
  content.innerHTML = '<div class="fade-in">' + buildPage(page) + '</div>';
  afterRender(page);
}

function buildPage(page) {
  switch (page) {
    case 'dashboard':  return buildDashboard();
    case 'income':     return buildIncomePage();
    case 'expenses':   return buildExpensesPage();
    case 'analytics':  return buildAnalyticsPage();
    case 'budget':     return buildBudgetPage();
    case 'goals':      return buildGoalsPage();
    case 'ai':         return buildAiPage();
    case 'settings':   return buildSettingsPage();
    default:           return buildDashboard();
  }
}

function afterRender(page) {
  if (page === 'analytics') initAnalyticsCharts();
  if (page === 'dashboard')  bindDashboardEvents();
  if (page === 'income')     bindTransactionPageEvents('income');
  if (page === 'expenses')   bindTransactionPageEvents('expense');
  if (page === 'budget')     bindBudgetEvents();
  if (page === 'goals')      bindGoalEvents();
  if (page === 'settings')   bindSettingsEvents();
}

// ─── Finance Calculations ─────────────────────────────────────────────────────
function getMonthTransactions(year, month) {
  return getTransactions().filter(t => {
    const d = new Date(t.date);
    return d.getFullYear() === year && d.getMonth() === month;
  });
}

function getCurrentMonthStats() {
  const now = new Date();
  const txs = getMonthTransactions(now.getFullYear(), now.getMonth());
  const income  = txs.filter(t => t.type === 'income').reduce((s,t) => s + Number(t.amount), 0);
  const expense = txs.filter(t => t.type === 'expense').reduce((s,t) => s + Number(t.amount), 0);
  return { income, expense, balance: income - expense };
}

function getTotalStats() {
  const txs = getTransactions();
  const income  = txs.filter(t => t.type === 'income').reduce((s,t) => s + Number(t.amount), 0);
  const expense = txs.filter(t => t.type === 'expense').reduce((s,t) => s + Number(t.amount), 0);
  const goals   = getGoals().reduce((s,g) => s + Number(g.currentAmount), 0);
  return { income, expense, balance: income - expense, savings: goals };
}

function getExpenseByCategory(year, month) {
  const txs = (year !== undefined)
    ? getMonthTransactions(year, month)
    : getTransactions();
  const result = {};
  txs.filter(t => t.type === 'expense').forEach(t => {
    result[t.category] = (result[t.category] || 0) + Number(t.amount);
  });
  return result;
}

function getLast6Months() {
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    months.push({ year: d.getFullYear(), month: d.getMonth(), label: d.toLocaleString('default',{month:'short'}) });
  }
  return months;
}

function getSavingsRate() {
  const stats = getCurrentMonthStats();
  if (!stats.income) return 0;
  return Math.max(0, ((stats.income - stats.expense) / stats.income) * 100);
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function buildDashboard() {
  const total = getTotalStats();
  const month = getCurrentMonthStats();
  const txs   = getTransactions().slice().sort((a,b) => new Date(b.date)-new Date(a.date)).slice(0,10);
  const now   = new Date();
  const monthName = now.toLocaleString('default',{month:'long',year:'numeric'});

  return `
<div class="space-y-6">

  <!-- Welcome header -->
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-2xl font-black text-gray-900 dark:text-white">Good ${getGreeting()} 👋</h2>
      <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">${monthName} — here's your financial snapshot</p>
    </div>
    <div class="flex gap-2">
      <button onclick="openAddTransaction('income')" class="btn-success text-xs px-3 py-2">+ Income</button>
      <button onclick="openAddTransaction('expense')" class="btn-danger text-xs px-3 py-2">+ Expense</button>
    </div>
  </div>

  <!-- Summary Cards -->
  <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
    <div class="stat-card gradient-blue text-white">
      <div class="flex items-center justify-between mb-3">
        <span class="text-blue-100 text-xs font-bold uppercase tracking-wide">Total Income</span>
        <div class="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-base">💵</div>
      </div>
      <div class="text-2xl font-black">${fmtShort(total.income)}</div>
      <div class="text-blue-200 text-xs mt-1.5">All time</div>
    </div>
    <div class="stat-card gradient-rose text-white">
      <div class="flex items-center justify-between mb-3">
        <span class="text-red-100 text-xs font-bold uppercase tracking-wide">Total Expenses</span>
        <div class="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-base">💸</div>
      </div>
      <div class="text-2xl font-black">${fmtShort(total.expense)}</div>
      <div class="text-red-200 text-xs mt-1.5">All time</div>
    </div>
    <div class="stat-card gradient-green text-white">
      <div class="flex items-center justify-between mb-3">
        <span class="text-emerald-100 text-xs font-bold uppercase tracking-wide">Net Balance</span>
        <div class="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-base">💰</div>
      </div>
      <div class="text-2xl font-black">${fmtShort(total.balance)}</div>
      <div class="text-emerald-200 text-xs mt-1.5">Income − Expenses</div>
    </div>
    <div class="stat-card gradient-purple text-white">
      <div class="flex items-center justify-between mb-3">
        <span class="text-purple-100 text-xs font-bold uppercase tracking-wide">In Goals</span>
        <div class="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-base">🏆</div>
      </div>
      <div class="text-2xl font-black">${fmtShort(total.savings)}</div>
      <div class="text-purple-200 text-xs mt-1.5">Across all goals</div>
    </div>
  </div>

  <!-- Monthly Overview -->
  <div class="card">
    <div class="section-header">
      <h3 class="section-title">📅 ${monthName} Overview</h3>
      <span class="badge badge-blue">${Math.round(getSavingsRate())}% saved</span>
    </div>
    <div class="grid grid-cols-3 gap-3 mt-3">
      <div class="text-center p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
        <div class="text-base font-black text-emerald-600 dark:text-emerald-400">${fmt(month.income)}</div>
        <div class="text-xs text-gray-500 dark:text-gray-400 mt-1 font-medium">Income</div>
      </div>
      <div class="text-center p-3 rounded-xl bg-red-50 dark:bg-red-900/20">
        <div class="text-base font-black text-red-600 dark:text-red-400">${fmt(month.expense)}</div>
        <div class="text-xs text-gray-500 dark:text-gray-400 mt-1 font-medium">Expenses</div>
      </div>
      <div class="text-center p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20">
        <div class="text-base font-black ${month.balance >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}">${fmt(month.balance)}</div>
        <div class="text-xs text-gray-500 dark:text-gray-400 mt-1 font-medium">Balance</div>
      </div>
    </div>
    <div class="mt-4">
      <div class="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1.5">
        <span>Spending vs Income</span>
        <span>${month.income ? Math.round((month.expense/month.income)*100) : 0}%</span>
      </div>
      <div class="progress-bar-track">
        <div class="progress-bar-fill ${month.expense/month.income > 1 ? 'bg-red-500' : 'bg-gradient-to-r from-blue-500 to-emerald-500'}"
             style="width:${Math.min(100, month.income ? (month.expense/month.income)*100 : 0)}%"></div>
      </div>
    </div>
  </div>

  <!-- Quick Nav Cards -->
  <div>
    <h3 class="section-title mb-3">Quick Access</h3>
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <button onclick="navigate('income')" class="quick-nav-card">
        <span class="quick-nav-icon bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600">💵</span>
        <span class="quick-nav-label">Income</span>
        <span class="quick-nav-sub">Add &amp; manage</span>
      </button>
      <button onclick="navigate('expenses')" class="quick-nav-card">
        <span class="quick-nav-icon bg-red-100 dark:bg-red-900/30 text-red-600">💸</span>
        <span class="quick-nav-label">Expenses</span>
        <span class="quick-nav-sub">Add &amp; manage</span>
      </button>
      <button onclick="navigate('budget')" class="quick-nav-card">
        <span class="quick-nav-icon bg-blue-100 dark:bg-blue-900/30 text-blue-600">🎯</span>
        <span class="quick-nav-label">Budget</span>
        <span class="quick-nav-sub">Set limits</span>
      </button>
      <button onclick="navigate('goals')" class="quick-nav-card">
        <span class="quick-nav-icon bg-purple-100 dark:bg-purple-900/30 text-purple-600">🏆</span>
        <span class="quick-nav-label">Goals</span>
        <span class="quick-nav-sub">Track savings</span>
      </button>
      <button onclick="navigate('analytics')" class="quick-nav-card">
        <span class="quick-nav-icon bg-amber-100 dark:bg-amber-900/30 text-amber-600">📈</span>
        <span class="quick-nav-label">Analytics</span>
        <span class="quick-nav-sub">Charts &amp; trends</span>
      </button>
      <button onclick="navigate('ai')" class="quick-nav-card">
        <span class="quick-nav-icon bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600">🤖</span>
        <span class="quick-nav-label">AI Insights</span>
        <span class="quick-nav-sub">Smart advice</span>
      </button>
    </div>
  </div>

  <!-- Recent Transactions -->
  <div class="card">
    <div class="section-header">
      <h3 class="section-title">🕐 Recent Transactions</h3>
      <button onclick="navigate('expenses')" class="text-xs text-blue-500 font-semibold hover:underline">View all →</button>
    </div>
    ${txs.length === 0 ? `
      <div class="empty-state py-8">
        <div class="empty-icon">📭</div>
        <p class="text-gray-500 dark:text-gray-400 text-sm font-medium">No transactions yet</p>
        <p class="text-gray-400 text-xs mt-1">Use the buttons above to add your first entry</p>
      </div>
    ` : txs.map(t => renderTransactionRow(t)).join('')}
  </div>

</div>`;
}

function bindDashboardEvents() {}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function renderTransactionRow(t) {
  const icon = CATEGORY_ICONS[t.category] || '📦';
  const isIncome = t.type === 'income';
  return `
<div class="transaction-item group" onclick="openEditTransaction('${t.id}')">
  <div class="transaction-icon ${isIncome ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-red-100 dark:bg-red-900/30'}">
    ${icon}
  </div>
  <div class="flex-1 min-w-0">
    <div class="text-sm font-semibold text-gray-900 dark:text-white truncate">${t.description || t.category}</div>
    <div class="flex items-center gap-2 mt-0.5">
      <span class="text-xs text-gray-400">${formatDate(t.date)}</span>
      <span class="badge ${isIncome ? 'badge-income' : 'badge-expense'} text-xs">${t.category}</span>
      ${t.recurring ? '<span class="text-xs text-blue-400">🔄</span>' : ''}
    </div>
  </div>
  <div class="text-right flex-shrink-0">
    <div class="text-sm font-bold ${isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}">
      ${isIncome ? '+' : '-'}${fmt(t.amount)}
    </div>
  </div>
</div>`;
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const diff = Math.floor((now - d) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff} days ago`;
  return d.toLocaleDateString('en-ZA', { day:'numeric', month:'short' });
}

// ─── Transaction Forms ────────────────────────────────────────────────────────
function openAddTransaction(type) {
  const cats = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const html = `
<div class="p-6">
  <div class="flex items-center justify-between mb-6">
    <h2 class="text-xl font-bold text-gray-900 dark:text-white">
      ${type === 'income' ? '💵 Add Income' : '💸 Add Expense'}
    </h2>
    <button onclick="closeModal()" class="btn-ghost p-2 rounded-full">✕</button>
  </div>
  <form id="txn-form" class="space-y-4" onsubmit="submitTransaction(event,'${type}')">
    <div>
      <label class="form-label">Amount *</label>
      <input type="number" name="amount" class="form-input" placeholder="0.00" step="0.01" min="0.01" required autofocus />
    </div>
    <div>
      <label class="form-label">Category *</label>
      <select name="category" class="form-select" required>
        ${cats.map(c => `<option value="${c}">${CATEGORY_ICONS[c]||''} ${c}</option>`).join('')}
      </select>
    </div>
    <div>
      <label class="form-label">Description</label>
      <input type="text" name="description" class="form-input" placeholder="e.g. Monthly salary, Groceries..." />
    </div>
    <div>
      <label class="form-label">Date *</label>
      <input type="date" name="date" class="form-input" value="${today()}" required />
    </div>
    <div class="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800">
      <input type="checkbox" name="recurring" id="recurring-check" class="w-4 h-4 rounded accent-blue-500" />
      <label for="recurring-check" class="text-sm text-gray-700 dark:text-gray-300 font-medium cursor-pointer">
        🔄 Mark as recurring
      </label>
    </div>
    <div class="flex gap-3 pt-2">
      <button type="button" onclick="closeModal()" class="btn-secondary flex-1 justify-center">Cancel</button>
      <button type="submit" class="${type === 'income' ? 'btn-success' : 'btn-danger'} flex-1 justify-center">
        Save ${type === 'income' ? 'Income' : 'Expense'}
      </button>
    </div>
  </form>
</div>`;
  openModal(html);
}

function submitTransaction(e, type, id) {
  e.preventDefault();
  const form = e.target;
  const data = {
    id: id || genId(),
    type,
    amount: parseFloat(form.amount.value),
    category: form.category.value,
    description: form.description.value.trim(),
    date: form.date.value,
    recurring: form.recurring.checked,
    createdAt: new Date().toISOString(),
  };
  if (!data.amount || data.amount <= 0) { showToast('Enter a valid amount','error'); return; }
  if (!data.date) { showToast('Select a date','error'); return; }

  let txs = getTransactions();
  if (id) {
    txs = txs.map(t => t.id === id ? { ...t, ...data } : t);
    showToast(`${type === 'income' ? 'Income' : 'Expense'} updated ✓`, 'success');
  } else {
    txs.unshift(data);
    showToast(`${type === 'income' ? 'Income' : 'Expense'} added ✓`, 'success');
  }
  saveTransactions(txs);
  closeModal();
  renderPage(currentPage);
}

function openEditTransaction(id) {
  const txs = getTransactions();
  const t   = txs.find(x => x.id === id);
  if (!t) return;
  const cats = t.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const html = `
<div class="p-6">
  <div class="flex items-center justify-between mb-6">
    <h2 class="text-xl font-bold text-gray-900 dark:text-white">
      ${t.type === 'income' ? '💵 Edit Income' : '💸 Edit Expense'}
    </h2>
    <button onclick="closeModal()" class="btn-ghost p-2 rounded-full">✕</button>
  </div>
  <form id="txn-form" class="space-y-4" onsubmit="submitTransaction(event,'${t.type}','${id}')">
    <div>
      <label class="form-label">Amount *</label>
      <input type="number" name="amount" class="form-input" value="${t.amount}" step="0.01" min="0.01" required />
    </div>
    <div>
      <label class="form-label">Category *</label>
      <select name="category" class="form-select" required>
        ${cats.map(c => `<option value="${c}" ${c===t.category?'selected':''}>${CATEGORY_ICONS[c]||''} ${c}</option>`).join('')}
      </select>
    </div>
    <div>
      <label class="form-label">Description</label>
      <input type="text" name="description" class="form-input" value="${t.description||''}" placeholder="e.g. Monthly salary..." />
    </div>
    <div>
      <label class="form-label">Date *</label>
      <input type="date" name="date" class="form-input" value="${t.date}" required />
    </div>
    <div class="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800">
      <input type="checkbox" name="recurring" id="recurring-check" class="w-4 h-4 rounded accent-blue-500" ${t.recurring?'checked':''} />
      <label for="recurring-check" class="text-sm text-gray-700 dark:text-gray-300 font-medium cursor-pointer">
        🔄 Mark as recurring
      </label>
    </div>
    <div class="flex gap-3 pt-2">
      <button type="button" onclick="deleteTransaction('${id}')" class="btn-danger px-3">🗑️</button>
      <button type="button" onclick="closeModal()" class="btn-secondary flex-1 justify-center">Cancel</button>
      <button type="submit" class="${t.type === 'income' ? 'btn-success' : 'btn-danger'} flex-1 justify-center">Update</button>
    </div>
  </form>
</div>`;
  openModal(html);
}

function deleteTransaction(id) {
  if (!confirm('Delete this transaction?')) return;
  const txs = getTransactions().filter(t => t.id !== id);
  saveTransactions(txs);
  closeModal();
  showToast('Transaction deleted','warning');
  renderPage(currentPage);
}

// ─── Income Page ──────────────────────────────────────────────────────────────
function buildIncomePage() {
  const all = getTransactions().filter(t => t.type === 'income')
    .sort((a,b) => new Date(b.date) - new Date(a.date));
  const total = all.reduce((s,t) => s + Number(t.amount), 0);
  const recurring = all.filter(t => t.recurring).reduce((s,t) => s + Number(t.amount), 0);

  return `
<div class="space-y-5">
  <!-- Header stats -->
  <div class="grid grid-cols-2 gap-4">
    <div class="stat-card gradient-green text-white">
      <div class="text-emerald-100 text-xs font-semibold uppercase tracking-wide mb-1">Total Income</div>
      <div class="text-2xl font-bold">${fmtShort(total)}</div>
      <div class="text-emerald-200 text-xs mt-1">${all.length} records</div>
    </div>
    <div class="stat-card bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
      <div class="text-gray-500 dark:text-gray-400 text-xs font-semibold uppercase tracking-wide mb-1">Recurring</div>
      <div class="text-2xl font-bold text-blue-600 dark:text-blue-400">${fmtShort(recurring)}</div>
      <div class="text-gray-400 text-xs mt-1">monthly</div>
    </div>
  </div>

  <!-- Controls -->
  <div class="flex flex-col sm:flex-row gap-3">
    <div class="search-bar flex-1">
      <span class="search-icon">🔍</span>
      <input type="text" id="income-search" class="form-input" placeholder="Search income..." oninput="filterTransactions('income')" />
    </div>
    <div class="flex gap-2 flex-wrap" id="income-cat-filters">
      <button class="filter-chip active" onclick="setCatFilter('income','all',this)">All</button>
      ${INCOME_CATEGORIES.map(c => `<button class="filter-chip" onclick="setCatFilter('income','${c}',this)">${CATEGORY_ICONS[c]||''} ${c}</button>`).join('')}
    </div>
    <button onclick="openAddTransaction('income')" class="btn-success whitespace-nowrap">+ Add Income</button>
  </div>

  <!-- List -->
  <div class="card" id="income-list">
    ${renderFilteredTransactions('income')}
  </div>
</div>`;
}

function buildExpensesPage() {
  const all = getTransactions().filter(t => t.type === 'expense')
    .sort((a,b) => new Date(b.date) - new Date(a.date));
  const total = all.reduce((s,t) => s + Number(t.amount), 0);
  const thisMonth = getCurrentMonthStats().expense;

  return `
<div class="space-y-5">
  <div class="grid grid-cols-2 gap-4">
    <div class="stat-card gradient-rose text-white">
      <div class="text-red-100 text-xs font-semibold uppercase tracking-wide mb-1">Total Expenses</div>
      <div class="text-2xl font-bold">${fmtShort(total)}</div>
      <div class="text-red-200 text-xs mt-1">${all.length} records</div>
    </div>
    <div class="stat-card bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
      <div class="text-gray-500 dark:text-gray-400 text-xs font-semibold uppercase tracking-wide mb-1">This Month</div>
      <div class="text-2xl font-bold text-red-600 dark:text-red-400">${fmtShort(thisMonth)}</div>
      <div class="text-gray-400 text-xs mt-1">current month</div>
    </div>
  </div>

  <div class="flex flex-col sm:flex-row gap-3">
    <div class="search-bar flex-1">
      <span class="search-icon">🔍</span>
      <input type="text" id="expense-search" class="form-input" placeholder="Search expenses..." oninput="filterTransactions('expense')" />
    </div>
    <div class="flex gap-2 flex-wrap" id="expense-cat-filters">
      <button class="filter-chip active" onclick="setCatFilter('expense','all',this)">All</button>
      ${EXPENSE_CATEGORIES.map(c => `<button class="filter-chip" onclick="setCatFilter('expense','${c}',this)">${CATEGORY_ICONS[c]||''} ${c}</button>`).join('')}
    </div>
    <button onclick="openAddTransaction('expense')" class="btn-danger whitespace-nowrap">+ Add Expense</button>
  </div>

  <div class="card" id="expense-list">
    ${renderFilteredTransactions('expense')}
  </div>
</div>`;
}

function renderFilteredTransactions(type) {
  const search = filterState.search || '';
  const cat    = filterState[type] || 'all';
  let txs = getTransactions()
    .filter(t => t.type === type)
    .filter(t => cat === 'all' || t.category === cat)
    .filter(t => !search || (t.description+t.category).toLowerCase().includes(search.toLowerCase()))
    .sort((a,b) => new Date(b.date)-new Date(a.date));

  if (txs.length === 0) return `
    <div class="empty-state">
      <div class="empty-icon">${type === 'income' ? '💵' : '💸'}</div>
      <p class="text-gray-500 dark:text-gray-400">No ${type} records found</p>
    </div>`;
  return txs.map(t => renderTransactionRow(t)).join('');
}

function setCatFilter(type, cat, btn) {
  filterState[type] = cat;
  const container = document.getElementById(`${type === 'income' ? 'income' : 'expense'}-cat-filters`);
  container.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const listId = type === 'income' ? 'income-list' : 'expense-list';
  document.getElementById(listId).innerHTML = renderFilteredTransactions(type);
}

function filterTransactions(type) {
  const input = document.getElementById(`${type}-search`);
  filterState.search = input ? input.value : '';
  const listId = type === 'income' ? 'income-list' : 'expense-list';
  document.getElementById(listId).innerHTML = renderFilteredTransactions(type);
}

function bindTransactionPageEvents(type) {
  filterState.search = '';
  filterState[type]  = 'all';
}

// ─── Analytics Page ───────────────────────────────────────────────────────────
function buildAnalyticsPage() {
  const months = getLast6Months();
  const now    = new Date();
  const catExp = getExpenseByCategory(now.getFullYear(), now.getMonth());
  const budgets = getBudgets();
  const savRate = getSavingsRate();
  const month  = getCurrentMonthStats();

  // Budget utilization items
  const budgetItems = Object.entries(budgets).map(([cat, budget]) => {
    const spent = catExp[cat] || 0;
    const pct   = budget > 0 ? Math.min(150, (spent/budget)*100) : 0;
    const status = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'ok';
    return { cat, budget, spent, pct, status };
  });

  return `
<div class="space-y-6">
  <!-- Savings Rate -->
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
    <div class="stat-card bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
      <div class="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2">Savings Rate</div>
      <div class="text-3xl font-bold ${savRate >= 20 ? 'text-emerald-600' : savRate >= 10 ? 'text-yellow-600' : 'text-red-600'}">${savRate.toFixed(1)}%</div>
      <div class="text-xs text-gray-400 mt-1">${savRate >= 20 ? '🟢 Healthy' : savRate >= 10 ? '🟡 Moderate' : '🔴 Low'}</div>
    </div>
    <div class="stat-card bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
      <div class="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2">This Month Income</div>
      <div class="text-2xl font-bold text-emerald-600">${fmt(month.income)}</div>
    </div>
    <div class="stat-card bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
      <div class="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2">This Month Expenses</div>
      <div class="text-2xl font-bold text-red-600">${fmt(month.expense)}</div>
    </div>
  </div>

  <!-- Income vs Expense Chart -->
  <div class="card">
    <h3 class="section-title mb-4">📊 Income vs Expenses — Last 6 Months</h3>
    <div class="chart-container" style="height:260px">
      <canvas id="bar-chart"></canvas>
    </div>
  </div>

  <!-- Category Breakdown -->
  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
    <div class="card">
      <h3 class="section-title mb-4">🍩 Category Breakdown (This Month)</h3>
      ${Object.keys(catExp).length === 0
        ? '<div class="empty-state py-8"><div class="empty-icon">📊</div><p class="text-gray-500 text-sm">No expenses this month</p></div>'
        : `<div class="chart-container" style="height:220px"><canvas id="donut-chart"></canvas></div>`}
    </div>
    <div class="card">
      <h3 class="section-title mb-4">📋 Category Details</h3>
      <div class="space-y-3">
        ${Object.entries(catExp).length === 0
          ? '<p class="text-gray-500 text-sm text-center py-4">No data</p>'
          : Object.entries(catExp).sort((a,b) => b[1]-a[1]).map(([cat,amt]) => `
          <div>
            <div class="flex justify-between text-sm mb-1">
              <span class="font-medium text-gray-700 dark:text-gray-300">${CATEGORY_ICONS[cat]||''} ${cat}</span>
              <span class="font-bold text-gray-900 dark:text-white">${fmt(amt)}</span>
            </div>
            <div class="progress-bar-track">
              <div class="progress-bar-fill" style="width:${(amt/Math.max(...Object.values(catExp))*100).toFixed(1)}%; background:${CATEGORY_COLORS[cat]||'#3B82F6'}"></div>
            </div>
          </div>`).join('')}
      </div>
    </div>
  </div>

  <!-- Budget Utilization -->
  ${budgetItems.length > 0 ? `
  <div class="card">
    <h3 class="section-title mb-4">🎯 Budget Utilization</h3>
    <div class="space-y-4">
      ${budgetItems.map(b => `
      <div class="budget-${b.status}">
        <div class="flex justify-between text-sm mb-1.5">
          <span class="font-medium text-gray-700 dark:text-gray-300">${CATEGORY_ICONS[b.cat]||''} ${b.cat}</span>
          <span class="text-xs font-semibold ${b.status === 'over' ? 'text-red-500' : b.status === 'warn' ? 'text-yellow-600' : 'text-emerald-600'}">
            ${fmt(b.spent)} / ${fmt(b.budget)} (${b.pct.toFixed(0)}%)
          </span>
        </div>
        <div class="progress-bar-track">
          <div class="progress-bar-fill" style="width:${Math.min(100, b.pct)}%"></div>
        </div>
      </div>`).join('')}
    </div>
  </div>` : ''}
</div>`;
}

function initAnalyticsCharts() {
  const months  = getLast6Months();
  const labels  = months.map(m => m.label);
  const incomes = months.map(m => getMonthTransactions(m.year,m.month)
    .filter(t => t.type==='income').reduce((s,t) => s+Number(t.amount), 0));
  const expenses = months.map(m => getMonthTransactions(m.year,m.month)
    .filter(t => t.type==='expense').reduce((s,t) => s+Number(t.amount), 0));

  const isDark = document.documentElement.classList.contains('dark');
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const tickColor = isDark ? '#9CA3AF' : '#6B7280';

  const barCanvas = document.getElementById('bar-chart');
  if (barCanvas) {
    activeCharts.bar = new Chart(barCanvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label:'Income',  data: incomes,  backgroundColor:'rgba(16,185,129,0.8)', borderRadius:6, borderSkipped:false },
          { label:'Expenses',data: expenses, backgroundColor:'rgba(239,68,68,0.8)',  borderRadius:6, borderSkipped:false },
        ]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ labels:{ color:tickColor, font:{size:12} } } },
        scales:{
          x:{ ticks:{color:tickColor}, grid:{color:gridColor} },
          y:{ ticks:{color:tickColor}, grid:{color:gridColor},
              callback(v){ return getSettings().currency+' '+v.toLocaleString(); }
          }
        }
      }
    });
  }

  const donutCanvas = document.getElementById('donut-chart');
  const now = new Date();
  const catExp = getExpenseByCategory(now.getFullYear(), now.getMonth());
  if (donutCanvas && Object.keys(catExp).length > 0) {
    const entries = Object.entries(catExp).sort((a,b) => b[1]-a[1]);
    activeCharts.donut = new Chart(donutCanvas, {
      type:'doughnut',
      data:{
        labels: entries.map(e => e[0]),
        datasets:[{ data: entries.map(e => e[1]),
          backgroundColor: entries.map(e => CATEGORY_COLORS[e[0]]||'#6B7280'),
          borderWidth:2, borderColor: isDark ? '#111827' : '#fff',
          hoverOffset:8 }]
      },
      options:{
        responsive:true, maintainAspectRatio:false, cutout:'65%',
        plugins:{ legend:{ position:'bottom', labels:{ color:tickColor, font:{size:11}, boxWidth:12, padding:12 } } }
      }
    });
  }
}

// ─── Budget Planner ───────────────────────────────────────────────────────────
function buildBudgetPage() {
  const budgets = getBudgets();
  const now     = new Date();
  const catExp  = getExpenseByCategory(now.getFullYear(), now.getMonth());
  const allCats = EXPENSE_CATEGORIES;

  // Health score
  let healthScore = 100;
  let over = 0, warn = 0;
  allCats.forEach(cat => {
    const b = budgets[cat] || 0;
    const s = catExp[cat]  || 0;
    if (b > 0) {
      if (s > b) { healthScore -= 15; over++; }
      else if (s / b >= 0.8) { healthScore -= 5; warn++; }
    }
  });
  healthScore = Math.max(0, Math.min(100, healthScore));

  return `
<div class="space-y-6">
  <!-- Health Score -->
  <div class="card gradient-blue text-white flex items-center gap-6 p-6">
    <div class="relative w-20 h-20 flex-shrink-0">
      <svg viewBox="0 0 80 80" class="w-20 h-20 -rotate-90">
        <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="8"/>
        <circle cx="40" cy="40" r="32" fill="none" stroke="white" stroke-width="8"
          stroke-dasharray="${(healthScore/100)*201} 201" stroke-linecap="round"/>
      </svg>
      <div class="absolute inset-0 flex items-center justify-center text-xl font-bold">${healthScore}</div>
    </div>
    <div>
      <h3 class="text-xl font-bold">Budget Health Score</h3>
      <p class="text-blue-100 text-sm mt-1">
        ${over > 0 ? `⚠️ ${over} category over budget` : warn > 0 ? `🟡 ${warn} approaching limit` : '✅ All budgets on track'}
      </p>
      <p class="text-blue-200 text-xs mt-2">Set category budgets below to track spending</p>
    </div>
  </div>

  <!-- Budget Categories -->
  <div class="card">
    <div class="section-header">
      <h3 class="section-title">💰 Monthly Category Budgets</h3>
    </div>
    <div class="space-y-4" id="budget-items">
      ${allCats.map(cat => {
        const budget = budgets[cat] || 0;
        const spent  = catExp[cat]  || 0;
        const pct    = budget > 0 ? Math.min(150, (spent/budget)*100) : 0;
        const status = budget > 0 ? (pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'ok') : 'ok';
        const barColor = status === 'over' ? '#EF4444' : status === 'warn' ? '#F59E0B' : '#10B981';
        return `
        <div class="p-4 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-blue-200 dark:hover:border-blue-700 transition-colors">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <span class="text-xl">${CATEGORY_ICONS[cat]||'📦'}</span>
              <span class="font-semibold text-gray-900 dark:text-white text-sm">${cat}</span>
            </div>
            <div class="flex items-center gap-3">
              <div class="flex items-center gap-2">
                <span class="text-xs text-gray-400">Budget:</span>
                <div class="relative">
                  <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">${getSettings().currency}</span>
                  <input type="number" class="budget-input form-input text-sm text-right w-28 pl-8 py-1.5" 
                    data-cat="${cat}" value="${budget || ''}" placeholder="0.00" min="0" step="0.01"
                    onchange="updateBudget('${cat}', this.value)" />
                </div>
              </div>
              ${budget > 0 ? `<span class="text-xs font-semibold ${status==='over'?'text-red-500':status==='warn'?'text-yellow-600':'text-emerald-600'}">
                ${status==='over'?'⛔ Over':status==='warn'?'⚠️ Warning':'✅ OK'}
              </span>` : ''}
            </div>
          </div>
          ${budget > 0 ? `
          <div class="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1.5">
            <span>Spent: ${fmt(spent)}</span>
            <span>${pct.toFixed(0)}% of ${fmt(budget)}</span>
          </div>
          <div class="progress-bar-track">
            <div class="progress-bar-fill h-3 rounded-full transition-all duration-700" style="width:${Math.min(100,pct)}%; background:${barColor}"></div>
          </div>
          ${status === 'over' ? `<p class="text-xs text-red-500 mt-1.5">⛔ Over budget by ${fmt(spent-budget)}</p>` : ''}
          ${status === 'warn' ? `<p class="text-xs text-yellow-600 mt-1.5">⚠️ ${fmt(budget-spent)} remaining (${(100-pct).toFixed(0)}%)</p>` : ''}
          ` : `<p class="text-xs text-gray-400 italic">No budget set — click to enter amount</p>`}
        </div>`;
      }).join('')}
    </div>
  </div>
</div>`;
}

function updateBudget(cat, value) {
  const budgets = getBudgets();
  const amount  = parseFloat(value);
  if (isNaN(amount) || amount < 0) {
    delete budgets[cat];
  } else {
    budgets[cat] = amount;
  }
  saveBudgets(budgets);
  showToast(`${cat} budget updated`, 'success');
  renderPage('budget');
}

function bindBudgetEvents() {}

// ─── Savings Goals ────────────────────────────────────────────────────────────
function buildGoalsPage() {
  const goals = getGoals();
  const totalSaved  = goals.reduce((s,g) => s + Number(g.currentAmount), 0);
  const totalTarget = goals.reduce((s,g) => s + Number(g.targetAmount),  0);
  const savRate     = getSavingsRate();

  return `
<div class="space-y-6">
  <!-- Summary -->
  <div class="grid grid-cols-2 gap-4">
    <div class="stat-card gradient-purple text-white">
      <div class="text-purple-100 text-xs font-semibold uppercase tracking-wide mb-1">Total Saved</div>
      <div class="text-2xl font-bold">${fmtShort(totalSaved)}</div>
      <div class="text-purple-200 text-xs mt-1">across ${goals.length} goal${goals.length !== 1 ? 's' : ''}</div>
    </div>
    <div class="stat-card bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
      <div class="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1">Target Total</div>
      <div class="text-2xl font-bold text-gray-900 dark:text-white">${fmtShort(totalTarget)}</div>
      <div class="text-gray-400 text-xs mt-1">${totalTarget > 0 ? ((totalSaved/totalTarget)*100).toFixed(0) : 0}% reached</div>
    </div>
  </div>

  <!-- Add goal button -->
  <button onclick="openAddGoal()" class="btn-primary w-full justify-center text-base py-3">
    🏆 Add New Goal
  </button>

  <!-- Goals list -->
  ${goals.length === 0 ? `
  <div class="card">
    <div class="empty-state">
      <div class="empty-icon">🎯</div>
      <p class="text-gray-500 dark:text-gray-400">No savings goals yet</p>
      <p class="text-gray-400 text-xs mt-1">Create your first goal to start saving</p>
    </div>
  </div>` : goals.map(g => renderGoalCard(g, savRate)).join('')}
</div>`;
}

function renderGoalCard(g, savRate) {
  const pct   = g.targetAmount > 0 ? Math.min(100, (g.currentAmount / g.targetAmount) * 100) : 0;
  const left  = Math.max(0, g.targetAmount - g.currentAmount);
  const color = pct >= 100 ? '#10B981' : pct >= 50 ? '#3B82F6' : '#8B5CF6';

  // Estimate completion date based on monthly savings
  let estDate = '';
  const monthlySav = getCurrentMonthStats();
  const monthlyNet = monthlySav.income - monthlySav.expense;
  if (left > 0 && monthlyNet > 0) {
    const months = Math.ceil(left / monthlyNet);
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    estDate = d.toLocaleDateString('en-ZA', { month:'short', year:'numeric' });
  }

  const targetDateDisplay = g.targetDate ? new Date(g.targetDate + 'T00:00:00').toLocaleDateString('en-ZA', { day:'numeric', month:'short', year:'numeric' }) : '';

  return `
<div class="goal-card">
  <div class="flex items-start justify-between mb-3">
    <div class="flex items-center gap-3">
      <div class="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style="background:${color}22">
        ${g.emoji || '🎯'}
      </div>
      <div>
        <h3 class="font-bold text-gray-900 dark:text-white">${g.name}</h3>
        ${g.targetDate ? `<p class="text-xs text-gray-400 mt-0.5">Target: ${targetDateDisplay}</p>` : ''}
      </div>
    </div>
    <div class="flex gap-2">
      <button onclick="openContributeGoal('${g.id}')" class="btn-ghost text-xs px-2 py-1">+ Add</button>
      <button onclick="openEditGoal('${g.id}')" class="btn-ghost text-xs px-2 py-1">✏️</button>
      <button onclick="deleteGoal('${g.id}')" class="btn-ghost text-xs px-2 py-1 text-red-400">🗑️</button>
    </div>
  </div>

  <div class="flex justify-between text-sm mb-2">
    <span class="font-bold text-gray-900 dark:text-white">${fmt(g.currentAmount)}</span>
    <span class="text-gray-500 dark:text-gray-400">of ${fmt(g.targetAmount)}</span>
  </div>
  <div class="progress-bar-track mb-2">
    <div class="h-3 rounded-full transition-all duration-700" style="width:${pct}%; background:${color}"></div>
  </div>
  <div class="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400">
    <span class="font-semibold" style="color:${color}">${pct.toFixed(1)}% complete</span>
    <span>${left > 0 ? `${fmt(left)} remaining` : '🎉 Goal reached!'}</span>
  </div>
  ${estDate && left > 0 ? `<p class="text-xs text-blue-500 mt-1.5">📅 Est. completion: ${estDate}</p>` : ''}
</div>`;
}

function openAddGoal() {
  const html = `
<div class="p-6">
  <div class="flex items-center justify-between mb-6">
    <h2 class="text-xl font-bold text-gray-900 dark:text-white">🏆 New Savings Goal</h2>
    <button onclick="closeModal()" class="btn-ghost p-2 rounded-full">✕</button>
  </div>
  <form class="space-y-4" onsubmit="submitGoal(event)">
    <div class="grid grid-cols-4 gap-2 mb-2">
      ${['🎯','🏠','🚗','✈️','💍','🎓','📱','💻','🏖️','🏋️','🐶','👶'].map(e =>
        `<button type="button" class="emoji-btn p-3 text-2xl rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" onclick="selectEmoji('${e}',this)">${e}</button>`
      ).join('')}
    </div>
    <input type="hidden" name="emoji" id="goal-emoji" value="🎯" />
    <div>
      <label class="form-label">Goal Name *</label>
      <input type="text" name="name" class="form-input" placeholder="e.g. Emergency Fund, New Car..." required />
    </div>
    <div>
      <label class="form-label">Target Amount *</label>
      <input type="number" name="targetAmount" class="form-input" placeholder="0.00" step="0.01" min="1" required />
    </div>
    <div>
      <label class="form-label">Starting Amount</label>
      <input type="number" name="currentAmount" class="form-input" placeholder="0.00" step="0.01" min="0" value="0" />
    </div>
    <div>
      <label class="form-label">Target Date (optional)</label>
      <input type="date" name="targetDate" class="form-input" />
    </div>
    <div class="flex gap-3 pt-2">
      <button type="button" onclick="closeModal()" class="btn-secondary flex-1 justify-center">Cancel</button>
      <button type="submit" class="btn-primary flex-1 justify-center">Create Goal</button>
    </div>
  </form>
</div>`;
  openModal(html);
}

function selectEmoji(emoji, btn) {
  document.getElementById('goal-emoji').value = emoji;
  document.querySelectorAll('.emoji-btn').forEach(b => b.classList.remove('bg-blue-100','dark:bg-blue-900/40','ring-2','ring-blue-500'));
  btn.classList.add('bg-blue-100','ring-2','ring-blue-500');
}

function submitGoal(e, id) {
  e.preventDefault();
  const form = e.target;
  const goal = {
    id: id || genId(),
    name: form.name.value.trim(),
    targetAmount: parseFloat(form.targetAmount.value),
    currentAmount: parseFloat(form.currentAmount.value) || 0,
    targetDate: form.targetDate.value || '',
    emoji: (id ? form.emoji.value : document.getElementById('goal-emoji').value) || '🎯',
    createdAt: new Date().toISOString(),
  };
  if (!goal.name) { showToast('Enter a goal name','error'); return; }
  if (!goal.targetAmount || goal.targetAmount <= 0) { showToast('Enter a valid target amount','error'); return; }

  let goals = getGoals();
  if (id) {
    goals = goals.map(g => g.id === id ? { ...g, ...goal } : g);
    showToast('Goal updated ✓','success');
  } else {
    goals.push(goal);
    showToast('Goal created ✓','success');
  }
  saveGoals(goals);
  closeModal();
  renderPage('goals');
}

function openEditGoal(id) {
  const g = getGoals().find(x => x.id === id);
  if (!g) return;
  const html = `
<div class="p-6">
  <div class="flex items-center justify-between mb-6">
    <h2 class="text-xl font-bold text-gray-900 dark:text-white">✏️ Edit Goal</h2>
    <button onclick="closeModal()" class="btn-ghost p-2 rounded-full">✕</button>
  </div>
  <form class="space-y-4" onsubmit="submitGoal(event,'${id}')">
    <div>
      <label class="form-label">Emoji</label>
      <input type="text" name="emoji" class="form-input" value="${g.emoji||'🎯'}" maxlength="4" />
    </div>
    <div>
      <label class="form-label">Goal Name *</label>
      <input type="text" name="name" class="form-input" value="${g.name}" required />
    </div>
    <div>
      <label class="form-label">Target Amount *</label>
      <input type="number" name="targetAmount" class="form-input" value="${g.targetAmount}" step="0.01" min="1" required />
    </div>
    <div>
      <label class="form-label">Current Amount</label>
      <input type="number" name="currentAmount" class="form-input" value="${g.currentAmount}" step="0.01" min="0" />
    </div>
    <div>
      <label class="form-label">Target Date</label>
      <input type="date" name="targetDate" class="form-input" value="${g.targetDate||''}" />
    </div>
    <div class="flex gap-3 pt-2">
      <button type="button" onclick="deleteGoal('${id}')" class="btn-danger px-3">🗑️</button>
      <button type="button" onclick="closeModal()" class="btn-secondary flex-1 justify-center">Cancel</button>
      <button type="submit" class="btn-primary flex-1 justify-center">Save Changes</button>
    </div>
  </form>
</div>`;
  openModal(html);
}

function openContributeGoal(id) {
  const g = getGoals().find(x => x.id === id);
  if (!g) return;
  const html = `
<div class="p-6">
  <div class="flex items-center justify-between mb-6">
    <h2 class="text-xl font-bold text-gray-900 dark:text-white">${g.emoji||'🎯'} ${g.name}</h2>
    <button onclick="closeModal()" class="btn-ghost p-2 rounded-full">✕</button>
  </div>
  <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
    Current: <strong>${fmt(g.currentAmount)}</strong> / Target: <strong>${fmt(g.targetAmount)}</strong>
  </p>
  <form class="space-y-4" onsubmit="contributeGoal(event,'${id}')">
    <div>
      <label class="form-label">Action</label>
      <select name="action" class="form-select">
        <option value="add">💰 Add funds</option>
        <option value="withdraw">📤 Withdraw funds</option>
      </select>
    </div>
    <div>
      <label class="form-label">Amount *</label>
      <input type="number" name="amount" class="form-input" placeholder="0.00" step="0.01" min="0.01" required autofocus />
    </div>
    <div class="flex gap-3 pt-2">
      <button type="button" onclick="closeModal()" class="btn-secondary flex-1 justify-center">Cancel</button>
      <button type="submit" class="btn-success flex-1 justify-center">Confirm</button>
    </div>
  </form>
</div>`;
  openModal(html);
}

function contributeGoal(e, id) {
  e.preventDefault();
  const form   = e.target;
  const amount = parseFloat(form.amount.value);
  const action = form.action.value;
  if (!amount || amount <= 0) { showToast('Enter a valid amount','error'); return; }

  let goals = getGoals();
  goals = goals.map(g => {
    if (g.id !== id) return g;
    let newAmt = Number(g.currentAmount) + (action === 'add' ? amount : -amount);
    return { ...g, currentAmount: Math.max(0, newAmt) };
  });
  saveGoals(goals);
  showToast(action === 'add' ? `Added ${fmt(amount)} to goal ✓` : `Withdrew ${fmt(amount)} from goal`, 'success');
  closeModal();
  renderPage('goals');
}

function deleteGoal(id) {
  if (!confirm('Delete this savings goal?')) return;
  const goals = getGoals().filter(g => g.id !== id);
  saveGoals(goals);
  showToast('Goal deleted','warning');
  closeModal();
  renderPage('goals');
}

function bindGoalEvents() {}

// ─── AI Insights ──────────────────────────────────────────────────────────────
function buildAiPage() {
  const score     = calcHealthScore();
  const insights  = generateInsights();
  const recs      = generateRecommendations();
  const summary   = generateMonthlySummary();
  const spikes    = detectSpendingSpikes();

  const scoreColor = score >= 75 ? '#10B981' : score >= 50 ? '#F59E0B' : '#EF4444';
  const scoreLabel = score >= 75 ? 'Excellent 🎉' : score >= 50 ? 'Good 👍' : score >= 25 ? 'Fair ⚠️' : 'Needs Work 🔴';

  return `
<div class="space-y-6">
  <!-- Health Score -->
  <div class="card gradient-blue text-white">
    <div class="flex items-center gap-6">
      <div class="relative w-28 h-28 flex-shrink-0">
        <svg viewBox="0 0 120 120" class="w-28 h-28 -rotate-90">
          <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="10"/>
          <circle cx="60" cy="60" r="50" fill="none" stroke="white" stroke-width="10"
            stroke-dasharray="${(score/100)*314} 314" stroke-linecap="round"
            style="transition:stroke-dasharray 1s ease"/>
        </svg>
        <div class="absolute inset-0 flex flex-col items-center justify-center">
          <span class="text-3xl font-black">${score}</span>
          <span class="text-blue-200 text-xs">/ 100</span>
        </div>
      </div>
      <div>
        <div class="flex items-center gap-2 mb-1">
          <div class="pulse-dot"></div>
          <span class="text-xs text-blue-200 font-semibold uppercase tracking-wide">AI Financial Health Score</span>
        </div>
        <h2 class="text-2xl font-bold">${scoreLabel}</h2>
        <p class="text-blue-100 text-sm mt-2">${getScoreDescription(score)}</p>
      </div>
    </div>
  </div>

  <!-- Monthly Summary -->
  <div class="card">
    <div class="flex items-center gap-2 mb-3">
      <span class="text-xl">🤖</span>
      <h3 class="section-title">AI Monthly Summary</h3>
    </div>
    <div class="p-4 rounded-xl bg-gradient-to-br from-blue-50 to-emerald-50 dark:from-blue-900/20 dark:to-emerald-900/20 border border-blue-100 dark:border-blue-800">
      <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">${summary}</p>
    </div>
  </div>

  <!-- Spending Spikes -->
  ${spikes.length > 0 ? `
  <div class="card">
    <div class="flex items-center gap-2 mb-3">
      <span class="text-xl">🔍</span>
      <h3 class="section-title">Unusual Spending Detected</h3>
    </div>
    <div class="space-y-2">
      ${spikes.map(s => `
      <div class="insight-card warning">
        <span class="text-2xl">${CATEGORY_ICONS[s.cat]||'📊'}</span>
        <div>
          <p class="text-sm font-semibold text-amber-800 dark:text-amber-300">${s.cat} spending spiked</p>
          <p class="text-xs text-amber-700 dark:text-amber-400">
            ${fmt(s.thisMonth)} this month vs ${fmt(s.lastMonth)} last month (+${s.increase.toFixed(0)}%)
          </p>
        </div>
      </div>`).join('')}
    </div>
  </div>` : ''}

  <!-- Insights -->
  ${insights.length > 0 ? `
  <div class="card">
    <div class="flex items-center gap-2 mb-3">
      <span class="text-xl">💡</span>
      <h3 class="section-title">AI Spending Insights</h3>
    </div>
    <div class="space-y-2">
      ${insights.map(i => `
      <div class="insight-card ${i.type}">
        <span class="text-xl">${i.icon}</span>
        <div>
          <p class="text-sm font-semibold text-gray-800 dark:text-gray-200">${i.title}</p>
          <p class="text-xs text-gray-600 dark:text-gray-400 mt-0.5">${i.body}</p>
        </div>
      </div>`).join('')}
    </div>
  </div>` : ''}

  <!-- Recommendations -->
  ${recs.length > 0 ? `
  <div class="card">
    <div class="flex items-center gap-2 mb-3">
      <span class="text-xl">🎯</span>
      <h3 class="section-title">AI Budgeting Recommendations</h3>
    </div>
    <div class="space-y-3">
      ${recs.map((r,i) => `
      <div class="flex items-start gap-3 p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800">
        <div class="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">${i+1}</div>
        <p class="text-sm text-gray-700 dark:text-gray-300">${r}</p>
      </div>`).join('')}
    </div>
  </div>` : `
  <div class="card">
    <div class="empty-state py-8">
      <div class="empty-icon">🤖</div>
      <p class="text-gray-500 dark:text-gray-400 text-sm">Add more transactions to get AI recommendations</p>
    </div>
  </div>`}
</div>`;
}

function calcHealthScore() {
  const txs   = getTransactions();
  if (txs.length === 0) return 50;

  const stats    = getCurrentMonthStats();
  const budgets  = getBudgets();
  const goals    = getGoals();
  const savRate  = getSavingsRate();
  let score      = 50;

  // Savings rate (up to 25 pts)
  score += Math.min(25, savRate * 0.8);

  // Budget adherence (up to 20 pts)
  const now = new Date();
  const catExp = getExpenseByCategory(now.getFullYear(), now.getMonth());
  const budgetCats = Object.keys(budgets);
  if (budgetCats.length > 0) {
    let ok = 0;
    budgetCats.forEach(cat => {
      if ((catExp[cat]||0) <= budgets[cat]) ok++;
    });
    score += Math.round((ok / budgetCats.length) * 20);
  } else {
    score += 5;
  }

  // Has goals (up to 5 pts)
  if (goals.length > 0) score += 5;

  // No extreme overspend (deduct up to 20 pts)
  if (stats.income > 0 && stats.expense > stats.income * 1.5) score -= 20;
  else if (stats.income > 0 && stats.expense > stats.income) score -= 10;

  // Has income recorded (up to 5 pts)
  if (stats.income > 0) score += 5;

  // Data completeness (up to 5 pts)
  if (txs.length >= 10) score += 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function getScoreDescription(score) {
  if (score >= 75) return 'Your finances are in great shape. Keep maintaining your spending habits and savings rate.';
  if (score >= 50) return 'Decent financial health. A few tweaks to your spending and budgeting can push you higher.';
  if (score >= 25) return 'There are areas needing attention. Review your budgets and try to reduce discretionary spending.';
  return 'Your finances need immediate attention. Focus on reducing expenses and building an emergency fund first.';
}

function generateInsights() {
  const insights = [];
  const stats    = getCurrentMonthStats();
  const savRate  = getSavingsRate();
  const txs      = getTransactions();
  const now      = new Date();
  const catExp   = getExpenseByCategory(now.getFullYear(), now.getMonth());

  if (txs.length === 0) return insights;

  if (savRate >= 20) {
    insights.push({ type:'positive', icon:'🌟', title:'Strong savings rate', body:`You're saving ${savRate.toFixed(1)}% of your income this month — well above the recommended 20%.` });
  } else if (savRate > 0 && savRate < 10) {
    insights.push({ type:'warning', icon:'⚠️', title:'Low savings rate', body:`Your savings rate is ${savRate.toFixed(1)}%. Aim for at least 20% to build financial security.` });
  }

  const topCat = Object.entries(catExp).sort((a,b) => b[1]-a[1])[0];
  if (topCat) {
    const pct = stats.expense > 0 ? (topCat[1]/stats.expense*100).toFixed(0) : 0;
    insights.push({ type:'info', icon:CATEGORY_ICONS[topCat[0]]||'📊', title:`Top spending: ${topCat[0]}`, body:`${topCat[0]} accounts for ${pct}% of your monthly expenses (${fmt(topCat[1])}).` });
  }

  const recurring = txs.filter(t => t.recurring && t.type === 'expense');
  if (recurring.length > 0) {
    const recAmt = recurring.reduce((s,t) => s + Number(t.amount), 0);
    insights.push({ type:'info', icon:'🔄', title:'Recurring expenses', body:`You have ${recurring.length} recurring expense${recurring.length>1?'s':''} totalling ${fmt(recAmt)}/month.` });
  }

  if (stats.expense > stats.income && stats.income > 0) {
    insights.push({ type:'danger', icon:'🚨', title:'Spending exceeds income', body:`You spent ${fmt(stats.expense - stats.income)} more than you earned this month. Review your expenses urgently.` });
  }

  const goals = getGoals();
  if (goals.length > 0) {
    const nearDone = goals.filter(g => g.targetAmount > 0 && (g.currentAmount/g.targetAmount) >= 0.9);
    if (nearDone.length > 0) {
      insights.push({ type:'positive', icon:'🏆', title:`Almost there: ${nearDone[0].name}`, body:`Your "${nearDone[0].name}" goal is ${((nearDone[0].currentAmount/nearDone[0].targetAmount)*100).toFixed(0)}% complete!` });
    }
  }

  return insights;
}

function generateRecommendations() {
  const recs    = [];
  const stats   = getCurrentMonthStats();
  const budgets = getBudgets();
  const savRate = getSavingsRate();
  const now     = new Date();
  const catExp  = getExpenseByCategory(now.getFullYear(), now.getMonth());
  const goals   = getGoals();

  if (savRate < 20 && stats.income > 0) {
    recs.push(`🎯 Try to save at least 20% of your income. You're currently at ${savRate.toFixed(1)}%. Consider the 50/30/20 rule: 50% needs, 30% wants, 20% savings.`);
  }

  Object.entries(budgets).forEach(([cat, budget]) => {
    const spent = catExp[cat] || 0;
    if (spent > budget) {
      recs.push(`⛔ Your ${cat} spending (${fmt(spent)}) exceeded the budget of ${fmt(budget)}. Consider reducing by ${fmt(spent-budget)} next month.`);
    }
  });

  const topCat = Object.entries(catExp).sort((a,b) => b[1]-a[1])[0];
  if (topCat && stats.expense > 0 && (topCat[1]/stats.expense) > 0.4) {
    recs.push(`💡 ${topCat[0]} is consuming ${((topCat[1]/stats.expense)*100).toFixed(0)}% of your budget. Setting a specific budget for this category could help you control spending.`);
  }

  if (goals.length === 0) {
    recs.push(`🏆 You have no savings goals set. Create at least one goal (like an emergency fund of 3-6 months of expenses) to give your savings direction.`);
  }

  const txs = getTransactions();
  const recurringIncome = txs.filter(t => t.recurring && t.type === 'income').length;
  if (recurringIncome === 0 && stats.income > 0) {
    recs.push(`💼 Mark your regular income as recurring to better track your baseline cash flow and identify unusual income months.`);
  }

  if (stats.income > 0 && !Object.keys(budgets).length) {
    recs.push(`📋 Set monthly budgets for your spending categories. This is one of the most effective ways to control spending and increase savings.`);
  }

  if (recs.length === 0 && stats.income > 0) {
    recs.push(`✅ Great job! Your finances look well-managed. Keep tracking consistently and review your goals quarterly to stay on track.`);
  }

  return recs;
}

function generateMonthlySummary() {
  const stats   = getCurrentMonthStats();
  const savRate = getSavingsRate();
  const now     = new Date();
  const month   = now.toLocaleString('default', { month:'long' });
  const catExp  = getExpenseByCategory(now.getFullYear(), now.getMonth());
  const topCat  = Object.entries(catExp).sort((a,b) => b[1]-a[1])[0];
  const txCount = getMonthTransactions(now.getFullYear(), now.getMonth()).length;

  if (txCount === 0) return `No transactions recorded yet for ${month}. Start adding your income and expenses to get a personalised AI summary.`;

  let summary = `In ${month}, you earned ${fmt(stats.income)} and spent ${fmt(stats.expense)}, leaving a ${stats.balance >= 0 ? 'positive' : 'negative'} balance of ${fmt(Math.abs(stats.balance))}. `;

  if (savRate > 0) summary += `Your savings rate this month is ${savRate.toFixed(1)}%. `;

  if (topCat) summary += `Your biggest expense category was ${topCat[0]} at ${fmt(topCat[1])}. `;

  const score = calcHealthScore();
  if (score >= 70) summary += `Overall, your financial health looks strong — keep it up!`;
  else if (score >= 40) summary += `There's room to improve your financial habits, particularly around budgeting and saving.`;
  else summary += `Consider reviewing your spending patterns and setting clear budgets to improve your financial health.`;

  return summary;
}

function detectSpendingSpikes() {
  const spikes = [];
  const now    = new Date();
  const thisMonthExp = getExpenseByCategory(now.getFullYear(), now.getMonth());

  const prev = new Date(now);
  prev.setMonth(prev.getMonth() - 1);
  const lastMonthExp = getExpenseByCategory(prev.getFullYear(), prev.getMonth());

  Object.entries(thisMonthExp).forEach(([cat, thisAmt]) => {
    const lastAmt = lastMonthExp[cat] || 0;
    if (lastAmt > 0) {
      const increase = ((thisAmt - lastAmt) / lastAmt) * 100;
      if (increase >= 50 && thisAmt > 100) {
        spikes.push({ cat, thisMonth: thisAmt, lastMonth: lastAmt, increase });
      }
    } else if (thisAmt > 200) {
      spikes.push({ cat, thisMonth: thisAmt, lastMonth: 0, increase: 100 });
    }
  });

  return spikes.sort((a,b) => b.increase - a.increase).slice(0,3);
}

// ─── Settings ─────────────────────────────────────────────────────────────────
function buildSettingsPage() {
  const s = getSettings();
  return `
<div class="space-y-6 max-w-2xl mx-auto">

  <!-- Page intro -->
  <div>
    <p class="text-sm text-gray-500 dark:text-gray-400">Manage your preferences, security, and data.</p>
  </div>

  <!-- ── Appearance ── -->
  <div class="card">
    <div class="flex items-center gap-3 mb-5">
      <div class="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-lg">🎨</div>
      <h3 class="text-base font-bold text-gray-900 dark:text-white">Appearance</h3>
    </div>
    <div class="divide-y divide-gray-100 dark:divide-gray-800">

      <div class="flex items-center justify-between py-3.5">
        <div>
          <p class="text-sm font-semibold text-gray-900 dark:text-white">Dark Mode</p>
          <p class="text-xs text-gray-400 mt-0.5">Switch between light and dark themes</p>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="dark-mode-toggle" ${s.darkMode ? 'checked' : ''} onchange="toggleDarkMode(this.checked)" />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="flex items-center justify-between py-3.5">
        <div>
          <p class="text-sm font-semibold text-gray-900 dark:text-white">Currency</p>
          <p class="text-xs text-gray-400 mt-0.5">Symbol shown before all amounts</p>
        </div>
        <select id="currency-select" class="form-select w-28 py-2" onchange="updateCurrency(this.value)">
          <option value="R"  ${s.currency==='R'  ?'selected':''}>R — ZAR</option>
          <option value="$"  ${s.currency==='$'  ?'selected':''}>$ — USD</option>
          <option value="€"  ${s.currency==='€'  ?'selected':''}>€ — EUR</option>
          <option value="£"  ${s.currency==='£'  ?'selected':''}>£ — GBP</option>
          <option value="K"  ${s.currency==='K'  ?'selected':''}>K — ZMW</option>
          <option value="N$" ${s.currency==='N$' ?'selected':''}>N$ — NAD</option>
        </select>
      </div>

    </div>
  </div>

  <!-- ── Security ── -->
  <div class="card">
    <div class="flex items-center gap-3 mb-5">
      <div class="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-lg">🔐</div>
      <h3 class="text-base font-bold text-gray-900 dark:text-white">Security</h3>
    </div>
    <p class="text-xs text-gray-400 mb-4">Change your 4-digit login PIN. You'll need your current PIN to confirm.</p>
    <form class="space-y-3" onsubmit="changePin(event)">
      <div>
        <label class="form-label">Current PIN</label>
        <input type="password" name="currentPin" class="form-input" placeholder="••••" maxlength="4" pattern="[0-9]{4}" inputmode="numeric" />
      </div>
      <div>
        <label class="form-label">New PIN</label>
        <input type="password" name="newPin" class="form-input" placeholder="••••" maxlength="4" pattern="[0-9]{4}" inputmode="numeric" />
      </div>
      <div>
        <label class="form-label">Confirm New PIN</label>
        <input type="password" name="confirmPin" class="form-input" placeholder="••••" maxlength="4" pattern="[0-9]{4}" inputmode="numeric" />
      </div>
      <button type="submit" class="btn-primary mt-1">Update PIN</button>
    </form>
  </div>

  <!-- ── Data & Export ── -->
  <div class="card">
    <div class="flex items-center gap-3 mb-5">
      <div class="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center text-lg">📦</div>
      <h3 class="text-base font-bold text-gray-900 dark:text-white">Data & Export</h3>
    </div>

    <div class="space-y-2">
      <button onclick="exportCSV()" class="settings-action-btn">
        <span class="settings-action-icon bg-blue-100 dark:bg-blue-900/40 text-blue-600">📤</span>
        <div class="flex-1 text-left">
          <p class="text-sm font-semibold text-gray-900 dark:text-white">Export to CSV</p>
          <p class="text-xs text-gray-400">Download transactions as a spreadsheet</p>
        </div>
        <span class="text-gray-300 dark:text-gray-600">›</span>
      </button>

      <button onclick="exportJSON()" class="settings-action-btn">
        <span class="settings-action-icon bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600">💾</span>
        <div class="flex-1 text-left">
          <p class="text-sm font-semibold text-gray-900 dark:text-white">Export Backup (JSON)</p>
          <p class="text-xs text-gray-400">Full backup of all your data</p>
        </div>
        <span class="text-gray-300 dark:text-gray-600">›</span>
      </button>

      <button onclick="exportPDF()" class="settings-action-btn">
        <span class="settings-action-icon bg-orange-100 dark:bg-orange-900/40 text-orange-600">🖨️</span>
        <div class="flex-1 text-left">
          <p class="text-sm font-semibold text-gray-900 dark:text-white">Print / Export PDF</p>
          <p class="text-xs text-gray-400">Open the browser print dialog</p>
        </div>
        <span class="text-gray-300 dark:text-gray-600">›</span>
      </button>

      <div class="pt-1 border-t border-gray-100 dark:border-gray-800 mt-1">
        <label class="form-label mt-3">Import Backup (JSON)</label>
        <input type="file" id="import-file" accept=".json" class="form-input text-sm" onchange="importData(event)" />
        <p class="text-xs text-gray-400 mt-1.5">Restore from a previously exported SpendBuddy backup file</p>
      </div>
    </div>
  </div>

  <!-- ── Danger Zone ── -->
  <div class="card border border-red-100 dark:border-red-900/40">
    <div class="flex items-center gap-3 mb-4">
      <div class="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-900/40 flex items-center justify-center text-lg">⚠️</div>
      <h3 class="text-base font-bold text-red-600 dark:text-red-400">Danger Zone</h3>
    </div>
    <p class="text-xs text-gray-400 mb-4">These actions are permanent and cannot be undone.</p>
    <button onclick="confirmClearData()" class="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors text-left">
      <span class="text-xl">🗑️</span>
      <div>
        <p class="text-sm font-semibold text-red-600 dark:text-red-400">Clear All Data</p>
        <p class="text-xs text-red-400 dark:text-red-500 mt-0.5">Deletes all transactions, budgets and goals</p>
      </div>
    </button>
  </div>

  <!-- ── About ── -->
  <div class="card text-center py-8">
    <div class="w-16 h-16 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center text-3xl shadow-lg">💰</div>
    <h3 class="font-bold text-gray-900 dark:text-white text-lg">SpendBuddy AI</h3>
    <p class="text-sm text-blue-500 font-medium mt-0.5">Track every cent. Grow every rand.</p>
    <p class="text-xs text-gray-400 mt-3">Version 1.0.0 &nbsp;·&nbsp; All data stored locally on your device</p>
  </div>

</div>`;
}

function bindSettingsEvents() {}

function toggleDarkMode(enabled) {
  const s = getSettings();
  s.darkMode = enabled;
  saveSettings(s);
  applyTheme();
}

function applyTheme() {
  const s = getSettings();
  document.documentElement.classList.toggle('dark', s.darkMode);
  document.getElementById('theme-toggle').textContent = s.darkMode ? '☀️' : '🌙';
}

function updateCurrency(val) {
  const s = getSettings();
  s.currency = val;
  saveSettings(s);
  showToast(`Currency set to ${val}`, 'success');
}

function changePin(e) {
  e.preventDefault();
  const form    = e.target;
  const current = form.currentPin.value;
  const newPin  = form.newPin.value;
  const confirm = form.confirmPin.value;
  const s       = getSettings();

  if (current !== s.pin) { showToast('Current PIN is incorrect','error'); return; }
  if (!/^\d{4}$/.test(newPin)) { showToast('PIN must be 4 digits','error'); return; }
  if (newPin !== confirm) { showToast('PINs do not match','error'); return; }

  s.pin = newPin;
  saveSettings(s);
  showToast('PIN updated successfully ✓','success');
  form.reset();
}

function exportCSV() {
  const txs = getTransactions();
  if (!txs.length) { showToast('No data to export','warning'); return; }
  const header = 'Date,Type,Category,Description,Amount,Recurring';
  const rows = txs.map(t =>
    `"${t.date}","${t.type}","${t.category}","${(t.description||'').replace(/"/g,'""')}","${t.amount}","${t.recurring?'Yes':'No'}"`
  );
  const csv  = [header, ...rows].join('\n');
  downloadFile(csv, 'spendbuddy-export.csv', 'text/csv');
  showToast('CSV exported ✓','success');
}

function exportJSON() {
  const data = {
    transactions: getTransactions(),
    budgets:      getBudgets(),
    goals:        getGoals(),
    settings:     { ...getSettings(), pin: undefined },
    exportedAt:   new Date().toISOString(),
  };
  downloadFile(JSON.stringify(data, null, 2), 'spendbuddy-backup.json', 'application/json');
  showToast('JSON backup exported ✓','success');
}

function exportPDF() {
  window.print();
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      if (data.transactions) saveTransactions(data.transactions);
      if (data.budgets)      saveBudgets(data.budgets);
      if (data.goals)        saveGoals(data.goals);
      showToast('Data imported successfully ✓','success');
      renderPage('settings');
    } catch {
      showToast('Invalid JSON file','error');
    }
  };
  reader.readAsText(file);
}

function confirmClearData() {
  openModal(`
<div class="p-6 text-center">
  <div class="text-5xl mb-4">⚠️</div>
  <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-2">Clear All Data?</h3>
  <p class="text-gray-500 dark:text-gray-400 text-sm mb-6">This will permanently delete all transactions, budgets, goals and settings. This cannot be undone.</p>
  <div class="flex gap-3">
    <button onclick="closeModal()" class="btn-secondary flex-1 justify-center">Cancel</button>
    <button onclick="clearAllData()" class="btn-danger flex-1 justify-center">Yes, Clear All</button>
  </div>
</div>`);
}

function clearAllData() {
  Object.values(KEYS).forEach(k => localStorage.removeItem(k));
  closeModal();
  showToast('All data cleared','warning');
  renderPage('dashboard');
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Sidebar + Theme Toggle ───────────────────────────────────────────────────
document.getElementById('menu-btn').addEventListener('click', () => {
  const sidebar  = document.getElementById('sidebar');
  const overlay  = document.getElementById('sidebar-overlay');
  const isOpen   = sidebar.classList.contains('open');
  sidebar.classList.toggle('open', !isOpen);
  overlay.classList.toggle('hidden', isOpen);
});

document.getElementById('sidebar-overlay').addEventListener('click', () => {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.add('hidden');
});

document.getElementById('theme-toggle').addEventListener('click', () => {
  const s = getSettings();
  s.darkMode = !s.darkMode;
  saveSettings(s);
  applyTheme();
  // Update the toggle in settings if visible
  const toggle = document.getElementById('dark-mode-toggle');
  if (toggle) toggle.checked = s.darkMode;
});

document.getElementById('lock-btn').addEventListener('click', lockApp);

// Nav click delegation
document.getElementById('sidebar').addEventListener('click', (e) => {
  const link = e.target.closest('.nav-link');
  if (link) { e.preventDefault(); navigate(link.dataset.page); }
});
document.querySelector('.mobile-bottom-nav').addEventListener('click', (e) => {
  const item = e.target.closest('.mobile-nav-item');
  if (item) { e.preventDefault(); navigate(item.dataset.page); }
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
function boot() {
  // Clear any previously seeded demo data so the app always starts at zero
  const seeded = localStorage.getItem('spendbuddy_seeded');
  if (!seeded) {
    localStorage.removeItem(KEYS.transactions);
    localStorage.removeItem(KEYS.budgets);
    localStorage.removeItem(KEYS.goals);
    localStorage.setItem('spendbuddy_seeded', 'cleared');
  }

  applyTheme();
  setupPinScreen();

  const auth = getAuth();
  if (auth.isAuthenticated && auth.lastActivity) {
    const elapsed = Date.now() - auth.lastActivity;
    if (elapsed < 5 * 60 * 1000) {
      // Still within session window
      document.getElementById('lock-screen').style.display = 'none';
      document.getElementById('app-shell').classList.remove('hidden');
      document.getElementById('app-shell').classList.add('flex');
      startInactivityTimer();
      navigate(location.hash.replace('#','') || 'dashboard');
    } else {
      lockApp();
    }
  }
}

// Run on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
