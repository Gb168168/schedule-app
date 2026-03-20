const users = [
  {
    employeeId: "GoldBricks",
    password: "GoldBricks",
    name: "GoldBricks",
    role: "管理員",
    region: "北區",
    department: "資訊部"
  },
  {
    employeeId: "GB080202",
    password: "GB080202",
    name: "王小明",
    role: "一般員工",
    region: "中區",
    department: "排班部"
  }
];

const STORAGE_KEYS = {
  announcements: "shift_announcements",
  leaveRequests: "shift_leave_requests",
  schedules: "shift_schedules",
  currentUser: "shift_current_user"
};

let currentUser = null;
let editingAnnouncementId = null;
let calendarDate = new Date();
let selectedScheduleDate = "";
let editingScheduleId = null;

let announcements = loadData(STORAGE_KEYS.announcements, [
  {
    id: Date.now().toString() + "_a",
    title: "系統公告",
    content: "歡迎使用班表系統。",
    author: "系統管理員",
    createdAt: new Date().toLocaleString()
  }
]);

let leaveRequests = loadData(STORAGE_KEYS.leaveRequests, []);
let schedules = loadData(STORAGE_KEYS.schedules, []);

function loadData(key, defaultValue) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : defaultValue;
  } catch (error) {
    return defaultValue;
  }
}

