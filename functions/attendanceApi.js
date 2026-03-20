/**
 * Cloud Function / backend API example for attendance check.
 * Deploy this endpoint and set window.__ATTENDANCE_API_URL__ in index.html.
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

exports.submitAttendance = functions.https.onRequest(async (request, response) => {
  if (request.method !== "POST") {
    response.status(405).json({ ok: false, message: "Method Not Allowed" });
    return;
  }

  try {
    const settingsSnapshot = await db.collection("settings").doc("attendance").get();
    const settings = settingsSnapshot.exists ? settingsSnapshot.data() : {};
    const allowedIpRanges = Array.isArray(settings.allowedIpRanges) ? settings.allowedIpRanges : [];

    const forwardedFor = request.headers["x-forwarded-for"];
    const clientIp = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : String(forwardedFor || request.ip || "").split(",")[0].trim();

    if (!allowedIpRanges.includes(clientIp)) {
      response.status(403).json({ ok: false, message: "非公司網路，無法打卡" });
      return;
    }

    const {
      employeeId,
      employeeName,
      type,
      lat,
      lng,
      officeName,
      networkType
    } = request.body || {};

    if (!employeeId || !employeeName || !type || lat === undefined || lng === undefined || !officeName) {
      response.status(400).json({ ok: false, message: "缺少必要打卡欄位" });
      return;
    }

    await db.collection("attendanceRecords").add({
      employeeId,
      employeeName,
      type,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      lat,
      lng,
      officeName,
      networkType: networkType || "unknown",
      ipVerified: true,
      status: "success",
      clientIp
    });

    response.json({ ok: true, message: "打卡資料已寫入 attendanceRecords" });
  } catch (error) {
    console.error("submitAttendance failed", error);
    response.status(500).json({ ok: false, message: "伺服器錯誤，請稍後再試" });
  }
});
