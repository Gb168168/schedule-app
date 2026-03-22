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
const LOCATION_CATEGORIES = {
  office: "區域固定點",
  customer: "工作店家"
};

const DEFAULT_ATTENDANCE_LOCATIONS = [
  { region: "新竹區", category: "office", name: "新竹辦公點", lat: 24.8039, lng: 120.9647, radiusMeters: 500, isActive: true, isHidden: false },
  { region: "台中區", category: "office", name: "台中辦公點", lat: 24.17779, lng: 120.713161, radiusMeters: 500, isActive: true, isHidden: false },
  { region: "嘉義區", category: "office", name: "嘉義辦公點", lat: 23.4801, lng: 120.4491, radiusMeters: 500, isActive: true, isHidden: false }
];

const firebaseConfig = window.__FIREBASE_CONFIG__;
const firebaseApp = firebaseConfig ? initializeApp(firebaseConfig) : null;
const db = firebaseApp ? getFirestore(firebaseApp) : null;

const users = [
  {
    employeeId: "GoldBricks",
    account: "GoldBricks",
    password: "GoldBricks",
    name: "GoldBricks",
    role: "管理員",
    title: "管理員",
    region: "台中區",
    department: "最高權限",
    category: "系統管理員",
    annualLeaveDays: 0,
    shifts: { morning: true, evening: true },
    weekendsOff: false,
    permissions: {
     announcementManage: true,
      leaveApprove: true,
      admin: true,
      coordinateAdmin: true
    },
    manageScopes: {
      regions: [...REGIONS],
      departments: [...DEPARTMENTS]
    }
  },
  {
    employeeId: "GB080202",
    account: "GB080202",
    password: "GB080202",
    name: "邱淑芬",
    role: "財務副理",
    title: "財務副理",
    region: "台中區",
    department: "管理部",
    category: "正式員工",
    annualLeaveDays: 0,
    shifts: { morning: true, evening: false },
    weekendsOff: true,
    permissions: {
      announcementManage: false,
      leaveApprove: false,
      admin: false,
      coordinateAdmin: false
    },
    manageScopes: {
      regions: [],
      departments: []
    }
  }
];

const DEFAULT_SHIFT_SETTINGS = [
  { code: "morning", name: "早班", startTime: "08:00", endTime: "17:00", reminderTime: "07:50", graceMinutes: 15, isActive: true },
  { code: "evening", name: "晚班", startTime: "20:00", endTime: "08:00", reminderTime: "19:50", graceMinutes: 15, isActive: true }
];

const STORAGE_KEYS = { currentUser: "shift_current_user" };

let currentUser = null;
let editingAnnouncementId = null;
let calendarDate = new Date();
let selectedScheduleDate = "";
let editingScheduleId = null;
let editingEmployeeId = null;
let announcements = [];
let leaveRequests = [];
let schedules = [];
let employees = users.map((user, index) => ({ id: `builtin-${index}`, status: "active", isHidden: false, ...user }));
let isBootstrappingEmployees = false;
let attendanceLocations = DEFAULT_ATTENDANCE_LOCATIONS.map((item, index) => ({ id: `default-${index}`, ...item }));
let attendanceRecords = [];
let shiftSettings = DEFAULT_SHIFT_SETTINGS.map((item) => ({ ...item }));
let editingCoordinateId = null;
let lastAttendanceAttempt = null;
let attendanceMap = null;
let attendanceMapMarkers = [];

function isAdmin(user) {
 return Boolean(user?.permissions?.admin || user?.role === "管理員");
}

function canManageAnnouncements(user) {
  return Boolean(user?.permissions?.admin || user?.permissions?.announcementManage);
}

function canManageCoordinates(user) {
  return Boolean(user?.permissions?.admin || user?.permissions?.coordinateAdmin);
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
  if (employee.permissions?.coordinateAdmin) tags.push("座標管理");
  return tags.length > 0 ? tags.join("、") : "一般員工";
}

