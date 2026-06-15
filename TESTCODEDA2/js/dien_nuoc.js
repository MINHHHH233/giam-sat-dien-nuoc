// Cấu hình Firebase
var firebaseConfig = {
  apiKey: "AIzaSyASIFrTnAdPbYy96IyymfwBOIS2aO0kuWc",
  authDomain: "doan2-47df4.firebaseapp.com",
  databaseURL: "https://doan2-47df4-default-rtdb.firebaseio.com/",
  projectId: "doan2-47df4",
};

// Khởi tạo Firebase
firebase.initializeApp(firebaseConfig);

// Các biến toàn cục
let currentUid = null;
let oldData = {};
let voltageStandard = 220; // Giá trị điện áp chuẩn mặc định
let currentThreshold = 10; // Ngưỡng dòng điện mặc định
let soundEnabled = false;
let monthlyData = {};

let closeDay = null;
let closeTime = null;
let autoCloseInterval = null;
let lastMonthlyKey = null;
let lastAlertTime = 0; // chống spam âm thanh cảnh báo

const audio = document.getElementById("alertSound");

// --- 1. QUẢN LÝ XÁC THỰC VÀ BẮT ĐẦU THEO DÕI ---
firebase.auth().onAuthStateChanged((user) => {
  if (!user) {
    console.warn("Chưa đăng nhập");
    currentUid = null;
    return;
  }

  // Sử dụng cố định UID theo code của MCU để đồng bộ dữ liệu
  currentUid = "nfrrPdP0AVMK2aVRq4bQG4T3xt82";
  const dbRef = firebase.database().ref("users/" + currentUid);

  // Load và lắng nghe cài đặt (settings) realtime
  dbRef.child("settings").on("value", (snap) => {
    const s = snap.val();
    updateScheduleUI(s);
  });

  // Lắng nghe dữ liệu giám sát realtime từ ESP
  dbRef.on("value", (snap) => {
    const d = snap.val();
    if (!d) return;

    console.log("Firebase data:", d); // 👈 test

    updateCard("energy", d.energy ?? 0, "kWh");
    updateCardVoltage("voltage", d.voltage ?? 0, "V"); // Dùng hàm riêng cho điện áp
    updateCard("current", d.current ?? 0, "A");
    updateCard("power", d.power ?? 0, "W");
    updateCard("flow", d.flow_ml_s ?? 0, "mL/s");
    updateCard("water", d.water_m3 ?? 0, "m³");

    oldData = d;
  });

  // Lắng nghe dòng điện riêng để phát cảnh báo âm thanh và ghi log
  dbRef.child("current").on("value", (snap) => {
    const current = snap.val();
    if (current == null) return;

    if (soundEnabled && current > currentThreshold) {
      const now = Date.now();

      // ⛔ chỉ cảnh báo 1 lần / 10 giây
      if (now - lastAlertTime < 10000) return;
      lastAlertTime = now;

      // 🔊 phát âm thanh
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch((err) => {
          console.warn("Không thể phát âm thanh tự động (do chính sách trình duyệt):", err);
        });
      }

      // 📝 ghi log vượt ngưỡng lên Firebase
      firebase
        .database()
        .ref(`users/${currentUid}/logs/alerts/${now}`)
        .set({
          current,
          threshold: currentThreshold,
          time: new Date().toLocaleString("vi-VN"),
        });
    }
  });

  // Tải dữ liệu chốt số hàng tháng
  loadMonthlyData();

  // Bắt đầu kiểm tra chốt tự động
  startAutoCloseCheck();

  // Gọi thêm dữ liệu mẫu sau 2 giây nếu chưa có dữ liệu chốt
  setTimeout(() => {
    addSampleData();
  }, 2000);
});

// --- 2. CẬP NHẬT GIAO DIỆN CÁC CARD REALTIME ---

// Hàm riêng cho điện áp - so sánh với giá trị chuẩn
function updateCardVoltage(key, value, unit) {
  const numEl = document.getElementById(key);
  const trendEl = document.getElementById(key + "Trend");
  const card = document.getElementById(key + "Card");
  if (!numEl || !trendEl || !card) return;

  const diff = value - voltageStandard;

  numEl.innerText = value;
  card.classList.remove("up", "down");

  if (diff > 0) {
    card.classList.add("up");
    trendEl.innerHTML = `▲ +${diff.toFixed(1)} ${unit} (chuẩn: ${voltageStandard}V)`;
  } else if (diff < 0) {
    card.classList.add("down");
    trendEl.innerHTML = `▼ ${diff.toFixed(1)} ${unit} (chuẩn: ${voltageStandard}V)`;
  } else {
    trendEl.innerHTML = `✓ Đúng chuẩn ${voltageStandard}V`;
  }
}

