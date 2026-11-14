





// ========== KONFIGURASI ==========
// Koordinat SMA Negeri 4 Madiun (Jl. Serayu No. 80, Pandean, Kec. Taman, Kota Madiun)
const DEFAULT_CONFIG = {
  schoolName: "SMA Negeri 4 Madiun",
  schoolLat: -7.647355,      // Latitude SMA Negeri 4 Madiun
  schoolLng: 111.525287,     // Longitude SMA Negeri 4 Madiun
  radiusMeter: 150,          // Radius dalam meter
  scriptUrl: ""              // Tempel URL Google Apps Script (/exec) di sini jika ingin permanen
};

let config = { ...DEFAULT_CONFIG };
let currentPosition = null;
let isInsideSchool = false;
let html5QrCode = null;
let isScanning = false;
let isProcessing = false;

document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  applyConfig();
  requestLocation();
  
  document.getElementById('qrFileInput').addEventListener('change', handleFileSelect);
  
  const dropZone = document.getElementById('dropZone');
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('border-blue-500');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('border-blue-500'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-blue-500');
    if (e.dataTransfer.files.length) processImageFile(e.dataTransfer.files[0]);
  });


});

// ========== PENGATURAN ==========
function loadConfig() {
  try {
    const saved = localStorage.getItem('absensi_config');
    if (saved) config = { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
  } catch (e) {
    console.warn("Gagal memuat konfigurasi lokal:", e);
  }
}

function saveConfig() {
  config.schoolName = document.getElementById('cfgSchoolName').value.trim() || DEFAULT_CONFIG.schoolName;
  config.schoolLat = parseFloat(document.getElementById('cfgLat').value) || DEFAULT_CONFIG.schoolLat;
  config.schoolLng = parseFloat(document.getElementById('cfgLng').value) || DEFAULT_CONFIG.schoolLng;
  config.radiusMeter = parseInt(document.getElementById('cfgRadius').value) || DEFAULT_CONFIG.radiusMeter;
  config.scriptUrl = document.getElementById('cfgScriptUrl').value.trim();
  
  localStorage.setItem('absensi_config', JSON.stringify(config));
  applyConfig();
  toggleConfig();
  if (currentPosition) checkSchoolLocation(currentPosition.coords);
  showToast('Pengaturan disimpan!');
}

function applyConfig() {
  document.getElementById('schoolName').textContent = config.schoolName;
  document.getElementById('cfgSchoolName').value = config.schoolName;
  document.getElementById('cfgLat').value = config.schoolLat;
  document.getElementById('cfgLng').value = config.schoolLng;
  document.getElementById('cfgRadius').value = config.radiusMeter;
  document.getElementById('cfgScriptUrl').value = config.scriptUrl;
}

function toggleConfig() {
  document.getElementById('configModal').classList.toggle('hidden');
}

function toggleQrModal() {
  const modal = document.getElementById('qrGeneratorModal');
  if (!modal) {
    showToast('Elemen modal QR tidak ditemukan di index.html!', 'error');
    return;
  }
  modal.classList.toggle('hidden');
}

function getCurrentLocationAsSchool() {
  if (!currentPosition) {
    showToast('Lokasi belum tersedia. Izinkan akses lokasi dulu.', 'error');
    return;
  }
  document.getElementById('cfgLat').value = currentPosition.coords.latitude.toFixed(6);
  document.getElementById('cfgLng').value = currentPosition.coords.longitude.toFixed(6);
  showToast('Koordinat saat ini dimasukkan. Klik Simpan.');
}

// ========== GPS & VALIDASI RADIUS ==========
function requestLocation() {
  if (!navigator.geolocation) {
    updateGpsUI('error', 'GPS tidak didukung', 'Browser tidak mendukung geolocation');
    return;
  }
  updateGpsUI('loading', 'Mengecek lokasi...', 'Mohon izinkan akses lokasi');

  navigator.geolocation.watchPosition(
    (pos) => {
      currentPosition = pos;
      checkSchoolLocation(pos.coords);
    },
    (err) => {
      let msg = 'Gagal mendapatkan lokasi';
      if (err.code === 1) msg = 'Akses lokasi ditolak. Mohon izinkan di pengaturan browser.';
      if (err.code === 2) msg = 'Lokasi tidak tersedia';
      if (err.code === 3) msg = 'Timeout mendapatkan lokasi';
      updateGpsUI('error', 'Lokasi Gagal', msg);
      isInsideSchool = false;
      updateScannerVisibility();
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
  );
}

function checkSchoolLocation(coords) {
  const distance = haversineDistance(coords.latitude, coords.longitude, config.schoolLat, config.schoolLng);
  const accuracy = coords.accuracy || 0;
  isInsideSchool = distance <= config.radiusMeter;
  
  const distText = distance < 1000 
    ? `${Math.round(distance)} meter dari sekolah`
    : `${(distance / 1000).toFixed(2)} km dari sekolah`;
  
  if (isInsideSchool) {
    updateGpsUI('success', 'Lokasi Valid ✓', distText);
    document.getElementById('gpsAccuracy').textContent = `Akurasi GPS: ±${Math.round(accuracy)} m`;
    document.getElementById('gpsAccuracy').classList.remove('hidden');
  } else {
    updateGpsUI('error', 'Di Luar Sekolah', distText);
    document.getElementById('distanceInfo').textContent = `Jarak: ${distText} (maks ${config.radiusMeter} m)`;
    document.getElementById('gpsAccuracy').classList.add('hidden');
  }
  updateScannerVisibility();
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function updateGpsUI(status, title, detail) {
  const icon = document.getElementById('gpsIcon');
  const badge = document.getElementById('gpsBadge');
  const card = document.getElementById('gpsCard');
  
  document.getElementById('gpsTitle').textContent = title;
  document.getElementById('gpsDetail').textContent = detail;
  
  card.classList.remove('glow-green', 'glow-red');
  badge.classList.add('hidden');
  
  if (status === 'success') {
    icon.innerHTML = '<i class="fas fa-location-dot text-xl text-green-400"></i>';
    icon.className = 'w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center';
    badge.textContent = 'OK';
    badge.className = 'px-2.5 py-1 rounded-full text-xs font-bold bg-green-500/20 text-green-400';
    card.classList.add('glow-green');
  } else if (status === 'error') {
    icon.innerHTML = '<i class="fas fa-location-dot text-xl text-red-400"></i>';
    icon.className = 'w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center';
    badge.textContent = 'GAGAL';
    badge.className = 'px-2.5 py-1 rounded-full text-xs font-bold bg-red-500/20 text-red-400';
    card.classList.add('glow-red');
  } else {
    icon.innerHTML = '<i class="fas fa-spinner fa-spin text-xl text-blue-400"></i>';
    icon.className = 'w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center';
  }
}

function updateScannerVisibility() {
  const warning = document.getElementById('outOfSchoolWarning');
  const scanner = document.getElementById('scannerSection');
  const resultCard = document.getElementById('resultCard');
  
  if (isInsideSchool) {
    warning.classList.add('hidden');
    if (resultCard.classList.contains('hidden')) {
      scanner.classList.remove('hidden');
      const isCameraActive = document.getElementById('tabCamera').classList.contains('tab-active');
      if (isCameraActive && !isScanning) startCameraScanner();
    }
  } else {
    warning.classList.remove('hidden');
    scanner.classList.add('hidden');
    stopCameraScanner();
  }
}

// ========== SCANNER KAMERA & UPLOAD GAMBAR ==========
function switchTab(tab) {
  const tabCamera = document.getElementById('tabCamera');
  const tabUpload = document.getElementById('tabUpload');
  const cameraPanel = document.getElementById('cameraPanel');
  const uploadPanel = document.getElementById('uploadPanel');
  
  if (tab === 'camera') {
    tabCamera.classList.add('tab-active');
    tabCamera.classList.remove('text-slate-400');
    tabUpload.classList.remove('tab-active');
    tabUpload.classList.add('text-slate-400');
    cameraPanel.classList.remove('hidden');
    uploadPanel.classList.add('hidden');
    startCameraScanner();
  } else {
    tabUpload.classList.add('tab-active');
    tabUpload.classList.remove('text-slate-400');
    tabCamera.classList.remove('tab-active');
    tabCamera.classList.add('text-slate-400');
    uploadPanel.classList.remove('hidden');
    cameraPanel.classList.add('hidden');
    stopCameraScanner();
  }
}

async function startCameraScanner() {
  if (isScanning || !isInsideSchool) return;
  const readerEl = document.getElementById('reader');
  readerEl.innerHTML = '';
  
  try {
    html5QrCode = new Html5Qrcode("reader");
    await html5QrCode.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
      onScanSuccess,
      () => {}
    );
    isScanning = true;
  } catch (err) {
    readerEl.innerHTML = `
      <div class="p-6 text-center text-slate-400">
        <i class="fas fa-camera-slash text-3xl mb-2"></i>
        <p class="text-sm">Kamera tidak tersedia atau izin ditolak.</p>
        <p class="text-xs mt-1">Gunakan tab <b>Upload Gambar</b>.</p>
      </div>`;
  }
}

async function stopCameraScanner() {
  if (html5QrCode && isScanning) {
    try {
      await html5QrCode.stop();
      await html5QrCode.clear();
    } catch (e) {}
    isScanning = false;
  }
}

function handleFileSelect(e) {
  if (e.target.files.length === 0) return;
  processImageFile(e.target.files[0]);
}

async function processImageFile(file) {
  if (!isInsideSchool) {
    showToast('Anda harus berada di lokasi sekolah!', 'error');
    return;
  }

  const preview = document.getElementById('uploadPreview');
  const previewImg = document.getElementById('previewImg');
  const uploadStatus = document.getElementById('uploadStatus');

  preview.classList.remove('hidden');
  uploadStatus.textContent = 'Memindai QR Code dari gambar...';
  uploadStatus.className = 'text-center text-sm mt-3 text-blue-400';

  const reader = new FileReader();
  reader.onload = (e) => {
    previewImg.src = e.target.result;
  };
  reader.readAsDataURL(file);

  try {
    const fileQrScanner = new Html5Qrcode("fileReaderTemp");
    const decodedText = await fileQrScanner.scanFile(file, true);
    fileQrScanner.clear();
    uploadStatus.textContent = 'QR Code ditemukan!';
    uploadStatus.className = 'text-center text-sm mt-3 text-green-400';
    onScanSuccess(decodedText);
  } catch (err) {
    uploadStatus.textContent = 'QR Code tidak ditemukan pada gambar ini.';
    uploadStatus.className = 'text-center text-sm mt-3 text-red-400';
    showToast('Gagal membaca QR dari gambar', 'error');
  }
}

// ========== PROSES HASIL SCAN & PENGIRIMAN KE GOOGLE SHEETS ==========
async function onScanSuccess(decodedText) {
  if (isProcessing) return;
  isProcessing = true;

  await stopCameraScanner();
  showToast('Memproses absensi...', 'info');

  const now = new Date();
  const timestamp = now.toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'medium'
  });

  const payload = {
    qrData: decodedText,
    timestamp: timestamp,
    latitude: currentPosition ? currentPosition.coords.latitude : null,
    longitude: currentPosition ? currentPosition.coords.longitude : null,
    schoolName: config.schoolName
  };

  // Cek apakah URL Google Apps Script sudah diatur
  if (!config.scriptUrl) {
    showResult(
      true,
      'Absensi Tercatat (Lokal)',
      'URL Google Apps Script belum diatur, data ditampilkan sebagai simulasi.',
      [
        { label: 'Data QR', value: decodedText },
        { label: 'Waktu', value: timestamp },
        { label: 'Koordinat', value: payload.latitude ? `${payload.latitude.toFixed(5)}, ${payload.longitude.toFixed(5)}` : '-' },
        { label: 'Catatan', value: 'Atur URL Script di Pengaturan untuk simpan ke Google Sheets' }
      ]
    );
    isProcessing = false;
    return;
  }

  // Validasi format URL Google Apps Script
  if (!config.scriptUrl.startsWith('https://script.google.com/') || !config.scriptUrl.endsWith('/exec')) {
    showResult(
      false,
      'URL Script Tidak Valid',
      'URL harus diawali https://script.google.com/ dan diakhiri /exec.',
      [
        { label: 'URL Saat Ini', value: config.scriptUrl },
        { label: 'Solusi', value: 'Salin URL Web App yang benar dari menu Deploy di Google Apps Script' }
      ]
    );
    isProcessing = false;
    return;
  }

  // Kirim data ke Google Apps Script
  try {
    const response = await fetch(config.scriptUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (result.status === 'success') {
      showResult(
        true,
        'Absensi Berhasil!',
        'Data kehadiran Anda telah tersimpan ke Google Sheets.',
        [
          { label: 'Data QR', value: decodedText },
          { label: 'Waktu', value: timestamp },
          { label: 'Lokasi', value: config.schoolName },
          { label: 'Status Server', value: result.message || 'Tersimpan' }
        ]
      );
    } else {
      throw new Error(result.message || 'Server menolak data');
    }
  } catch (error) {
    showResult(
      false,
      'Gagal Mengirim',
      'Server Google Sheets menolak atau tidak dapat dihubungi.',
      [
        { label: 'Data QR', value: decodedText },
        { label: 'Error', value: error.message },
        { label: 'Cek Ulang', value: 'Pastikan Deploy Apps Script diatur ke akses: Siapa saja (Anyone)' }
      ]
    );
  } finally {
    isProcessing = false;
  }
}

// ========== TAMPILAN HASIL & NOTIFIKASI ==========
function showResult(isSuccess, title, message, details = []) {
  document.getElementById('scannerSection').classList.add('hidden');
  const resultCard = document.getElementById('resultCard');
  const resultIcon = document.getElementById('resultIcon');
  const resultTitle = document.getElementById('resultTitle');
  const resultMessage = document.getElementById('resultMessage');
  const resultDetails = document.getElementById('resultDetails');

  resultCard.classList.remove('hidden', 'glow-green', 'glow-red');

  if (isSuccess) {
    resultCard.classList.add('glow-green');
    resultIcon.className = 'w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-3 bg-green-500/20 text-green-400 text-2xl';
    resultIcon.innerHTML = '<i class="fas fa-check"></i>';
    resultTitle.className = 'font-bold text-lg text-green-400';
  } else {
    resultCard.classList.add('glow-red');
    resultIcon.className = 'w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-3 bg-red-500/20 text-red-400 text-2xl';
    resultIcon.innerHTML = '<i class="fas fa-xmark"></i>';
    resultTitle.className = 'font-bold text-lg text-red-400';
  }

  resultTitle.textContent = title;
  resultMessage.textContent = message;

  resultDetails.innerHTML = details.map(item => `
    <div class="flex justify-between gap-2 border-b border-slate-800 pb-1.5 last:border-0 last:pb-0">
      <span class="text-slate-400">${item.label}</span>
      <span class="font-semibold text-right break-all">${item.value}</span>
    </div>
  `).join('');
}

function resetScanner() {
  document.getElementById('resultCard').classList.add('hidden');
  document.getElementById('uploadPreview').classList.add('hidden');
  document.getElementById('qrFileInput').value = '';
  updateScannerVisibility();
}

function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = 'fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg transition-all duration-300';

  if (type === 'error') {
    toast.classList.add('bg-red-600', 'text-white');
  } else if (type === 'info') {
    toast.classList.add('bg-blue-600', 'text-white');
  } else {
    toast.classList.add('bg-emerald-600', 'text-white');
  }

  toast.classList.remove('hidden');
  clearTimeout(window.toastTimeout);
  window.toastTimeout = setTimeout(() => {
    toast.classList.add('hidden');
  }, 3000);
}

