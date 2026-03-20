// ===== 使用者 =====
const users = [
  { employeeId: "GoldBricks", password: "GoldBricks", name: "GoldBricks", role: "管理員", region: "北區", department: "資訊部" },
  { employeeId: "GB080202", password: "GB080202", name: "王小明", role: "一般員工", region: "中區", department: "排班部" }
];

// ===== Storage =====
const KEY = {
  schedules: "shift_schedules",
  user: "shift_user"
};

let currentUser = null;
let schedules = JSON.parse(localStorage.getItem(KEY.schedules) || "[]");

let calendarDate = new Date();
let selectedDate = "";
let editingId = null;

// ===== DOM =====
const loginPage = document.getElementById("login-page");
const mainPage = document.getElementById("main-page");

const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const logoutBtn = document.getElementById("logout-btn");

const currentUserName = document.getElementById("current-user-name");

// schedule
const calendarGrid = document.getElementById("calendar-grid");
const calendarTitle = document.getElementById("calendar-title");

const schedulePopover = document.getElementById("schedule-popover");
const scheduleClose = document.getElementById("schedule-popover-close");

const scheduleAddBtn = document.getElementById("schedule-add-btn");
const scheduleEditorBox = document.getElementById("schedule-editor-box");
const scheduleEditorTitle = document.getElementById("schedule-editor-title");

const scheduleForm = document.getElementById("schedule-form");
const scheduleDate = document.getElementById("schedule-date");
const scheduleTitle = document.getElementById("schedule-title");
const scheduleContent = document.getElementById("schedule-content");
const scheduleCancelBtn = document.getElementById("schedule-cancel-btn");

const scheduleList = document.getElementById("selected-date-schedule-list");
const selectedDateText = document.getElementById("selected-date-text");

const calendarWrap = document.querySelector(".calendar-wrap");

// ===== 共用 =====
function save() {
  localStorage.setItem(KEY.schedules, JSON.stringify(schedules));
}

function formatDate(d) {
  return d.toISOString().split("T")[0];
}

// ===== 登入 =====
loginForm?.addEventListener("submit", (e) => {
  e.preventDefault();

  const id = document.getElementById("employeeId").value;
  const pw = document.getElementById("password").value;

  const user = users.find(u => u.employeeId === id && u.password === pw);

  if (!user) {
    loginError.textContent = "帳號錯誤";
    return;
  }

  currentUser = user;
  localStorage.setItem(KEY.user, user.employeeId);

  loginPage.classList.add("hidden");
  mainPage.classList.remove("hidden");

  currentUserName.textContent = user.name;

  renderCalendar();
});

// restore
(function () {
  const saved = localStorage.getItem(KEY.user);
  if (!saved) return;

  const user = users.find(u => u.employeeId === saved);
  if (!user) return;

  currentUser = user;
  loginPage.classList.add("hidden");
  mainPage.classList.remove("hidden");

  currentUserName.textContent = user.name;

  renderCalendar();
})();

logoutBtn?.addEventListener("click", () => {
  localStorage.removeItem(KEY.user);
  location.reload();
});

// ===== 排程 =====

function renderCalendar() {
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();

  calendarTitle.textContent = `${year} 年 ${month + 1} 月`;

  const first = new Date(year, month, 1);
  const start = first.getDay();

  const startDate = new Date(year, month, 1 - start);

  let html = "";

  for (let i = 0; i < 42; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);

    const ds = formatDate(d);

    const list = schedules.filter(s => s.date === ds);

    html += `
      <div class="calendar-day" data-date="${ds}">
        <div>${d.getDate()}</div>
        ${list.map(s => `<div class="calendar-event">${s.title}</div>`).join("")}
      </div>
    `;
  }

  calendarGrid.innerHTML = html;

  document.querySelectorAll(".calendar-day").forEach(el => {
    el.onclick = (e) => {
      openPopover(el.dataset.date, el);
      e.stopPropagation();
    };
  });
}

// ===== Popover =====

function openPopover(date, el) {
  selectedDate = date;
  editingId = null;

  selectedDateText.textContent = date;
  scheduleDate.value = date;

  hideEditor();
  renderList();

  schedulePopover.classList.remove("hidden");

  positionPopover(el);
}

function closePopover() {
  schedulePopover.classList.add("hidden");
  hideEditor();
}

scheduleClose?.addEventListener("click", closePopover);

// ===== 位置 =====
function positionPopover(el) {
  const rect = el.getBoundingClientRect();
  const wrap = calendarWrap.getBoundingClientRect();

  schedulePopover.style.left = (rect.left - wrap.left) + "px";
  schedulePopover.style.top = (rect.bottom - wrap.top + 10) + "px";
}

// ===== Editor =====
function showEditor(mode) {
  scheduleEditorBox.classList.remove("hidden");
  scheduleEditorTitle.textContent = mode === "edit" ? "編輯排程" : "新增排程";
}

function hideEditor() {
  editingId = null;
  scheduleEditorBox.classList.add("hidden");
  scheduleTitle.value = "";
  scheduleContent.value = "";
}

// ===== 列表 =====
function renderList() {
  const list = schedules.filter(s => s.date === selectedDate);

  if (list.length === 0) {
    scheduleList.innerHTML = `<div class="list-item">沒有排程</div>`;
    return;
  }

  scheduleList.innerHTML = list.map(s => `
    <div class="list-item">
      <h4>${s.title}</h4>
      <p>${s.content}</p>
      <button onclick="editSchedule('${s.id}')">編輯</button>
      <button onclick="deleteSchedule('${s.id}')">刪除</button>
    </div>
  `).join("");
}

// ===== 新增 =====
scheduleAddBtn?.addEventListener("click", () => {
  editingId = null;
  scheduleTitle.value = "";
  scheduleContent.value = "";
  showEditor("add");
});

// ===== 儲存 =====
scheduleForm?.addEventListener("submit", (e) => {
  e.preventDefault();

  const title = scheduleTitle.value;
  const content = scheduleContent.value;

  if (!title || !content) return;

  if (editingId) {
    schedules = schedules.map(s =>
      s.id === editingId ? { ...s, title, content } : s
    );
  } else {
    schedules.push({
      id: Date.now() + "",
      date: selectedDate,
      title,
      content
    });
  }

  save();
  hideEditor();
  renderList();
  renderCalendar();
});

// ===== 編輯 =====
window.editSchedule = function (id) {
  const s = schedules.find(x => x.id === id);
  if (!s) return;

  editingId = id;

  scheduleTitle.value = s.title;
  scheduleContent.value = s.content;

  showEditor("edit");
};

// ===== 刪除 =====
window.deleteSchedule = function (id) {
  schedules = schedules.filter(s => s.id !== id);
  save();
  renderList();
  renderCalendar();
};

// ===== 取消 =====
scheduleCancelBtn?.addEventListener("click", hideEditor);

// ===== 點外面關閉 =====
document.addEventListener("click", (e) => {
  if (!schedulePopover.contains(e.target)) {
    closePopover();
  }
});
