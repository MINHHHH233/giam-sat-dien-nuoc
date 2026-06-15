// Cấu hình Firebase
var firebaseConfig = {
  apiKey: "AIzaSyASIFrTnAdPbYy96IyymfwBOIS2aO0kuWc",
  authDomain: "doan2-47df4.firebaseapp.com",
  databaseURL: "https://doan2-47df4-default-rtdb.firebaseio.com/",
  projectId: "doan2-47df4",
};

// Khởi tạo Firebase
firebase.initializeApp(firebaseConfig);

/* ===== CHART INIT ===== */
const ctx = document.getElementById("powerWaterChart").getContext("2d");

const chart = new Chart(ctx, {
  type: "line",
  data: {
    labels: [],
    datasets: [
      {
        label: "Công suất (W)",
        data: [],
        borderColor: "#2563eb",
        backgroundColor: "rgba(37,99,235,0.06)",
        fill: true,
        yAxisID: "yPower",
        tension: 0.4,
        pointRadius: 0,
        borderWidth: 3,
      },
      {
        label: "Lưu lượng nước (mL/s)",
        data: [],
        borderColor: "#10b981",
        backgroundColor: "rgba(16,185,129,0.06)",
        fill: true,
        yAxisID: "yFlow",
        tension: 0.4,
        pointRadius: 0,
        borderWidth: 3,
      },
    ],
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: {
      mode: "index",
      intersect: false,
    },
    layout: {
      padding: {
        top: 15,
        bottom: 15,
        left: 10,
        right: 10,
      },
    },
    scales: {
      x: {
        ticks: {
          color: "#475569",
          maxRotation: 45,
          minRotation: 0,
          font: { family: "'Outfit', sans-serif", size: 11, weight: "500" },
        },
        grid: { color: "rgba(0,0,0,0.03)" },
      },
      yPower: {
        min: 0,
        max: 1000,
        ticks: {
          color: "#2563eb",
          font: { family: "'Outfit', sans-serif", size: 11, weight: "600" },
          stepSize: 100,
        },
        grid: { color: "rgba(37,99,235,0.05)" },
        title: {
          display: true,
          text: "Công suất (W)",
          color: "#2563eb",
          font: { family: "'Outfit', sans-serif", size: 13, weight: "700" },
        },
      },
      yFlow: {
        min: 0,
        max: 2000,
        position: "right",
        grid: { drawOnChartArea: false },
        ticks: {
          color: "#10b981",
          font: { family: "'Outfit', sans-serif", size: 11, weight: "600" },
          stepSize: 200,
        },
        title: {
          display: true,
          text: "Lưu lượng (mL/s)",
          color: "#10b981",
          font: { family: "'Outfit', sans-serif", size: 13, weight: "700" },
        },
      },
    },
    plugins: {
      legend: {
        labels: {
          color: "#0f172a",
          font: { family: "'Outfit', sans-serif", weight: "700", size: 12 },
        },
      },
    },
  },
});

