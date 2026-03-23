import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getMessaging, isSupported as isMessagingSupported, getToken, onMessage } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging.js";
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
let messaging = null;
let messagingSupportChecked = false;

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
    },
    fcmToken: "",
    notificationSettings: {
      announcement: true,
      attendance: true,
      leave: true
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
    },
    fcmToken: "",
    notificationSettings: {
      announcement: true,
      attendance: true,
      leave: true
    }
  }
];

const DEFAULT_SHIFT_SETTINGS = [
  { code: "morning", name: "早班", startTime: "08:00", endTime: "17:00", reminderTime: "07:50", graceMinutes: 15, isActive: true },
  { code: "evening", name: "晚班", startTime: "20:00", endTime: "08:00", reminderTime: "19:50", graceMinutes: 15, isActive: true }
];

const SYMBOL_TYPES = {
  rest: { icon: "▲", color: "black", label: "排休" },
  must_rest: { icon: "▲", color: "red", label: "必休" },
  new_year_rest: { icon: "★", color: "black", label: "過年休假" },
  new_year_must_rest: { icon: "★", color: "red", label: "過年必休" },
  event: { icon: "🎰", color: "default", label: "公司活動" }
};
const SYMBOL_BUTTON_ORDER = ["rest", "must_rest", "new_year_rest", "new_year_must_rest", "event"];
const SYMBOL_LABELS = Object.fromEntries(Object.entries(SYMBOL_TYPES).map(([key, value]) => [key, value.label]));
const HOLIDAY_DATES = new Set([]);

const STORAGE_KEYS = {
  currentUser: "shift_current_user",
  currentUserSession: "shift_current_user_session"
};

let currentUser = null;
let editingAnnouncementId = null;
let calendarDate = new Date();
let selectedScheduleDate = "";
let editingScheduleId = null;
let editingEmployeeId = null;
let announcements = [];
let leaveRequests = [];
let schedules = [];
let currentLeaveMonth = `${calendarDate.getFullYear()}-${String(calendarDate.getMonth() + 1).padStart(2, "0")}`;
let activeSymbolType = "";
let selectedEmployeeIds = [];
let pendingSelectedEmployeeIds = [];
let selectedRegion = "";
let selectedDepartment = "";
let selectedShiftType = "";
let leaveMonthSettings = [];
let leaveAssignments = [];
let employees = users.map((user, index) => ({ id: `builtin-${index}`, status: "active", isHidden: false, ...user }));
let isBootstrappingEmployees = false;
let hasLoadedEmployees = false;
let resolveEmployeesReady = null;
const employeesReadyPromise = new Promise(function (resolve) {
  resolveEmployeesReady = resolve;
});
let attendanceLocations = DEFAULT_ATTENDANCE_LOCATIONS.map((item, index) => ({ id: `default-${index}`, ...item }));
let attendanceRecords = [];
let shiftSettings = DEFAULT_SHIFT_SETTINGS.map((item) => ({ ...item }));
let shiftTemplates = [];
let employeeShiftSettings = [];
let editingCoordinateId = null;
let lastAttendanceAttempt = null;
let attendanceDetailMaps = {};
let messagingServiceWorkerRegistration = null;

async function registerMessagingServiceWorker() {
  if (messagingServiceWorkerRegistration) return messagingServiceWorkerRegistration;
  if (!("serviceWorker" in navigator)) return null;

  try {
    messagingServiceWorkerRegistration = await navigator.serviceWorker.register("./firebase-messaging-sw.js");
    return messagingServiceWorkerRegistration;
  } catch (error) {
    console.error("FCM Service Worker 註冊失敗", error);
    return null;
  }
}

async function ensureMessaging() {
  if (messagingSupportChecked) return messaging;

  messagingSupportChecked = true;

  if (!firebaseApp || !("Notification" in window)) return null;

  const supported = await isMessagingSupported().catch(function (error) {
    console.warn("FCM 支援檢查失敗", error);
    return false;
  });

  if (!supported) {
    console.warn("目前瀏覽器環境不支援 Firebase Messaging，略過推播初始化。");
    return null;
  }

  messaging = getMessaging(firebaseApp);
  return messaging;
}

async function initMessaging() {
  if (!currentUser || !db || !currentUser?.id || String(currentUser.id).startsWith("builtin-")) return;

  const messagingInstance = await ensureMessaging();
  if (!messagingInstance) return;
  
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.log("使用者未允許通知");
      return;
    }

    const serviceWorkerRegistration = await registerMessagingServiceWorker();
    const token = await getToken(messagingInstance, {
      vapidKey: "BAiisudW3eTSyOOkA_WMPmpWGa0Rrny0G9FI6T2W1KSIU_JiegUeIs7AplJCPIkYpr_1uIedG2oC7R_Qiik0F5c",
      serviceWorkerRegistration: serviceWorkerRegistration || undefined
    });

    if (!token) {
      console.log("沒有取得 FCM token");
      return;
    }

    console.log("FCM token:", token);

    await updateDoc(doc(db, "employees", currentUser.id), {
      fcmToken: token,
      notificationSettings: getDefaultNotificationSettings(currentUser.notificationSettings),
      updatedAt: serverTimestamp()
    });
    
    onMessage(messagingInstance, function (payload) {
      console.log("前景通知：", payload);

      const title = payload.notification?.title || "新通知";
      const body = payload.notification?.body || "";
      const targetLink = payload.data?.link || payload.fcmOptions?.link || "";
      alert(`${title}\n${body}`);
      if (targetLink && confirm("是否前往查看公告？")) {
        window.location.href = targetLink;
      }
    });
  } catch (error) {
    console.error("初始化推播失敗：", error);
  }
}

function isAdmin(user) {
 return Boolean(user?.permissions?.admin || user?.role === "管理員");
}

function canManageAnnouncements(user) {
  return Boolean(user?.permissions?.admin || user?.permissions?.announcementManage);
}

function canManageCoordinates(user) {
  return Boolean(user?.permissions?.admin || user?.permissions?.coordinateAdmin);
}

function normalizeLoginValue(value) {
  return String(value || "")
    .trim()
    .replace(/　/g, " ")
    .toLowerCase();
}

function normalizePasswordValue(value) {
  return String(value || "")
    .trim()
    .replace(/　/g, " ");
}

function isLoginEligible(user) {
  return Boolean(user) && !user.isHidden && user.status !== "deleted";
}

function getEmailAliases(user) {
  const emailValue = String(user?.email || "").trim();
  const emailPrefixValue = String(user?.emailPrefix || "").trim();
  const emailLocalPart = emailValue.includes("@") ? emailValue.split("@")[0] : emailValue;
  const companyEmailValue = emailPrefixValue ? `${emailPrefixValue}@goldbricks.com.tw` : "";
  
  return [emailValue, emailPrefixValue, emailLocalPart, companyEmailValue].filter(Boolean);

}
function normalizeLegacyPasswordAliasValue(value) {
  return normalizeLoginValue(value);
}

function getLoginIdentifiers(user) {
  return [user?.employeeId, user?.account, user?.id, ...getEmailAliases(user)]
    .map(normalizeLoginValue)
    .filter(Boolean);
}

