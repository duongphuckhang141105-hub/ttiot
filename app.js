// app.js

document.addEventListener("DOMContentLoaded", () => {
    // ==========================================
    // 0. AUTHENTICATION LOGIC
    // ==========================================
    const loginForm = document.getElementById("login-form");
    const loginScreen = document.getElementById("login-screen");
    const appLayout = document.getElementById("app-layout");
    const logoutBtn = document.getElementById("logout-btn");
    const errorMsg = document.getElementById("login-error");

    checkLoginState();

    function checkLoginState() {
        const isLoggedIn = localStorage.getItem("roomguard_logged_in");
        if (isLoggedIn === "true") {
            showApp();
        } else {
            showLogin();
        }
    }

    loginForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const user = document.getElementById("username").value;
        const pass = document.getElementById("password").value;

        if (user === "admin" && pass === "123456") {
            localStorage.setItem("roomguard_logged_in", "true");
            errorMsg.textContent = "";
            showApp();
        } else {
            errorMsg.textContent = "Sai tài khoản hoặc mật khẩu!";
        }
    });

    logoutBtn.addEventListener("click", () => {
        localStorage.removeItem("roomguard_logged_in");
        showLogin();
    });

    function showApp() {
        loginScreen.classList.remove("active");
        setTimeout(() => appLayout.classList.add("active"), 300);
    }

    function showLogin() {
        appLayout.classList.remove("active");
        loginScreen.classList.add("active");
        loginForm.reset();
        errorMsg.textContent = "";
    }

    // ==========================================
    // 1. SPA ROUTING & SIDEBAR LOGIC
    // ==========================================
    const navLinks = document.querySelectorAll(".nav-links li");
    const pages = document.querySelectorAll(".page");
    const pageTitle = document.getElementById("page-title");
    const sidebar = document.getElementById("sidebar");
    const openSidebarBtn = document.getElementById("open-sidebar");
    const closeSidebarBtn = document.getElementById("close-sidebar");

    navLinks.forEach(link => {
        link.addEventListener("click", () => {
            navLinks.forEach(l => l.classList.remove("active"));
            pages.forEach(p => p.classList.remove("active"));

            link.classList.add("active");

            const targetId = link.getAttribute("data-target");
            const targetPage = document.getElementById(targetId);

            if (targetPage) targetPage.classList.add("active");
            pageTitle.textContent = link.querySelector("span").textContent;

            if (window.innerWidth <= 768) sidebar.classList.remove("show");
            
            if (targetId === 'history-page') {
                renderHistoryByDate(allHistoryRecords);
            }
        });
    });

    openSidebarBtn.addEventListener("click", () => sidebar.classList.add("show"));
    closeSidebarBtn.addEventListener("click", () => sidebar.classList.remove("show"));

    // ==========================================
    // 2. CLOCK & THEME LOGIC
    // ==========================================
    function updateClock() {
        const now = new Date();
        document.getElementById("clock").textContent = now.toLocaleTimeString("vi-VN", { hour12: false });
    }
    setInterval(updateClock, 1000);
    updateClock();

    const themeToggleBtn = document.getElementById("theme-toggle");
    const settingDarkModeSwitch = document.getElementById("setting-darkmode");

    const savedTheme = localStorage.getItem("roomguard_theme") || "dark"; // Default dark
    document.documentElement.setAttribute("data-theme", savedTheme);
    settingDarkModeSwitch.checked = savedTheme === "dark";
    updateThemeIcon(savedTheme);

    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute("data-theme");
        const newTheme = currentTheme === "dark" ? "light" : "dark";

        document.documentElement.setAttribute("data-theme", newTheme);
        localStorage.setItem("roomguard_theme", newTheme);
        settingDarkModeSwitch.checked = newTheme === "dark";
        updateThemeIcon(newTheme);
    }
    
    function updateThemeIcon(theme) {
        if(theme === 'dark') {
            themeToggleBtn.innerHTML = "<i class='bx bx-sun'></i>";
        } else {
            themeToggleBtn.innerHTML = "<i class='bx bx-moon'></i>";
        }
    }

    themeToggleBtn.addEventListener("click", toggleTheme);
    settingDarkModeSwitch.addEventListener("change", toggleTheme);

    // ==========================================
    // 3. FIREBASE SETUP
    // ==========================================
    const firebaseConfig = {
        apiKey: "DAN_FIREBASE_API_KEY_CUA_BAN",
        authDomain: "ttiot-44d9a.firebaseapp.com",
        databaseURL: "https://ttiot-44d9a-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "ttiot-44d9a",
        storageBucket: "ttiot-44d9a.firebasestorage.app",
        messagingSenderId: "907056760486",
        appId: "1:907056760486:web:2b0255d37a09aca5df9667"
    };

    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    const db = firebase.database();
    
    const connStatus = document.getElementById("conn-status");
    db.ref(".info/connected").on("value", (snap) => {
        if (snap.val() === true) {
            connStatus.innerHTML = `<span class="dot pulse"></span> <span class="text">Online</span>`;
        } else {
            connStatus.innerHTML = `<span class="dot" style="background:var(--danger)"></span> <span class="text" style="color:var(--danger)">Offline</span>`;
        }
    });

    const dataRef = db.ref("roomguard/data");
    const historyRef = db.ref("roomguard/history");

    let currentRoomState = null;
    let allHistoryRecords = [];

    // ==========================================
    // 4. DATA PROCESSING FUNCTIONS
    // ==========================================
    
    function checkWarningStatus(temp, hum, lux, mode) {
        const isTempBad = temp < 20 || temp > 30;
        const isHumBad = hum < 35 || hum > 65;
        let isLuxBad = false;
        
        if (mode === 'hoc_tap') {
            isLuxBad = lux < 300 || lux > 900;
        } else { // nghi_ngoi
            isLuxBad = lux < 100 || lux > 250;
        }
        
        return isTempBad || isHumBad || isLuxBad;
    }

    function parseHistoryData(historyData) {
        if (!historyData) return [];
        
        return Object.values(historyData)
            .map(item => {
                const temp = Number(item.temperature ?? 0);
                const hum = Number(item.humidity ?? 0);
                const lux = Number(item.light ?? 0);
                const mode = item.mode || 'nghi_ngoi';
                const updatedAt = Number(item.updatedAt ?? 0);
                
                const isWarning = checkWarningStatus(temp, hum, lux, mode);
                const dateObj = updatedAt > 0 ? new Date(updatedAt * 1000) : new Date();
                
                return {
                    time: dateObj.toLocaleTimeString("vi-VN", {hour12:false}),
                    dateStr: dateObj.toLocaleDateString("vi-VN"), // DD/MM/YYYY
                    type: isWarning ? "Cảnh báo" : "Bình thường",
                    statusClass: isWarning ? "alert" : "normal",
                    statusText: isWarning ? "Cảnh báo" : "Bình thường",
                    temperature: temp,
                    humidity: hum,
                    light: lux,
                    mode: mode,
                    isWarning: isWarning,
                    updatedAt: updatedAt,
                    dateObj: dateObj
                };
            })
            .filter(item => item.updatedAt > 0)
            .sort((a, b) => b.updatedAt - a.updatedAt); // Sort DESC (newest first)
    }

    // --- Statistics Filtering ---
    function filterRecordsByDate(records, dateString) {
        if (!dateString) return [];
        return records.filter(record => {
            const recordDateStr = `${record.dateObj.getFullYear()}-${String(record.dateObj.getMonth() + 1).padStart(2, '0')}-${String(record.dateObj.getDate()).padStart(2, '0')}`;
            return recordDateStr === dateString;
        });
    }

    function filterRecordsByMonth(records, monthString) {
        if (!monthString) return [];
        return records.filter(record => {
            const recordMonthStr = `${record.dateObj.getFullYear()}-${String(record.dateObj.getMonth() + 1).padStart(2, '0')}`;
            return recordMonthStr === monthString;
        });
    }

    // --- Statistics Grouping ---
    function groupByHourAverage(records) {
        const hourlyData = Array.from({length: 24}, () => ({ count: 0, t: 0, h: 0, l: 0 }));
        records.forEach(r => {
            const hour = r.dateObj.getHours();
            hourlyData[hour].count++;
            hourlyData[hour].t += r.temperature;
            hourlyData[hour].h += r.humidity;
            hourlyData[hour].l += r.light;
        });

        const result = { labels: [], tempAverages: [], humAverages: [], luxAverages: [] };
        for (let i = 0; i < 24; i++) {
            result.labels.push(`${String(i).padStart(2, '0')}:00`);
            const d = hourlyData[i];
            if (d.count > 0) {
                result.tempAverages.push(d.t / d.count);
                result.humAverages.push(d.h / d.count);
                result.luxAverages.push(d.l / d.count);
            } else {
                result.tempAverages.push(null); result.humAverages.push(null); result.luxAverages.push(null);
            }
        }
        return result;
    }

    function groupByDayAverage(records) {
        if (records.length === 0) return { labels: [], tempAverages: [], humAverages: [], luxAverages: [] };
        const year = records[0].dateObj.getFullYear();
        const month = records[0].dateObj.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const dailyData = Array.from({length: daysInMonth + 1}, () => ({ count: 0, t: 0, h: 0, l: 0 }));
        records.forEach(r => {
            const day = r.dateObj.getDate();
            dailyData[day].count++;
            dailyData[day].t += r.temperature;
            dailyData[day].h += r.humidity;
            dailyData[day].l += r.light;
        });

        const result = { labels: [], tempAverages: [], humAverages: [], luxAverages: [] };
        for (let i = 1; i <= daysInMonth; i++) {
            result.labels.push(`Ngày ${i}`);
            const d = dailyData[i];
            if (d.count > 0) {
                result.tempAverages.push(d.t / d.count);
                result.humAverages.push(d.h / d.count);
                result.luxAverages.push(d.l / d.count);
            } else {
                result.tempAverages.push(null); result.humAverages.push(null); result.luxAverages.push(null);
            }
        }
        return result;
    }

    function calculateSummary(records) {
        const count = records.length;
        if (count === 0) {
            document.getElementById("stat-avg-temp").innerHTML = `-- <small>°C</small>`;
            document.getElementById("stat-avg-hum").innerHTML = `-- <small>%</small>`;
            document.getElementById("stat-avg-lux").innerHTML = `-- <small>Lux</small>`;
            document.getElementById("stat-count").textContent = `0`;
            return;
        }

        let tSum = 0, hSum = 0, lSum = 0;
        records.forEach(r => { tSum += r.temperature; hSum += r.humidity; lSum += r.light; });

        document.getElementById("stat-avg-temp").innerHTML = `${(tSum / count).toFixed(1)} <small>°C</small>`;
        document.getElementById("stat-avg-hum").innerHTML = `${(hSum / count).toFixed(0)} <small>%</small>`;
        document.getElementById("stat-avg-lux").innerHTML = `${(lSum / count).toFixed(0)} <small>Lux</small>`;
        document.getElementById("stat-count").textContent = count;
    }

    // --- History Grouping ---
    function groupHistoryByDate(records) {
        const grouped = {};
        records.forEach(r => {
            if (!grouped[r.dateStr]) grouped[r.dateStr] = [];
            grouped[r.dateStr].push(r);
        });
        return grouped;
    }

    function groupHistoryByDateAndMode(records) {
        const byDate = groupHistoryByDate(records);
        const finalGrouped = {};
        
        for (const date in byDate) {
            finalGrouped[date] = {
                hoc_tap: [],
                nghi_ngoi: []
            };
            byDate[date].forEach(r => {
                if (r.mode === 'hoc_tap') finalGrouped[date].hoc_tap.push(r);
                else finalGrouped[date].nghi_ngoi.push(r);
            });
        }
        return finalGrouped;
    }

    function filterHistoryByMode(records, mode) {
        if (mode === 'all') return records;
        return records.filter(r => r.mode === mode);
    }

    function filterHistoryByStatus(records, status) {
        if (status === 'all') return records;
        if (status === 'normal') return records.filter(r => !r.isWarning);
        if (status === 'warning') return records.filter(r => r.isWarning);
        return records;
    }


    // ==========================================
    // 5. CHART.JS LOGIC
    // ==========================================
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = "'Outfit', sans-serif";
    
    // Colors
    const colorTemp = "#ef4444"; const bgTemp = "rgba(239, 68, 68, 0.1)";
    const colorHum = "#06b6d4"; const bgHum = "rgba(6, 182, 212, 0.1)";
    const colorLux = "#eab308"; const bgLux = "rgba(234, 179, 8, 0.1)";

    const miniChartOptions = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
            x: { display: false },
            y: { display: false, beginAtZero: false }
        },
        elements: { point: { radius: 0 }, line: { borderWidth: 2 } }
    };

    let tempChart = new Chart(document.getElementById("temperatureChart").getContext("2d"), {
        type: "line", data: { labels: [], datasets: [] }, options: miniChartOptions
    });
    let humChart = new Chart(document.getElementById("humidityChart").getContext("2d"), {
        type: "line", data: { labels: [], datasets: [] }, options: miniChartOptions
    });
    let luxChart = new Chart(document.getElementById("lightChart").getContext("2d"), {
        type: "line", data: { labels: [], datasets: [] }, options: miniChartOptions
    });
    
    let mainStatChart = null;

    // --- RENDER 3 OVERVIEW CHARTS ---
    function renderTemperatureChart(records) {
        const labels = records.map(r => r.time);
        const data = records.map(r => r.temperature);
        tempChart.data = {
            labels: labels,
            datasets: [{ borderColor: colorTemp, backgroundColor: bgTemp, fill: true, tension: 0.4, data: data }]
        };
        tempChart.update();
    }

    function renderHumidityChart(records) {
        const labels = records.map(r => r.time);
        const data = records.map(r => r.humidity);
        humChart.data = {
            labels: labels,
            datasets: [{ borderColor: colorHum, backgroundColor: bgHum, fill: true, tension: 0.4, data: data }]
        };
        humChart.update();
    }

    function renderLightChart(records) {
        const labels = records.map(r => r.time);
        const data = records.map(r => r.light);
        luxChart.data = {
            labels: labels,
            datasets: [{ borderColor: colorLux, backgroundColor: bgLux, fill: true, tension: 0.4, data: data }]
        };
        luxChart.update();
    }

    function renderOverviewCharts(records) {
        // We need chronological order for line charts (oldest to newest left to right)
        // Records are passed in as newest first, so we slice and reverse.
        const chartRecords = records.slice(0, 20).reverse();
        renderTemperatureChart(chartRecords);
        renderHumidityChart(chartRecords);
        renderLightChart(chartRecords);
    }

    // --- RENDER STATISTICS CHARTS ---
    function updateStatChart(type, labels, tempAvg, humAvg, luxAvg, titleText) {
        if (mainStatChart) mainStatChart.destroy();
        
        const isLine = type === 'line';
        
        mainStatChart = new Chart(document.getElementById("mainChart").getContext("2d"), {
            type: type,
            data: {
                labels: labels,
                datasets: [
                    { label: "Nhiệt Độ", borderColor: colorTemp, backgroundColor: isLine?bgTemp:colorTemp, borderWidth: isLine?2:0, fill: isLine, tension: 0.4, data: tempAvg, yAxisID: 'y' },
                    { label: "Độ Ẩm", borderColor: colorHum, backgroundColor: isLine?bgHum:colorHum, borderWidth: isLine?2:0, fill: isLine, tension: 0.4, data: humAvg, yAxisID: 'y' },
                    { label: "Ánh Sáng", borderColor: colorLux, backgroundColor: isLine?bgLux:colorLux, borderWidth: isLine?2:0, fill: isLine, tension: 0.4, data: luxAvg, yAxisID: 'y1' }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#94a3b8' } },
                    title: { display: true, text: titleText, color: '#94a3b8' }
                },
                elements: { point: { radius: isLine?0:3 } },
                scales: {
                    x: { grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: { type: 'linear', position: 'left', grid: { color: 'rgba(255,255,255,0.05)' } },
                    y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false } }
                }
            }
        });
    }

    function renderRealtimeChart() {
        const chartRecords = allHistoryRecords.slice(0, 20).reverse();
        const labels = chartRecords.map(r => r.time);
        const t = chartRecords.map(r => r.temperature);
        const h = chartRecords.map(r => r.humidity);
        const l = chartRecords.map(r => r.light);
        updateStatChart("line", labels, t, h, l, "Realtime (20 điểm gần nhất)");
        calculateSummary(chartRecords);
    }

    function renderDailyChart(dateString) {
        const records = filterRecordsByDate(allHistoryRecords, dateString);
        const grouped = groupByHourAverage(records);
        updateStatChart("bar", grouped.labels, grouped.tempAverages, grouped.humAverages, grouped.luxAverages, `Dữ liệu trung bình từng giờ (${dateString})`);
        calculateSummary(records);
    }

    function renderMonthlyChart(monthString) {
        const records = filterRecordsByMonth(allHistoryRecords, monthString);
        const grouped = groupByDayAverage(records);
        updateStatChart("bar", grouped.labels, grouped.tempAverages, grouped.humAverages, grouped.luxAverages, `Dữ liệu trung bình từng ngày (${monthString})`);
        calculateSummary(records);
    }


    // ==========================================
    // 6. STATISTICS TAB LOGIC
    // ==========================================
    let currentStatMode = "realtime";
    const statButtons = document.querySelectorAll(".chart-actions button");
    const datePickersContainer = document.getElementById("date-pickers");
    const dateInput = document.getElementById("stat-date");
    const monthInput = document.getElementById("stat-month");

    const today = new Date();
    dateInput.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    monthInput.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

    statButtons.forEach(btn => {
        btn.addEventListener("click", (e) => {
            statButtons.forEach(b => b.classList.remove("active"));
            e.target.classList.add("active");
            
            currentStatMode = e.target.getAttribute("data-mode");
            
            if (currentStatMode === "realtime") {
                datePickersContainer.style.display = "none";
                renderRealtimeChart();
            } else if (currentStatMode === "daily") {
                datePickersContainer.style.display = "flex";
                dateInput.style.display = "block";
                monthInput.style.display = "none";
                renderDailyChart(dateInput.value);
            } else if (currentStatMode === "monthly") {
                datePickersContainer.style.display = "flex";
                dateInput.style.display = "none";
                monthInput.style.display = "block";
                renderMonthlyChart(monthInput.value);
            }
        });
    });

    dateInput.addEventListener("change", () => renderDailyChart(dateInput.value));
    monthInput.addEventListener("change", () => renderMonthlyChart(monthInput.value));

    // ==========================================
    // 7. DASHBOARD REALTIME UI LOGIC
    // ==========================================
    function updateDashboardUI(data) {
        currentRoomState = data;

        const temp = Number(data.temperature ?? 0);
        const hum = Number(data.humidity ?? 0);
        const lux = Number(data.light ?? 0);
        const mode = data.mode ?? "nghi_ngoi";

        document.getElementById("val-temp").textContent = temp.toFixed(1);
        document.getElementById("val-hum").textContent = hum.toFixed(0);
        document.getElementById("val-lux").textContent = lux.toFixed(0);

        const modeText = mode === "hoc_tap" ? "HỌC TẬP" : "NGHỈ NGƠI";
        document.getElementById("val-mode").textContent = modeText;
        
        // Fast evaluation using mode-aware logic
        const isWarning = checkWarningStatus(temp, hum, lux, mode);
        
        const tempCard = document.querySelector(".temp-theme");
        const humCard = document.querySelector(".hum-theme");
        
        if (temp < 20 || temp > 30) tempCard.style.borderColor = 'var(--danger)';
        else tempCard.style.borderColor = 'var(--glass-border)';
        
        if (hum < 35 || hum > 65) humCard.style.borderColor = 'var(--danger)';
        else humCard.style.borderColor = 'var(--glass-border)';

        const statusEl = document.getElementById("global-status");
        if (isWarning) {
            statusEl.className = "status-banner danger";
            statusEl.innerHTML = `<i class='bx bx-error'></i> CẢNH BÁO: Phát hiện thông số vượt ngưỡng!`;
        } else {
            statusEl.className = "status-banner good";
            statusEl.innerHTML = `<i class='bx bx-check-shield'></i> HỆ THỐNG HOẠT ĐỘNG BÌNH THƯỜNG`;
        }
    }

    dataRef.on("value", (snapshot) => {
        const data = snapshot.val();
        if (data) updateDashboardUI(data);
    });

    // CLICK CARD TO CHANGE MODE
    const modeCard = document.getElementById("mode-card-container");
    if (modeCard) {
        modeCard.addEventListener("click", () => {
            const currentText = document.getElementById("val-mode").textContent;
            const newMode = currentText === "HỌC TẬP" ? "nghi_ngoi" : "hoc_tap";
            db.ref("roomguard/data").update({ mode: newMode });
        });
    }

    // ==========================================
    // ==========================================
