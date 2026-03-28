export const MENU_ITEMS = [
  ['home', 'Home'],
  ['announcement', 'Announcement'],
  ['leave-board', 'Leave Board'],
  ['schedule', 'Schedule'],
  ['today-staff', 'Today Staff'],
  ['employees', 'Employees'],
  ['leave-request', 'Leave Request'],
  ['attendance', 'Attendance'],
  ['shift-settings', 'Shift Settings'],
  ['attendance-coordinates', 'Attendance Coordinates']
];

export const LEAVE_TYPE_GROUPS = {
  'General Leave': ['事假', '病假', '公假', '年假', '特休'],
  'Special Leave': ['婚假', '產假', '生理', '喪假', '公傷'],
  'Compensation / Adjustment': ['補(天)', '補(時)', '調班'],
  'Travel Leave': ['旅遊', '旅(例)']
};

export const SYMBOLS = ['▲', '★', '🎰'];

export const toMonthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
export const daysInMonth = (monthKey) => {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};
export const toDateKey = (monthKey, day) => `${monthKey}-${String(day).padStart(2, '0')}`;
export const fmt = (value) => new Date(value).toLocaleString();
export const escapeHtml = (s = '') => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const isAdmin = (user) => user?.employeeId === 'GoldBricks';
