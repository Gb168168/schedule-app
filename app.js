console.log("app.js 有載入");

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAmPIQMfAR1BmvJbjx3L002ibVu2kXA3uM",
    authDomain: "schedule-app-5845b.firebaseapp.com",
    projectId: "schedule-app-5845b",
    storageBucket: "schedule-app-5845b.firebasestorage.app",
    messagingSenderId: "1046564647922",
    appId: "1:1046564647922:web:965bb01618c8b6b992b16b",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const scheduleList = document.getElementById("schedule-list");
const addBtn = document.getElementById("add-btn");

const dateInput = document.getElementById("date");
const shiftInput = document.getElementById("shift");
const startTimeInput = document.getElementById("startTime");
const endTimeInput = document.getElementById("endTime");
const storeInput = document.getElementById("store");
const departmentInput = document.getElementById("department");

async function loadSchedules() {
  try {
    const q = query(collection(db, "schedules"), orderBy("date", "asc"));
    const querySnapshot = await getDocs(q);

    let html = "";

    querySnapshot.forEach((doc) => {
      const data = doc.data();

      html += `
        <div class="schedule-card">
          <div>日期：${data.date || ""}</div>
          <div>班別：${data.shift || ""}</div>
          <div>時間：${data.startTime || ""} - ${data.endTime || ""}</div>
          <div>地區：${data.store || ""}</div>
          <div>部門：${data.department || ""}</div>
        </div>
      `;
    });

    scheduleList.innerHTML = html || "目前沒有班表資料";
  } catch (error) {
    console.error("讀取錯誤：", error);
    scheduleList.innerHTML = "讀取失敗";
  }
}

async function addSchedule() {
  const date = dateInput.value;
  const shift = shiftInput.value;
  const startTime = startTimeInput.value;
  const endTime = endTimeInput.value;
  const store = storeInput.value.trim();
  const department = departmentInput.value.trim();

  if (!date || !shift || !startTime || !endTime || !store || !department) {
    alert("請把欄位填完整");
    return;
  }

  try {
    await addDoc(collection(db, "schedules"), {
      date,
      shift,
      startTime,
      endTime,
      store,
      department
    });

    dateInput.value = "";
    shiftInput.value = "早班";
    startTimeInput.value = "";
    endTimeInput.value = "";
    storeInput.value = "";
    departmentInput.value = "";

    await loadSchedules();
    alert("新增成功");
  } catch (error) {
    console.error("新增錯誤：", error);
    alert("新增失敗");
  }
}

addBtn.addEventListener("click", addSchedule);

loadSchedules();