// 8. HISTORY GROUPED UI LOGIC
// ==========================================
const historyContainer = document.getElementById("history-accordion-container");
const filterDate = document.getElementById("history-date-filter");
const filterModeWrapper = document.getElementById("history-mode-filter");
const filterStatus = document.getElementById("history-status-filter");

let activeHistoryMode = "all";
const modeTabButtons = filterModeWrapper
    ? filterModeWrapper.querySelectorAll(".btn-tab")
    : [];

function getModeLabel(mode) {
    if (mode === "hoc_tap") return "HỌC TẬP";
    if (mode === "nghi_ngoi") return "NGHỈ NGƠI";
    return "KHÔNG XÁC ĐỊNH";
}

function getModeIcon(mode) {
    if (mode === "hoc_tap") return "bx-book-reader";
    if (mode === "nghi_ngoi") return "bx-coffee";
    return "bx-question-mark";
}

function getModeClass(mode) {
    if (mode === "hoc_tap") return "mode-hoc-tap";
    if (mode === "nghi_ngoi") return "mode-nghi-ngoi";
    return "";
}

function getModeActiveClass(mode) {
    if (activeHistoryMode === "all") {
        return "";
    }

    if (activeHistoryMode === mode) {
        return "active-mode";
    }

    return "dimmed-mode";
}