// Cập nhật card thông số tiêu chuẩn
function updateCard(key, value, unit) {
  const numEl = document.getElementById(key);
  const trendEl = document.getElementById(key + "Trend");
  const card = document.getElementById(key + "Card");
  if (!numEl || !trendEl || !card) return;

  const oldVal = oldData[key] ?? value;
  const diff = value - oldVal;

  numEl.innerText = value;
  card.classList.remove("up", "down", "danger");

  // CẢNH BÁO QUÁ TẢI CHO DÒNG ĐIỆN
  if (key === "current" && value > currentThreshold) {
    card.classList.add("danger");
    trendEl.innerHTML = `🚨 Quá ngưỡng (ngưỡng: ${currentThreshold}A)`;
    return;
  }

  if (diff > 0) {
    card.classList.add("up");
    trendEl.innerHTML = `▲ +${diff.toFixed(2)} ${unit}`;
  } else if (diff < 0) {
    card.classList.add("down");
    trendEl.innerHTML = `▼ ${diff.toFixed(2)} ${unit}`;
  } else {
    trendEl.innerHTML = "— Không đổi";
  }
}

// --- 3. QUẢN LÝ LỊCH HẸN CHỐT VÀ CẬP NHẬT UI ---
function updateScheduleUI(s) {
  const timeEl = document.getElementById("scheduleTime");
  const statusEl = document.getElementById("scheduleStatus");
  if (!timeEl || !statusEl) return;

  if (!s) {
    timeEl.textContent = "Chưa cài đặt";
    statusEl.innerHTML = '<a href="pages/setting.html" target="_top" class="link-setting">Cài đặt ngay →</a>';
    return;
  }

  closeDay = s.close_day || null;
  closeTime = s.close_time || null;
  voltageStandard = s.voltage_standard ?? 220;
  currentThreshold = s.current_threshold ?? 10;
  soundEnabled = s.sound_enabled ?? false;

  if (closeDay && closeTime) {
    const scheduleDate = new Date(closeDay + "T" + closeTime);
    const now = new Date();

    timeEl.textContent = `${formatDate(closeDay)} lúc ${closeTime}`;

    if (scheduleDate > now) {
      statusEl.innerHTML = '<span class="status-pending">⏳ Đang chờ</span>';
    } else {
      statusEl.innerHTML = '<span class="status-done">✅ Đã chốt</span>';
    }
  } else {
    timeEl.textContent = "Chưa cài đặt";
    statusEl.innerHTML = '<a href="pages/setting.html" target="_top" class="link-setting">Cài đặt ngay →</a>';
  }
}

function formatDate(dateStr) {
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
}

// --- 4. TỰ ĐỘNG CHỐT SỐ ĐIỆN NƯỚC THEO GIỜ HẸN ---
function startAutoCloseCheck() {
  if (autoCloseInterval) clearInterval(autoCloseInterval);
  
  // Kiểm tra mỗi 30 giây
  autoCloseInterval = setInterval(() => {
    checkAndAutoClose();
  }, 30000);

  // Kiểm tra ngay khi load xong dữ liệu
  checkAndAutoClose();
}

function checkAndAutoClose() {
  if (!closeDay || !closeTime || !currentUid) return;

  const scheduleDate = new Date(closeDay + "T" + closeTime);
  const now = new Date();
  const diff = Math.abs(now - scheduleDate);

  // Nếu trong khoảng 1 phút của thời gian chốt và thời gian hiện tại đã vượt qua giờ chốt
  if (diff <= 60000 && now >= scheduleDate) {
    const monthKey = scheduleDate.toISOString().slice(0, 7);

    // Kiểm tra xem đã chốt số tự động cho tháng này chưa
    if (monthlyData[monthKey] && monthlyData[monthKey].auto_closed) {
      return; // Đã chốt rồi, không chốt lại
    }

    // Thực hiện chốt tự động
    performAutoClose(monthKey, scheduleDate);
  }
}

