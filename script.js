// ========== KONFIGURASI ==========
const DEFAULT_CONFIG = {
  schoolName: "SMA Negeri 4 Madiun",
  schoolLat: -7.647355,
  schoolLng: 111.525287,
  radiusMeter: 150,
  // Isi dengan URL Web App Google Apps Script yang berakhiran /exec.
  scriptUrl: ""
};

let config = { ...DEFAULT_CONFIG };
let currentPosition = null;
let isInsideSchool = false;
let html5QrCode = null;
let isScanning = false;
let isProcessing = false;

document.addEventListener("DOMContentLoaded", () => {
  loadConfig();
  applyConfig();
  requestLocation();

  const fileInput = document.getElementById("qrFileInput");
  if (fileInput) fileInput.addEventListener("change", handleFileSelect);

  const dropZone = document.getElementById("dropZone");
  if (dropZone) {
    dropZone.addEventListener("dragover", (event) => {
      event.preventDefault();
      dropZone.classList.add("border-blue-500");
    });
    dropZone.addEventListener("dragleave", () => {
      dropZone.classList.remove("border-blue-500");
    });
    dropZone.addEventListener("drop", (event) => {
      event.preventDefault();
      dropZone.classList.remove("border-blue-500");
      if (event.dataTransfer.files.length) {
        processImageFile(event.dataTransfer.files[0]);
      }
    });
  }
});

// ========== PENGATURAN ==========
function loadConfig() {
  try {
    const saved = localStorage.getItem("absensi_config");
    if (saved) config = { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
  } catch (error) {
    console.warn("Gagal memuat konfigurasi:", error);
  }
}

function saveConfig() {
  const lat = Number(document.getElementById("cfgLat").value);
  const lng = Number(document.getElementById("cfgLng").value);
  const radius = Number(document.getElementById("cfgRadius").value);
  const scriptUrl = document.getElementById("cfgScriptUrl").value.trim();

  if (!Number.isFinite(lat) || !Number.isFinite(lng) ||
      lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    showToast("Koordinat sekolah tidak valid.", "error");
    return;
  }
  if (!Number.isFinite(radius) || radius < 1) {
    showToast("Radius harus berupa angka lebih dari 0.", "error");
    return;
  }
  if (scriptUrl && (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(scriptUrl))) {
    showToast("URL Apps Script harus berupa URL Web App yang berakhiran /exec.", "error");
    return;
  }

  config.schoolName = document.getElementById("cfgSchoolName").value.trim() || DEFAULT_CONFIG.schoolName;
  config.schoolLat = lat;
  config.schoolLng = lng;
  config.radiusMeter = radius;
  config.scriptUrl = scriptUrl;

  localStorage.setItem("absensi_config", JSON.stringify(config));
  applyConfig();
  toggleConfig();
  if (currentPosition) checkSchoolLocation(currentPosition.coords);
  showToast("Pengaturan berhasil disimpan.");
}

function applyConfig() {
  const setValue = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.value = value;
  };
  const schoolName = document.getElementById("schoolName");
  if (schoolName) schoolName.textContent = config.schoolName;
  setValue("cfgSchoolName", config.schoolName);
  setValue("cfgLat", config.schoolLat);
  setValue("cfgLng", config.schoolLng);
  setValue("cfgRadius", config.radiusMeter);
  setValue("cfgScriptUrl", config.scriptUrl);
}

const CONFIG_PASSWORD = "smapajaya4";

function toggleConfig() {
  const modal = document.getElementById("configModal");
  if (!modal) return;

  if (modal.classList.contains("hidden")) {
    const password = window.prompt("Masukkan kata sandi guru untuk membuka Pengaturan:");
    if (password === null) return;
    if (password !== CONFIG_PASSWORD) {
      showToast("Kata sandi salah.", "error");
      return;
    }
    modal.classList.remove("hidden");
  } else {
    modal.classList.add("hidden");
  }
}

