import { addDoc, collection, db, onSnapshot, serverTimestamp } from './firebase.js';

export function initSchedule(container) {
  if (!container) return;
  container.innerHTML = `
    <h3>Shift Settings & Schedules</h3>
    <div class="kpi-grid">
      <div class="kpi"><strong>Supported shifts</strong><div>Morning shift</div><div>Evening shift</div></div>
    </div>

    <form id="schedule-form" class="form-grid">
      <input type="date" name="date" required />
      <input name="employeeId" placeholder="Employee ID" required />
      <select name="shift" required>
        <option value="Morning shift">Morning shift</option>
        <option value="Evening shift">Evening shift</option>
      </select>
      <button class="btn btn-primary">Save Schedule</button>
    </form>
    <div id="schedule-list" class="list"></div>
  `;

  const form = container.querySelector('#schedule-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    if (!db) return;
    await addDoc(collection(db, 'schedules'), {
      date: fd.get('date'),
      employeeId: fd.get('employeeId'),
      shift: fd.get('shift'),
      createdAt: serverTimestamp()
    });
    form.reset();
  });

  if (db) {
    onSnapshot(collection(db, 'schedules'), (snap) => {
      container.querySelector('#schedule-list').innerHTML = snap.docs.map((d) => {
        const s = d.data();
        return `<article class="item">${s.date} • ${s.employeeId} • ${s.shift}</article>`;
      }).join('') || '<p class="muted">No schedules.</p>';
    });
  }
}
