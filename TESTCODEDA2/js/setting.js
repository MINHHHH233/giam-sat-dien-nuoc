// Cấu hình Firebase
var firebaseConfig = {
  apiKey: "AIzaSyASIFrTnAdPbYy96IyymfwBOIS2aO0kuWc",
  authDomain: "doan2-47df4.firebaseapp.com",
  databaseURL: "https://doan2-47df4-default-rtdb.firebaseio.com/",
  projectId: "doan2-47df4",
};

// Khởi tạo Firebase
firebase.initializeApp(firebaseConfig);

let currentUid = null;

/* ===== CẬP NHẬT TRỰC QUAN SLIDER ===== */
function updateCurrentVal(val) {
  const currentValEl = document.getElementById("currentVal");
  if (currentValEl) currentValEl.innerText = val;
  updateSliderProgress(val);
}

function updateSliderProgress(val) {
  const slider = document.getElementById("rangeCurrent");
  if (!slider) return;
  const min = parseFloat(slider.min) || 1;
  const max = parseFloat(slider.max) || 30;
  const percentage = ((val - min) / (max - min)) * 100;
  slider.style.background = `linear-gradient(to right, #3b82f6 0%, #1d4ed8 ${percentage}%, rgba(0, 0, 0, 0.08) ${percentage}%, rgba(0, 0, 0, 0.08) 100%)`;
}

/* ===== CẬP NHẬT TRỰC QUAN ÂM LƯỢNG ===== */
function updateVolumeVal(val) {
  const volValEl = document.getElementById("volumeVal");
  if (volValEl) volValEl.innerText = Math.round(val * 100);
  updateVolumeSliderProgress(val);
  const audio = document.getElementById("testAudio");
  if (audio) {
    audio.volume = val;
  }
}

function updateVolumeSliderProgress(val) {
  const slider = document.getElementById("rangeVolume");
  if (!slider) return;
  const min = parseFloat(slider.min) || 0;
  const max = parseFloat(slider.max) || 1;
  const percentage = ((val - min) / (max - min)) * 100;
  slider.style.background = `linear-gradient(to right, #a855f7 0%, #c084fc ${percentage}%, rgba(0, 0, 0, 0.08) ${percentage}%, rgba(0, 0, 0, 0.08) 100%)`;
}

/* ===== TẢI DỮ LIỆU TỪ HỆ THỐNG ===== */
firebase.auth().onAuthStateChanged((user) => {
  if (!user) {
    showLog("⚠️ Chưa đăng nhập! Vui lòng đăng nhập hệ thống.", "error");
    return;
  }

  // Sử dụng cố định UID theo code của MCU để đồng bộ dữ liệu
  currentUid = "nfrrPdP0AVMK2aVRq4bQG4T3xt82";
  loadSettings();
});

function loadSettings() {
  firebase
    .database()
    .ref(`users/${currentUid}/settings`)
    .once("value")
    .then((snap) => {
      const s = snap.val();
      if (!s) return;

      // Load Slider
      if (s.current_threshold !== undefined) {
        const slider = document.getElementById("rangeCurrent");
        if (slider) slider.value = s.current_threshold;
        updateCurrentVal(s.current_threshold);
      }

      // Load Voltage
      if (s.voltage_standard !== undefined) {
        const volt = document.getElementById("voltageStandard");
        if (volt) volt.value = s.voltage_standard;
      }

      // Load Toggle Sound
      if (s.sound_enabled !== undefined) {
        const sound = document.getElementById("checkboxSound");
        if (sound) sound.checked = s.sound_enabled;
      }

      // Load Volume Slider
      if (s.alarm_volume !== undefined) {
        const rangeVol = document.getElementById("rangeVolume");
        if (rangeVol) rangeVol.value = s.alarm_volume;
        updateVolumeVal(s.alarm_volume);
      } else {
        const rangeVol = document.getElementById("rangeVolume");
        if (rangeVol) rangeVol.value = 0.3;
        updateVolumeVal(0.3);
      }

      // Load Date/Time schedule
      if (s.close_day) {
        const cDay = document.getElementById("closeDay");
        if (cDay) cDay.value = s.close_day;
      }
      if (s.close_time) {
        const cTime = document.getElementById("closeTime");
        if (cTime) cTime.value = s.close_time;
      }

      showLog("✅ Đã đồng bộ cấu hình cài đặt từ Cloud Firebase.", "success");
    })
    .catch((err) => {
      showLog("❌ Lỗi đồng bộ cài đặt: " + err.message, "error");
    });
}