/* ===== REALTIME UPDATE & NOTIFICATION LOGIC ===== */
firebase.auth().onAuthStateChanged((user) => {
  if (!user) return;

  // Sử dụng cố định UID theo code của MCU để đồng bộ dữ liệu
  const uid = "nfrrPdP0AVMK2aVRq4bQG4T3xt82";
  const dbRef = firebase.database().ref("users/" + uid);

  // Subscribe to real-time telemetry for chart updates
  dbRef.on("value", (snap) => {
    const d = snap.val();
    if (!d) return;

    const now = new Date();
    const label =
      now.getHours() +
      ":" +
      String(now.getMinutes()).padStart(2, "0") +
      ":" +
      String(now.getSeconds()).padStart(2, "0");

    chart.data.labels.push(label);
    chart.data.datasets[0].data.push(d.power ?? 0);
    chart.data.datasets[1].data.push(d.flow_ml_s ?? 0);

    // giữ tối đa 120 điểm (~2 phút)
    if (chart.data.labels.length > 120) {
      chart.data.labels.shift();
      chart.data.datasets.forEach((ds) => ds.data.shift());
    }

    chart.update();
  });

  // Notification lists state
  const notiList = document.getElementById("notiList");
  const badge = document.getElementById("unreadCount");
  let notifications = [];

  /* ===== LOAD MONTHLY LOG ===== */
  firebase
    .database()
    .ref(`users/${uid}/logs/monthly`)
    .on("value", (snap) => {
      notifications = notifications.filter((n) => n.type !== "monthly");

      snap.forEach((child) => {
        const d = child.val();
        notifications.push({
          id: child.key,
          type: "monthly",
          unread: true,
          time: d.time,
          text:
            `📊 Chốt điện & nước<br>` +
            `🔌 Điện năng: <b>${d.energy}</b> kWh<br>` +
            `💧 Tổng nước: <b>${d.water_m3}</b> m³`,
        });
      });

      render();
    });

  /* ===== LOAD ALERT LOG ===== */
  firebase
    .database()
    .ref(`users/${uid}/logs/alerts`)
    .limitToLast(20)
    .on("value", (snap) => {
      notifications = notifications.filter((n) => n.type !== "alert");

      snap.forEach((child) => {
        const d = child.val();
        notifications.push({
          id: child.key,
          type: "alert",
          unread: true,
          time: d.time,
          text:
            `⚡ <b>Vượt ngưỡng dòng điện</b><br>` +
            `Dòng điện: <b>${d.current}</b> A<br>` +
            `Ngưỡng: <b>${d.threshold}</b> A`,
        });
      });

      render();
    });

  /* ===== PARSE TIME HELPER ===== */
  function parseVietnameseTime(timeStr) {
    // Format: "17:03:09 17/1/2026"
    const parts = timeStr.split(" ");
    if (parts.length !== 2) return new Date(timeStr);

    const timePart = parts[0]; // "17:03:09"
    const datePart = parts[1]; // "17/1/2026"

    const [day, month, year] = datePart.split("/");
    const [hours, minutes, seconds] = timePart.split(":");

    return new Date(year, month - 1, day, hours, minutes, seconds);
  }

  /* ===== RENDER UI ===== */
  function render() {
    if (!notiList) return;
    notiList.innerHTML = "";
    let unread = 0;

    notifications
      .sort(
        (a, b) =>
          parseVietnameseTime(b.time) - parseVietnameseTime(a.time)
      )
      .forEach((n) => {
        if (n.unread) unread++;

        const div = document.createElement("div");
        div.className = "noti-item" + (n.unread ? " unread" : "");

        div.innerHTML = `
          <div class="dot">${n.unread ? "●" : ""}</div>
          <div class="content">
              <div class="text">${n.text}</div>
              <div class="time">${n.time}</div>
          </div>
          ${
            n.type === "alert"
              ? `<button class="del" data-id="${n.id}">✖</button>`
              : ""
          }
        `;

        div.onclick = () => {
          n.unread = false;
          render();
        };

        if (n.type === "alert") {
          const delBtn = div.querySelector(".del");
          if (delBtn) {
            delBtn.onclick = (e) => {
              e.stopPropagation();
              firebase
                .database()
                .ref(`users/${uid}/logs/alerts/${n.id}`)
                .remove();
            };
          }
        }

        notiList.appendChild(div);
      });

    if (badge) {
      badge.innerText = unread;
      badge.style.display = unread ? "inline-block" : "none";
    }
  }

  /* ===== MARK ALL READ ===== */
  window.markAllRead = () => {
    notifications.forEach((n) => (n.unread = false));
    render();
  };

  /* ===== DELETE ALL NOTIFICATIONS ===== */
  window.deleteAllNotifications = () => {
    if (!confirm("Bạn có chắc muốn xóa toàn bộ lịch sử thông báo?"))
      return;

    // Xóa alerts trong Firebase
    firebase.database().ref(`users/${uid}/logs/alerts`).remove();

    // Xóa monthly logs trong Firebase
    firebase.database().ref(`users/${uid}/logs/monthly`).remove();

    // Xóa local notifications array
    notifications = [];
    render();
  };
});