function getEmployeeMergeKeys(user) {
  const uniqueKeys = new Set(getLoginIdentifiers(user));
  return Array.from(uniqueKeys);
}

function getAcceptedPasswords(user) {
  return [user?.password, user?.employeeId, user?.account, ...getEmailAliases(user)]
    .map(normalizePasswordValue)
    .filter(Boolean);
}

function matchesLoginPassword(user, password) {
  const normalizedPassword = normalizePasswordValue(password);
  if (!normalizedPassword) return false;

  const acceptedPasswords = getAcceptedPasswords(user);
  if (acceptedPasswords.includes(normalizedPassword)) return true;

  const normalizedPasswordForLegacyFallback = normalizeLegacyPasswordAliasValue(password);
  const normalizedAcceptedAliases = acceptedPasswords.map(normalizeLegacyPasswordAliasValue);
  if (normalizedAcceptedAliases.includes(normalizedPasswordForLegacyFallback)) return true;

  return getLoginIdentifiers(user).includes(normalizedPasswordForLegacyFallback);
}

function findLoginUser(loginId, password) {
  const normalizedLoginId = normalizeLoginValue(loginId);
  if (!normalizedLoginId || !normalizePasswordValue(password)) return null;

  return employees.find(function (user) {
    if (!isLoginEligible(user)) return false;
    return getLoginIdentifiers(user).includes(normalizedLoginId) && matchesLoginPassword(user, password);
  });
}

function buildUserSession(user) {
  return {
    employeeId: user?.employeeId || "",
    account: user?.account || "",
    id: user?.id || ""
  };
}

function persistCurrentUserSession(user) {
  const session = buildUserSession(user);
  localStorage.setItem(STORAGE_KEYS.currentUser, session.employeeId);
  localStorage.setItem(STORAGE_KEYS.currentUserSession, JSON.stringify(session));
}

function findUserBySession(session = {}) {
  const identifiers = [session.employeeId, session.account, session.id]
    .map(normalizeLoginValue)
    .filter(Boolean);

  if (identifiers.length === 0) return null;

  return employees.find(function (user) {
    if (!isLoginEligible(user)) return false;
    const userIdentifiers = getLoginIdentifiers(user);
    return identifiers.some(function (identifier) {
      return userIdentifiers.includes(identifier);
    });
  }) || null;
}

function markEmployeesReady() {
  if (hasLoadedEmployees) return;
  hasLoadedEmployees = true;
  setLoginLoadingState(false, "");
  if (typeof resolveEmployeesReady === "function") {
    resolveEmployeesReady();
    resolveEmployeesReady = null;
  }
}

function setLoginLoadingState(isLoading, message = "") {
  const loginButton = document.getElementById("login-btn");
  const loginError = document.getElementById("login-error");

  if (loginButton) {
    loginButton.disabled = isLoading;
    loginButton.textContent = isLoading ? "登入中..." : "登入";
  }

  if (loginError) {
    loginError.textContent = message;
  }
}

async function waitForEmployeesReady(timeoutMs = 2500) {
  if (hasLoadedEmployees) return true;

  const timeoutPromise = new Promise(function (resolve) {
    window.setTimeout(function () {
      resolve(false);
    }, timeoutMs);
  });

  return Promise.race([
    employeesReadyPromise.then(function () {
      return true;
    }),
    timeoutPromise
  ]);
}

function getShiftNameFromCode(code) {
  return code === "evening" ? "晚班" : "早班";
}

function getUserShiftType(user) {
  if (user?.defaultShiftType) return user.defaultShiftType;
  if (user?.shifts?.morning && !user?.shifts?.evening) return "早班";
  if (!user?.shifts?.morning && user?.shifts?.evening) return "晚班";
  return "未設定";
}

function getUserShiftCode(user) {
  const shiftType = getUserShiftType(user);
  if (shiftType === "早班") return "morning";
  if (shiftType === "晚班") return "evening";
  return "";
}