function toggleQrModal() {
  const modal = document.getElementById("qrGeneratorModal");
  if (modal) modal.classList.toggle("hidden");
  else showToast("Modal QR tidak ditemukan.", "error");
}

function getCurrentLocationAsSchool() {
  if (!currentPosition) {
    showToast("Lokasi belum tersedia. Izinkan akses lokasi terlebih dahulu.", "error");
    return;
  }
  document.getElementById("cfgLat").value = currentPosition.coords.latitude.toFixed(6);
  document.getElementById("cfgLng").value = currentPosition.coords.longitude.toFixed(6);
  showToast("Koordinat terisi. Tekan Simpan Pengaturan.");
}

// ========== GPS ==========
function requestLocation() {
  if (!navigator.geolocation) {
    updateGpsUI("error", "GPS tidak didukung", "Browser tidak mendukung geolocation.");
    return;
  }

  updateGpsUI("loading", "Mengecek lokasi...", "Mohon izinkan akses lokasi.");
  navigator.geolocation.watchPosition(
    (position) => {
      currentPosition = position;
      checkSchoolLocation(position.coords);
    },
    (error) => {
      const messages = {
        1: "Akses lokasi ditolak. Izinkan lokasi di browser.",
        2: "Lokasi tidak tersedia.",
        3: "Waktu mendapatkan lokasi habis. Coba lagi."
      };
      isInsideSchool = false;
      updateGpsUI("error", "Lokasi gagal", messages[error.code] || "Gagal mendapatkan lokasi.");
      updateScannerVisibility();
    },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 }
  );
}

