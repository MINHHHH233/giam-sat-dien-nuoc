// Cấu hình Firebase
var firebaseConfig = {
  apiKey: "AIzaSyASIFrTnAdPbYy96IyymfwBOIS2aO0kuWc",
  authDomain: "doan2-47df4.firebaseapp.com",
  databaseURL: "https://doan2-47df4-default-rtdb.firebaseio.com/",
  projectId: "doan2-47df4",
};

// Khởi tạo Firebase
firebase.initializeApp(firebaseConfig);

// Cấu hình UID của người dùng (đồng bộ với hệ thống MCU và các trang khác)
const currentUid = "nfrrPdP0AVMK2aVRq4bQG4T3xt82";

// Biến toàn cục
let keypadBuffer = "";
let dbSettings = {
  current_threshold: 10,
  voltage_standard: 220,
  electric_price: 2500,
  water_price: 8000,
  sound_enabled: false
};

// Lấy tham chiếu các phần tử DOM
const lcdBuffer = document.getElementById("lcdBuffer");
const lcdCurrentVal = document.getElementById("lcdCurrentVal");
const lcdUnit = document.getElementById("lcdUnit");
const lcdLabel = document.getElementById("lcdLabel");
const settingTarget = document.getElementById("settingTarget");
const keyLog = document.getElementById("keyLog");

// --- 1. KHỞI TẠO VÀ LẮNG NGHE FIREBASE REALTIME ---

firebase.auth().onAuthStateChanged((user) => {
  if (user) {
    showLog("✅ Đã kết nối Firebase với tài khoản: " + user.email, "success");
  } else {
    showLog("⚠️ Trình mô phỏng đang chạy ở chế độ offline (Chưa đăng nhập)", "info");
  }
  
  // Bắt đầu lắng nghe dữ liệu
  startDatabaseListeners();
});

function startDatabaseListeners() {
  const dbRef = firebase.database().ref(`users/${currentUid}`);

  // Lắng nghe cài đặt (settings)
  dbRef.child("settings").on("value", (snap) => {
    const s = snap.val();
    if (!s) return;

    // Lưu trữ vào cache cục bộ
    dbSettings.current_threshold = s.current_threshold ?? dbSettings.current_threshold;
    dbSettings.voltage_standard = s.voltage_standard ?? dbSettings.voltage_standard;
    dbSettings.electric_price = s.electric_price ?? dbSettings.electric_price;
    dbSettings.water_price = s.water_price ?? dbSettings.water_price;
    dbSettings.sound_enabled = s.sound_enabled ?? dbSettings.sound_enabled;

    // Cập nhật giá trị hiển thị trên LCD hiện tại
    updateLcdCurrentText();

    // Cập nhật giao diện App Inventor trên điện thoại mô phỏng
    document.getElementById("phoneThreshold").innerText = parseFloat(dbSettings.current_threshold).toFixed(1);
    document.getElementById("phoneSoundToggle").checked = dbSettings.sound_enabled;
  });

  // Lắng nghe chỉ số đo lường realtime từ cảm biến
  dbRef.on("value", (snap) => {
    const d = snap.val();
    if (!d) return;

    // Cập nhật thông số lên điện thoại mô phỏng
    document.getElementById("phoneEnergy").innerText = (d.energy ?? 0).toFixed(2);
    document.getElementById("phoneVoltage").innerText = (d.voltage ?? 0).toFixed(1);
    
    const curVal = d.current ?? 0;
    document.getElementById("phoneCurrent").innerText = curVal.toFixed(2);
    document.getElementById("phonePower").innerText = (d.power ?? 0).toFixed(1);
    document.getElementById("phoneWater").innerText = (d.water_m3 ?? 0).toFixed(3);
    document.getElementById("phoneFlow").innerText = (d.flow_ml_s ?? 0).toFixed(1);

    // Kiểm tra dòng điện vượt ngưỡng cảnh báo để nhấp nháy đỏ trên điện thoại ảo
    const currentWrapper = document.getElementById("phoneCurrentWrapper");
    if (currentWrapper) {
      if (curVal > dbSettings.current_threshold) {
        currentWrapper.classList.add("danger-alert");
      } else {
        currentWrapper.classList.remove("danger-alert");
      }
    }
  });
}

// --- 2. XỬ LÝ BÀN PHÍM SỐ ẢO (KEYPAD LOGIC) ---