function performAutoClose(monthKey, scheduleDate) {
  const energyEl = document.getElementById("energy");
  const waterEl = document.getElementById("water");
  if (!energyEl || !waterEl) return;

  const energy = parseFloat(energyEl.innerText) || 0;
  const water = parseFloat(waterEl.innerText) || 0;

  const recordData = {
    energy: energy,
    water: water,
    recorded_at: new Date().toLocaleString("vi-VN"),
    timestamp: Date.now(),
    auto_closed: true,
    scheduled_time: scheduleDate.toISOString(),
  };

  firebase
    .database()
    .ref(`users/${currentUid}/monthly_records/${monthKey}`)
    .set(recordData)
    .then(() => {
      console.log("✅ Đã chốt tự động tháng " + monthKey);

      // Gửi thông báo lên Firebase
      firebase
        .database()
        .ref(`users/${currentUid}/notifications/monthly_close`)
        .set({
          type: "monthly_close",
          title: "📊 Đã chốt điện nước!",
          message: `Tháng ${formatMonth(monthKey)}: 🔌 ${energy} kWh | 💧 ${water} m³`,
          time: new Date().toISOString(),
          unread: true,
        });

      // Gửi lệnh reset cho ESP8266 (ESP sẽ reset cảm biến vật lý và gửi giá trị 0 lên Firebase)
      firebase
        .database()
        .ref(`users/${currentUid}/reset_command`)
        .set(true)
        .then(() => {
          console.log("🔄 Đã gửi lệnh reset cho ESP8266");
        });
    })
    .catch((err) => {
      console.error("❌ Lỗi chốt tự động:", err);
    });
}

// Lắng nghe định kỳ chốt số tháng
setInterval(() => {
  if (!currentUid) return;

  firebase
    .database()
    .ref(`users/${currentUid}/settings`)
    .once("value")
    .then((snap) => {
      const cfg = snap.val();
      if (!cfg || !cfg.close_at) return;

      const now = Date.now();

      // so theo phút (±30s)
      if (Math.abs(now - cfg.close_at) <= 30000) {
        const monthKey = new Date(cfg.close_at).toISOString().slice(0, 7);

        if (lastMonthlyKey === monthKey) return;
        lastMonthlyKey = monthKey;

        firebase
          .database()
          .ref(`users/${currentUid}`)
          .once("value")
          .then((dataSnap) => {
            const d = dataSnap.val();
            if (!d) return;

            firebase
              .database()
              .ref(`users/${currentUid}/notifications/monthly/${monthKey}`)
              .set({
                type: "monthly",
                text: `📊 Chốt điện & nước tháng ${monthKey}
🔌 Điện năng: ${d.energy ?? 0} kWh
💧 Tổng nước: ${d.water_m3 ?? 0} m³`,
                time: new Date(cfg.close_at).toISOString(),
                unread: true,
              });
          });
      }
    });
}, 60000);

// --- 5. TẢI DỮ LIỆU LỊCH SỬ CHỐT THÁNG ---
function loadMonthlyData() {
  if (!currentUid) return;
  firebase
    .database()
    .ref(`users/${currentUid}/monthly_records`)
    .on("value", (snap) => {
      monthlyData = snap.val() || {};
      updateMonthSelectors();
      updateHistoryList();
    });
}

function updateMonthSelectors() {
  const prevSelect = document.getElementById("prevMonthSelect");
  const currSelect = document.getElementById("currMonthSelect");
  if (!prevSelect || !currSelect) return;

  const months = Object.keys(monthlyData).sort().reverse();

  prevSelect.innerHTML = "";
  currSelect.innerHTML = "";

  if (months.length === 0) {
    prevSelect.innerHTML = '<option value="">Chưa có dữ liệu</option>';
    currSelect.innerHTML = '<option value="">Chưa có dữ liệu</option>';
    return;
  }

  months.forEach((month) => {
    prevSelect.innerHTML += `<option value="${month}">${formatMonth(month)}</option>`;
    currSelect.innerHTML += `<option value="${month}">${formatMonth(month)}</option>`;
  });

  // Mặc định: chọn tháng trước là tháng kế gần nhất
  if (months.length >= 2) {
    prevSelect.value = months[1];
    currSelect.value = months[0];

    // Tự động kích hoạt so sánh lần đầu tiên khi tải dữ liệu xong
    setTimeout(() => {
      const btn = document.getElementById("btnCompare");
      if (btn) btn.click();
    }, 100);
  }
}

function formatMonth(monthStr) {
  const [year, month] = monthStr.split("-");
  return `Tháng ${parseInt(month)}/${year}`;
}

// Cập nhật giao diện lịch sử
function updateHistoryList() {
  const historyList = document.getElementById("historyList");
  if (!historyList) return;

  const months = Object.keys(monthlyData).sort().reverse();

  if (months.length === 0) {
    historyList.innerHTML = '<p class="no-data">Chưa có dữ liệu chốt.</p>';
    return;
  }

  let html = "";
  months.forEach((month) => {
    const data = monthlyData[month];
    html += `
      <div class="history-item">
        <div class="history-month">${formatMonth(month)}</div>
        <div class="history-details">
          <span>🔌 ${data.energy ?? 0} kWh</span>
          <span>💧 ${data.water ?? 0} m³</span>
        </div>
        <div class="history-time">Chốt lúc: ${data.recorded_at ?? "--"}</div>
        <button class="btn-delete" onclick="deleteRecord('${month}')">🗑️</button>
      </div>
    `;
  });

  historyList.innerHTML = html;
}

