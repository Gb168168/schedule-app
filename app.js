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

  const leaveForm = document.getElementById("leave-form");
  const leaveType = document.getElementById("leave-type");
  const leaveStart = document.getElementById("leave-start");
  const leaveEnd = document.getElementById("leave-end");
  const leaveReason = document.getElementById("leave-reason");
  const leaveList = document.getElementById("leave-list");

  const scheduleForm = document.getElementById("schedule-form");
  const scheduleDate = document.getElementById("schedule-date");
  const scheduleTitle = document.getElementById("schedule-title");
  const scheduleContent = document.getElementById("schedule-content");
  const scheduleList = document.getElementById("schedule-list");

  function updateUserInfo(user) {
    currentUserName.textContent = user.name;
    userRole.textContent = user.role;
    userRegion.textContent = user.region;
    userDepartment.textContent = user.department;

    staffName.textContent = user.name;
    staffRole.textContent = user.role;
    staffRegion.textContent = user.region;
    staffDepartment.textContent = user.department;
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
        return `
          <div class="list-item">
            <h4>${item.title}</h4>
            <div class="item-meta">發布者：${item.author}｜時間：${item.createdAt}</div>
            <p>${item.content}</p>
            <div class="item-actions">
              <button class="small-btn delete-btn" onclick="deleteAnnouncement('${item.id}')">刪除</button>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderLeaves() {
    if (!leaveList) return;

    const visibleLeaves = isAdmin(currentUser)
      ? leaveRequests
      : leaveRequests.filter(function (item) {
          return currentUser && item.userName === currentUser.name;
        });

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
          actionButtons = `
            <div class="item-actions">
              <button class="small-btn approve-btn" onclick="approveLeave('${item.id}')">核准</button>
              <button class="small-btn reject-btn" onclick="rejectLeave('${item.id}')">駁回</button>
            </div>
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
            ${actionButtons}
          </div>
        `;
      })
      .join("");
  }

  function renderSchedules() {
    if (!scheduleList) return;

    if (schedules.length === 0) {
      scheduleList.innerHTML = `<div class="list-item"><p>目前沒有排程。</p></div>`;
      return;
    }

    scheduleList.innerHTML = schedules
      .slice()
      .sort(function (a, b) {
        return a.date.localeCompare(b.date);
      })
      .map(function (item) {
        return `
          <div class="list-item">
            <h4>${item.title}</h4>
            <div class="item-meta">日期：${item.date}｜建立者：${item.author}</div>
            <p>${item.content}</p>
            <div class="item-actions">
              <button class="small-btn delete-btn" onclick="deleteSchedule('${item.id}')">刪除</button>
            </div>
          </div>
        `;
      })
      .join("");
  }

  window.deleteAnnouncement = function (id) {
    announcements = announcements.filter(function (item) {
      return item.id !== id;
    });
    saveData(STORAGE_KEYS.announcements, announcements);
    renderAnnouncements();
  };

  window.deleteSchedule = function (id) {
    schedules = schedules.filter(function (item) {
      return item.id !== id;
    });
    saveData(STORAGE_KEYS.schedules, schedules);
    renderSchedules();
  };

  window.approveLeave = function (id) {
    leaveRequests = leaveRequests.map(function (item) {
      if (item.id === id) {
        return {
          ...item,
          status: "已核准",
          reviewedBy: currentUser ? currentUser.name : "",
          reviewedAt: new Date().toLocaleString()
        };
      }
      return item;
    });

    saveData(STORAGE_KEYS.leaveRequests, leaveRequests);
    renderLeaves();
  };

  window.rejectLeave = function (id) {
    leaveRequests = leaveRequests.map(function (item) {
      if (item.id === id) {
        return {
          ...item,
          status: "已駁回",
          reviewedBy: currentUser ? currentUser.name : "",
          reviewedAt: new Date().toLocaleString()
        };
      }
      return item;
    });

    saveData(STORAGE_KEYS.leaveRequests, leaveRequests);
    renderLeaves();
  };

  function setLoggedInUser(user) {
    currentUser = user;
    updateUserInfo(user);

    loginPage.classList.add("hidden");
    mainPage.classList.remove("hidden");

    localStorage.setItem(STORAGE_KEYS.currentUser, user.employeeId);

    renderAnnouncements();
    renderLeaves();
    renderSchedules();
  }

  function restoreLogin() {
    const savedEmployeeId = localStorage.getItem(STORAGE_KEYS.currentUser);
    if (!savedEmployeeId) return;

    const matchedUser = users.find(function (u) {
      return u.employeeId === savedEmployeeId;
    });

    if (!matchedUser) return;

    currentUser = matchedUser;
    updateUserInfo(matchedUser);

    loginPage.classList.add("hidden");
    mainPage.classList.remove("hidden");

    renderAnnouncements();
    renderLeaves();
    renderSchedules();
  }

  loginForm.addEventListener("submit", function (event) {
    event.preventDefault();

    const employeeId = document.getElementById("employeeId").value.trim();
    const password = document.getElementById("password").value.trim();

    const user = users.find(function (u) {
      return u.employeeId === employeeId && u.password === password;
    });

    if (!user) {
      loginError.textContent = "帳號或密碼錯誤";
      return;
    }

    loginError.textContent = "";
    setLoggedInUser(user);
  });

  logoutBtn.addEventListener("click", function () {
    currentUser = null;
    localStorage.removeItem(STORAGE_KEYS.currentUser);

    mainPage.classList.add("hidden");
    loginPage.classList.remove("hidden");
    loginForm.reset();
    loginError.textContent = "";
  });

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

      pageTitle.textContent = button.textContent;
    });
  });

  announcementForm.addEventListener("submit", function (event) {
    event.preventDefault();
    event.stopPropagation();

    const title = announcementTitle.value.trim();
    const content = announcementContent.value.trim();

    if (!title || !content) {
      alert("請填寫完整公告內容");
      return;
    }

    announcements.push({
      id: Date.now().toString(),
      title: title,
      content: content,
      author: currentUser ? currentUser.name : "未知使用者",
      createdAt: new Date().toLocaleString()
    });

    saveData(STORAGE_KEYS.announcements, announcements);
    announcementForm.reset();
    renderAnnouncements();
  });

  leaveForm.addEventListener("submit", function (event) {
    event.preventDefault();

    const startDate = leaveStart.value;
    const endDate = leaveEnd.value;
    const reason = leaveReason.value.trim();

    if (!startDate || !endDate || !reason) {
      alert("請填寫完整請假資料");
      return;
    }

    if (startDate > endDate) {
      alert("開始日期不能晚於結束日期");
      return;
    }

    leaveRequests.push({
      id: Date.now().toString(),
      userName: currentUser ? currentUser.name : "未知使用者",
      department: currentUser ? currentUser.department : "",
      region: currentUser ? currentUser.region : "",
      type: leaveType.value,
      startDate: startDate,
      endDate: endDate,
      reason: reason,
      status: "待審核",
      reviewedBy: "",
      reviewedAt: ""
    });

    saveData(STORAGE_KEYS.leaveRequests, leaveRequests);
    leaveForm.reset();
    renderLeaves();
  });

  scheduleForm.addEventListener("submit", function (event) {
    event.preventDefault();

    const date = scheduleDate.value;
    const title = scheduleTitle.value.trim();
    const content = scheduleContent.value.trim();

    if (!date || !title || !content) {
      alert("請填寫完整排程資料");
      return;
    }

    schedules.push({
      id: Date.now().toString(),
      date: date,
      title: title,
      content: content,
      author: currentUser ? currentUser.name : "未知使用者"
    });

    saveData(STORAGE_KEYS.schedules, schedules);
    scheduleForm.reset();
    renderSchedules();
  });

  renderAnnouncements();
  renderLeaves();
  renderSchedules();
  restoreLogin();
});
