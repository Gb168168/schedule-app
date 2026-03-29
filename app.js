import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getMessaging, isSupported as isMessagingSupported, getToken, onMessage } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging.js";
import {
  getFirestore,
  collection,
  addDoc,
  setDoc,
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
const LEAVE_TYPE_GROUPS = [
  { label: "一般假", options: ["事假", "病假", "公假", "年假", "特休"] },
  { label: "特殊假", options: ["婚假", "產假", "生理", "喪假", "公傷"] },
  { label: "補/調假", options: ["補(天)", "補(時)", "調班"] },
  { label: "旅遊假", options: ["旅遊", "旅(例)"] }
];
const LEAVE_TYPE_COLORS = {
  事假: "#60a5fa",
  病假: "#f87171",
  公假: "#34d399",
  年假: "#818cf8",
  特休: "#6366f1",
  婚假: "#f472b6",
  產假: "#ec4899",
  生理: "#fb7185",
  喪假: "#6b7280",
  公傷: "#f97316",
  "補(天)": "#22c55e",
  "補(時)": "#16a34a",
  調班: "#84cc16",
  旅遊: "#eab308",
  "旅(例)": "#facc15"
};
const LOCATION_CATEGORIES = {
  office: "區域固定點",
  customer: "工作店家"
};
const ATTENDANCE_TIMEZONE = "Asia/Shanghai";

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
    annualLeaveExpiry: "",
    travelLeaveDays: 0,
    travelLeaveExpiry: "",
    shifts: { morning: true, evening: true },
    weekendsOff: false,
    permissions: {
     employeeProfileManage: true,
      attendanceCoordinateManage: true,
      shiftSettingsManage: true,
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
const LEAVE_EXCLUDED_SYMBOL_TYPES = new Set(["rest", "must_rest", "new_year_rest", "new_year_must_rest", "event"]);
const NEW_YEAR_SYMBOL_TYPES = new Set(["new_year_rest", "new_year_must_rest"]);
const FIXED_HOLIDAY_RULES = [
  { monthDay: "01-01", name: "元旦" },
  { monthDay: "02-28", name: "和平紀念日" },
  { monthDay: "04-04", name: "兒童節" },
  { monthDay: "04-05", name: "清明節" },
  { monthDay: "05-01", name: "勞動節" },
  { monthDay: "10-10", name: "國慶日" }
];
const SPECIAL_HOLIDAY_RANGES = [
  { name: "春節連假", startDate: "2026-02-14", endDate: "2026-02-22" },
  { name: "228 和平紀念日", startDate: "2026-02-27", endDate: "2026-03-01" },
  { name: "清明連假", startDate: "2026-04-03", endDate: "2026-04-06" },
  { name: "勞動節", startDate: "2026-05-01", endDate: "2026-05-03" },
  { name: "端午節", startDate: "2026-06-19", endDate: "2026-06-21" },
  { name: "中秋節 + 教師節", startDate: "2026-09-25", endDate: "2026-09-28" },
  { name: "國慶日", startDate: "2026-10-09", endDate: "2026-10-11" },
  { name: "台灣光復節", startDate: "2026-10-24", endDate: "2026-10-26" },
  { name: "行憲紀念日", startDate: "2026-12-25", endDate: "2026-12-27" }
];
const HOLIDAY_NAME_BY_DATE = new Map();
const HOLIDAY_DATES = new Set();
const LUNAR_NEW_YEAR_DATES = new Set();

const STORAGE_KEYS = {
  currentUser: "shift_current_user",
  currentUserSession: "shift_current_user_session"
};

function safeStorageGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    console.warn("讀取登入快取失敗", error);
    return null;
  }
}

function safeStorageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn("寫入登入快取失敗", error);
    return false;
  }
}

function safeStorageRemove(key) {
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.warn("清除登入快取失敗", error);
    return false;
  }
}

let currentUser = null;
let editingAnnouncementId = null;
let calendarDate = new Date();
let rosterCalendarDate = new Date();
let selectedScheduleDate = "";
let editingScheduleId = null;
let editingEmployeeId = null;
let editingPermissionEmployeeId = null;
let announcements = [];
let leaveRequests = [];
let schedules = [];
let currentLeaveMonth = `${calendarDate.getFullYear()}-${String(calendarDate.getMonth() + 1).padStart(2, "0")}`;
let activeSymbolType = "";
let selectedEmployeeIds = [];
let pendingSelectedEmployeeIds = [];
let isLeaveEmployeeFilterOpen = false;
let selectedRegion = "";
let selectedDepartment = "";
let selectedShiftType = "";
let pendingSelectedRegion = "";
let pendingSelectedDepartment = "";
let pendingSelectedShiftType = "";
let leaveMonthSettings = [];
let leaveAssignments = [];
let employees = users.map((user, index) => ({
  id: `builtin-${index}`,
  status: "active",
  isHidden: false,
  ...user,
  permissions: normalizeEmployeePermissions(user.permissions || {})
}));
let isBootstrappingEmployees = false;
let hasLoadedEmployees = false;
let resolveEmployeesReady = null;
const employeesReadyPromise = new Promise(function (resolve) {
  resolveEmployeesReady = resolve;
});
let attendanceLocations = DEFAULT_ATTENDANCE_LOCATIONS.map((item, index) => ({
  id: `default-${index}`,
  ...item
}));
let attendanceRecords = [];
let shiftSettings = DEFAULT_SHIFT_SETTINGS.map((item) => ({
  ...item
}));
let shiftTemplates = [];
let employeeShiftSettings = [];
let deletedDefaultShiftTemplateKeys = new Set();
let editingShiftRule = null;
let editingCoordinateId = null;
let lastAttendanceAttempt = null;
let attendanceDetailMaps = {};
let messagingServiceWorkerRegistration = null;
let leaveTypePickerState = null;

const ALL_LEAVE_TYPES = LEAVE_TYPE_GROUPS.flatMap((group) => group.options);

