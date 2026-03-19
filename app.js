console.log("app.js 已成功載入");

document.addEventListener("DOMContentLoaded", function () {
  console.log("DOM 已載入");

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
      name: "GB080202",
      role: "一般員工",
      region: "中區",
      department: "排班部"
    }
  ];

  const loginPage = document.getElementById("login-page");
  const mainPage = document.getElementById("main-page");
  const loginForm = document.getElementById("login-form");
  const loginError = document.getElementById("login-error");
  const employeeIdInput = document.getElementById("employeeId");
  const passwordInput = document.getElementById("password");

  const currentUserName = document.getElementById("current-user-name");
  const userRole = document.getElementById("user-role");
  const userRegion = document.getElementById("user-region");
  const userDepartment = document.getElementById("user-department");
  const logoutBtn = document.getElementById("logout-btn");

  console.log({
    loginPage,
    mainPage,
    loginForm,
    loginError,
    employeeIdInput,
    passwordInput,
    currentUserName,
    userRole,
    userRegion,
    userDepartment,
    logoutBtn
  });

  if (
    !loginPage ||
    !mainPage ||
    !loginForm ||
    !loginError ||
    !employeeIdInput ||
    !passwordInput ||
    !currentUserName ||
    !userRole ||
    !userRegion ||
    !userDepartment ||
    !logoutBtn
  ) {
    console.error("有 HTML 元素抓不到，請確認 id 是否一致");
    return;
  }

  loginForm.addEventListener("submit", function (event) {
    event.preventDefault();

    const employeeId = employeeIdInput.value.trim();
    const password = passwordInput.value.trim();

    console.log("嘗試登入:", employeeId, password);

    const user = users.find(function (u) {
      return u.employeeId === employeeId && u.password === password;
    });

    if (!user) {
      loginError.textContent = "帳號或密碼錯誤";
      return;
    }

    loginError.textContent = "";
    currentUserName.textContent = user.name;
    userRole.textContent = user.role;
    userRegion.textContent = user.region;
    userDepartment.textContent = user.department;

    loginPage.classList.add("hidden");
    mainPage.classList.remove("hidden");

    console.log("登入成功");
  });

  logoutBtn.addEventListener("click", function () {
    mainPage.classList.add("hidden");
    loginPage.classList.remove("hidden");
    loginForm.reset();
    loginError.textContent = "";
    console.log("已登出");
  });
});
