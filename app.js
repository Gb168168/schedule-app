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

const loginPage = document.getElementById("login-page");
const mainPage = document.getElementById("main-page");
const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const loginError = document.getElementById("login-error");

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
  const employeeId = document.getElementById("employeeId").value.trim();
  const password = document.getElementById("password").value.trim();

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
  document.getElementById("employeeId").value = "";
  document.getElementById("password").value = "";
  loginError.textContent = "";
  showLoginPage();
}

loginBtn.addEventListener("click", login);
logoutBtn.addEventListener("click", logout);

window.addEventListener("load", () => {
  const savedUser = localStorage.getItem("currentUser");

  if (savedUser) {
    const user = JSON.parse(savedUser);
    showMainPage(user);
  } else {
    showLoginPage();
  }
});