function initHolidayCalendar(startYear = 2020, endYear = 2035) {
  HOLIDAY_NAME_BY_DATE.clear();
  HOLIDAY_DATES.clear();
  LUNAR_NEW_YEAR_DATES.clear();
  for (let year = startYear; year <= endYear; year += 1) {
    FIXED_HOLIDAY_RULES.forEach(function (holidayRule) {
      const dateKey = `${year}-${holidayRule.monthDay}`;
      HOLIDAY_NAME_BY_DATE.set(dateKey, holidayRule.name);
      HOLIDAY_DATES.add(dateKey);
    });
  }
  
  SPECIAL_HOLIDAY_RANGES.forEach(function (holidayRange) {
    const start = new Date(`${holidayRange.startDate}T00:00:00`);
    const end = new Date(`${holidayRange.endDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return;
    const isLunarNewYearRange = String(holidayRange.name || "").includes("春節");

    for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
      const dateKey = formatDate(cursor);
      HOLIDAY_NAME_BY_DATE.set(dateKey, holidayRange.name);
      HOLIDAY_DATES.add(dateKey);
      if (isLunarNewYearRange) LUNAR_NEW_YEAR_DATES.add(dateKey);
    }
  });
}

function getHolidayName(dateString) {
  return HOLIDAY_NAME_BY_DATE.get(String(dateString || "").trim()) || "";
}

function isLunarNewYearDate(dateString) {
  return LUNAR_NEW_YEAR_DATES.has(String(dateString || "").trim());
}

function getAllowedSymbolTypesForDate(dateString) {
  return SYMBOL_BUTTON_ORDER.filter((type) => !NEW_YEAR_SYMBOL_TYPES.has(type) || isLunarNewYearDate(dateString));
}

function getAllowedSymbolTypesForMonth(monthKey) {
  const hasLunarNewYearDate = Array.from(LUNAR_NEW_YEAR_DATES).some((dateString) => dateString.startsWith(`${monthKey}-`));
  if (hasLunarNewYearDate) return [...SYMBOL_BUTTON_ORDER];
  return SYMBOL_BUTTON_ORDER.filter((type) => !NEW_YEAR_SYMBOL_TYPES.has(type));
}

initHolidayCalendar();

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

function isGoldBricksUser(user) {
  return String(user?.employeeId || "").trim() === "GoldBricks";
}

function canManageAllSchedules(user) {
  return isAdmin(user) || isGoldBricksUser(user);
}

function canViewShiftAndAttendance(user) {
  return Boolean(
    isGoldBricksUser(user) ||
    user?.permissions?.admin ||
    user?.permissions?.attendanceCoordinateManage ||
    user?.permissions?.attendanceListVisible ||
    user?.permissions?.coordinateListVisible
  );
}

function canViewTodayAttendanceStaff(user) {
  return isAdmin(user);
}

function canManageAnnouncements(user) {
  return Boolean(isGoldBricksUser(user) || user?.permissions?.admin || user?.permissions?.announcementManage);
}

function canManageCoordinates(user) {
  return Boolean(
    isGoldBricksUser(user) ||
    user?.permissions?.admin ||
    user?.permissions?.coordinateAdmin ||
    user?.permissions?.attendanceCoordinateManage ||
    user?.permissions?.coordinateListVisible
  );
}

function canManageEmployees(user) {
  return Boolean(
    isGoldBricksUser(user) ||
    user?.permissions?.admin ||
    user?.permissions?.employeeProfileManage
  );
}

function canManageShiftSettings(user) {
  return Boolean(
    isGoldBricksUser(user) ||
    user?.permissions?.admin ||
    user?.permissions?.shiftSettingsManage ||
    user?.permissions?.shiftSettingsListVisible
  );
}

function normalizeEmployeePermissions(permissions = {}) {
  return {
    ...permissions,
    employeeProfileManage: Boolean(permissions.employeeProfileManage || permissions.personInfoBasicDataManage),
    shiftSettingsManage: Boolean(permissions.shiftSettingsManage || permissions.shiftSettingsListVisible),
    attendanceCoordinateManage: Boolean(permissions.attendanceCoordinateManage || permissions.coordinateListVisible || permissions.attendanceListVisible),
    coordinateAdmin: Boolean(permissions.coordinateAdmin || permissions.attendanceCoordinateManage || permissions.coordinateListVisible),
    leaveApprove: Boolean(permissions.leaveApprove),
    announcementManage: Boolean(permissions.announcementManage),
    permissionsListVisible: Boolean(permissions.permissionsListVisible),
    shiftSettingsListVisible: Boolean(permissions.shiftSettingsListVisible || permissions.shiftSettingsManage),
    attendanceListVisible: Boolean(permissions.attendanceListVisible || permissions.attendanceCoordinateManage),
    coordinateListVisible: Boolean(permissions.coordinateListVisible || permissions.attendanceCoordinateManage),
    personInfoBasicDataManage: Boolean(permissions.personInfoBasicDataManage || permissions.employeeProfileManage)
  };
}

function canApproveLeaveInScope(user, leaveItem = null) {
  if (!user) return false;
  if (isGoldBricksUser(user) || user?.permissions?.admin) return true;
  if (!user?.permissions?.leaveApprove) return false;
  if (!leaveItem) return true;
  const regions = Array.isArray(user?.manageScopes?.regions) ? user.manageScopes.regions : [];
  const departments = Array.isArray(user?.manageScopes?.departments) ? user.manageScopes.departments : [];
  return regions.includes(leaveItem.region || "") && departments.includes(leaveItem.department || "");
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
    .replace(/　/g, " ")
    .toLowerCase();
}

function getUserPasswordCandidates(user) {
  const explicitPassword = normalizePasswordValue(user?.password);
  if (explicitPassword) return [explicitPassword];

  const fallbackCandidates = [user?.employeeId, user?.account, user?.id]
    .map(normalizePasswordValue)
    .filter(Boolean);

  return Array.from(new Set(fallbackCandidates));
}

function isPasswordMatched(user, normalizedPassword) {
  if (!user || !normalizedPassword) return false;
  return getUserPasswordCandidates(user).includes(normalizedPassword);
}

function isLoginEligible(user) {
  return Boolean(user) && !user.isHidden && user.status !== "deleted";
}

function getLoginIdentifiers(user) {
  return [user?.employeeId, user?.account, user?.id, user?.email]
    .map(normalizeLoginValue)
    .filter(Boolean);
}

function getEmployeeMergeKeys(user) {
  const uniqueKeys = new Set(
    [user?.employeeId, user?.account, user?.id]
      .map(normalizeLoginValue)
      .filter(Boolean)
  );
  return Array.from(uniqueKeys);
}

function findLoginUser(employeeId, password) {
  const normalizedEmployeeId = normalizeLoginValue(employeeId);
  const normalizedPassword = normalizePasswordValue(password);

  if (!normalizedEmployeeId || !normalizedPassword) return null;

  const matchedEmployee = employees.find(function (user) {
    if (!isLoginEligible(user)) return false;

    return (
      getLoginIdentifiers(user).includes(normalizedEmployeeId) &&
      isPasswordMatched(user, normalizedPassword)
    );
  });

  if (matchedEmployee) return matchedEmployee;

  const builtinMatchedUser = users.find(function (user) {
    return (
      getLoginIdentifiers(user).includes(normalizedEmployeeId) &&
      isPasswordMatched(user, normalizedPassword)
    );
  });

  return builtinMatchedUser
    ? {
        id: `builtin-fallback-${builtinMatchedUser.employeeId}`,
        status: "active",
        isHidden: false,
        ...builtinMatchedUser
      }
    : null;
}

function getLoginFailureMessage(employeeId, password) {
  const normalizedEmployeeId = normalizeLoginValue(employeeId);
  const normalizedPassword = normalizePasswordValue(password);

  if (!normalizedEmployeeId || !normalizedPassword) {
    return "請輸入帳號與密碼。";
  }

  const normalizedUsers = Array.from(new Set([...employees, ...users]));
  const matchedByIdentifier = normalizedUsers.find(function (user) {
    return getLoginIdentifiers(user).includes(normalizedEmployeeId);
  });

  if (!matchedByIdentifier) {
    return "找不到此帳號，請確認 employeeId / account / email 是否輸入正確。";
  }

  if (!isLoginEligible(matchedByIdentifier)) {
    return "此帳號已停用（隱藏或刪除），請聯絡管理員。";
  }

  if (!isPasswordMatched(matchedByIdentifier, normalizedPassword)) {
    return "密碼錯誤。若員工尚未設定密碼，可改用員工編號或 account 登入。";
  }

  return "員工編號或密碼錯誤。";
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
  safeStorageSet(STORAGE_KEYS.currentUser, session.employeeId);
  safeStorageSet(STORAGE_KEYS.currentUserSession, JSON.stringify(session));
}

function clearCurrentUserSessionCache() {
  safeStorageRemove(STORAGE_KEYS.currentUser);
  safeStorageRemove(STORAGE_KEYS.currentUserSession);
}

function findUserBySession(session = {}) {
  const identifiers = [session.employeeId, session.account, session.id]
    .map(normalizeLoginValue)
    .filter(Boolean);

  if (identifiers.length === 0) return null;

  return employees.find(function (user) {
    if (!isLoginEligible(user)) return false;
    const userIdentifiers = [user?.employeeId, user?.account, user?.id]
      .map(normalizeLoginValue)
      .filter(Boolean);

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

async function waitForEmployeesReady(timeoutMs = 10000) {
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
  if (employee.permissions?.employeeProfileManage) tags.push("可建置員工資料");
  if (employee.permissions?.attendanceListVisible) tags.push("打卡紀錄");
  if (employee.permissions?.coordinateListVisible) tags.push("打卡座標");
  if (employee.permissions?.shiftSettingsListVisible) tags.push("班別設定")
  if (employee.permissions?.permissionsListVisible) tags.push("權限功能");
  if (employee.permissions?.leaveApprove) tags.push("可審核請假");
  if (employee.permissions?.announcementManage) tags.push("公告管理");
  return tags.length > 0 ? tags.join("、") : "一般員工";
}

function isSuperAdminEmployee(employeeId) {
  return employeeId === "GoldBricks";
}

function getEmployeeRoleProfile(employeeId = "") {
  const isSuperAdmin = isSuperAdminEmployee(employeeId);
  return {
    shifts: {
      morning: isSuperAdmin ? false : true,
      evening: false
    },
    weekendsOff: false,
    showOnLeaveBoard: true,
    permissions: {
      admin: isSuperAdmin,
      employeeProfileManage: isSuperAdmin,
      personInfoBasicDataManage: isSuperAdmin,
      attendanceCoordinateManage: isSuperAdmin,
      attendanceListVisible: isSuperAdmin,
      coordinateListVisible: isSuperAdmin,
      shiftSettingsManage: isSuperAdmin,
      shiftSettingsListVisible: isSuperAdmin,
      permissionsListVisible: isSuperAdmin,
      leaveApprove: isSuperAdmin,
      announcementManage: isSuperAdmin,
      coordinateAdmin: isSuperAdmin
    },
    manageScopes: isSuperAdmin
      ? {
          regions: ["新竹區", "台中區", "嘉義區"],
          departments: ["管理部", "TSE", "FAE", "新場", "倉管", "RD", "線上客服"]
        }
      : { regions: [], departments: [] }
  };
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
      ...user,
      permissions: normalizeEmployeePermissions(user.permissions || {})
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

function getRegionOrder(regionName) {
  const index = REGIONS.indexOf(regionName);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function compareRegionsNorthToSouth(a, b) {
  return getRegionOrder(a) - getRegionOrder(b);
}

function getDepartmentOrder(departmentName) {
  const index = DEPARTMENTS.indexOf(departmentName);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function compareDepartmentsForTodayStaff(a, b, region = "") {
  if (region !== "台中區") return String(a || "").localeCompare(String(b || ""), "zh-Hant");

  const orderDiff = getDepartmentOrder(a) - getDepartmentOrder(b);
  if (orderDiff !== 0) return orderDiff;
  return String(a || "").localeCompare(String(b || ""), "zh-Hant");
}

function sortEmployeesForDisplay(employeeList = []) {
  return [...employeeList].sort(function (a, b) {
    return getComparableTimestampValue(a.createdAt) - getComparableTimestampValue(b.createdAt);
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

       let hasCompleted = false;
    const tryLocate = function (options, onFailure) {
      navigator.geolocation.getCurrentPosition(
        function (position) {
          if (hasCompleted) return;
          hasCompleted = true;
          resolve(position);
        },
        function (error) {
          if (hasCompleted) return;
          onFailure(error);
        },
        options
      );
    };

    const toGeolocationErrorMessage = function (error) {
      const code = Number(error?.code);
      if (code === 1) {
        return "定位權限被拒絕，請到手機瀏覽器設定允許定位後再試。";
      }
      if (code === 2) {
        return "無法取得定位資訊，請確認 GPS / 網路定位已開啟。";
      }
      if (code === 3) {
        return "定位逾時，請移動到訊號較佳位置後再試。";
      }
      return error?.message || "定位失敗，請稍後再試。";
    };

    tryLocate(
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0
      },
      function (firstError) {
        tryLocate(
          {
            enableHighAccuracy: false,
            timeout: 15000,
            maximumAge: 120000
          },
          function (secondError) {
            const finalError = secondError || firstError;
            reject(new Error(toGeolocationErrorMessage(finalError)));
          }
        );
      }
    );
  });
}

document.addEventListener("DOMContentLoaded", function () {
   // 優先載入內建帳號，避免遠端資料未就緒時卡住登入流程
  employees = getBuiltinEmployees();
  markEmployeesReady();

  const loginPage = document.getElementById("login-page");
  const mainPage = document.getElementById("main-page");
  const loginForm = document.getElementById("login-form");
  const loginError = document.getElementById("login-error");
  const loginSystemWarning = document.getElementById("login-system-warning");
  const loginClearCacheBtn = document.getElementById("login-clear-cache-btn");
  const logoutBtn = document.getElementById("logout-btn");
  const changePasswordBtn = document.getElementById("change-password-btn");
  const changePasswordBackdrop = document.getElementById("change-password-backdrop");
  const changePasswordForm = document.getElementById("change-password-form");
  const changePasswordCurrentInput = document.getElementById("change-password-current");
  const changePasswordNewInput = document.getElementById("change-password-new");
  const changePasswordConfirmInput = document.getElementById("change-password-confirm");
  const changePasswordError = document.getElementById("change-password-error");
  const changePasswordCloseBtn = document.getElementById("change-password-close");
  const changePasswordCancelBtn = document.getElementById("change-password-cancel");

   if (!firebaseApp && loginSystemWarning) {
    loginSystemWarning.textContent = "目前未設定 Firebase（window.__FIREBASE_CONFIG__），僅能使用內建測試帳號登入。";
    loginSystemWarning.classList.remove("hidden");
  }

  const currentUserName = document.getElementById("current-user-name");
  const shiftInfo = document.getElementById("today-shift-info");

  const attendanceStatusBadge = document.getElementById("attendance-status-badge");
  const attendanceSettingsSummary = document.getElementById("attendance-settings-summary");
  const attendanceResult = document.getElementById("attendance-result");
  const clockInBtn = document.getElementById("clock-in-btn");
  const clockOutBtn = document.getElementById("clock-out-btn");
  const attendanceFilterName = document.getElementById("attendance-filter-name");
  const attendanceFilterDate = document.getElementById("attendance-filter-date");
  const attendanceFilterBtn = document.getElementById("attendance-filter-btn");
  const attendanceFilterResetBtn = document.getElementById("attendance-filter-reset-btn");
  const attendanceSummaryList = document.getElementById("attendance-summary-list");
  const todayAttendanceStaffList = document.getElementById("today-attendance-staff-list");
  const todayWorkingStaffList = document.getElementById("today-working-staff-list");
  const attendanceRecordPopoverBackdrop = document.getElementById("attendance-record-popover-backdrop");
  const attendanceRecordPopoverTitle = document.getElementById("attendance-record-popover-title");
  const attendanceRecordPopoverContent = document.getElementById("attendance-record-popover-content");
  const attendanceRecordPopoverClose = document.getElementById("attendance-record-popover-close");
  const homeTodayAttendanceCard = document.getElementById("home-today-attendance-card");
  
  const employeeForm = document.getElementById("employee-form");
  const employeeFormCard = document.getElementById("employee-form-card");
  const employeeList = document.getElementById("employee-list");
  const permissionsEmployeeList = document.getElementById("permissions-employee-list");
  const employeeDepartmentSelect = document.getElementById("employee-form-department");
  const employeeRegionSelect = document.getElementById("employee-form-region");
  const manageRegions = document.getElementById("manage-regions");
  const manageDepartments = document.getElementById("manage-departments");
  const leaveApproveScopeBox = document.getElementById("leave-approve-scope-box");
  const permissionEmployeeManageInput = document.getElementById("permission-employee-manage");
  const permissionAttendanceCoordinateInput = document.getElementById("permission-attendance-coordinate");
  const permissionShiftSettingsInput = document.getElementById("permission-shift-settings");
  const permissionLeaveApproveInput = document.getElementById("permission-leave-approve");
  const permissionAnnouncementManageInput = document.getElementById("permission-announcement-manage");
  const employeeShiftMorningInput = document.getElementById("employee-shift-morning");
  const employeeShiftEveningInput = document.getElementById("employee-shift-evening");
  const employeeWeekendsOffInput = document.getElementById("employee-weekends-off");
  const employeeShowOnLeaveBoardInput = document.getElementById("employee-show-on-leave-board");
  const employeeSubmitBtn = document.getElementById("employee-submit-btn");
  const permissionEditorBackdrop = document.getElementById("permission-editor-backdrop");
  const permissionEditorForm = document.getElementById("permission-editor-form");
  const permissionEditorCloseBtn = document.getElementById("permission-editor-close-btn");
  const permissionEditorTarget = document.getElementById("permission-editor-target");
  const permAnnouncementManageInput = document.getElementById("perm-announcement-manage");
  const permShiftMorningInput = document.getElementById("perm-shift-morning");
  const permShiftEveningInput = document.getElementById("perm-shift-evening");
  const permWeekendsOffInput = document.getElementById("perm-weekends-off");
  const permShowOnLeaveBoardInput = document.getElementById("perm-show-on-leave-board");
  const permEmployeeProfileManageInput = document.getElementById("perm-employee-profile-manage");
  const permPermissionsListVisibleInput = document.getElementById("perm-permissions-list-visible");
  const permShiftSettingsListVisibleInput = document.getElementById("perm-shift-settings-list-visible");
  const permLeaveApproveInput = document.getElementById("perm-leave-approve");
  const permAttendanceListVisibleInput = document.getElementById("perm-attendance-list-visible");
  const permCoordinateListVisibleInput = document.getElementById("perm-coordinate-list-visible");
  const permManageRegions = document.getElementById("perm-manage-regions");
  const permManageDepartments = document.getElementById("perm-manage-departments");
  const permissionLeaveApproveScopeBox = document.getElementById("permission-leave-approve-scope-box");
  const employeeIdField = document.getElementById("employee-form-id");
  let photoData = "";
  const photoZone = document.getElementById("photo-zone");
  const photoFile = document.getElementById("photo-file");
  const photoPreview = document.getElementById("photo-preview");
  
  const coordinateMenuBtn = document.getElementById("menu-coordinate-btn");
  const permissionsMenuBtn = document.getElementById("menu-permissions-btn");
  const shiftSettingsMenuBtn = document.getElementById("menu-shift-settings-btn");
  const attendanceMenuBtn = document.getElementById("menu-attendance-btn");
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
  const shiftRulesResetBtn = document.getElementById("shift-rules-reset-btn");
  
  const pageTitle = document.getElementById("page-title");
  const menuButtons = document.querySelectorAll(".menu-btn");
  const pageSections = document.querySelectorAll(".page-section");
  const sidebarToggleBtn = document.getElementById("sidebar-toggle-btn");

  const announcementForm = document.getElementById("announcement-form");
  const announcementTitle = document.getElementById("announcement-title");
  const announcementContent = document.getElementById("announcement-content");
  const announcementList = document.getElementById("announcement-list");
  const announcementEditBox = document.getElementById("announcement-edit-box");
  const announcementEditForm = document.getElementById("announcement-edit-form");
  const announcementEditTitle = document.getElementById("announcement-edit-title");
  const announcementEditContent = document.getElementById("announcement-edit-content");
  const announcementCancelEdit = document.getElementById("announcement-cancel-edit");
  const rosterForm = document.getElementById("roster-form");
  const rosterDate = document.getElementById("roster-date");
  const rosterShift = document.getElementById("roster-shift");
  const rosterNote = document.getElementById("roster-note");
  const rosterList = document.getElementById("roster-list");
  const rosterCalendarTitle = document.getElementById("roster-calendar-title");
  const rosterPrevMonthBtn = document.getElementById("roster-prev-month");
  const rosterNextMonthBtn = document.getElementById("roster-next-month");
  const openScheduleCreateBtn = document.getElementById("open-schedule-create-btn");
  const filterRegion = document.getElementById("filter-region");
  const filterDepartment = document.getElementById("filter-department");
  const filterEmployee = document.getElementById("filter-employee");
  const filterShift = document.getElementById("filter-shift");
  const calendarGrid = document.getElementById("calendar-grid");
  const scheduleModalBackdrop = document.getElementById("schedule-modal-backdrop");
  const scheduleModalTitle = document.getElementById("schedule-modal-title");
  const scheduleModalClose = document.getElementById("schedule-modal-close");
  const scheduleDateLabel = document.getElementById("schedule-date-label");
  const scheduleTitleInput = document.getElementById("schedule-title");
  const scheduleContentInput = document.getElementById("schedule-content");
  const scheduleRegionSelect = document.getElementById("schedule-region");
  const scheduleDepartmentSelect = document.getElementById("schedule-department");
  const scheduleEmployeeSelect = document.getElementById("schedule-employee");
  const scheduleShiftSelect = document.getElementById("schedule-shift");
  const saveScheduleBtn = document.getElementById("save-schedule");
  const scheduleDetailBackdrop = document.getElementById("schedule-detail-backdrop");
  const scheduleDetailTitle = document.getElementById("schedule-detail-title");
  const scheduleDetailBody = document.getElementById("schedule-detail-body");
  const scheduleDetailClose = document.getElementById("schedule-detail-close");
  const scheduleDetailAddBtn = document.getElementById("schedule-detail-add-btn");

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
  const leaveOpenRange = document.getElementById("leave-open-range");
  const leaveTotalRestDays = document.getElementById("leave-total-rest-days");
  const leaveOpenRangeCard = document.getElementById("leave-open-range-card");
  const leaveTotalRestCard = document.getElementById("leave-total-rest-card");
  const leaveOpenRangeEditBtn = document.getElementById("leave-open-range-edit-btn");
  const leaveTotalRestEditBtn = document.getElementById("leave-total-rest-edit-btn");
  const leaveOpenRangeEditor = document.getElementById("leave-open-range-editor");
  const leaveTotalRestEditor = document.getElementById("leave-total-rest-editor");
  const leaveOpenRangeSaveBtn = document.getElementById("leave-open-range-save-btn");
  const leaveOpenRangeClearBtn = document.getElementById("leave-open-range-clear-btn");
  const leaveTotalRestSaveBtn = document.getElementById("leave-total-rest-save-btn");
  const leaveOpenRangeCloseBtn = document.getElementById("leave-open-range-close-btn");
  const leaveTotalRestCloseBtn = document.getElementById("leave-total-rest-close-btn");
  const leaveOpenStartDateInput = document.getElementById("leave-open-start-date");
  const leaveOpenEndDateInput = document.getElementById("leave-open-end-date");
  const leaveTotalRestDaysInput = document.getElementById("leave-total-rest-days-input");
  const leaveMessageBoardContent = document.getElementById("leave-message-board-content");
  const leaveMessageBoardCard = document.getElementById("leave-message-board-card");
  const leaveMessageBoardEditBtn = document.getElementById("leave-message-board-edit-btn");
  const leaveMessageBoardEditor = document.getElementById("leave-message-board-editor");
  const leaveMessageBoardInput = document.getElementById("leave-message-board-input");
  const leaveMessageBoardSaveBtn = document.getElementById("leave-message-board-save-btn");
  const leaveMessageBoardCloseBtn = document.getElementById("leave-message-board-close-btn");
  const leaveSymbolToolbar = document.getElementById("leave-symbol-toolbar");
  const leaveEditHint = document.getElementById("leave-edit-hint");
  const leaveBoardTable = document.getElementById("leave-board-table");
  const schedulePopover = document.getElementById("schedule-popover");

  function closeSchedulePopover() {
    if (scheduleDetailBackdrop) scheduleDetailBackdrop.classList.add("hidden");
    if (typeof hideScheduleEditor === "function") {
      hideScheduleEditor();
    }
  }

  function setAttendanceBadge(kind, text) {
    if (!attendanceStatusBadge) return;
    attendanceStatusBadge.className = `status-badge status-${kind}`;
    attendanceStatusBadge.textContent = text;
  }

  function updateMenuPermissions(user) {
   if (permissionsMenuBtn) {
      const allowPermissionPage = canManageEmployees(user) || Boolean(user?.permissions?.permissionsListVisible);
      permissionsMenuBtn.classList.toggle("hidden", !allowPermissionPage);
    }
    if (coordinateMenuBtn) {
      coordinateMenuBtn.classList.toggle("hidden", !canManageCoordinates(user));
    }

    const allowShiftAttendance = canViewShiftAndAttendance(user);
    const allowShiftSettings = canManageShiftSettings(user);
    if (shiftSettingsMenuBtn) {
      shiftSettingsMenuBtn.classList.toggle("hidden", !allowShiftSettings);
    }
    if (attendanceMenuBtn) {
      attendanceMenuBtn.classList.toggle("hidden", !allowShiftAttendance);
    }
    
    if (homeTodayAttendanceCard) {
      homeTodayAttendanceCard.classList.toggle("hidden", !canViewTodayAttendanceStaff(user));
    }
    if (announcementForm) {
      announcementForm.classList.toggle("hidden", !canManageAnnouncements(user));
    }
    if (!canManageAnnouncements(user)) {
      hideAnnouncementEditor();
    }
  }

  function getMenuButtonShortLabel(text) {
    const normalizedText = String(text || "").trim();
    if (!normalizedText) return "選單";
    if (normalizedText.length <= 2) return normalizedText;
    return normalizedText.slice(0, 2);
  }

  function setSidebarCollapsed(collapsed) {
    if (!mainPage) return;
    mainPage.classList.toggle("sidebar-collapsed", collapsed);
    if (sidebarToggleBtn) {
      sidebarToggleBtn.textContent = collapsed ? "☰" : "✕";
      sidebarToggleBtn.setAttribute("aria-expanded", String(!collapsed));
      sidebarToggleBtn.setAttribute("aria-label", collapsed ? "展開選單" : "收合選單");
    }
  }

  menuButtons.forEach(function (button) {
    const buttonLabel = button.textContent;
    button.setAttribute("title", buttonLabel);
    button.setAttribute("data-short", getMenuButtonShortLabel(buttonLabel));
  });
  
  function populateCoordinateRegionOptions() {
    if (!coordinateRegionSelect) return;
    coordinateRegionSelect.innerHTML = REGIONS.map((region) => `<option value="${region}">${region}</option>`).join("");
  }

  populateManageScopeOptions();
  if (permissionLeaveApproveInput) {
    permissionLeaveApproveInput.addEventListener("change", function () {
      updateLeaveApproveScopeVisibility();
      updateSuperAdminFormState();
    });
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
          if (deletedDefaultShiftTemplateKeys.has(key)) return;
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

  function getShiftTemplateKey(region, department, shiftType) {
    return `${region || ""}__${department || ""}__${shiftType || ""}`;
  }
  
  function getDefaultShiftTemplateKeys() {
    const keys = new Set();
    employees.forEach(function (employee) {
      const region = employee.region || "";
      const department = employee.department || "";
      if (!region || !department || department === "最高權限") return;
      DEFAULT_SHIFT_SETTINGS.forEach(function (shift) {
        keys.add(getShiftTemplateKey(region, department, shift.code));
      });
    });
    return Array.from(keys);
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

  function populateShiftSelectOptions() {
    if (shiftCodeSelect) {
      shiftCodeSelect.innerHTML = `<option value="">選擇班別</option>${shiftSettings.map((shift) => `<option value="${shift.code}">${shift.name}（${shift.code}）</option>`).join("")}`;
    }
    if (shiftRegionSelect) {
      shiftRegionSelect.innerHTML = `<option value="">選擇班別</option>${REGIONS.map((region) => `<option value="${region}">${region}</option>`).join("")}`;
    }
    if (shiftDepartmentSelect) {
      shiftDepartmentSelect.innerHTML = `<option value="">選擇班別</option>${DEPARTMENTS.map((department) => `<option value="${department}">${department}</option>`).join("")}`;
    }
    if (shiftCodeSelect) shiftCodeSelect.value = "";
    if (shiftRegionSelect) shiftRegionSelect.value = "";
    if (shiftDepartmentSelect) shiftDepartmentSelect.value = "";
    refreshShiftEmployeeOptions();
    renderLeaveBoard();
  }

  function refreshShiftEmployeeOptions() {
    if (!shiftEmployeeSelect) return;
    const region = shiftRegionSelect?.value || "";
    const department = shiftDepartmentSelect?.value || "";
    const options = employees.filter((employee) => employee.region === region && employee.department === department);
    shiftEmployeeSelect.innerHTML = `<option value="">請選擇員工</option>${options.map((employee) => `<option value="${employee.employeeId}">${employee.name}（${employee.employeeId}｜${employee.department || "-"}｜${employee.title || "-"}）</option>`).join("")}`;
    shiftEmployeeSelect.parentElement?.classList.toggle("hidden", shiftScopeSelect?.value !== "employee");
  }

  function syncShiftForm() {
    const code = shiftCodeSelect?.value || "";
    const region = shiftRegionSelect?.value || "";
    const department = shiftDepartmentSelect?.value || "";
    const employeeId = shiftEmployeeSelect?.value || "";
    if (!code || !region || !department || (shiftScopeSelect?.value === "employee" && !employeeId)) {
      if (shiftNameInput) shiftNameInput.value = "";
      if (shiftStartTimeInput) shiftStartTimeInput.value = "";
      if (shiftEndTimeInput) shiftEndTimeInput.value = "";
      if (shiftReminderTimeInput) shiftReminderTimeInput.value = "";
      if (shiftGraceMinutesInput) shiftGraceMinutesInput.value = "";
      if (shiftIsActiveInput) shiftIsActiveInput.checked = true;
      return;
    }
    const shift = shiftScopeSelect?.value === "employee"
      ? (getEmployeeShiftOverride(employeeId, code) || getTemplateShift(region, department, code) || findShiftSetting(code))
      : (getTemplateShift(region, department, code) || findShiftSetting(code));
    if (!shift) {
      if (shiftNameInput) shiftNameInput.value = "";
      if (shiftStartTimeInput) shiftStartTimeInput.value = "";
      if (shiftEndTimeInput) shiftEndTimeInput.value = "";
      if (shiftReminderTimeInput) shiftReminderTimeInput.value = "";
      if (shiftGraceMinutesInput) shiftGraceMinutesInput.value = "";
      if (shiftIsActiveInput) shiftIsActiveInput.checked = true;
      return;
    }
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
    const shiftTypeOrder = ["morning", "evening"];
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
    const groupedRegions = Object.keys(grouped).sort(compareRegionsNorthToSouth);
    if (!groupedRegions.length) {
      shiftSettingsList.innerHTML = `<div class="list-item"><p>目前沒有班別規則，請先新增地區/部門班別設定。</p></div>`;
      return;
    }
    shiftSettingsList.innerHTML = groupedRegions.map((region) => `
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
                 ${bucket.templates.sort((a, b) => {
                    const indexA = shiftTypeOrder.indexOf(a.shiftType);
                    const indexB = shiftTypeOrder.indexOf(b.shiftType);
                    const orderA = indexA === -1 ? Number.MAX_SAFE_INTEGER : indexA;
                    const orderB = indexB === -1 ? Number.MAX_SAFE_INTEGER : indexB;
                    if (orderA !== orderB) return orderA - orderB;
                    return (a.shiftType || "").localeCompare(b.shiftType || "");
                  }).map((item) => `
                    <div class="list-item">
                      <p>${getShiftNameFromCode(item.shiftType)}｜上班 ${formatTimeText(item.startTime)}｜下班 ${formatTimeText(item.endTime)}｜提醒 ${formatTimeText(item.reminderTime)}｜寬限 ${item.graceMinutes} 分鐘</p>
                      <div class="item-actions">
                        <button type="button" class="small-btn" data-action="edit-shift-rule" data-scope="template" data-id="${item.id}">編輯</button>
                        <button type="button" class="small-btn danger-btn" data-action="delete-shift-rule" data-scope="template" data-id="${item.id}">刪除</button>
                      </div>
                    </div>
                  `).join("") || "<p>尚未設定。</p>"}
                </div>
                <details class="scope-collapse">
                  <summary>個別員工班別設定（${bucket.employees.length} 筆）</summary>
                  <div class="list-wrap">
                    ${bucket.employees.length ? bucket.employees.map((item) => `
                      <div class="list-item">
                        <h4>${item.employeeName}</h4>
                        <p>${getShiftNameFromCode(item.shiftType)}｜上班 ${formatTimeText(item.startTime)}｜下班 ${formatTimeText(item.endTime)}｜提醒 ${formatTimeText(item.reminderTime)}｜寬限 ${item.graceMinutes} 分鐘</p>
                        <div class="item-actions">
                          <button type="button" class="small-btn" data-action="edit-shift-rule" data-scope="employee" data-id="${item.id}">編輯</button>
                          <button type="button" class="small-btn danger-btn" data-action="delete-shift-rule" data-scope="employee" data-id="${item.id}">刪除</button>
                        </div>
                      </div>
                    `).join("") : "<div class='list-item'><p>尚未設定員工覆蓋班別。</p></div>"}
                  </div>
                </details>
              </div>
            </details>
          `;
        }).join("")}
      </details>
    `).join("");
  }

  function loadShiftRuleToForm(scope, id) {
    const isEmployeeScope = scope === "employee";
    const sourceList = isEmployeeScope ? employeeShiftSettings : shiftTemplates;
    const target = sourceList.find((item) => item.id === id);
    if (!target) {
      alert("找不到要編輯的班別規則");
      return;
    }
    editingShiftRule = { scope, id };

    if (shiftScopeSelect) shiftScopeSelect.value = isEmployeeScope ? "employee" : "template";
    if (shiftRegionSelect) shiftRegionSelect.value = target.region || "";
    if (shiftDepartmentSelect) shiftDepartmentSelect.value = target.department || "";
    refreshShiftEmployeeOptions();
    if (isEmployeeScope && shiftEmployeeSelect) {
      shiftEmployeeSelect.value = target.employeeId || "";
    }
    if (shiftCodeSelect) shiftCodeSelect.value = target.shiftType || "";
    if (shiftNameInput) shiftNameInput.value = target.name || getShiftNameFromCode(target.shiftType || "");
    if (shiftStartTimeInput) shiftStartTimeInput.value = formatTimeText(target.startTime);
    if (shiftEndTimeInput) shiftEndTimeInput.value = formatTimeText(target.endTime);
    if (shiftReminderTimeInput) shiftReminderTimeInput.value = formatTimeText(target.reminderTime);
    if (shiftGraceMinutesInput) shiftGraceMinutesInput.value = Number(target.graceMinutes || 0);
    if (shiftIsActiveInput) shiftIsActiveInput.checked = target.isActive !== false;
    shiftSettingsForm?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function deleteShiftRule(scope, id) {
    const isEmployeeScope = scope === "employee";
    const targetCollection = isEmployeeScope ? "employeeShiftSettings" : "shiftTemplates";
    const sourceList = isEmployeeScope ? employeeShiftSettings : shiftTemplates;
    const target = sourceList.find((item) => item.id === id);
    if (!target) return alert("找不到要刪除的班別規則");
    if (!confirm("確定要刪除此班別規則嗎？")) return;

    try {
      const isDefaultTemplate = !isEmployeeScope && String(target.id || "").startsWith("template-");
      const templateKey = getShiftTemplateKey(target.region, target.department, target.shiftType);
      if (!db) {
        if (isEmployeeScope) {
          employeeShiftSettings = employeeShiftSettings.filter((item) => item.id !== id);
        } else if (isDefaultTemplate) {
          deletedDefaultShiftTemplateKeys.add(templateKey);
          safeStorageSet("deleted_default_shift_template_keys", JSON.stringify(Array.from(deletedDefaultShiftTemplateKeys)));
          shiftTemplates = shiftTemplates.filter((item) => getShiftTemplateKey(item.region, item.department, item.shiftType) !== templateKey);
        } else {
          shiftTemplates = shiftTemplates.filter((item) => item.id !== id);
        }
        if (editingShiftRule?.id === id && editingShiftRule?.scope === scope) editingShiftRule = null;
        refreshShiftSettingViews();
        refreshAttendanceSettings();
        return;
      }
      if (isDefaultTemplate) {
        await setDoc(doc(db, "shiftTemplateDeletes", templateKey), {
          key: templateKey,
          region: target.region || "",
          department: target.department || "",
          shiftType: target.shiftType || "",
          deletedAt: serverTimestamp(),
          deletedBy: currentUser?.employeeId || ""
        });
      } else {
        await deleteDoc(doc(db, targetCollection, id));
      }
      if (editingShiftRule?.id === id && editingShiftRule?.scope === scope) editingShiftRule = null;
    } catch (error) {
      console.error("刪除班別規則失敗", error);
      if (error?.code === "permission-denied") {
        alert("刪除失敗：目前帳號沒有刪除班別規則權限，請聯絡管理員。");
        return;
      }
      alert("刪除班別規則失敗");
    }
  }

  async function resetAllShiftRuleTimes() {
    if (!confirm("確定要清空目前所有班別規則時間嗎？清空後可逐筆重新設定。")) return;

    const defaultKeys = getDefaultShiftTemplateKeys();
    try {
      if (!db) {
        shiftTemplates = [];
        employeeShiftSettings = [];
        deletedDefaultShiftTemplateKeys = new Set(defaultKeys);
        safeStorageSet("deleted_default_shift_template_keys", JSON.stringify(defaultKeys));
        editingShiftRule = null;
        refreshShiftSettingViews();
        refreshAttendanceSettings();
        alert("已清空班別規則時間，請逐筆重新設定。");
        return;
      }

      const deleteJobs = [];
      shiftTemplates.forEach(function (item) {
        if (!item?.id || String(item.id).startsWith("template-")) return;
        deleteJobs.push(deleteDoc(doc(db, "shiftTemplates", item.id)));
      });
      employeeShiftSettings.forEach(function (item) {
        if (!item?.id) return;
        deleteJobs.push(deleteDoc(doc(db, "employeeShiftSettings", item.id)));
      });
      defaultKeys.forEach(function (key) {
        deleteJobs.push(setDoc(doc(db, "shiftTemplateDeletes", key), {
          key,
          deletedAt: serverTimestamp(),
          deletedBy: currentUser?.employeeId || ""
        }, { merge: true }));
      });
      await Promise.all(deleteJobs);
      editingShiftRule = null;
      alert("已清空班別規則時間，請逐筆重新設定。");
    } catch (error) {
      console.error("清空班別規則失敗", error);
      if (error?.code === "permission-denied") {
        alert("清空失敗：目前帳號沒有刪除班別規則權限，請聯絡管理員。");
        return;
      }
      alert("清空班別規則失敗");
    }
  }
  
  function refreshShiftSettingViews() {
    populateShiftSelectOptions();
    syncShiftForm();
    renderShiftSettingsList();
  }
  
  function renderAttendanceSettingsSummary() {
    if (!attendanceSettingsSummary) return;
    
    const shift = getEffectiveShiftSetting(currentUser, getSelectedShiftCode()) || getActiveShiftSettings()[0];
    attendanceSettingsSummary.innerHTML = `
      <p><strong>目前班別：</strong>${shift ? `${shift.name}（${formatTimeText(shift.startTime)} - ${formatTimeText(shift.endTime)}）` : "尚未設定"}</p>
      <p><strong>提醒時間：</strong>${shift ? formatTimeText(shift.reminderTime) : "-"}</p>
      <p><strong>最後正常打卡：</strong>${shift ? `${formatTimeText(shift.startTime)} + ${shift.graceMinutes} 分鐘` : "-"}</p>
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
  
    if (!window.isSecureContext && !/^localhost$|^127(\.\d+){3}$/.test(window.location.hostname)) {
      alert("目前不是安全連線（HTTPS），手機瀏覽器可能無法取得定位，請改用 HTTPS 網址開啟。");
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

  function parseAttendanceDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value?.toDate === "function") return value.toDate();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function getBeijingDateParts(value) {
    const date = parseAttendanceDate(value);
    if (!date) return null;
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: ATTENDANCE_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    const parts = formatter.formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    if (!year || !month || !day) return null;
    return { year, month, day };
  }
  
  function formatAttendanceDateTime(value) {
    const date = parseAttendanceDate(value);
    if (!date || Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("zh-TW", {
      timeZone: ATTENDANCE_TIMEZONE,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function formatDateKey(dateValue) {
    const parts = getBeijingDateParts(dateValue);
    if (!parts) return "";
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function formatTimeOnly(dateValue) {
    const date = parseAttendanceDate(dateValue);
    if (!date || Number.isNaN(date.getTime())) return "-";
    return date.toLocaleTimeString("zh-TW", {
      timeZone: ATTENDANCE_TIMEZONE,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function calculateHours(startValue, endValue) {
    const start = parseAttendanceDate(startValue);
    const end = parseAttendanceDate(endValue);

    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "-";
    if (end < start) return "-";

    const diffHours = (end - start) / 1000 / 60 / 60;
    return diffHours.toFixed(2);
  }

  function getVisibleAttendanceRecordsByPermission() {
    return isAdmin(currentUser)
      ? attendanceRecords.slice()
      : attendanceRecords.filter(function (item) {
          return currentUser && item.employeeId === currentUser.employeeId;
        });
     }

  function getFilteredAttendanceRecords() {
    const nameKeyword = attendanceFilterName ? attendanceFilterName.value.trim() : "";
    const selectedDate = attendanceFilterDate ? attendanceFilterDate.value : "";

    let visibleRecords = getVisibleAttendanceRecordsByPermission();

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

  function closeAttendanceRecordPopover() {
    if (attendanceRecordPopoverBackdrop) attendanceRecordPopoverBackdrop.classList.add("hidden");
  }

  function openAttendanceRecordPopover(group) {
    if (!attendanceRecordPopoverBackdrop || !attendanceRecordPopoverTitle || !attendanceRecordPopoverContent) return;
    if (!group) return;
    const item = summarizeEmployeeAttendance(group);
    attendanceRecordPopoverTitle.textContent = `${item.employeeName}（${item.employeeId || "未填編號"}）`;
    attendanceRecordPopoverContent.innerHTML = `
      <div class="attendance-record-detail-list">
        <div class="list-item">
          <p>上班時間：${item.clockInRecord ? formatTimeOnly(item.clockInRecord.createdAtClient) : "-"}</p>
          <p>下班時間：${item.clockOutRecord ? formatTimeOnly(item.clockOutRecord.createdAtClient) : "-"}</p>
          <p>工時：${item.workHours} 小時</p>
          <p>最終狀態：<span class="status-badge status-${item.latestRecord?.status || "success"}">${item.latestRecord?.status || "success"}</span></p>
        </div>
        <div class="list-item">
          <h4>今日打卡明細</h4>
          ${item.records.map((record) => `<div class="item-meta">${record.type === "clockIn" ? "上班時間" : "下班時間"}｜${formatTimeOnly(record.createdAtClient)}｜${record.officeName || "範圍外"}｜座標 ${Number(record.lat || 0).toFixed(6)}, ${Number(record.lng || 0).toFixed(6)}${record.outsideReason ? `｜原因：${record.outsideReason}` : ""}</div>`).join("")}
        </div>
      </div>
    `;
    attendanceRecordPopoverBackdrop.classList.remove("hidden");
  }

  function renderTodayAttendanceStaff() {
    if (!todayAttendanceStaffList) return;
    if (!currentUser) {
      todayAttendanceStaffList.innerHTML = `<div class="list-item"><p>請先登入以查看當日上班人員。</p></div>`;
      return;
    }
    if (!canViewTodayAttendanceStaff(currentUser)) {
      todayAttendanceStaffList.innerHTML = `<div class="list-item"><p>只有管理員可查看今日打卡人員資料。</p></div>`;
      return;
    }

    const todayKey = formatDateKey(new Date());
    const todayRecords = getVisibleAttendanceRecordsByPermission().filter((item) => formatDateKey(item.createdAtClient) === todayKey);
    if (!todayRecords.length) {
      todayAttendanceStaffList.innerHTML = `<div class="list-item"><p>今日尚無打卡記錄。</p></div>`;
      return;
    }

    const groupedByEmployee = {};
    todayRecords.forEach(function (record) {
      const employeeKey = record.employeeId || record.employeeName || "unknown";
      if (!groupedByEmployee[employeeKey]) {
        groupedByEmployee[employeeKey] = {
          employeeName: record.employeeName || "未知員工",
          employeeId: record.employeeId || "",
          records: []
        };
      }
      groupedByEmployee[employeeKey].records.push(record);
    });

    const buttons = Object.values(groupedByEmployee)
      .sort((a, b) => a.employeeName.localeCompare(b.employeeName, "zh-Hant"))
      .map((group) => `<button type="button" class="today-attendance-employee-btn" data-attendance-employee-id="${group.employeeId}" data-attendance-employee-name="${group.employeeName}">${group.employeeName}</button>`)
      .join("");

    todayAttendanceStaffList.innerHTML = `<div class="today-attendance-employee-list">${buttons}</div>`;
  }

  function getTodayWorkingEmployeesByLeaveBoard() {
    const todayString = formatDate(new Date());
    const todayMonthKey = todayString.slice(0, 7);
    const todayLeaveMap = new Map(
      leaveAssignments
        .filter((item) => item.monthKey === todayMonthKey && item.date === todayString)
        .map((item) => [item.employeeId, getAssignmentSymbolTypes(item)])
    );

    return employees.filter((employee) => {
      if (employee.isHidden || employee.status === "deleted") return false;
      if (employee.showOnLeaveBoard === false) return false;
      if (isAutoRestDay(employee, todayString)) return false;
      const symbolTypes = todayLeaveMap.get(employee.employeeId) || [];
      return !symbolTypes.some((symbolType) => LEAVE_EXCLUDED_SYMBOL_TYPES.has(symbolType));
    });
  }

  function renderTodayWorkingStaff() {
    if (!todayWorkingStaffList) return;
    if (!currentUser) {
      todayWorkingStaffList.innerHTML = `<div class="list-item"><p>請先登入以查看當日上班人員。</p></div>`;
      return;
    }

    const SHIFT_DISPLAY_ORDER = ["早班", "晚班"];

    const workingEmployees = getTodayWorkingEmployeesByLeaveBoard()
      .map((employee) => {
        const shiftType = getUserShiftType(employee);
        return {
          ...employee,
          shiftType
        };
      })
      .sort((a, b) => {
        const regionCompare = compareRegionsNorthToSouth(a.region || "", b.region || "");
        if (regionCompare !== 0) return regionCompare;
        const departmentCompare = compareDepartmentsForTodayStaff(a.department || "", b.department || "", a.region || "");
        if (departmentCompare !== 0) return departmentCompare;
        const shiftCompare = (a.shiftType || "").localeCompare(b.shiftType || "", "zh-Hant");
        if (shiftCompare !== 0) return shiftCompare;
        return (a.name || "").localeCompare(b.name || "", "zh-Hant");
      });

    if (!workingEmployees.length) {
      todayWorkingStaffList.innerHTML = `<div class="list-item"><p>今日無可上班人員（休假表已全部排休或活動）。</p></div>`;
      return;
    }

    const grouped = {};
    workingEmployees.forEach(function (employee) {
      const region = employee.region || "未分類地區";
      const department = employee.department || "未分類部門";
      const shiftType = employee.shiftType || "未設定";

      if (!grouped[region]) grouped[region] = {};
      if (!grouped[region][department]) grouped[region][department] = {};
      if (!grouped[region][department][shiftType]) grouped[region][department][shiftType] = [];
      grouped[region][department][shiftType].push(employee.name || employee.employeeId || "未命名員工");
    });

    const html = Object.keys(grouped)
      .sort(compareRegionsNorthToSouth)
      .map(function (region) {
        const departments = grouped[region];
        const departmentHtml = Object.keys(departments)
          .sort((a, b) => compareDepartmentsForTodayStaff(a, b, region))
          .map(function (department) {
            const shiftGroups = departments[department];
            const extraShiftTypes = Object.keys(shiftGroups)
              .filter((shiftType) => !SHIFT_DISPLAY_ORDER.includes(shiftType))
              .sort((a, b) => a.localeCompare(b, "zh-Hant"));
            const allShiftTypes = [...SHIFT_DISPLAY_ORDER, ...extraShiftTypes];

            const shiftHtml = allShiftTypes
              .map(function (shiftType) {
                const names = (shiftGroups[shiftType] || []).sort((a, b) => a.localeCompare(b, "zh-Hant"));
                return `<p>${shiftType}　${names.join("｜")}</p>`;
              })
              .join("");

            return `<div class="list-item"><h4>${department}</h4>${shiftHtml}</div>`;
          })
          .join("");

        return `<div class="list-item"><h4>${region}</h4>${departmentHtml}</div>`;
      })
      .join("");
    
    todayWorkingStaffList.innerHTML = html;
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
    renderTodayAttendanceStaff();
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
          ${Object.keys(tree[date]).sort(compareRegionsNorthToSouth).map((region) => `<details><summary>${region}</summary><div class="attendance-tree-node">${Object.keys(tree[date][region]).map((department) => `<details><summary>${department}</summary><div class="attendance-tree-node">${Object.keys(tree[date][region][department]).map((shiftType) => `<details><summary>${getShiftNameFromCode(shiftType)}</summary><div class="attendance-tree-node">${Object.values(tree[date][region][department][shiftType]).sort((a, b) => a.employeeName.localeCompare(b.employeeName, "zh-Hant")).map((group) => {
            const item = summarizeEmployeeAttendance(group);
            const focusRecord = item.clockInRecord || item.latestRecord || {};
            const mapId = `${date}-${item.employeeId}-${shiftType}`.replace(/[^a-zA-Z0-9-_]/g, "");
            return `<details class="attendance-record-card"><summary>${item.employeeName}（${item.employeeId || "未填編號"}）</summary><div class="list-item"><p>上班時間：${item.clockInRecord ? formatTimeOnly(item.clockInRecord.createdAtClient) : "-"}</p><p>下班時間：${item.clockOutRecord ? formatTimeOnly(item.clockOutRecord.createdAtClient) : "-"}</p><p>打卡地點：${focusRecord.officeName || "範圍外打卡"}</p><p>座標：<span class="coordinate-text">${Number(focusRecord.lat || 0).toFixed(6)}, ${Number(focusRecord.lng || 0).toFixed(6)}</span></p><p>工時：${item.workHours} 小時｜最終狀態：<span class="status-badge status-${item.latestRecord?.status || "success"}">${item.latestRecord?.status || "success"}</span></p><div class="attendance-map" data-map-id="${mapId}" data-lat="${focusRecord.lat || ""}" data-lng="${focusRecord.lng || ""}" data-name="${focusRecord.officeName || item.employeeName}"></div><div style="margin-top:10px;">${item.records.map((record) => `<div class="item-meta">${record.type === "clockIn" ? "上班時間" : "下班時間"}｜${formatTimeOnly(record.createdAtClient)}｜${record.officeName || "範圍外"}｜座標 ${Number(record.lat || 0).toFixed(6)}, ${Number(record.lng || 0).toFixed(6)}${record.outsideReason ? `｜原因：${record.outsideReason}` : ""}</div>`).join("")}</div></div></details>`;
          }).join("")}</div></details>`).join("")}</div></details>`).join("")}</div></details>`).join("")}
        </div>
      </details>`).join("")}</div>`;
  }

    function startShiftSettingsListener() {
    const storedDeletedKeys = safeStorageGet("deleted_default_shift_template_keys");
    if (storedDeletedKeys) {
      try {
        deletedDefaultShiftTemplateKeys = new Set(JSON.parse(storedDeletedKeys));
      } catch (error) {
        console.warn("讀取預設班別刪除清單失敗", error);
      }
    }
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
      
    onSnapshot(collection(db, "shiftTemplateDeletes"), function (snapshot) {
      deletedDefaultShiftTemplateKeys = new Set(snapshot.docs.map((docItem) => String(docItem.data()?.key || docItem.id || "")));
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
      manageRegions.innerHTML = REGIONS.map((region) => `<label class="scope-checkbox-item"><input type="checkbox" name="manage-regions" value="${region}" />${region}</label>`).join("");
    }

    if (manageDepartments) {
      manageDepartments.innerHTML = DEPARTMENTS.map((department) => `<label class="scope-checkbox-item"><input type="checkbox" name="manage-departments" value="${department}" />${department}</label>`).join("");
    }
    
    populateCoordinateRegionOptions();
    refreshShiftSettingViews();
  }
  
  function updateUserInfo(user) {
    if (currentUserName) currentUserName.textContent = user.name;
    if (shiftInfo && user) {
      const shift = getUserShiftType(user);
      shiftInfo.textContent = `今日班別：${shift}`;
    }
    renderTodayAttendanceStaff();
    renderTodayWorkingStaff();
  }

  function hideChangePasswordModal() {
    if (changePasswordBackdrop) changePasswordBackdrop.classList.add("hidden");
    if (changePasswordForm) changePasswordForm.reset();
    if (changePasswordError) changePasswordError.textContent = "";
  }

  function showChangePasswordModal() {
    if (!currentUser) return alert("請先登入");
    if (changePasswordError) changePasswordError.textContent = "";
    if (changePasswordForm) changePasswordForm.reset();
    if (changePasswordBackdrop) changePasswordBackdrop.classList.remove("hidden");
    if (changePasswordCurrentInput) changePasswordCurrentInput.focus();
  }

  async function updateCurrentUserPassword(newPassword) {
    if (!currentUser) return;
    const targetEmployeeId = currentUser.employeeId;
    employees = employees.map(function (employee) {
      if (employee.employeeId !== targetEmployeeId) return employee;
      return { ...employee, password: newPassword };
    });
    const syncedUser = employees.find((employee) => employee.employeeId === targetEmployeeId);
    if (syncedUser) {
      currentUser = syncedUser;
      persistCurrentUserSession(syncedUser);
      updateUserInfo(syncedUser);
    }
    if (db && currentUser?.id && !String(currentUser.id).startsWith("builtin-")) {
      await updateDoc(doc(db, "employees", currentUser.id), {
        password: newPassword,
        updatedAt: serverTimestamp()
      });
    }
  }

  function populateManageScopeOptions() {
    if (manageRegions) {
      manageRegions.innerHTML = REGIONS.map((region) => `<label class="scope-checkbox-item"><input type="checkbox" name="manage-regions" value="${region}" />${region}</label>`).join("");
    }
    if (manageDepartments) {
      manageDepartments.innerHTML = DEPARTMENTS.map((department) => `<label class="scope-checkbox-item"><input type="checkbox" name="manage-departments" value="${department}" />${department}</label>`).join("");
    }
    if (permManageRegions) {
      permManageRegions.innerHTML = REGIONS.map((region) => `<label class="scope-checkbox-item"><input type="checkbox" name="perm-manage-regions" value="${region}" />${region}</label>`).join("");
    }
    if (permManageDepartments) {
      permManageDepartments.innerHTML = DEPARTMENTS.map((department) => `<label class="scope-checkbox-item"><input type="checkbox" name="perm-manage-departments" value="${department}" />${department}</label>`).join("");
    }
  }

  function updateLeaveApproveScopeVisibility() {
    if (!leaveApproveScopeBox) return;
    leaveApproveScopeBox.classList.toggle("hidden", !permissionLeaveApproveInput?.checked);
  }

  function updateSuperAdminFormState() {
    const isSuperAdminEditing = isSuperAdminEmployee(employeeIdField?.value.trim() || "");
    const forceEnabled = isSuperAdminEditing;
    if (permissionEmployeeManageInput) permissionEmployeeManageInput.checked = forceEnabled || permissionEmployeeManageInput.checked;
    if (permissionAttendanceCoordinateInput) permissionAttendanceCoordinateInput.checked = forceEnabled || permissionAttendanceCoordinateInput.checked;
    if (permissionShiftSettingsInput) permissionShiftSettingsInput.checked = forceEnabled || permissionShiftSettingsInput.checked;
    if (permissionLeaveApproveInput) permissionLeaveApproveInput.checked = forceEnabled || permissionLeaveApproveInput.checked;
    if (permissionAnnouncementManageInput) permissionAnnouncementManageInput.checked = forceEnabled || permissionAnnouncementManageInput.checked;

    [
      permissionEmployeeManageInput,
      permissionAttendanceCoordinateInput,
      permissionShiftSettingsInput,
      permissionLeaveApproveInput,
      permissionAnnouncementManageInput
    ].forEach(function (input) {
      if (!input) return;
      input.disabled = isSuperAdminEditing;
    });

    if (employeeShiftMorningInput) {
      employeeShiftMorningInput.checked = isSuperAdminEditing ? true : employeeShiftMorningInput.checked;
      employeeShiftMorningInput.disabled = isSuperAdminEditing;
    }
    if (employeeShiftEveningInput) {
      employeeShiftEveningInput.checked = isSuperAdminEditing ? true : employeeShiftEveningInput.checked;
      employeeShiftEveningInput.disabled = isSuperAdminEditing;
    }
    if (employeeWeekendsOffInput) {
      employeeWeekendsOffInput.checked = isSuperAdminEditing ? false : employeeWeekendsOffInput.checked;
      employeeWeekendsOffInput.disabled = isSuperAdminEditing;
    }
    if (employeeShowOnLeaveBoardInput) {
      employeeShowOnLeaveBoardInput.checked = isSuperAdminEditing ? true : employeeShowOnLeaveBoardInput.checked;
      employeeShowOnLeaveBoardInput.disabled = isSuperAdminEditing;
    }

    const scopeDisabled = isSuperAdminEditing || !permissionLeaveApproveInput?.checked;
    if (manageRegions) {
      Array.from(manageRegions.querySelectorAll('input[type="checkbox"]')).forEach((checkbox) => {
        checkbox.disabled = scopeDisabled;
        if (isSuperAdminEditing) checkbox.checked = true;
      });
    }
    if (manageDepartments) {
      Array.from(manageDepartments.querySelectorAll('input[type="checkbox"]')).forEach((checkbox) => {
        checkbox.disabled = scopeDisabled;
        if (isSuperAdminEditing) checkbox.checked = true;
      });
    }
    updateLeaveApproveScopeVisibility();
  }

  function getCheckedValues(containerElement) {
    if (!containerElement) return [];
    return Array.from(containerElement.querySelectorAll('input[type="checkbox"]:checked'))
      .map((input) => input.value)
      .filter((value) => value !== "");
  }

  function setCheckedValues(containerElement, values = []) {
    if (!containerElement) return;
    const valueSet = new Set(values);
    Array.from(containerElement.querySelectorAll('input[type="checkbox"]')).forEach((input) => {
      input.checked = valueSet.has(input.value);
    });
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
    const allowManage = canManageEmployees(currentUser);
    if (employeeFormCard) employeeFormCard.classList.toggle("hidden", !allowManage);
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
      .sort(compareRegionsNorthToSouth)
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
                          const showOnLeaveBoard = employee.showOnLeaveBoard !== false;
                          const shiftLabels = [
                            employee.shifts?.morning ? "早班" : "",
                            employee.shifts?.evening ? "晚班" : ""
                          ].filter(Boolean);

                          const canManageEmployeeData = canManageEmployees(currentUser);
                          const limitedInfoText = `部門：${employee.department || "-"}｜職稱：${employee.title || "-"}｜地區：${employee.region || "-"}｜類別：${employee.category || "-"}｜電話：${employee.phone || "-"}｜生日：${employee.birthday || "-"}｜班別：${shiftLabels.length ? shiftLabels.join(" / ") : "未設定"}`;
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
                                      <div class="item-meta ${canManageEmployeeData ? "" : "hidden"}">
                                        員工代號：${employee.employeeId || "-"}｜
                                        帳號：${employee.account || "-"}｜
                                        Email：${employee.email || "-"}
                                      </div>
                                    </div>
                                    ${canManageEmployeeData ? `<span class="status-badge status-${employee.status || "active"}">${employee.status || "active"}</span>` : ""}
                                  </div>
                                  ${canManageEmployeeData
                                    ? `<p>部門：${employee.department || "-"}｜職稱：${employee.title || "-"}｜地區：${employee.region || "-"}</p>
                                  <p>類別：${employee.category || "-"}｜電話：${employee.phone || "-"}｜生日：${employee.birthday || "-"}</p>
                                  <p>年度特休：${employee.annualLeaveDays || 0} 天（期限：${employee.annualLeaveExpiry || "未設定"}）｜旅遊假：${employee.travelLeaveDays || 0} 天（期限：${employee.travelLeaveExpiry || "未設定"}）</p>
                                  <p>班別：${shiftLabels.length ? shiftLabels.join(" / ") : "未設定"}｜週休二日與國定假日：${employee.weekendsOff ? "啟用" : "關閉"}</p>
                                  <p>休假表顯示：${showOnLeaveBoard ? "顯示" : "隱藏"}</p>
                                  <p>功能權限：${formatEmployeePermissions(employee)}</p>`
                                    : `<p>${limitedInfoText}</p>`}
                                  ${canManageEmployeeData ? `<div class="item-actions"><button type="button" class="small-btn edit-btn" onclick="editEmployee('${employee.id}')">編輯</button><button type="button" class="small-btn delete-btn" onclick="deleteEmployee('${employee.id}')">刪除</button></div>` : ""}
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
    renderTodayWorkingStaff();
     renderPermissionsEmployeeList();
  }

  function renderPermissionsEmployeeList() {
    if (!permissionsEmployeeList) return;

    const visibleEmployees = employees.filter(function (employee) {
      return !employee.isHidden;
    });

    if (visibleEmployees.length === 0) {
      permissionsEmployeeList.innerHTML = `<div class="list-item"><p>目前沒有可設定權限的人員。</p></div>`;
      return;
    }

    const grouped = {};
    visibleEmployees.forEach(function (employee) {
      const region = employee.region || "未分類地區";
      const department = employee.department || "未分類部門";
      if (!grouped[region]) grouped[region] = {};
      if (!grouped[region][department]) grouped[region][department] = [];
      grouped[region][department].push(employee);
    });

    const canManageEmployeeData = canManageEmployees(currentUser);

    permissionsEmployeeList.innerHTML = Object.keys(grouped)
      .sort(compareRegionsNorthToSouth)
      .map(function (region) {
        return `
          <details class="scope-collapse">
            <summary>${region}</summary>
            ${Object.keys(grouped[region])
              .sort(function (a, b) {
                const orderDiff = getDepartmentOrder(a) - getDepartmentOrder(b);
                if (orderDiff !== 0) return orderDiff;
                return String(a || "").localeCompare(String(b || ""), "zh-Hant");
              })
              .map(function (department) {
                const sortedEmployees = [...grouped[region][department]].sort(function (a, b) {
                  const nameDiff = String(a.name || "").localeCompare(String(b.name || ""), "zh-Hant");
                  if (nameDiff !== 0) return nameDiff;
                  return String(a.employeeId || "").localeCompare(String(b.employeeId || ""), "zh-Hant");
                });

                return `
                  <details class="scope-collapse">
                    <summary>${department}（${sortedEmployees.length} 人）</summary>
                    <div class="list-wrap">
                      ${sortedEmployees.map(function (employee) {
                        return `
                          <div class="list-item">
                            <h4>${employee.name || "未命名員工"}（${employee.employeeId || "-"}）</h4>
                            <p class="helper-text">部門：${employee.department || "-"}｜職稱：${employee.title || "-"}</p>
                            ${canManageEmployeeData ? `<div class="item-actions"><button type="button" class="small-btn edit-btn" data-action="open-permission-editor" data-id="${employee.id}">編輯</button></div>` : ""}
                          </div>
                        `;
                      }).join("")}
                    </div>
                  </details>
                `;
              }).join("")}
          </details>
        `;
      }).join("");
  }

  function startEmployeesListener() {
    if (!db) {
      employees = getBuiltinEmployees();
      markEmployeesReady();
      populateScheduleFilters();
      renderEmployees();
      renderPermissionsEmployeeList();
      restoreLogin();
      return;
    }

    const q = collection(db, "employees");

    onSnapshot(
      q,
      function (snapshot) {
        const visibleEmployees = sortEmployeesForDisplay(
          snapshot.docs
            .map(function (docItem) {
              const data = docItem.data();
              return {
                id: docItem.id,
                ...data,
                permissions: normalizeEmployeePermissions(data.permissions || {})
              };
            })
            .filter(function (employee) {
              return !employee.isHidden;
            })
        );

        if (visibleEmployees.length === 0) {
        employees = getBuiltinEmployees();
          populateScheduleFilters();
          markEmployeesReady();
          renderEmployees();
          restoreLogin();
          seedDefaultEmployees();
          return;
        }

        employees = mergeEmployeesWithBuiltin(visibleEmployees);
        markEmployeesReady();
        ensureBaseShiftTemplates();
        populateScheduleFilters();
        renderEmployees();
        restoreLogin();
      },
      function (error) {
        console.error("載入員工資料失敗，改用內建帳號", error);
        employees = getBuiltinEmployees();
        ensureBaseShiftTemplates();
        populateScheduleFilters();
        markEmployeesReady();
        renderEmployees();
        restoreLogin();
      }
    );
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

  function startSchedulesListener() {
    if (!db) return;
    const q = query(collection(db, "schedules"), orderBy("date", "desc"));
    onSnapshot(q, function (snapshot) {
      schedules = snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }));
      populateScheduleFilters();
      renderSchedules();
      renderRosterCalendar();
    });
  }

  function canViewScheduleItem(item, viewer = currentUser) {
    if (!viewer) return false;
    if (canManageAllSchedules(viewer)) return true;
    const isOwnerMemo = Boolean(item?.employeeId) && item.employeeId === viewer.employeeId;
    const isDepartmentMemo = !item?.employeeId && item?.region === viewer.region && item?.department === viewer.department;
    const isCreator = Boolean(item?.createdBy) && item.createdBy === viewer.employeeId;
    return isOwnerMemo || isDepartmentMemo || isCreator;
  }

  function canEditScheduleItem(item, viewer = currentUser) {
    if (!viewer || !item) return false;
    if (canManageAllSchedules(viewer)) return true;
    return Boolean(item.createdBy) && item.createdBy === viewer.employeeId;
  }

  function formatScheduleDate(year, monthIndex, day) {
    return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function normalizeScheduleDateValue(dateValue) {
    if (!dateValue) return "";
    if (typeof dateValue === "string") {
      const trimmed = dateValue.trim();
      if (!trimmed) return "";
      const directMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (directMatch) {
        return `${directMatch[1]}-${directMatch[2].padStart(2, "0")}-${directMatch[3].padStart(2, "0")}`;
      }
      const slashMatch = trimmed.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
      if (slashMatch) {
        return `${slashMatch[1]}-${slashMatch[2].padStart(2, "0")}-${slashMatch[3].padStart(2, "0")}`;
      }
      const parsed = new Date(trimmed);
      if (!Number.isNaN(parsed.getTime())) return formatDate(parsed);
      return trimmed;
    }
    if (dateValue?.toDate && typeof dateValue.toDate === "function") {
      const converted = dateValue.toDate();
      if (!Number.isNaN(converted?.getTime?.())) return formatDate(converted);
    }
    if (dateValue instanceof Date && !Number.isNaN(dateValue.getTime())) {
      return formatDate(dateValue);
    }
    return "";
  }

  function getSchedulesByDate(dateString) {
    const normalizedDate = normalizeScheduleDateValue(dateString);
    return filterSchedules().filter((item) => normalizeScheduleDateValue(item.date) === normalizedDate && canViewScheduleItem(item));
  }

  function populateScheduleFilters() {
    if (!filterRegion || !filterDepartment || !filterEmployee) return;
    const previousRegion = filterRegion.value || "";
    const previousDepartment = filterDepartment.value || "";
    const previousEmployee = filterEmployee.value || "";

    filterRegion.innerHTML = `<option value="">全部地區</option>${REGIONS.map((region) => `<option value="${region}">${region}</option>`).join("")}`;
    filterDepartment.innerHTML = `<option value="">全部部門</option>${DEPARTMENTS.map((department) => `<option value="${department}">${department}</option>`).join("")}`;

    filterRegion.value = REGIONS.includes(previousRegion) ? previousRegion : "";
    filterDepartment.value = DEPARTMENTS.includes(previousDepartment) ? previousDepartment : "";
    refreshScheduleFilterEmployeeOptions(previousEmployee);
  }

  function refreshScheduleFilterEmployeeOptions(previousEmployee = "") {
    if (!filterEmployee) return;
    const region = filterRegion?.value || "";
    const department = filterDepartment?.value || "";
    const employeeOptions = employees
      .filter((employee) => {
        if (employee.isHidden || employee.status === "deleted") return false;
        if (region && employee.region !== region) return false;
        if (department && employee.department !== department) return false;
        return true;
      })
      .map((employee) => ({ value: employee.name || employee.employeeId, label: employee.name || employee.employeeId }));

    filterEmployee.innerHTML = `<option value="">全部人員</option>${employeeOptions.map((option) => `<option value="${option.value}">${option.label}</option>`).join("")}`;
    filterEmployee.value = employeeOptions.some((option) => option.value === previousEmployee) ? previousEmployee : "";
  }

  function applyDefaultScheduleFiltersByUser(user) {
    if (!user || !filterRegion || !filterDepartment || !filterEmployee) return;
    filterRegion.value = user.region && REGIONS.includes(user.region) ? user.region : "";
    filterDepartment.value = user.department && DEPARTMENTS.includes(user.department) ? user.department : "";
    refreshScheduleFilterEmployeeOptions("");
    filterEmployee.value = "";
    if (filterShift) filterShift.value = "";
  }

  function filterSchedules() {
    const region = filterRegion?.value || "";
    const department = filterDepartment?.value || "";
    const employee = filterEmployee?.value || "";
    const shift = filterShift?.value || "";

    return schedules.filter(function (item) {
      if (region && item.region !== region) return false;
      if (department && item.department !== department) return false;
      const itemEmployee = item.employeeName || item.employee || "";
      if (employee && itemEmployee !== employee) return false;
      if (shift && normalizeScheduleShift(item.shift) !== shift) return false;
      return true;
    });
  }

  function normalizeScheduleShift(shift) {
    if (shift === "支援") return "全部班別";
    return shift || "";
  }

  function getShiftClassName(shift) {
    const normalizedShift = normalizeScheduleShift(shift);
    if (normalizedShift === "全部班別") return "shift-support";
    if (normalizedShift === "早班") return "shift-morning";
    if (normalizedShift === "晚班") return "shift-evening";
    return "";
  }

  function getShiftEmoji(shift) {
    const normalizedShift = normalizeScheduleShift(shift);
    if (normalizedShift === "全部班別") return "🎰";
    if (normalizedShift === "早班") return "🌞";
    if (normalizedShift === "晚班") return "🌚";
    return "";
  }
  
  function getCalendarDayTitle(dateString) {
    const items = getSchedulesByDate(dateString);
    if (!items.length) return "";
    return items[0].title || items[0].note || items[0].shift || "";
  }

  function renderRosterCalendar() {
    if (!calendarGrid || !rosterCalendarTitle) return;
    const year = rosterCalendarDate.getFullYear();
    const month = rosterCalendarDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const days = new Date(year, month + 1, 0).getDate();

    rosterCalendarTitle.textContent = `${year} 年 ${month + 1} 月`;
    calendarGrid.innerHTML = "";

    for (let i = 0; i < firstDay; i += 1) {
      const empty = document.createElement("div");
      empty.className = "calendar-day empty";
      calendarGrid.appendChild(empty);
    }

    for (let d = 1; d <= days; d += 1) {
      const dateStr = formatScheduleDate(year, month, d);
      const daySchedules = getSchedulesByDate(dateStr);
      const cell = document.createElement("div");
      cell.className = "calendar-day";
      cell.setAttribute("data-date", dateStr);
      const tagsHtml = daySchedules.map((item) => {
        const title = item.title || item.note || "未命名";
        const shift = normalizeScheduleShift(item.shift);
        const shiftClass = getShiftClassName(shift);
        const shiftEmoji = getShiftEmoji(shift);
        return `<div class="schedule-tag ${shiftClass}">${title}${shift ? `｜${shiftEmoji}${shift}` : ""}</div>`;
      }).join("");
      cell.innerHTML = `<div class="day-number">${d}</div><div class="day-title"></div><div class="calendar-events">${tagsHtml}</div>`;
      cell.addEventListener("click", function () {
        openScheduleDetail(dateStr);
      });
      calendarGrid.appendChild(cell);
    }
  }

  function groupSchedulesForDetail(dateString) {
    const daySchedules = getSchedulesByDate(dateString);
    const regionMap = new Map();
    daySchedules.forEach(function (item) {
      const region = item.region || "未設定地區";
      const department = item.department || "未設定部門";
      const employee = item.employeeName || item.employee || item.employeeId || "未指定人員";
      if (!regionMap.has(region)) regionMap.set(region, new Map());
      const departmentMap = regionMap.get(region);
      if (!departmentMap.has(department)) departmentMap.set(department, new Map());
      const employeeMap = departmentMap.get(department);
      if (!employeeMap.has(employee)) employeeMap.set(employee, []);
      employeeMap.get(employee).push(item);
    });
    return regionMap;
  }

  function openScheduleDetail(dateString) {
    if (!scheduleDetailBackdrop || !scheduleDetailBody) return;
    selectedScheduleDate = dateString;
    const dateObj = new Date(`${dateString}T00:00:00`);
    const title = Number.isNaN(dateObj.getTime())
      ? `${dateString} 行程`
      : `${dateObj.getMonth() + 1}/${dateObj.getDate()} 行程`;
    if (scheduleDetailTitle) scheduleDetailTitle.textContent = title;

    const grouped = groupSchedulesForDetail(dateString);
    if (!grouped.size) {
      scheduleDetailBody.innerHTML = `<div class="list-item"><p>此日期目前沒有符合篩選條件的行程。</p></div>`;
    } else {
      const rows = [];
      grouped.forEach(function (departmentMap, region) {
        departmentMap.forEach(function (employeeMap, department) {
          employeeMap.forEach(function (items, employee) {
            items.forEach(function (item) {
              rows.push({
                id: item.id || "",
                region,
                department,
                employee,
                shift: normalizeScheduleShift(item.shift) || "-",
                title: item.title || item.note || "未命名",
                content: item.content || "無",
                startTime: item.startTime || "",
                canEdit: canEditScheduleItem(item)
              });
            });
          });
        });
      });

      const html = rows.map(function (row) {
        const shiftClass = getShiftClassName(row.shift);
        const shiftEmoji = getShiftEmoji(row.shift);
        const startTimeText = row.startTime ? `｜${row.startTime}` : "";
        const actionHtml = row.canEdit
          ? `<div class="item-actions schedule-item-actions">
              <button type="button" class="small-btn edit-btn" data-action="edit-schedule" data-id="${row.id}">編輯</button>
              <button type="button" class="small-btn delete-btn" data-action="delete-schedule" data-id="${row.id}">刪除</button>
            </div>`
          : "";
        return `<article class="schedule-detail-card">
          <h5>${dateString}｜${shiftEmoji ? `${shiftEmoji} ` : ""}<span class="shift ${shiftClass}">${row.shift}</span>${startTimeText}</h5>
          <p class="schedule-detail-meta">${row.employee}｜${row.region}｜${row.department}</p>
          <p><strong>標題：</strong>${row.title}</p>
          <p><strong>內容：</strong>${row.content}</p>
          ${actionHtml}
        </article>`;
      }).join("");
     
      scheduleDetailBody.innerHTML = `<div class="schedule-detail-card-list">${html}</div>`;
    }
    scheduleDetailBackdrop.classList.remove("hidden");
  }

  function refreshScheduleEmployeeOptions(defaultEmployeeId = "") {
    if (!scheduleEmployeeSelect) return;
    const selectedRegions = getSelectedValues(scheduleRegionSelect).filter((value) => value !== "__all__");
    const selectedDepartments = getSelectedValues(scheduleDepartmentSelect).filter((value) => value !== "__all__");
    const candidates = employees.filter((employee) => {
      if (employee.isHidden || employee.status === "deleted") return false;
      if (selectedRegions.length && !selectedRegions.includes(employee.region)) return false;
      if (selectedDepartments.length && !selectedDepartments.includes(employee.department)) return false;
      return true;
    });
    const selectedEmployeeIds = Array.isArray(defaultEmployeeId) ? defaultEmployeeId : (defaultEmployeeId ? [defaultEmployeeId] : []);
    scheduleEmployeeSelect.innerHTML = `${candidates.map((employee) => {
      const selected = selectedEmployeeIds.includes(employee.employeeId) ? "selected" : "";
      const department = employee.department || "-";
      const title = employee.title || "-";
      return `<option value="${employee.employeeId}" ${selected}>${employee.name || employee.employeeId}｜${department}｜${title}</option>`;
    }).join("")}`;
    setSelectedValues(
      scheduleEmployeeSelect,
      selectedEmployeeIds.filter((employeeId) => candidates.some((item) => item.employeeId === employeeId))
    );
  }

  function getSelectedValues(selectElement) {
    if (!selectElement) return [];
    return Array.from(selectElement.selectedOptions || [])
      .map((option) => option.value)
      .filter((value) => value !== "");
  }

  function setSelectedValues(selectElement, values = []) {
    if (!selectElement) return;
    const valueSet = new Set(values);
    Array.from(selectElement.options || []).forEach(function (option) {
      option.selected = valueSet.has(option.value);
    });
  }

  function populateScheduleModalOptions() {
    if (!scheduleRegionSelect || !scheduleDepartmentSelect || !currentUser) return;
    scheduleRegionSelect.innerHTML = `<option value="__all__">全部地區</option>${REGIONS.map((region) => `<option value="${region}">${region}</option>`).join("")}`;
    scheduleDepartmentSelect.innerHTML = `<option value="__all__">全部部門</option>${DEPARTMENTS.map((department) => `<option value="${department}">${department}</option>`).join("")}`;
    setSelectedValues(scheduleRegionSelect, [currentUser.region && REGIONS.includes(currentUser.region) ? currentUser.region : REGIONS[0]]);
    setSelectedValues(scheduleDepartmentSelect, [currentUser.department && DEPARTMENTS.includes(currentUser.department) ? currentUser.department : DEPARTMENTS[0]]);
    refreshScheduleEmployeeOptions("");
  }

  function openScheduleModal(dateString, scheduleItem = null) {
    if (!currentUser) return alert("請先登入");
    selectedScheduleDate = dateString;
    populateScheduleModalOptions();
    editingScheduleId = scheduleItem?.id || null;
    if (scheduleModalTitle) scheduleModalTitle.textContent = editingScheduleId ? "編輯排程" : "新增排程";
    if (saveScheduleBtn) saveScheduleBtn.textContent = editingScheduleId ? "儲存修改" : "儲存";
    if (scheduleDateLabel) scheduleDateLabel.textContent = dateString;
    if (scheduleTitleInput) scheduleTitleInput.value = scheduleItem?.title || "";
    if (scheduleContentInput) scheduleContentInput.value = scheduleItem?.content || scheduleItem?.note || "";
    if (scheduleShiftSelect) setSelectedValues(scheduleShiftSelect, [normalizeScheduleShift(scheduleItem?.shift) || "全部班別"]);
    if (scheduleItem) {
      if (scheduleRegionSelect && scheduleItem.region && REGIONS.includes(scheduleItem.region)) {
        setSelectedValues(scheduleRegionSelect, [scheduleItem.region]);
      }
      if (scheduleDepartmentSelect && scheduleItem.department && DEPARTMENTS.includes(scheduleItem.department)) {
        setSelectedValues(scheduleDepartmentSelect, [scheduleItem.department]);
      }
      refreshScheduleEmployeeOptions(scheduleItem.employeeId || "");
    }
    if (scheduleModalBackdrop) scheduleModalBackdrop.classList.remove("hidden");
    if (scheduleTitleInput) scheduleTitleInput.focus();
  }

  function closeScheduleModal() {
    editingScheduleId = null;
    if (scheduleModalTitle) scheduleModalTitle.textContent = "新增排程";
    if (saveScheduleBtn) saveScheduleBtn.textContent = "儲存";
    if (scheduleModalBackdrop) scheduleModalBackdrop.classList.add("hidden");
  }

  async function saveSchedule(data) {
    if (!db) throw new Error("Firebase 未設定");
    return addDoc(collection(db, "schedules"), data);
  }
  
  async function updateSchedule(scheduleId, data) {
    if (!db) throw new Error("Firebase 未設定");
    return updateDoc(doc(db, "schedules", scheduleId), data);
  }

  async function deleteSchedule(scheduleId) {
    if (!db) throw new Error("Firebase 未設定");
    return deleteDoc(doc(db, "schedules", scheduleId));
  }
  
  function renderSchedules() {
    if (!rosterList) return;
    if (!currentUser) {
      rosterList.innerHTML = `<div class="list-item"><p>請先登入以查看排程。</p></div>`;
      return;
    }

    const filteredSchedules = filterSchedules();
    const visibleSchedules = filteredSchedules.filter((item) => canViewScheduleItem(item));

    if (!visibleSchedules.length) {
      rosterList.innerHTML = `<div class="list-item"><p>目前沒有排程資料。</p></div>`;
      return;
    }

    rosterList.innerHTML = visibleSchedules.map((item) => {
      const itemDate = normalizeScheduleDateValue(item.date) || "-";
      const itemShift = normalizeScheduleShift(item.shift) || "-";
      const itemTitle = item.title || "";
      const itemNote = item.content || item.note || "無";
      const itemAuthor = item.employeeName || item.employeeId || "-";
      const titleHtml = itemTitle ? `<p>標題：${itemTitle}</p>` : "";
      const actionHtml = canEditScheduleItem(item)
        ? `<div class="item-actions schedule-item-actions">
            <button type="button" class="small-btn edit-btn" data-action="edit-schedule" data-id="${item.id}">編輯</button>
            <button type="button" class="small-btn delete-btn" data-action="delete-schedule" data-id="${item.id}">刪除</button>
          </div>`
        : "";
      return `<div class="list-item"><h4>${itemDate}｜${itemShift}</h4><div class="item-meta">${itemAuthor}｜${item.region || "-"}｜${item.department || "-"}</div>${titleHtml}<p>內容：${itemNote}</p>${actionHtml}</div>`;
    }).join("");
  }

  function renderLeaveStats() {
    if (!leaveStats) return;

    const visibleLeaves = leaveRequests.filter(function (item) {
      if (!currentUser) return false;
      if (item.userName === currentUser.name) return true;
      return canApproveLeaveInScope(currentUser, item);
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
      <div class="stat-card"><h4>特休</h4><p>${stats.特休}</p></div>
      <div class="stat-card"><h4>病假</h4><p>${stats.病假}</p></div>
      <div class="stat-card"><h4>事假</h4><p>${stats.事假}</p></div>
      <div class="stat-card"><h4>待審核</h4><p>${stats.待審核}</p></div>
    `;
  }

  function renderLeaves() {
    if (!leaveList) return;

    const visibleLeaves = leaveRequests.filter(function (item) {
      if (!currentUser) return false;
      if (item.userName === currentUser.name) return true;
      return canApproveLeaveInScope(currentUser, item);
    });

    renderLeaveStats();

    if (visibleLeaves.length === 0) {
      leaveList.innerHTML = `<div class="list-item"><p>目前沒有請假申請。</p></div>`;
      return;
    }

    leaveList.innerHTML = visibleLeaves
      .map(function (item) {
        let actions = "";

        if (item.status === "待審核" && canApproveLeaveInScope(currentUser, item)) {
          actions = `
            <div class="item-actions">
              <button type="button" class="small-btn approve-btn" onclick="approveLeave('${item.id}')">核准</button>
              <button type="button" class="small-btn reject-btn" onclick="rejectLeave('${item.id}')">駁回</button>
            </div>
          `;
        } else if (item.status === "待審核" && currentUser && item.userName === currentUser.name) {
          actions = `
            <div class="item-actions">
              <button type="button" class="small-btn cancel-btn" onclick="cancelLeave('${item.id}')">取消</button>
            </div>
          `;
        }

        return `
          <div class="list-item">
            <h4>${item.type}</h4>
            <div class="item-meta">
              ${item.userName || "-"}｜${item.department || "-"}｜${item.region || "-"}
            </div>
            <p>日期：${item.startDate || "-"} ～ ${item.endDate || "-"}</p>
            <p>原因：${item.reason || "-"}</p>
            <p>狀態：<span class="status-badge status-${item.status || "待審核"}">${item.status || "待審核"}</span></p>
            ${item.reviewedBy ? `<p>審核者：${item.reviewedBy}｜時間：${item.reviewedAt || "-"}</p>` : ""}
            ${actions}
          </div>
        `;
      })
      .join("");
  }

  function startLeaveMonthSettingsListener() {
    if (!db) return;
    onSnapshot(query(collection(db, "leaveMonthSettings"), orderBy("monthKey", "desc")), function (snapshot) {
      leaveMonthSettings = snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }));
      renderLeaveBoard();
      renderTodayWorkingStaff();
    });
  }

  function startLeaveAssignmentsListener() {
    if (!db) return;
    onSnapshot(query(collection(db, "leaveAssignments"), orderBy("date", "asc")), function (snapshot) {
      leaveAssignments = snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }));
      renderLeaveBoard();
      renderTodayWorkingStaff();
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

  function getLastDateOfMonth(monthKey) {
    const [year, month] = String(monthKey || "").split("-").map(Number);
    if (!year || !month) return "";
    return formatDate(new Date(year, month, 0));
  }

  function syncLeaveMonthSettingsPanel() {
    const canEditMonthSettings = isGoldBricksUser(currentUser);
    const canEditMessageBoard = isAdmin(currentUser);
    if (leaveOpenRangeEditBtn) leaveOpenRangeEditBtn.classList.toggle("hidden", !canEditMonthSettings);
    if (leaveTotalRestEditBtn) leaveTotalRestEditBtn.classList.toggle("hidden", !canEditMonthSettings);
    if (leaveMessageBoardEditBtn) leaveMessageBoardEditBtn.classList.toggle("hidden", !canEditMessageBoard);
    if (!canEditMonthSettings && !canEditMessageBoard) {
      closeLeaveSummaryEditors();
      return;
    }
    const monthSetting = getMonthSetting(currentLeaveMonth);
      if (canEditMonthSettings) {
      if (leaveOpenStartDateInput) leaveOpenStartDateInput.value = monthSetting?.openStartDate || "";
      if (leaveOpenEndDateInput) leaveOpenEndDateInput.value = monthSetting?.openEndDate || "";
    }
    if (leaveTotalRestDaysInput) {
      leaveTotalRestDaysInput.value = monthSetting?.totalRestDays != null ? String(monthSetting.totalRestDays) : "";
    }
    if (leaveMessageBoardInput && canEditMessageBoard) leaveMessageBoardInput.value = monthSetting?.messageBoardContent || "";
  }

  function closeLeaveSummaryEditors() {
    if (leaveOpenRangeEditor) leaveOpenRangeEditor.classList.add("hidden");
    if (leaveTotalRestEditor) leaveTotalRestEditor.classList.add("hidden");
    if (leaveMessageBoardEditor) leaveMessageBoardEditor.classList.add("hidden");
  }

  function clearLeaveOpenRangeDraft() {
    if (leaveOpenStartDateInput) leaveOpenStartDateInput.value = "";
    if (leaveOpenEndDateInput) leaveOpenEndDateInput.value = "";
  }

  function closeLeaveOpenRangeEditor() {
    clearLeaveOpenRangeDraft();
    closeLeaveSummaryEditors();
  }

  function toggleLeaveSummaryEditor(kind) {
    if (!isGoldBricksUser(currentUser)) return;
    if (kind === "openRange") {
      if (!leaveOpenRangeEditor) return;
      const willOpen = leaveOpenRangeEditor.classList.contains("hidden");
      closeLeaveSummaryEditors();
      leaveOpenRangeEditor.classList.toggle("hidden", !willOpen);
      return;
    }
    if (kind === "totalRest") {
      if (!leaveTotalRestEditor) return;
      const willOpen = leaveTotalRestEditor.classList.contains("hidden");
      closeLeaveSummaryEditors();
      leaveTotalRestEditor.classList.toggle("hidden", !willOpen);
       return;
    }
    if (kind === "messageBoard") {
      if (!isAdmin(currentUser) || !leaveMessageBoardEditor) return;
      const willOpen = leaveMessageBoardEditor.classList.contains("hidden");
      closeLeaveSummaryEditors();
      leaveMessageBoardEditor.classList.toggle("hidden", !willOpen);
    }
  }
  
  function getVisibleLeaveEmployees() {
    return employees.filter((employee) => {
      if (employee.isHidden || employee.status === "deleted") return false;
      if (employee.showOnLeaveBoard === false) return false;
      if (selectedRegion && employee.region !== selectedRegion) return false;
      if (selectedDepartment && employee.department !== selectedDepartment) return false;
      if (selectedShiftType && getUserShiftType(employee) !== selectedShiftType) return false;
      if (selectedEmployeeIds.length > 0 && !selectedEmployeeIds.includes(employee.employeeId)) return false;
      return true;
    });
  }
  
    function getMonthAssignments(monthKey) {
    return leaveAssignments.filter((item) => item.monthKey === monthKey);
  }

  function getAssignmentForCell(monthKey, employeeId, dateString) {
    return leaveAssignments.find((item) => item.monthKey === monthKey && item.employeeId === employeeId && item.date === dateString) || null;
  }

  function getNormalizedLeaveType(typeValue = "") {
    const normalized = String(typeValue || "").trim();
    if (!normalized) return "";
    return ALL_LEAVE_TYPES.includes(normalized) ? normalized : "";
  }

  function hasAssignmentContent(symbolTypes = [], leaveType = "") {
    return Array.isArray(symbolTypes) && symbolTypes.length > 0 || Boolean(getNormalizedLeaveType(leaveType));
  }

  function renderLeaveTypeSelectOptions(selectedValue = "") {
    const normalized = getNormalizedLeaveType(selectedValue);
    const groupsHtml = LEAVE_TYPE_GROUPS.map((group) => {
      const optionsHtml = group.options.map((option) => `<option value="${option}" ${normalized === option ? "selected" : ""}>${option}</option>`).join("");
      return `<optgroup label="${group.label}">${optionsHtml}</optgroup>`;
    }).join("");
    return `<option value="">未設定</option>${groupsHtml}`;
  }

  function hydrateLeaveTypeSelect() {
    if (!leaveType) return;
    leaveType.innerHTML = renderLeaveTypeSelectOptions(leaveType.value || "事假");
    if (!leaveType.value) leaveType.value = "事假";
  }

   function isWeekendOrHoliday(dateString) {
    const date = new Date(`${dateString}T00:00:00`);
    if (Number.isNaN(date.getTime())) return false;
    return [0, 6].includes(date.getDay()) || HOLIDAY_DATES.has(dateString);
  }

  function isAutoRestDay(employee, dateString) {
    return Boolean(employee?.weekendsOff) && isWeekendOrHoliday(dateString);
  }

     function canEditLeaveCell(targetEmployee, monthSetting) {
    const todayString = formatDate(new Date());
    const canEditInCurrentMonth = Boolean(monthSetting?.openStartDate && monthSetting?.openEndDate && todayString >= monthSetting.openStartDate && todayString <= monthSetting.openEndDate);
    const canEmployeeEdit = canEditInCurrentMonth && currentUser?.employeeId === targetEmployee.employeeId;
    const canGoldBricksEdit = isGoldBricksUser(currentUser);
    return canEmployeeEdit || canGoldBricksEdit;
  }

  function getAssignmentSymbolTypes(assignment, dateString = "") {
    if (!assignment) return [];
    const allowedSymbolTypes = getAllowedSymbolTypesForDate(dateString || assignment.date || "");
    if (Array.isArray(assignment.symbolTypes)) {
      return SYMBOL_BUTTON_ORDER.filter((type) => assignment.symbolTypes.includes(type) && allowedSymbolTypes.includes(type));
    }
    if (assignment.symbolType && SYMBOL_TYPES[assignment.symbolType] && allowedSymbolTypes.includes(assignment.symbolType)) return [assignment.symbolType];
    return [];
  }

  function getEffectiveCellSymbolTypes(employee, assignment, dateString) {
    const symbolTypes = getAssignmentSymbolTypes(assignment, dateString);
    if (symbolTypes.length) return symbolTypes;
    if (isAutoRestDay(employee, dateString)) return ["rest"];
    return [];
  }

  function getEmployeeSummaryCounts(employeeId, monthKey) {
     const employee = employees.find((item) => item.employeeId === employeeId);
    const monthDate = new Date(`${monthKey}-01T00:00:00`);
    if (!employee || Number.isNaN(monthDate.getTime())) return { rest: 0, newYear: 0, event: 0 };
    const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
    const summary = { rest: 0, newYear: 0, event: 0 };
    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateString = formatDate(new Date(monthDate.getFullYear(), monthDate.getMonth(), day));
      const assignment = getAssignmentForCell(monthKey, employeeId, dateString);
      const symbolTypes = getEffectiveCellSymbolTypes(employee, assignment, dateString);
      if (symbolTypes.some((symbolType) => ["rest", "must_rest"].includes(symbolType))) summary.rest += 1;
      if (symbolTypes.some((symbolType) => ["new_year_rest", "new_year_must_rest"].includes(symbolType))) summary.newYear += 1;
      if (symbolTypes.includes("event")) summary.event += 1;
    }
    return summary;
  }

  
  function syncLeaveFilterOptions() {
    if (!pendingSelectedEmployeeIds.length && !selectedEmployeeIds.length) pendingSelectedEmployeeIds = [];
       if (!isLeaveEmployeeFilterOpen) {
      pendingSelectedRegion = selectedRegion;
      pendingSelectedDepartment = selectedDepartment;
      pendingSelectedShiftType = selectedShiftType;
    }
  }

  function getPendingFilterCandidates() {
    return employees.filter((employee) => {
      if (employee.isHidden || employee.status === "deleted") return false;
      if (employee.showOnLeaveBoard === false) return false;
      if (pendingSelectedRegion && employee.region !== pendingSelectedRegion) return false;
      if (pendingSelectedDepartment && employee.department !== pendingSelectedDepartment) return false;
      if (pendingSelectedShiftType && getUserShiftType(employee) !== pendingSelectedShiftType) return false;
      return true;
    });
  }

  function renderLeaveToolbar() {
    if (!leaveSymbolToolbar) return;
    const visibleSymbolTypes = getAllowedSymbolTypesForMonth(currentLeaveMonth);
    if (activeSymbolType && !visibleSymbolTypes.includes(activeSymbolType)) activeSymbolType = "";
    leaveSymbolToolbar.innerHTML = visibleSymbolTypes.map((type) => {
      const meta = SYMBOL_TYPES[type];
      const activeClass = activeSymbolType === type ? "active" : "";
      return `<button type="button" class="leave-symbol-btn ${activeClass} ${meta.color === "red" ? "symbol-red" : ""}" data-symbol-type="${type}" title="${meta.label}"><span>${meta.icon}</span><small>${meta.label}</small></button>`;
    }).join("");
    if (leaveEditHint) leaveEditHint.textContent = activeSymbolType ? `目前模式：${SYMBOL_LABELS[activeSymbolType]}，點同圖示可取消模式。` : "請先選擇圖示，再點擊可編輯的格子。";
  }

   function renderLeaveEmployeeFilterPanel() {
    const candidates = getPendingFilterCandidates();
    const shiftOptions = [{ value: "", label: "全部班別" }, { value: "早班", label: "早班" }, { value: "晚班", label: "晚班" }];
    const options = candidates.map((employee) => {
      const checked = pendingSelectedEmployeeIds.includes(employee.employeeId) ? "checked" : "";
      return `<label class="leave-employee-option"><input type="checkbox" value="${employee.employeeId}" ${checked} /><span>${employee.name || employee.employeeId}</span></label>`;
    }).join("");
     return `<div class="leave-employee-filter-popover">
      <div class="section-header-row">
        <div>
          <h4>人員篩選</h4>
          <p class="helper-text">可勾選多位員工後套用顯示。</p>
        </div>
        <div class="item-actions">
          <button type="button" id="leave-employee-apply-btn" class="primary-btn">完成</button>
          <button type="button" id="leave-employee-clear-btn" class="small-btn">清除</button>
          <button type="button" id="leave-employee-cancel-btn" class="small-btn cancel-btn">取消</button>
        </div>
      </div>
      <div class="leave-employee-filter-fields">
        <label class="field-label"><span>地區</span><select id="leave-region-filter-popover"><option value="">全部地區</option>${REGIONS.map((region) => `<option value="${region}" ${pendingSelectedRegion === region ? "selected" : ""}>${region}</option>`).join("")}</select></label>
        <label class="field-label"><span>部門</span><select id="leave-department-filter-popover"><option value="">全部部門</option>${DEPARTMENTS.map((department) => `<option value="${department}" ${pendingSelectedDepartment === department ? "selected" : ""}>${department}</option>`).join("")}</select></label>
        <label class="field-label"><span>班別</span><select id="leave-shift-filter-popover">${shiftOptions.map((option) => `<option value="${option.value}" ${pendingSelectedShiftType === option.value ? "selected" : ""}>${option.label}</option>`).join("")}</select></label>
      </div>
      <div id="leave-employee-filter-list" class="leave-employee-filter-list">${options || '<p class="helper-text">目前沒有符合條件的人員。</p>'}</div>
    </div>`;
  }

  function renderLeaveBoard() {
    if (!leaveBoardTable) return;
    closeLeaveTypePicker();
    currentLeaveMonth = getMonthKey(calendarDate);
    const monthSetting = getMonthSetting(currentLeaveMonth);
    const monthDate = getCurrentLeaveMonthDate();
    const daysInMonth = getDaysInCurrentLeaveMonth();
    const visibleEmployees = getVisibleLeaveEmployees();
    if (calendarTitle) calendarTitle.textContent = `${monthDate.getFullYear()} 年 ${monthDate.getMonth() + 1} 月`;
    if (leaveOpenRange) leaveOpenRange.textContent = monthSetting?.openStartDate && monthSetting?.openEndDate ? `${monthSetting.openStartDate} ~ ${monthSetting.openEndDate}` : "尚未設定";
    if (leaveTotalRestDays) leaveTotalRestDays.textContent = monthSetting?.totalRestDays != null ? String(monthSetting.totalRestDays) : "-";
    if (leaveMessageBoardContent) {
      const messageText = String(monthSetting?.messageBoardContent || "").trim();
      leaveMessageBoardContent.textContent = messageText || "目前無留言";
    }
    syncLeaveMonthSettingsPanel();
    syncLeaveFilterOptions();
    renderLeaveToolbar();
    const filterPopover = isLeaveEmployeeFilterOpen ? renderLeaveEmployeeFilterPanel() : "";
    const selectedCount = selectedEmployeeIds.length;
    const pendingCount = pendingSelectedEmployeeIds.length;

    if (!visibleEmployees.length) {
      leaveBoardTable.innerHTML = '<div class="list-item"><p>目前沒有符合篩選條件的人員。</p></div>';
      return;
    }

     const headerDays = Array.from({ length: daysInMonth }, (_, index) => {
      const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), index + 1);
      const dateString = formatDate(date);
      const isWeekend = [0, 6].includes(date.getDay());
      const holidayName = getHolidayName(dateString);
      const isHoliday = Boolean(holidayName);
      const title = holidayName ? `${dateString}：${holidayName}` : `${dateString}（非國定假日）`;
      return `<button type="button" class="leave-day-header leave-day-header-btn ${isWeekend ? "isWeekend" : ""} ${isHoliday ? "isHoliday" : ""}" data-date="${dateString}" title="${title}"><span>${index + 1}</span><small>${["日", "一", "二", "三", "四", "五", "六"][date.getDay()]}</small></button>`;
    }).join("");

    const rows = visibleEmployees.map((employee) => {
      const canEditAny = canEditLeaveCell(employee, monthSetting);
      const counts = getEmployeeSummaryCounts(employee.employeeId, currentLeaveMonth);
      const cells = Array.from({ length: daysInMonth }, (_, index) => {
        const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), index + 1);
        const dateString = formatDate(date);
        const assignment = getAssignmentForCell(currentLeaveMonth, employee.employeeId, dateString);
        const assignedSymbolTypes = getAssignmentSymbolTypes(assignment, dateString);
        const leaveTypeValue = getNormalizedLeaveType(assignment?.leaveType || "");
        const symbolTypes = getEffectiveCellSymbolTypes(employee, assignment, dateString);
        const metas = symbolTypes.map((symbolType) => ({
          symbolType,
          ...SYMBOL_TYPES[symbolType]
        }));
        const isWeekend = [0, 6].includes(date.getDay());
        const holidayName = getHolidayName(dateString);
        const isHoliday = Boolean(holidayName);
        const holidayText = holidayName ? `｜國定假日：${holidayName}` : "";
        const autoRest = isAutoRestDay(employee, dateString) && !assignedSymbolTypes.length;
        const autoRestText = autoRest ? "｜系統帶入：週休二日 & 國定假日" : "";
        const leaveTypeText = leaveTypeValue ? `｜假別：${leaveTypeValue}` : "";
        const title = metas.length ? `${metas.map((meta) => meta.label).join(" + ")}${leaveTypeText}${holidayText}${autoRestText}` : `${dateString}${leaveTypeText}${holidayText}${autoRestText}`;
        const symbols = metas.map((meta) => `<span class="symbol ${meta.color === "red" ? "symbol-red" : ""} ${autoRest ? "symbol-auto-rest" : ""}">${meta.icon}</span>`).join("");
        const editableClass = canEditAny ? "editable" : "readonly";
        const leaveTagColor = LEAVE_TYPE_COLORS[leaveTypeValue] || "#64748b";
        const leaveTypeHtml = leaveTypeValue ? `<span class="leave-tag" style="background:${leaveTagColor}">${leaveTypeValue}</span>` : "";
        return `<button type="button" class="leave-cell ${editableClass} ${isWeekend ? "isWeekend" : ""} ${isHoliday ? "isHoliday" : ""}" data-employee-id="${employee.employeeId}" data-date="${dateString}" title="${title}"><div class="leave-cell-symbols">${symbols}</div>${leaveTypeHtml}</button>`;
      }).join("");
      return `<div class="leave-board-row" style="--days:${daysInMonth}"><div class="leave-employee-card"><strong>${employee.name || employee.employeeId}</strong><small>${employee.region || "-"}｜${employee.department || "-"}</small><small>${employee.category || getUserShiftType(employee) || "-"}</small></div><div class="leave-row-cells" style="--days:${daysInMonth}">${cells}</div><div class="leave-summary-card"><div><span>▲</span><strong>${counts.rest}</strong></div><div><span>★</span><strong>${counts.newYear}</strong></div><div><span>🎰</span><strong>${counts.event}</strong></div></div></div>`;
    }).join("");

     leaveBoardTable.innerHTML = `<div class="leave-board-head" style="--days:${daysInMonth}"><div class="leave-sticky-col"><div class="leave-sticky-col-head"><strong>人員</strong><div class="employee-filter-toggle-wrap"><small class="employee-filter-toggle-label">${selectedCount > 0 ? `已套用 ${selectedCount} 人` : `待選 ${pendingCount} 人`}</small><button type="button" id="leave-employee-toggle" class="switch ${isLeaveEmployeeFilterOpen ? "is-on" : ""}" aria-label="切換人員篩選"></button></div></div>${filterPopover}</div><div class="leave-header-days" style="--days:${daysInMonth}">${headerDays}</div><div class="leave-summary-head"><div>▲</div><div>★</div><div>🎰</div></div></div><div class="leave-board-body">${rows}</div>`;
  }
  
    function closeLeaveTypePicker() {
    const picker = document.getElementById("leave-type-picker-popover");
    if (picker) picker.remove();
    leaveTypePickerState = null;
  }

  async function saveLeaveTypeAssignment(employeeId, dateString, leaveTypeValue) {
    const targetEmployee = employees.find((employee) => employee.employeeId === employeeId);
    const monthSetting = getMonthSetting(currentLeaveMonth);
    if (!targetEmployee) return;
    if (!canEditLeaveCell(targetEmployee, monthSetting)) {
      alert("你只能在開放期間編輯自己的休假表。");
      return;
    }
    const normalizedLeaveType = getNormalizedLeaveType(leaveTypeValue);
    const existing = getAssignmentForCell(currentLeaveMonth, employeeId, dateString);
    const currentSymbolTypes = getAssignmentSymbolTypes(existing, dateString);
    if (!hasAssignmentContent(currentSymbolTypes, normalizedLeaveType)) {
      if (existing?.id) {
        if (!db) leaveAssignments = leaveAssignments.filter((item) => item.id !== existing.id);
        else await deleteDoc(doc(db, "leaveAssignments", existing.id));
      }
      renderLeaveBoard();
      return;
    }
    if (!db) {
      if (existing?.id) {
        leaveAssignments = leaveAssignments.map((item) => item.id === existing.id ? {
          ...item,
          leaveType: normalizedLeaveType,
          updatedBy: currentUser?.employeeId || "",
          updatedByName: currentUser?.name || ""
        } : item);
      } else {
        leaveAssignments = [{
          id: `local-${Date.now()}`,
          employeeId,
          employeeName: targetEmployee.name || "",
          region: targetEmployee.region || "",
          department: targetEmployee.department || "",
          category: targetEmployee.category || "",
          date: dateString,
          monthKey: currentLeaveMonth,
          symbolType: "",
          symbolTypes: [],
          leaveType: normalizedLeaveType,
          createdBy: currentUser?.employeeId || "",
          createdByName: currentUser?.name || "",
          updatedBy: currentUser?.employeeId || "",
          updatedByName: currentUser?.name || ""
        }, ...leaveAssignments];
      }
      renderLeaveBoard();
      return;
    }
    if (existing?.id) {
      await updateDoc(doc(db, "leaveAssignments", existing.id), {
        leaveType: normalizedLeaveType,
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
        symbolType: "",
        symbolTypes: [],
        leaveType: normalizedLeaveType,
        createdBy: currentUser?.employeeId || "",
        createdByName: currentUser?.name || "",
        updatedBy: currentUser?.employeeId || "",
        updatedByName: currentUser?.name || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
  }

  function openLeaveTypePicker(employeeId, dateString, cellElement) {
    if (!cellElement || !employeeId || !dateString) return;
    closeLeaveTypePicker();
    const existing = getAssignmentForCell(currentLeaveMonth, employeeId, dateString);
    const selectedType = getNormalizedLeaveType(existing?.leaveType || "");
    const picker = document.createElement("div");
    picker.id = "leave-type-picker-popover";
    picker.className = "leave-type-picker leave-type-picker-popover";
    picker.innerHTML = LEAVE_TYPE_GROUPS.map((group) => {
      const optionsHtml = group.options.map((type) => {
        const selectedClass = selectedType === type ? "is-selected" : "";
        return `<button type="button" class="leave-type-option ${selectedClass}" data-leave-type="${type}">${type}</button>`;
      }).join("");
      return `<div class="leave-type-group">${group.label}</div>${optionsHtml}`;
    }).join("") + `
      <div class="item-actions">
        <button type="button" id="leave-type-picker-clear" class="small-btn">清除假別</button>
        <button type="button" id="leave-type-picker-cancel" class="small-btn cancel-btn">取消</button>
      </div>
    `;
    document.body.appendChild(picker);
    const rect = cellElement.getBoundingClientRect();
    picker.style.top = `${Math.min(window.innerHeight - picker.offsetHeight - 12, rect.bottom + window.scrollY + 6)}px`;
    picker.style.left = `${Math.min(window.innerWidth - picker.offsetWidth - 12, rect.left + window.scrollX)}px`;
    leaveTypePickerState = { employeeId, dateString };
  }

    async function toggleLeaveAssignment(employeeId, dateString) {
    const targetEmployee = employees.find((employee) => employee.employeeId === employeeId);
    const monthSetting = getMonthSetting(currentLeaveMonth);
    if (!targetEmployee) return;
    if (!activeSymbolType) return;
    if (!canEditLeaveCell(targetEmployee, monthSetting)) {
      alert("你只能在開放期間編輯自己的休假表。");
      return;
    }
    const existing = getAssignmentForCell(currentLeaveMonth, employeeId, dateString);
    const currentSymbolTypes = getAssignmentSymbolTypes(existing, dateString);
    const nextSymbolTypeSet = new Set(currentSymbolTypes);
    if (nextSymbolTypeSet.has(activeSymbolType)) nextSymbolTypeSet.delete(activeSymbolType);
    else nextSymbolTypeSet.add(activeSymbolType);
    const allowedSymbolTypes = getAllowedSymbolTypesForDate(dateString);
    if (!allowedSymbolTypes.includes(activeSymbolType)) {
      alert("過年圖示僅能在當年春節期間使用。");
      return;
    }
    const targetSymbolTypes = allowedSymbolTypes.filter((type) => nextSymbolTypeSet.has(type));
    if (targetSymbolTypes.length > 1 && !targetSymbolTypes.includes("event")) {
      alert("只有含有 🎰（公司活動）的欄位才可多選。");
      return;
    }
    const targetSymbolType = targetSymbolTypes[0] || "";
    const monthlyRestLimit = Number(monthSetting?.totalRestDays);
    const isLimited = Number.isFinite(monthlyRestLimit) && monthlyRestLimit >= 0;
    const isTargetRestSymbol = targetSymbolTypes.some((symbolType) => ["rest", "must_rest"].includes(symbolType));
    const existingEffectiveSymbolTypes = getEffectiveCellSymbolTypes(targetEmployee, existing, dateString);

    if (isLimited && isTargetRestSymbol) {
      const counts = getEmployeeSummaryCounts(employeeId, currentLeaveMonth);
      const existingRestCount = existingEffectiveSymbolTypes.some((symbolType) => ["rest", "must_rest"].includes(symbolType)) ? 1 : 0;
      const nextRestCount = counts.rest - existingRestCount + 1;
      if (nextRestCount > monthlyRestLimit) {
        alert(`本月可排休上限為 ${monthlyRestLimit} 天，無法再新增。`);
        return;
      }
    }

      const normalizedLeaveType = getNormalizedLeaveType(existing?.leaveType || "");
    if (!db) {
      if (existing && !hasAssignmentContent(targetSymbolTypes, normalizedLeaveType)) leaveAssignments = leaveAssignments.filter((item) => item.id !== existing.id);
      else if (existing) leaveAssignments = leaveAssignments.map((item) => item.id === existing.id ? { ...item, symbolType: targetSymbolType, symbolTypes: targetSymbolTypes, updatedBy: currentUser?.employeeId || "", updatedByName: currentUser?.name || "" } : item);
      else leaveAssignments = [{ id: `local-${Date.now()}`, employeeId, employeeName: targetEmployee.name, region: targetEmployee.region, department: targetEmployee.department, category: targetEmployee.category, date: dateString, monthKey: currentLeaveMonth, symbolType: targetSymbolType, symbolTypes: targetSymbolTypes, leaveType: "", createdBy: currentUser?.employeeId || "", createdByName: currentUser?.name || "", updatedBy: currentUser?.employeeId || "", updatedByName: currentUser?.name || "" }];
      renderLeaveBoard();
      return;
    }
    try {
      if (existing && !hasAssignmentContent(targetSymbolTypes, normalizedLeaveType)) {
        await deleteDoc(doc(db, "leaveAssignments", existing.id));
      } else if (existing) {
        await updateDoc(doc(db, "leaveAssignments", existing.id), {
          symbolType: targetSymbolType,
          symbolTypes: targetSymbolTypes,
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
          symbolType: targetSymbolType,
          symbolTypes: targetSymbolTypes,
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

  async function saveLeaveMonthSettings(mode = "all") {
    const isMessageBoardMode = mode === "messageBoard";
    if (!isMessageBoardMode && !isGoldBricksUser(currentUser)) return alert("僅 GoldBricks 可設定每月排假條件。");
    if (isMessageBoardMode && !isAdmin(currentUser)) return alert("僅管理員可編輯留言版。");
    const monthKey = String(currentLeaveMonth || "").trim();
    const existing = getMonthSetting(monthKey);
    const openStartDate = String(
      mode === "totalRest" || mode === "messageBoard"
        ? (existing?.openStartDate || "")
        : (leaveOpenStartDateInput?.value || existing?.openStartDate || "")
    ).trim();
    const openEndDateRaw = String(
      mode === "totalRest" || mode === "messageBoard"
        ? (existing?.openEndDate || "")
        : (leaveOpenEndDateInput?.value || existing?.openEndDate || "")
    ).trim();
    const totalRestDaysRaw = String(
      mode === "openRange" || mode === "messageBoard"
        ? (existing?.totalRestDays != null ? String(existing.totalRestDays) : "")
        : (leaveTotalRestDaysInput?.value || (existing?.totalRestDays != null ? String(existing.totalRestDays) : ""))
    ).trim();
    const messageBoardContent = String(
      mode === "messageBoard"
        ? (leaveMessageBoardInput?.value || existing?.messageBoardContent || "")
        : (existing?.messageBoardContent || "")
    ).trim();
    if (!monthKey) return alert("目前月份無法辨識，請重新整理後再試。");
    const defaultMonthEnd = getLastDateOfMonth(monthKey);
    let openEndDate = "";
    if (openStartDate || openEndDateRaw) {
      if (!openStartDate) return alert("請設定排假開放起始日。");
      openEndDate = openEndDateRaw || defaultMonthEnd;
      if (openEndDate < openStartDate) return alert("排假截止日不可早於開放起始日。");
    }

    let totalRestDays = null;
    if (totalRestDaysRaw !== "") {
      totalRestDays = Number(totalRestDaysRaw);
      if (!Number.isFinite(totalRestDays) || totalRestDays < 0) {
        return alert("請輸入有效的本月可排休天數（0 以上）。");
      }
    }

    const payload = {
      monthKey,
      openStartDate,
      openEndDate,
      totalRestDays,
      messageBoardContent,
      updatedBy: currentUser?.employeeId || "",
      updatedByName: currentUser?.name || "",
      updatedAt: serverTimestamp()
    };
    try {
      if (!db) {
        if (existing) {
          leaveMonthSettings = leaveMonthSettings.map((item) => item.id === existing.id ? { ...item, ...payload } : item);
        } else {
          leaveMonthSettings = [{ id: `local-${Date.now()}`, ...payload }, ...leaveMonthSettings];
        }
        closeLeaveSummaryEditors();
        renderLeaveBoard();
        return;
      }

      if (existing?.id) {
        await updateDoc(doc(db, "leaveMonthSettings", existing.id), payload);
      } else {
        await addDoc(collection(db, "leaveMonthSettings"), {
          ...payload,
          createdBy: currentUser?.employeeId || "",
          createdByName: currentUser?.name || "",
          createdAt: serverTimestamp()
        });
      }
      closeLeaveSummaryEditors();
      renderLeaveBoard();
      alert("每月排假設定已儲存。");
    } catch (error) {
      console.error("儲存每月排假設定失敗", error);
      alert("儲存每月排假設定失敗，請稍後再試。");
    }
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
    const item = leaveRequests.find((request) => request.id === id);
    if (!canApproveLeaveInScope(currentUser, item)) return alert("你沒有該筆請假單審核權限");
    await updateDoc(doc(db, "leaveRequests", id), { status: "已核准", reviewedBy: currentUser.name, reviewedAt: new Date().toLocaleString() });
  };

  window.rejectLeave = async function (id) {
    if (!db) return;
    const item = leaveRequests.find((request) => request.id === id);
    if (!canApproveLeaveInScope(currentUser, item)) return alert("你沒有該筆請假單審核權限");
    await updateDoc(doc(db, "leaveRequests", id), { status: "已駁回", reviewedBy: currentUser.name, reviewedAt: new Date().toLocaleString() });
  };

  window.cancelLeave = async function (id) {
    if (!db) return;
    await updateDoc(doc(db, "leaveRequests", id), { status: "已取消", reviewedBy: currentUser.name, reviewedAt: new Date().toLocaleString() });
  };

  function setLoggedInUser(user) {
    currentUser = user;
    updateUserInfo(user);
    populateScheduleFilters();
    applyDefaultScheduleFiltersByUser(user);
    if (loginPage) loginPage.classList.add("hidden");
    if (mainPage) mainPage.classList.remove("hidden");
    persistCurrentUserSession(user);
    updateMenuPermissions(user);
    toggleEmployeeManagementUI();
    refreshAttendanceSettings();
    renderLeaves();
    renderLeaveBoard();
    renderSchedules();
    renderCoordinates();
    initMessaging();
  }

  function restoreLogin() {
    const savedSessionRaw = safeStorageGet(STORAGE_KEYS.currentUserSession);
    const savedEmployeeId = safeStorageGet(STORAGE_KEYS.currentUser);

    let savedSession = {};
    if (savedSessionRaw) {
      try {
        savedSession = JSON.parse(savedSessionRaw) || {};
      } catch (error) {
        console.warn("解析登入快取失敗，改用舊版登入資訊", error);
        safeStorageRemove(STORAGE_KEYS.currentUserSession);
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
    loginForm.addEventListener("submit", function (event) {
      event.preventDefault();

      const employeeId = document.getElementById("employeeId")?.value.trim() || "";
      const password = document.getElementById("password")?.value.trim() || "";

      const matchedUser = findLoginUser(employeeId, password);
      
      if (!matchedUser) {
        if (loginError) loginError.textContent = getLoginFailureMessage(employeeId, password);
        return;
      }

      if (loginError) loginError.textContent = "";
      setLoggedInUser(matchedUser);
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", function () {
      hideChangePasswordModal();
      currentUser = null;
      editingAnnouncementId = null;
      editingScheduleId = null;
      selectedScheduleDate = "";
      clearCurrentUserSessionCache();
      hideAnnouncementEditor();
      if (typeof closeSchedulePopover === "function") {
        closeSchedulePopover();
      }
      closeAttendanceRecordPopover();
      if (mainPage) mainPage.classList.add("hidden");
      if (loginPage) loginPage.classList.remove("hidden");
      if (loginForm) loginForm.reset();
      if (loginError) loginError.textContent = "";
      updateMenuPermissions(null);
    });
  }

  if (changePasswordBtn) {
    changePasswordBtn.addEventListener("click", showChangePasswordModal);
  }

  if (changePasswordCloseBtn) {
    changePasswordCloseBtn.addEventListener("click", hideChangePasswordModal);
  }

  if (changePasswordCancelBtn) {
    changePasswordCancelBtn.addEventListener("click", hideChangePasswordModal);
  }

  if (changePasswordBackdrop) {
    changePasswordBackdrop.addEventListener("click", function (event) {
      if (event.target === changePasswordBackdrop) hideChangePasswordModal();
    });
  }

  if (changePasswordForm) {
    changePasswordForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (!currentUser) return;

      const currentPassword = changePasswordCurrentInput?.value.trim() || "";
      const newPassword = changePasswordNewInput?.value.trim() || "";
      const confirmPassword = changePasswordConfirmInput?.value.trim() || "";

      if (!currentPassword || !newPassword || !confirmPassword) {
        if (changePasswordError) changePasswordError.textContent = "請完整填寫所有欄位。";
        return;
      }
      if (currentPassword !== (currentUser.password || "")) {
        if (changePasswordError) changePasswordError.textContent = "目前密碼不正確。";
        return;
      }
      if (newPassword.length < 4) {
        if (changePasswordError) changePasswordError.textContent = "新密碼至少需 4 碼。";
        return;
      }
      if (newPassword !== confirmPassword) {
        if (changePasswordError) changePasswordError.textContent = "新密碼與確認密碼不一致。";
        return;
      }

      try {
        await updateCurrentUserPassword(newPassword);
        hideChangePasswordModal();
        alert("密碼已更新。");
      } catch (error) {
        console.error("變更密碼失敗", error);
        if (changePasswordError) changePasswordError.textContent = "變更密碼失敗，請稍後再試。";
      }
    });
  }
  
  if (loginClearCacheBtn) {
    loginClearCacheBtn.addEventListener("click", function () {
      clearCurrentUserSessionCache();
      if (loginError) loginError.textContent = "已清除登入快取，請重新登入。";
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
      closeAttendanceRecordPopover();
      setSidebarCollapsed(true);
      
    });
  });

  if (sidebarToggleBtn) {
    sidebarToggleBtn.addEventListener("click", function () {
      const isCollapsed = mainPage?.classList.contains("sidebar-collapsed");
      setSidebarCollapsed(!isCollapsed);
    });
  }

  if (announcementForm) {
    announcementForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (!canManageAnnouncements(currentUser)) return alert("你沒有公告欄管理權限");
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
      if (!canManageAnnouncements(currentUser)) return alert("你沒有公告欄管理權限");
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
      if (!canManageEmployees(currentUser)) return alert("只有 GoldBricks 或被授權人員可建置員工基本資料");
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
      const annualLeaveExpiry = document.getElementById("employee-form-annual-leave-expiry")?.value || "";
      const travelLeaveDays = Number(document.getElementById("employee-form-travel-leave-days")?.value || 0);
      const travelLeaveExpiry = document.getElementById("employee-form-travel-leave-expiry")?.value || "";
      const roleProfile = getEmployeeRoleProfile(employeeId);
      const isSuperAdmin = isSuperAdminEmployee(employeeId);
      const canEmployeeManage = isSuperAdmin || Boolean(permissionEmployeeManageInput?.checked);
      const canAttendanceCoordinateManage = isSuperAdmin || Boolean(permissionAttendanceCoordinateInput?.checked);
      const canShiftSettingsManage = isSuperAdmin || Boolean(permissionShiftSettingsInput?.checked);
      const canLeaveApprove = isSuperAdmin || Boolean(permissionLeaveApproveInput?.checked);
      const canAnnouncementManage = isSuperAdmin || Boolean(permissionAnnouncementManageInput?.checked);
      const hasMorningShift = isSuperAdmin || Boolean(employeeShiftMorningInput?.checked);
      const hasEveningShift = isSuperAdmin || Boolean(employeeShiftEveningInput?.checked);
      const weekendsOff = isSuperAdmin ? false : Boolean(employeeWeekendsOffInput?.checked);
      const showOnLeaveBoard = isSuperAdmin ? true : Boolean(employeeShowOnLeaveBoardInput?.checked);
      const selectedManageRegions = canLeaveApprove
        ? getCheckedValues(manageRegions)
        : [];
      const selectedManageDepartments = canLeaveApprove
        ? getCheckedValues(manageDepartments)
        : [];
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
        annualLeaveExpiry,
        travelLeaveDays,
        travelLeaveExpiry,
        photoURL: photoData,
        shifts: {
          ...roleProfile.shifts,
          morning: hasMorningShift,
          evening: hasEveningShift
        },
        weekendsOff,
        showOnLeaveBoard,
        permissions: {
          ...roleProfile.permissions,
          employeeProfileManage: canEmployeeManage,
          personInfoBasicDataManage: canEmployeeManage,
          attendanceCoordinateManage: canAttendanceCoordinateManage,
          attendanceListVisible: canAttendanceCoordinateManage,
          coordinateListVisible: canAttendanceCoordinateManage,
          shiftSettingsManage: canShiftSettingsManage,
          shiftSettingsListVisible: canShiftSettingsManage,
          permissionsListVisible: canEmployeeManage,
          leaveApprove: canLeaveApprove,
          announcementManage: canAnnouncementManage,
          coordinateAdmin: canAttendanceCoordinateManage
        },
        manageScopes: canLeaveApprove
          ? {
              regions: isSuperAdmin ? [...REGIONS] : selectedManageRegions,
              departments: isSuperAdmin ? [...DEPARTMENTS] : selectedManageDepartments
            }
          : { regions: [], departments: [] },
        status: "active",
        isHidden: false,
        fcmToken: editingEmployeeId ? (employees.find((item) => item.id === editingEmployeeId)?.fcmToken || "") : "",
        notificationSettings: getDefaultNotificationSettings(
          editingEmployeeId
            ? employees.find((item) => item.id === editingEmployeeId)?.notificationSettings || {}
            : {}
        )
      };

      if (!employeeData.employeeId) return alert("請輸入員工代號");
      if (!employeeData.name) return alert("請輸入姓名");
      if (!employeeData.password) return alert("請輸入密碼");
      if (!employeeData.department) return alert("請選擇部門");
      if (!employeeData.region) return alert("請選擇地區");
      if (canLeaveApprove && !isSuperAdmin && (selectedManageRegions.length === 0 || selectedManageDepartments.length === 0)) {
        return alert("審核假別需至少勾選 1 個地區與 1 個部門");
      }
      if (!isSuperAdmin && !employeeData.shifts.morning && !employeeData.shifts.evening) return alert("員工班別尚未預設成功，請重新嘗試");

      if (!db) return alert("Firebase 未設定，無法新增員工。");

      try {
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
        if (permissionEmployeeManageInput) permissionEmployeeManageInput.checked = false;
        if (permissionAttendanceCoordinateInput) permissionAttendanceCoordinateInput.checked = false;
        if (permissionShiftSettingsInput) permissionShiftSettingsInput.checked = false;
        if (permissionLeaveApproveInput) permissionLeaveApproveInput.checked = false;
        if (permissionAnnouncementManageInput) permissionAnnouncementManageInput.checked = false;
        if (employeeShiftMorningInput) employeeShiftMorningInput.checked = true;
        if (employeeShiftEveningInput) employeeShiftEveningInput.checked = false;
        if (employeeWeekendsOffInput) employeeWeekendsOffInput.checked = false;
        if (employeeShowOnLeaveBoardInput) employeeShowOnLeaveBoardInput.checked = true;
        setCheckedValues(manageRegions, []);
        setCheckedValues(manageDepartments, []);
        setPhoto("");
        if (employeeSubmitBtn) {
          employeeSubmitBtn.textContent = "新增員工";
        }
        updateSuperAdminFormState();
      } catch (error) {
        console.error("儲存員工失敗", error);
        alert("儲存失敗");
      }
    });
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
    if (!canManageEmployees(currentUser)) return;
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
    document.getElementById("employee-form-annual-leave-expiry").value = employee.annualLeaveExpiry || "";
    document.getElementById("employee-form-travel-leave-days").value = employee.travelLeaveDays || 0;
    document.getElementById("employee-form-travel-leave-expiry").value = employee.travelLeaveExpiry || "";
    if (permissionEmployeeManageInput) permissionEmployeeManageInput.checked = Boolean(employee.permissions?.employeeProfileManage || isSuperAdminEmployee(employee.employeeId));
    if (permissionAttendanceCoordinateInput) permissionAttendanceCoordinateInput.checked = Boolean(employee.permissions?.attendanceCoordinateManage || employee.permissions?.coordinateAdmin || isSuperAdminEmployee(employee.employeeId));
    if (permissionShiftSettingsInput) permissionShiftSettingsInput.checked = Boolean(employee.permissions?.shiftSettingsManage || isSuperAdminEmployee(employee.employeeId));
    if (permissionLeaveApproveInput) permissionLeaveApproveInput.checked = Boolean(employee.permissions?.leaveApprove || isSuperAdminEmployee(employee.employeeId));
    if (permissionAnnouncementManageInput) permissionAnnouncementManageInput.checked = Boolean(employee.permissions?.announcementManage || isSuperAdminEmployee(employee.employeeId));
    if (employeeShiftMorningInput) employeeShiftMorningInput.checked = Boolean(employee.shifts?.morning || isSuperAdminEmployee(employee.employeeId));
    if (employeeShiftEveningInput) employeeShiftEveningInput.checked = Boolean(employee.shifts?.evening || isSuperAdminEmployee(employee.employeeId));
    if (employeeWeekendsOffInput) employeeWeekendsOffInput.checked = Boolean(employee.weekendsOff);
    if (employeeShowOnLeaveBoardInput) employeeShowOnLeaveBoardInput.checked = employee.showOnLeaveBoard !== false;
    const selectedRegions = isSuperAdminEmployee(employee.employeeId)
      ? [...REGIONS]
      : (employee.manageScopes?.regions || []);
    const selectedDepartments = isSuperAdminEmployee(employee.employeeId)
      ? [...DEPARTMENTS]
      : (employee.manageScopes?.departments || []);
    setCheckedValues(manageRegions, selectedRegions);
    setCheckedValues(manageDepartments, selectedDepartments);
    setPhoto(employee.photoURL || "");   

    if (employeeSubmitBtn) {
      employeeSubmitBtn.textContent = "更新員工";
    }

    updateSuperAdminFormState();
    employeeForm?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  updateSuperAdminFormState();
  setPhoto("");
  hydrateLeaveTypeSelect();

  window.deleteEmployee = async function (id) {
    if (!canManageEmployees(currentUser)) return;
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
      const selectedLeaveType = getNormalizedLeaveType(leaveType?.value || "");
      if (!startDate || !endDate || !reason) return alert("請填寫完整請假資料");
      if (!selectedLeaveType) return alert("請先選擇假別");
      if (startDate > endDate) return alert("開始日期不能晚於結束日期");
      if (!db) return alert("Firebase 未設定");
      try {
        await addDoc(collection(db, "leaveRequests"), {
          userName: currentUser.name,
          department: currentUser.department,
          region: currentUser.region,
          type: selectedLeaveType,
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
        if (leaveType) leaveType.value = "事假";
      } catch (error) {
        console.error("請假新增失敗", error);
        alert("請假送出失敗");
      }
    });
  }

  if (rosterForm) {
    rosterForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      const date = rosterDate?.value || "";
      const shift = rosterShift?.value || "";
      const note = rosterNote?.value.trim() || "";
      if (!currentUser) return alert("請先登入");
      if (!date || !shift) return alert("請填寫完整排程資料");

      const payload = {
        date,
        shift,
        title: "",
        content: note,
        note,
        employeeId: currentUser.employeeId || "",
        employeeName: currentUser.name || "",
        region: currentUser.region || "",
        department: currentUser.department || "",
        updatedAt: serverTimestamp()
      };

      try {
        if (!db) {
          schedules = [{ id: `local-${Date.now()}`, ...payload }, ...schedules];
          renderSchedules();
          renderRosterCalendar();
          rosterForm.reset();
          return;
        }
        await addDoc(collection(db, "schedules"), {
          ...payload,
          createdAt: serverTimestamp(),
          createdAtClient: new Date()
        });
        rosterForm.reset();
      } catch (error) {
        console.error("儲存排程失敗", error);
        alert("儲存排程失敗，請稍後再試。");
      }
    });
  }

  if (rosterPrevMonthBtn) {
    rosterPrevMonthBtn.addEventListener("click", function () {
      rosterCalendarDate.setMonth(rosterCalendarDate.getMonth() - 1);
      renderRosterCalendar();
    });
  }

  if (rosterNextMonthBtn) {
    rosterNextMonthBtn.addEventListener("click", function () {
      rosterCalendarDate.setMonth(rosterCalendarDate.getMonth() + 1);
      renderRosterCalendar();
    });
  }

  [filterRegion, filterDepartment, filterEmployee, filterShift].forEach(function (el) {
    if (!el) return;
    el.addEventListener("change", function () {
      if (el === filterRegion || el === filterDepartment) {
        refreshScheduleFilterEmployeeOptions(filterEmployee?.value || "");
      }
      renderSchedules();
      renderRosterCalendar();
    });
  });

  if (openScheduleCreateBtn) {
    openScheduleCreateBtn.addEventListener("click", function () {
      const fallbackDate = formatDate(new Date());
      openScheduleModal(selectedScheduleDate || fallbackDate);
    });
  }

  if (scheduleRegionSelect) {
    scheduleRegionSelect.addEventListener("change", function () {
      refreshScheduleEmployeeOptions(getSelectedValues(scheduleEmployeeSelect));
    });
  }

  if (scheduleDepartmentSelect) {
    scheduleDepartmentSelect.addEventListener("change", function () {
      refreshScheduleEmployeeOptions(getSelectedValues(scheduleEmployeeSelect));
    });
  }

  if (scheduleModalClose) scheduleModalClose.addEventListener("click", closeScheduleModal);
  if (scheduleModalBackdrop) {
    scheduleModalBackdrop.addEventListener("click", function (event) {
      if (event.target === scheduleModalBackdrop) closeScheduleModal();
    });
  }

  if (scheduleDetailClose) scheduleDetailClose.addEventListener("click", closeSchedulePopover);
  if (scheduleDetailBackdrop) {
    scheduleDetailBackdrop.addEventListener("click", function (event) {
      if (event.target === scheduleDetailBackdrop) closeSchedulePopover();
    });
  }
  if (scheduleDetailAddBtn) {
    scheduleDetailAddBtn.addEventListener("click", function () {
      if (!selectedScheduleDate) return;
      closeSchedulePopover();
      openScheduleModal(selectedScheduleDate);
    });
  }
  if (scheduleDetailBody) {
    scheduleDetailBody.addEventListener("click", async function (event) {
      const actionButton = event.target.closest("button[data-action]");
      if (!actionButton) return;
      const action = actionButton.dataset.action || "";
      const scheduleId = actionButton.dataset.id || "";
      const targetSchedule = schedules.find((item) => item.id === scheduleId);
      if (!targetSchedule) return alert("找不到該行程，請重新整理後再試。");
      if (!canEditScheduleItem(targetSchedule)) return alert("你沒有編輯此行程的權限。");

      if (action === "edit-schedule") {
        closeSchedulePopover();
        openScheduleModal(targetSchedule.date || selectedScheduleDate, targetSchedule);
        return;
      }

      if (action === "delete-schedule") {
        if (!confirm("確定要刪除此行程嗎？")) return;
        try {
          if (!db) {
            schedules = schedules.filter((item) => item.id !== scheduleId);
            renderSchedules();
            renderRosterCalendar();
            openScheduleDetail(selectedScheduleDate);
            return;
          }
          await deleteSchedule(scheduleId);
        } catch (error) {
          console.error("刪除行程失敗", error);
          alert("刪除行程失敗，請稍後再試。");
        }
      }
    });
  }
  if (rosterList) {
    rosterList.addEventListener("click", async function (event) {
      const actionButton = event.target.closest("button[data-action]");
      if (!actionButton) return;
      const action = actionButton.dataset.action || "";
      const scheduleId = actionButton.dataset.id || "";
      const targetSchedule = schedules.find((item) => item.id === scheduleId);
      if (!targetSchedule) return alert("找不到該行程，請重新整理後再試。");
      if (!canEditScheduleItem(targetSchedule)) return alert("你沒有編輯此行程的權限。");

      if (action === "edit-schedule") {
        openScheduleModal(normalizeScheduleDateValue(targetSchedule.date) || formatDate(new Date()), targetSchedule);
        return;
      }

      if (action === "delete-schedule") {
        if (!confirm("確定要刪除此行程嗎？")) return;
        try {
          if (!db) {
            schedules = schedules.filter((item) => item.id !== scheduleId);
            renderSchedules();
            renderRosterCalendar();
            if (selectedScheduleDate) openScheduleDetail(selectedScheduleDate);
            return;
          }
          await deleteSchedule(scheduleId);
        } catch (error) {
          console.error("刪除行程失敗", error);
          alert("刪除行程失敗，請稍後再試。");
        }
      }
    });
  }

  if (saveScheduleBtn) {
    saveScheduleBtn.addEventListener("click", async function () {
      const title = scheduleTitleInput?.value.trim() || "";
      const content = scheduleContentInput?.value.trim() || "";
      const selectedRegions = getSelectedValues(scheduleRegionSelect).filter((value) => value !== "__all__");
      const selectedDepartments = getSelectedValues(scheduleDepartmentSelect).filter((value) => value !== "__all__");
      const selectedEmployeeIds = getSelectedValues(scheduleEmployeeSelect);
      const selectedShifts = getSelectedValues(scheduleShiftSelect);
      if (!currentUser) return alert("請先登入");
      if (!selectedScheduleDate) return alert("請先選擇日期");
      if (!title) return alert("請輸入標題");
      if (!selectedRegions.length && !selectedEmployeeIds.length) return alert("請至少選擇 1 個地區或員工");
      if (!selectedDepartments.length && !selectedEmployeeIds.length) return alert("請至少選擇 1 個部門或員工");
      if (!selectedShifts.length) return alert("請至少選擇 1 個班別");

      const selectedEmployees = selectedEmployeeIds
        .map((employeeId) => employees.find((item) => item.employeeId === employeeId))
        .filter(Boolean);
      if (selectedEmployeeIds.length && selectedEmployees.length !== selectedEmployeeIds.length) {
        return alert("請選擇有效員工");
      }

      const normalizedRegions = selectedRegions.length ? selectedRegions : [currentUser.region || ""];
      const normalizedDepartments = selectedDepartments.length ? selectedDepartments : [currentUser.department || ""];
      const baseRows = selectedEmployees.length
        ? selectedEmployees.map((employeeRecord) => ({
            region: employeeRecord.region || currentUser.region || "",
            department: employeeRecord.department || currentUser.department || "",
            employeeId: employeeRecord.employeeId || "",
            employeeName: employeeRecord.name || employeeRecord.employeeId || "全部員工"
          }))
        : normalizedRegions.flatMap((region) => normalizedDepartments.map((department) => ({
            region,
            department,
            employeeId: "",
            employeeName: "全部員工"
          })));

      const payloads = baseRows.flatMap((row) => selectedShifts.map((shift) => ({
        date: selectedScheduleDate,
        title,
        content,
        note: content,
        region: row.region,
        department: row.department,
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        shift,
        createdBy: currentUser.employeeId || "",
        createdByName: currentUser.name || "",
        updatedAt: serverTimestamp()
      })));

      const dedupMap = new Map();
      payloads.forEach((item) => {
        const key = [item.date, item.region, item.department, item.employeeId, item.shift, item.title, item.content].join("__");
        if (!dedupMap.has(key)) dedupMap.set(key, item);
      });
      const finalPayloads = Array.from(dedupMap.values());
      if (editingScheduleId && finalPayloads.length > 1) {
        return alert("編輯模式一次僅能儲存 1 筆排程，請改用新增模式批次通知。");
      }
      try {
        if (!db) {
          if (editingScheduleId && finalPayloads.length === 1) {
            schedules = schedules.map((item) => (item.id === editingScheduleId
              ? { ...item, ...finalPayloads[0], updatedAt: new Date(), updatedBy: currentUser.employeeId || "", updatedByName: currentUser.name || "" }
              : item));
          } else {
            const localRows = finalPayloads.map((payload, index) => ({ id: `local-${Date.now()}-${index}`, ...payload }));
            schedules = [...localRows, ...schedules.filter((item) => item.id !== editingScheduleId)];
          }
          renderSchedules();
          renderRosterCalendar();
          closeScheduleModal();
          return;
        }
        if (editingScheduleId && finalPayloads.length === 1) {
          await updateSchedule(editingScheduleId, {
            ...finalPayloads[0],
            updatedAt: serverTimestamp(),
            updatedBy: currentUser.employeeId || "",
            updatedByName: currentUser.name || ""
          });
          schedules = schedules.map((item) => (item.id === editingScheduleId
            ? { ...item, ...finalPayloads[0], updatedAt: new Date(), updatedBy: currentUser.employeeId || "", updatedByName: currentUser.name || "" }
            : item));
        } else {
          await Promise.all(finalPayloads.map((payload) => saveSchedule({
            ...payload,
            createdAt: serverTimestamp(),
            createdAtClient: new Date()
          })));
          const localRows = finalPayloads.map((payload, index) => ({ id: `pending-${Date.now()}-${index}`, ...payload, createdAtClient: new Date() }));
          schedules = [...localRows, ...schedules.filter((item) => item.id !== editingScheduleId)];
        }
        renderSchedules();
        renderRosterCalendar();
        closeScheduleModal();
      } catch (error) {
        console.error("儲存排程失敗", error);
        alert("儲存排程失敗，請稍後再試。");
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
        const isEditingCurrentScope = editingShiftRule?.scope === scope && editingShiftRule?.id;
        const editingId = isEditingCurrentScope ? String(editingShiftRule.id) : "";
        const isEditingDefaultTemplate = scope === "template" && editingId.startsWith("template-");
        if (!db) {
          const localId = isEditingCurrentScope ? editingId : (existing?.id || `${targetCollection}-${Date.now()}`);
          const localItem = { id: localId, ...payload };
          if (scope === "employee") employeeShiftSettings = existing ? employeeShiftSettings.map((item) => item.id === existing.id ? localItem : item) : [localItem, ...employeeShiftSettings];
          else shiftTemplates = existing ? shiftTemplates.map((item) => item.id === existing.id ? localItem : item) : [localItem, ...shiftTemplates];
          editingShiftRule = null;
          refreshShiftSettingViews();
          refreshAttendanceSettings();
          return;
        }
        if (isEditingCurrentScope && !isEditingDefaultTemplate) {
          await updateDoc(doc(db, targetCollection, editingId), payload);
        } else if (existing?.id && !String(existing.id).startsWith("template-")) {
          await updateDoc(doc(db, targetCollection, existing.id), payload);
        } else {
          await addDoc(collection(db, targetCollection), { ...payload, createdAt: serverTimestamp(), isDefault: false });
        }
        editingShiftRule = null;
      } catch (error) {
        console.error("儲存班別設定失敗", error);
        if (error?.code === "permission-denied") {
          alert("儲存失敗：目前帳號沒有修改班別規則權限，請聯絡管理員。");
          return;
        }
        alert("儲存班別設定失敗");
      }
    });
  }
  
  if (shiftSettingsList) {
    shiftSettingsList.addEventListener("click", function (event) {
      const actionButton = event.target.closest("button[data-action]");
      if (!actionButton) return;
      const action = actionButton.dataset.action || "";
      const scope = actionButton.dataset.scope || "";
      const id = actionButton.dataset.id || "";
      if (!scope || !id) return;
      if (action === "edit-shift-rule") {
        loadShiftRuleToForm(scope, id);
      } else if (action === "delete-shift-rule") {
        deleteShiftRule(scope, id);
      }
    });
  }
  
  if (shiftRulesResetBtn) {
    shiftRulesResetBtn.addEventListener("click", function () {
      resetAllShiftRuleTimes();
    });
  }
  
  
  if (attendanceFilterBtn) {
    attendanceFilterBtn.addEventListener("click", function () {
      renderAttendanceRecords();
    });
  }

   if (clockInBtn) {
    clockInBtn.addEventListener("click", function () {
      handleClock("clockIn");
    });
  }

  if (clockOutBtn) {
    clockOutBtn.addEventListener("click", function () {
      handleClock("clockOut");
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

  if (todayAttendanceStaffList) {
    todayAttendanceStaffList.addEventListener("click", function (event) {
      if (!canViewTodayAttendanceStaff(currentUser)) return;
      const button = event.target.closest(".today-attendance-employee-btn[data-attendance-employee-name]");
      if (!button) return;
      const employeeName = button.dataset.attendanceEmployeeName || "";
      const employeeId = button.dataset.attendanceEmployeeId || "";
      const todayKey = formatDateKey(new Date());
      const records = getVisibleAttendanceRecordsByPermission().filter(function (item) {
        const samePerson = employeeId ? item.employeeId === employeeId : (item.employeeName || "") === employeeName;
        return samePerson && formatDateKey(item.createdAtClient) === todayKey;
      });
      if (!records.length) return;
      openAttendanceRecordPopover({
        employeeName: employeeName || records[0]?.employeeName || "未知員工",
        employeeId: employeeId || records[0]?.employeeId || "",
        records
      });
    });
  }

  if (attendanceRecordPopoverClose) {
    attendanceRecordPopoverClose.addEventListener("click", closeAttendanceRecordPopover);
  }

  if (attendanceRecordPopoverBackdrop) {
    attendanceRecordPopoverBackdrop.addEventListener("click", function (event) {
      if (event.target === attendanceRecordPopoverBackdrop) closeAttendanceRecordPopover();
    });
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
      const toggleButton = event.target.closest("#leave-employee-toggle");
      if (toggleButton) {
        if (!isLeaveEmployeeFilterOpen) {
          pendingSelectedEmployeeIds = [...selectedEmployeeIds];
          pendingSelectedRegion = selectedRegion;
          pendingSelectedDepartment = selectedDepartment;
          pendingSelectedShiftType = selectedShiftType;
        }
        isLeaveEmployeeFilterOpen = !isLeaveEmployeeFilterOpen;
        renderLeaveBoard();
        return;
      }

      const applyButton = event.target.closest("#leave-employee-apply-btn");
      if (applyButton) {
        selectedEmployeeIds = [...pendingSelectedEmployeeIds];
        selectedRegion = pendingSelectedRegion;
        selectedDepartment = pendingSelectedDepartment;
        selectedShiftType = pendingSelectedShiftType;
        isLeaveEmployeeFilterOpen = false;
        renderLeaveBoard();
        return;
      }

      const clearButton = event.target.closest("#leave-employee-clear-btn");
      if (clearButton) {
        pendingSelectedEmployeeIds = [];
        pendingSelectedRegion = "";
        pendingSelectedDepartment = "";
        pendingSelectedShiftType = "";
        renderLeaveBoard();
        return;
      }

      const cancelButton = event.target.closest("#leave-employee-cancel-btn");
      if (cancelButton) {
        pendingSelectedEmployeeIds = [...selectedEmployeeIds];
        pendingSelectedRegion = selectedRegion;
        pendingSelectedDepartment = selectedDepartment;
        pendingSelectedShiftType = selectedShiftType;
        isLeaveEmployeeFilterOpen = false;
        renderLeaveBoard();
        return;
      }
      
      const headerDateButton = event.target.closest(".leave-day-header-btn[data-date]");
      if (headerDateButton) {
        const dateString = String(headerDateButton.dataset.date || "").trim();
        if (!dateString) return;
        const holidayName = getHolidayName(dateString);
        alert(holidayName ? `${dateString}：${holidayName}` : `${dateString}：非國定假日`);
        return;
      }
      
      const cell = event.target.closest(".leave-cell[data-employee-id][data-date]");
      if (!cell) return;
      if (!cell.classList.contains("editable")) return;
      const employeeId = cell.dataset.employeeId || "";
      const dateString = cell.dataset.date || "";
      if (activeSymbolType) {
        toggleLeaveAssignment(employeeId, dateString);
        return;
      }
      openLeaveTypePicker(employeeId, dateString, cell);
    });
    
    leaveBoardTable.addEventListener("change", function (event) {
      const checkbox = event.target.closest('#leave-employee-filter-list input[type="checkbox"]');
      if (checkbox) {
        pendingSelectedEmployeeIds = Array.from(leaveBoardTable.querySelectorAll('#leave-employee-filter-list input[type="checkbox"]:checked')).map((input) => input.value);
        renderLeaveBoard();
        return;
      }
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;
      if (target.id === "leave-region-filter-popover") pendingSelectedRegion = target.value || "";
      if (target.id === "leave-department-filter-popover") pendingSelectedDepartment = target.value || "";
      if (target.id === "leave-shift-filter-popover") pendingSelectedShiftType = target.value || "";
      renderLeaveBoard();
    });
  }
 
  if (leaveOpenRangeEditBtn) leaveOpenRangeEditBtn.addEventListener("click", function () { toggleLeaveSummaryEditor("openRange"); });
  if (leaveTotalRestEditBtn) leaveTotalRestEditBtn.addEventListener("click", function () { toggleLeaveSummaryEditor("totalRest"); });
  if (leaveMessageBoardEditBtn) leaveMessageBoardEditBtn.addEventListener("click", function () { toggleLeaveSummaryEditor("messageBoard"); });
  if (leaveOpenRangeClearBtn) leaveOpenRangeClearBtn.addEventListener("click", clearLeaveOpenRangeDraft);
  if (leaveOpenRangeCloseBtn) leaveOpenRangeCloseBtn.addEventListener("click", closeLeaveOpenRangeEditor);
  if (leaveTotalRestCloseBtn) leaveTotalRestCloseBtn.addEventListener("click", closeLeaveSummaryEditors);
  if (leaveMessageBoardCloseBtn) leaveMessageBoardCloseBtn.addEventListener("click", closeLeaveSummaryEditors);
  if (leaveOpenRangeSaveBtn) leaveOpenRangeSaveBtn.addEventListener("click", function () { saveLeaveMonthSettings("openRange"); });
  if (leaveTotalRestSaveBtn) leaveTotalRestSaveBtn.addEventListener("click", function () { saveLeaveMonthSettings("totalRest"); });
  if (leaveMessageBoardSaveBtn) leaveMessageBoardSaveBtn.addEventListener("click", function () { saveLeaveMonthSettings("messageBoard"); });
  document.addEventListener("click", function (event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest("#leave-type-picker-popover")) return;
    if (leaveOpenRangeCard?.contains(target)) return;
    if (leaveTotalRestCard?.contains(target)) return;
    if (leaveMessageBoardCard?.contains(target)) return;
    closeLeaveSummaryEditors();
    closeLeaveTypePicker();
  });
  document.addEventListener("click", async function (event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.id === "leave-type-picker-cancel") {
      closeLeaveTypePicker();
      return;
    }
    if (target.id === "leave-type-picker-clear") {
      if (!leaveTypePickerState) {
        closeLeaveTypePicker();
        return;
      }
      try {
        await saveLeaveTypeAssignment(leaveTypePickerState.employeeId, leaveTypePickerState.dateString, "");
      } catch (error) {
        console.error("儲存假別失敗", error);
        alert("儲存假別失敗，請稍後再試。");
      } finally {
        closeLeaveTypePicker();
      }
      return;
    }
    const leaveTypeOption = target.closest(".leave-type-option[data-leave-type]");
    if (leaveTypeOption instanceof HTMLElement) {
      if (!leaveTypePickerState) {
        closeLeaveTypePicker();
        return;
      }
      try {
        await saveLeaveTypeAssignment(leaveTypePickerState.employeeId, leaveTypePickerState.dateString, leaveTypeOption.dataset.leaveType || "");
      } catch (error) {
        console.error("儲存假別失敗", error);
        alert("儲存假別失敗，請稍後再試。");
      } finally {
        closeLeaveTypePicker();
      }
    }
  });

  function updatePermissionEditorLeaveScopeVisibility() {
    if (!permissionLeaveApproveScopeBox) return;
    permissionLeaveApproveScopeBox.classList.toggle("hidden", !permLeaveApproveInput?.checked);
  }
  
    function closePermissionEditor() {
    editingPermissionEmployeeId = null;
    permissionEditorBackdrop?.classList.add("hidden");
  }

  function openPermissionEditor(employeeId = "") {
    if (!canManageEmployees(currentUser)) return alert("你沒有權限設定員工功能權限");
    const employee = employees.find((item) => item.id === employeeId);
    if (!employee) return;
    const normalizedPermissions = normalizeEmployeePermissions(employee.permissions || {});
    editingPermissionEmployeeId = employeeId;
    if (permissionEditorTarget) permissionEditorTarget.textContent = `${employee.name || "未命名員工"}（${employee.employeeId || "-"}）｜${employee.department || "-"}｜${employee.title || "-"}`;
    if (permAnnouncementManageInput) permAnnouncementManageInput.checked = Boolean(normalizedPermissions.announcementManage);
    if (permShiftMorningInput) permShiftMorningInput.checked = Boolean(employee.shifts?.morning);
    if (permShiftEveningInput) permShiftEveningInput.checked = Boolean(employee.shifts?.evening);
    if (permWeekendsOffInput) permWeekendsOffInput.checked = Boolean(employee.weekendsOff);
    if (permShowOnLeaveBoardInput) permShowOnLeaveBoardInput.checked = employee.showOnLeaveBoard !== false;
    if (permEmployeeProfileManageInput) permEmployeeProfileManageInput.checked = Boolean(normalizedPermissions.employeeProfileManage);
    if (permPermissionsListVisibleInput) permPermissionsListVisibleInput.checked = Boolean(normalizedPermissions.permissionsListVisible);
    if (permShiftSettingsListVisibleInput) permShiftSettingsListVisibleInput.checked = Boolean(normalizedPermissions.shiftSettingsListVisible);
    if (permLeaveApproveInput) permLeaveApproveInput.checked = Boolean(normalizedPermissions.leaveApprove);
    if (permAttendanceListVisibleInput) permAttendanceListVisibleInput.checked = Boolean(normalizedPermissions.attendanceListVisible);
    if (permCoordinateListVisibleInput) permCoordinateListVisibleInput.checked = Boolean(normalizedPermissions.coordinateListVisible);
    const currentRegions = Array.isArray(employee.manageScopes?.regions) ? employee.manageScopes.regions : [];
    const currentDepartments = Array.isArray(employee.manageScopes?.departments) ? employee.manageScopes.departments : [];
    setCheckedValues(permManageRegions, currentRegions);
    setCheckedValues(permManageDepartments, currentDepartments);
    updatePermissionEditorLeaveScopeVisibility();
    permissionEditorBackdrop?.classList.remove("hidden");
  }

    if (permissionsEmployeeList) {
    permissionsEmployeeList.addEventListener("click", function (event) {
      const target = event.target.closest('button[data-action="open-permission-editor"]');
      if (!target) return;
      openPermissionEditor(target.dataset.id || "");
    });
  }

      if (permLeaveApproveInput) permLeaveApproveInput.addEventListener("change", updatePermissionEditorLeaveScopeVisibility);
  if (permissionEditorCloseBtn) permissionEditorCloseBtn.addEventListener("click", closePermissionEditor);
  if (permissionEditorBackdrop) {
    permissionEditorBackdrop.addEventListener("click", function (event) {
      if (event.target === permissionEditorBackdrop) closePermissionEditor();
    });
  }
  
  if (permissionEditorForm) {
    permissionEditorForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (!editingPermissionEmployeeId) return;
      const employee = employees.find((item) => item.id === editingPermissionEmployeeId);
      if (!employee) return;
      if (isSuperAdminEmployee(employee.employeeId)) return alert("最高權限帳號不需調整功能權限");
      const leaveApproveEnabled = Boolean(permLeaveApproveInput?.checked);
      const nextManageScopes = leaveApproveEnabled
        ? {
            regions: getCheckedValues(permManageRegions),
            departments: getCheckedValues(permManageDepartments)
          }
        : { regions: [], departments: [] };
      if (leaveApproveEnabled && (nextManageScopes.regions.length === 0 || nextManageScopes.departments.length === 0)) {
        return alert("審核假別需至少勾選 1 個地區與 1 個部門");
      }
      const nextPermissions = normalizeEmployeePermissions({
        ...(employee.permissions || {}),
        announcementManage: Boolean(permAnnouncementManageInput?.checked),
        employeeProfileManage: Boolean(permEmployeeProfileManageInput?.checked),
        personInfoBasicDataManage: Boolean(permEmployeeProfileManageInput?.checked),
        permissionsListVisible: Boolean(permPermissionsListVisibleInput?.checked),
        shiftSettingsListVisible: Boolean(permShiftSettingsListVisibleInput?.checked),
        leaveApprove: leaveApproveEnabled,
        attendanceListVisible: Boolean(permAttendanceListVisibleInput?.checked),
        coordinateListVisible: Boolean(permCoordinateListVisibleInput?.checked),
        attendanceCoordinateManage: Boolean(permAttendanceListVisibleInput?.checked || permCoordinateListVisibleInput?.checked),
        shiftSettingsManage: Boolean(permShiftSettingsListVisibleInput?.checked),
        coordinateAdmin: Boolean(permCoordinateListVisibleInput?.checked)
      });
      const nextShifts = {
        morning: Boolean(permShiftMorningInput?.checked),
        evening: Boolean(permShiftEveningInput?.checked)
      };
      if (!nextShifts.morning && !nextShifts.evening) return alert("至少需勾選一種班別");

      employees = employees.map((item) => item.id === editingPermissionEmployeeId
        ? { ...item, permissions: nextPermissions, shifts: nextShifts, weekendsOff: Boolean(permWeekendsOffInput?.checked), showOnLeaveBoard: Boolean(permShowOnLeaveBoardInput?.checked), manageScopes: nextManageScopes }
        : item);
      renderEmployees();
      try {
        if (db) {
          await updateDoc(doc(db, "employees", editingPermissionEmployeeId), {
            permissions: nextPermissions,
            shifts: nextShifts,
            weekendsOff: Boolean(permWeekendsOffInput?.checked),
            showOnLeaveBoard: Boolean(permShowOnLeaveBoardInput?.checked),
            manageScopes: nextManageScopes,
            updatedAt: serverTimestamp()
          });
        }
        closePermissionEditor();
      } catch (error) {
        console.error("更新員工權限失敗", error);
        alert("儲存權限失敗，請稍後再試");
      }
    });
  }
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
  populateScheduleFilters();
  setLoginLoadingState(false, "");
  startEmployeesListener();

  renderLeaves();
  renderLeaveBoard();
  renderTodayWorkingStaff();
  renderSchedules();
  renderRosterCalendar();

  startAnnouncementsListener();
  startLeaveListener();
  startSchedulesListener();
  startLeaveMonthSettingsListener();
  startLeaveAssignmentsListener();
  startAttendanceLocationsListener();
  startShiftSettingsListener();
  refreshAttendanceSettings();
  startAttendanceRecordsListener();
  renderAttendanceRecords();
});
