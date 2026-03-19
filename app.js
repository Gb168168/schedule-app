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

let currentUser = null;

let announcements = [
  {
    id: Date.now().toString() + "_a",
    title: "系統公告",
    content: "歡迎使用班表系統。",
    author: "系統管理員",
    createdAt: new Date().toLocaleString()
  }
];

let leaveRequests = [];
let schedules = [];

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

    if (leaveRequests.length === 0) {
      leaveList.innerHTML = `<div class="list-item"><p>目前沒有請假申請。</p></div>`;
      return;
    }

    leaveList.innerHTML = leaveRequests
      .slice()
      .reverse()
      .map(function (item) {
        return `
          <div class="list-item">
            <h4>${item.userName} - ${item.type}</h4>
            <div class="item-meta">部門：${item.department}｜區域：${item.region}</div>
            <p>日期：${item.startDate} ~ ${item.endDate}</p>
            <p>原因：${item.reason}</p>
            <p><span class="status-badge">${item.status}</span></p>
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

    schedules.innerHTML = "";

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
    renderAnnouncements();
  };

  window.deleteSchedule = function (id) {
    schedules = schedules.filter(function (item) {
      return item.id !== id;
    });
    renderSchedules();
  };

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

    currentUser = user;
    loginError.textContent = "";
    currentUserName.textContent = user.name;
    userRole.textContent = user.role;
    userRegion.textContent = user.region;
    userDepartment.textContent = user.department;

    loginPage.classList.add("hidden");
    mainPage.classList.remove("hidden");

    renderAnnouncements();
    renderLeaves();
    renderSchedules();
  });

  logoutBtn.addEventListener("click", function () {
    currentUser = null;
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

    announcements.push({
      id: Date.now().toString(),
      title: announcementTitle.value.trim(),
      content: announcementContent.value.trim(),
      author: currentUser ? currentUser.name : "未知使用者",
      createdAt: new Date().toLocaleString()
    });

    announcementForm.reset();
    renderAnnouncements();
  });

  leaveForm.addEventListener("submit", function (event) {
    event.preventDefault();

    leaveRequests.push({
      id: Date.now().toString(),
      userName: currentUser ? currentUser.name : "未知使用者",
      department: currentUser ? currentUser.department : "",
      region: currentUser ? currentUser.region : "",
      type: leaveType.value,
      startDate: leaveStart.value,
      endDate: leaveEnd.value,
      reason: leaveReason.value.trim(),
      status: "待審核"
    });

    leaveForm.reset();
    renderLeaves();
  });

  scheduleForm.addEventListener("submit", function (event) {
    event.preventDefault();

    schedules.push({
      id: Date.now().toString(),
      date: scheduleDate.value,
      title: scheduleTitle.value.trim(),
      content: scheduleContent.value.trim(),
      author: currentUser ? currentUser.name : "未知使用者"
    });

    scheduleForm.reset();
    renderSchedules();
  });
});