function checkSchoolLocation(coords) {
  if (!coords || !Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) {
    isInsideSchool = false;
    updateGpsUI("error", "Lokasi tidak valid", "Koordinat GPS tidak terbaca.");
    updateScannerVisibility();
    return;
  }

  const distance = haversineDistance(
    coords.latitude, coords.longitude, config.schoolLat, config.schoolLng
  );
  const accuracy = Number(coords.accuracy) || 0;
  isInsideSchool = distance <= config.radiusMeter;

  const distanceText = distance < 1000
    ? Math.round(distance) + " meter dari sekolah"
    : (distance / 1000).toFixed(2) + " km dari sekolah";

  if (isInsideSchool) {
    updateGpsUI("success", "Lokasi Valid", distanceText);
    const accuracyEl = document.getElementById("gpsAccuracy");
    accuracyEl.textContent = "Akurasi GPS: ±" + Math.round(accuracy) + " m";
    accuracyEl.classList.remove("hidden");
  } else {
    updateGpsUI("error", "Di Luar Sekolah", distanceText);
    document.getElementById("distanceInfo").textContent =
      "Jarak: " + distanceText + " (maks. " + config.radiusMeter + " m)";
    document.getElementById("gpsAccuracy").classList.add("hidden");
  }
  updateScannerVisibility();
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const earthRadius = 6371000;
  const toRad = (degrees) => degrees * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function updateGpsUI(status, title, detail) {
  const icon = document.getElementById("gpsIcon");
  const badge = document.getElementById("gpsBadge");
  const card = document.getElementById("gpsCard");

  document.getElementById("gpsTitle").textContent = title;
  document.getElementById("gpsDetail").textContent = detail;
  card.classList.remove("glow-green", "glow-red");
  badge.classList.add("hidden");

  if (status === "success") {
    icon.innerHTML = '<i class="fas fa-location-dot text-xl text-green-400"></i>';
    icon.className = "w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center";
    badge.textContent = "OK";
    badge.className = "px-2.5 py-1 rounded-full text-xs font-bold bg-green-500/20 text-green-400";
    card.classList.add("glow-green");
  } else if (status === "error") {
    icon.innerHTML = '<i class="fas fa-location-dot text-xl text-red-400"></i>';
    icon.className = "w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center";
    badge.textContent = "GAGAL";
    badge.className = "px-2.5 py-1 rounded-full text-xs font-bold bg-red-500/20 text-red-400";
    card.classList.add("glow-red");
  } else {
    icon.innerHTML = '<i class="fas fa-spinner fa-spin text-xl text-blue-400"></i>';
    icon.className = "w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center";
  }
}

function updateScannerVisibility() {
  const warning = document.getElementById("outOfSchoolWarning");
  const scanner = document.getElementById("scannerSection");
  const resultCard = document.getElementById("resultCard");

  if (isInsideSchool) {
    warning.classList.add("hidden");
    if (resultCard.classList.contains("hidden")) {
      scanner.classList.remove("hidden");
      const cameraTab = document.getElementById("tabCamera");
      if (cameraTab && cameraTab.classList.contains("tab-active") && !isScanning) {
        startCameraScanner();
      }
    }
  } else {
    warning.classList.remove("hidden");
    scanner.classList.add("hidden");
    stopCameraScanner();
  }
}

// ========== PEMILIHAN TAB ==========
function switchTab(tab) {
  const tabs = {
    camera: document.getElementById("tabCamera"),
    upload: document.getElementById("tabUpload"),
    generator: document.getElementById("tabGenerator")
  };
  const panels = {
    camera: document.getElementById("cameraPanel"),
    upload: document.getElementById("uploadPanel"),
    generator: document.getElementById("generatorPanel")
  };

  Object.entries(tabs).forEach(([name, button]) => {
    if (!button) return;
    button.classList.toggle("tab-active", name === tab);
    button.classList.toggle("text-slate-400", name !== tab);
  });
  Object.entries(panels).forEach(([name, panel]) => {
    if (panel) panel.classList.toggle("hidden", name !== tab);
  });

  if (tab === "camera" && isInsideSchool) startCameraScanner();
  else stopCameraScanner();
}

// ========== SCANNER ==========
async function startCameraScanner() {
  if (isScanning || !isInsideSchool) return;
  const reader = document.getElementById("reader");
  if (!reader || typeof Html5Qrcode === "undefined") {
    showToast("Library pemindai QR belum termuat. Muat ulang halaman.", "error");
    return;
  }

  reader.innerHTML = "";
  try {
    html5QrCode = new Html5Qrcode("reader");
    await html5QrCode.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1 },
      onScanSuccess,
      () => {}
    );
    isScanning = true;
  } catch (error) {
    reader.innerHTML = '<div class="p-6 text-center text-slate-400"><i class="fas fa-camera-slash text-3xl mb-2"></i><p class="text-sm">Kamera tidak tersedia atau izin ditolak.</p><p class="text-xs mt-1">Gunakan tab Upload QR.</p></div>';
  }
}

async function stopCameraScanner() {
  if (html5QrCode && isScanning) {
    try {
      await html5QrCode.stop();
      await html5QrCode.clear();
    } catch (error) {
      console.warn("Gagal menghentikan kamera:", error);
    }
    isScanning = false;
  }
}

function handleFileSelect(event) {
  if (event.target.files && event.target.files.length) {
    processImageFile(event.target.files[0]);
  }
}

async function processImageFile(file) {
  if (!isInsideSchool) {
    showToast("Absensi hanya dapat dilakukan di area sekolah.", "error");
    return;
  }
  if (!file || !file.type.startsWith("image/")) {
    showToast("Pilih file gambar yang valid.", "error");
    return;
  }

  const preview = document.getElementById("uploadPreview");
  const previewImg = document.getElementById("previewImg");
  const uploadStatus = document.getElementById("uploadStatus");
  preview.classList.remove("hidden");
  uploadStatus.textContent = "Memindai QR Code...";
  uploadStatus.className = "text-center text-sm mt-3 text-blue-400";

  const reader = new FileReader();
  reader.onload = (event) => { previewImg.src = event.target.result; };
  reader.readAsDataURL(file);

  let scanner;
  try {
    scanner = new Html5Qrcode("fileReaderTemp");
    const decodedText = await scanner.scanFile(file, true);
    await scanner.clear();
    uploadStatus.textContent = "QR Code ditemukan.";
    uploadStatus.className = "text-center text-sm mt-3 text-green-400";
    await onScanSuccess(decodedText);
  } catch (error) {
    if (scanner) {
      try { await scanner.clear(); } catch (ignored) {}
    }
    uploadStatus.textContent = "QR Code tidak ditemukan pada gambar ini.";
    uploadStatus.className = "text-center text-sm mt-3 text-red-400";
    showToast("Gagal membaca QR dari gambar.", "error");
  }
}