// ========== QR CODE GENERATOR ==========
function generateQrCode() {
  const nisn = document.getElementById('genNisn').value.trim();
  const nama = document.getElementById('genNama').value.trim();

  if (!nisn && !nama) {
    showToast('Isi minimal NISN atau Nama terlebih dahulu!', 'error');
    return;
  }

  // Format data gabungan agar konsisten (contoh: 19862871|Budi Santoso)
  const qrPayload = nisn && nama ? `${nisn}|${nama}` : (nisn || nama);

  const container = document.getElementById('qrResultContainer');
  const canvasBox = document.getElementById('qrcodeCanvas');
  const labelPreview = document.getElementById('qrLabelPreview');

  // Bersihkan QR sebelumnya
  canvasBox.innerHTML = '';

  if (typeof QRCode !== 'undefined') {
    // Buat QR Code menggunakan library QRCode.js
    new QRCode(canvasBox, {
      text: qrPayload,
      width: 220,
      height: 220,
      colorDark: "#0f172a",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H
    });
  } else {
    // Fallback otomatis ke API QR jika CDN terblokir
    const fallbackImg = document.createElement('img');
    fallbackImg.crossOrigin = 'anonymous';
    fallbackImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrPayload)}`;
    fallbackImg.alt = 'QR Code Absensi';
    fallbackImg.width = 220;
    fallbackImg.height = 220;
    canvasBox.appendChild(fallbackImg);
  }

  labelPreview.textContent = qrPayload;
  container.classList.remove('hidden');
  showToast('QR Code berhasil dibuat!');
}

async function downloadQrCode() {
  const canvas = document.querySelector('#qrcodeCanvas canvas');
  const img = document.querySelector('#qrcodeCanvas img');
  const nisn = document.getElementById('genNisn').value.trim();
  const nama = document.getElementById('genNama').value.trim();
  
  const rawName = (nisn || nama || 'absensi').replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `QR_${rawName}.png`;

  try {
    let dataUrl = '';
    if (canvas) {
      dataUrl = canvas.toDataURL('image/png');
    } else if (img && img.src) {
      if (img.src.startsWith('data:')) {
        dataUrl = img.src;
      } else {
        const res = await fetch(img.src);
        const blob = await res.blob();
        dataUrl = URL.createObjectURL(blob);
      }
    } else {
      showToast('QR Code belum tersedia untuk diunduh.', 'error');
      return;
    }

    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Gambar QR berhasil diunduh!');
  } catch (err) {
    showToast('Gagal mengunduh gambar QR.', 'error');
  }
}

// Ekspos fungsi ke global window agar selalu bisa dipanggil dari HTML
window.toggleQrModal = toggleQrModal;
window.generateQrCode = generateQrCode;
window.downloadQrCode = downloadQrCode;

// ========== TAB KAMERA / UPLOAD / GENERATOR ==========
function switchTab(tab) {
  const tabs = {
    camera: document.getElementById('tabCamera'),
    upload: document.getElementById('tabUpload'),
    generator: document.getElementById('tabGenerator')
  };
  const panels = {
    camera: document.getElementById('cameraPanel'),
    upload: document.getElementById('uploadPanel'),
    generator: document.getElementById('generatorPanel')
  };

  Object.entries(tabs).forEach(([name, button]) => {
    if (!button) return;
    button.classList.toggle('tab-active', name === tab);
    button.classList.toggle('text-slate-400', name !== tab);
  });

  Object.entries(panels).forEach(([name, panel]) => {
    if (panel) panel.classList.toggle('hidden', name !== tab);
  });

  if (tab === 'camera') {
    if (isInsideSchool) startCameraScanner();
  } else {
    stopCameraScanner();
  }
}

// Generator pada tab utama menggunakan library QRCode.js yang dimuat dari HTML.
function generateQrFromTab() {
  const nisn = document.getElementById('inlineNisn').value.trim();
  const nama = document.getElementById('inlineNama').value.trim();

  if (!nisn && !nama) {
    showToast('Isi minimal NISN atau Nama terlebih dahulu!', 'error');
    return;
  }

  const payload = nisn && nama ? `${nisn}|${nama}` : (nisn || nama);
  const box = document.getElementById('inlineQrBox');
  box.innerHTML = '';

  if (typeof QRCode === 'undefined') {
    showToast('Library QR belum termuat. Periksa koneksi internet lalu muat ulang halaman.', 'error');
    return;
  }

  new QRCode(box, {
    text: payload,
    width: 220,
    height: 220,
    colorDark: '#0f172a',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H
  });

  document.getElementById('inlineQrLabel').textContent = payload;
  document.getElementById('inlineQrResult').classList.remove('hidden');
  showToast('QR Code berhasil dibuat!');
}

function downloadQrFromTab() {
  const box = document.getElementById('inlineQrBox');
  const canvas = box.querySelector('canvas');
  const img = box.querySelector('img');
  const nisn = document.getElementById('inlineNisn').value.trim();
  const nama = document.getElementById('inlineNama').value.trim();
  const safeName = (nisn || nama || 'absensi').replace(/[^a-zA-Z0-9_-]/g, '_');

  let dataUrl = '';
  if (canvas) {
    dataUrl = canvas.toDataURL('image/png');
  } else if (img && img.src) {
    dataUrl = img.src;
  } else {
    showToast('Buat QR Code terlebih dahulu!', 'error');
    return;
  }

  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `QR_${safeName}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  showToast('Gambar QR berhasil diunduh!');
}

// Pastikan fungsi yang dipanggil oleh atribut onclick tersedia secara global.
window.switchTab = switchTab;
window.toggleQrModal = toggleQrModal;
window.generateQrCode = generateQrCode;
window.downloadQrCode = downloadQrCode;
window.generateQrFromTab = generateQrFromTab;
window.downloadQrFromTab = downloadQrFromTab;