function getHistoryFilteredRecords(records) {
    let filtered = [...records];

    // Lọc theo ngày nếu có chọn ngày
    if (filterDate && filterDate.value) {
        filtered = filterRecordsByDate(filtered, filterDate.value);
    }

    // Lọc theo trạng thái
    if (filterStatus && filterStatus.value) {
        filtered = filterHistoryByStatus(filtered, filterStatus.value);
    }

    // Lưu ý:
    // Không lọc bỏ mode ở đây.
    // Vì yêu cầu là mỗi ngày vẫn hiển thị 2 khối HỌC TẬP và NGHỈ NGƠI.
    // Khi chọn mode, chỉ làm khối đó sáng lên, khối còn lại mờ đi.

    return filtered;
}

function renderHistoryByDate(records) {
    if (!historyContainer) return;

    const filtered = getHistoryFilteredRecords(records);

    if (filtered.length === 0) {
        historyContainer.innerHTML = `
            <div class="empty-state">
                <i class='bx bx-folder-open'></i>
                <p>Không tìm thấy bản ghi nào phù hợp.</p>
            </div>
        `;
        return;
    }

    const grouped = groupHistoryByDateAndMode(filtered);
    let html = "";

    for (const date in grouped) {
        const dateData = grouped[date];

        const hocTapCount = dateData.hoc_tap.length;
        const nghiNgoiCount = dateData.nghi_ngoi.length;
        const totalCount = hocTapCount + nghiNgoiCount;

        if (totalCount === 0) continue;

        html += `
            <div class="history-date-group mb-3">
                <div class="date-group-header">
                    <span>
                        <i class='bx bx-calendar'></i>
                        ${date}
                    </span>

                    <span style="font-size: 0.85rem; color: var(--text-muted); font-weight: 500;">
                        ${totalCount} bản ghi
                    </span>
                </div>

                <div class="mode-groups-container">
                    ${renderModeGroup("hoc_tap", dateData.hoc_tap)}
                    ${renderModeGroup("nghi_ngoi", dateData.nghi_ngoi)}
                </div>
            </div>
        `;
    }

    historyContainer.innerHTML = html;
}

