const users = [
  {
    employeeId: "GoldBricks",
    password: "GoldBricks",
    name: "GoldBricks",
    role: "admin",
    region: "全部",
    department: "全部"
  },
  {
    employeeId: "GB080202",
    password: "GB080202",
    name: "邱淑芬",
    role: "管理員",
    region: "台中區",
    department: "管理部"
  },
  {
    employeeId: "GB211201",
    password: "GB211201",
    name: "林佳瑩",
    role: "管理員",
    region: "台中區",
    department: "管理部"
  }
];

window.addEventListener("DOMContentLoaded", () => {
  const loginPage = document.getElementById("login-page");
  const mainPage = document.getElementById("main-page");
  const loginBtn = document.getElementById("login-btn");
  const logoutBtn = document.getElementById("logout-btn");
  const loginError = document.getElementById("login-error");
  const employeeIdInput = document.getElementById("employeeId");
  const passwordInput = document.getElementById("password");

  function showMainPage(user) {
    loginPage.classList.add("hidden");
    mainPage.classList.remove("hidden");

    document.getElementById("current-user-name").textContent = user.name;
    document.getElementById("user-role").textContent = user.role;
    document.getElementById("user-region").textContent = user.region;
    document.getElementById("user-department").textContent = user.department;
  }

  function showLoginPage() {
    mainPage.classList.add("hidden");
    loginPage.classList.remove("hidden");
  }

  function login() {
    const employeeId = employeeIdInput.value.trim();
    const password = passwordInput.value.trim();

    const user = users.find(
      (u) => u.employeeId === employeeId && u.password === password
    );

    if (!user) {
      loginError.textContent = "帳號或密碼錯誤";
      return;
    }

    localStorage.setItem("currentUser", JSON.stringify(user));
    loginError.textContent = "";
    showMainPage(user);
  }

  function logout() {
    localStorage.removeItem("currentUser");
    employeeIdInput.value = "";
    passwordInput.value = "";
    loginError.textContent = "";
    showLoginPage();
  }

  loginBtn.addEventListener("click", login);
  logoutBtn.addEventListener("click", logout);

  passwordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      login();
    }
  });

  const savedUser = localStorage.getItem("currentUser");
  if (savedUser) {
    showMainPage(JSON.parse(savedUser));
  } else {
    showLoginPage();
  }
});