// ========== KIRIM ABSENSI ==========
async function onScanSuccess(decodedText) {
  if (isProcessing) return;
  if (!isInsideSchool || !currentPosition) {
    showToast("Lokasi belum valid. Perbarui GPS sebelum absen.", "error");
    return;
  }
  if (!config.scriptUrl) {
    showResult(false, "Pengaturan Belum Lengkap",
      "URL Web App Google Apps Script belum diisi. Buka Pengaturan guru dan masukkan URL yang berakhiran /exec.",
      [{ label: "Data QR", value: decodedText }]);
    return;
  }

  isProcessing = true;
  await stopCameraScanner();
  showToast("Mengirim absensi...", "info");

  const payload = {
    qrData: String(decodedText).trim(),
    timestamp: new Date().toLocaleString("id-ID", {
      dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Jakarta"
    }),
    latitude: currentPosition.coords.latitude,
    longitude: currentPosition.coords.longitude,
    schoolName: config.schoolName
  };

  try {
    // Apps Script tidak menyediakan CORS untuk dibaca langsung browser.
    // no-cors menghindari preflight; responsnya opaque sehingga tidak
    // boleh dianggap sebagai bukti bahwa baris sudah masuk ke Sheets.
    await fetch(config.scriptUrl, {
      method: "POST",
      mode: "no-cors",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      cache: "no-store"
    });

    showResult(true, "Permintaan Absensi Dikirim",
      "Data sudah dikirim ke Web App. Pastikan baris baru muncul di Google Sheets untuk memastikan absensi tersimpan.",
      [
        { label: "Data QR", value: payload.qrData },
        { label: "Waktu", value: payload.timestamp },
        { label: "Sekolah", value: payload.schoolName },
        { label: "Lokasi", value: payload.latitude.toFixed(6) + ", " + payload.longitude.toFixed(6) }
      ]);
  } catch (error) {
    showResult(false, "Gagal Mengirim Absensi",
      "Browser gagal mengirim data. Periksa koneksi internet dan URL Web App, lalu coba lagi.",
      [{ label: "Error", value: error.message || "Network error" }]);
  } finally {
    isProcessing = false;
  }
}

// ========== HASIL ==========
function showResult(success, title, message, details = []) {
  document.getElementById("scannerSection").classList.add("hidden");
  const card = document.getElementById("resultCard");
  const icon = document.getElementById("resultIcon");
  const titleEl = document.getElementById("resultTitle");
  const messageEl = document.getElementById("resultMessage");
  const detailsEl = document.getElementById("resultDetails");

  card.classList.remove("hidden", "glow-green", "glow-red");
  if (success) {
    card.classList.add("glow-green");
    icon.className = "w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-3 bg-green-500/20 text-green-400 text-2xl";
    icon.innerHTML = '<i class="fas fa-check"></i>';
    titleEl.className = "font-bold text-lg text-green-400";
  } else {
    card.classList.add("glow-red");
    icon.className = "w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-3 bg-red-500/20 text-red-400 text-2xl";
    icon.innerHTML = '<i class="fas fa-xmark"></i>';
    titleEl.className = "font-bold text-lg text-red-400";
  }
  titleEl.textContent = title;
  messageEl.textContent = message;
  detailsEl.replaceChildren();

  details.forEach((item) => {
    const row = document.createElement("div");
    row.className = "flex justify-between gap-2 border-b border-slate-800 pb-1.5 last:border-0 last:pb-0";
    const label = document.createElement("span");
    label.className = "text-slate-400";
    label.textContent = item.label;
    const value = document.createElement("span");
    value.className = "font-semibold text-right break-all";
    value.textContent = item.value;
    row.append(label, value);
    detailsEl.appendChild(row);
  });
}