function updateLcdCurrentText() {
  const target = settingTarget.value;
  const unit = settingTarget.options[settingTarget.selectedIndex].getAttribute("data-unit");
  let currentVal = "--";

  if (target === "current_threshold") {
    currentVal = dbSettings.current_threshold;
    lcdLabel.innerText = "Ngưỡng dòng điện (A)";
  } else if (target === "voltage_standard") {
    currentVal = dbSettings.voltage_standard;
    lcdLabel.innerText = "Điện áp tiêu chuẩn (V)";
  } else if (target === "electric_price") {
    currentVal = dbSettings.electric_price;
    lcdLabel.innerText = "Đơn giá điện năng (đ/kWh)";
  } else if (target === "water_price") {
    currentVal = dbSettings.water_price;
    lcdLabel.innerText = "Đơn giá nước sinh hoạt (đ/m³)";
  }

  lcdCurrentVal.innerText = `Hiện tại: ${currentVal} ${unit}`;
  lcdUnit.innerText = unit;
}

function onTargetChange() {
  keypadBuffer = "";
  lcdBuffer.innerText = "--";
  updateLcdCurrentText();
  showLog("Đã chuyển đổi thông số cài đặt.", "info");
}

function pressKey(key) {
  if (key === "C") {
    keypadBuffer = "";
    lcdBuffer.innerText = "--";
    return;
  }

  if (key === "Backspace") {
    keypadBuffer = keypadBuffer.slice(0, -1);
    if (keypadBuffer === "") {
      lcdBuffer.innerText = "--";
    } else {
      lcdBuffer.innerText = keypadBuffer;
    }
    return;
  }

  // Giới hạn độ dài nhập liệu (tối đa 6 ký tự)
  if (keypadBuffer.length >= 6) {
    showLog("⚠️ Vượt quá độ dài tối đa!", "error");
    return;
  }

  // Kiểm tra dấu chấm thập phân hợp lệ
  if (key === "." && keypadBuffer.includes(".")) {
    return; // Không cho phép nhập 2 dấu chấm
  }

  // Không cho phép nhập số 0 đầu tiên không hợp lệ
  if (key === "0" && keypadBuffer === "0") {
    return;
  }

  keypadBuffer += key;
  lcdBuffer.innerText = keypadBuffer;
}

// Hàm tăng giảm nhanh giá trị qua Preset
function applyPreset(val) {
  const target = settingTarget.value;
  let baseVal = 0;

  if (target === "current_threshold") {
    baseVal = parseFloat(keypadBuffer) || dbSettings.current_threshold;
  } else if (target === "voltage_standard") {
    baseVal = parseFloat(keypadBuffer) || dbSettings.voltage_standard;
  } else if (target === "electric_price") {
    baseVal = parseFloat(keypadBuffer) || dbSettings.electric_price;
  } else if (target === "water_price") {
    baseVal = parseFloat(keypadBuffer) || dbSettings.water_price;
  }

  const newVal = Math.max(0, baseVal + val);
  keypadBuffer = newVal.toString();
  lcdBuffer.innerText = keypadBuffer;
}

// Lưu giá trị từ bàn phím lên Firebase
function submitValue() {
  if (keypadBuffer === "" || isNaN(parseFloat(keypadBuffer))) {
    showLog("⚠️ Vui lòng nhập giá trị hợp lệ trước khi gửi!", "error");
    return;
  }

  const newValue = parseFloat(keypadBuffer);
  const target = settingTarget.value;
  const unit = lcdUnit.innerText;

  showLog("⏳ Đang cập nhật lên Firebase...", "info");

  // Tạo đối tượng dữ liệu cập nhật
  const updateData = {};
  updateData[target] = newValue;

  firebase.database().ref(`users/${currentUid}/settings`).update(updateData)
    .then(() => {
      showLog(`✅ Đã lưu cấu hình mới: ${newValue} ${unit} thành công!`, "success");
      keypadBuffer = "";
      lcdBuffer.innerText = "--";
      
      // Khôi phục thông báo mặc định sau 3 giây
      setTimeout(() => {
        showLog("Cơ sở dữ liệu đã đồng bộ.", "info");
      }, 3000);
    })
    .catch((err) => {
      showLog("❌ Lỗi lưu dữ liệu: " + err.message, "error");
    });
}

// --- 3. ĐIỀU KHIỂN TRÊN ĐIỆN THOẠI MÔ PHỎNG ---