function renderModeGroup(mode, records) {
    const modeLabel = getModeLabel(mode);
    const modeIcon = getModeIcon(mode);
    const modeClass = getModeClass(mode);
    const activeClass = getModeActiveClass(mode);

    let recordsHTML = "";

    if (records.length === 0) {
        recordsHTML = `
            <div class="empty-mode-text">
                Không có dữ liệu cho chế độ này
            </div>
        `;
    } else {
        recordsHTML = `
            <div class="record-list">
                ${records.map(record => generateRecordHTML(record)).join("")}
            </div>
        `;
    }

    return `
        <div class="mode-group ${modeClass} ${activeClass}">
            <div class="mode-group-header">
                <i class='bx ${modeIcon}'></i>

                <span>${modeLabel}</span>

                <span style="
                    margin-left: auto;
                    font-size: 0.8rem;
                    padding: 3px 9px;
                    border-radius: 999px;
                    background: rgba(255,255,255,0.08);
                    color: currentColor;
                ">
                    ${records.length}
                </span>
            </div>

            ${recordsHTML}
        </div>
    `;
}

function generateRecordHTML(record) {
    return `
        <div class="record-item">
            <div class="record-item-top">
                <div class="record-time">
                    <i class='bx bx-time-five'></i>
                    ${record.time}
                </div>

                <span class="badge-status ${record.statusClass}">
                    ${record.statusText}
                </span>
            </div>

            <div class="record-item-bottom">
                <span title="Nhiệt độ">
                    <i class='bx bxs-thermometer' style="color: var(--color-temp);"></i>
                    ${record.temperature.toFixed(1)}°C
                </span>

                <span title="Độ ẩm">
                    <i class='bx bx-water' style="color: var(--color-hum);"></i>
                    ${record.humidity.toFixed(0)}%
                </span>

                <span title="Ánh sáng">
                    <i class='bx bxs-bulb' style="color: var(--color-lux);"></i>
                    ${record.light.toFixed(0)} Lux
                </span>
            </div>
        </div>
    `;
}