function resetScanner() {
  document.getElementById("resultCard").classList.add("hidden");
  document.getElementById("uploadPreview").classList.add("hidden");
  document.getElementById("qrFileInput").value = "";
  updateScannerVisibility();
}

function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.className = "fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg transition-all duration-300";
  toast.classList.add(type === "error" ? "bg-red-600" : type === "info" ? "bg-blue-600" : "bg-emerald-600", "text-white");
  toast.classList.remove("hidden");
  clearTimeout(window.toastTimeout);
  window.toastTimeout = setTimeout(() => toast.classList.add("hidden"), 3000);
}

// ========== QR GENERATOR ==========
function makeQr(payload, container, labelElement) {
  container.innerHTML = "";
  if (typeof QRCode === "undefined") {
    showToast("Library QR belum termuat. Periksa koneksi internet.", "error");
    return false;
  }
  new QRCode(container, {
    text: payload, width: 220, height: 220,
    colorDark: "#0f172a", colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H
  });
  labelElement.textContent = payload;
  return true;
}

function generateQrCode() {
  const nisn = document.getElementById("genNisn").value.trim();
  const name = document.getElementById("genNama").value.trim();
  if (!nisn && !name) {
    showToast("Isi minimal NISN atau Nama.", "error");
    return;
  }
  const payload = nisn && name ? nisn + "|" + name : (nisn || name);
  if (makeQr(payload, document.getElementById("qrcodeCanvas"), document.getElementById("qrLabelPreview"))) {
    document.getElementById("qrResultContainer").classList.remove("hidden");
    showToast("QR Code berhasil dibuat.");
  }
}

function generateQrFromTab() {
  const nisn = document.getElementById("inlineNisn").value.trim();
  const name = document.getElementById("inlineNama").value.trim();
  if (!nisn && !name) {
    showToast("Isi minimal NISN atau Nama.", "error");
    return;
  }
  const payload = nisn && name ? nisn + "|" + name : (nisn || name);
  if (makeQr(payload, document.getElementById("inlineQrBox"), document.getElementById("inlineQrLabel"))) {
    document.getElementById("inlineQrResult").classList.remove("hidden");
    showToast("QR Code berhasil dibuat.");
  }
}

function downloadQr(containerId, fileBase) {
  const container = document.getElementById(containerId);
  const canvas = container.querySelector("canvas");
  const img = container.querySelector("img");
  let dataUrl = "";
  if (canvas) dataUrl = canvas.toDataURL("image/png");
  else if (img && img.src) dataUrl = img.src;
  else {
    showToast("Buat QR Code terlebih dahulu.", "error");
    return;
  }

  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = fileBase + ".png";
  document.body.appendChild(link);
  link.click();
  link.remove();
  showToast("QR Code berhasil diunduh.");
}

function downloadQrCode() {
  const value = document.getElementById("genNisn").value.trim() ||
    document.getElementById("genNama").value.trim() || "absensi";
  downloadQr("qrcodeCanvas", "QR_" + value.replace(/[^a-zA-Z0-9_-]/g, "_"));
}

function downloadQrFromTab() {
  const value = document.getElementById("inlineNisn").value.trim() ||
    document.getElementById("inlineNama").value.trim() || "absensi";
  downloadQr("inlineQrBox", "QR_" + value.replace(/[^a-zA-Z0-9_-]/g, "_"));
}

window.toggleConfig = toggleConfig;
window.toggleQrModal = toggleQrModal;
window.switchTab = switchTab;
window.generateQrCode = generateQrCode;
window.downloadQrCode = downloadQrCode;
window.generateQrFromTab = generateQrFromTab;
window.downloadQrFromTab = downloadQrFromTab;
window.saveConfig = saveConfig;
window.getCurrentLocationAsSchool = getCurrentLocationAsSchool;
window.resetScanner = resetScanner;