// --- 6. XÓA BẢN GHI CHỐT SỐ ---
function deleteRecord(month) {
  if (!currentUid) return;
  if (!confirm(`Bạn có chắc muốn xóa dữ liệu tháng ${formatMonth(month)}?`)) {
    return;
  }

  firebase
    .database()
    .ref(`users/${currentUid}/monthly_records/${month}`)
    .remove()
    .then(() => {
      alert("✅ Đã xóa!");
    })
    .catch((err) => {
      alert("❌ Lỗi: " + err.message);
    });
}

// --- 7. CHỐT NGAY LẬP TỨC (BẰNG TAY) ---
const btnChotNgay = document.getElementById("btnChotNgay");
if (btnChotNgay) {
  btnChotNgay.addEventListener("click", () => {
    if (!currentUid) {
      alert("Chưa đăng nhập!");
      return;
    }

    const now = new Date();
    const monthKey = now.toISOString().slice(0, 7);

    // Kiểm tra xem đã có dữ liệu chưa
    if (monthlyData[monthKey]) {
      if (!confirm(`Tháng ${formatMonth(monthKey)} đã có dữ liệu. Bạn có muốn ghi đè không?`)) {
        return;
      }
    }

    const energyEl = document.getElementById("energy");
    const waterEl = document.getElementById("water");
    if (!energyEl || !waterEl) return;

    const energy = parseFloat(energyEl.innerText) || 0;
    const water = parseFloat(waterEl.innerText) || 0;

    const recordData = {
      energy: energy,
      water: water,
      recorded_at: new Date().toLocaleString("vi-VN"),
      timestamp: Date.now(),
      auto_closed: false,
      manual: true,
    };

    firebase
      .database()
      .ref(`users/${currentUid}/monthly_records/${monthKey}`)
      .set(recordData)
      .then(() => {
        // Cập nhật dữ liệu local
        monthlyData[monthKey] = recordData;

        // Cập nhật UI
        updateMonthSelectors();
        updateHistoryList();

        alert(`✅ Đã chốt điện nước tháng ${formatMonth(monthKey)} thành công!\n🔌 Điện: ${energy} kWh\n💧 Nước: ${water} m³`);

        // Gửi lệnh reset cho ESP8266
        firebase.database().ref(`users/${currentUid}/reset_command`).set(true);
      })
      .catch((err) => {
        alert("❌ Lỗi: " + err.message);
      });
  });
}

// --- 8. SO SÁNH CHỈ SỐ GIỮA CÁC THÁNG ---
const btnCompare = document.getElementById("btnCompare");
if (btnCompare) {
  btnCompare.addEventListener("click", () => {
    const prevMonth = document.getElementById("prevMonthSelect").value;
    const currMonth = document.getElementById("currMonthSelect").value;

    if (!prevMonth || !currMonth) {
      alert("Vui lòng chọn đủ 2 tháng để so sánh!");
      return;
    }

    if (prevMonth === currMonth) {
      alert("Vui lòng chọn 2 tháng khác nhau!");
      return;
    }

    // Tháng sau phải mới hơn Tháng trước
    if (prevMonth > currMonth) {
      alert("Khoảng thời gian so sánh không hợp lệ! Tháng sau phải là tháng mới hơn (sau) Tháng trước.");
      return;
    }

    const prevData = monthlyData[prevMonth];
    const currData = monthlyData[currMonth];

    if (!prevData || !currData) {
      alert("Không tìm thấy dữ liệu cho tháng đã chọn!");
      return;
    }

    // Cập nhật tên cột trong bảng so sánh
    const thPrevMonth = document.getElementById("thPrevMonth");
    const thCurrMonth = document.getElementById("thCurrMonth");
    if (thPrevMonth) thPrevMonth.textContent = formatMonth(prevMonth);
    if (thCurrMonth) thCurrMonth.textContent = formatMonth(currMonth);

    // Tính toán điện năng
    const prevEnergy = prevData.energy || 0;
    const currEnergy = currData.energy || 0;
    const diffEnergy = currEnergy - prevEnergy;

    // Tính toán nước
    const prevWater = prevData.water || 0;
    const currWater = currData.water || 0;
    const diffWater = currWater - prevWater;

    // Hiển thị điện
    const prevEnergyEl = document.getElementById("prevEnergy");
    const currEnergyEl = document.getElementById("currEnergy");
    const diffEnergyEl = document.getElementById("diffEnergy");
    const statusEnergyEl = document.getElementById("statusEnergy");

    if (prevEnergyEl) prevEnergyEl.textContent = prevEnergy.toFixed(2);
    if (currEnergyEl) currEnergyEl.textContent = currEnergy.toFixed(2);
    if (diffEnergyEl) {
      diffEnergyEl.textContent = (diffEnergy >= 0 ? "+" : "") + diffEnergy.toFixed(2);
      diffEnergyEl.className = diffEnergy > 0 ? "increase" : diffEnergy < 0 ? "decrease" : "";
    }
    if (statusEnergyEl) statusEnergyEl.innerHTML = getStatusHTML(diffEnergy);

    // Hiển thị nước
    const prevWaterEl = document.getElementById("prevWater");
    const currWaterEl = document.getElementById("currWater");
    const diffWaterEl = document.getElementById("diffWater");
    const statusWaterEl = document.getElementById("statusWater");

    if (prevWaterEl) prevWaterEl.textContent = prevWater.toFixed(3);
    if (currWaterEl) currWaterEl.textContent = currWater.toFixed(3);
    if (diffWaterEl) {
      diffWaterEl.textContent = (diffWater >= 0 ? "+" : "") + diffWater.toFixed(3);
      diffWaterEl.className = diffWater > 0 ? "increase" : diffWater < 0 ? "decrease" : "";
    }
    if (statusWaterEl) statusWaterEl.innerHTML = getStatusHTML(diffWater);

    // Tóm tắt kết quả
    updateComparisonSummary(diffEnergy, diffWater, prevMonth, currMonth);
  });
}

