// app.js

document.addEventListener("DOMContentLoaded", () => {
    // ==========================================
    // 0. FIREBASE CONFIG
    // ==========================================
    const firebaseConfig = {
        apiKey: "AIzaSyASJa-sJZmUFpugU5fe_ybsafRIZqVEg-M",
        authDomain: "ttiot-44d9a.firebaseapp.com",
        databaseURL: "https://ttiot-44d9a-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "ttiot-44d9a",
        storageBucket: "ttiot-44d9a.firebasestorage.app",
        messagingSenderId: "907056760486",
        appId: "1:907056760486:web:2b0255d37a09aca5df9667"
    };

    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }

    const db = firebase.database();
    const auth = firebase.auth();

    // ==========================================
    // 1. DOM ELEMENTS
    // ==========================================
    const loginScreen = document.getElementById("login-screen");
    const appLayout = document.getElementById("app-layout");

    const loginForm = document.getElementById("login-form");
    const registerForm = document.getElementById("register-form");

    const loginEmail = document.getElementById("login-email");
    const loginPassword = document.getElementById("login-password");

    const registerName = document.getElementById("register-name");
    const registerEmail = document.getElementById("register-email");
    const registerPassword = document.getElementById("register-password");
    const registerPasswordConfirm = document.getElementById("register-password-confirm");

    const loginError = document.getElementById("login-error");
    const registerError = document.getElementById("register-error");

    const approvalWaiting = document.getElementById("approval-waiting");
    const pendingLogoutBtn = document.getElementById("pending-logout-btn");
    const logoutBtn = document.getElementById("logout-btn");

    const authTabs = document.querySelectorAll(".auth-tab");
    const authForms = document.querySelectorAll(".auth-form");

    const navLinks = document.querySelectorAll(".nav-links li");
    const pages = document.querySelectorAll(".page");
    const pageTitle = document.getElementById("page-title");

    const sidebar = document.getElementById("sidebar");
    const openSidebarBtn = document.getElementById("open-sidebar");
    const closeSidebarBtn = document.getElementById("close-sidebar");

    const themeToggleBtn = document.getElementById("theme-toggle");
    const settingDarkModeSwitch = document.getElementById("setting-darkmode");

    const connStatus = document.getElementById("conn-status");

    let currentUser = null;
    let currentUserProfile = null;
    let isAdmin = false;

    let currentRoomState = null;
    let allHistoryRecords = [];

    // ==========================================
    // 2. HELPER FUNCTIONS
    // ==========================================
    function setMessage(element, message, success = false) {
        if (!element) return;
        element.textContent = message || "";
        element.classList.toggle("success-msg", success);
    }

    function getFriendlyAuthError(error) {
        const code = error?.code || "";

        if (code.includes("auth/invalid-email")) return "Email không hợp lệ.";
        if (code.includes("auth/user-not-found")) return "Không tìm thấy tài khoản.";
        if (code.includes("auth/wrong-password")) return "Mật khẩu không đúng.";
        if (code.includes("auth/invalid-credential")) return "Email hoặc mật khẩu không đúng.";
        if (code.includes("auth/email-already-in-use")) return "Email này đã được đăng ký.";
        if (code.includes("auth/weak-password")) return "Mật khẩu phải có ít nhất 6 ký tự.";
        if (code.includes("auth/network-request-failed")) return "Lỗi mạng, hãy thử lại.";

        return error?.message || "Đã xảy ra lỗi.";
    }

    function switchAuthTab(tabName) {
        authTabs.forEach(tab => {
            tab.classList.toggle("active", tab.dataset.tab === tabName);
        });

        authForms.forEach(form => {
            form.classList.toggle("active", form.id === `${tabName}-form`);
        });

        approvalWaiting.classList.remove("active");
        setMessage(loginError, "");
        setMessage(registerError, "");
    }

    function showLogin() {
        appLayout.classList.remove("active");
        loginScreen.classList.add("active");

        approvalWaiting.classList.remove("active");
        switchAuthTab("login");
    }

    function showPending() {
        appLayout.classList.remove("active");
        loginScreen.classList.add("active");

        authForms.forEach(form => form.classList.remove("active"));
        authTabs.forEach(tab => tab.classList.remove("active"));

        approvalWaiting.classList.add("active");
    }

    function showApp(profile) {
        loginScreen.classList.remove("active");
        appLayout.classList.add("active");

        currentUserProfile = profile;
        isAdmin = profile.role === "admin";

        document.querySelectorAll(".admin-only").forEach(item => {
            item.style.display = isAdmin ? "flex" : "none";
        });

        document.getElementById("sidebar-user-name").textContent = profile.name || "Người dùng";
        document.getElementById("setting-user-email").textContent = profile.email || "--";
        document.getElementById("setting-user-role").textContent = isAdmin ? "Admin" : "User";
        document.getElementById("setting-user-status").textContent = profile.status || "--";

        goToPage("dashboard-page");
    }

    function goToPage(targetId) {
        navLinks.forEach(link => {
            link.classList.toggle("active", link.dataset.target === targetId);
        });

        pages.forEach(page => {
            page.classList.toggle("active", page.id === targetId);
        });

        const activeLink = document.querySelector(`.nav-links li[data-target="${targetId}"]`);
        if (activeLink) {
            pageTitle.textContent = activeLink.querySelector("span").textContent;
        }

        if (targetId === "history-page") {
            renderHistoryByDate(allHistoryRecords);
        }

        if (targetId === "accounts-page" && isAdmin) {
            listenUsersForAdmin();
        }
    }

    // ==========================================
    // 3. AUTH UI EVENTS
    // ==========================================
    authTabs.forEach(tab => {
        tab.addEventListener("click", () => {
            switchAuthTab(tab.dataset.tab);
        });
    });

    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        setMessage(loginError, "");

        try {
            await auth.signInWithEmailAndPassword(
                loginEmail.value.trim(),
                loginPassword.value
            );
        } catch (error) {
            setMessage(loginError, getFriendlyAuthError(error));
        }
    });

    registerForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        setMessage(registerError, "");

        const name = registerName.value.trim();
        const email = registerEmail.value.trim();
        const password = registerPassword.value;
        const confirm = registerPasswordConfirm.value;

        if (password !== confirm) {
            setMessage(registerError, "Mật khẩu nhập lại không khớp.");
            return;
        }

        try {
            const credential = await auth.createUserWithEmailAndPassword(email, password);
            const uid = credential.user.uid;

            await db.ref(`users/${uid}`).set({
                name: name,
                email: email,
                role: "user",
                status: "pending",
                createdAt: Date.now(),
                approvedAt: null,
                approvedBy: null
            });

            registerForm.reset();
            showPending();
        } catch (error) {
            setMessage(registerError, getFriendlyAuthError(error));
        }
    });

    logoutBtn.addEventListener("click", () => {
        auth.signOut();
    });

    pendingLogoutBtn.addEventListener("click", () => {
        auth.signOut();
    });

    auth.onAuthStateChanged(async (user) => {
        currentUser = user;

        if (!user) {
            currentUserProfile = null;
            isAdmin = false;
            showLogin();
            return;
        }

        const uid = user.uid;
        const snap = await db.ref(`users/${uid}`).once("value");
        let profile = snap.val();

        if (!profile) {
            profile = {
                name: user.displayName || user.email,
                email: user.email,
                role: "user",
                status: "pending",
                createdAt: Date.now(),
                approvedAt: null,
                approvedBy: null
            };

            await db.ref(`users/${uid}`).set(profile);
        }

        if (profile.status !== "approved") {
            showPending();
            return;
        }

        showApp(profile);
    });

    // ==========================================
    // 4. ROUTING + SIDEBAR
    // ==========================================
    navLinks.forEach(link => {
        link.addEventListener("click", () => {
            const targetId = link.dataset.target;

            if (targetId === "accounts-page" && !isAdmin) {
                return;
            }

            goToPage(targetId);

            if (window.innerWidth <= 768) {
                sidebar.classList.remove("show");
            }
        });
    });

    openSidebarBtn.addEventListener("click", () => sidebar.classList.add("show"));
    closeSidebarBtn.addEventListener("click", () => sidebar.classList.remove("show"));

    // ==========================================
    // 5. CLOCK + THEME
    // ==========================================
    function updateClock() {
        const now = new Date();
        document.getElementById("clock").textContent = now.toLocaleTimeString("vi-VN", {
            hour12: false
        });
    }

    setInterval(updateClock, 1000);
    updateClock();

    const savedTheme = localStorage.getItem("roomguard_theme") || "dark";
    document.documentElement.setAttribute("data-theme", savedTheme);
    settingDarkModeSwitch.checked = savedTheme === "dark";
    updateThemeIcon(savedTheme);

    function updateThemeIcon(theme) {
        themeToggleBtn.innerHTML = theme === "dark"
            ? "<i class='bx bx-sun'></i>"
            : "<i class='bx bx-moon'></i>";
    }

    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute("data-theme");
        const newTheme = currentTheme === "dark" ? "light" : "dark";

        document.documentElement.setAttribute("data-theme", newTheme);
        localStorage.setItem("roomguard_theme", newTheme);
        settingDarkModeSwitch.checked = newTheme === "dark";
        updateThemeIcon(newTheme);
    }

    themeToggleBtn.addEventListener("click", toggleTheme);
    settingDarkModeSwitch.addEventListener("change", toggleTheme);

    // ==========================================
    // 6. FIREBASE CONNECTION STATUS
    // ==========================================
    db.ref(".info/connected").on("value", (snapshot) => {
        if (snapshot.val() === true) {
            connStatus.innerHTML = `<span class="dot pulse"></span><span>Online</span>`;
        } else {
            connStatus.innerHTML = `<span class="dot offline"></span><span>Offline</span>`;
        }
    });

    // ==========================================
    // 7. CHART SETUP
    // ==========================================
    Chart.defaults.color = "#94a3b8";
    Chart.defaults.font.family = "'Outfit', sans-serif";

    const colorTemp = "#ef4444";
    const colorHum = "#06b6d4";
    const colorLux = "#eab308";

    const bgTemp = "rgba(239,68,68,0.15)";
    const bgHum = "rgba(6,182,212,0.15)";
    const bgLux = "rgba(234,179,8,0.15)";

    function createSmallChart(canvasId, color, background) {
        const ctx = document.getElementById(canvasId).getContext("2d");

        return new Chart(ctx, {
            type: "line",
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    borderColor: color,
                    backgroundColor: background,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: { display: false },
                    y: { display: false }
                }
            }
        });
    }

    const tempChart = createSmallChart("temperatureChart", colorTemp, bgTemp);
    const humChart = createSmallChart("humidityChart", colorHum, bgHum);
    const luxChart = createSmallChart("lightChart", colorLux, bgLux);

    let mainStatChart = null;

    function updateSmallChart(chart, labels, data) {
        chart.data.labels = labels;
        chart.data.datasets[0].data = data;
        chart.update();
    }

    function updateMainChart(type, labels, tempData, humData, luxData, title) {
        if (mainStatChart) {
            mainStatChart.destroy();
        }

        const isLine = type === "line";

        mainStatChart = new Chart(document.getElementById("mainChart").getContext("2d"), {
            type: type,
            data: {
                labels: labels,
                datasets: [
                    {
                        label: "Nhiệt độ",
                        data: tempData,
                        borderColor: colorTemp,
                        backgroundColor: isLine ? bgTemp : colorTemp,
                        fill: isLine,
                        tension: 0.4,
                        yAxisID: "y"
                    },
                    {
                        label: "Độ ẩm",
                        data: humData,
                        borderColor: colorHum,
                        backgroundColor: isLine ? bgHum : colorHum,
                        fill: isLine,
                        tension: 0.4,
                        yAxisID: "y"
                    },
                    {
                        label: "Ánh sáng",
                        data: luxData,
                        borderColor: colorLux,
                        backgroundColor: isLine ? bgLux : colorLux,
                        fill: isLine,
                        tension: 0.4,
                        yAxisID: "y1"
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: title,
                        color: "#94a3b8"
                    },
                    legend: {
                        labels: {
                            color: "#94a3b8"
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: "rgba(255,255,255,0.05)" }
                    },
                    y: {
                        type: "linear",
                        position: "left",
                        grid: { color: "rgba(255,255,255,0.05)" }
                    },
                    y1: {
                        type: "linear",
                        position: "right",
                        grid: { drawOnChartArea: false }
                    }
                }
            }
        });
    }

    // ==========================================
    // 8. DATA PROCESSING
    // ==========================================
    function checkWarningStatus(temp, hum, lux, mode) {
        const tempBad = temp < 20 || temp > 30;
        const humBad = hum < 35 || hum > 65;

        let luxBad = false;

        if (mode === "hoc_tap") {
            luxBad = lux < 300 || lux > 900;
        } else {
            luxBad = lux < 100 || lux > 250;
        }

        return tempBad || humBad || luxBad;
    }

    function parseHistoryData(historyData) {
        if (!historyData) return [];

        return Object.values(historyData)
            .map(item => {
                const temp = Number(item.temperature ?? 0);
                const hum = Number(item.humidity ?? 0);
                const lux = Number(item.light ?? 0);
                const mode = item.mode || "nghi_ngoi";
                const updatedAt = Number(item.updatedAt ?? 0);
                const dateObj = updatedAt > 0 ? new Date(updatedAt * 1000) : new Date();

                const isWarning = checkWarningStatus(temp, hum, lux, mode);

                return {
                    time: dateObj.toLocaleTimeString("vi-VN", { hour12: false }),
                    dateStr: dateObj.toLocaleDateString("vi-VN"),
                    temperature: temp,
                    humidity: hum,
                    light: lux,
                    mode: mode,
                    updatedAt: updatedAt,
                    dateObj: dateObj,
                    isWarning: isWarning,
                    statusClass: isWarning ? "alert" : "normal",
                    statusText: isWarning ? "Cảnh báo" : "Bình thường"
                };
            })
            .filter(record => record.updatedAt > 0)
            .sort((a, b) => b.updatedAt - a.updatedAt);
    }

    function filterRecordsByDate(records, dateString) {
        if (!dateString) return records;

        return records.filter(record => {
            const y = record.dateObj.getFullYear();
            const m = String(record.dateObj.getMonth() + 1).padStart(2, "0");
            const d = String(record.dateObj.getDate()).padStart(2, "0");

            return `${y}-${m}-${d}` === dateString;
        });
    }

    function filterRecordsByMonth(records, monthString) {
        if (!monthString) return records;

        return records.filter(record => {
            const y = record.dateObj.getFullYear();
            const m = String(record.dateObj.getMonth() + 1).padStart(2, "0");

            return `${y}-${m}` === monthString;
        });
    }

    function groupByHourAverage(records) {
        const buckets = Array.from({ length: 24 }, () => ({
            count: 0,
            temp: 0,
            hum: 0,
            lux: 0
        }));

        records.forEach(record => {
            const hour = record.dateObj.getHours();

            buckets[hour].count++;
            buckets[hour].temp += record.temperature;
            buckets[hour].hum += record.humidity;
            buckets[hour].lux += record.light;
        });

        const labels = [];
        const tempData = [];
        const humData = [];
        const luxData = [];

        for (let i = 0; i < 24; i++) {
            labels.push(`${String(i).padStart(2, "0")}:00`);

            if (buckets[i].count > 0) {
                tempData.push(Number((buckets[i].temp / buckets[i].count).toFixed(1)));
                humData.push(Number((buckets[i].hum / buckets[i].count).toFixed(0)));
                luxData.push(Number((buckets[i].lux / buckets[i].count).toFixed(0)));
            } else {
                tempData.push(null);
                humData.push(null);
                luxData.push(null);
            }
        }

        return { labels, tempData, humData, luxData };
    }

    function groupByDayAverage(records) {
        if (records.length === 0) {
            return {
                labels: [],
                tempData: [],
                humData: [],
                luxData: []
            };
        }

        const year = records[0].dateObj.getFullYear();
        const month = records[0].dateObj.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const buckets = Array.from({ length: daysInMonth + 1 }, () => ({
            count: 0,
            temp: 0,
            hum: 0,
            lux: 0
        }));

        records.forEach(record => {
            const day = record.dateObj.getDate();

            buckets[day].count++;
            buckets[day].temp += record.temperature;
            buckets[day].hum += record.humidity;
            buckets[day].lux += record.light;
        });

        const labels = [];
        const tempData = [];
        const humData = [];
        const luxData = [];

        for (let i = 1; i <= daysInMonth; i++) {
            labels.push(`Ngày ${i}`);

            if (buckets[i].count > 0) {
                tempData.push(Number((buckets[i].temp / buckets[i].count).toFixed(1)));
                humData.push(Number((buckets[i].hum / buckets[i].count).toFixed(0)));
                luxData.push(Number((buckets[i].lux / buckets[i].count).toFixed(0)));
            } else {
                tempData.push(null);
                humData.push(null);
                luxData.push(null);
            }
        }

        return { labels, tempData, humData, luxData };
    }

    function calculateSummary(records) {
        const count = records.length;

        if (count === 0) {
            document.getElementById("stat-avg-temp").textContent = "-- °C";
            document.getElementById("stat-avg-hum").textContent = "-- %";
            document.getElementById("stat-avg-lux").textContent = "-- Lux";
            document.getElementById("stat-count").textContent = "0";
            return;
        }

        let sumTemp = 0;
        let sumHum = 0;
        let sumLux = 0;

        records.forEach(record => {
            sumTemp += record.temperature;
            sumHum += record.humidity;
            sumLux += record.light;
        });

        document.getElementById("stat-avg-temp").textContent = `${(sumTemp / count).toFixed(1)} °C`;
        document.getElementById("stat-avg-hum").textContent = `${(sumHum / count).toFixed(0)} %`;
        document.getElementById("stat-avg-lux").textContent = `${(sumLux / count).toFixed(0)} Lux`;
        document.getElementById("stat-count").textContent = count;
    }

    // ==========================================
    // 9. DASHBOARD + FIREBASE DATA
    // ==========================================
    const dataRef = db.ref("roomguard/data");
    const historyRef = db.ref("roomguard/history");

    dataRef.on("value", snapshot => {
        const data = snapshot.val();

        if (!data) return;

        currentRoomState = data;

        const temp = Number(data.temperature ?? 0);
        const hum = Number(data.humidity ?? 0);
        const lux = Number(data.light ?? 0);
        const mode = data.mode ?? "nghi_ngoi";

        document.getElementById("val-temp").textContent = temp.toFixed(1);
        document.getElementById("val-hum").textContent = hum.toFixed(0);
        document.getElementById("val-lux").textContent = lux.toFixed(0);
        document.getElementById("val-mode").textContent = mode === "hoc_tap" ? "HỌC TẬP" : "NGHỈ NGƠI";

        const isWarning = checkWarningStatus(temp, hum, lux, mode);
        const statusEl = document.getElementById("global-status");

        if (isWarning) {
            statusEl.className = "status-banner danger";
            statusEl.innerHTML = `<i class="bx bx-error"></i> CẢNH BÁO: Phát hiện thông số vượt ngưỡng!`;
        } else {
            statusEl.className = "status-banner good";
            statusEl.innerHTML = `<i class="bx bx-check-shield"></i> HỆ THỐNG HOẠT ĐỘNG BÌNH THƯỜNG`;
        }
    });

    const modeCard = document.getElementById("mode-card-container");

    modeCard.addEventListener("click", () => {
        const currentMode = document.getElementById("val-mode").textContent;
        const newMode = currentMode === "HỌC TẬP" ? "nghi_ngoi" : "hoc_tap";

        db.ref("roomguard/data").update({
            mode: newMode
        });
    });

    historyRef.limitToLast(2000).on("value", snapshot => {
        allHistoryRecords = parseHistoryData(snapshot.val());

        renderOverviewCharts(allHistoryRecords);
        renderCurrentStatistic();
        renderHistoryByDate(allHistoryRecords);
    });

    function renderOverviewCharts(records) {
        const chartRecords = records.slice(0, 20).reverse();

        const labels = chartRecords.map(record => record.time);

        updateSmallChart(
            tempChart,
            labels,
            chartRecords.map(record => record.temperature)
        );

        updateSmallChart(
            humChart,
            labels,
            chartRecords.map(record => record.humidity)
        );

        updateSmallChart(
            luxChart,
            labels,
            chartRecords.map(record => record.light)
        );
    }

    // ==========================================
    // 10. STATISTICS PAGE
    // ==========================================
    let currentStatMode = "realtime";

    const statButtons = document.querySelectorAll(".chart-actions button");
    const datePickersContainer = document.getElementById("date-pickers");
    const dateInput = document.getElementById("stat-date");
    const monthInput = document.getElementById("stat-month");

    const now = new Date();
    dateInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    datePickersContainer.style.display = "none";
    monthInput.style.display = "none";

    statButtons.forEach(button => {
        button.addEventListener("click", () => {
            statButtons.forEach(btn => btn.classList.remove("active"));
            button.classList.add("active");

            currentStatMode = button.dataset.mode;

            if (currentStatMode === "realtime") {
                datePickersContainer.style.display = "none";
            } else if (currentStatMode === "daily") {
                datePickersContainer.style.display = "flex";
                dateInput.style.display = "block";
                monthInput.style.display = "none";
            } else if (currentStatMode === "monthly") {
                datePickersContainer.style.display = "flex";
                dateInput.style.display = "none";
                monthInput.style.display = "block";
            }

            renderCurrentStatistic();
        });
    });

    dateInput.addEventListener("change", renderCurrentStatistic);
    monthInput.addEventListener("change", renderCurrentStatistic);

    function renderCurrentStatistic() {
        if (currentStatMode === "realtime") {
            const records = allHistoryRecords.slice(0, 20).reverse();

            updateMainChart(
                "line",
                records.map(record => record.time),
                records.map(record => record.temperature),
                records.map(record => record.humidity),
                records.map(record => record.light),
                "Realtime - 20 điểm gần nhất"
            );

            calculateSummary(records);
        }

        if (currentStatMode === "daily") {
            const records = filterRecordsByDate(allHistoryRecords, dateInput.value);
            const grouped = groupByHourAverage(records);

            updateMainChart(
                "bar",
                grouped.labels,
                grouped.tempData,
                grouped.humData,
                grouped.luxData,
                `Trung bình theo giờ - ${dateInput.value}`
            );

            calculateSummary(records);
        }

        if (currentStatMode === "monthly") {
            const records = filterRecordsByMonth(allHistoryRecords, monthInput.value);
            const grouped = groupByDayAverage(records);

            updateMainChart(
                "bar",
                grouped.labels,
                grouped.tempData,
                grouped.humData,
                grouped.luxData,
                `Trung bình theo ngày - ${monthInput.value}`
            );

            calculateSummary(records);
        }
    }

    // ==========================================
    // 11. HISTORY PAGE
    // ==========================================
    const historyContainer = document.getElementById("history-accordion-container");
    const filterDate = document.getElementById("history-date-filter");
    const filterStatus = document.getElementById("history-status-filter");
    const modeTabs = document.querySelectorAll("#history-mode-filter .btn-tab");

    let activeHistoryMode = "all";

    filterDate.addEventListener("change", () => renderHistoryByDate(allHistoryRecords));
    filterStatus.addEventListener("change", () => renderHistoryByDate(allHistoryRecords));

    modeTabs.forEach(button => {
        button.addEventListener("click", () => {
            modeTabs.forEach(btn => btn.classList.remove("active"));
            button.classList.add("active");

            activeHistoryMode = button.dataset.mode;
            renderHistoryByDate(allHistoryRecords);
        });
    });

    function filterHistoryRecords(records) {
        let filtered = [...records];

        if (filterDate.value) {
            filtered = filterRecordsByDate(filtered, filterDate.value);
        }

        if (filterStatus.value === "normal") {
            filtered = filtered.filter(record => !record.isWarning);
        }

        if (filterStatus.value === "warning") {
            filtered = filtered.filter(record => record.isWarning);
        }

        return filtered;
    }

    function groupHistoryByDateAndMode(records) {
        const grouped = {};

        records.forEach(record => {
            if (!grouped[record.dateStr]) {
                grouped[record.dateStr] = {
                    hoc_tap: [],
                    nghi_ngoi: []
                };
            }

            if (record.mode === "hoc_tap") {
                grouped[record.dateStr].hoc_tap.push(record);
            } else {
                grouped[record.dateStr].nghi_ngoi.push(record);
            }
        });

        return grouped;
    }

    function renderHistoryByDate(records) {
        if (!historyContainer) return;

        const filtered = filterHistoryRecords(records);

        if (filtered.length === 0) {
            historyContainer.innerHTML = `
                <div class="empty-state">
                    <i class="bx bx-folder-open"></i>
                    <p>Không tìm thấy bản ghi phù hợp.</p>
                </div>
            `;
            return;
        }

        const grouped = groupHistoryByDateAndMode(filtered);
        let html = "";

        Object.keys(grouped).forEach(date => {
            const dateData = grouped[date];

            html += `
                <div class="history-date-group">
                    <div class="date-group-header">
                        <span><i class="bx bx-calendar"></i> ${date}</span>
                    </div>

                    <div class="mode-groups-container">
                        ${renderModeGroup("hoc_tap", dateData.hoc_tap)}
                        ${renderModeGroup("nghi_ngoi", dateData.nghi_ngoi)}
                    </div>
                </div>
            `;
        });

        historyContainer.innerHTML = html;
    }

    function renderModeGroup(mode, records) {
        const label = mode === "hoc_tap" ? "HỌC TẬP" : "NGHỈ NGƠI";
        const icon = mode === "hoc_tap" ? "bx-book-reader" : "bx-coffee";
        const modeClass = mode === "hoc_tap" ? "mode-hoc-tap" : "mode-nghi-ngoi";

        let activeClass = "";

        if (activeHistoryMode !== "all") {
            activeClass = activeHistoryMode === mode ? "active-mode" : "dimmed-mode";
        }

        return `
            <div class="mode-group ${modeClass} ${activeClass}">
                <div class="mode-group-header">
                    <i class="bx ${icon}"></i>
                    <span>${label}</span>
                    <span class="mode-count">${records.length}</span>
                </div>

                ${
                    records.length === 0
                        ? `<div class="empty-mode-text">Không có dữ liệu cho chế độ này</div>`
                        : `<div class="record-list">${records.map(record => renderRecord(record)).join("")}</div>`
                }
            </div>
        `;
    }

    function renderRecord(record) {
        return `
            <div class="record-item">
                <div class="record-item-top">
                    <div class="record-time">
                        <i class="bx bx-time-five"></i>
                        ${record.time}
                    </div>

                    <span class="badge-status ${record.statusClass}">
                        ${record.statusText}
                    </span>
                </div>

                <div class="record-item-bottom">
                    <span><i class="bx bxs-thermometer temp-icon"></i>${record.temperature.toFixed(1)}°C</span>
                    <span><i class="bx bx-water hum-icon"></i>${record.humidity.toFixed(0)}%</span>
                    <span><i class="bx bxs-bulb lux-icon"></i>${record.light.toFixed(0)} Lux</span>
                </div>
            </div>
        `;
    }

    // ==========================================
    // 12. ADMIN ACCOUNT APPROVAL
    // ==========================================
    let usersListenerStarted = false;

    function listenUsersForAdmin() {
        if (!isAdmin || usersListenerStarted) return;

        usersListenerStarted = true;

        db.ref("users").on("value", snapshot => {
            const users = snapshot.val() || {};

            const pendingUsers = [];
            const processedUsers = [];

            Object.entries(users).forEach(([uid, user]) => {
                const userData = {
                    uid,
                    ...user
                };

                if (userData.status === "pending") {
                    pendingUsers.push(userData);
                } else {
                    processedUsers.push(userData);
                }
            });

            renderPendingUsers(pendingUsers);
            renderProcessedUsers(processedUsers);

            document.getElementById("pending-count").textContent = pendingUsers.length;
            document.getElementById("processed-count").textContent = processedUsers.length;
            document.getElementById("notif-count").textContent = pendingUsers.length;
        });
    }

    function renderPendingUsers(users) {
        const container = document.getElementById("pending-users-list");

        if (users.length === 0) {
            container.innerHTML = `
                <div class="empty-state small">
                    <p>Chưa có tài khoản chờ duyệt.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = users.map(user => `
            <div class="approval-user-card">
                <div>
                    <h4>${user.name || "Người dùng"}</h4>
                    <p>${user.email || "--"}</p>
                    <small>Đăng ký: ${formatTime(user.createdAt)}</small>
                </div>

                <div class="approval-actions">
                    <button class="btn btn-success btn-small" data-approve="${user.uid}">
                        Duyệt
                    </button>
                    <button class="btn btn-danger btn-small" data-reject="${user.uid}">
                        Từ chối
                    </button>
                </div>
            </div>
        `).join("");

        container.querySelectorAll("[data-approve]").forEach(button => {
            button.addEventListener("click", () => approveUser(button.dataset.approve));
        });

        container.querySelectorAll("[data-reject]").forEach(button => {
            button.addEventListener("click", () => rejectUser(button.dataset.reject));
        });
    }

    function renderProcessedUsers(users) {
        const container = document.getElementById("processed-users-list");

        if (users.length === 0) {
            container.innerHTML = `
                <div class="empty-state small">
                    <p>Chưa có dữ liệu.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = users.map(user => `
            <div class="approval-user-card processed">
                <div>
                    <h4>${user.name || "Người dùng"}</h4>
                    <p>${user.email || "--"}</p>
                    <small>Vai trò: ${user.role || "user"}</small>
                </div>

                <span class="badge-status ${user.status === "approved" ? "normal" : "alert"}">
                    ${user.status || "--"}
                </span>
            </div>
        `).join("");
    }

    async function approveUser(uid) {
        if (!isAdmin) return;

        await db.ref(`users/${uid}`).update({
            status: "approved",
            approvedAt: Date.now(),
            approvedBy: currentUser.uid
        });
    }

    async function rejectUser(uid) {
        if (!isAdmin) return;

        await db.ref(`users/${uid}`).update({
            status: "rejected",
            approvedAt: Date.now(),
            approvedBy: currentUser.uid
        });
    }

    function formatTime(timestamp) {
        if (!timestamp) return "--";
        return new Date(timestamp).toLocaleString("vi-VN");
    }

    // ==========================================
    // 13. CHATBOT GEMINI
    // ==========================================
    const chatInput = document.getElementById("chat-input");
    const chatSendBtn = document.getElementById("chat-send-btn");
    const chatMessages = document.getElementById("chat-messages");

    const GEMINI_API_KEY = "DAN_GEMINI_API_KEY_CUA_BAN";
    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    function addMessageToUI(text, sender) {
        const msgDiv = document.createElement("div");
        msgDiv.className = `message ${sender}-msg`;
        msgDiv.innerHTML = `<div class="msg-bubble">${text}</div>`;

        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    async function sendToGemini(userText) {
        if (!GEMINI_API_KEY || GEMINI_API_KEY === "AIzaSyDJB7UVh78AjXjFlwI1y3EgTX__-Y0bJZA") {
            addMessageToUI("Bạn chưa cấu hình Gemini API key trong app.js.", "bot");
            return;
        }

        chatSendBtn.disabled = true;
        chatSendBtn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i>";

        try {
            let contextStr = "Chưa có dữ liệu phòng.";

            if (currentRoomState) {
                const modeText = currentRoomState.mode === "hoc_tap" ? "HỌC TẬP" : "NGHỈ NGƠI";

                contextStr =
                    `Nhiệt độ: ${Number(currentRoomState.temperature).toFixed(1)}°C, ` +
                    `Độ ẩm: ${Number(currentRoomState.humidity).toFixed(0)}%, ` +
                    `Ánh sáng: ${Number(currentRoomState.light).toFixed(0)} Lux, ` +
                    `Chế độ: ${modeText}.`;
            }

            const prompt =
                `Bạn là trợ lí thông minh RoomGuard. ` +
                `Tình trạng phòng hiện tại: ${contextStr} ` +
                `Hãy trả lời ngắn gọn, dễ hiểu bằng tiếng Việt, không dùng markdown. ` +
                `Câu hỏi người dùng: ${userText}`;

            const response = await fetch(GEMINI_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                {
                                    text: prompt
                                }
                            ]
                        }
                    ]
                })
            });

            const data = await response.json();

            if (!response.ok) {
                addMessageToUI(`Lỗi từ API: ${data.error?.message || response.statusText}`, "bot");
                return;
            }

            const botReply =
                data.candidates?.[0]?.content?.parts?.[0]?.text ||
                "Xin lỗi, mình không thể trả lời lúc này.";

            addMessageToUI(botReply.replace(/\*/g, ""), "bot");
        } catch (error) {
            addMessageToUI("Đã xảy ra lỗi kết nối với Gemini.", "bot");
        } finally {
            chatSendBtn.disabled = false;
            chatSendBtn.innerHTML = "<i class='bx bx-send'></i>";
        }
    }

    function handleChatSend() {
        const text = chatInput.value.trim();

        if (!text) return;

        addMessageToUI(text, "user");
        chatInput.value = "";
        sendToGemini(text);
    }

    chatSendBtn.addEventListener("click", handleChatSend);

    chatInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            handleChatSend();
        }
    });
});