/* ===== GHI DỮ LIỆU LƯU CẤU HÌNH ===== */
function saveSettings() {
  if (!currentUid) {
    alert("Bạn phải đăng nhập để thực hiện tác vụ này!");
    return;
  }

  const rangeCur = document.getElementById("rangeCurrent");
  const voltStd = document.getElementById("voltageStandard");
  const checkSound = document.getElementById("checkboxSound");
  const rangeVol = document.getElementById("rangeVolume");
  const cDay = document.getElementById("closeDay");
  const cTime = document.getElementById("closeTime");

  const threshold = rangeCur ? parseFloat(rangeCur.value) : 15;
  const voltage = voltStd ? (parseInt(voltStd.value) || 220) : 220;
  const sound = checkSound ? checkSound.checked : true;
  const soundVolume = rangeVol ? parseFloat(rangeVol.value) : 0.3;
  const closeDay = cDay ? cDay.value : "";
  const closeTime = cTime ? cTime.value : "";

  // Tính timestamp close_at
  let closeAt = null;
  if (closeDay && closeTime) {
    closeAt = new Date(closeDay + "T" + closeTime).getTime();
  }

  const settingsData = {
    current_threshold: threshold,
    voltage_standard: voltage,
    sound_enabled: sound,
    alarm_volume: soundVolume,
    close_day: closeDay || null,
    close_time: closeTime || null,
    close_at: closeAt
  };

  showLog("⏳ Đang lưu cấu hình...", "info");

  firebase
    .database()
    .ref(`users/${currentUid}/settings`)
    .update(settingsData)
    .then(() => {
      showLog("✅ Đã lưu cấu hình lên Firebase thành công!", "success");
      setTimeout(() => {
        showLog("", "success");
      }, 3000);
    })
    .catch((err) => {
      showLog("❌ Thất bại: " + err.message, "error");
    });
}

/* ===== THÔNG BÁO FEEDBACK ===== */
function showLog(msg, type) {
  const logEl = document.getElementById("logMsg");
  if (!logEl) return;
  logEl.innerText = msg;
  if (type === "error") {
    logEl.style.color = "#f43f5e";
  } else if (type === "success") {
    logEl.style.color = "#10b981";
  } else {
    logEl.style.color = "#6366f1";
  }
}

/* ===== PHÁT THỬ CHUÔNG CẢNH BÁO ===== */
let isPlaying = false;
function testAlarmSound() {
  const audio = document.getElementById("testAudio");
  const btn = document.querySelector(".btn-test-sound");
  if (!audio || !btn) return;

  if (!isPlaying) {
    audio.currentTime = 0;
    audio.play()
      .then(() => {
        isPlaying = true;
        btn.innerText = "⏹️ Dừng phát chuông";
        btn.classList.add("playing");
      })
      .catch((err) => {
        alert("Không thể phát thử âm thanh. Hãy tương tác với trang trước khi phát chuông!");
      });
  } else {
    audio.pause();
    isPlaying = false;
    btn.innerText = "🎵 Phát thử âm thanh";
    btn.classList.remove("playing");
  }

  // Tự động chuyển nút khi nhạc tự kết thúc
  audio.onended = () => {
    isPlaying = false;
    btn.innerText = "🎵 Phát thử âm thanh";
    btn.classList.remove("playing");
  };
}

/* ===== ĐĂNG XUẤT ===== */
function logout() {
  if (!confirm("Bạn có chắc muốn đăng xuất khỏi hệ thống?")) return;
  
  firebase
    .auth()
    .signOut()
    .then(() => {
      localStorage.clear();
      window.top.location.href = "index.html"; // Chuyển hướng trang cha
    })
    .catch((err) => {
      alert("Lỗi đăng xuất: " + err.message);
    });
}

// Khởi tạo dải màu ban đầu cho thanh trượt khi load trang
document.addEventListener("DOMContentLoaded", () => {
  const slider = document.getElementById("rangeCurrent");
  if (slider) {
    updateSliderProgress(slider.value);
  }
  const volSlider = document.getElementById("rangeVolume");
  if (volSlider) {
    updateVolumeVal(volSlider.value);
  }
});