function getStatusHTML(diff) {
  if (diff > 0) {
    return `<span class="status-up">📈 Tăng</span>`;
  } else if (diff < 0) {
    return `<span class="status-down">📉 Giảm</span>`;
  } else {
    return `<span class="status-equal">➡️ Bằng</span>`;
  }
}

function updateComparisonSummary(diffEnergy, diffWater, prevMonth, currMonth) {
  const summary = document.getElementById("comparisonSummary");
  if (!summary) return;

  let energyMsg =
    diffEnergy > 0
      ? `⚠️ Điện năng <strong>tăng ${diffEnergy.toFixed(2)} kWh</strong>`
      : diffEnergy < 0
        ? `✅ Điện năng <strong>giảm ${Math.abs(diffEnergy).toFixed(2)} kWh</strong>`
        : `➡️ Điện năng <strong>không đổi</strong>`;

  let waterMsg =
    diffWater > 0
      ? `⚠️ Nước <strong>tăng ${diffWater.toFixed(3)} m³</strong>`
      : diffWater < 0
        ? `✅ Nước <strong>giảm ${Math.abs(diffWater).toFixed(3)} m³</strong>`
        : `➡️ Nước <strong>không đổi</strong>`;

  summary.innerHTML = `
    <h4>📋 Tóm tắt so sánh ${formatMonth(prevMonth)} → ${formatMonth(currMonth)}</h4>
    <p>${energyMsg}</p>
    <p>${waterMsg}</p>
  `;
}

// --- 9. THÊM DỮ LIỆU MẪU ĐỂ SO SÁNH ---
function addSampleData() {
  if (!currentUid) return;

  const may2026Key = "2026-05";
  const apr2026Key = "2026-04";

  // 1. Thêm dữ liệu mẫu tháng 4/2026
  firebase
    .database()
    .ref(`users/${currentUid}/monthly_records/${apr2026Key}`)
    .once("value")
    .then((snap) => {
      if (!snap.val()) {
        firebase
          .database()
          .ref(`users/${currentUid}/monthly_records/${apr2026Key}`)
          .set({
            energy: 95.8,
            water: 5.612,
            recorded_at: "30/04/2026, 23:59:00",
            timestamp: new Date("2026-04-30T23:59:00").getTime(),
            auto_closed: true,
            sample_data: true,
          });
      }
    });

  // 2. Thêm dữ liệu mẫu tháng 5/2026
  firebase
    .database()
    .ref(`users/${currentUid}/monthly_records/${may2026Key}`)
    .once("value")
    .then((snap) => {
      if (!snap.val()) {
        firebase
          .database()
          .ref(`users/${currentUid}/monthly_records/${may2026Key}`)
          .set({
            energy: 125.5,
            water: 8.234,
            recorded_at: "31/05/2026, 23:59:00",
            timestamp: new Date("2026-05-31T23:59:00").getTime(),
            auto_closed: true,
            sample_data: true,
          });
      }
    });
}
