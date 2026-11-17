/**
 * Backend absensi QR SMA Negeri 4 Madiun.
 * Pasang kode ini di Google Apps Script yang terhubung ke Google Sheets.
 */

const SPREADSHEET_ID = "1Y0tnHXG_ZTcPGCrrwRCr_RjaIA0fNa-yzwTEhL-OSVA";
const SHEET_NAME = "Absensi";
const DEFAULT_SCHOOL = "SMA Negeri 4 Madiun";
const HEADERS = [
  "Waktu Server",
  "Waktu HP Siswa",
  "Data QR / NISN",
  "Latitude",
  "Longitude",
  "Sekolah"
];

function doGet() {
  return jsonResponse({
    status: "success",
    message: "Endpoint absensi aktif"
  });
}

function doPost(e) {
  const lock = LockService.getScriptLock();

  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("Data absensi kosong.");
    }

    const data = JSON.parse(e.postData.contents);

    const qrData = String(data.qrData || "").trim();
    if (!qrData) throw new Error("Data QR/NISN wajib diisi.");

    const latitude = toFiniteNumber(data.latitude);
    const longitude = toFiniteNumber(data.longitude);

    if (latitude === null || longitude === null) {
      throw new Error("Koordinat GPS tidak valid. Aktifkan lokasi lalu coba lagi.");
    }

    lock.waitLock(15000);

    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);

    let sheet = spreadsheet.getSheetByName(SHEET_NAME);
    if (!sheet) sheet = spreadsheet.insertSheet(SHEET_NAME);

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      sheet.setFrozenRows(1);
    }

    const serverTime = Utilities.formatDate(
      new Date(),
      "Asia/Jakarta",
      "dd/MM/yyyy HH:mm:ss"
    );

    sheet.appendRow([
      serverTime,
      data.timestamp || "-",
      qrData,
      latitude,
      longitude,
      data.schoolName || DEFAULT_SCHOOL
    ]);

    return jsonResponse({
      status: "success",
      message: "Absensi berhasil disimpan."
    });

  } catch (error) {
    return jsonResponse({
      status: "error",
      message: error && error.message ? error.message : String(error)
    });
  } finally {
    try {
      lock.releaseLock();
    } catch (ignored) {}
  }
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
