import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

apiKey: "AIzaSyAmPIQMfAR1BmvJbjx3L002ibVu2kXA3uM",
  authDomain: "schedule-app-5845b.firebaseapp.com",
  projectId: "schedule-app-5845b",
  storageBucket: "schedule-app-5845b.firebasestorage.app",
  messagingSenderId: "1046564647922",
  appId: "1:1046564647922:web:965bb01618c8b6b992b16b",

};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const loginPage = document.getElementById("login-page");
const mainPage = document.getElementById("main-page");
const userList = document.getElementById("user-list");
const currentUserName = document.getElementById("current-user-name");
const roleInfo = document.getElementById("role-info");
const logoutBtn = document.getElementById("logout-btn");

function saveCurrentUser(user) {
  localStorage.setItem("currentUser", JSON.stringify(user));
}

function getCurrentUser() {
  const raw = localStorage.getItem("currentUser");
  return raw ? JSON.parse(raw) : null;
}

function clearCurrentUser() {
  localStorage.removeItem("currentUser");
}

function showMainPage(user) {
  loginPage.style.display = "none";
  mainPage.style.display = "block";

  currentUserName.textContent = `目前登入：${user.name}`;
  roleInfo.innerHTML = `
    <div>權限：${user.role}</div>
    <div>區域：${user.region}</div>
    <div>部門：${user.department}</div>
  `;

  showPage("home");
}

function showLoginPage() {
  loginPage.style.display = "block";
  mainPage.style.display = "none";
}

async function ensureGoldBricksUser() {
  const goldRef = doc(db, "users", "goldbricks");
  const goldSnap = await getDoc(goldRef);

  if (!goldSnap.exists()) {
    await setDoc(goldRef, {
      name: "GoldBricks",
      role: "admin",
      region: "全部",
      department: "全部",
      canManageAnnouncements: true,
      active: true
    });
  }
}

async function loadUsers() {
  try {
    const querySnapshot = await getDocs(collection(db, "users"));
    let html = "";

    querySnapshot.forEach((docItem) => {
      const data = docItem.data();

      if (data.active === false) return;

      html += `
        <div class="user-card">
          <h3>${data.name || ""}</h3>
          <div>權限：${data.role || ""}</div>
          <div>區域：${data.region || ""}</div>
          <div>部門：${data.department || ""}</div>
          <button data-id="${docItem.id}">登入</button>
        </div>
      `;
    });

    userList.innerHTML = html || "目前沒有可登入使用者";

    const buttons = userList.querySelectorAll("button");
    buttons.forEach((button) => {
      button.addEventListener("click", async () => {
        const userId = button.dataset.id;
        const userRef = doc(db, "users", userId);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          alert("使用者不存在");
          return;
        }

        const user = {
          id: userId,
          ...userSnap.data()
        };

        saveCurrentUser(user);
        showMainPage(user);
      });
    });
  } catch (error) {
    console.error("讀取 users 錯誤：", error);
    userList.innerHTML = "讀取使用者失敗";
  }
}

function showPage(pageName) {
  const pages = document.querySelectorAll(".page");

  pages.forEach((page) => {
    page.style.display = "none";
  });

  const target = document.getElementById(`page-${pageName}`);
  if (target) {
    target.style.display = "block";
  }
}

const menuButtons = document.querySelectorAll(".menu-btn");
menuButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const page = btn.dataset.page;
    showPage(page);
  });
});

if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    clearCurrentUser();
    showLoginPage();
    loadUsers();
  });
}

async function init() {
  await ensureGoldBricksUser();

  const savedUser = getCurrentUser();
  if (savedUser) {
    showMainPage(savedUser);
  } else {
    showLoginPage();
    await loadUsers();
  }
}

init();
