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

function normalizeCredential(value) {
 return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
}

 function findUserByCredential(employeeId, password) {
  const normalizedEmployeeId = normalizeCredential(employeeId);
  const normalizedPassword = normalizeCredential(password);

  return users.find((user) => {
    const exactMatch = user.employeeId === employeeId && user.password === password;
    const normalizedMatch =
      normalizeCredential(user.employeeId) === normalizedEmployeeId &&
      normalizeCredential(user.password) === normalizedPassword;

    return exactMatch || normalizedMatch;
  });
}

window.addEventListener("DOMContentLoaded", () => {
  const loginPage = document.getElementById("login-page");
  const mainPage = document.getElementById("main-page");
  const loginForm = document.getElementById("login-form");
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

  function clearLoginError() {
    loginError.textContent = "";
  }

  function login() {
    const employeeId = employeeIdInput.value.trim();
    const password = passwordInput.value.trim();

    if (!employeeId || !password) {
      loginError.textContent = "請輸入帳號與密碼";
      return;
    }

    const user = findUserByCredential(employeeId, password);
 
    if (!user) {
      loginError.textContent = "帳號或密碼錯誤";
      return;
    }

    localStorage.setItem("currentUser", JSON.stringify(user));
    clearLoginError();
    showMainPage(user);
  }

  function logout() {
    localStorage.removeItem("currentUser");
    employeeIdInput.value = "";
    passwordInput.value = "";
    clearLoginError();
    showLoginPage();
  }

  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    login();
  });
  logoutBtn.addEventListener("click", logout);
  employeeIdInput.addEventListener("input", clearLoginError);
  passwordInput.addEventListener("input", clearLoginError);

  const savedUser = localStorage.getItem("currentUser");
  if (!savedUser) {
    showLoginPage();
    return;
  }

  let parsedUser;
  try {
    parsedUser = JSON.parse(savedUser);
  } catch {
    localStorage.removeItem("currentUser");
    showLoginPage();
    return;
  }
  
  const matchedUser = findUserByCredential(parsedUser.employeeId, parsedUser.password);
  if (!matchedUser) {
    localStorage.removeItem("currentUser");
    showLoginPage();
    return;
  }

  showMainPage(matchedUser);
});
