import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

const REGIONS = ["新竹區", "台中區", "嘉義區"];
const DEPARTMENTS = ["管理部", "TSE", "FAE", "新場", "倉管", "RD", "線上客服"];

const firebaseConfig = window.__FIREBASE_CONFIG__;
const firebaseApp = firebaseConfig ? initializeApp(firebaseConfig) : null;
const db = firebaseApp ? getFirestore(firebaseApp) : null;

const users = [
  {
    employeeId: "GoldBricks",
    password: "GoldBricks",
    name: "GoldBricks",
    role: "管理員",
    region: "台中區",
    department: "最高權限"
  },
  {
    employeeId: "GB080202",
    password: "GB080202",
    name: "邱淑芬",
    role: "財務副理",
    region: "台中區",
    department: "管理部"
  }
];

const STORAGE_KEYS = { currentUser: "shift_current_user" };

let currentUser = null;
let editingAnnouncementId = null;
let calendarDate = new Date();
let selectedScheduleDate = "";
let editingScheduleId = null;
let announcements = [];
let leaveRequests = [];
let schedules = [];
let employees = [];

function isAdmin(user) {
  return user && user.role === "管理員";
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatEmployeePermissions(employee) {
  const tags = [];
  if (employee.permissions?.admin) tags.push("管理員");
  if (employee.permissions?.leaveApprove) tags.push("可審核請假");
  if (employee.permissions?.announcementManage) tags.push("公告管理");
  return tags.length > 0 ? tags.join("、") : "一般員工";
}

function createEmployee(employeeData) {
  return addDoc(collection(db, "employees"), {
    ...employeeData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
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

  const employeeForm = document.getElementById("employee-form");
  const employeeList = document.getElementById("employee-list");
  const employeeDepartmentSelect = document.getElementById("employee-form-department");
  const employeeRegionSelect = document.getElementById("employee-form-region");
  const manageRegions = document.getElementById("manage-regions");
  const manageDepartments = document.getElementById("manage-departments");
  const adminCheckbox = document.getElementById("permission-admin");
  const leaveApproveCheckbox = document.getElementById("permission-leave-approve");
  const announcementManageCheckbox = document.getElementById("permission-announcement-manage");
  const adminScopePanel = document.getElementById("admin-scope-panel");
  
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
  const scheduleAddBtn = document.getElementById("schedule-add-btn");
  const scheduleEditorBox = document.getElementById("schedule-editor-box");
  const scheduleEditorTitle = document.getElementById("schedule-editor-title");

  function populateFixedOptions() {
    if (employeeRegionSelect) {
     employeeRegionSelect.innerHTML = `<option value="">請選擇地區</option>${REGIONS.map((region) => `<option value="${region}">${region}</option>`).join("")}`;
    }

    if (employeeDepartmentSelect) {
      employeeDepartmentSelect.innerHTML = `<option value="">請選擇部門</option>${DEPARTMENTS.map((department) => `<option value="${department}">${department}</option>`).join("")}`;
    }

    if (manageRegions) {
      manageRegions.innerHTML = REGIONS.map((region) => `<label><input type="checkbox" name="manage-regions" value="${region}" /> ${region}</label>`).join("");
    }

    if (manageDepartments) {
      manageDepartments.innerHTML = DEPARTMENTS.map((department) => `<label><input type="checkbox" name="manage-departments" value="${department}" /> ${department}</label>`).join("");
    }
  }

  function syncAdminPermissionState() {
   if (!adminCheckbox || !adminScopePanel) return;

    adminScopePanel.classList.toggle("hidden", !adminCheckbox.checked);

    if (!adminCheckbox.checked) {
      if (leaveApproveCheckbox) leaveApproveCheckbox.checked = false;
      if (announcementManageCheckbox) announcementManageCheckbox.checked = false;
      document.querySelectorAll('input[name="manage-regions"], input[name="manage-departments"]').forEach(function (input) {
        input.checked = false;
      });
      return;
    }
    
    if (leaveApproveCheckbox) leaveApproveCheckbox.checked = true;
  }
  
  function updateUserInfo(user) {
    if (currentUserName) currentUserName.textContent = user.name;
    if (userRole) userRole.textContent = user.role;
    if (userRegion) userRegion.textContent = user.region;
    if (userDepartment) userDepartment.textContent = user.department;
  }

  function renderEmployees() {
    if (!employeeList) return;

    if (employees.length === 0) {
      employeeList.innerHTML = `<div class="list-item"><p>目前沒有員工資料。</p></div>`;
      return;
    }

    employeeList.innerHTML = employees.map(function (employee) {
      const shifts = [];
      if (employee.shifts?.morning) shifts.push("早班");
      if (employee.shifts?.evening) shifts.push("晚班");
      if (employee.weekendsOff) shifts.push("週休二日 &amp; 國定假日");

      const scopeRegions = employee.manageScopes?.regions?.length ? employee.manageScopes.regions.join("、") : "未設定";
      const scopeDepartments = employee.manageScopes?.departments?.length ? employee.manageScopes.departments.join("、") : "未設定";

      return `
        <div class="list-item">
          <div class="employee-card-header">
            <h4>${employee.name || "未命名員工"}</h4>
            <span class="status-badge status-${employee.status || "active"}">${employee.status || "active"}</span>
          </div>
          <div class="item-meta">員工代號：${employee.employeeId || "-"}｜帳號：${employee.account || "-"}｜Email：${employee.email || "-"}</div>
          <p>部門：${employee.department || "-"}｜職稱：${employee.title || "-"}｜地區：${employee.region || "-"}</p>
          <p>類別：${employee.category || "-"}｜電話：${employee.phone || "-"}｜生日：${employee.birthday || "-"}</p>
          <p>年度特休：${employee.annualLeaveDays || 0} 天｜班別與休假：${shifts.join("、") || "未設定"}</p>
          <p>權限：${formatEmployeePermissions(employee)}</p>
          ${employee.permissions?.admin ? `<p>管理地區：${scopeRegions}</p><p>管理部門：${scopeDepartments}</p>` : ""}
        </div>
      `;
    }).join("");
  }

  function startEmployeesListener() {
    if (!db) return;
    const q = query(collection(db, "employees"), orderBy("createdAt", "desc"));
    onSnapshot(q, function (snapshot) {
      employees = snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() })).filter((employee) => !employee.isHidden);
      renderEmployees();
    });
  }

  function hideAnnouncementEditor() {
    editingAnnouncementId = null;
    if (announcementEditBox) announcementEditBox.classList.add("hidden");
    if (announcementEditForm) announcementEditForm.reset();
  }

  function showScheduleEditor(mode) {
    if (scheduleEditorBox) scheduleEditorBox.classList.remove("hidden");
    if (scheduleEditorTitle) scheduleEditorTitle.textContent = mode === "edit" ? "編輯排程" : "新增排程";
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
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString() : ""
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

    announcementList.innerHTML = announcements.map(function (item) {
      const actions = isAdmin(currentUser)
        ? `<div class="item-actions">
            <button type="button" class="small-btn edit-btn" onclick="startEditAnnouncement('${item.id}')">編輯</button>
            <button type="button" class="small-btn delete-btn" onclick="deleteAnnouncement('${item.id}')">刪除</button>
         </div>`
        : "";

     return `<div class="list-item"><h4>${item.title}</h4><div class="item-meta">發布者：${item.author}｜時間：${item.createdAt}</div><p>${item.content}</p>${actions}</div>`;
    }).join("");
  }

  function startLeaveListener() {
    if (!db) return;
    const q = query(collection(db, "leaveRequests"), orderBy("createdAtClient", "desc"));
    onSnapshot(q, function (snapshot) {
      leaveRequests = snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }));
      renderLeaves();
    });
  }

  function startScheduleListener() {
    if (!db) return;
    const q = query(collection(db, "schedules"), orderBy("createdAtClient", "desc"));
    onSnapshot(q, function (snapshot) {
      schedules = snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }));
      renderSchedules();
      renderCalendar();
    });
  }

  function renderLeaveStats() {
    if (!leaveStats) return;
    const visibleLeaves = isAdmin(currentUser) ? leaveRequests : leaveRequests.filter((item) => currentUser && item.userName === currentUser.name);
    const stats = { 特休: 0, 病假: 0, 事假: 0, 待審核: 0 };
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
    const visibleLeaves = isAdmin(currentUser) ? leaveRequests : leaveRequests.filter((item) => currentUser && item.userName === currentUser.name);
    renderLeaveStats();

    if (visibleLeaves.length === 0) {
      leaveList.innerHTML = `<div class="list-item"><p>目前沒有請假申請。</p></div>`;
      return;
    }

    leaveList.innerHTML = visibleLeaves.map(function (item) {
      let actionButtons = "";
      if (isAdmin(currentUser) && item.status === "待審核") {
        actionButtons += `<button type="button" class="small-btn approve-btn" onclick="approveLeave('${item.id}')">核准</button><button type="button" class="small-btn reject-btn" onclick="rejectLeave('${item.id}')">駁回</button>`;
      }
      if (currentUser && item.userName === currentUser.name && item.status === "待審核") {
        actionButtons += `<button type="button" class="small-btn cancel-btn" onclick="cancelLeave('${item.id}')">取消請假</button>`;
      }

      return `
        <div class="list-item">
          <h4>${item.userName} - ${item.type}</h4>
          <div class="item-meta">部門：${item.department}｜區域：${item.region}${item.reviewedBy ? `｜審核人：${item.reviewedBy}` : ""}${item.reviewedAt ? `｜審核時間：${item.reviewedAt}` : ""}</div>
          <p>日期：${item.startDate} ~ ${item.endDate}</p>
          <p>原因：${item.reason}</p>
          <p><span class="status-badge status-${item.status}">${item.status}</span></p>
          ${actionButtons ? `<div class="item-actions">${actionButtons}</div>` : ""}
       </div>`;
    }).join("");
  }

  function renderSchedules() {
    if (!selectedDateScheduleList) return;
    if (!selectedScheduleDate) {
      selectedDateScheduleList.innerHTML = `<div class="list-item"><p>請先點選日期。</p></div>`;
      return;
    }

    const selectedSchedules = schedules.filter((item) => item.date === selectedScheduleDate).sort((a, b) => a.title.localeCompare(b.title, "zh-Hant"));
    if (selectedSchedules.length === 0) {
      selectedDateScheduleList.innerHTML = `<div class="list-item"><p>這一天目前沒有排程。</p></div>`;
      return;
    }

     selectedDateScheduleList.innerHTML = selectedSchedules.map((item) => `
      <div class="list-item schedule-list-item">
        <div class="schedule-item-main">
          <h4>${item.title}</h4>
          <div class="item-meta">日期：${item.date}｜建立者：${item.author}</div>
          <p>${item.content}</p>
        </div>
        <div class="item-actions schedule-item-actions">
          <button type="button" class="small-btn edit-btn" data-action="edit-schedule" data-id="${item.id}">編輯</button>
          <button type="button" class="small-btn delete-btn" data-action="delete-schedule" data-id="${item.id}">刪除</button>
        </div>
      </div>`).join("");
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
    if (schedulePopover) schedulePopover.classList.remove("hidden");
    requestAnimationFrame(positionSchedulePopover);
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

   for (let i = 0; i < 35; i += 1) {
      const cellDate = new Date(firstCellDate);
      cellDate.setDate(firstCellDate.getDate() + i);
      const cellDateString = formatDate(cellDate);
      const daySchedules = schedules.filter((item) => item.date === cellDateString);
      const isOtherMonth = cellDate.getMonth() !== month;
      const isToday = cellDateString === todayString;
      const isSelected = cellDateString === selectedScheduleDate;

      cells.push(`
        <div class="calendar-day ${isOtherMonth ? "other-month" : ""} ${isToday ? "today" : ""} ${isSelected ? "selected" : ""}" data-date="${cellDateString}">
          <div class="calendar-day-number">${cellDate.getDate()}</div>
           <div class="calendar-events">${daySchedules.map((schedule) => `<div class="calendar-event">${schedule.title}</div>`).join("")}</div>
        </div>`);
    }

    calendarGrid.innerHTML = cells.join("");
    calendarGrid.querySelectorAll(".calendar-day").forEach(function (cell) {
      cell.addEventListener("click", function (event) {
        openSchedulePopover(cell.dataset.date);
        event.stopPropagation();
      });
    });
  }

  window.startEditAnnouncement = function (id) {
    if (!isAdmin(currentUser)) return;
    const item = announcements.find((announcement) => announcement.id === id);
    if (!item) return;
    editingAnnouncementId = id;
    if (announcementEditTitle) announcementEditTitle.value = item.title;
    if (announcementEditContent) announcementEditContent.value = item.content;
    if (announcementEditBox) announcementEditBox.classList.remove("hidden");
    if (announcementEditTitle) announcementEditTitle.focus();
  };

  window.deleteAnnouncement = async function (id) {
    if (!isAdmin(currentUser) || !db) return;
    try {
      await deleteDoc(doc(db, "announcements", id));
      if (editingAnnouncementId === id) hideAnnouncementEditor();
    } catch (error) {
      console.error("刪除公告失敗", error);
      alert("刪除公告失敗，請稍後再試。");
    }
  };

  window.approveLeave = async function (id) {
    if (!db) return;
    await updateDoc(doc(db, "leaveRequests", id), { status: "已核准", reviewedBy: currentUser.name, reviewedAt: new Date().toLocaleString() });
  };

  window.rejectLeave = async function (id) {
    if (!db) return;
    await updateDoc(doc(db, "leaveRequests", id), { status: "已駁回", reviewedBy: currentUser.name, reviewedAt: new Date().toLocaleString() });
  };

  window.cancelLeave = async function (id) {
    if (!db) return;
    await updateDoc(doc(db, "leaveRequests", id), { status: "已取消", reviewedBy: currentUser.name, reviewedAt: new Date().toLocaleString() });
  };

  window.editSchedule = function (id) {
    const item = schedules.find((schedule) => schedule.id === id);
    if (!item) return;
    editingScheduleId = id;
    selectedScheduleDate = item.date;
    if (selectedDateText) selectedDateText.textContent = item.date;
    if (scheduleDate) scheduleDate.value = item.date;
    if (scheduleTitle) scheduleTitle.value = item.title;
    if (scheduleContent) scheduleContent.value = item.content;
    if (schedulePopover) schedulePopover.classList.remove("hidden");
    showScheduleEditor("edit");
    renderSchedules();
    renderCalendar();
    requestAnimationFrame(positionSchedulePopover);
  };

  window.deleteSchedule = async function (id) {
    if (!db) return;
    try {
      await deleteDoc(doc(db, "schedules", id));
      if (editingScheduleId === id) hideScheduleEditor();
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
      if (actionButton.dataset.action === "edit-schedule") window.editSchedule(scheduleId);
      if (actionButton.dataset.action === "delete-schedule") window.deleteSchedule(scheduleId);
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
    const matchedUser = users.find((u) => u.employeeId === savedEmployeeId);
    if (!matchedUser) return;
    setLoggedInUser(matchedUser);
  }

  if (loginForm) {
    loginForm.addEventListener("submit", function (event) {
      event.preventDefault();
      const employeeId = document.getElementById("employeeId")?.value.trim() || "";
      const password = document.getElementById("password")?.value.trim() || "";
      const user = users.find((u) => u.employeeId === employeeId && u.password === password);
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
      menuButtons.forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");
      pageSections.forEach((section) => section.classList.add("hidden"));
      const targetSection = document.getElementById(`page-${targetPage}`);
      if (targetSection) targetSection.classList.remove("hidden");
      if (pageTitle) pageTitle.textContent = button.textContent;
    });
  });

  if (announcementForm) {
    announcementForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      const title = announcementTitle?.value.trim() || "";
      const content = announcementContent?.value.trim() || "";
      if (!title || !content) return alert("請填寫完整公告內容");
      if (!db) {
        alert("尚未設定 Firebase，無法將公告儲存到雲端。請先提供 Firebase 設定。\n可在 index.html 先設定 window.__FIREBASE_CONFIG__。");
        return;
      }
      try {
        await addDoc(collection(db, "announcements"), { title, content, author: currentUser ? currentUser.name : "未知使用者", createdAt: serverTimestamp(), createdAtClient: new Date() });
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
      const title = announcementEditTitle?.value.trim() || "";
      const content = announcementEditContent?.value.trim() || "";
      if (!title || !content) return alert("請填寫完整公告內容");
      try {
        await updateDoc(doc(db, "announcements", editingAnnouncementId), { title, content, updatedAt: serverTimestamp() });
        hideAnnouncementEditor();
      } catch (error) {
        console.error("更新公告失敗", error);
        alert("更新公告失敗，請稍後再試。");
      }
    });
  }

  if (announcementCancelEdit) {
    announcementCancelEdit.addEventListener("click", hideAnnouncementEditor);
  }

  if (employeeForm) {
    employeeForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      const employeeId = document.getElementById("employee-form-id")?.value.trim() || "";
      const account = document.getElementById("employee-form-account")?.value.trim() || "";
      const name = document.getElementById("employee-form-name")?.value.trim() || "";
      const password = document.getElementById("employee-form-password")?.value.trim() || "";
      const department = document.getElementById("employee-form-department")?.value || "";
      const title = document.getElementById("employee-form-title")?.value.trim() || "";
      const region = document.getElementById("employee-form-region")?.value || "";
      const category = document.getElementById("employee-form-category")?.value.trim() || "";
      const emailPrefix = document.getElementById("employee-form-email-prefix")?.value.trim() || "";
      const phone = document.getElementById("employee-form-phone")?.value.trim() || "";
      const birthday = document.getElementById("employee-form-birthday")?.value.trim() || "";
      const annualLeaveDays = Number(document.getElementById("employee-form-annual-leave-days")?.value || 0);
      const employeeData = {
        employeeId,
        account,
        name,
        password,
        department,
        title,
        region,
        category,
        emailPrefix,
        email: emailPrefix ? `${emailPrefix}@goldbricks.com.tw` : "",
        phone,
        birthday,
        annualLeaveDays,
        shifts: {
          morning: document.getElementById("shift-morning")?.checked || false,
          evening: document.getElementById("shift-evening")?.checked || false
        },
        weekendsOff: document.getElementById("weekends-off")?.checked || false,
        permissions: {
          admin: adminCheckbox?.checked || false,
          leaveApprove: leaveApproveCheckbox?.checked || false,
          announcementManage: announcementManageCheckbox?.checked || false
        },
        manageScopes: {
          regions: Array.from(document.querySelectorAll('input[name="manage-regions"]:checked')).map((el) => el.value),
          departments: Array.from(document.querySelectorAll('input[name="manage-departments"]:checked')).map((el) => el.value)
        },
        status: "active",
        isHidden: false
      };

      if (!employeeData.employeeId) return alert("請輸入員工代號");
      if (!employeeData.name) return alert("請輸入姓名");
      if (!employeeData.password) return alert("請輸入密碼");
      if (!employeeData.department) return alert("請選擇部門");
      if (!employeeData.region) return alert("請選擇地區");
      if (!employeeData.shifts.morning && !employeeData.shifts.evening && !employeeData.weekendsOff) return alert("請至少選擇一個班別或休假設定");

      if (employeeData.permissions.admin) {
        employeeData.permissions.leaveApprove = true;
        } else {
        employeeData.manageScopes = { regions: [], departments: [] };
      }

      if (!db) return alert("Firebase 未設定，無法新增員工。");

      try {
        await createEmployee(employeeData);
        employeeForm.reset();
        populateFixedOptions();
        syncAdminPermissionState();
      } catch (error) {
        console.error("新增員工失敗", error);
        alert("新增員工失敗，請稍後再試。");
      }
    });
  }

  if (adminCheckbox) {
    adminCheckbox.addEventListener("change", syncAdminPermissionState);
  }

  if (leaveForm) {
    leaveForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      const startDate = leaveStart?.value || "";
      const endDate = leaveEnd?.value || "";
      const reason = leaveReason?.value.trim() || "";
      if (!startDate || !endDate || !reason) return alert("請填寫完整請假資料");
      if (startDate > endDate) return alert("開始日期不能晚於結束日期");
      if (!db) return alert("Firebase 未設定");
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

  if (scheduleCancelBtn) scheduleCancelBtn.addEventListener("click", hideScheduleEditor);
  if (schedulePopoverClose) schedulePopoverClose.addEventListener("click", closeSchedulePopover);
  if (prevMonthBtn) prevMonthBtn.addEventListener("click", function () { calendarDate.setMonth(calendarDate.getMonth() - 1); renderCalendar(); });
  if (nextMonthBtn) nextMonthBtn.addEventListener("click", function () { calendarDate.setMonth(calendarDate.getMonth() + 1); renderCalendar(); });

  document.addEventListener("click", function (event) {
    if (!schedulePopover || schedulePopover.classList.contains("hidden")) return;
    if (schedulePopover.contains(event.target)) return;
    if (event.target.closest(".calendar-day")) return;
    closeSchedulePopover();
  });

  if (scheduleForm) {
    scheduleForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (!db) return alert("Firebase 未設定");
      const payload = {
        date: scheduleDate.value,
        title: scheduleTitle.value.trim(),
        content: scheduleContent.value.trim(),
        author: currentUser ? currentUser.name : "未知使用者",
        updatedAt: serverTimestamp(),
        createdAtClient: new Date()
      };
      if (!payload.date || !payload.title || !payload.content) return alert("請填寫完整排程資料");
      try {
        if (editingScheduleId) {
          await updateDoc(doc(db, "schedules", editingScheduleId), payload);
        } else {
          await addDoc(collection(db, "schedules"), { ...payload, createdAt: serverTimestamp() });
        }
        hideScheduleEditor();
      } catch (error) {
        console.error("儲存排程失敗", error);
        alert("儲存排程失敗");
      }
    });
  }

  populateFixedOptions();
  syncAdminPermissionState();
  startAnnouncementsListener();
  startLeaveListener();
  startScheduleListener();
  startEmployeesListener();
  restoreLogin();
  renderCalendar();
});
