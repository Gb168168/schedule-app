import {
  db,
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
  serverTimestamp
} from './firebase.js';
import { LEAVE_TYPE_GROUPS, SYMBOLS, daysInMonth, escapeHtml, toDateKey } from './utils.js';

const state = {
  monthKey: '',
  assignments: [],
  employees: [],
  selected: null,
  unsub: null,
  elements: {}
};

export function initLeaveBoard(container, monthKey, employees) {
  if (!container) return;
  state.monthKey = monthKey;
  state.employees = employees;

  container.innerHTML = `
    <h3>Leave Board</h3>
    <div class="controls">
      <input id="leave-month" type="month" value="${monthKey}" />
      <button id="refresh-board" class="btn">Refresh</button>
    </div>
    <div class="leave-board-wrap"><table class="leave-board"><thead id="leave-head"></thead><tbody id="leave-body"></tbody></table></div>
    <div class="kpi-grid">
      <section class="kpi"><h4>Per Employee Leave Count</h4><div id="employee-stats"></div></section>
      <section class="kpi"><h4>Per Leave Type Count</h4><div id="type-stats"></div></section>
    </div>
  `;

  state.elements = {
    head: container.querySelector('#leave-head'),
    body: container.querySelector('#leave-body'),
    employeeStats: container.querySelector('#employee-stats'),
    typeStats: container.querySelector('#type-stats')
  };

  container.querySelector('#refresh-board').addEventListener('click', () => subscribeMonth(container.querySelector('#leave-month').value));
  container.querySelector('#leave-month').addEventListener('change', (e) => subscribeMonth(e.target.value));

  subscribeMonth(monthKey);
}

function subscribeMonth(monthKey) {
  if (!db) return;
  state.monthKey = monthKey;
  if (state.unsub) state.unsub();
  const q = query(collection(db, 'leaveAssignments'), where('date', '>=', `${monthKey}-01`), where('date', '<=', `${monthKey}-31`));
  state.unsub = onSnapshot(q, (snap) => {
    state.assignments = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderBoard();
  });
}

function renderBoard() {
  const days = daysInMonth(state.monthKey);
  state.elements.head.innerHTML = `<tr><th>Employee</th>${Array.from({ length: days }, (_, i) => `<th>${i + 1}</th>`).join('')}</tr>`;

  state.elements.body.innerHTML = state.employees.map((emp) => {
    const tds = Array.from({ length: days }, (_, i) => {
      const day = i + 1;
      const date = toDateKey(state.monthKey, day);
      const records = state.assignments.filter((a) => a.employeeId === emp.employeeId && a.date === date);
      const text = records.map((r) => r.type).join(' ');
      return `<td class="leave-cell" data-emp="${escapeHtml(emp.employeeId)}" data-date="${date}">${escapeHtml(text)}</td>`;
    }).join('');
    return `<tr><td>${escapeHtml(emp.name || emp.employeeId)}</td>${tds}</tr>`;
  }).join('');

  state.elements.body.querySelectorAll('.leave-cell').forEach((cell) => {
    cell.addEventListener('click', () => openLeaveTypeModal(cell.dataset.emp, cell.dataset.date));
  });

  renderStats();
}

function renderStats() {
  const employeeCount = {};
  const typeCount = {};
  state.assignments.forEach((a) => {
    employeeCount[a.employeeId] = (employeeCount[a.employeeId] || 0) + 1;
    typeCount[a.type] = (typeCount[a.type] || 0) + 1;
  });

  state.elements.employeeStats.innerHTML = Object.entries(employeeCount).map(([id, c]) => `<div>${escapeHtml(id)}: ${c} day(s)</div>`).join('') || '<p class="muted">No data</p>';
  state.elements.typeStats.innerHTML = Object.entries(typeCount).map(([t, c]) => `<div><span class="tag tag-${t}">${escapeHtml(t)}</span> ${c}</div>`).join('') || '<p class="muted">No data</p>';
}

function openLeaveTypeModal(employeeId, date) {
  state.selected = { employeeId, date };
  const modal = document.querySelector('#leave-type-modal');
  const title = document.querySelector('#leave-modal-title');
  const groups = document.querySelector('#leave-type-groups');
  title.textContent = `${employeeId} • ${date}`;
  groups.innerHTML = Object.entries(LEAVE_TYPE_GROUPS).map(([group, types]) => `
    <div class="group">
      <h4>${group}</h4>
      <div class="option-grid">
        ${types.map((t) => `<button class="btn leave-option" data-type="${t}">${t}</button>`).join('')}
      </div>
    </div>
  `).join('');

  groups.querySelectorAll('.leave-option').forEach((btn) => btn.addEventListener('click', () => saveCell(btn.dataset.type)));
  document.querySelectorAll('.symbol-btn').forEach((btn) => btn.onclick = () => saveCell(btn.dataset.symbol));
  document.querySelector('#clear-cell').onclick = clearCell;
  document.querySelector('#close-leave-modal').onclick = closeModal;
  modal.classList.remove('hidden');
}

async function saveCell(type) {
  if (!db || !state.selected) return;
  await addDoc(collection(db, 'leaveAssignments'), {
    employeeId: state.selected.employeeId,
    date: state.selected.date,
    type,
    createdAt: serverTimestamp()
  });
  closeModal();
}

async function clearCell() {
  if (!db || !state.selected) return;
  const targets = state.assignments.filter((a) => a.employeeId === state.selected.employeeId && a.date === state.selected.date);
  await Promise.all(targets.map((t) => deleteDoc(doc(db, 'leaveAssignments', t.id))));
  closeModal();
}

function closeModal() {
  document.querySelector('#leave-type-modal').classList.add('hidden');
}