// Sự kiện lọc ngày
if (filterDate) {
    filterDate.addEventListener("change", () => {
        renderHistoryByDate(allHistoryRecords);
    });
}

// Sự kiện lọc trạng thái
if (filterStatus) {
    filterStatus.addEventListener("change", () => {
        renderHistoryByDate(allHistoryRecords);
    });
}

// Sự kiện chọn mode bằng tab/chip
modeTabButtons.forEach(button => {
    button.addEventListener("click", () => {
        modeTabButtons.forEach(btn => btn.classList.remove("active"));
        button.classList.add("active");

        activeHistoryMode = button.getAttribute("data-mode") || "all";

        renderHistoryByDate(allHistoryRecords);
    });
});

historyRef.limitToLast(2000).on("value", (snapshot) => {
    allHistoryRecords = parseHistoryData(snapshot.val());

    renderOverviewCharts(allHistoryRecords);

    if (currentStatMode === "realtime") {
        renderRealtimeChart();
    } else if (currentStatMode === "daily") {
        renderDailyChart(dateInput.value);
    } else if (currentStatMode === "monthly") {
        renderMonthlyChart(monthInput.value);
    }

    const historyPage = document.getElementById("history-page");

    if (historyPage && historyPage.classList.contains("active")) {
        renderHistoryByDate(allHistoryRecords);
    }
});
    // ==========================================
    // 9. CHATBOT TÍCH HỢP GEMINI AI
    // ==========================================
    const chatInput = document.getElementById("chat-input");
    const chatSendBtn = document.getElementById("chat-send-btn");
    const chatMessages = document.getElementById("chat-messages");

    const GEMINI_API_KEY = "AIzaSyDJB7UVh78AjXjFlwI1y3EgTX__-Y0bJZA";
    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`;

    function addMessageToUI(text, sender) {
        const msgDiv = document.createElement("div");
        msgDiv.className = `message ${sender}-msg`;
        msgDiv.innerHTML = `<div class="msg-bubble">${text}</div>`;
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    async function sendToGemini(userText) {
        chatSendBtn.disabled = true;
        chatSendBtn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i>";

        try {
            let contextStr = "Chưa có dữ liệu phòng.";
            if (currentRoomState) {
                const modeText = currentRoomState.mode === "hoc_tap" ? "HỌC TẬP" : "NGHỈ NGƠI";
                contextStr = `Nhiệt độ: ${Number(currentRoomState.temperature).toFixed(1)}°C, ` +
                             `Độ ẩm: ${Number(currentRoomState.humidity).toFixed(0)}%, ` +
                             `Ánh sáng: ${Number(currentRoomState.light).toFixed(0)} Lux, ` +
                             `Chế độ: ${modeText}.`;
            }

            const systemPrompt = `Bạn là trợ lí thông minh RoomGuard. ` +
                                 `Tình trạng phòng hiện tại: ${contextStr} ` +
                                 `Trả lời ngắn gọn, thân thiện bằng tiếng Việt, không dùng markdown/dấu *.`;

            const finalPrompt = `${systemPrompt}\n\nTin nhắn người dùng: ${userText}`;

            const response = await fetch(GEMINI_URL, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: [{ parts: [{ text: finalPrompt }] }] })
            });
            const data = await response.json();

            if (!response.ok) {
                addMessageToUI(`Lỗi từ API: ${data.error?.message || response.statusText}`, "bot");
                return;
            }

            if (data.candidates && data.candidates.length > 0) {
                let botReply = data.candidates[0].content.parts[0].text.replace(/\*/g, "");
                addMessageToUI(botReply, "bot");
            } else {
                addMessageToUI("Xin lỗi, mình không thể trả lời lúc này.", "bot");
            }
        } catch (error) {
            addMessageToUI("Đã xảy ra lỗi kết nối với máy chủ AI.", "bot");
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

    if (chatSendBtn) chatSendBtn.addEventListener("click", handleChatSend);
    if (chatInput) chatInput.addEventListener("keypress", (e) => { if (e.key === "Enter") handleChatSend(); });

});