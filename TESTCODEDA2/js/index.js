// Cấu hình Firebase
var firebaseConfig = {
  apiKey: "AIzaSyASIFrTnAdPbYy96IyymfwBOIS2aO0kuWc",
  authDomain: "doan2-47df4.firebaseapp.com",
  databaseURL: "https://doan2-47df4-default-rtdb.firebaseio.com/",
  projectId: "doan2-47df4",
};

// Khởi tạo Firebase
firebase.initializeApp(firebaseConfig);

/* ===== SIDEBAR ===== */
function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  if (sidebar) {
    sidebar.classList.toggle("collapsed");
  }
}

/* ===== TOAST ĐĂNG NHẬP THÀNH CÔNG ===== */
function showLoginSuccess() {
  const toast = document.getElementById("loginToast");
  if (toast) {
    toast.classList.add("show");
    setTimeout(() => {
      toast.classList.remove("show");
    }, 3000);
  }
}

/* ===== KIỂM TRA TRẠNG THÁI XÁC THỰC NGƯỜI DÙNG ===== */
firebase.auth().onAuthStateChanged((user) => {
  const userInfo = document.getElementById("userInfo");
  const emailSpan = document.getElementById("userEmail");

  if (user) {
    // Đã đăng nhập
    if (emailSpan) emailSpan.innerText = user.email;
    if (userInfo) userInfo.style.display = "flex";

    // Ẩn màn hình loading xác thực
    const overlay = document.getElementById("authOverlay");
    if (overlay) {
      overlay.style.opacity = "0";
      overlay.style.visibility = "hidden";
      setTimeout(() => {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 400);
    }

    // Hiển thị thông báo đăng nhập thành công một lần
    if (localStorage.getItem("loginSuccess") === "true") {
      showLoginSuccess();
      localStorage.removeItem("loginSuccess");
    }

    // Lắng nghe kiểm tra thông báo chốt hóa đơn hàng tháng
    checkMonthlyNotification();
  } else {
    // Chưa đăng nhập -> Chuyển hướng về trang đăng nhập auth.html trong pages/
    if (userInfo) userInfo.style.display = "none";
    window.location.href = "pages/auth.html";
  }
});

/* ===== ĐĂNG XUẤT HỆ THỐNG ===== */
function logout() {
  firebase
    .auth()
    .signOut()
    .then(() => {
      localStorage.clear();
      window.location.href = "index.html";
    })
    .catch((err) => {
      console.error("Lỗi đăng xuất:", err);
    });
}

/* ===== THÔNG BÁO CHỐT ĐIỆN NƯỚC HÀNG THÁNG ===== */
function closeNotification() {
  const notif = document.getElementById("monthlyNotification");
  if (notif) {
    notif.classList.add("hidden");
  }

  // Đánh dấu thông báo đã đọc theo UID cố định của MCU
  const mcuUid = "nfrrPdP0AVMK2aVRq4bQG4T3xt82";
  firebase
    .database()
    .ref(`users/${mcuUid}/notifications/monthly_close/unread`)
    .set(false);
}

function checkMonthlyNotification() {
  const mcuUid = "nfrrPdP0AVMK2aVRq4bQG4T3xt82";

  firebase
    .database()
    .ref(`users/${mcuUid}/notifications/monthly_close`)
    .on("value", (snap) => {
      const notif = snap.val();
      if (!notif || !notif.unread) return;

      const notifEl = document.getElementById("monthlyNotification");
      const notifTitle = document.getElementById("notifTitle");
      const notifMessage = document.getElementById("notifMessage");

      if (notifTitle) notifTitle.textContent = notif.title || "📊 Đã chốt điện nước!";
      if (notifMessage) notifMessage.textContent = notif.message || "";
      if (notifEl) notifEl.classList.remove("hidden");

      // Tự động ẩn thông báo sau 10 giây
      setTimeout(() => {
        if (notifEl) notifEl.classList.add("hidden");
        firebase
          .database()
          .ref(`users/${mcuUid}/notifications/monthly_close/unread`)
          .set(false);
      }, 10000);
    });
}

/* ===== TẢI TRANG CON VÀO MAIN IFRAME ===== */
let currentPage = "pages/home.html"; // Trang con mặc định

function loadPage(page) {
  if (currentPage === page) return;
  currentPage = page;
  
  const frame = document.getElementById("contentFrame");
  if (frame) {
    frame.src = page;
  }
  
  // Cập nhật trạng thái active cho menu sidebar
  document.querySelectorAll(".menu-item[data-page]").forEach((el) => {
    el.classList.toggle("active", el.getAttribute("data-page") === page);
  });
}