function saveData(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function isAdmin(user) {
  return user && user.role === "管理員";
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

document.addEventListener("DOMContentLoaded", function () {
  const loginPage = document.getElementById("login-page");
  const mainPage = document.getElementById("main-page");
  const loginForm = document.getElementById("login-form");
  const loginError = document.getElementById("login-error");
  const logoutBtn = document.getElementById("logout-btn");

  const currentUserName = document.getElementById("current-user-name");
  const userRole = document.getElementById("user-role");
  const userRegion = document.getElementById("user-region");
  const userDepartment = document.getElementById("user-department");

  const staffName = document.getElementById("staff-name");
  const staffRole = document.getElementById("staff-role");
  const staffRegion = document.getElementById("staff-region");
  const staffDepartment = document.getElementById("staff-department");

  const pageTitle = document.getElementById("page-title");
  const menuButtons = document.querySelectorAll(".menu-btn");
  const pageSections = document.querySelectorAll(".page-section");

  const announcementForm = document.getElementById("announcement-form");
  const announcementTitle = document.getElementById("announcement-title");
  const announcementContent = document.getElementById("announcement-content");
  const announcementList = document.getElementById("announcement-list");

  const announcementEditBox = document.getElementById("announcement-edit-box");
  const announcementEditForm = document.getElementById("announcement-edit-form");
  const announcementEditTitle = document.getElementById("announcement-edit-title");
  const announcementEditContent = document.getElementById("announcement-edit-content");
  const announcementCancelEdit = document.getElementById("announcement-cancel-edit");

  const leaveForm = document.getElementById("leave-form");
  const leaveType = document.getElementById("leave-type");
  const leaveStart = document.getElementById("leave-start");
  const leaveEnd = document.getElementById("leave-end");
  const leaveReason = document.getElementById("leave-reason");
  const leaveList = document.getElementById("leave-list");
  const leaveStats = document.getElementById("leave-stats");

  const scheduleForm = document.getElementById("schedule-form");
  const scheduleDate = document.getElementById("schedule-date");
  const scheduleTitle = document.getElementById("schedule-title");
  const scheduleContent = document.getElementById("schedule-content");
  const calendarGrid = document.getElementById("calendar-grid");
  const calendarTitle = document.getElementById("calendar-title");
  const prevMonthBtn = document.getElementById("prev-month");
  const nextMonthBtn = document.getElementById("next-month");
  const schedulePopover = document.getElementById("schedule-popover");
  const schedulePopoverClose = document.getElementById("schedule-popover-close");
  const selectedDateText = document.getElementById("selected-date-text");
  const selectedDateScheduleList = document.getElementById("selected-date-schedule-list");
  const scheduleCancelBtn = document.getElementById("schedule-cancel-btn");
  const calendarWrap = document.querySelector(".calendar-wrap");
  const scheduleAddBtn = document.getElementById("schedule-add-btn");
  const scheduleEditorBox = document.getElementById("schedule-editor-box");
  const scheduleEditorTitle = document.getElementById("schedule-editor-title");

  function updateUserInfo(user) {
    if (currentUserName) currentUserName.textContent = user.name;
    if (userRole) userRole.textContent = user.role;
    if (userRegion) userRegion.textContent = user.region;
    if (userDepartment) userDepartment.textContent = user.department;

    if (staffName) staffName.textContent = user.name;
    if (staffRole) staffRole.textContent = user.role;
    if (staffRegion) staffRegion.textContent = user.region;
    if (staffDepartment) staffDepartment.textContent = user.department;
  }

  function hideAnnouncementEditor() {
    editingAnnouncementId = null;
    if (announcementEditBox) announcementEditBox.classList.add("hidden");
    if (announcementEditForm) announcementEditForm.reset();
  }

  function showScheduleEditor(mode) {
    if (scheduleEditorBox) {
      scheduleEditorBox.classList.remove("hidden");
    }

    if (scheduleEditorTitle) {
      scheduleEditorTitle.textContent = mode === "edit" ? "編輯排程" : "新增排程";
    }
  }

  function hideScheduleEditor() {
    editingScheduleId = null;

    if (scheduleEditorBox) {
      scheduleEditorBox.classList.add("hidden");
    }

    if (scheduleTitle) scheduleTitle.value = "";
    if (scheduleContent) scheduleContent.value = "";
    if (scheduleDate && selectedScheduleDate) scheduleDate.value = selectedScheduleDate;
  }

  function renderAnnouncements() {
    if (!announcementList) return;

    if (announcements.length === 0) {
      announcementList.innerHTML = `<div class="list-item"><p>目前沒有公告。</p></div>`;
      return;
    }

    announcementList.innerHTML = announcements
      .slice()
      .reverse()
      .map(function (item) {
        let actions = "";

        if (isAdmin(currentUser)) {
          actions = `
            <div class="item-actions">
              <button type="button" class="small-btn edit-btn" onclick="startEditAnnouncement('${item.id}')">編輯</button>
              <button type="button" class="small-btn delete-btn" onclick="deleteAnnouncement('${item.id}')">刪除</button>
            </div>
          `;
        }

        return `
          <div class="list-item">
            <h4>${item.title}</h4>
            <div class="item-meta">發布者：${item.author}｜時間：${item.createdAt}</div>
            <p>${item.content}</p>
            ${actions}
          </div>
        `;
      })
      .join("");
  }

  function renderLeaveStats() {
    if (!leaveStats) return;

    const visibleLeaves = isAdmin(currentUser)
      ? leaveRequests
      : leaveRequests.filter(function (item) {
          return currentUser && item.userName === currentUser.name;
        });

    const stats = {
      特休: 0,
      病假: 0,
      事假: 0,
      待審核: 0
    };

    visibleLeaves.forEach(function (item) {
      if (stats[item.type] !== undefined) stats[item.type] += 1;
      if (item.status === "待審核") stats["待審核"] += 1;
    });

    leaveStats.innerHTML = `
      <div class="stat-card"><h4>特休</h4><p>${stats["特休"]}</p></div>
      <div class="stat-card"><h4>病假</h4><p>${stats["病假"]}</p></div>
      <div class="stat-card"><h4>事假</h4><p>${stats["事假"]}</p></div>
      <div class="stat-card"><h4>待審核</h4><p>${stats["待審核"]}</p></div>
    `;
  }

  function renderLeaves() {
    if (!leaveList) return;

    const visibleLeaves = isAdmin(currentUser)
      ? leaveRequests
      : leaveRequests.filter(function (item) {
          return currentUser && item.userName === currentUser.name;
        });

    renderLeaveStats();

    if (visibleLeaves.length === 0) {
      leaveList.innerHTML = `<div class="list-item"><p>目前沒有請假申請。</p></div>`;
      return;
    }

    leaveList.innerHTML = visibleLeaves
      .slice()
      .reverse()
      .map(function (item) {
        let actionButtons = "";

        if (isAdmin(currentUser) && item.status === "待審核") {
          actionButtons += `
            <button type="button" class="small-btn approve-btn" onclick="approveLeave('${item.id}')">核准</button>
            <button type="button" class="small-btn reject-btn" onclick="rejectLeave('${item.id}')">駁回</button>
          `;
        }

        if (currentUser && item.userName === currentUser.name && item.status === "待審核") {
          actionButtons += `
            <button type="button" class="small-btn cancel-btn" onclick="cancelLeave('${item.id}')">取消請假</button>
          `;
        }

        return `
          <div class="list-item">
            <h4>${item.userName} - ${item.type}</h4>
            <div class="item-meta">
              部門：${item.department}｜區域：${item.region}
              ${item.reviewedBy ? `｜審核人：${item.reviewedBy}` : ""}
              ${item.reviewedAt ? `｜審核時間：${item.reviewedAt}` : ""}
            </div>
            <p>日期：${item.startDate} ~ ${item.endDate}</p>
            <p>原因：${item.reason}</p>
            <p><span class="status-badge status-${item.status}">${item.status}</span></p>
            ${actionButtons ? `<div class="item-actions">${actionButtons}</div>` : ""}
          </div>
        `;
      })
      .join("");
  }

  function renderSchedules() {
    if (!selectedDateScheduleList) return;

    if (!selectedScheduleDate) {
      selectedDateScheduleList.innerHTML = `<div class="list-item"><p>請先點選日期。</p></div>`;
      return;
    }

    const selectedSchedules = schedules.filter(function (item) {
      return item.date === selectedScheduleDate;
    });

    if (selectedSchedules.length === 0) {
      selectedDateScheduleList.innerHTML = `<div class="list-item"><p>這一天目前沒有排程。</p></div>`;
      return;
    }

    selectedDateScheduleList.innerHTML = selectedSchedules
      .map(function (item) {
        return `
          <div class="list-item">
            <h4>${item.title}</h4>
            <div class="item-meta">日期：${item.date}｜建立者：${item.author}</div>
            <p>${item.content}</p>
            <div class="item-actions">
              <button type="button" class="small-btn edit-btn" onclick="editSchedule('${item.id}')">編輯</button>
              <button type="button" class="small-btn delete-btn" onclick="deleteSchedule('${item.id}')">刪除</button>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function positionSchedulePopover(targetElement) {
    if (!schedulePopover || !calendarWrap || !targetElement) return;

    const wrapRect = calendarWrap.getBoundingClientRect();
    const cellRect = targetElement.getBoundingClientRect();

    const gap = 12;
    const popoverWidth = schedulePopover.offsetWidth || 360;
    const popoverHeight = schedulePopover.offsetHeight || 420;

    let left = cellRect.left - wrapRect.left;
    let top = cellRect.bottom - wrapRect.top + gap;

    if (left + popoverWidth > wrapRect.width - 8) {
      left = wrapRect.width - popoverWidth - 8;
    }

    if (left < 8) {
      left = 8;
    }

    if (top + popoverHeight > wrapRect.height && cellRect.top - wrapRect.top > popoverHeight) {
      top = cellRect.top - wrapRect.top - popoverHeight - gap;
    }

    if (top < 8) {
      top = 8;
    }

    schedulePopover.style.left = `${left}px`;
    schedulePopover.style.top = `${top}px`;
  }

  function openSchedulePopover(dateString, targetElement) {
    selectedScheduleDate = dateString;

    if (selectedDateText) selectedDateText.textContent = dateString;
    if (scheduleDate) scheduleDate.value = dateString;

    hideScheduleEditor();
    renderSchedules();

    if (schedulePopover) {
      schedulePopover.classList.remove("hidden");
    }

    renderCalendar();

    requestAnimationFrame(function () {
      positionSchedulePopover(targetElement);
    });
  }

  function closeSchedulePopover() {
    if (schedulePopover) schedulePopover.classList.add("hidden");
    hideScheduleEditor();
  }

  function renderCalendar() {
    if (!calendarGrid || !calendarTitle) return;

    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();

    calendarTitle.textContent = `${year} 年 ${month + 1} 月`;

    const first
