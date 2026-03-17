console.log("app.js 有載入");

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

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

async function loadSchedules() {
  console.log("開始讀取 schedules");

  try {
    const querySnapshot = await getDocs(collection(db, "schedules"));
    console.log("成功拿到資料筆數：", querySnapshot.size);

    let html = "";

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      console.log("單筆資料：", data);

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
    console.error("Firestore 錯誤：", error);
    scheduleList.innerHTML = "讀取失敗，請檢查 Firebase 設定";
  }
}

loadSchedules();
