import { db, addDoc, collection, deleteDoc, doc, onSnapshot, updateDoc } from './firebase.js';
import { escapeHtml, isAdmin } from './utils.js';

const state = { employees: [], unsub: null };

export function initEmployees(container, currentUser) {
  if (!container) return;

  if (state.unsub) state.unsub();
  if (!db) {
    container.innerHTML = '<p class="error">Firebase is not configured.</p>';
    return;
  }

  container.innerHTML = `
    <h3>Employee Management</h3>
    ${isAdmin(currentUser) ? `
      <form id="employee-form" class="form-grid">
        <input name="employeeId" placeholder="Employee ID" required />
        <input name="password" placeholder="Password" required />
        <input name="name" placeholder="Name" required />
        <input name="department" placeholder="Department" required />
        <input name="region" placeholder="Region" required />
        <button class="btn btn-primary">Add Employee</button>
      </form>
    ` : '<p class="muted">Read-only for non-admin users.</p>'}
    <div id="employee-list" class="list"></div>
  `;

  const listEl = container.querySelector('#employee-list');
  const form = container.querySelector('#employee-form');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      await addDoc(collection(db, 'employees'), {
        employeeId: fd.get('employeeId'),
        password: fd.get('password'),
        name: fd.get('name'),
        department: fd.get('department'),
        region: fd.get('region'),
        createdAt: Date.now()
      });
      form.reset();
    });
  }

  state.unsub = onSnapshot(collection(db, 'employees'), (snap) => {
    state.employees = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderList(listEl, currentUser);
  });
}

function renderList(listEl, currentUser) {
  if (!listEl) return;
  const canEdit = isAdmin(currentUser);
  listEl.innerHTML = state.employees.map((e) => `
    <article class="item">
      <strong>${escapeHtml(e.name || e.employeeId)}</strong>
      <div class="muted">${escapeHtml(e.employeeId)} • ${escapeHtml(e.department || '-')} • ${escapeHtml(e.region || '-')}</div>
      ${canEdit ? `
        <div class="controls">
          <button class="btn" data-edit="${e.id}">Edit</button>
          <button class="btn btn-danger" data-del="${e.id}">Delete</button>
        </div>
      ` : ''}
    </article>
  `).join('') || '<p class="muted">No employees yet.</p>';

  if (canEdit) {
    listEl.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await deleteDoc(doc(db, 'employees', btn.dataset.del));
      });
    });

    listEl.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const target = state.employees.find((e) => e.id === btn.dataset.edit);
        if (!target) return;
        const name = prompt('Name', target.name || '');
        const department = prompt('Department', target.department || '');
        const region = prompt('Region', target.region || '');
        if (!name || !department || !region) return;
        await updateDoc(doc(db, 'employees', target.id), { name, department, region });
      });
    });
  }
}

export function getEmployees() {
  return [...state.employees];
}