function createEmployee(employeeData) {
  return addDoc(collection(db, "employees"), {
    ...employeeData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

function getBuiltinEmployees() {
  return users.map(function (user, index) {
    return {
      id: `builtin-${index}`,
      status: "active",
      isHidden: false,
      ...user
    };
  });
}

async function seedDefaultEmployees() {
  if (!db || isBootstrappingEmployees) return;

  isBootstrappingEmployees = true;

  try {
    await Promise.all(
      users.map(function (user) {
        return createEmployee({
          ...user,
          status: "active",
          isHidden: false
        });
      })
    );
  } catch (error) {
    console.error("初始化預設員工失敗", error);
  } finally {
    isBootstrappingEmployees = false;
  }
}

function getDistanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function findMatchedOffice(userLat, userLng, locations = attendanceLocations, userRegion = "") {
  const activeLocations = locations.filter((location) => location.isActive && !location.isHidden);
  const scopedLocations = activeLocations.filter((location) => !userRegion || location.region === userRegion);
  const candidates = scopedLocations.length > 0 ? scopedLocations : activeLocations;
  return candidates.find((location) => {
    const distance = getDistanceMeters(userLat, userLng, location.lat, location.lng);
    return distance <= location.radiusMeters;
  })
    ? (() => {
        const matched = candidates.find((location) => {
          const distance = getDistanceMeters(userLat, userLng, location.lat, location.lng);
          return distance <= location.radiusMeters;
        });
        const distance = getDistanceMeters(userLat, userLng, matched.lat, matched.lng);
        return { ...matched, distanceMeters: Math.round(distance) };
      })()
    : null;
}

function getNetworkType() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  return connection?.type || connection?.effectiveType || "unknown";
}

function getCurrentPositionAsync() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("此裝置不支援定位功能"));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    });
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

  const attendanceStatusBadge = document.getElementById("attendance-status-badge");
  const attendanceSettingsSummary = document.getElementById("attendance-settings-summary");
  const attendanceResult = document.getElementById("attendance-result");
  const attendanceReminderPanel = document.getElementById("attendance-reminder-panel");
  const attendanceLocation = document.getElementById("attendance-location");
  const attendanceOffice = document.getElementById("attendance-office");
  const attendanceNetworkType = document.getElementById("attendance-network-type");
  const attendanceShiftSelect = document.getElementById("attendance-shift-select");
  const clockInBtn = document.getElementById("clock-in-btn");
  const clockOutBtn = document.getElementById("clock-out-btn");
  const attendanceFilterName = document.getElementById("attendance-filter-name");
  const attendanceFilterDate = document.getElementById("attendance-filter-date");
  const attendanceFilterBtn = document.getElementById("attendance-filter-btn");
  const attendanceFilterResetBtn = document.getElementById("attendance-filter-reset-btn");
  const attendanceSummaryList = document.getElementById("attendance-summary-list");
   const attendanceMapElement = document.getElementById("attendance-map");
  
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
  const employeeSubmitBtn = document.getElementById("employee-submit-btn");
  const employeeShiftSection = document.getElementById("employee-shift-section");
  const employeeIdField = document.getElementById("employee-form-id");
  
  const coordinateMenuBtn = document.getElementById("menu-coordinate-btn");
  const coordinateAdminDisabled = document.getElementById("coordinate-admin-disabled");
  const coordinateEditorCard = document.getElementById("coordinate-editor-card");
  const coordinateEditorTitle = document.getElementById("coordinate-editor-title");
  const coordinateForm = document.getElementById("coordinate-form");
  const coordinateRegionSelect = document.getElementById("coordinate-region");
  const coordinateCategorySelect = document.getElementById("coordinate-category");
  const coordinateNameInput = document.getElementById("coordinate-name");
  const coordinateRadiusInput = document.getElementById("coordinate-radius");
  const coordinateLatInput = document.getElementById("coordinate-lat");
  const coordinateLngInput = document.getElementById("coordinate-lng");
  const coordinateIsActiveInput = document.getElementById("coordinate-is-active");
  const coordinateCancelBtn = document.getElementById("coordinate-cancel-btn");
  const coordinateRegionList = document.getElementById("coordinate-region-list");
  
  const shiftSettingsForm = document.getElementById("shift-settings-form");
  const shiftCodeSelect = document.getElementById("shift-code");
  const shiftNameInput = document.getElementById("shift-name");
  const shiftStartTimeInput = document.getElementById("shift-start-time");
  const shiftEndTimeInput = document.getElementById("shift-end-time");
  const shiftReminderTimeInput = document.getElementById("shift-reminder-time");
  const shiftGraceMinutesInput = document.getElementById("shift-grace-minutes");
  const shiftIsActiveInput = document.getElementById("shift-is-active");
  const shiftSettingsList = document.getElementById("shift-settings-list");
  
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

  function setAttendanceBadge(kind, text) {
    if (!attendanceStatusBadge) return;
    attendanceStatusBadge.className = `status-badge status-${kind}`;
    attendanceStatusBadge.textContent = text;
  }

  function updateMenuPermissions(user) {
    if (!coordinateMenuBtn) return;
    coordinateMenuBtn.classList.toggle("hidden", !canManageCoordinates(user));
  }

  function populateCoordinateRegionOptions() {
    if (!coordinateRegionSelect) return;
    coordinateRegionSelect.innerHTML = REGIONS.map((region) => `<option value="${region}">${region}</option>`).join("");
  }

  function getVisibleAttendanceLocations() {
    return attendanceLocations.filter((location) => !location.isHidden);
  }

    function getActiveShiftSettings() {
    return shiftSettings.filter((item) => item.isActive !== false);
  }

  function getSelectedShiftCode() {
    return attendanceShiftSelect?.value || getActiveShiftSettings()[0]?.code || shiftSettings[0]?.code || "";
  }

  function findShiftSetting(code) {
    return shiftSettings.find((item) => item.code === code) || null;
  }

  function toMinutes(timeString) {
    const [hours, minutes] = String(timeString || "").split(":").map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return hours * 60 + minutes;
  }

  function formatTimeText(timeString) {
    if (!timeString) return "-";
    const [hours, minutes] = String(timeString).split(":");
    if (hours === undefined || minutes === undefined) return timeString;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  function getShiftDateTime(baseDate, timeString) {
    const totalMinutes = toMinutes(timeString);
    if (totalMinutes === null) return null;
    const result = new Date(baseDate);
    result.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0);
    return result;
  }

  function getLateStatus(currentDate, shiftStartTime, graceMinutes) {
    const shiftStart = getShiftDateTime(currentDate, shiftStartTime);
    if (!shiftStart) {
      return { isLate: false, lateMinutes: 0, status: "success", deadline: null };
    }

    const deadline = new Date(shiftStart.getTime() + Number(graceMinutes || 0) * 60000);
    if (currentDate <= deadline) {
      return { isLate: false, lateMinutes: 0, status: "success", deadline };
    }

    return {
      isLate: true,
      lateMinutes: Math.floor((currentDate - deadline) / 60000),
      status: "late",
      deadline
    };
  }

  function buildReminderMessages(shift, now = new Date()) {
    if (!shift) return [];
    const shiftStart = getShiftDateTime(now, shift.startTime);
    const reminder = getShiftDateTime(now, shift.reminderTime);
    if (!shiftStart || !reminder) return [];
    const deadline = new Date(shiftStart.getTime() + Number(shift.graceMinutes || 0) * 60000);
    const tenMinuteReminder = new Date(shiftStart.getTime() - 10 * 60000);
    const fiveMinuteReminder = new Date(shiftStart.getTime() - 5 * 60000);
    const lastFiveMinuteReminder = new Date(deadline.getTime() - 5 * 60000);
    return [
      { label: "上班前提醒", time: formatAttendanceDateTime(reminder), message: `距離上班剩 ${Math.max(Math.round((shiftStart - reminder) / 60000), 0)} 分鐘` },
      { label: "上班前 5 分鐘", time: formatAttendanceDateTime(fiveMinuteReminder), message: "距離上班剩 5 分鐘" },
      { label: "到班提醒", time: formatAttendanceDateTime(shiftStart), message: "已到上班時間" },
      { label: "最後打卡提醒", time: formatAttendanceDateTime(lastFiveMinuteReminder), message: "距離最後正常打卡剩 5 分鐘" },
      { label: "逾時提醒", time: formatAttendanceDateTime(deadline), message: "已超過最後正常打卡時間" }
    ].filter((item, index) => index !== 0 || tenMinuteReminder <= shiftStart);
  }

  function populateShiftSelectOptions() {
    const activeShifts = getActiveShiftSettings();
    if (attendanceShiftSelect) {
      attendanceShiftSelect.innerHTML = activeShifts.map((shift) => `<option value="${shift.code}">${shift.name}</option>`).join("") || '<option value="">無可用班別</option>';
    }
    if (shiftCodeSelect) {
      shiftCodeSelect.innerHTML = shiftSettings.map((shift) => `<option value="${shift.code}">${shift.name}（${shift.code}）</option>`).join("");
    }
  }

  function syncShiftForm() {
    const shift = findShiftSetting(shiftCodeSelect?.value || shiftSettings[0]?.code);
    if (!shift) return;
    if (shiftNameInput) shiftNameInput.value = shift.name || "";
    if (shiftStartTimeInput) shiftStartTimeInput.value = formatTimeText(shift.startTime);
    if (shiftEndTimeInput) shiftEndTimeInput.value = formatTimeText(shift.endTime);
    if (shiftReminderTimeInput) shiftReminderTimeInput.value = formatTimeText(shift.reminderTime);
    if (shiftGraceMinutesInput) shiftGraceMinutesInput.value = Number(shift.graceMinutes || 0);
    if (shiftIsActiveInput) shiftIsActiveInput.checked = shift.isActive !== false;
  }

  function renderShiftSettingsList() {
    if (!shiftSettingsList) return;
    shiftSettingsList.innerHTML = shiftSettings.map((shift) => `
      <div class="list-item">
        <div class="employee-card-header">
          <div>
            <h4>${shift.name}</h4>
            <div class="item-meta">代碼：${shift.code}</div>
          </div>
          <span class="status-badge ${shift.isActive !== false ? "status-success" : "status-fail"}">${shift.isActive !== false ? "啟用中" : "已停用"}</span>
        </div>
        <p>上班：${formatTimeText(shift.startTime)}｜下班：${formatTimeText(shift.endTime)}</p>
        <p>提醒：${formatTimeText(shift.reminderTime)}｜寬限：${shift.graceMinutes} 分鐘</p>
      </div>
    `).join("");
  }

  function renderAttendanceReminderPanel() {
    if (!attendanceReminderPanel) return;
    const shift = findShiftSetting(getSelectedShiftCode()) || getActiveShiftSettings()[0];
    if (!shift) {
      attendanceReminderPanel.innerHTML = '<p>尚未設定班別提醒。</p>';
      return;
    }
    const items = buildReminderMessages(shift);
    attendanceReminderPanel.innerHTML = `
      <h4>${shift.name} 站內提醒</h4>
      <div class="reminder-list">
        ${items.map((item) => `<div class="reminder-item"><strong>${item.label}</strong><p>${item.message}</p><div class="item-meta">預計時間：${item.time}</div></div>`).join("")}
      </div>
    `;
  }

  function refreshShiftSettingViews() {
    populateShiftSelectOptions();
    syncShiftForm();
    renderShiftSettingsList();
    renderAttendanceReminderPanel();
  }
  
  function renderAttendanceSettingsSummary() {
    if (!attendanceSettingsSummary) return;
    const activeLocations = getVisibleAttendanceLocations().filter((location) => location.isActive);
    const shift = findShiftSetting(getSelectedShiftCode()) || getActiveShiftSettings()[0];
    attendanceSettingsSummary.innerHTML = `
      <p><strong>啟用座標：</strong>${activeLocations.length} 筆</p>
      <p><strong>目前班別：</strong>${shift ? `${shift.name}（${formatTimeText(shift.startTime)} - ${formatTimeText(shift.endTime)}）` : "尚未設定"}</p>
      <p><strong>提醒時間：</strong>${shift ? formatTimeText(shift.reminderTime) : "-"}</p>
      <p><strong>最後正常打卡：</strong>${shift ? `${formatTimeText(shift.startTime)} + ${shift.graceMinutes} 分鐘` : "-"}</p>
      <p><strong>定位打卡：</strong>先比對登入者地區，若該地區沒有符合點位，再回退為所有啟用點位。</p>
    `;
  }

  function hideCoordinateEditor() {
    editingCoordinateId = null;
    if (coordinateEditorCard) coordinateEditorCard.classList.add("hidden");
    if (coordinateForm) coordinateForm.reset();
    if (coordinateIsActiveInput) coordinateIsActiveInput.checked = true;
    populateCoordinateRegionOptions();
    if (coordinateCategorySelect) coordinateCategorySelect.value = "office";
  }

  function showCoordinateEditor(mode, location = null, preset = {}) {
    if (!coordinateEditorCard) return;
    coordinateEditorCard.classList.remove("hidden");
    if (coordinateEditorTitle) coordinateEditorTitle.textContent = mode === "edit" ? "編輯打卡座標" : "新增打卡座標";
    if (coordinateRegionSelect) coordinateRegionSelect.value = location?.region || preset.region || REGIONS[0];
    if (coordinateCategorySelect) coordinateCategorySelect.value = location?.category || preset.category || "office";
    if (coordinateNameInput) coordinateNameInput.value = location?.name || "";
    if (coordinateRadiusInput) coordinateRadiusInput.value = location?.radiusMeters ?? 500;
    if (coordinateLatInput) coordinateLatInput.value = location?.lat ?? "";
    if (coordinateLngInput) coordinateLngInput.value = location?.lng ?? "";
    if (coordinateIsActiveInput) coordinateIsActiveInput.checked = location?.isActive ?? true;
    if (coordinateNameInput) coordinateNameInput.focus();
  }

  function renderCoordinates() {
    if (!coordinateRegionList) return;
    const canManage = canManageCoordinates(currentUser);
    if (coordinateAdminDisabled) coordinateAdminDisabled.classList.toggle("hidden", canManage);
    if (coordinateEditorCard && !canManage) coordinateEditorCard.classList.add("hidden");

    const visibleLocations = getVisibleAttendanceLocations();
    coordinateRegionList.innerHTML = REGIONS.map((region) => {
      const regionLocations = visibleLocations.filter((location) => location.region === region);
      return ["office", "customer"].map((category, index) => {
        const items = regionLocations.filter((location) => location.category === category);
        const table = items.length > 0
          ? `<table class="coordinate-table"><thead><tr><th>名稱</th><th>緯度</th><th>經度</th><th>半徑</th><th>狀態</th><th>操作</th></tr></thead><tbody>${items.map((item) => `<tr><td>${item.name}</td><td>${Number(item.lat).toFixed(6)}</td><td>${Number(item.lng).toFixed(6)}</td><td>${item.radiusMeters}m</td><td><span class="status-badge ${item.isActive ? "status-success" : "status-fail"}">${item.isActive ? "啟用" : "停用"}</span></td><td>${canManage ? `<div class="item-actions"><button type="button" class="small-btn edit-btn" onclick="editCoordinate('${item.id}')">編輯</button><button type="button" class="small-btn" onclick="toggleCoordinateVisibility('${item.id}', false)">隱藏</button><button type="button" class="small-btn delete-btn" onclick="deleteCoordinate('${item.id}')">刪除</button></div>` : "-"}</td></tr>`).join("")}</tbody></table>`
          : `<div class="list-item"><p>目前沒有${LOCATION_CATEGORIES[category]}。</p></div>`;
        const addBtn = canManage ? `<button type="button" class="primary-btn coordinate-add-btn" data-region="${region}" data-category="${category}">+ 新增${LOCATION_CATEGORIES[category]}</button>` : "";
        return `${index === 0 ? `<section class="coordinate-region-card"><div class="section-header-row"><div><h3>${region}</h3><p class="helper-text">分區顯示內部座標與工作店家座標。</p></div></div>` : ""}<div class="coordinate-category-block"><h4>${LOCATION_CATEGORIES[category]}</h4>${table}${addBtn}</div>${index === 1 ? `</section>` : ""}`;
      }).join("");
    }).join("");

    coordinateRegionList.querySelectorAll(".coordinate-add-btn").forEach((button) => {
      button.addEventListener("click", function () {
        editingCoordinateId = null;
        showCoordinateEditor("add", null, { region: button.dataset.region, category: button.dataset.category });
      });
    });
  }

  function refreshAttendanceSettings() {
    renderAttendanceSettingsSummary();
    renderAttendanceReminderPanel();
    renderAttendanceAttempt();
  }

  function startAttendanceLocationsListener() {
    if (!db) {
      attendanceLocations = DEFAULT_ATTENDANCE_LOCATIONS.map((item, index) => ({ id: `default-${index}`, ...item }));
      renderCoordinates();
      renderAttendanceSettingsSummary();
      return;
    }
    const q = query(collection(db, "attendanceLocations"), orderBy("region", "asc"));
    onSnapshot(q, async function (snapshot) {
      if (snapshot.empty) {
        await Promise.all(DEFAULT_ATTENDANCE_LOCATIONS.map((item) => addDoc(collection(db, "attendanceLocations"), { ...item, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })));
        return;
      }
      attendanceLocations = snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }));
      renderCoordinates();
      renderAttendanceSettingsSummary();
    });
  }

  function renderAttendanceAttempt() {
    if (!lastAttendanceAttempt) return;
    if (attendanceLocation) {
      attendanceLocation.textContent = lastAttendanceAttempt.lat && lastAttendanceAttempt.lng
        ? `${lastAttendanceAttempt.lat.toFixed(6)}, ${lastAttendanceAttempt.lng.toFixed(6)}`
        : "-";
    }
    if (attendanceOffice) {
      attendanceOffice.textContent = lastAttendanceAttempt.officeName
        ? `${lastAttendanceAttempt.officeName}${lastAttendanceAttempt.distanceMeters !== undefined ? `（距離 ${lastAttendanceAttempt.distanceMeters}m）` : ""}`
        : "未匹配";
    }
    if (attendanceNetworkType) attendanceNetworkType.textContent = lastAttendanceAttempt.networkType || "unknown";
    if (attendanceResult) attendanceResult.innerHTML = `<p>${lastAttendanceAttempt.message}</p>`;
    setAttendanceBadge(lastAttendanceAttempt.badgeKind, lastAttendanceAttempt.badgeText);
  }

  async function submitAttendanceToBackend(payload) {
    const apiUrl = window.__ATTENDANCE_API_URL__;
    if (!apiUrl) {
      throw new Error("尚未設定 window.__ATTENDANCE_API_URL__，請將 Cloud Function / API URL 寫入 index.html。");
    }

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    let data = null;
    try {
      data = await response.json();
    } catch (error) {
      throw new Error("後端回傳格式錯誤，無法解析 JSON。");
    }

    if (!response.ok || !data?.ok) {
      throw new Error(data?.message || "打卡失敗");
    }

    return data;
  }

  async function handleClock(type) {
    if (!currentUser) {
      alert("請先登入");
      return;
    }

    const selectedShift = findShiftSetting(getSelectedShiftCode());
    if (!selectedShift) {
      alert("請先設定並選擇班別");
      return;
    }

    try {
      const position = await getCurrentPositionAsync();
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const match = findMatchedOffice(lat, lng, attendanceLocations, currentUser.region);
      const networkType = getNetworkType();
      const createdAtClient = new Date();
      const lateStatus = type === "clockIn"
        ? getLateStatus(createdAtClient, selectedShift.startTime, selectedShift.graceMinutes)
        : { isLate: false, lateMinutes: 0, status: "success", deadline: null };

      let outsideReason = "";
      let status = lateStatus.status;
      if (!match) {
       outsideReason = window.prompt("目前不在打卡範圍內，請輸入原因：", "")?.trim() || "";
        if (!outsideReason) {
          alert("超出範圍打卡必須填寫原因");
          return;
        }
        status = lateStatus.isLate ? "late_outside" : "outside";
      }

      if (!db) {
        throw new Error("Firebase 未設定");
      }

      const attendancePayload = {
        employeeId: currentUser.employeeId,
        employeeName: currentUser.name,
        type,
        shiftCode: selectedShift.code,
        shiftName: selectedShift.name,
        scheduledStartTime: selectedShift.startTime,
        scheduledEndTime: selectedShift.endTime,
        reminderTime: selectedShift.reminderTime,
        graceMinutes: Number(selectedShift.graceMinutes || 0),
        lat,
        lng,
        officeName: match?.name || "",
        distanceMeters: match?.distanceMeters ?? null,
        locationMatched: Boolean(match),
        outsideReason,
        isLate: Boolean(lateStatus.isLate),
        lateMinutes: lateStatus.lateMinutes || 0,
        status,
        networkType,
        createdAt: serverTimestamp(),
        createdAtClient
      };

      await addDoc(collection(db, "attendanceRecords"), attendancePayload);
      await addDoc(collection(db, "notifications"), {
        message: `${currentUser.name}${type === "clockIn" ? "上班" : "下班"}打卡${status === "success" ? "成功" : "完成"}`,
        employeeId: currentUser.employeeId,
        employeeName: currentUser.name,
        type,
        shiftCode: selectedShift.code,
        status,
        createdAt: serverTimestamp(),
        createdAtClient
      });

      const statusMessages = {
        success: "正常打卡",
        late: `遲到 ${lateStatus.lateMinutes} 分鐘`,
        outside: `範圍外打卡：${outsideReason}`,
        late_outside: `遲到 ${lateStatus.lateMinutes} 分鐘，且為範圍外打卡：${outsideReason}`
      };

      lastAttendanceAttempt = {
        lat,
        lng,
        officeName: match?.name || "",
        distanceMeters: match?.distanceMeters,
        networkType,
        badgeKind: status === "success" ? "success" : status,
        badgeText: statusMessages[status],
        message: `${selectedShift.name} ${type === "clockIn" ? "上班" : "下班"}打卡完成。${statusMessages[status]}`
      };
      renderAttendanceAttempt();
    } catch (error) {
      console.error("打卡失敗", error);
      lastAttendanceAttempt = {
        lat: null,
        lng: null,
        badgeKind: "fail",
        badgeText: "打卡失敗",
        message: error?.message || "打卡失敗"
      };
      renderAttendanceAttempt();
      alert(error?.message || "打卡失敗");
    }
  }

  function formatAttendanceDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("zh-TW", {
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function formatDateKey(dateValue) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return "";
    
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function formatTimeOnly(dateValue) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleTimeString("zh-TW", {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function calculateHours(startValue, endValue) {
    const start = new Date(startValue);
    const end = new Date(endValue);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "-";
    if (end < start) return "-";

    const diffHours = (end - start) / 1000 / 60 / 60;
    return diffHours.toFixed(2);
  }

  function getFilteredAttendanceRecords() {
    const nameKeyword = attendanceFilterName ? attendanceFilterName.value.trim() : "";
    const selectedDate = attendanceFilterDate ? attendanceFilterDate.value : "";

    let visibleRecords = isAdmin(currentUser)
      ? attendanceRecords.slice()
      : attendanceRecords.filter(function (item) {
          return currentUser && item.employeeId === currentUser.employeeId;
        });

    if (nameKeyword) {
      visibleRecords = visibleRecords.filter(function (item) {
        return (item.employeeName || "").includes(nameKeyword);
      });
    }

    if (selectedDate) {
      visibleRecords = visibleRecords.filter(function (item) {
        return formatDateKey(item.createdAtClient) === selectedDate;
      });
    }

    return visibleRecords;
  }

  function initAttendanceMap() {
    if (!attendanceMapElement || typeof L === "undefined") return;
    if (attendanceMap) return;

    attendanceMap = L.map(attendanceMapElement).setView([23.7, 121], 7);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap"
    }).addTo(attendanceMap);
  }

  function clearAttendanceMapMarkers() {
    if (!attendanceMap) return;

    attendanceMapMarkers.forEach(function (marker) {
      attendanceMap.removeLayer(marker);
    });
    attendanceMapMarkers = [];
  }

  function renderAttendanceMap(records) {
    if (!attendanceMapElement || typeof L === "undefined") return;

    initAttendanceMap();
    if (!attendanceMap) return;

    clearAttendanceMapMarkers();

    const validRecords = records.filter(function (item) {
      return Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lng));
    });

    if (validRecords.length === 0) {
      attendanceMap.setView([23.7, 121], 7);
      return;
    }

    const bounds = [];

    validRecords.forEach(function (item) {
      const lat = Number(item.lat);
      const lng = Number(item.lng);

      const marker = L.marker([lat, lng]).addTo(attendanceMap);

      marker.bindPopup(`
        <div style="min-width: 220px;">
          <strong>${item.employeeName || "未知員工"}</strong><br />
          類型：${item.type === "clockIn" ? "上班打卡" : "下班打卡"}<br />
          時間：${item.createdAtClient ? new Date(item.createdAtClient).toLocaleString("zh-TW") : "-"}<br />
          地點：${item.officeName || "範圍外"}<br />
          班別：${item.shiftName || "-"}<br />
          狀態：${item.status || "-"}<br />
          距離：${item.distanceMeters !== undefined && item.distanceMeters !== null ? `${item.distanceMeters}m` : "-"}
        </div>
      `);

      attendanceMapMarkers.push(marker);
      bounds.push([lat, lng]);
    });

    if (bounds.length === 1) {
      attendanceMap.setView(bounds[0], 16);
    } else {
      attendanceMap.fitBounds(bounds, { padding: [30, 30] });
    }

    setTimeout(function () {
      attendanceMap.invalidateSize();
    }, 100);
  }

  function buildAttendanceSummary(records) {
    const grouped = {};

    records.forEach(function (item) {
      const dateKey = formatDateKey(item.createdAtClient);
      const employeeKey = item.employeeId || "unknown";
      const groupKey = `${employeeKey}__${dateKey}`;

      if (!grouped[groupKey]) {
        grouped[groupKey] = {
          employeeId: item.employeeId || "",
          employeeName: item.employeeName || "未知員工",
          date: dateKey,
          officeName: item.officeName || "",
          records: []
        };
      }

      grouped[groupKey].records.push(item);
    });

   return Object.values(grouped)
      .map(function (group) {
        const sortedRecords = group.records.slice().sort(function (a, b) {
          return new Date(a.createdAtClient) - new Date(b.createdAtClient);
        });

        const clockInRecord =
          sortedRecords.find(function (item) {
            return item.type === "clockIn";
          }) || sortedRecords[0];

        const reverseRecords = sortedRecords.slice().reverse();
        const clockOutRecord =
          reverseRecords.find(function (item) {
            return item.type === "clockOut";
          }) || (sortedRecords.length > 1 ? sortedRecords[sortedRecords.length - 1] : null);

        const startTime = clockInRecord ? clockInRecord.createdAtClient : "";
        const endTime = clockOutRecord ? clockOutRecord.createdAtClient : "";
        const workHours =
          startTime && endTime && clockOutRecord && clockOutRecord !== clockInRecord
             ? calculateHours(startTime, endTime)
            : "-";
    
        return {
          employeeId: group.employeeId,
          employeeName: group.employeeName,
          date: group.date,
          officeName: group.officeName,
          startTime,
          endTime,
          workHours,
          recordCount: sortedRecords.length,
          records: sortedRecords
        };
        })
      .sort(function (a, b) {
        const dateCompare = new Date(b.date) - new Date(a.date);
        if (dateCompare !== 0) return dateCompare;
        return a.employeeName.localeCompare(b.employeeName, "zh-Hant");
      });
  }

  function renderAttendanceRecords() {
    if (!attendanceSummaryList) return;

    const filteredRecords = getFilteredAttendanceRecords();
    const summaryList = buildAttendanceSummary(filteredRecords);

    renderAttendanceMap(filteredRecords);

    if (summaryList.length === 0) {
      attendanceSummaryList.innerHTML = `<div class="list-item"><p>目前沒有符合條件的打卡紀錄。</p></div>`;
      return;
    }

    attendanceSummaryList.innerHTML = summaryList
      .map(function (item) {
        const detailHtml = item.records
          .map(function (record) {
            return `
              <div class="item-meta">
                ${record.type === "clockIn" ? "上班打卡" : "下班打卡"}｜
                ${record.shiftName || "未指定班別"}｜
                ${formatTimeOnly(record.createdAtClient)}｜
                ${record.officeName || "範圍外打卡"}｜
                <span class="record-status-text">${record.status || "success"}</span>｜
                ${record.distanceMeters !== undefined && record.distanceMeters !== null ? `距離 ${record.distanceMeters}m` : "未記錄距離"}
                ${record.outsideReason ? `｜原因：${record.outsideReason}` : ""}
              </div>
            `;
          })
          .join("");

        return `
          <div class="list-item">
            <div class="employee-card-header">
              <div>
                <h4>${item.employeeName}</h4>
                <div class="item-meta">日期：${item.date}｜員工編號：${item.employeeId}</div>
              </div>
              <span class="status-badge status-active">工時 ${item.workHours} 小時</span>
            </div>

            <p>上班時間：${item.startTime ? formatTimeOnly(item.startTime) : "-"}</p>
            <p>下班時間：${item.endTime ? formatTimeOnly(item.endTime) : "-"}</p>
            <p>打卡地點：${item.officeName || "-"}</p>
            <p>當日打卡筆數：${item.recordCount}</p>
            <p>班別：${item.records[0]?.shiftName || "-"}｜最終狀態：<span class="status-badge status-${item.records[item.records.length - 1]?.status || "success"}">${item.records[item.records.length - 1]?.status || "success"}</span></p>

            <div style="margin-top: 10px;">
              ${detailHtml}
            </div>
          </div>
        `;
      })
      .join("");
  }

    function startShiftSettingsListener() {
    if (!db) {
      refreshShiftSettingViews();
      refreshAttendanceSettings();
      return;
    }
    const q = query(collection(db, "shiftSettings"), orderBy("code", "asc"));
    onSnapshot(q, async function (snapshot) {
      if (snapshot.empty) {
        await Promise.all(DEFAULT_SHIFT_SETTINGS.map((item) => addDoc(collection(db, "shiftSettings"), { ...item, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })));
        return;
      }
      shiftSettings = snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }));
      refreshShiftSettingViews();
      refreshAttendanceSettings();
    });
  }

  function startAttendanceRecordsListener() {
    if (!db) return;

    const q = query(collection(db, "attendanceRecords"), orderBy("createdAtClient", "desc"));
    
    onSnapshot(q, function (snapshot) {
     attendanceRecords = snapshot.docs.map(function (docItem) {
        return {
          id: docItem.id,
          ...docItem.data()
        };
      });

      renderAttendanceRecords();
    });
  }

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
    
    populateCoordinateRegionOptions();
    refreshShiftSettingViews();
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

    function isSuperAdminEmployee(employeeId) {
    return employeeId === "GoldBricks";
  }

  function updateSuperAdminFormState() {
    const employeeId = employeeIdField ? employeeIdField.value.trim() : "";
    const isSuperAdmin = isSuperAdminEmployee(employeeId);

    if (employeeShiftSection) {
      employeeShiftSection.classList.toggle("hidden", isSuperAdmin);
    }
  }

  function renderEmployees() {
    if (!employeeList) return;

    if (employees.length === 0) {
      employeeList.innerHTML = `<div class="list-item"><p>目前沒有員工資料。</p></div>`;
      return;
    }

      const grouped = {}

      employees.forEach(function (employee) {
      const region = employee.region || "未分類地區";
      const department = employee.department || "未分類部門";

             if (!grouped[region]) grouped[region] = {};
      if (!grouped[region][department]) grouped[region][department] = [];

      grouped[region][department].push(employee);
    });

    employeeList.innerHTML = Object.keys(grouped)
      .map(function (region) {
        const departments = grouped[region];

        return `
          <details class="scope-collapse">
            <summary>${region}</summary>
            ${Object.keys(departments)
              .map(function (department) {
                return `
                  <details class="scope-collapse">
                    <summary>${department}（${departments[department].length} 人）</summary>
                    <div class="list-wrap">
                      ${departments[department]
                        .map(function (employee) {
                          const shifts = [];
                          if (employee.shifts?.morning) shifts.push("早班");
                          if (employee.shifts?.evening) shifts.push("晚班");
                          if (employee.weekendsOff) shifts.push("週休二日 & 國定假日");

                          const scopeRegions = employee.manageScopes?.regions?.length
                            ? employee.manageScopes.regions.join("、")
                            : "未設定";
                          const scopeDepartments = employee.manageScopes?.departments?.length
                            ? employee.manageScopes.departments.join("、")
                            : "未設定";

                          return `
                            <div class="list-item">
                              <div class="employee-card-header">
                                <div>
                                  <h4>${employee.name || "未命名員工"}</h4>
                                  <div class="item-meta">
                                    員工代號：${employee.employeeId || "-"}｜
                                    帳號：${employee.account || "-"}｜
                                    Email：${employee.email || "-"}
                                  </div>
                                </div>
                                <span class="status-badge status-${employee.status || "active"}">
                                  ${employee.status || "active"}
                                </span>
                              </div>

                              <p>部門：${employee.department || "-"}｜職稱：${employee.title || "-"}｜地區：${employee.region || "-"}</p>
                              <p>類別：${employee.category || "-"}｜電話：${employee.phone || "-"}｜生日：${employee.birthday || "-"}</p>
                              <p>年度特休：${employee.annualLeaveDays || 0} 天｜班別與休假：${shifts.join("、") || "未設定"}</p>
                              <p>權限：${formatEmployeePermissions(employee)}</p>
                              ${employee.permissions?.admin ? `<p>管理地區：${scopeRegions}</p><p>管理部門：${scopeDepartments}</p>` : ""}

                              <div class="item-actions">
                                <button type="button" class="small-btn edit-btn" onclick="editEmployee('${employee.id}')">編輯</button>
                                <button type="button" class="small-btn delete-btn" onclick="deleteEmployee('${employee.id}')">刪除</button>
                              </div>
                            </div>
                          `;
                        })
                        .join("")}
                    </div>
                  </details>
                `;
              })
              .join("")}
          </details>
        `;
      })
      .join("");
  }

  function startEmployeesListener() {
     if (!db) {
      employees = getBuiltinEmployees();
      renderEmployees();
      restoreLogin();
      return;
    }

    const q = query(collection(db, "employees"), orderBy("createdAt", "desc"));
    
    onSnapshot(q, function (snapshot) {
      const visibleEmployees = snapshot.docs
        .map(function (docItem) {
          return {
            id: docItem.id,
            ...docItem.data()
          };
        })
        .filter(function (employee) {
          return !employee.isHidden;
        });

         if (visibleEmployees.length === 0) {
        employees = getBuiltinEmployees();
        renderEmployees();
        restoreLogin();
        seedDefaultEmployees();
        return;
      }

      employees = visibleEmployees;
      renderEmployees();
      restoreLogin();
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
      const actions = canManageAnnouncements(currentUser)
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
      if (item.status === "待審核") stats.待審核 += 1;
    });
    leaveStats.innerHTML = `
      <div class="stat-card"><h4>特休</h4><p>${stats.特休}</p></div>
      <div class="stat-card"><h4>病假</h4><p>${stats.病假}</p></div>
      <div class="stat-card"><h4>事假</h4><p>${stats.事假}</p></div>
      <div class="stat-card"><h4>待審核</h4><p>${stats.待審核}</p></div>
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
    if (!canManageAnnouncements(currentUser)) return;
    const item = announcements.find((announcement) => announcement.id === id);
    if (!item) return;
    editingAnnouncementId = id;
    if (announcementEditTitle) announcementEditTitle.value = item.title;
    if (announcementEditContent) announcementEditContent.value = item.content;
    if (announcementEditBox) announcementEditBox.classList.remove("hidden");
    if (announcementEditTitle) announcementEditTitle.focus();
  };

  window.deleteAnnouncement = async function (id) {
    if (!canManageAnnouncements(currentUser) || !db) return;
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
    updateMenuPermissions(user);
    renderLeaves();
    renderSchedules();
    renderCalendar();
    renderCoordinates();
  }

  function restoreLogin() {
    const savedEmployeeId = localStorage.getItem(STORAGE_KEYS.currentUser);
    if (!savedEmployeeId) return;
    const matchedUser = employees.find(function (u) {
      return u.employeeId === savedEmployeeId && !u.isHidden && u.status !== "deleted";
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

      const matchedUser = employees.find(function (u) {
        return (
          u.employeeId === employeeId &&
          u.password === password &&
          !u.isHidden &&
          u.status !== "deleted"
        );
      });

      if (!matchedUser) {
        if (loginError) loginError.textContent = "帳號或密碼錯誤";
        return;
      }
      
      if (loginError) loginError.textContent = "";
      setLoggedInUser(matchedUser);
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
      updateMenuPermissions(null);
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
      
      if (targetPage === "attendance") {
        setTimeout(function () {
          if (attendanceMap) attendanceMap.invalidateSize();
        }, 100);
      }
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
          announcementManage: announcementManageCheckbox?.checked || false,
          coordinateAdmin: adminCheckbox?.checked || false
        },
        manageScopes: {
          regions: Array.from(document.querySelectorAll('input[name="manage-regions"]:checked')).map((el) => el.value),
          departments: Array.from(document.querySelectorAll('input[name="manage-departments"]:checked')).map((el) => el.value)
        },
        status: "active",
        isHidden: false
      };

      const isSuperAdmin = isSuperAdminEmployee(employeeData.employeeId);
      
      if (!employeeData.employeeId) return alert("請輸入員工代號");
      if (!employeeData.name) return alert("請輸入姓名");
      if (!employeeData.password) return alert("請輸入密碼");
      if (!employeeData.department) return alert("請選擇部門");
      if (!employeeData.region) return alert("請選擇地區");
      if (!isSuperAdmin && !employeeData.shifts.morning && !employeeData.shifts.evening) return alert("請至少勾選一個班別");

      if (isSuperAdmin) {
        employeeData.permissions.admin = true;
        employeeData.permissions.leaveApprove = true;
        employeeData.permissions.announcementManage = true;
        employeeData.permissions.coordinateAdmin = true;
        employeeData.shifts = {
          morning: false,
          evening: false
        };
        employeeData.weekendsOff = false;
        employeeData.manageScopes = {
          regions: ["新竹區", "台中區", "嘉義區"],
          departments: ["管理部", "TSE", "FAE", "新場", "倉管", "RD", "線上客服"]
        };
      } else if (!employeeData.permissions.admin) {
        employeeData.manageScopes = { regions: [], departments: [] };
      }

      if (!db) return alert("Firebase 未設定，無法新增員工。");

      try {
        if (employeeData.permissions.admin) {
          employeeData.permissions.leaveApprove = true;
        }

        if (editingEmployeeId) {
          await updateDoc(doc(db, "employees", editingEmployeeId), {
            ...employeeData,
            updatedAt: serverTimestamp()
          });
          editingEmployeeId = null;
          alert("員工資料已更新");
        } else {
          await createEmployee(employeeData);
          alert("員工新增成功");
        }
        
        employeeForm.reset();
        if (employeeSubmitBtn) {
          employeeSubmitBtn.textContent = "新增員工";
        }
        if (adminScopePanel) adminScopePanel.classList.add("hidden");
        updateSuperAdminFormState();
      } catch (error) {
        console.error("儲存員工失敗", error);
        alert("儲存失敗");
      }
    });
  }

  if (adminCheckbox) {
    adminCheckbox.addEventListener("change", syncAdminPermissionState);
  }
  
  if (employeeIdField) {
    employeeIdField.addEventListener("input", updateSuperAdminFormState);
  }
  
  window.editEmployee = function (id) {
    const employee = employees.find(function (item) {
      return item.id === id;
    });

    if (!employee) return;

    editingEmployeeId = id;

    document.getElementById("employee-form-id").value = employee.employeeId || "";
    document.getElementById("employee-form-account").value = employee.account || "";
    document.getElementById("employee-form-name").value = employee.name || "";
    document.getElementById("employee-form-password").value = employee.password || "";
    document.getElementById("employee-form-department").value = employee.department || "";
    document.getElementById("employee-form-title").value = employee.title || "";
    document.getElementById("employee-form-region").value = employee.region || "";
    document.getElementById("employee-form-category").value = employee.category || "";
    document.getElementById("employee-form-email-prefix").value = employee.emailPrefix || "";
    document.getElementById("employee-form-phone").value = employee.phone || "";
    document.getElementById("employee-form-birthday").value = employee.birthday || "";
    document.getElementById("employee-form-annual-leave-days").value = employee.annualLeaveDays || 0;

    document.getElementById("shift-morning").checked = !!employee.shifts?.morning;
    document.getElementById("shift-evening").checked = !!employee.shifts?.evening;
    document.getElementById("weekends-off").checked = !!employee.weekendsOff;

    if (adminCheckbox) adminCheckbox.checked = !!employee.permissions?.admin;
    if (leaveApproveCheckbox) leaveApproveCheckbox.checked = !!employee.permissions?.leaveApprove;
    if (announcementManageCheckbox) announcementManageCheckbox.checked = !!employee.permissions?.announcementManage;

    document.querySelectorAll('input[name="manage-regions"]').forEach(function (input) {
      input.checked = !!employee.manageScopes?.regions?.includes(input.value);
    });
    
    document.querySelectorAll('input[name="manage-departments"]').forEach(function (input) {
      input.checked = !!employee.manageScopes?.departments?.includes(input.value);
    });

    if (adminScopePanel) {
      adminScopePanel.classList.toggle("hidden", !adminCheckbox?.checked);
    }

    if (employeeSubmitBtn) {
      employeeSubmitBtn.textContent = "更新員工";
    }

    updateSuperAdminFormState();
    employeeForm?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  updateSuperAdminFormState();

  window.deleteEmployee = async function (id) {
    if (!db) return;

    const confirmed = confirm("確定要刪除此員工嗎？");
    if (!confirmed) return;

    try {
      await updateDoc(doc(db, "employees", id), {
        isHidden: true,
        status: "deleted",
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error("刪除員工失敗", error);
      alert("刪除失敗");
    }
  };

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

  if (shiftCodeSelect) {
    shiftCodeSelect.addEventListener("change", syncShiftForm);
  }

  if (shiftSettingsForm) {
    shiftSettingsForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      const selectedCode = shiftCodeSelect?.value || "";
      const targetShift = findShiftSetting(selectedCode);
      if (!targetShift) return alert("找不到班別設定");
      const payload = {
        code: selectedCode,
        name: shiftNameInput?.value.trim() || "",
        startTime: shiftStartTimeInput?.value || "",
        endTime: shiftEndTimeInput?.value || "",
        reminderTime: shiftReminderTimeInput?.value || "",
        graceMinutes: Number(shiftGraceMinutesInput?.value || 0),
        isActive: shiftIsActiveInput?.checked ?? true,
        updatedAt: serverTimestamp()
      };
      if (!payload.name || !payload.startTime || !payload.endTime || !payload.reminderTime) return alert("請填寫完整班別資訊");
      try {
        if (!db) {
          shiftSettings = shiftSettings.map((item) => item.code === selectedCode ? { ...item, ...payload } : item);
          refreshShiftSettingViews();
          refreshAttendanceSettings();
          return;
        }
        await updateDoc(doc(db, "shiftSettings", targetShift.id), payload);
      } catch (error) {
        console.error("儲存班別設定失敗", error);
        alert("儲存班別設定失敗");
      }
    });
  }

  if (attendanceShiftSelect) {
    attendanceShiftSelect.addEventListener("change", refreshAttendanceSettings);
  }
  
  if (attendanceFilterBtn) {
    attendanceFilterBtn.addEventListener("click", function () {
      renderAttendanceRecords();
    });
  }

  if (attendanceFilterResetBtn) {
    attendanceFilterResetBtn.addEventListener("click", function () {
      if (attendanceFilterName) attendanceFilterName.value = "";
      if (attendanceFilterDate) attendanceFilterDate.value = "";
      renderAttendanceRecords();
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
  if (clockInBtn) {
    clockInBtn.addEventListener("click", () => {
      handleClock("clockIn");
    });
  }

  if (clockOutBtn) {
    clockOutBtn.addEventListener("click", () => {
      handleClock("clockOut");
    });
  }
  
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

  if (coordinateForm) {
    coordinateForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (!canManageCoordinates(currentUser)) return alert("你沒有座標管理權限");
      const payload = {
        region: coordinateRegionSelect?.value || REGIONS[0],
        category: coordinateCategorySelect?.value || "office",
        name: coordinateNameInput?.value.trim() || "",
        lat: Number(coordinateLatInput?.value || 0),
        lng: Number(coordinateLngInput?.value || 0),
        radiusMeters: Number(coordinateRadiusInput?.value || 0),
        isActive: coordinateIsActiveInput?.checked ?? true,
        isHidden: false,
        updatedAt: serverTimestamp()
      };
      if (!payload.name || !payload.lat || !payload.lng || !payload.radiusMeters) return alert("請完整填寫座標資料");
      try {
        if (!db) {
          if (editingCoordinateId) {
            attendanceLocations = attendanceLocations.map((item) => item.id === editingCoordinateId ? { ...item, ...payload } : item);
          } else {
            attendanceLocations = [{ id: `local-${Date.now()}`, ...payload }, ...attendanceLocations];
          }
          renderCoordinates();
          renderAttendanceSettingsSummary();
          hideCoordinateEditor();
          return;
        }
        if (editingCoordinateId) {
          await updateDoc(doc(db, "attendanceLocations", editingCoordinateId), payload);
        } else {
          await addDoc(collection(db, "attendanceLocations"), { ...payload, createdAt: serverTimestamp() });
        }
        hideCoordinateEditor();
      } catch (error) {
        console.error("儲存打卡座標失敗", error);
        alert("儲存打卡座標失敗");
      }
    });
  }

  if (coordinateCancelBtn) coordinateCancelBtn.addEventListener("click", hideCoordinateEditor);

  window.editCoordinate = function (id) {
    if (!canManageCoordinates(currentUser)) return;
    const location = attendanceLocations.find((item) => item.id === id);
    if (!location) return;
    editingCoordinateId = id;
    showCoordinateEditor("edit", location);
  };

  window.toggleCoordinateVisibility = async function (id, isActive = false) {
    if (!canManageCoordinates(currentUser)) return;
    if (!db) {
      attendanceLocations = attendanceLocations.map((item) => item.id === id ? { ...item, isHidden: true, isActive } : item);
      renderCoordinates();
      renderAttendanceSettingsSummary();
      return;
    }
    await updateDoc(doc(db, "attendanceLocations", id), { isHidden: true, isActive, updatedAt: serverTimestamp() });
  };

  window.deleteCoordinate = async function (id) {
    if (!canManageCoordinates(currentUser)) return;
    if (!db) {
      attendanceLocations = attendanceLocations.filter((item) => item.id !== id);
      renderCoordinates();
      renderAttendanceSettingsSummary();
      return;
    }
    await deleteDoc(doc(db, "attendanceLocations", id));
  };

  populateFixedOptions();
  syncAdminPermissionState();
  startEmployeesListener();

  renderLeaves();
  renderSchedules();
  renderCalendar();
  restoreLogin();

  startAnnouncementsListener();
  startLeaveListener();
  startScheduleListener();
  startAttendanceLocationsListener();
  startShiftSettingsListener();
  refreshAttendanceSettings();
  startAttendanceRecordsListener();
  renderAttendanceRecords();
});