function getEmployeePhotoUrl(employee) {
  return employee?.photoURL || "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'><rect width='120' height='120' rx='24' fill='#dbeafe'/><circle cx='60' cy='45' r='24' fill='#60a5fa'/><path d='M24 104c7-20 24-30 36-30s29 10 36 30' fill='#60a5fa'/></svg>`);
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

function getDefaultNotificationSettings(settings = {}) {
  return {
    announcement: settings.announcement !== false,
    attendance: settings.attendance !== false,
    leave: settings.leave !== false
  };
}

function createEmployee(employeeData) {
  return addDoc(collection(db, "employees"), {
    fcmToken: "",
    notificationSettings: getDefaultNotificationSettings(employeeData.notificationSettings),
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

function getComparableTimestampValue(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value.seconds === "number") {
    const nanoseconds = typeof value.nanoseconds === "number" ? value.nanoseconds : 0;
    return (value.seconds * 1000) + Math.floor(nanoseconds / 1000000);
  }

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sortEmployeesForDisplay(employeeList = []) {
  return [...employeeList].sort(function (a, b) {
    return getComparableTimestampValue(b.createdAt) - getComparableTimestampValue(a.createdAt);
  });
}

function mergeEmployeesWithBuiltin(remoteEmployees = []) {
  const mergedEmployees = [];
  const keyToIndex = new Map();

  function registerEmployee(employee) {
    const mergeKeys = getEmployeeMergeKeys(employee);
    const existingKey = mergeKeys.find(function (key) {
      return keyToIndex.has(key);
    });
    const existingIndex = existingKey !== undefined ? keyToIndex.get(existingKey) : undefined;

    if (existingIndex !== undefined) {
      mergeKeys.forEach(function (key) {
        keyToIndex.set(key, existingIndex);
      });
      return existingIndex;
    }

    const index = mergedEmployees.push(employee) - 1;
    mergeKeys.forEach(function (key) {
      keyToIndex.set(key, index);
    });
    return index;
  }

  getBuiltinEmployees().forEach(function (employee) {
    registerEmployee(employee);
  });

  remoteEmployees.forEach(function (employee) {
    const mergeKeys = getEmployeeMergeKeys(employee);
    const existingKey = mergeKeys.find(function (key) {
      return keyToIndex.has(key);
    });
    const existingIndex = existingKey !== undefined ? keyToIndex.get(existingKey) : undefined;
    const builtinEmployee = existingIndex !== undefined ? mergedEmployees[existingIndex] || {} : {};
    const mergedEmployee = {
      ...builtinEmployee,
      status: "active",
      isHidden: false,
      notificationSettings: getDefaultNotificationSettings(employee.notificationSettings || builtinEmployee.notificationSettings),
      fcmToken: employee.fcmToken || builtinEmployee.fcmToken || "",
      ...employee
     };

    if (existingIndex !== undefined) {
      mergedEmployees[existingIndex] = mergedEmployee;
      getEmployeeMergeKeys(mergedEmployee).forEach(function (key) {
        keyToIndex.set(key, existingIndex);
      });
      return;
    }

    registerEmployee(mergedEmployee);
  });

  return mergedEmployees.filter(isLoginEligible);
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
  const shiftInfo = document.getElementById("today-shift-info");

  const attendanceStatusBadge = document.getElementById("attendance-status-badge");
  const attendanceSettingsSummary = document.getElementById("attendance-settings-summary");
  const attendanceResult = document.getElementById("attendance-result");
  const attendanceReminderPanel = document.getElementById("attendance-reminder-panel");
  const attendanceLocation = document.getElementById("attendance-location");
  const attendanceOffice = document.getElementById("attendance-office");
  const attendanceNetworkType = document.getElementById("attendance-network-type");
  const clockInBtn = document.getElementById("clock-in-btn");
  const clockOutBtn = document.getElementById("clock-out-btn");
  const attendanceFilterName = document.getElementById("attendance-filter-name");
  const attendanceFilterDate = document.getElementById("attendance-filter-date");
  const attendanceFilterBtn = document.getElementById("attendance-filter-btn");
  const attendanceFilterResetBtn = document.getElementById("attendance-filter-reset-btn");
  const attendanceSummaryList = document.getElementById("attendance-summary-list");
  
  const employeeForm = document.getElementById("employee-form");
  const employeeFormCard = document.getElementById("employee-form-card");
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
  let photoData = "";
  const photoZone = document.getElementById("photo-zone");
  const photoFile = document.getElementById("photo-file");
  const photoPreview = document.getElementById("photo-preview");
  
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
  const shiftScopeSelect = document.getElementById("shift-scope");
  const shiftCodeSelect = document.getElementById("shift-code");
  const shiftRegionSelect = document.getElementById("shift-region");
  const shiftDepartmentSelect = document.getElementById("shift-department");
  const shiftEmployeeSelect = document.getElementById("shift-employee");
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

  const calendarTitle = document.getElementById("calendar-title");
  const prevMonthBtn = document.getElementById("prev-month");
  const nextMonthBtn = document.getElementById("next-month");
  const leaveMonthLabel = document.getElementById("leave-month-label");
  const leaveOpenRange = document.getElementById("leave-open-range");
  const leaveTotalRestDays = document.getElementById("leave-total-rest-days");
  const leaveRegionFilter = document.getElementById("leave-region-filter");
  const leaveDepartmentFilter = document.getElementById("leave-department-filter");
  const leaveShiftFilter = document.getElementById("leave-shift-filter");
  const leaveEmployeeSearch = document.getElementById("leave-employee-search");
  const leaveSymbolToolbar = document.getElementById("leave-symbol-toolbar");
  const leaveEditHint = document.getElementById("leave-edit-hint");
  const leaveEmployeeFilterList = document.getElementById("leave-employee-filter-list");
  const leaveEmployeeApplyBtn = document.getElementById("leave-employee-apply-btn");
  const leaveEmployeeCancelBtn = document.getElementById("leave-employee-cancel-btn");
  const leaveBoardTable = document.getElementById("leave-board-table");

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
    return getUserShiftCode(currentUser) || getActiveShiftSettings()[0]?.code || shiftSettings[0]?.code || "";
  }

  function findShiftSetting(code) {
    return shiftSettings.find((item) => item.code === code) || null;
  }

  function ensureBaseShiftTemplates() {
    const combos = new Map();
    employees.forEach(function (employee) {
      const region = employee.region || "";
      const department = employee.department || "";
      if (!region || !department || department === "最高權限") return;
      DEFAULT_SHIFT_SETTINGS.forEach(function (shift) {
        const key = `${region}__${department}__${shift.code}`;
        if (!combos.has(key)) {
          combos.set(key, {
            id: `template-${key}`,
            region,
            department,
            shiftType: shift.code,
            startTime: shift.startTime,
            endTime: shift.endTime,
            reminderTime: shift.reminderTime,
            graceMinutes: shift.graceMinutes,
            isDefault: true,
            isActive: shift.isActive !== false
          });
        }
      });
    });

    shiftTemplates = Array.from(new Map([...combos, ...shiftTemplates.map((item) => [`${item.region}__${item.department}__${item.shiftType}`, item])]).values());
  }

  function getTemplateShift(region, department, shiftCode) {
    return shiftTemplates.find((item) => item.region === region && item.department === department && item.shiftType === shiftCode) || null;
  }

  function getEmployeeShiftOverride(employeeId, shiftCode) {
    return employeeShiftSettings.find((item) => item.employeeId === employeeId && item.shiftType === shiftCode) || null;
  }

  function getEffectiveShiftSetting(user, shiftCode) {
    const override = getEmployeeShiftOverride(user?.employeeId, shiftCode);
    if (override) {
      return {
        code: override.shiftType,
        name: getShiftNameFromCode(override.shiftType),
        ...override
      };
    }
    const template = getTemplateShift(user?.region, user?.department, shiftCode);
    if (template) {
      return {
        code: template.shiftType,
        name: getShiftNameFromCode(template.shiftType),
        ...template
      };
    }
    const legacy = findShiftSetting(shiftCode);
    return legacy ? { ...legacy } : null;
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
    if (shiftCodeSelect) {
      shiftCodeSelect.innerHTML = shiftSettings.map((shift) => `<option value="${shift.code}">${shift.name}（${shift.code}）</option>`).join("");
    }
        if (shiftRegionSelect) {
      shiftRegionSelect.innerHTML = REGIONS.map((region) => `<option value="${region}">${region}</option>`).join("");
    }
    if (shiftDepartmentSelect) {
      shiftDepartmentSelect.innerHTML = DEPARTMENTS.map((department) => `<option value="${department}">${department}</option>`).join("");
    }
    refreshShiftEmployeeOptions();
    renderLeaveBoard();
  }

  function refreshShiftEmployeeOptions() {
    if (!shiftEmployeeSelect) return;
    const region = shiftRegionSelect?.value || "";
    const department = shiftDepartmentSelect?.value || "";
    const options = employees.filter((employee) => employee.region === region && employee.department === department);
    shiftEmployeeSelect.innerHTML = `<option value="">請選擇員工</option>${options.map((employee) => `<option value="${employee.employeeId}">${employee.name}（${employee.employeeId}）</option>`).join("")}`;
    shiftEmployeeSelect.parentElement?.classList.toggle("hidden", shiftScopeSelect?.value !== "employee");
  }

  function syncShiftForm() {
    const code = shiftCodeSelect?.value || shiftSettings[0]?.code;
    const region = shiftRegionSelect?.value || REGIONS[0];
    const department = shiftDepartmentSelect?.value || DEPARTMENTS[0];
    const employeeId = shiftEmployeeSelect?.value || "";
    const shift = shiftScopeSelect?.value === "employee"
      ? (getEmployeeShiftOverride(employeeId, code) || getTemplateShift(region, department, code) || findShiftSetting(code))
      : (getTemplateShift(region, department, code) || findShiftSetting(code));
    if (!shift) return;
    if (shiftNameInput) shiftNameInput.value = shift.name || getShiftNameFromCode(code);
    if (shiftStartTimeInput) shiftStartTimeInput.value = formatTimeText(shift.startTime);
    if (shiftEndTimeInput) shiftEndTimeInput.value = formatTimeText(shift.endTime);
    if (shiftReminderTimeInput) shiftReminderTimeInput.value = formatTimeText(shift.reminderTime);
    if (shiftGraceMinutesInput) shiftGraceMinutesInput.value = Number(shift.graceMinutes || 0);
    if (shiftIsActiveInput) shiftIsActiveInput.checked = shift.isActive !== false;
  }

  function renderShiftSettingsList() {
    if (!shiftSettingsList) return;
    ensureBaseShiftTemplates();
    const grouped = {};
    shiftTemplates.forEach(function (item) {
      if (!grouped[item.region]) grouped[item.region] = {};
      if (!grouped[item.region][item.department]) grouped[item.region][item.department] = { templates: [], employees: [] };
      grouped[item.region][item.department].templates.push(item);
    });
    employeeShiftSettings.forEach(function (item) {
      if (!grouped[item.region]) grouped[item.region] = {};
      if (!grouped[item.region][item.department]) grouped[item.region][item.department] = { templates: [], employees: [] };
      grouped[item.region][item.department].employees.push(item);
    });
    shiftSettingsList.innerHTML = Object.keys(grouped).map((region) => `
      <details class="scope-collapse">
        <summary>${region}</summary>
        ${Object.keys(grouped[region]).map((department) => {
          const bucket = grouped[region][department];
          return `
            <details class="scope-collapse">
              <summary>${department}</summary>
              <div class="attendance-tree-node">
                <div class="list-item">
                  <h4>預設早班 / 晚班</h4>
                  ${bucket.templates.sort((a, b) => a.shiftType.localeCompare(b.shiftType)).map((item) => `<p>${getShiftNameFromCode(item.shiftType)}｜上班 ${formatTimeText(item.startTime)}｜下班 ${formatTimeText(item.endTime)}｜提醒 ${formatTimeText(item.reminderTime)}｜寬限 ${item.graceMinutes} 分鐘</p>`).join("") || "<p>尚未設定。</p>"}
                </div>
                <details class="scope-collapse">
                  <summary>個別員工班別設定（${bucket.employees.length} 筆）</summary>
                  <div class="list-wrap">
                    ${bucket.employees.length ? bucket.employees.map((item) => `<div class="list-item"><h4>${item.employeeName}</h4><p>${getShiftNameFromCode(item.shiftType)}｜上班 ${formatTimeText(item.startTime)}｜下班 ${formatTimeText(item.endTime)}｜提醒 ${formatTimeText(item.reminderTime)}｜寬限 ${item.graceMinutes} 分鐘</p></div>`).join("") : "<div class='list-item'><p>尚未設定員工覆蓋班別。</p></div>"}
                  </div>
                </details>
              </div>
            </details>
          `;
        }).join("")}
      </details>
    `).join("");
  }

  function renderAttendanceReminderPanel() {
    if (!attendanceReminderPanel) return;
    const shift = getEffectiveShiftSetting(currentUser, getSelectedShiftCode()) || getActiveShiftSettings()[0];
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
    const shift = getEffectiveShiftSetting(currentUser, getSelectedShiftCode()) || getActiveShiftSettings()[0];
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

    const shiftCode = getUserShiftCode(currentUser);
    const shiftType = getUserShiftType(currentUser);
    const selectedShift = getEffectiveShiftSetting(currentUser, shiftCode);
    if (!selectedShift || !shiftCode || shiftType === "未設定") {
      alert("請先設定班別");
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
        region: currentUser.region,
        department: currentUser.department,
        type,
        shiftCode: selectedShift.code,
        shiftName: selectedShift.name,
        shiftType,
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

  function renderAttendanceDetailMap(container) {
    if (!container || typeof L === "undefined" || container.dataset.mapReady === "true") return;
    const lat = Number(container.dataset.lat);
    const lng = Number(container.dataset.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const map = L.map(container).setView([lat, lng], 16);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(map);
    L.marker([lat, lng]).addTo(map).bindPopup(`${container.dataset.name || "打卡位置"}<br>${lat.toFixed(6)}, ${lng.toFixed(6)}`).openPopup();
    container.dataset.mapReady = "true";
    attendanceDetailMaps[container.dataset.mapId] = map;
    setTimeout(function () { map.invalidateSize(); }, 50);
  }

  function buildAttendanceTree(records) {
    const tree = {};
    records.forEach(function (item) {
      const date = formatDateKey(item.createdAtClient);
      const region = item.region || "未分類地區";
      const department = item.department || "未分類部門";
      const shiftType = item.shiftType || item.shiftCode || "morning";
      const employeeKey = item.employeeId || item.employeeName || "unknown";
      if (!tree[date]) tree[date] = {};
      if (!tree[date][region]) tree[date][region] = {};
      if (!tree[date][region][department]) tree[date][region][department] = {};
      if (!tree[date][region][department][shiftType]) tree[date][region][department][shiftType] = {};
      if (!tree[date][region][department][shiftType][employeeKey]) {
        tree[date][region][department][shiftType][employeeKey] = { employeeName: item.employeeName || "未知員工", employeeId: item.employeeId || "", records: [] };
      }
      tree[date][region][department][shiftType][employeeKey].records.push(item);
    });
    return tree;
  }

   function summarizeEmployeeAttendance(group) {
    const sortedRecords = group.records.slice().sort((a, b) => new Date(a.createdAtClient) - new Date(b.createdAtClient));
    const clockInRecord = sortedRecords.find((item) => item.type === "clockIn") || sortedRecords[0];
    const clockOutRecord = sortedRecords.slice().reverse().find((item) => item.type === "clockOut") || null;
    return {
      ...group,
      records: sortedRecords,
      clockInRecord,
      clockOutRecord,
      latestRecord: sortedRecords[sortedRecords.length - 1],
      workHours: clockInRecord && clockOutRecord ? calculateHours(clockInRecord.createdAtClient, clockOutRecord.createdAtClient) : "-"
    };
  }

  function renderAttendanceRecords() {
    if (!attendanceSummaryList) return;
    const filteredRecords = getFilteredAttendanceRecords();
    const tree = buildAttendanceTree(filteredRecords);
    if (!filteredRecords.length) {
      attendanceSummaryList.innerHTML = `<div class="list-item"><p>目前沒有符合條件的打卡紀錄。</p></div>`;
      return;
    }
attendanceSummaryList.innerHTML = `<div class="attendance-tree">${Object.keys(tree).sort((a, b) => new Date(b) - new Date(a)).map((date) => `
      <details>
        <summary>${date}</summary>
        <div class="attendance-tree-node">
          ${Object.keys(tree[date]).map((region) => `<details><summary>${region}</summary><div class="attendance-tree-node">${Object.keys(tree[date][region]).map((department) => `<details><summary>${department}</summary><div class="attendance-tree-node">${Object.keys(tree[date][region][department]).map((shiftType) => `<details><summary>${getShiftNameFromCode(shiftType)}</summary><div class="attendance-tree-node">${Object.values(tree[date][region][department][shiftType]).sort((a, b) => a.employeeName.localeCompare(b.employeeName, "zh-Hant")).map((group) => {
            const item = summarizeEmployeeAttendance(group);
            const focusRecord = item.clockInRecord || item.latestRecord || {};
            const mapId = `${date}-${item.employeeId}-${shiftType}`.replace(/[^a-zA-Z0-9-_]/g, "");
            return `<details class="attendance-record-card"><summary>${item.employeeName}（${item.employeeId || "未填編號"}）</summary><div class="list-item"><p>上班時間：${item.clockInRecord ? formatTimeOnly(item.clockInRecord.createdAtClient) : "-"}</p><p>下班時間：${item.clockOutRecord ? formatTimeOnly(item.clockOutRecord.createdAtClient) : "-"}</p><p>打卡地點：${focusRecord.officeName || "範圍外打卡"}</p><p>座標：<span class="coordinate-text">${Number(focusRecord.lat || 0).toFixed(6)}, ${Number(focusRecord.lng || 0).toFixed(6)}</span></p><p>工時：${item.workHours} 小時｜最終狀態：<span class="status-badge status-${item.latestRecord?.status || "success"}">${item.latestRecord?.status || "success"}</span></p><div class="attendance-map" data-map-id="${mapId}" data-lat="${focusRecord.lat || ""}" data-lng="${focusRecord.lng || ""}" data-name="${focusRecord.officeName || item.employeeName}"></div><div style="margin-top:10px;">${item.records.map((record) => `<div class="item-meta">${record.type === "clockIn" ? "上班時間" : "下班時間"}｜${formatTimeOnly(record.createdAtClient)}｜${record.officeName || "範圍外"}｜座標 ${Number(record.lat || 0).toFixed(6)}, ${Number(record.lng || 0).toFixed(6)}${record.outsideReason ? `｜原因：${record.outsideReason}` : ""}</div>`).join("")}</div></div></details>`;
          }).join("")}</div></details>`).join("")}</div></details>`).join("")}</div></details>`).join("")}
        </div>
      </details>`).join("")}</div>`;
  }

    function startShiftSettingsListener() {
    if (!db) {
      ensureBaseShiftTemplates();
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
      ensureBaseShiftTemplates();
      refreshShiftSettingViews();
      refreshAttendanceSettings();
    });

    onSnapshot(query(collection(db, "shiftTemplates"), orderBy("region", "asc")), function (snapshot) {
      shiftTemplates = snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }));
      ensureBaseShiftTemplates();
      refreshShiftSettingViews();
      refreshAttendanceSettings();
    });

    onSnapshot(query(collection(db, "employeeShiftSettings"), orderBy("employeeName", "asc")), function (snapshot) {
      employeeShiftSettings = snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }));
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
    if (shiftInfo && user) {
      const shift = getUserShiftType(user);
      shiftInfo.textContent = `今日班別：${shift}`;
    }
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

  function setPhoto(src) {
    photoData = src || "";
    if (!photoPreview) return;
    if (src) {
      photoPreview.src = src;
      photoPreview.style.display = "block";
      photoPreview.classList.remove("hidden");
    } else {
      photoPreview.removeAttribute("src");
      photoPreview.style.display = "none";
      photoPreview.classList.add("hidden");
    }
  }

  function toggleEmployeeManagementUI() {
    const canManageEmployees = isAdmin(currentUser);
    if (employeeFormCard) employeeFormCard.classList.toggle("hidden", !canManageEmployees);
    renderEmployees();
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

                          const canManageEmployees = isAdmin(currentUser);
                          return `
                            <div class="list-item">
                              <div class="employee-card-main">
                                <div class="employee-avatar-wrap">
                                 <img class="employee-avatar" src="${employee.photoURL || getEmployeePhotoUrl(employee)}" alt="${employee.name || "員工照片"}" />
                                </div>
                                <div>
                                  <div class="employee-card-header">
                                    <div>
                                      <h4>${employee.name || "未命名員工"}</h4>
                                      <div class="item-meta">
                                        員工代號：${employee.employeeId || "-"}｜
                                        帳號：${employee.account || "-"}｜
                                        Email：${employee.email || "-"}
                                      </div>
                                    </div>
                                    <span class="status-badge status-${employee.status || "active"}">${employee.status || "active"}</span>
                                  </div>
                              <p>部門：${employee.department || "-"}｜職稱：${employee.title || "-"}｜地區：${employee.region || "-"}</p>
                                  <p>類別：${employee.category || "-"}｜電話：${employee.phone || "-"}｜生日：${employee.birthday || "-"}</p>
                                  <p>年度特休：${employee.annualLeaveDays || 0} 天｜班別與休假：${shifts.join("、") || "未設定"}</p>
                                  <p>權限：${formatEmployeePermissions(employee)}</p>
                                  ${employee.permissions?.admin ? `<p>管理地區：${scopeRegions}</p><p>管理部門：${scopeDepartments}</p>` : ""}
                                  ${canManageEmployees ? `<div class="item-actions"><button type="button" class="small-btn edit-btn" onclick="editEmployee('${employee.id}')">編輯</button><button type="button" class="small-btn delete-btn" onclick="deleteEmployee('${employee.id}')">刪除</button></div>` : ""}
                              </div>
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
    refreshShiftEmployeeOptions();
    renderLeaveBoard();
  }

  function startEmployeesListener() {
     if (!db) {
      employees = getBuiltinEmployees();
      markEmployeesReady();
      renderEmployees();
      restoreLogin();
      return;
    }

    const q = collection(db, "employees");
    
    onSnapshot(q, function (snapshot) {
      const visibleEmployees = sortEmployeesForDisplay(snapshot.docs
        .map(function (docItem) {
          return {
            id: docItem.id,
            ...docItem.data()
          };
        })
        .filter(function (employee) {
          return !employee.isHidden;
        }));

         if (visibleEmployees.length === 0) {
        employees = getBuiltinEmployees();
        markEmployeesReady();
        renderEmployees();
        restoreLogin();
        seedDefaultEmployees();
        return;
      }

      employees = mergeEmployeesWithBuiltin(visibleEmployees);
      markEmployeesReady();
      ensureBaseShiftTemplates();
      renderEmployees();
      restoreLogin();
    }, function (error) {
      console.error("載入員工資料失敗，改用內建帳號", error);
      employees = getBuiltinEmployees();
      markEmployeesReady();
      ensureBaseShiftTemplates();
      renderEmployees();
      restoreLogin();
    });
  }

  function hideAnnouncementEditor() {
    editingAnnouncementId = null;
    if (announcementEditBox) announcementEditBox.classList.add("hidden");
    if (announcementEditForm) announcementEditForm.reset();
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
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString() : "",
          authorId: data.authorId || "",
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

  function startLeaveMonthSettingsListener() {
    if (!db) return;
    onSnapshot(query(collection(db, "leaveMonthSettings"), orderBy("monthKey", "desc")), function (snapshot) {
      leaveMonthSettings = snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }));
      renderLeaveBoard();
    });
  }

  function startLeaveAssignmentsListener() {
    if (!db) return;
    onSnapshot(query(collection(db, "leaveAssignments"), orderBy("date", "asc")), function (snapshot) {
      leaveAssignments = snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }));
      renderLeaveBoard();
    });
  }

  function getMonthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

    function getCurrentLeaveMonthDate() {
    const [year, month] = currentLeaveMonth.split("-").map(Number);
    return new Date(year, (month || 1) - 1, 1);
  }

    function getDaysInCurrentLeaveMonth() {
    const date = getCurrentLeaveMonthDate();
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  }

  function getMonthSetting(monthKey) {
    return leaveMonthSettings.find((item) => item.monthKey === monthKey) || null;
  }

  function getVisibleLeaveEmployees() {
    const keyword = String(leaveEmployeeSearch?.value || "").trim();
    return employees.filter((employee) => {
      if (employee.isHidden || employee.status === "deleted") return false;
      if (selectedRegion && employee.region !== selectedRegion) return false;
      if (selectedDepartment && employee.department !== selectedDepartment) return false;
      if (selectedShiftType && getUserShiftType(employee) !== selectedShiftType) return false;
      if (selectedEmployeeIds.length > 0 && !selectedEmployeeIds.includes(employee.employeeId)) return false;
      if (keyword) {
        const haystack = `${employee.name || ""} ${employee.employeeId || ""}`.toLowerCase();
        if (!haystack.includes(keyword.toLowerCase())) return false;
      }
      return true;
    });
  }
  
    function getMonthAssignments(monthKey) {
    return leaveAssignments.filter((item) => item.monthKey === monthKey);
  }

  function getAssignmentForCell(monthKey, employeeId, dateString) {
    return leaveAssignments.find((item) => item.monthKey === monthKey && item.employeeId === employeeId && item.date === dateString) || null;
  }

    function isGoldBricksUser(user) {
    return user?.employeeId === "GoldBricks";
  }

     function canEditLeaveCell(targetEmployee, monthSetting) {
    const todayString = formatDate(new Date());
    const canEditInCurrentMonth = Boolean(monthSetting?.openStartDate && monthSetting?.openEndDate && todayString >= monthSetting.openStartDate && todayString <= monthSetting.openEndDate);
    const canEmployeeEdit = canEditInCurrentMonth && currentUser?.employeeId === targetEmployee.employeeId;
    const canGoldBricksEdit = isGoldBricksUser(currentUser);
    return canEmployeeEdit || canGoldBricksEdit;
  }

  function getCellSymbolMeta(symbolType) {
    return SYMBOL_TYPES[symbolType] || null;
  }

  function getEmployeeSummaryCounts(employeeId, monthKey) {
    return getMonthAssignments(monthKey).filter((item) => item.employeeId === employeeId).reduce((acc, item) => {
      if (["rest", "must_rest"].includes(item.symbolType)) acc.rest += 1;
      if (["new_year_rest", "new_year_must_rest"].includes(item.symbolType)) acc.newYear += 1;
      if (item.symbolType === "event") acc.event += 1;
      return acc;
    }, { rest: 0, newYear: 0, event: 0 });
  }

  
  function syncLeaveFilterOptions() {
    if (leaveRegionFilter) {
      leaveRegionFilter.innerHTML = `<option value="">全部地區</option>${REGIONS.map((region) => `<option value="${region}">${region}</option>`).join("")}`;
      leaveRegionFilter.value = selectedRegion;
    }
    if (leaveDepartmentFilter) {
      leaveDepartmentFilter.innerHTML = `<option value="">全部部門</option>${DEPARTMENTS.map((department) => `<option value="${department}">${department}</option>`).join("")}`;
      leaveDepartmentFilter.value = selectedDepartment;
    }
    if (!pendingSelectedEmployeeIds.length && !selectedEmployeeIds.length) pendingSelectedEmployeeIds = [];
  }

    function renderLeaveToolbar() {
    if (!leaveSymbolToolbar) return;
    leaveSymbolToolbar.innerHTML = SYMBOL_BUTTON_ORDER.map((type) => {
      const meta = SYMBOL_TYPES[type];
      const activeClass = activeSymbolType === type ? "active" : "";
      return `<button type="button" class="leave-symbol-btn ${activeClass} ${meta.color === "red" ? "symbol-red" : ""}" data-symbol-type="${type}" title="${meta.label}"><span>${meta.icon}</span><small>${meta.label}</small></button>`;
    }).join("");
    if (leaveEditHint) leaveEditHint.textContent = activeSymbolType ? `目前模式：${SYMBOL_LABELS[activeSymbolType]}，點同圖示可取消模式。` : "請先選擇圖示，再點擊可編輯的格子。";
  }

   function renderLeaveEmployeeFilterPanel() {
    if (!leaveEmployeeFilterList) return;
    const candidates = employees.filter((employee) => !employee.isHidden && employee.status !== "deleted");
    leaveEmployeeFilterList.innerHTML = candidates.map((employee) => {
      const checked = pendingSelectedEmployeeIds.includes(employee.employeeId) ? "checked" : "";
      return `<label class="leave-employee-option"><input type="checkbox" value="${employee.employeeId}" ${checked} /><span><strong>${employee.name || employee.employeeId}</strong><small>${employee.region || "-"}｜${employee.department || "-"}</small><small>${employee.category || getUserShiftType(employee) || "-"}</small></span></label>`;
    }).join("");
  }

  function renderLeaveBoard() {
    if (!leaveBoardTable) return;
    currentLeaveMonth = getMonthKey(calendarDate);
    const monthSetting = getMonthSetting(currentLeaveMonth);
    const monthDate = getCurrentLeaveMonthDate();
    const daysInMonth = getDaysInCurrentLeaveMonth();
    const visibleEmployees = getVisibleLeaveEmployees();
    if (calendarTitle) calendarTitle.textContent = `${monthDate.getFullYear()} 年 ${monthDate.getMonth() + 1} 月`;
    if (leaveMonthLabel) leaveMonthLabel.textContent = currentLeaveMonth;
    if (leaveOpenRange) leaveOpenRange.textContent = monthSetting?.openStartDate && monthSetting?.openEndDate ? `${monthSetting.openStartDate} ~ ${monthSetting.openEndDate}` : "尚未設定";
    if (leaveTotalRestDays) leaveTotalRestDays.textContent = monthSetting?.totalRestDays != null ? String(monthSetting.totalRestDays) : "-";
    syncLeaveFilterOptions();
    renderLeaveToolbar();
    renderLeaveEmployeeFilterPanel();

    if (!visibleEmployees.length) {
      leaveBoardTable.innerHTML = '<div class="list-item"><p>目前沒有符合篩選條件的人員。</p></div>';
      return;
    }

     const headerDays = Array.from({ length: daysInMonth }, (_, index) => {
      const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), index + 1);
      const dateString = formatDate(date);
      const isWeekend = [0, 6].includes(date.getDay());
      const isHoliday = HOLIDAY_DATES.has(dateString);
      return `<div class="leave-day-header ${isWeekend ? "isWeekend" : ""} ${isHoliday ? "isHoliday" : ""}"><span>${index + 1}</span><small>${["日", "一", "二", "三", "四", "五", "六"][date.getDay()]}</small></div>`;
    }).join("");

    const rows = visibleEmployees.map((employee) => {
      const canEditAny = canEditLeaveCell(employee, monthSetting);
      const counts = getEmployeeSummaryCounts(employee.employeeId, currentLeaveMonth);
      const cells = Array.from({ length: daysInMonth }, (_, index) => {
        const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), index + 1);
        const dateString = formatDate(date);
        const assignment = getAssignmentForCell(currentLeaveMonth, employee.employeeId, dateString);
        const meta = getCellSymbolMeta(assignment?.symbolType);
        const isWeekend = [0, 6].includes(date.getDay());
        const isHoliday = HOLIDAY_DATES.has(dateString);
        return `<button type="button" class="leave-cell ${canEditAny ? "editable" : "readonly"} ${isWeekend ? "isWeekend" : ""} ${isHoliday ? "isHoliday" : ""}" data-employee-id="${employee.employeeId}" data-date="${dateString}" title="${meta ? meta.label : dateString}">${meta ? `<span class="symbol ${meta.color === "red" ? "symbol-red" : ""}">${meta.icon}</span>` : ""}</button>`;
      }).join("");
      return `<div class="leave-board-row"><div class="leave-employee-card"><strong>${employee.name || employee.employeeId}</strong><small>${employee.region || "-"}｜${employee.department || "-"}</small><small>${employee.category || getUserShiftType(employee) || "-"}</small></div><div class="leave-row-cells" style="--days:${daysInMonth}">${cells}</div><div class="leave-summary-card"><div><span>▲</span><strong>${counts.rest}</strong></div><div><span>★</span><strong>${counts.newYear}</strong></div><div><span>🎰</span><strong>${counts.event}</strong></div></div></div>`;
    }).join("");

    leaveBoardTable.innerHTML = `<div class="leave-board-head"><div class="leave-sticky-col">人員</div><div class="leave-header-days" style="--days:${daysInMonth}">${headerDays}</div><div class="leave-summary-head"><div>▲</div><div>★</div><div>🎰</div></div></div>${rows}`;
  }

    async function toggleLeaveAssignment(employeeId, dateString) {
    const targetEmployee = employees.find((employee) => employee.employeeId === employeeId);
    const monthSetting = getMonthSetting(currentLeaveMonth);
    if (!targetEmployee) return;
    if (!activeSymbolType) return;
    if (!canEditLeaveCell(targetEmployee, monthSetting)) {
      alert("你只能在開放期間編輯自己的休假表，GoldBricks 可編輯所有人。");
      return;
    }
    const existing = getAssignmentForCell(currentLeaveMonth, employeeId, dateString);
    const sameSymbol = existing?.symbolType === activeSymbolType;
    if (!db) {
      if (existing && sameSymbol) leaveAssignments = leaveAssignments.filter((item) => item.id !== existing.id);
      else if (existing) leaveAssignments = leaveAssignments.map((item) => item.id === existing.id ? { ...item, symbolType: activeSymbolType, updatedBy: currentUser?.employeeId || "", updatedByName: currentUser?.name || "" } : item);
      else leaveAssignments = [{ id: `local-${Date.now()}`, employeeId, employeeName: targetEmployee.name, region: targetEmployee.region, department: targetEmployee.department, category: targetEmployee.category, date: dateString, monthKey: currentLeaveMonth, symbolType: activeSymbolType, createdBy: currentUser?.employeeId || "", createdByName: currentUser?.name || "", updatedBy: currentUser?.employeeId || "", updatedByName: currentUser?.name || "" }, ...leaveAssignments];
      renderLeaveBoard();
      return;
    }
    try {
      if (existing && sameSymbol) {
        await deleteDoc(doc(db, "leaveAssignments", existing.id));
      } else if (existing) {
        await updateDoc(doc(db, "leaveAssignments", existing.id), {
          symbolType: activeSymbolType,
          updatedBy: currentUser?.employeeId || "",
          updatedByName: currentUser?.name || "",
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, "leaveAssignments"), {
          employeeId,
          employeeName: targetEmployee.name || "",
          region: targetEmployee.region || "",
          department: targetEmployee.department || "",
          category: targetEmployee.category || "",
          date: dateString,
          monthKey: currentLeaveMonth,
          symbolType: activeSymbolType,
          createdBy: currentUser?.employeeId || "",
          createdByName: currentUser?.name || "",
          updatedBy: currentUser?.employeeId || "",
          updatedByName: currentUser?.name || "",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error("儲存休假表失敗", error);
      alert("儲存休假表失敗，請稍後再試。");
    }
  }

  function renderLeaveStats() {
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

  function setLoggedInUser(user) {
    currentUser = user;
    updateUserInfo(user);
    if (loginPage) loginPage.classList.add("hidden");
    if (mainPage) mainPage.classList.remove("hidden");
    persistCurrentUserSession(user);
    updateMenuPermissions(user);
    toggleEmployeeManagementUI();
    refreshAttendanceSettings();
    renderLeaves();
    renderLeaveBoard();
    renderCoordinates();
    initMessaging();
  }

  function restoreLogin() {
    const savedSessionRaw = localStorage.getItem(STORAGE_KEYS.currentUserSession);
    const savedEmployeeId = localStorage.getItem(STORAGE_KEYS.currentUser);

    let savedSession = {};
    if (savedSessionRaw) {
      try {
        savedSession = JSON.parse(savedSessionRaw) || {};
      } catch (error) {
        console.warn("解析登入快取失敗，改用舊版登入資訊", error);
      }
    }

    if (!savedSession.employeeId && savedEmployeeId) {
      savedSession.employeeId = savedEmployeeId;
    }

    const matchedUser = findUserBySession(savedSession);
    if (!matchedUser) return;
    
    if (currentUser?.id === matchedUser.id && currentUser?.employeeId === matchedUser.employeeId) {
      updateUserInfo(matchedUser);
      currentUser = matchedUser;
      return;
    }

    setLoggedInUser(matchedUser);
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async function (event) {
      event.preventDefault();

      const loginId = document.getElementById("employeeId")?.value.trim() || "";
      const password = document.getElementById("password")?.value.trim() || "";

      if (!loginId || !password) {
        if (loginError) loginError.textContent = "請輸入員工編號與密碼";
        return;
      }

      let matchedUser = findLoginUser(loginId, password);

      if (!matchedUser && !hasLoadedEmployees) {
        setLoginLoadingState(true, "正在同步帳號資料，請稍候...");
        await waitForEmployeesReady();
        matchedUser = findLoginUser(loginId, password);
      }

      if (!matchedUser) {
        setLoginLoadingState(false, "員工編號或密碼錯誤")
        return;
      }

      setLoginLoadingState(false, "");
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
      localStorage.removeItem(STORAGE_KEYS.currentUserSession);
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
        await addDoc(collection(db, "announcements"), {
          title,
          content,
          author: currentUser ? currentUser.name : "未知使用者",
          authorId: currentUser?.employeeId || "",
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
      if (!isAdmin(currentUser)) return alert("非管理員只能查看員工資料");
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
        photoURL: photoData,
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
        isHidden: false,
        fcmToken: editingEmployeeId ? (employees.find((item) => item.id === editingEmployeeId)?.fcmToken || "") : "",
        notificationSettings: getDefaultNotificationSettings(
          editingEmployeeId
            ? employees.find((item) => item.id === editingEmployeeId)?.notificationSettings || {}
            : {}
        )
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
        setPhoto("");
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
  
  if (photoFile) {
    photoFile.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => setPhoto(String(reader.result || ""));
      reader.readAsDataURL(file);
    });
  }

  if (photoZone) {
    photoZone.addEventListener("paste", (e) => {
      const items = e.clipboardData?.items || [];
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (!file) continue;
          const reader = new FileReader();
          reader.onload = () => setPhoto(String(reader.result || ""));
          reader.readAsDataURL(file);
          e.preventDefault();
          break;
        }
      }
    });
  }
  
  if (employeeIdField) {
    employeeIdField.addEventListener("input", updateSuperAdminFormState);
  }
  
  window.editEmployee = function (id) {
    if (!isAdmin(currentUser)) return;
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
    setPhoto(employee.photoURL || "");   
    
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
  setPhoto("");

  window.deleteEmployee = async function (id) {
    if (!isAdmin(currentUser)) return;
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

  if (shiftScopeSelect) shiftScopeSelect.addEventListener("change", function () { refreshShiftEmployeeOptions(); syncShiftForm(); });
  if (shiftRegionSelect) shiftRegionSelect.addEventListener("change", function () { refreshShiftEmployeeOptions(); syncShiftForm(); });
  if (shiftDepartmentSelect) shiftDepartmentSelect.addEventListener("change", function () { refreshShiftEmployeeOptions(); syncShiftForm(); });
  if (shiftEmployeeSelect) shiftEmployeeSelect.addEventListener("change", syncShiftForm);

  if (shiftSettingsForm) {
    shiftSettingsForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      const selectedCode = shiftCodeSelect?.value || "";
      const scope = shiftScopeSelect?.value || "template";
      const region = shiftRegionSelect?.value || "";
      const department = shiftDepartmentSelect?.value || "";
      const employeeId = shiftEmployeeSelect?.value || "";
      const employee = employees.find((item) => item.employeeId === employeeId);
      const payload = {
        shiftType: selectedCode,
        name: shiftNameInput?.value.trim() || getShiftNameFromCode(selectedCode),
        region,
        department,
        employeeId,
        employeeName: employee?.name || "",
        startTime: shiftStartTimeInput?.value || "",
        endTime: shiftEndTimeInput?.value || "",
        reminderTime: shiftReminderTimeInput?.value || "",
        graceMinutes: Number(shiftGraceMinutesInput?.value || 0),
        isActive: shiftIsActiveInput?.checked ?? true,
        updatedAt: serverTimestamp()
      };
      if (!payload.name || !payload.startTime || !payload.endTime || !payload.reminderTime) return alert("請填寫完整班別資訊");
      if (!region || !department) return alert("請選擇地區與部門");
      if (scope === "employee" && !employeeId) return alert("請選擇員工");
      try {
        const targetCollection = scope === "employee" ? "employeeShiftSettings" : "shiftTemplates";
        const existing = scope === "employee" ? getEmployeeShiftOverride(employeeId, selectedCode) : getTemplateShift(region, department, selectedCode);
        if (!db) {
          const localItem = { id: existing?.id || `${targetCollection}-${Date.now()}`, ...payload };
          if (scope === "employee") employeeShiftSettings = existing ? employeeShiftSettings.map((item) => item.id === existing.id ? localItem : item) : [localItem, ...employeeShiftSettings];
          else shiftTemplates = existing ? shiftTemplates.map((item) => item.id === existing.id ? localItem : item) : [localItem, ...shiftTemplates];
          refreshShiftSettingViews();
          refreshAttendanceSettings();
          return;
        }
        if (existing?.id) await updateDoc(doc(db, targetCollection, existing.id), payload);
        else await addDoc(collection(db, targetCollection), { ...payload, createdAt: serverTimestamp(), isDefault: scope === "template" });
      } catch (error) {
        console.error("儲存班別設定失敗", error);
        alert("儲存班別設定失敗");
      }
    });
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

  if (attendanceSummaryList) {
    attendanceSummaryList.addEventListener("toggle", function (event) {
      const detail = event.target;
      if (!(detail instanceof HTMLDetailsElement) || !detail.open) return;
      const mapContainer = detail.querySelector(".attendance-map[data-map-id]");
      if (mapContainer) renderAttendanceDetailMap(mapContainer);
    }, true);
  }

   if (leaveSymbolToolbar) {
    leaveSymbolToolbar.addEventListener("click", function (event) {
      const button = event.target.closest("[data-symbol-type]");
      if (!button) return;
      const clickedType = button.dataset.symbolType || "";
      activeSymbolType = activeSymbolType === clickedType ? "" : clickedType;
      renderLeaveToolbar();
    });
  }

    if (leaveBoardTable) {
    leaveBoardTable.addEventListener("click", function (event) {
      const cell = event.target.closest(".leave-cell[data-employee-id][data-date]");
      if (!cell) return;
      toggleLeaveAssignment(cell.dataset.employeeId || "", cell.dataset.date || "");
    });
  }
 
 if (leaveRegionFilter) leaveRegionFilter.addEventListener("change", function () { selectedRegion = leaveRegionFilter.value || ""; renderLeaveBoard(); });
  if (leaveDepartmentFilter) leaveDepartmentFilter.addEventListener("change", function () { selectedDepartment = leaveDepartmentFilter.value || ""; renderLeaveBoard(); });
  if (leaveShiftFilter) leaveShiftFilter.addEventListener("change", function () { selectedShiftType = leaveShiftFilter.value || ""; renderLeaveBoard(); });
  if (leaveEmployeeSearch) leaveEmployeeSearch.addEventListener("input", renderLeaveBoard);
  if (leaveEmployeeFilterList) {
    leaveEmployeeFilterList.addEventListener("change", function () {
      pendingSelectedEmployeeIds = Array.from(leaveEmployeeFilterList.querySelectorAll('input[type="checkbox"]:checked')).map((input) => input.value);
    });
  }
  if (leaveEmployeeApplyBtn) leaveEmployeeApplyBtn.addEventListener("click", function () { selectedEmployeeIds = [...pendingSelectedEmployeeIds]; renderLeaveBoard(); });
  if (leaveEmployeeCancelBtn) leaveEmployeeCancelBtn.addEventListener("click", function () { selectedEmployeeIds = []; pendingSelectedEmployeeIds = []; renderLeaveBoard(); });
  if (prevMonthBtn) prevMonthBtn.addEventListener("click", function () { calendarDate.setMonth(calendarDate.getMonth() - 1); renderLeaveBoard(); });
  if (nextMonthBtn) nextMonthBtn.addEventListener("click", function () { calendarDate.setMonth(calendarDate.getMonth() + 1); renderLeaveBoard(); });
    
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
  setLoginLoadingState(false, "");
  startEmployeesListener();

  renderLeaves();
  renderLeaveBoard();

  startAnnouncementsListener();
  startLeaveListener();
  startLeaveMonthSettingsListener();
  startLeaveAssignmentsListener();
  startAttendanceLocationsListener();
  startShiftSettingsListener();
  refreshAttendanceSettings();
  startAttendanceRecordsListener();
  renderAttendanceRecords();
});
