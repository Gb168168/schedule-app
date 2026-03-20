import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

const firebaseConfig = window.__FIREBASE_CONFIG__;
const firebaseApp = firebaseConfig ? initializeApp(firebaseConfig) : null;
const db = firebaseApp ? getFirestore(firebaseApp) : null;

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
  currentUser: "shift_current_user"
};

let currentUser = null;
let editingAnnouncementId = null;
let calendarDate = new Date();
let selectedScheduleDate = "";
let editingScheduleId = null;

let announcements = [];

let leaveRequests = [];
let schedules = [];

function loadData(key, defaultValue) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : defaultValue;
  } catch (error) {
    return defaultValue;
  }
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
    if (scheduleEditorBox) scheduleEditorBox.classList.remove("hidden");
    if (scheduleEditorTitle) {
      scheduleEditorTitle.textContent = mode === "edit" ? "編輯排程" : "新增排程";
    }
    if (scheduleTitle) scheduleTitle.focus();
  }

  function hideScheduleEditor() {
    editingScheduleId = null;
    if (scheduleEditorBox) scheduleEditorBox.classList.add("hidden");
    if (scheduleTitle) scheduleTitle.value = "";
    if (scheduleContent) scheduleContent.value = "";
    if (scheduleDate && selectedScheduleDate) scheduleDate.value = selectedScheduleDate;
  }

  function startAnnouncementsListener() {
    if (!db) return;

    const q = query(collection(db, "announcements"), orderBy("createdAtClient", "desc"));

    onSnapshot(q, function (snapshot) {
      announcements = snapshot.docs.map(function (docItem) {
        const data = docItem.data();
        return {
          id: docItem.id,
          title: data.title || "",
          content: data.content || "",
          author: data.author || "",
          createdAt: data.createdAt && data.createdAt.toDate
            ? data.createdAt.toDate().toLocaleString()
            : ""
        };
      });

      renderAnnouncements();
    });
  }

  function renderAnnouncements() {
    if (!announcementList) return;

    if (announcements.length === 0) {
      announcementList.innerHTML = `<div class="list-item"><p>目前沒有公告。</p></div>`;
      return;
    }

    announcementList.innerHTML = announcements
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

  function startLeaveListener() {
    if (!db) return;

    const q = query(collection(db, "leaveRequests"), orderBy("createdAtClient", "desc"));

    onSnapshot(q, function (snapshot) {
      leaveRequests = snapshot.docs.map(function (docItem) {
        const data = docItem.data();
        return {
          id: docItem.id,
          ...data
        };
      });

      renderLeaves();
    });
  }

   function startScheduleListener() {
    if (!db) return;

    const q = query(collection(db, "schedules"), orderBy("createdAtClient", "desc"));

    onSnapshot(q, function (snapshot) {
      schedules = snapshot.docs.map(function (docItem) {
        return {
          id: docItem.id,
          ...docItem.data()
        };
      });

      renderSchedules();
      renderCalendar();
    });
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

      leaveList.innerHTML = visibleLeaves.map(function (item) {
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

    const selectedSchedules = schedules
      .filter(function (item) {
        return item.date === selectedScheduleDate;
      })
      .sort(function (a, b) {
        return a.title.localeCompare(b.title, "zh-Hant");
      });

    if (selectedSchedules.length === 0) {
      selectedDateScheduleList.innerHTML = `<div class="list-item"><p>這一天目前沒有排程。</p></div>`;
      return;
    }

    selectedDateScheduleList.innerHTML = selectedSchedules
      .map(function (item) {
      return `
         <div class="list-item schedule-list-item">
            <div class="schedule-item-main">
              <h4>${item.title}</h4>
              <div class="item-meta">日期：${item.date}｜   建立者：${item.author}</div>
              <p>${item.content}</p>
            </div>
            <div class="item-actions schedule-item-actions">
              <button type="button" class="small-btn edit-btn" data-action="edit-schedule" data-id="${item.id}">編輯</button>
              <button type="button" class="small-btn delete-btn" data-action="delete-schedule" data-id="${item.id}">刪除</button>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function positionSchedulePopover() {
    if (!schedulePopover) return;

   schedulePopover.style.left = "50%";
   schedulePopover.style.top = "50%";
  }

  function openSchedulePopover(dateString) {
    selectedScheduleDate = dateString;
    editingScheduleId = null;

    if (selectedDateText) selectedDateText.textContent = dateString;
    if (scheduleDate) scheduleDate.value = dateString;

    hideScheduleEditor();
    renderSchedules();
    renderCalendar();

    if (schedulePopover) {
      schedulePopover.classList.remove("hidden");
    }

    requestAnimationFrame(function () {
      positionSchedulePopover();
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

    const firstDay = new Date(year, month, 1);
    const startDay = firstDay.getDay();
    const firstCellDate = new Date(year, month, 1 - startDay);

    const todayString = formatDate(new Date());
    const cells = [];

    for (let i = 0; i < 35; i++) {
      const cellDate = new Date(firstCellDate);
      cellDate.setDate(firstCellDate.getDate() + i);

      const cellDateString = formatDate(cellDate);
      const daySchedules = schedules.filter(function (item) {
        return item.date === cellDateString;
      });

      const isOtherMonth = cellDate.getMonth() !== month;
      const isToday = cellDateString === todayString;
      const isSelected = cellDateString === selectedScheduleDate;

      cells.push(`
        <div
          class="calendar-day ${isOtherMonth ? "other-month" : ""} ${isToday ? "today" : ""} ${isSelected ? "selected" : ""}"
          data-date="${cellDateString}"
        >
          <div class="calendar-day-number">${cellDate.getDate()}</div>
          <div class="calendar-events">
            ${daySchedules.map(function (schedule) {
            return `<div class="calendar-event">${schedule.title}</div>`;
            }).join("")}
          </div>
        </div>
      `);
    }

    calendarGrid.innerHTML = cells.join("");

    const dayCells = calendarGrid.querySelectorAll(".calendar-day");
    dayCells.forEach(function (cell) {
      cell.addEventListener("click", function (event) {
        const dateString = cell.dataset.date;
        openSchedulePopover(dateString, cell);
        event.stopPropagation();
      });
    });
  }

  window.startEditAnnouncement = function (id) {
    if (!isAdmin(currentUser)) return;

    const item = announcements.find(function (announcement) {
      return announcement.id === id;
    });

    if (!item) return;

    editingAnnouncementId = id;
    if (announcementEditTitle) announcementEditTitle.value = item.title;
    if (announcementEditContent) announcementEditContent.value = item.content;
    if (announcementEditBox) announcementEditBox.classList.remove("hidden");
    if (announcementEditTitle) announcementEditTitle.focus();
  };

  window.deleteAnnouncement = async function (id) {
  if (!isAdmin(currentUser)) return;
  if (!db) return;

  try {
    await deleteDoc(doc(db, "announcements", id));

    if (editingAnnouncementId === id) {
      hideAnnouncementEditor();
    }
  } catch (error) {
    console.error("刪除公告失敗", error);
    alert("刪除公告失敗，請稍後再試。");
  }
};
  
window.approveLeave = async function (id) {
    if (!db) return;
  
    await updateDoc(doc(db, "leaveRequests", id), {
      status: "已核准",
      reviewedBy: currentUser.name,
      reviewedAt: new Date().toLocaleString()
    });
  };

  window.rejectLeave = async function (id) {
    if (!db) return;

   await updateDoc(doc(db, "leaveRequests", id), {
      status: "已駁回",
      reviewedBy: currentUser.name,
      reviewedAt: new Date().toLocaleString()
    });
  };

 window.cancelLeave = async function (id) {
    if (!db) return;

   await updateDoc(doc(db, "leaveRequests", id), {
      status: "已取消",
      reviewedBy: currentUser.name,
      reviewedAt: new Date().toLocaleString()
    });
  };

  window.editSchedule = function (id) {
    const item = schedules.find(function (schedule) {
      return schedule.id === id;
    });

    if (!item) return;

    editingScheduleId = id;
    selectedScheduleDate = item.date;

    if (selectedDateText) selectedDateText.textContent = item.date;
    if (scheduleDate) scheduleDate.value = item.date;
    if (scheduleTitle) scheduleTitle.value = item.title;
    if (scheduleContent) scheduleContent.value = item.content;

    if (schedulePopover) {
      schedulePopover.classList.remove("hidden");
    }

    showScheduleEditor("edit");
    renderSchedules();
    renderCalendar();

    requestAnimationFrame(function () {
     positionSchedulePopover();
    });
  };

  window.deleteSchedule = async function (id) {
    if (!db) return;

   try {
     await deleteDoc(doc(db, "schedules", id));

     if (editingScheduleId === id) {
        hideScheduleEditor();
      }
    } catch (error) {
      console.error("刪除排程失敗", error);
      alert("刪除失敗");
    }
  };

  
  if (selectedDateScheduleList) {
    selectedDateScheduleList.addEventListener("click", function (event) {
      const actionButton = event.target.closest("[data-action]");
      if (!actionButton) return;

      const scheduleId = actionButton.dataset.id;
      if (!scheduleId) return;

      if (actionButton.dataset.action === "edit-schedule") {
        window.editSchedule(scheduleId);
      }

      if (actionButton.dataset.action === "delete-schedule") {
        window.deleteSchedule(scheduleId);
      }
    });
  }

  function setLoggedInUser(user) {
    currentUser = user;
    updateUserInfo(user);

    if (loginPage) loginPage.classList.add("hidden");
    if (mainPage) mainPage.classList.remove("hidden");

    localStorage.setItem(STORAGE_KEYS.currentUser, user.employeeId);

    renderLeaves();
    renderSchedules();
    renderCalendar();
  }

  function restoreLogin() {
    const savedEmployeeId = localStorage.getItem(STORAGE_KEYS.currentUser);
    if (!savedEmployeeId) return;

    const matchedUser = users.find(function (u) {
      return u.employeeId === savedEmployeeId;
    });

    if (!matchedUser) return;

    setLoggedInUser(matchedUser);
  }

  if (loginForm) {
    loginForm.addEventListener("submit", function (event) {
      event.preventDefault();

      const employeeIdInput = document.getElementById("employeeId");
      const passwordInput = document.getElementById("password");

      const employeeId = employeeIdInput ? employeeIdInput.value.trim() : "";
      const password = passwordInput ? passwordInput.value.trim() : "";

      const user = users.find(function (u) {
        return u.employeeId === employeeId && u.password === password;
      });

      if (!user) {
        if (loginError) loginError.textContent = "帳號或密碼錯誤";
        return;
      }

      if (loginError) loginError.textContent = "";
      setLoggedInUser(user);
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", function () {
      currentUser = null;
      editingAnnouncementId = null;
      editingScheduleId = null;
      selectedScheduleDate = "";

      localStorage.removeItem(STORAGE_KEYS.currentUser);

      hideAnnouncementEditor();
      closeSchedulePopover();

      if (mainPage) mainPage.classList.add("hidden");
      if (loginPage) loginPage.classList.remove("hidden");
      if (loginForm) loginForm.reset();
      if (loginError) loginError.textContent = "";
    });
  }

  menuButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      const targetPage = button.dataset.page;

      menuButtons.forEach(function (btn) {
        btn.classList.remove("active");
      });
      button.classList.add("active");

      pageSections.forEach(function (section) {
        section.classList.add("hidden");
      });

      const targetSection = document.getElementById("page-" + targetPage);
      if (targetSection) {
        targetSection.classList.remove("hidden");
      }

      if (pageTitle) pageTitle.textContent = button.textContent;
    });
  });

  if (announcementForm) {
    announcementForm.addEventListener("submit", async function (event) {
      event.preventDefault();

      const title = announcementTitle ? announcementTitle.value.trim() : "";
      const content = announcementContent ? announcementContent.value.trim() : "";

      if (!title || !content) {
        alert("請填寫完整公告內容");
        return;
      }

      if (!db) {
        alert("尚未設定 Firebase，無法將公告儲存到雲端。請先提供 Firebase 設定。\n可在 index.html 先設定 window.__FIREBASE_CONFIG__。");
        return;
      }

      try {
        const author = currentUser ? currentUser.name : "未知使用者";
        
        await addDoc(collection(db, "announcements"), {
          title: title,
          content: content,
          author: author,
          createdAt: serverTimestamp(),
          createdAtClient: new Date()
        });

        announcementForm.reset();
      } catch (error) {
        console.error("新增公告失敗", error);
        alert("公告雲端儲存失敗，請稍後再試。");
      }
    });
  }

    if (announcementEditForm) {
     announcementEditForm.addEventListener("submit", async function (event) {
      event.preventDefault();

    if (!editingAnnouncementId || !db) return;

      const title = announcementEditTitle ? announcementEditTitle.value.trim() : "";
      const content = announcementEditContent ? announcementEditContent.value.trim() : "";

     if (!title || !content) {
        alert("請填寫完整公告內容");
        return;
      }

     try {
        await updateDoc(doc(db, "announcements", editingAnnouncementId), {
          title: title,
          content: content,
          updatedAt: serverTimestamp()
        });

        hideAnnouncementEditor();
      } catch (error) {
        console.error("更新公告失敗", error);
        alert("更新公告失敗，請稍後再試。");
      }
    });
  }

  if (announcementCancelEdit) {
    announcementCancelEdit.addEventListener("click", function () {
      hideAnnouncementEditor();
    });
  }

  if (leaveForm) {
     leaveForm.addEventListener("submit", async function (event) {
      event.preventDefault();

      const startDate = leaveStart ? leaveStart.value : "";
      const endDate = leaveEnd ? leaveEnd.value : "";
      const reason = leaveReason ? leaveReason.value.trim() : "";

      if (!startDate || !endDate || !reason) {
        alert("請填寫完整請假資料");
        return;
      }

      if (startDate > endDate) {
        alert("開始日期不能晚於結束日期");
        return;
      }

      if (!db) {
        alert("Firebase 未設定");
        return;
      }

      try {
        await addDoc(collection(db, "leaveRequests"), {
          userName: currentUser.name,
          department: currentUser.department,
          region: currentUser.region,
          type: leaveType.value,
          startDate,
          endDate,
          reason,
          status: "待審核",
          reviewedBy: "",
          reviewedAt: "",
          createdAt: serverTimestamp(),
          createdAtClient: new Date()
        });

        leaveForm.reset();
      } catch (error) {
        console.error("請假新增失敗", error);
        alert("請假送出失敗");
      }
    });
  }

  if (scheduleAddBtn) {
    scheduleAddBtn.addEventListener("click", function () {
      editingScheduleId = null;
      if (scheduleDate) scheduleDate.value = selectedScheduleDate;
      if (scheduleTitle) scheduleTitle.value = "";
      if (scheduleContent) scheduleContent.value = "";
      showScheduleEditor("add");
    });
  }

  if (scheduleForm) {
    scheduleForm.addEventListener("submit", async function (event) {
      event.preventDefault();

      const date = scheduleDate.value;
      const title = scheduleTitle.value.trim();
      const content = scheduleContent.value.trim();

      if (!date || !title || !content) {
        alert("請填寫完整排程資料");
        return;
      }

      if (!db) {
        alert("Firebase 未設定");
        return;
      }

      try {
        if (editingScheduleId) {
          await updateDoc(doc(db, "schedules", editingScheduleId), {
            date,
            title,
            content
          });
        } else {
          await addDoc(collection(db, "schedules"), {
            date,
            title,
            content,
            author: currentUser.name,
            createdAt: serverTimestamp(),
            createdAtClient: new Date()
          });
        }

         hideScheduleEditor();
      } catch (error) {
        console.error("排程失敗", error);
        alert("排程儲存失敗");
      }
    });
  }

  if (scheduleCancelBtn) {
    scheduleCancelBtn.addEventListener("click", function () {
      hideScheduleEditor();
    });
  }

  if (schedulePopoverClose) {
    schedulePopoverClose.addEventListener("click", function (event) {
      event.stopPropagation();
      closeSchedulePopover();
    });
  }

   if (schedulePopover) {
    schedulePopover.addEventListener("click", function (event) {
      event.stopPropagation();
    });
  }

  document.addEventListener("click", function (event) {
    if (!schedulePopover || schedulePopover.classList.contains("hidden")) return;

    const clickedInsidePopover = schedulePopover.contains(event.target);
    const clickedDayCell = event.target.closest(".calendar-day");

    if (!clickedInsidePopover && !clickedDayCell) {
      closeSchedulePopover();
    }
  });

  window.addEventListener("resize", function () {
    if (!schedulePopover || schedulePopover.classList.contains("hidden")) return;

    positionSchedulePopover();
  });

  if (prevMonthBtn) {
    prevMonthBtn.addEventListener("click", function () {
      calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1);
      renderCalendar();
      closeSchedulePopover();
    });
  }

  if (nextMonthBtn) {
    nextMonthBtn.addEventListener("click", function () {
      calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1);
      renderCalendar();
      closeSchedulePopover();
    });
  }

  renderLeaves();
  renderSchedules();
  renderCalendar();
  restoreLogin();
  startAnnouncementsListener();
  startScheduleListener();
});
