import { db, addDoc, collection, onSnapshot, serverTimestamp } from './firebase.js';
import { MENU_ITEMS, escapeHtml, fmt, isAdmin, toMonthKey } from './utils.js';
import { initEmployees, getEmployees } from './employees.js';
import { initLeaveBoard } from './leaveBoard.js';
import { initAttendance } from './attendance.js';
import { initSchedule } from './schedule.js';

const state = {
  currentUser: null,
  activePage: 'home'
};

const loginView = document.querySelector('#login-view');
const dashboardView = document.querySelector('#dashboard-view');
const loginForm = document.querySelector('#login-form');
const loginError = document.querySelector('#login-error');

function initMenu() {
  const menu = document.querySelector('#menu');
  menu.innerHTML = MENU_ITEMS.map(([key, label]) => `<button class="menu-btn ${key === state.activePage ? 'active' : ''}" data-page="${key}">${label}</button>`).join('');
  menu.querySelectorAll('.menu-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchPage(btn.dataset.page));
  });
}

function switchPage(page) {
  state.activePage = page;
  document.querySelector('#page-title').textContent = MENU_ITEMS.find((m) => m[0] === page)?.[1] || page;
  MENU_ITEMS.forEach(([key]) => document.querySelector(`#page-${key}`)?.classList.add('hidden'));
  document.querySelector(`#page-${page}`)?.classList.remove('hidden');
  initMenu();
  bootPage(page);
}

function bootPage(page) {
  if (!state.currentUser) return;
  const user = state.currentUser;
  if (page === 'home') renderHome();
  if (page === 'announcement') initAnnouncements();
  if (page === 'employees') initEmployees(document.querySelector('#page-employees'), user);
  if (page === 'leave-board') initLeaveBoard(document.querySelector('#page-leave-board'), toMonthKey(), getEmployees());
  if (page === 'schedule') initSchedule(document.querySelector('#page-schedule'));
  if (page === 'shift-settings') renderShiftSettings();
  if (page === 'attendance') initAttendance(document.querySelector('#page-attendance'), user.employeeId);
  if (page === 'today-staff') renderTodayStaff();
  if (page === 'leave-request') renderLeaveRequest();
  if (page === 'attendance-coordinates') renderAttendanceCoordinates();
}

function renderHome() {
  const el = document.querySelector('#page-home');
  el.innerHTML = `
    <h3>Dashboard Home</h3>
    <div class="kpi-grid">
      <div class="kpi"><strong>Realtime Sync</strong><div>Enabled via Firestore onSnapshot</div></div>
      <div class="kpi"><strong>Core Feature</strong><div>Leave calendar with symbols + leave types</div></div>
      <div class="kpi"><strong>Responsive</strong><div>Horizontal-scrolling leave board on mobile</div></div>
    </div>
  `;
}

function renderShiftSettings() {
  const el = document.querySelector('#page-shift-settings');
  el.innerHTML = `
    <h3>Shift Settings</h3>
    <div class="kpi-grid">
      <div class="kpi"><strong>Morning shift</strong><div>08:00 - 17:00</div></div>
      <div class="kpi"><strong>Evening shift</strong><div>16:00 - 01:00</div></div>
    </div>
  `;
}

function renderTodayStaff() {
  const el = document.querySelector('#page-today-staff');
  const today = new Date().toISOString().slice(0, 10);
  el.innerHTML = `<h3>Today Staff</h3><p class="muted">Date: ${today}</p><div id="today-list" class="list"></div>`;
  if (!db) return;
  onSnapshot(collection(db, 'schedules'), (snap) => {
    const list = snap.docs.map((d) => d.data()).filter((s) => s.date === today);
    el.querySelector('#today-list').innerHTML = list.map((s) => `<article class="item">${s.employeeId} - ${s.shift}</article>`).join('') || '<p class="muted">No one scheduled yet.</p>';
  });
}

function renderLeaveRequest() {
  document.querySelector('#page-leave-request').innerHTML = '<h3>Leave Request</h3><p class="muted">Use Leave Board for assignment. This section is reserved for request workflow expansion.</p>';
}

function renderAttendanceCoordinates() {
  document.querySelector('#page-attendance-coordinates').innerHTML = '<h3>Attendance Coordinates</h3><p class="muted">Configured office GPS matching is handled in attendance.js.</p>';
}

function initAnnouncements() {
  const el = document.querySelector('#page-announcement');
  const canManage = isAdmin(state.currentUser);
  el.innerHTML = `
    <h3>Announcements</h3>
    ${canManage ? `
      <form id="ann-form" class="form-grid">
        <input name="title" placeholder="Title" required />
        <textarea name="content" placeholder="Content" required></textarea>
        <button class="btn btn-primary">Create</button>
      </form>
    ` : ''}
    <div id="ann-list" class="list"></div>
  `;

  const form = el.querySelector('#ann-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      if (!db) return;
      await addDoc(collection(db, 'announcements'), {
        title: fd.get('title'),
        content: fd.get('content'),
        createdAt: serverTimestamp()
      });
      form.reset();
    });
  }

  if (db) {
    onSnapshot(collection(db, 'announcements'), (snap) => {
      el.querySelector('#ann-list').innerHTML = snap.docs.map((d) => {
        const a = d.data();
        return `<article class="item"><strong>${escapeHtml(a.title)}</strong><p>${escapeHtml(a.content)}</p><small class="muted">${a.createdAt?.toDate ? fmt(a.createdAt.toDate()) : ''}</small></article>`;
      }).join('') || '<p class="muted">No announcements.</p>';
    });
  }
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';

  const employeeId = document.querySelector('#employee-id').value.trim();
  const password = document.querySelector('#password').value.trim();

  if (employeeId === 'GoldBricks' && password === 'GoldBricks') {
    state.currentUser = { employeeId, name: 'GoldBricks Admin' };
  } else if (db) {
    const employeesPage = document.querySelector('#page-employees');
    initEmployees(employeesPage, { employeeId: 'GoldBricks' });
    await new Promise((r) => setTimeout(r, 300));
    const matched = getEmployees().find((e) => e.employeeId === employeeId && e.password === password);
    if (matched) state.currentUser = matched;
  }

  if (!state.currentUser) {
    loginError.textContent = 'Invalid credentials.';
    return;
  }

  loginView.classList.add('hidden');
  dashboardView.classList.remove('hidden');
  document.querySelector('#current-user').textContent = state.currentUser.name || state.currentUser.employeeId;
  initMenu();
  // Keep employee realtime cache warm for leave board and auth lookups.
  initEmployees(document.querySelector('#page-employees'), state.currentUser);
  bootPage('home');
});

document.querySelector('#logout-btn').addEventListener('click', () => {
  state.currentUser = null;
  loginView.classList.remove('hidden');
  dashboardView.classList.add('hidden');
  loginForm.reset();
});
