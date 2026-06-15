// Cấu hình Firebase
var firebaseConfig = {
  apiKey: "AIzaSyASIFrTnAdPbYy96IyymfwBOIS2aO0kuWc",
  authDomain: "doan2-47df4.firebaseapp.com",
  databaseURL: "https://doan2-47df4-default-rtdb.firebaseio.com/",
  projectId: "doan2-47df4",
};

// Khởi tạo Firebase
firebase.initializeApp(firebaseConfig);

/* ===== KIỂM TRA TRẠNG THÁI ĐĂNG NHẬP SẴN ===== */
firebase.auth().onAuthStateChanged((user) => {
  if (user) {
    // Nếu đã đăng nhập sẵn, tự động chuyển hướng về trang chủ index.html ở thư mục gốc
    window.location.href = "../index.html";
  }
});

/* ===== TRẠNG THÁI HÀNH VI (ĐĂNG NHẬP / ĐĂNG KÝ) ===== */
let isLogin = true;

/* ===== HIỂN THỊ / XÓA THÔNG BÁO LỖI VĂN BẢN ===== */
function showError(message) {
  const errorEl = document.getElementById("errorMsg");
  if (errorEl) {
    errorEl.innerText = message;
    errorEl.style.opacity = "1";
  }
}

// Xóa thông báo lỗi
function clearError() {
  const errorEl = document.getElementById("errorMsg");
  if (errorEl) {
    errorEl.innerText = "";
    errorEl.style.opacity = "0";
  }
}

/* ===== CHUYỂN ĐỔI FORM ĐĂNG NHẬP VÀ ĐĂNG KÝ ===== */
function switchForm() {
  clearError();

  const title = document.getElementById("title");
  const btn = document.getElementById("submitBtn");
  const sw = document.querySelector(".switch");

  if (isLogin) {
    if (title) title.innerText = "Đăng ký";
    if (btn) btn.innerText = "Đăng ký";
    if (sw) sw.innerHTML = `Đã có tài khoản? <span onclick="switchForm()">Đăng nhập</span>`;
  } else {
    if (title) title.innerText = "Đăng nhập";
    if (btn) btn.innerText = "Đăng nhập";
    if (sw) sw.innerHTML = `Chưa có tài khoản? <span onclick="switchForm()">Đăng ký</span>`;
  }
  isLogin = !isLogin;
}

/* ===== XỬ LÝ KHI SUBMIT FORM ===== */
function handleSubmit() {
  clearError();

  const emailEl = document.getElementById("email");
  const passwordEl = document.getElementById("password");

  if (!emailEl || !passwordEl) return;

  const email = emailEl.value.trim();
  const password = passwordEl.value.trim();

  if (!email || !password) {
    showError("Vui lòng nhập đầy đủ email và mật khẩu");
    return;
  }

  if (password.length < 6) {
    showError("Mật khẩu phải chứa ít nhất 6 ký tự");
    return;
  }

  if (isLogin) {
    loginUser(email, password);
  } else {
    registerUser(email, password);
  }
}

/* ===== ĐĂNG KÝ USER MỚI VỚI FIREBASE AUTH ===== */
function registerUser(email, password) {
  const btn = document.getElementById("submitBtn");
  if (btn) {
    btn.disabled = true;
    btn.innerText = "Đang xử lý...";
  }

  firebase
    .auth()
    .createUserWithEmailAndPassword(email, password)
    .then((userCredential) => {
      const uid = userCredential.user.uid;

      // Lưu trữ thông tin khởi tạo lên Realtime Database
      firebase
        .database()
        .ref("users/" + uid)
        .set({
          email: email,
          createdAt: new Date().toISOString(),
        })
        .then(() => {
          clearError();
          alert("Đăng ký thành công! Vui lòng đăng nhập bằng tài khoản vừa tạo.");
          switchForm();
        });
    })
    .catch((error) => {
      showError(error.message);
    })
    .finally(() => {
      if (btn) {
        btn.disabled = false;
        btn.innerText = isLogin ? "Đăng nhập" : "Đăng ký";
      }
    });
}

/* ===== ĐĂNG NHẬP VỚI EMAIL VÀ PASSWORD ===== */
function loginUser(email, password) {
  const btn = document.getElementById("submitBtn");
  if (btn) {
    btn.disabled = true;
    btn.innerText = "Đang xác thực...";
  }

  firebase
    .auth()
    .signInWithEmailAndPassword(email, password)
    .then((userCredential) => {
      const uid = userCredential.user.uid;

      // Đọc kiểm tra sự tồn tại trong database
      firebase
        .database()
        .ref("users/" + uid)
        .once("value")
        .then((snapshot) => {
          if (snapshot.exists()) {
            localStorage.setItem("loginSuccess", "true");
            localStorage.setItem("userEmail", email);
            localStorage.setItem("userUID", uid);

            // Chuyển về Dashboard trang chủ ở thư mục gốc
            window.location.href = "../index.html";
          } else {
            showError("Tài khoản không hợp lệ");
            firebase.auth().signOut();
          }
        });
    })
    .catch((error) => {
      console.error(error);
      showError("Sai thông tin email hoặc mật khẩu.");
    })
    .finally(() => {
      if (btn) {
        btn.disabled = false;
        btn.innerText = isLogin ? "Đăng nhập" : "Đăng ký";
      }
    });
}

/* ===== ĐĂNG NHẬP POPUP BẰNG GOOGLE ===== */
function loginWithGoogle() {
  clearError();
  const provider = new firebase.auth.GoogleAuthProvider();

  firebase
    .auth()
    .signInWithPopup(provider)
    .then((result) => {
      const user = result.user;
      const uid = user.uid;
      const email = user.email;

      // Khởi tạo thông tin user nếu chưa tồn tại trong database
      firebase
        .database()
        .ref("users/" + uid)
        .once("value")
        .then((snapshot) => {
          if (!snapshot.exists()) {
            firebase
              .database()
              .ref("users/" + uid)
              .set({
                email: email,
                createdAt: new Date().toISOString(),
              });
          }

          localStorage.setItem("loginSuccess", "true");
          localStorage.setItem("userEmail", email);
          localStorage.setItem("userUID", uid);

          window.location.href = "../index.html";
        });
    })
    .catch((error) => {
      showError("Lỗi đăng nhập Google: " + error.message);
    });
}