// Bật/tắt còi trên màn hình mô phỏng điện thoại
function onPhoneSoundToggle(checked) {
  firebase.database().ref(`users/${currentUid}/settings`).update({
    sound_enabled: checked
  })
  .then(() => {
    showLog(`📱 [Điện thoại] Đã ${checked ? 'BẬT' : 'TẮT'} còi cảnh báo.`, "success");
  })
  .catch((err) => {
    showLog("❌ Lỗi điều khiển còi: " + err.message, "error");
  });
}

// Kích hoạt lệnh Reset cảm biến ESP
function triggerPhoneReset() {
  const resetBtn = document.getElementById("phoneResetBtn");
  if (!resetBtn) return;

  resetBtn.disabled = true;
  resetBtn.innerText = "⏳ ĐANG RESET...";

  firebase.database().ref(`users/${currentUid}/reset_command`).set(true)
    .then(() => {
      showLog("🔄 [Điện thoại] Đã gửi lệnh Reset chỉ số cảm biến về 0 cho ESP.", "success");
      
      // Trả lại trạng thái nút bấm sau 2 giây
      setTimeout(() => {
        resetBtn.disabled = false;
        resetBtn.innerText = "🔄 RESET CẢM BIẾN ESP";
      }, 2000);
    })
    .catch((err) => {
      showLog("❌ Lỗi reset: " + err.message, "error");
      resetBtn.disabled = false;
      resetBtn.innerText = "🔄 RESET CẢM BIẾN ESP";
    });
}

// --- 4. CÁC TIỆN ÍCH PHỤ TRỢ (QR, CLOCK, LOG) ---

// Chuyển đổi tab quét mã QR kết nối
function switchQrTab(tabId) {
  // Gỡ bỏ class active trên tất cả các tab
  document.querySelectorAll(".qr-tab").forEach(tab => {
    tab.classList.remove("active");
  });

  // Gỡ bỏ class active trên các panel nội dung
  document.querySelectorAll(".qr-content-pane").forEach(pane => {
    pane.classList.remove("active");
  });

  // Kích hoạt tab và panel tương ứng
  const activeTab = document.querySelector(`.qr-tab[onclick*="${tabId}"]`);
  if (activeTab) activeTab.classList.add("active");

  const activePane = document.getElementById(`qrPane${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`);
  if (activePane) activePane.classList.add("active");
}

// Copy thông tin Firebase cấu hình nhanh
function copyConfigText() {
  const configStr = `apiKey: "${firebaseConfig.apiKey}"\ndatabaseURL: "${firebaseConfig.databaseURL}"\nprojectId: "${firebaseConfig.projectId}"\nuid: "${currentUid}"`;
  
  navigator.clipboard.writeText(configStr)
    .then(() => {
      alert("Đã sao chép thông tin cấu hình vào bộ nhớ tạm! Bạn có thể sử dụng chuỗi này để cấu hình nhanh trong App Inventor.");
      showLog("✅ Đã sao chép cấu hình Firebase.", "success");
    })
    .catch(err => {
      alert("Không thể tự động sao chép. Thông số database:\n" + configStr);
    });
}

// Cập nhật đồng hồ trên thanh trạng thái điện thoại
function updatePhoneClock() {
  const clockEl = document.getElementById("phoneTime");
  if (!clockEl) return;
  const now = new Date();
  let hours = now.getHours();
  let minutes = now.getMinutes();
  hours = hours < 10 ? "0" + hours : hours;
  minutes = minutes < 10 ? "0" + minutes : minutes;
  clockEl.textContent = `${hours}:${minutes}`;
}

// In nhật ký tiến trình bàn phím
function showLog(msg, type) {
  if (!keyLog) return;
  keyLog.innerText = msg;
  keyLog.className = "keyboard-status " + (type || "info");
}

// Khởi chạy
document.addEventListener("DOMContentLoaded", () => {
  // Đồng bộ giao diện ban đầu
  updateLcdCurrentText();
  
  // Chạy đồng hồ điện thoại
  updatePhoneClock();
  setInterval(updatePhoneClock, 1000);
});

// Cho phép sử dụng bàn phím máy tính thật khi trang đang active
document.addEventListener("keydown", (e) => {
  // Chỉ nhận diện khi không gõ vào các ô input thực của trang
  if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "SELECT") {
    return;
  }

  const key = e.key;
  if ((key >= "0" && key <= "9") || key === ".") {
    pressKey(key);
    e.preventDefault();
  } else if (key === "Backspace") {
    pressKey("Backspace");
    e.preventDefault();
  } else if (key === "Escape" || key === "c" || key === "C") {
    pressKey("C");
    e.preventDefault();
  } else if (key === "Enter") {
    submitValue();
    e.preventDefault();
  }
});
