document.addEventListener("DOMContentLoaded", () => {
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
    const registerCode = document.getElementById("register-code");

    const loginError = document.getElementById("login-error");
    const registerError = document.getElementById("register-error");

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

    const createInviteBtn = document.getElementById("create-invite-btn");
    const inviteName = document.getElementById("invite-name");
    const inviteRole = document.getElementById("invite-role");
    const inviteCreateMessage = document.getElementById("invite-create-message");

    const dataRef = db.ref("roomguard/data");
    const historyRef = db.ref("roomguard/history");
    const commandRef = db.ref("roomguard/command");
    const ackRef = db.ref("roomguard/ack");
    const performanceRef = db.ref("roomguard/performance");

    let currentUser = null;
    let currentUserProfile = null;
    let isAdmin = false;
    let isRegistering = false;

    let currentRoomState = null;
    let allHistoryRecords = [];
    let usersListenerStarted = false;
    let inviteListenerStarted = false;

    let personalTempMax = 30;
    let mainStatChart = null;

    let performanceCommandSeq = Number(localStorage.getItem("roomguard_command_seq") || "0");
    let pendingCommands = {};
    let lastProcessedAckSeq = null;

    let latencySamples = [];
    let latencyClockOffsetMs = null;
    let latencyOffsetCalibrated = false;
    let latencyManualTarget = 0;
    let latencyManualRunning = false;

    let responseTimeSamples = [];
    let rttSamples = [];

    let receivedSeqSet = new Set();
    let minDataSeq = null;
    let maxDataSeq = null;
    let firstPacketReceiveAt = null;
    let totalReceivedBytes = 0;
    let lastLoggedDataSeq = null;

    const colorTemp = "#ef4444";
    const colorHum = "#06b6d4";
    const colorLux = "#eab308";

    const bgTemp = "rgba(239,68,68,0.15)";
    const bgHum = "rgba(6,182,212,0.15)";
    const bgLux = "rgba(234,179,8,0.15)";

    function safeText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    function setMessage(element, message, success = false) {
        if (!element) return;
        element.textContent = message || "";
        element.classList.toggle("success-msg", success);
    }

    function escapeHTML(text) {
        return String(text ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
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

    function getRoleLabel(role) {
        if (role === "admin") return "Admin";
        if (role === "customer" || role === "user") return "Khách hàng";
        return "Khách hàng";
    }

    function getRoleBadgeClass(role) {
        if (role === "admin") return "role-admin";
        return "role-customer";
    }

    function normalizeCode(code) {
        return String(code || "").trim().toUpperCase();
    }

    function generateInviteCode(role) {
        const prefix = role === "admin" ? "AD" : "KH";
        const number = Math.floor(10000 + Math.random() * 90000);
        return `${prefix}-${number}`;
    }

    async function generateUniqueInviteCode(role) {
        let code = generateInviteCode(role);
        let snap = await db.ref(`inviteCodes/${code}`).once("value");

        while (snap.exists()) {
            code = generateInviteCode(role);
            snap = await db.ref(`inviteCodes/${code}`).once("value");
        }

        return code;
    }

    function formatTime(timestamp) {
        if (!timestamp) return "--";
        return new Date(timestamp).toLocaleString("vi-VN");
    }

    function normalizeTimestampToMillis(value) {
        const timestamp = Number(value);

        if (!Number.isFinite(timestamp) || timestamp <= 0) {
            return null;
        }

        return timestamp < 1000000000000 ? timestamp * 1000 : timestamp;
    }

    function roundNumber(value, digits = 2) {
        if (!Number.isFinite(Number(value))) return null;
        return Number(Number(value).toFixed(digits));
    }

    function getAverage(values) {
        if (!values.length) return 0;
        return values.reduce((sum, value) => sum + Number(value), 0) / values.length;
    }

    function getStd(values) {
        if (values.length <= 1) return 0;

        const avg = getAverage(values);
        const variance = values.reduce((sum, value) => {
            return sum + Math.pow(Number(value) - avg, 2);
        }, 0) / (values.length - 1);

        return Math.sqrt(variance);
    }

    function pushLimitedSample(arr, value, limit = 200) {
        arr.push(Number(value));

        if (arr.length > limit) {
            arr.shift();
        }
    }

    function savePerformanceLog(type, payload) {
        return performanceRef.child(type).push({
            ...payload,
            createdAt: firebase.database.ServerValue.TIMESTAMP
        }).catch(error => {
            console.warn(`Không thể lưu performance/${type}:`, error);
        });
    }

    function updatePerformanceSummary(type, samples) {
        const summary = {
            count: samples.length,
            avgMs: roundNumber(getAverage(samples), 2),
            minMs: samples.length ? roundNumber(Math.min(...samples), 2) : 0,
            maxMs: samples.length ? roundNumber(Math.max(...samples), 2) : 0,
            jitterMs: roundNumber(getStd(samples), 2),
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        };

        performanceRef.child("summary").child(type).set(summary).catch(error => {
            console.warn(`Không thể cập nhật summary/${type}:`, error);
        });

        console.table({
            metric: type,
            count: summary.count,
            avgMs: summary.avgMs,
            minMs: summary.minMs,
            maxMs: summary.maxMs,
            jitterMs: summary.jitterMs
        });

        return summary;
    }

    function estimatePayloadBytes(data) {
        try {
            return new Blob([JSON.stringify(data)]).size;
        } catch (error) {
            return JSON.stringify(data).length;
        }
    }

    function nextCommandSeq() {
        performanceCommandSeq += 1;
        localStorage.setItem("roomguard_command_seq", String(performanceCommandSeq));
        return performanceCommandSeq;
    }

    function resetLatencyMeasurement() {
        latencySamples = [];
        latencyClockOffsetMs = null;
        latencyOffsetCalibrated = false;
        latencyManualTarget = 0;
        latencyManualRunning = false;

        console.clear();
        console.log("Đã reset đo Latency. Chạy RoomGuardTest.latency(20) để đo lại.");
    }

    function showLatencyResult() {
        if (!latencySamples.length) {
            console.log("Chưa có mẫu latency nào. Hãy chạy RoomGuardTest.latency(20) và đợi ESP32 gửi dữ liệu.");
            return null;
        }

        const summary = updatePerformanceSummary("latency", latencySamples);

        console.log("KẾT QUẢ LATENCY");
        console.log("Số mẫu:", summary.count);
        console.log("Latency trung bình:", summary.avgMs, "ms =", (summary.avgMs / 1000).toFixed(3), "s");
        console.log("Latency nhỏ nhất:", summary.minMs, "ms =", (summary.minMs / 1000).toFixed(3), "s");
        console.log("Latency lớn nhất:", summary.maxMs, "ms =", (summary.maxMs / 1000).toFixed(3), "s");
        console.log("Jitter:", summary.jitterMs, "ms");
        console.log("Clock offset ESP32 - Web:", latencyClockOffsetMs, "ms");

        return summary;
    }

    function recordLatency(data, webReceiveAt) {
        if (!latencyManualRunning) {
            return;
        }

        const espSentAt = normalizeTimestampToMillis(
            data.espSentAt ?? data.sentAt ?? data.timestampMs ?? data.updatedAt
        );

        if (!espSentAt) {
            return;
        }

        const rawLatencyMs = webReceiveAt - espSentAt;

        if (!latencyOffsetCalibrated) {
            latencyClockOffsetMs = espSentAt - webReceiveAt;
            latencyOffsetCalibrated = true;

            console.log("Đã hiệu chỉnh lệch đồng hồ ESP32 - Web:", latencyClockOffsetMs, "ms");
            console.log("Mẫu đầu tiên dùng để hiệu chỉnh nên chưa đưa vào bảng latency.");
            return;
        }

        const correctedEspSentAt = espSentAt - latencyClockOffsetMs;
        let latencyMs = webReceiveAt - correctedEspSentAt;

        if (latencyMs < 0 && latencyMs > -3000) {
            latencyMs = 0;
        }

        if (!Number.isFinite(latencyMs) || latencyMs < 0 || latencyMs > 10 * 60 * 1000) {
            console.warn("Bỏ qua latency vì timestamp vẫn bất thường:", {
                espSentAt,
                correctedEspSentAt,
                webReceiveAt,
                rawLatencyMs,
                latencyClockOffsetMs,
                latencyMs
            });
            return;
        }

        const seq = Number(data.seq ?? 0);

        pushLimitedSample(latencySamples, latencyMs);

        savePerformanceLog("latencyLogs", {
            seq: Number.isFinite(seq) ? seq : null,
            espSentAt,
            correctedEspSentAt,
            webReceiveAt,
            rawLatencyMs: roundNumber(rawLatencyMs, 2),
            clockOffsetMs: roundNumber(latencyClockOffsetMs, 2),
            latencyMs: roundNumber(latencyMs, 2)
        });

        const resultRows = latencySamples.map((value, index) => ({
            lan_do: index + 1,
            latency_ms: roundNumber(value, 2),
            latency_s: roundNumber(value / 1000, 3)
        }));

        console.clear();
        console.log(`BẢNG ĐO LATENCY ĐÃ HIỆU CHỈNH (${latencySamples.length}/${latencyManualTarget})`);
        console.log("Clock offset ESP32 - Web:", latencyClockOffsetMs, "ms");
        console.table(resultRows);

        if (latencySamples.length >= latencyManualTarget) {
            latencyManualRunning = false;
            console.log("Đã đủ mẫu đo latency.");
            showLatencyResult();
        }
    }

    function recordIncomingPacket(data, webReceiveAt) {
        const seqRaw = data.seq ?? data.packetSeq ?? data.id;
        const seq = Number(seqRaw);

        if (!Number.isInteger(seq) || seq <= 0) {
            return;
        }

        if (lastLoggedDataSeq === seq) {
            return;
        }

        lastLoggedDataSeq = seq;

        if (!firstPacketReceiveAt) {
            firstPacketReceiveAt = webReceiveAt;
        }

        receivedSeqSet.add(seq);
        minDataSeq = minDataSeq === null ? seq : Math.min(minDataSeq, seq);
        maxDataSeq = maxDataSeq === null ? seq : Math.max(maxDataSeq, seq);

        const expectedPackets = maxDataSeq - minDataSeq + 1;
        const receivedPackets = receivedSeqSet.size;
        const lostPackets = Math.max(expectedPackets - receivedPackets, 0);

        const packetLossRate = expectedPackets > 0 ? (lostPackets / expectedPackets) * 100 : 0;
        const pdr = expectedPackets > 0 ? (receivedPackets / expectedPackets) * 100 : 0;
        const reliability = pdr;

        const payloadBytes = estimatePayloadBytes(data);
        totalReceivedBytes += payloadBytes;

        const elapsedSeconds = Math.max((webReceiveAt - firstPacketReceiveAt) / 1000, 1);
        const throughputPacketPerSecond = receivedPackets / elapsedSeconds;
        const throughputBytePerSecond = totalReceivedBytes / elapsedSeconds;

        const packetSummary = {
            minSeq: minDataSeq,
            maxSeq: maxDataSeq,
            expectedPackets,
            receivedPackets,
            lostPackets,
            packetLossRatePercent: roundNumber(packetLossRate, 2),
            pdrPercent: roundNumber(pdr, 2),
            reliabilityPercent: roundNumber(reliability, 2),
            throughputPacketPerSecond: roundNumber(throughputPacketPerSecond, 3),
            throughputBytePerSecond: roundNumber(throughputBytePerSecond, 2),
            lastSeq: seq,
            lastPayloadBytes: payloadBytes,
            webReceiveAt,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        };

        performanceRef.child("summary").child("packet").set(packetSummary).catch(error => {
            console.warn("Không thể cập nhật summary/packet:", error);
        });
    }

    function recordResponseTime(seq, mode, webSentAt, firebaseDoneAt) {
        const responseTimeMs = firebaseDoneAt - webSentAt;

        pushLimitedSample(responseTimeSamples, responseTimeMs);

        savePerformanceLog("responseTimeLogs", {
            seq,
            mode,
            webSentAt,
            firebaseDoneAt,
            responseTimeMs: roundNumber(responseTimeMs, 2)
        });

        updatePerformanceSummary("responseTime", responseTimeSamples);

        console.log(`Response Time seq ${seq}: ${roundNumber(responseTimeMs, 2)} ms`);
    }

    function recordRttFromAck(ack, webReceiveAt) {
        if (!ack) return;

        const seq = Number(ack.seq ?? ack.commandSeq ?? 0);

        if (!Number.isInteger(seq) || seq <= 0) {
            return;
        }

        if (lastProcessedAckSeq === seq) {
            return;
        }

        const pending = pendingCommands[seq] || null;
        const webSentAt = normalizeTimestampToMillis(ack.webSentAt) || pending?.webSentAt || null;

        if (!webSentAt) {
            return;
        }

        lastProcessedAckSeq = seq;

        const rttMs = webReceiveAt - webSentAt;

        if (!Number.isFinite(rttMs) || rttMs < 0 || rttMs > 10 * 60 * 1000) {
            return;
        }

        pushLimitedSample(rttSamples, rttMs);

        savePerformanceLog("rttLogs", {
            seq,
            mode: ack.mode ?? pending?.mode ?? null,
            status: ack.status ?? "done",
            webSentAt,
            espAckAt: normalizeTimestampToMillis(ack.espAckAt) || null,
            webReceiveAckAt: webReceiveAt,
            rttMs: roundNumber(rttMs, 2)
        });

        updatePerformanceSummary("rtt", rttSamples);

        delete pendingCommands[seq];

        console.log(`RTT seq ${seq}: ${roundNumber(rttMs, 2)} ms`);
    }

    window.RoomGuardTest = {
        latency(sampleCount = 20) {
            latencySamples = [];
            latencyClockOffsetMs = null;
            latencyOffsetCalibrated = false;
            latencyManualTarget = Number(sampleCount) || 20;
            latencyManualRunning = true;

            console.clear();
            console.log(`BẮT ĐẦU ĐO LATENCY ${latencyManualTarget} MẪU`);
            console.log("Mẫu đầu tiên sẽ dùng để hiệu chỉnh lệch đồng hồ ESP32 - Web.");
            console.log("Hãy chờ ESP32 gửi dữ liệu mới lên Firebase.");
        },

        latencyResult() {
            return showLatencyResult();
        },

        resetLatency() {
            resetLatencyMeasurement();
        },

        help() {
            console.log("RoomGuardTest.latency(20)      // đo latency 20 mẫu");
            console.log("RoomGuardTest.latencyResult()  // xem kết quả latency hiện tại");
            console.log("RoomGuardTest.resetLatency()   // reset đo latency");
        }
    };

    function switchAuthTab(tabName) {
        authTabs.forEach(tab => {
            tab.classList.toggle("active", tab.dataset.tab === tabName);
        });

        authForms.forEach(form => {
            form.classList.toggle("active", form.id === `${tabName}-form`);
        });

        setMessage(loginError, "");
        setMessage(registerError, "");
    }

    function showLogin() {
        if (appLayout) appLayout.classList.remove("active");
        if (loginScreen) loginScreen.classList.add("active");
        switchAuthTab("login");
    }

    function showApp(profile) {
        if (loginScreen) loginScreen.classList.remove("active");
        if (appLayout) appLayout.classList.add("active");

        currentUserProfile = profile;
        isAdmin = profile.role === "admin";

        document.querySelectorAll(".admin-only").forEach(item => {
            item.style.display = isAdmin ? "flex" : "none";
        });

        safeText("sidebar-user-name", profile.name || "Người dùng");
        safeText("setting-user-email", profile.email || "--");
        safeText("setting-user-role", getRoleLabel(profile.role));
        safeText("setting-user-status", profile.status || "--");
        safeText("setting-user-code", profile.registerCode || "--");

        const modeHint = document.getElementById("mode-hint");
        const modeCard = document.getElementById("mode-card-container");

        if (modeHint) modeHint.textContent = "Nhấn đổi chế độ";
        if (modeCard) modeCard.classList.remove("disabled-card");

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

        if (activeLink && pageTitle) {
            pageTitle.textContent = activeLink.querySelector("span").textContent;
        }

        if (targetId === "history-page") {
            renderHistoryByDate(allHistoryRecords);
        }

        if (targetId === "accounts-page" && isAdmin) {
            listenAdminData();
        }
    }

    authTabs.forEach(tab => {
        tab.addEventListener("click", () => {
            switchAuthTab(tab.dataset.tab);
        });
    });

    if (loginForm) {
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
    }

    if (registerForm) {
        registerForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            setMessage(registerError, "");

            const name = registerName.value.trim();
            const email = registerEmail.value.trim();
            const password = registerPassword.value;
            const confirm = registerPasswordConfirm.value;
            const code = normalizeCode(registerCode.value);

            if (!name) {
                setMessage(registerError, "Vui lòng nhập họ tên.");
                return;
            }

            if (password !== confirm) {
                setMessage(registerError, "Mật khẩu nhập lại không khớp.");
                return;
            }

            if (!code) {
                setMessage(registerError, "Vui lòng nhập mã đăng ký do admin cấp.");
                return;
            }

            try {
                const codeSnap = await db.ref(`inviteCodes/${code}`).once("value");

                if (!codeSnap.exists()) {
                    setMessage(registerError, "Mã đăng ký không tồn tại.");
                    return;
                }

                const codeData = codeSnap.val();

                if (codeData.status !== "unused") {
                    setMessage(registerError, "Mã đăng ký này đã được sử dụng hoặc đã bị khóa.");
                    return;
                }

                isRegistering = true;

                const credential = await auth.createUserWithEmailAndPassword(email, password);
                const uid = credential.user.uid;

                const userProfile = {
                    name: name,
                    email: email,
                    role: codeData.role || "customer",
                    status: "approved",
                    registerCode: code,
                    registerCodeName: codeData.name || "",
                    createdAt: Date.now(),
                    approvedAt: Date.now(),
                    approvedBy: codeData.createdBy || null
                };

                await db.ref(`users/${uid}`).set(userProfile);

                await db.ref(`inviteCodes/${code}`).update({
                    status: "used",
                    usedBy: uid,
                    usedByName: name,
                    usedByEmail: email,
                    usedAt: Date.now()
                });

                isRegistering = false;

                registerForm.reset();
                setMessage(registerError, "Đăng ký thành công. Đang chuyển vào hệ thống...", true);

                showApp(userProfile);
                loadPersonalTemperatureThreshold(uid);
            } catch (error) {
                isRegistering = false;
                setMessage(registerError, getFriendlyAuthError(error));
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            auth.signOut();
        });
    }

    auth.onAuthStateChanged(async (user) => {
        currentUser = user;

        if (!user) {
            currentUserProfile = null;
            isAdmin = false;
            showLogin();
            return;
        }

        if (isRegistering) {
            return;
        }

        try {
            const uid = user.uid;
            const snap = await db.ref(`users/${uid}`).once("value");
            const profile = snap.val();

            if (!profile) {
                await auth.signOut();
                setMessage(loginError, "Tài khoản chưa được cấp quyền bằng mã đăng ký.");
                return;
            }

            if (profile.status !== "approved") {
                await auth.signOut();
                setMessage(loginError, "Tài khoản chưa được kích hoạt hoặc đã bị khóa.");
                return;
            }

            showApp(profile);
            loadPersonalTemperatureThreshold(uid);
        } catch (error) {
            await auth.signOut();
            setMessage(loginError, "Không thể tải thông tin tài khoản.");
        }
    });

    navLinks.forEach(link => {
        link.addEventListener("click", () => {
            const targetId = link.dataset.target;

            if (targetId === "accounts-page" && !isAdmin) {
                return;
            }

            goToPage(targetId);

            if (window.innerWidth <= 768 && sidebar) {
                sidebar.classList.remove("show");
            }
        });
    });

    if (openSidebarBtn) {
        openSidebarBtn.addEventListener("click", () => sidebar.classList.add("show"));
    }

    if (closeSidebarBtn) {
        closeSidebarBtn.addEventListener("click", () => sidebar.classList.remove("show"));
    }

    function updateClock() {
        const clock = document.getElementById("clock");
        if (!clock) return;

        const now = new Date();
        clock.textContent = now.toLocaleTimeString("vi-VN", {
            hour12: false
        });
    }

    setInterval(updateClock, 1000);
    updateClock();

    const savedTheme = localStorage.getItem("roomguard_theme") || "dark";
    document.documentElement.setAttribute("data-theme", savedTheme);

    if (settingDarkModeSwitch) {
        settingDarkModeSwitch.checked = savedTheme === "dark";
    }

    updateThemeIcon(savedTheme);

    function updateThemeIcon(theme) {
        if (!themeToggleBtn) return;

        themeToggleBtn.innerHTML = theme === "dark"
            ? "<i class='bx bx-sun'></i>"
            : "<i class='bx bx-moon'></i>";
    }

    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute("data-theme");
        const newTheme = currentTheme === "dark" ? "light" : "dark";

        document.documentElement.setAttribute("data-theme", newTheme);
        localStorage.setItem("roomguard_theme", newTheme);

        if (settingDarkModeSwitch) {
            settingDarkModeSwitch.checked = newTheme === "dark";
        }

        updateThemeIcon(newTheme);
    }

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener("click", toggleTheme);
    }

    if (settingDarkModeSwitch) {
        settingDarkModeSwitch.addEventListener("change", toggleTheme);
    }

    db.ref(".info/connected").on("value", (snapshot) => {
        if (!connStatus) return;

        if (snapshot.val() === true) {
            connStatus.innerHTML = `<span class="dot pulse"></span><span>Online</span>`;
        } else {
            connStatus.innerHTML = `<span class="dot offline"></span><span>Offline</span>`;
        }
    });

    if (window.Chart) {
        Chart.defaults.color = "#94a3b8";
        Chart.defaults.font.family = "'Outfit', sans-serif";
    }

    function createSmallChart(canvasId, color, background) {
        const canvas = document.getElementById(canvasId);

        if (!canvas || !window.Chart) {
            return null;
        }

        return new Chart(canvas.getContext("2d"), {
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

    function updateSmallChart(chart, labels, data) {
        if (!chart) return;

        chart.data.labels = labels;
        chart.data.datasets[0].data = data;
        chart.update();
    }

    function updateMainChart(type, labels, tempData, humData, luxData, title) {
        const canvas = document.getElementById("mainChart");

        if (!canvas || !window.Chart) {
            return;
        }

        if (mainStatChart) {
            mainStatChart.destroy();
        }

        const isLine = type === "line";

        mainStatChart = new Chart(canvas.getContext("2d"), {
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

    function getWarningDetails(temp, hum, lux, mode) {
        const warnings = [];

        const tempValue = Number(temp);
        const humValue = Number(hum);
        const luxValue = Number(lux);
        const tempMax = Number(personalTempMax || 30);

        if (tempValue > tempMax) {
            warnings.push(`Nhiệt độ cao: ${tempValue.toFixed(1)}°C > ${tempMax}°C`);
        }

        if (humValue < 35) {
            warnings.push(`Độ ẩm thấp: ${humValue.toFixed(0)}% < 35%`);
        } else if (humValue > 65) {
            warnings.push(`Độ ẩm cao: ${humValue.toFixed(0)}% > 65%`);
        }

        if (mode === "hoc_tap") {
            if (luxValue < 300) {
                warnings.push(`Ánh sáng thấp: ${luxValue.toFixed(0)} Lux < 300 Lux`);
            } else if (luxValue > 900) {
                warnings.push(`Ánh sáng cao: ${luxValue.toFixed(0)} Lux > 900 Lux`);
            }
        } else {
            if (luxValue < 100) {
                warnings.push(`Ánh sáng thấp: ${luxValue.toFixed(0)} Lux < 100 Lux`);
            } else if (luxValue > 250) {
                warnings.push(`Ánh sáng cao: ${luxValue.toFixed(0)} Lux > 250 Lux`);
            }
        }

        return warnings;
    }

    function checkWarningStatus(temp, hum, lux, mode) {
        return getWarningDetails(temp, hum, lux, mode).length > 0;
    }

    function refreshDashboardWarningByPersonalTemp() {
        if (!currentRoomState) return;

        const temp = Number(currentRoomState.temperature ?? 0);
        const hum = Number(currentRoomState.humidity ?? 0);
        const lux = Number(currentRoomState.light ?? 0);
        const mode = currentRoomState.mode ?? "nghi_ngoi";

        const warnings = getWarningDetails(temp, hum, lux, mode);
        const statusEl = document.getElementById("global-status");

        if (!statusEl) return;

        if (warnings.length > 0) {
            statusEl.className = "status-banner danger";
            statusEl.innerHTML = `
                <i class="bx bx-error"></i>
                <span>
                    <strong>CẢNH BÁO:</strong> ${warnings.join(" | ")}
                </span>
            `;
        } else {
            statusEl.className = "status-banner good";
            statusEl.innerHTML = `
                <i class="bx bx-check-shield"></i>
                <span>THÔNG SỐ PHÙ HỢP VỚI NGƯỠNG CÁ NHÂN</span>
            `;
        }
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

                let dateObj;

                if (updatedAt > 1000000000000) {
                    dateObj = new Date(updatedAt);
                } else if (updatedAt > 100000) {
                    dateObj = new Date(updatedAt * 1000);
                } else {
                    dateObj = new Date();
                }

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
            .sort((a, b) => b.dateObj - a.dateObj);
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

        const avgTemp = document.getElementById("stat-avg-temp");
        const avgHum = document.getElementById("stat-avg-hum");
        const avgLux = document.getElementById("stat-avg-lux");
        const statCount = document.getElementById("stat-count");

        if (count === 0) {
            if (avgTemp) avgTemp.textContent = "-- °C";
            if (avgHum) avgHum.textContent = "-- %";
            if (avgLux) avgLux.textContent = "-- Lux";
            if (statCount) statCount.textContent = "0";
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

        if (avgTemp) avgTemp.textContent = `${(sumTemp / count).toFixed(1)} °C`;
        if (avgHum) avgHum.textContent = `${(sumHum / count).toFixed(0)} %`;
        if (avgLux) avgLux.textContent = `${(sumLux / count).toFixed(0)} Lux`;
        if (statCount) statCount.textContent = count;
    }

    function renderOverviewCharts(records) {
        const chartRecords = records.slice(0, 20).reverse();
        const labels = chartRecords.map(record => record.time);

        updateSmallChart(tempChart, labels, chartRecords.map(record => record.temperature));
        updateSmallChart(humChart, labels, chartRecords.map(record => record.humidity));
        updateSmallChart(luxChart, labels, chartRecords.map(record => record.light));
    }

    let currentStatMode = "realtime";

    const statButtons = document.querySelectorAll(".chart-actions button");
    const datePickersContainer = document.getElementById("date-pickers");
    const dateInput = document.getElementById("stat-date");
    const monthInput = document.getElementById("stat-month");

    const now = new Date();

    if (dateInput) {
        dateInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    }

    if (monthInput) {
        monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    }

    if (datePickersContainer) {
        datePickersContainer.style.display = "none";
    }

    if (monthInput) {
        monthInput.style.display = "none";
    }

    statButtons.forEach(button => {
        button.addEventListener("click", () => {
            statButtons.forEach(btn => btn.classList.remove("active"));
            button.classList.add("active");

            currentStatMode = button.dataset.mode;

            if (currentStatMode === "realtime") {
                if (datePickersContainer) datePickersContainer.style.display = "none";
            } else if (currentStatMode === "daily") {
                if (datePickersContainer) datePickersContainer.style.display = "flex";
                if (dateInput) dateInput.style.display = "block";
                if (monthInput) monthInput.style.display = "none";
            } else if (currentStatMode === "monthly") {
                if (datePickersContainer) datePickersContainer.style.display = "flex";
                if (dateInput) dateInput.style.display = "none";
                if (monthInput) monthInput.style.display = "block";
            }

            renderCurrentStatistic();
        });
    });

    if (dateInput) {
        dateInput.addEventListener("change", renderCurrentStatistic);
    }

    if (monthInput) {
        monthInput.addEventListener("change", renderCurrentStatistic);
    }

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

        if (currentStatMode === "daily" && dateInput) {
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

        if (currentStatMode === "monthly" && monthInput) {
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

    const historyContainer = document.getElementById("history-accordion-container");
    const filterDate = document.getElementById("history-date-filter");
    const filterStatus = document.getElementById("history-status-filter");
    const modeTabs = document.querySelectorAll("#history-mode-filter .btn-tab");

    let activeHistoryMode = "all";

    if (filterDate) {
        filterDate.addEventListener("change", () => renderHistoryByDate(allHistoryRecords));
    }

    if (filterStatus) {
        filterStatus.addEventListener("change", () => renderHistoryByDate(allHistoryRecords));
    }

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

        if (filterDate && filterDate.value) {
            filtered = filterRecordsByDate(filtered, filterDate.value);
        }

        if (filterStatus && filterStatus.value === "normal") {
            filtered = filtered.filter(record => !record.isWarning);
        }

        if (filterStatus && filterStatus.value === "warning") {
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

    dataRef.on("value", snapshot => {
        const webReceiveAt = Date.now();
        const data = snapshot.val();

        if (!data) return;

        currentRoomState = data;

        recordIncomingPacket(data, webReceiveAt);
        recordLatency(data, webReceiveAt);

        const temp = Number(data.temperature ?? 0);
        const hum = Number(data.humidity ?? 0);
        const lux = Number(data.light ?? 0);
        const mode = data.mode ?? "nghi_ngoi";

        safeText("val-temp", temp.toFixed(1));
        safeText("val-hum", hum.toFixed(0));
        safeText("val-lux", lux.toFixed(0));
        safeText("val-mode", mode === "hoc_tap" ? "HỌC TẬP" : "NGHỈ NGƠI");

        refreshDashboardWarningByPersonalTemp();
    });

    const modeCard = document.getElementById("mode-card-container");

    if (modeCard) {
        modeCard.addEventListener("click", async () => {
            const currentMode = document.getElementById("val-mode")?.textContent || "";
            const newMode = currentMode.trim() === "HỌC TẬP" ? "nghi_ngoi" : "hoc_tap";

            const seq = nextCommandSeq();
            const webSentAt = Date.now();

            pendingCommands[seq] = {
                seq,
                mode: newMode,
                webSentAt
            };

            try {
                await Promise.all([
                    dataRef.update({
                        mode: newMode,
                        lastWebCommandSeq: seq,
                        webSentAt: webSentAt
                    }),

                    commandRef.set({
                        seq: seq,
                        type: "change_mode",
                        mode: newMode,
                        webSentAt: webSentAt,
                        createdBy: currentUser?.uid || "web",
                        createdByEmail: currentUserProfile?.email || "",
                        status: "sent"
                    })
                ]);

                const firebaseDoneAt = Date.now();
                recordResponseTime(seq, newMode, webSentAt, firebaseDoneAt);
            } catch (error) {
                console.error("Không thể gửi lệnh đổi chế độ:", error);
            }
        });
    }

    ackRef.on("value", snapshot => {
        const ack = snapshot.val();

        if (!ack) return;

        recordRttFromAck(ack, Date.now());
    });

    historyRef.limitToLast(2000).on("value", snapshot => {
        allHistoryRecords = parseHistoryData(snapshot.val());

        renderOverviewCharts(allHistoryRecords);
        renderCurrentStatistic();
        renderHistoryByDate(allHistoryRecords);
    });

    async function loadPersonalTemperatureThreshold(uid) {
        if (!uid) return;

        const tempInput = document.getElementById("personal-temp-max");
        const msg = document.getElementById("personal-temp-message");

        try {
            const snap = await db.ref(`userSettings/${uid}/personalTempMax`).once("value");
            const savedTempMax = snap.val();

            if (savedTempMax !== null && savedTempMax !== undefined) {
                personalTempMax = Number(savedTempMax);
            } else {
                personalTempMax = 30;
                await db.ref(`userSettings/${uid}/personalTempMax`).set(personalTempMax);
            }

            if (tempInput) {
                tempInput.value = personalTempMax;
            }

            refreshDashboardWarningByPersonalTemp();

            if (msg) {
                msg.textContent = "";
                msg.className = "setting-message";
            }
        } catch (error) {
            console.error("Lỗi tải ngưỡng nhiệt độ cá nhân:", error);

            if (msg) {
                msg.textContent = "Không thể tải ngưỡng nhiệt độ cá nhân.";
                msg.className = "setting-message error";
            }
        }
    }

    const savePersonalTempBtn = document.getElementById("save-personal-temp-btn");

    if (savePersonalTempBtn) {
        savePersonalTempBtn.addEventListener("click", async () => {
            const tempInput = document.getElementById("personal-temp-max");
            const msg = document.getElementById("personal-temp-message");

            if (!currentUser) {
                if (msg) {
                    msg.textContent = "Bạn cần đăng nhập trước.";
                    msg.className = "setting-message error";
                }
                return;
            }

            const newTempMax = Number(tempInput.value);

            if (Number.isNaN(newTempMax) || newTempMax <= 0) {
                if (msg) {
                    msg.textContent = "Vui lòng nhập ngưỡng nhiệt độ hợp lệ.";
                    msg.className = "setting-message error";
                }
                return;
            }

            if (newTempMax < 10 || newTempMax > 60) {
                if (msg) {
                    msg.textContent = "Ngưỡng nhiệt độ nên nằm trong khoảng 10°C đến 60°C.";
                    msg.className = "setting-message error";
                }
                return;
            }

            try {
                personalTempMax = newTempMax;

                await db.ref(`userSettings/${currentUser.uid}/personalTempMax`).set(personalTempMax);

                refreshDashboardWarningByPersonalTemp();

                allHistoryRecords = allHistoryRecords.map(record => {
                    const isWarning = checkWarningStatus(record.temperature, record.humidity, record.light, record.mode);
                    return {
                        ...record,
                        isWarning,
                        statusClass: isWarning ? "alert" : "normal",
                        statusText: isWarning ? "Cảnh báo" : "Bình thường"
                    };
                });

                renderHistoryByDate(allHistoryRecords);

                if (msg) {
                    msg.textContent = "Đã lưu ngưỡng nhiệt độ cá nhân.";
                    msg.className = "setting-message success";
                }
            } catch (error) {
                console.error("Lỗi lưu ngưỡng nhiệt độ cá nhân:", error);

                if (msg) {
                    msg.textContent = "Không thể lưu ngưỡng nhiệt độ cá nhân.";
                    msg.className = "setting-message error";
                }
            }
        });
    }

    function listenAdminData() {
        if (!isAdmin) return;

        if (!usersListenerStarted) {
            usersListenerStarted = true;

            db.ref("users").on("value", snapshot => {
                const users = snapshot.val() || {};
                renderRegisteredUsers(users);
            });
        }

        if (!inviteListenerStarted) {
            inviteListenerStarted = true;

            db.ref("inviteCodes").on("value", snapshot => {
                const codes = snapshot.val() || {};
                renderInviteCodes(codes);
            });
        }
    }

    if (createInviteBtn) {
        createInviteBtn.addEventListener("click", async () => {
            if (!isAdmin) {
                return;
            }

            const name = inviteName.value.trim();
            const role = inviteRole.value;

            if (!name) {
                inviteCreateMessage.textContent = "Vui lòng nhập tên người nhận / username.";
                inviteCreateMessage.className = "invite-message error";
                return;
            }

            try {
                const code = await generateUniqueInviteCode(role);

                await db.ref(`inviteCodes/${code}`).set({
                    code: code,
                    name: name,
                    role: role,
                    status: "unused",
                    createdAt: Date.now(),
                    createdBy: currentUser.uid,
                    createdByEmail: currentUserProfile.email || "",
                    usedBy: null,
                    usedByName: null,
                    usedByEmail: null,
                    usedAt: null
                });

                inviteCreateMessage.innerHTML = `Đã tạo mã: <strong>${code}</strong>`;
                inviteCreateMessage.className = "invite-message success";

                inviteName.value = "";
                inviteRole.value = "customer";
            } catch (error) {
                inviteCreateMessage.textContent = "Không thể tạo mã đăng ký.";
                inviteCreateMessage.className = "invite-message error";
            }
        });
    }

    function renderInviteCodes(codes) {
        const unusedList = document.getElementById("unused-codes-list");
        const usedList = document.getElementById("used-codes-list");
        const unusedCount = document.getElementById("unused-code-count");
        const usedCount = document.getElementById("used-code-count");

        if (!unusedList || !usedList || !unusedCount || !usedCount) return;

        const codeArray = Object.values(codes).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        const unusedCodes = codeArray.filter(code => code.status === "unused");
        const usedCodes = codeArray.filter(code => code.status === "used");

        unusedCount.textContent = unusedCodes.length;
        usedCount.textContent = usedCodes.length;

        if (unusedCodes.length === 0) {
            unusedList.innerHTML = `
                <div class="empty-state small">
                    <p>Chưa có mã đăng ký nào.</p>
                </div>
            `;
        } else {
            unusedList.innerHTML = unusedCodes.map(code => `
                <div class="approval-user-card invite-card">
                    <div>
                        <h4>${escapeHTML(code.code)}</h4>
                        <p>${escapeHTML(code.name || "--")}</p>
                        <small>
                            Vai trò:
                            <span class="role-badge ${getRoleBadgeClass(code.role)}">
                                ${getRoleLabel(code.role)}
                            </span>
                        </small>
                        <small>Tạo lúc: ${formatTime(code.createdAt)}</small>
                    </div>

                    <div class="approval-actions">
                        <button class="btn btn-danger btn-small" data-delete-code="${escapeHTML(code.code)}">
                            Xóa
                        </button>
                    </div>
                </div>
            `).join("");

            unusedList.querySelectorAll("[data-delete-code]").forEach(button => {
                button.addEventListener("click", async () => {
                    const code = button.dataset.deleteCode;

                    if (confirm(`Xóa mã ${code}?`)) {
                        await db.ref(`inviteCodes/${code}`).remove();
                    }
                });
            });
        }

        if (usedCodes.length === 0) {
            usedList.innerHTML = `
                <div class="empty-state small">
                    <p>Chưa có mã nào được sử dụng.</p>
                </div>
            `;
        } else {
            usedList.innerHTML = usedCodes.map(code => `
                <div class="approval-user-card invite-card processed">
                    <div>
                        <h4>${escapeHTML(code.code)}</h4>
                        <p>${escapeHTML(code.name || "--")}</p>
                        <small>
                            Vai trò:
                            <span class="role-badge ${getRoleBadgeClass(code.role)}">
                                ${getRoleLabel(code.role)}
                            </span>
                        </small>
                        <small>Dùng bởi: ${escapeHTML(code.usedByName || "--")} - ${escapeHTML(code.usedByEmail || "--")}</small>
                        <small>Dùng lúc: ${formatTime(code.usedAt)}</small>
                    </div>

                    <span class="badge-status normal">used</span>
                </div>
            `).join("");
        }
    }

    function renderRegisteredUsers(users) {
        const container = document.getElementById("registered-users-list");
        const countEl = document.getElementById("registered-user-count");
        const notifCount = document.getElementById("notif-count");

        if (!container || !countEl) return;

        const userArray = Object.entries(users)
            .map(([uid, user]) => ({ uid, ...user }))
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        countEl.textContent = userArray.length;
        if (notifCount) notifCount.textContent = "0";

        if (userArray.length === 0) {
            container.innerHTML = `
                <div class="empty-state small">
                    <p>Chưa có tài khoản.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = userArray.map(user => `
            <div class="approval-user-card processed">
                <div>
                    <h4>${escapeHTML(user.name || "Người dùng")}</h4>
                    <p>${escapeHTML(user.email || "--")}</p>
                    <small>
                        Vai trò:
                        <span class="role-badge ${getRoleBadgeClass(user.role)}">
                            ${getRoleLabel(user.role)}
                        </span>
                    </small>
                    <small>Mã: ${escapeHTML(user.registerCode || "--")}</small>
                </div>

                <span class="badge-status ${user.status === "approved" ? "normal" : "alert"}">
                    ${escapeHTML(user.status || "--")}
                </span>
            </div>
        `).join("");
    }
});