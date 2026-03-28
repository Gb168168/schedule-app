import { db, addDoc, collection, onSnapshot, query, serverTimestamp, where } from './firebase.js';

const OFFICE = { lat: 25.033, lng: 121.5654, radiusMeters: 300 };

function distanceMeters(a, b) {
  const R = 6371e3;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function initAttendance(container, employeeId) {
  if (!container) return;
  container.innerHTML = `
    <h3>Attendance</h3>
    <p>GPS clock-in / clock-out with location metadata.</p>
    <div class="controls">
      <button id="clock-in" class="btn btn-primary">Clock In</button>
      <button id="clock-out" class="btn">Clock Out</button>
    </div>
    <div id="att-status" class="item">Waiting for action.</div>
    <h4>My Records (Realtime)</h4>
    <div id="att-list" class="list"></div>
  `;

  container.querySelector('#clock-in').onclick = () => submitAttendance('clock-in', container, employeeId);
  container.querySelector('#clock-out').onclick = () => submitAttendance('clock-out', container, employeeId);

  if (db) {
    const q = query(collection(db, 'attendanceRecords'), where('employeeId', '==', employeeId));
    onSnapshot(q, (snap) => {
      const list = container.querySelector('#att-list');
      list.innerHTML = snap.docs.map((d) => {
        const r = d.data();
        return `<article class="item">${r.action} • ${r.location?.lat?.toFixed?.(5)}, ${r.location?.lng?.toFixed?.(5)} • matched office: ${r.matchedOffice ? 'yes' : 'no'} • network: ${r.networkType || 'unknown'}</article>`;
      }).join('') || '<p class="muted">No records</p>';
    });
  }
}

async function submitAttendance(action, container, employeeId) {
  const status = container.querySelector('#att-status');
  if (!navigator.geolocation) {
    status.textContent = 'Geolocation not supported.';
    return;
  }

  navigator.geolocation.getCurrentPosition(async (pos) => {
    const location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    const matchedOffice = distanceMeters(location, OFFICE) <= OFFICE.radiusMeters;
    const networkType = navigator.connection?.effectiveType || navigator.connection?.type || 'unknown';

    status.textContent = `location: ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)} | matched office: ${matchedOffice ? 'yes' : 'no'} | network type: ${networkType}`;

    if (db) {
      await addDoc(collection(db, 'attendanceRecords'), {
        employeeId,
        action,
        location,
        matchedOffice,
        networkType,
        createdAt: serverTimestamp()
      });
    }
  }, (err) => {
    status.textContent = `Location error: ${err.message}`;
  });
}
