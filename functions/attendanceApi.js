/**
 * Cloud Function / backend API example for attendance check.
 * Deploy this endpoint and set window.__ATTENDANCE_API_URL__ in index.html.
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");

admin.initializeApp();
const db = admin.firestore();

const DEFAULT_ATTENDANCE_SETTINGS = {
  offices: [
    { name: "新竹區", lat: 24.8039, lng: 120.9647, radiusMeters: 500 },
    { name: "台中區", lat: 24.17779, lng: 120.713161, radiusMeters: 500 },
    { name: "嘉義區", lat: 23.4801, lng: 120.4491, radiusMeters: 500 }
  ]
};

const DEFAULT_ATTENDANCE_LOCATIONS = [
  { region: "新竹區", category: "office", name: "新竹辦公點", lat: 24.8039, lng: 120.9647, radiusMeters: 500, isActive: true, isHidden: false },
  { region: "台中區", category: "office", name: "台中辦公點", lat: 24.17779, lng: 120.713161, radiusMeters: 500, isActive: true, isHidden: false },
  { region: "嘉義區", category: "office", name: "嘉義辦公點", lat: 23.4801, lng: 120.4491, radiusMeters: 500, isActive: true, isHidden: false }
];

const ANNOUNCEMENT_LINK = process.env.ANNOUNCEMENT_LINK || "https://schedule-app-5845b.web.app/#announcement";
const MULTICAST_CHUNK_SIZE = 500;

function getDistanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function normalizeLocation(location) {
  return {
    name: location.name || "",
    lat: Number(location.lat),
    lng: Number(location.lng),
    radiusMeters: Number(location.radiusMeters),
    isActive: location.isActive !== false,
    isHidden: location.isHidden === true
  };
}

function getAnnouncementBody(content) {
  return String(content || "").trim().slice(0, 60) || "請點擊查看完整公告內容。";
}

function getAnnouncementRecipients(employeeDocs, authorId) {
  return employeeDocs
    .map((docItem) => ({ id: docItem.id, ...docItem.data() }))
    .filter((employee) => {
      if (!employee.fcmToken) return false;
      if (employee.isHidden || employee.status === "deleted") return false;
      if (authorId && employee.employeeId === authorId) return false;
      return employee.notificationSettings?.announcement !== false;
    });
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function cleanupInvalidTokens(tokensToDelete = []) {
  if (tokensToDelete.length === 0) return;

  const employeesSnapshot = await db.collection("employees").where("fcmToken", "in", tokensToDelete.slice(0, 10)).get();
  await Promise.all(
    employeesSnapshot.docs.map((docItem) => docItem.ref.update({
      fcmToken: "",
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }))
  );

  if (tokensToDelete.length > 10) {
    await cleanupInvalidTokens(tokensToDelete.slice(10));
  }
}

async function sendAnnouncementNotifications(tokens, announcement) {
  const invalidTokens = [];

  for (const tokenChunk of chunkArray(tokens, MULTICAST_CHUNK_SIZE)) {
    const response = await admin.messaging().sendEachForMulticast({
      tokens: tokenChunk,
      notification: {
        title: `新公告：${announcement.title || "未命名公告"}`,
        body: getAnnouncementBody(announcement.content)
      },
      data: {
        announcementId: announcement.id || "",
        link: ANNOUNCEMENT_LINK
      },
      webpush: {
        fcmOptions: {
          link: ANNOUNCEMENT_LINK
        }
      }
    });

    response.responses.forEach((result, index) => {
      if (result.success) return;
      const errorCode = result.error?.code || "";
      if (
        errorCode === "messaging/invalid-registration-token" ||
        errorCode === "messaging/registration-token-not-registered"
      ) {
        invalidTokens.push(tokenChunk[index]);
      }
      console.error("Announcement notification send failed", {
        token: tokenChunk[index],
        errorCode,
        message: result.error?.message || "unknown"
      });
    });
  }

  await cleanupInvalidTokens([...new Set(invalidTokens)]);
}

async function loadAttendanceLocations() {
  const snapshot = await db.collection("attendanceLocations").get();
  if (snapshot.empty) {
    return DEFAULT_ATTENDANCE_LOCATIONS.map(normalizeLocation);
  }

  return snapshot.docs
    .map((docItem) => normalizeLocation(docItem.data()))
    .filter((location) =>
      location.name &&
      Number.isFinite(location.lat) &&
      Number.isFinite(location.lng) &&
      Number.isFinite(location.radiusMeters) &&
      location.radiusMeters > 0 &&
      location.isActive &&
      !location.isHidden
    );
}

function findMatchedOffice(userLat, userLng, offices) {
  const matches = offices
    .map((office) => {
      const distance = getDistanceMeters(userLat, userLng, office.lat, office.lng);
      return {
        officeName: office.name,
        distanceMeters: Math.round(distance),
        matched: distance <= office.radiusMeters
      };
   })
    .filter((office) => office.matched)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  if (matches.length > 0) {
    return matches[0];
  }

  return {
    matched: false,
    officeName: "",
    distanceMeters: null
  };
}

exports.submitAttendance = functions.https.onRequest(async (request, response) => {
  if (request.method !== "POST") {
    response.status(405).json({ ok: false, message: "Method Not Allowed" });
    return;
  }

  try {
    const settingsSnapshot = await db.collection("settings").doc("attendance").get();
    const settings = settingsSnapshot.exists ? settingsSnapshot.data() : {};
    const savedOffices = Array.isArray(settings.offices) && settings.offices.length > 0
      ? settings.offices.map(normalizeLocation)
      : [];
    const locationCollectionOffices = await loadAttendanceLocations();
    const offices = locationCollectionOffices.length > 0
      ? locationCollectionOffices
      : (savedOffices.length > 0 ? savedOffices : DEFAULT_ATTENDANCE_SETTINGS.offices.map(normalizeLocation));

    const {
      employeeId,
      employeeName,
      type,
      lat,
      lng,
      officeName,
      distanceMeters,
      status,
      reason,
      networkType,
      createdAtClient
    } = request.body || {};

    if (!employeeId || !employeeName || !type || lat === undefined || lng === undefined) {
      response.status(400).json({ ok: false, message: "缺少必要打卡欄位" });
      return;
    }

    const matchedOffice = findMatchedOffice(Number(lat), Number(lng), offices);
    const finalStatus = matchedOffice.matched ? "success" : status || "rejected";
    const finalReason = finalStatus === "rejected" ? reason || "超出允許範圍" : "";
    const finalOfficeName = matchedOffice.matched ? matchedOffice.officeName : officeName || "";
    const finalDistanceMeters = matchedOffice.matched
      ? matchedOffice.distanceMeters
      : (typeof distanceMeters === "number" ? distanceMeters : null);
    
    await db.collection("attendanceRecords").add({
      employeeId,
      employeeName,
      type,
      officeName: finalOfficeName,
      lat: Number(lat),
      lng: Number(lng),
      distanceMeters: finalDistanceMeters,
      status: finalStatus,
      reason: finalReason,
      networkType: networkType || "unknown",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAtClient: createdAtClient ? new Date(createdAtClient) : new Date()
    });

   if (finalStatus === "rejected") {
      response.status(403).json({ ok: false, message: finalReason });
      return;
    }

    response.json({
      ok: true,
      message: `打卡成功，${finalOfficeName}，距離 ${finalDistanceMeters} 公尺內。`
    });
  } catch (error) {
    console.error("submitAttendance failed", error);
    response.status(500).json({ ok: false, message: "伺服器錯誤，請稍後再試" });
  }
});

exports.sendAnnouncementNotification = onDocumentCreated("announcements/{announcementId}", async (event) => {
  if (!event.data) return;

  const announcement = {
    id: event.params.announcementId,
    ...event.data.data()
  };

  const employeesSnapshot = await db.collection("employees").get();
  const recipients = getAnnouncementRecipients(employeesSnapshot.docs, announcement.authorId);
  const tokens = recipients.map((employee) => employee.fcmToken).filter(Boolean);

  if (tokens.length === 0) {
    console.log("No announcement recipients found", {
      announcementId: announcement.id,
      authorId: announcement.authorId || ""
    });
    return;
  }

  await sendAnnouncementNotifications(tokens, announcement);
});

exports.sendWorkReminder = onSchedule("every 5 minutes", async () => {
  const employeesSnapshot = await db.collection("employees").get();
  const notifications = [];

  employeesSnapshot.forEach((docItem) => {
    const user = docItem.data();

    if (!user.fcmToken) return;
    if (user.notificationSettings?.attendance === false) return;

    notifications.push(
      admin.messaging().send({
        token: user.fcmToken,
        notification: {
          title: "上班提醒",
          body: "距離上班還有 10 分鐘"
          },
        data: {
          link: ANNOUNCEMENT_LINK.replace(/#announcement$/, "")
        }
      })
    );
  });

  await Promise.all(notifications);
});
