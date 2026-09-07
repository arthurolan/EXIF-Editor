"use client";

import { AlertTriangle, ArrowRight, Check, Clock3, Download, FileImage, FolderOpen, ImagePlus, Map, MapPin, PencilLine, Play, RefreshCw, ShieldCheck, Volume2, X } from "lucide-react";
import dynamic from "next/dynamic";
import { type ChangeEvent, useMemo, useRef, useState } from "react";
import { hasBatchTextEdits, parseBatchGpsEdits, processBatchFile, type BatchGpsInput, type BatchOperation, type BatchPhase, type BatchTextEdits, type BatchTextField, type BatchTimeOffset } from "./batch-processor";
import { imageFormatFromFile } from "./metadata/formats";

const MAX_FILES = 100;
const MAX_FILE_SIZE = 500 * 1024 * 1024;
const MAX_TOTAL_SIZE = 1024 * 1024 * 1024;
type SkipReason = "unsupported" | "fileSize" | "count" | "totalSize";
const SKIP_LABELS = {
  zh: { unsupported: "格式不支持（含系统隐藏文件）", fileSize: "单张超过 500 MB", count: "超过 100 个文件上限", totalSize: "加入后会超过 1 GB 总容量" },
  en: { unsupported: "Unsupported format (including system files)", fileSize: "File exceeds 500 MB", count: "100-file limit exceeded", totalSize: "Would exceed 1 GB total" },
};

type QueueStatus = "waiting" | BatchPhase | "success" | "failed" | "cancelled";
type QueueItem = { id: string; source: File; status: QueueStatus; reason?: string; skippedTextFields?: BatchTextField[]; output?: File };
type Language = "zh" | "en";
type CompletionState = "complete" | "stopped" | null;
const EMPTY_TEXT_EDITS: BatchTextEdits = { artist: "", copyright: "", keywords: "", city: "", country: "" };
const EMPTY_TIME_OFFSET: BatchTimeOffset = { days: 0, hours: 0, minutes: 0 };
const EMPTY_GPS_INPUT: BatchGpsInput = { latitude: "", longitude: "", altitude: "", direction: "" };
const MapPicker = dynamic(() => import("./map-picker"), { ssr: false });
const GPS_COPY = {
  zh: { action: "写入 GPS", title: "要写入全部照片的位置", hint: "坐标以 WGS‑84 写入。纬度和经度必填；海拔、拍摄方向可选，留空时保持每张照片原有值。南纬和西经使用负数。", latitude: "纬度", longitude: "经度", altitude: "海拔（米，可选）", direction: "拍摄方向（0–359°，可选）", pick: "在地图上点选位置", consent: "点击后才会从 OpenFreeMap 加载地图，地图服务会获知当前视野附近区域。", invalid: "请填写有效的纬度（−90 至 90）和经度（−180 至 180）；方向须为 0–359。" },
  en: { action: "Write GPS", title: "Location to write to every photo", hint: "Coordinates are written in WGS‑84. Latitude and longitude are required; altitude and direction are optional and keep each photo's existing value when blank. Use negative values for south and west.", latitude: "Latitude", longitude: "Longitude", altitude: "Altitude (metres, optional)", direction: "Direction (0–359°, optional)", pick: "Choose a location on the map", consent: "Clicking loads OpenFreeMap, which receives the approximate map area in view.", invalid: "Enter a valid latitude (−90 to 90) and longitude (−180 to 180); direction must be 0–359." },
} as const;

const copy = {
  zh: {
    title: "批量照片处理", subtitle: "按顺序逐张写入和复核；未通过核验的副本不会交付。", choose: "选择多张照片", folder: "选择文件夹", back: "返回单张编辑", privacy: "隐私清理", gps: "删除 GPS", metadata: "写入文字", shiftTime: "时间偏移", metadataTitle: "要写入全部照片的文字信息", metadataHint: "可先选择照片，再填写字段。点击开始处理时，这些设置会锁定并应用到整个队列；留空字段保持每张原有值。将同步写入兼容的 EXIF / XMP / IPTC 标签。", metadataRequired: "请先填写至少一个文字字段，再开始处理。", timeOffsetTitle: "对每张照片的拍摄时间应用统一偏移", timeOffsetHint: "以照片原有拍摄时间为基准；可使用负数。每张照片会分别读取、计算、写入并核验，缺少或无法解析拍摄时间的文件不会交付。", timeOffsetRequired: "请填写非零的时间偏移量，再开始处理。", days: "天", hours: "小时", minutes: "分钟", heicTextWarning: "HEIC / HEIF 仅支持批量写入并核验作者、版权；关键词、城市、国家/地区会保持原值，但不影响已验证副本的交付。", skippedTextFields: (fields: string) => `未写入：${fields}`, artist: "作者", copyright: "版权", keywords: "关键词", city: "城市", country: "国家/地区", artistPlaceholder: "摄影者姓名", copyrightPlaceholder: "© 2026 姓名", keywordsPlaceholder: "旅行, 胶片, 上海", cityPlaceholder: "例如 上海", countryPlaceholder: "例如 中国", start: "开始处理", stop: "处理完当前项后停止", retry: "重试失败项", clear: "清空队列", download: "下载", downloadZip: "下载 ZIP（全部成功项）", packingZip: "正在打包 ZIP", waiting: "等待中", reading: "读取中", writing: "写入中", verifying: "核验中", success: "已通过核验", failed: "失败", cancelled: "已停止", limits: "最多 100 个文件、总计 1 GB；单张最大 500 MB。", selectionError: "无法加入队列：仅支持当前支持的图片格式，且需符合文件数和容量上限。", skippedFiles: (count: number) => `已跳过 ${count} 个不支持或超出上限的文件；其余已加入队列。`, noFiles: "请选择至少一张可处理的照片。", progress: "进度", processing: "正在处理", complete: "处理完成", stopped: "处理已停止", completedItems: (completed: number, total: number) => `已完成 ${completed} / ${total}`, currentFile: (phase: string, name: string) => `${phase}：${name}`, completionSummary: (success: number, failed: number) => `${success} 个已通过核验 · ${failed} 个失败`, completionSound: "完成提示音", noDelivery: "失败或未核验的文件不会提供下载。ZIP 仅包含已验证副本。", folderHint: "文件夹选择依赖 Chromium 浏览器；也可以直接多选文件。",
  },
  en: {
    title: "Batch photo processing", subtitle: "Files are written and verified one at a time. Unverified copies are never delivered.", choose: "Choose photos", folder: "Choose folder", back: "Back to single editor", privacy: "Privacy cleanup", gps: "Remove GPS", metadata: "Write text", shiftTime: "Shift time", metadataTitle: "Text metadata to write to every photo", metadataHint: "You can choose photos before filling fields. When processing starts, these settings lock and apply to the entire queue; blank fields keep each photo's existing value. Compatible EXIF / XMP / IPTC tags are synchronized.", metadataRequired: "Fill at least one text field before starting processing.", timeOffsetTitle: "Apply one time offset to every photo", timeOffsetHint: "This uses each photo's original capture time; negative values are allowed. Every photo is read, calculated, written, and verified independently. Files with no readable capture time are not delivered.", timeOffsetRequired: "Set a non-zero time offset before starting.", days: "Days", hours: "Hours", minutes: "Minutes", heicTextWarning: "HEIC / HEIF batch writing verifies author and copyright only. Keywords, city, and country / region stay unchanged without blocking delivery of the verified copy.", skippedTextFields: (fields: string) => `Not written: ${fields}`, artist: "Author", copyright: "Copyright", keywords: "Keywords", city: "City", country: "Country / region", artistPlaceholder: "Photographer name", copyrightPlaceholder: "© 2026 Name", keywordsPlaceholder: "travel, film, Shanghai", cityPlaceholder: "e.g. Shanghai", countryPlaceholder: "e.g. China", start: "Start processing", stop: "Stop after current item", retry: "Retry failed", clear: "Clear queue", download: "Download", downloadZip: "Download ZIP (all verified copies)", packingZip: "Packing ZIP", waiting: "Waiting", reading: "Reading", writing: "Writing", verifying: "Verifying", success: "Verified", failed: "Failed", cancelled: "Stopped", limits: "Up to 100 files / 1 GB total; 500 MB per file.", selectionError: "Could not add files: use a supported image format within the file-count and size limits.", skippedFiles: (count: number) => `Skipped ${count} unsupported or over-limit file${count === 1 ? "" : "s"}; the rest joined the queue.`, noFiles: "Choose at least one processable photo.", progress: "Progress", processing: "Processing", complete: "Processing complete", stopped: "Processing stopped", completedItems: (completed: number, total: number) => `${completed} / ${total} complete`, currentFile: (phase: string, name: string) => `${phase}: ${name}`, completionSummary: (success: number, failed: number) => `${success} verified · ${failed} failed`, completionSound: "Completion sound", noDelivery: "Failed or unverified files never receive a download. The ZIP contains verified copies only.", folderHint: "Folder selection depends on Chromium browsers; multi-file selection is always available.",
  },
} as const;

const formatBytes = (size: number) => size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;

export function BatchWorkspace({ language, onClose }: { language: Language; onClose: () => void }) {
  const t = copy[language];
  const gpsCopy = GPS_COPY[language];
  const inputRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const stopRef = useRef(false);
  const completionAudioRef = useRef<AudioContext | null>(null);
  const [operation, setOperation] = useState<BatchOperation>("privacy");
  const [textEdits, setTextEdits] = useState<BatchTextEdits>(EMPTY_TEXT_EDITS);
  const [timeOffset, setTimeOffset] = useState<BatchTimeOffset>(EMPTY_TIME_OFFSET);
  const [gpsInput, setGpsInput] = useState<BatchGpsInput>(EMPTY_GPS_INPUT);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [running, setRunning] = useState(false);
  const [completionState, setCompletionState] = useState<CompletionState>(null);
  const [configurationLocked, setConfigurationLocked] = useState(false);
  const [selectionError, setSelectionError] = useState("");
  const [selectionNotice, setSelectionNotice] = useState<{ added: number; skipped: { name: string; reason: SkipReason }[] } | null>(null);
  const [zipBusy, setZipBusy] = useState(false);
  const [zipProgress, setZipProgress] = useState<[number, number] | null>(null);
  const [zipError, setZipError] = useState("");

  const counts = useMemo(() => ({
    completed: items.filter((item) => item.status === "success" || item.status === "failed" || item.status === "cancelled").length,
    success: items.filter((item) => item.status === "success").length,
    failed: items.filter((item) => item.status === "failed").length,
    totalSize: items.reduce((sum, item) => sum + item.source.size, 0),
  }), [items]);
  const metadataReady = hasBatchTextEdits(textEdits);
  const timeOffsetReady = Boolean(timeOffset.days || timeOffset.hours || timeOffset.minutes);
  const gpsEdits = parseBatchGpsEdits(gpsInput);
  // Keep an empty coordinate unset so the shared picker opens at its neutral default,
  // rather than treating an empty input as the valid coordinate 0, 0.
  const mapLatitude = gpsInput.latitude.trim() ? Number(gpsInput.latitude) : Number.NaN;
  const mapLongitude = gpsInput.longitude.trim() ? Number(gpsInput.longitude) : Number.NaN;
  const currentItem = items.find((item) => item.status === "reading" || item.status === "writing" || item.status === "verifying");
  const progressPercent = items.length ? Math.round((counts.completed / items.length) * 100) : 0;
  const containsHeic = items.some((item) => imageFormatFromFile(item.source)?.format === "heic");

  const prepareCompletionSound = () => {
    if (typeof window === "undefined" || !window.AudioContext) return;
    const context = completionAudioRef.current ?? new window.AudioContext();
    completionAudioRef.current = context;
    void context.resume().catch(() => undefined);
  };

  const playCompletionSound = () => {
    const context = completionAudioRef.current;
    if (!context || context.state !== "running") return;
    const gain = context.createGain();
    gain.connect(context.destination);
    const start = context.currentTime + 0.02;
    [880, 1175].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const toneStart = start + index * 0.16;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, toneStart);
      oscillator.connect(gain);
      oscillator.start(toneStart);
      oscillator.stop(toneStart + 0.12);
    });
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.09, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.36);
  };

  const addFiles = (files: FileList | null) => {
    if (!files || running || configurationLocked) return;
    setSelectionError(""); setSelectionNotice(null);
    const candidates = Array.from(files);
    const existingSize = items.reduce((sum, item) => sum + item.source.size, 0);
    const accepted: QueueItem[] = [];
    const skipped: { name: string; reason: SkipReason }[] = [];
    let totalSize = existingSize;
    for (const source of candidates) {
      const reason: SkipReason | null = !imageFormatFromFile(source) ? "unsupported"
        : source.size > MAX_FILE_SIZE ? "fileSize"
        : items.length + accepted.length >= MAX_FILES ? "count"
        : totalSize + source.size > MAX_TOTAL_SIZE ? "totalSize" : null;
      if (reason) {
        skipped.push({ name: source.webkitRelativePath || source.name, reason });
        continue;
      }
      totalSize += source.size;
      accepted.push({ id: `${source.name}-${source.size}-${source.lastModified}-${crypto.randomUUID()}`, source, status: "waiting" });
    }
    if (skipped.length) setSelectionNotice({ added: accepted.length, skipped });
    if (accepted.length) {
      setCompletionState(null);
      setItems((current) => [...current, ...accepted]);
    }
  };

  const onFiles = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(event.target.files);
    event.target.value = "";
  };

  const update = (id: string, patch: Partial<QueueItem>) => setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));

  const run = async (onlyFailed = false) => {
    const queue = items.filter((item) => onlyFailed ? item.status === "failed" : item.status === "waiting" || item.status === "cancelled");
    if (!queue.length) return;
    if (operation === "metadata" && !metadataReady) {
      setSelectionError(t.metadataRequired);
      return;
    }
    if (operation === "shiftTime" && !timeOffsetReady) {
      setSelectionError(t.timeOffsetRequired);
      return;
    }
    if (operation === "writeGps" && !gpsEdits) {
      setSelectionError(gpsCopy.invalid);
      return;
    }
    stopRef.current = false;
    prepareCompletionSound();
    setCompletionState(null);
    setConfigurationLocked(true);
    setRunning(true);
    const selectedOperation = operation;
    const selectedTextEdits = { ...textEdits };
    const selectedTimeOffset = { ...timeOffset };
    const selectedGpsEdits = gpsEdits;
    for (const item of queue) {
      if (stopRef.current) {
        update(item.id, { status: "cancelled", reason: undefined });
        continue;
      }
      update(item.id, { status: "reading", reason: undefined, output: undefined });
      const result = await processBatchFile(item.source, selectedOperation, selectedTextEdits, selectedTimeOffset, selectedGpsEdits, (phase) => update(item.id, { status: phase }));
      if (result.success) update(item.id, { status: "success", output: result.file, skippedTextFields: result.skippedTextFields });
      else update(item.id, { status: "failed", reason: result.reason });
    }
    setCompletionState(stopRef.current ? "stopped" : "complete");
    playCompletionSound();
    setRunning(false);
  };

  const download = (file: Blob, name: string) => {
    const href = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = href; link.download = name; document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 60_000);
  };

  const downloadZip = async () => {
    const verified = items.flatMap((item) => item.status === "success" && item.output ? [{ name: item.output.name, file: item.output }] : []);
    if (!verified.length) return;
    setZipError(""); setZipBusy(true); setZipProgress([0, verified.length]);
    try {
      const { createStoredZip } = await import("./zip-store");
      const archive = await createStoredZip(verified, (completed, total) => setZipProgress([completed, total]));
      const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
      download(archive, `yingke-exif-batch-${date}.zip`);
    } catch (cause) {
      setZipError(cause instanceof Error ? cause.message : "ZIP delivery failed.");
    } finally {
      setZipBusy(false); setZipProgress(null);
    }
  };

  const statusLabel = (status: QueueStatus) => t[status] as string;
  const assignText = (field: BatchTextField, value: string) => setTextEdits((current) => ({ ...current, [field]: value }));
  const assignTimeOffset = (field: keyof BatchTimeOffset, value: string) => setTimeOffset((current) => ({ ...current, [field]: Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 0 }));
  const assignGps = (field: keyof BatchGpsInput, value: string) => setGpsInput((current) => ({ ...current, [field]: value }));
  const folderProps = { webkitdirectory: "", directory: "" } as unknown as Record<string, string>;

  return <section className="batch-shell" aria-busy={running}>
    <div className="batch-heading">
      <div><span className="section-icon"><ShieldCheck size={18} /></span><h2>{t.title}</h2><p>{t.subtitle}</p></div>
      <button type="button" className="text-button" onClick={onClose} disabled={running}><X size={16} />{t.back}</button>
    </div>
    <div className="batch-controls">
      <div className="batch-operation" role="radiogroup" aria-label={t.title}>
        <button type="button" role="radio" aria-checked={operation === "privacy"} className={operation === "privacy" ? "active" : ""} disabled={running || configurationLocked} onClick={() => setOperation("privacy")}>{t.privacy}</button>
        <button type="button" role="radio" aria-checked={operation === "removeGps"} className={operation === "removeGps" ? "active" : ""} disabled={running || configurationLocked} onClick={() => setOperation("removeGps")}>{t.gps}</button>
        <button type="button" role="radio" aria-checked={operation === "metadata"} className={operation === "metadata" ? "active" : ""} disabled={running || configurationLocked} onClick={() => setOperation("metadata")}><PencilLine size={15} />{t.metadata}</button>
        <button type="button" role="radio" aria-checked={operation === "shiftTime"} className={operation === "shiftTime" ? "active" : ""} disabled={running || configurationLocked} onClick={() => setOperation("shiftTime")}><Clock3 size={15} />{t.shiftTime}</button>
        <button type="button" role="radio" aria-checked={operation === "writeGps"} className={operation === "writeGps" ? "active" : ""} disabled={running || configurationLocked} onClick={() => setOperation("writeGps")}><MapPin size={15} />{gpsCopy.action}</button>
      </div>
      <div className="batch-actions">
        <button type="button" className="secondary-button" disabled={running || configurationLocked} onClick={() => inputRef.current?.click()}><ImagePlus size={16} />{t.choose}</button>
        <button type="button" className="secondary-button" disabled={running || configurationLocked} onClick={() => folderRef.current?.click()}><FolderOpen size={16} />{t.folder}</button>
      </div>
      <input ref={inputRef} className="sr-only" type="file" multiple accept=".jpg,.jpeg,.png,.webp,.tif,.tiff,.heic,.heif,image/jpeg,image/png,image/webp,image/tiff,image/heic,image/heif" onChange={onFiles} />
      <input ref={folderRef} className="sr-only" type="file" multiple {...folderProps} accept=".jpg,.jpeg,.png,.webp,.tif,.tiff,.heic,.heif,image/jpeg,image/png,image/webp,image/tiff,image/heic,image/heif" onChange={onFiles} />
      {operation === "metadata" && <section className="batch-metadata" aria-labelledby="batch-metadata-title">
        <div><h3 id="batch-metadata-title">{t.metadataTitle}</h3><p>{t.metadataHint}</p></div>
        <div className="batch-metadata-fields">
          <label><span>{t.artist}</span><input disabled={configurationLocked} value={textEdits.artist} onChange={(event) => assignText("artist", event.target.value)} placeholder={t.artistPlaceholder} /></label>
          <label><span>{t.copyright}</span><input disabled={configurationLocked} value={textEdits.copyright} onChange={(event) => assignText("copyright", event.target.value)} placeholder={t.copyrightPlaceholder} /></label>
          <label className="wide"><span>{t.keywords}</span><input disabled={configurationLocked} value={textEdits.keywords} onChange={(event) => assignText("keywords", event.target.value)} placeholder={t.keywordsPlaceholder} /></label>
          <label><span>{t.city}</span><input disabled={configurationLocked} value={textEdits.city} onChange={(event) => assignText("city", event.target.value)} placeholder={t.cityPlaceholder} /></label>
          <label><span>{t.country}</span><input disabled={configurationLocked} value={textEdits.country} onChange={(event) => assignText("country", event.target.value)} placeholder={t.countryPlaceholder} /></label>
        </div>
      </section>}
      {operation === "shiftTime" && <section className="batch-metadata" aria-labelledby="batch-time-offset-title">
        <div><h3 id="batch-time-offset-title">{t.timeOffsetTitle}</h3><p>{t.timeOffsetHint}</p></div>
        <div className="batch-metadata-fields batch-time-fields">
          <label><span>{t.days}</span><input type="number" step="1" disabled={configurationLocked} value={timeOffset.days} onChange={(event) => assignTimeOffset("days", event.target.value)} /></label>
          <label><span>{t.hours}</span><input type="number" step="1" disabled={configurationLocked} value={timeOffset.hours} onChange={(event) => assignTimeOffset("hours", event.target.value)} /></label>
          <label><span>{t.minutes}</span><input type="number" step="1" disabled={configurationLocked} value={timeOffset.minutes} onChange={(event) => assignTimeOffset("minutes", event.target.value)} /></label>
        </div>
      </section>}
      {operation === "writeGps" && <section className="batch-metadata" aria-labelledby="batch-gps-title">
        <div><h3 id="batch-gps-title">{gpsCopy.title}</h3><p>{gpsCopy.hint}</p></div>
        <div className="batch-metadata-fields">
          <label><span>{gpsCopy.latitude}</span><input inputMode="decimal" disabled={configurationLocked} value={gpsInput.latitude} onChange={(event) => assignGps("latitude", event.target.value)} placeholder="31.2304" /></label>
          <label><span>{gpsCopy.longitude}</span><input inputMode="decimal" disabled={configurationLocked} value={gpsInput.longitude} onChange={(event) => assignGps("longitude", event.target.value)} placeholder="121.4737" /></label>
        </div>
        {!mapLoaded && !configurationLocked ? <button type="button" className="map-consent batch-map-consent" onClick={() => setMapLoaded(true)}>
          <span><Map size={20} /></span><div><strong>{gpsCopy.pick}</strong><small>{gpsCopy.consent}</small></div><ArrowRight size={18} />
        </button> : mapLoaded && !configurationLocked ? <div className="batch-map-picker"><MapPicker language={language} latitude={mapLatitude} longitude={mapLongitude} onChange={(latitude, longitude) => setGpsInput((current) => ({ ...current, latitude: latitude.toFixed(6), longitude: longitude.toFixed(6) }))} /></div> : null}
        <div className="batch-metadata-fields batch-gps-optional">
          <label><span>{gpsCopy.altitude}</span><input inputMode="decimal" disabled={configurationLocked} value={gpsInput.altitude} onChange={(event) => assignGps("altitude", event.target.value)} placeholder="12.5" /></label>
          <label><span>{gpsCopy.direction}</span><input inputMode="decimal" disabled={configurationLocked} value={gpsInput.direction} onChange={(event) => assignGps("direction", event.target.value)} placeholder="90" /></label>
        </div>
      </section>}
    </div>
    <p className="batch-hint">{t.limits} {t.folderHint}</p>
    {selectionError && <p className="batch-error" role="alert"><AlertTriangle size={16} />{selectionError}</p>}
    {selectionNotice && <div className="batch-selection-report">
      <div role="status">
        <strong>{language === "zh" ? `本次加入 ${selectionNotice.added} 个，跳过 ${selectionNotice.skipped.length} 个。` : `Added ${selectionNotice.added}; skipped ${selectionNotice.skipped.length}.`}</strong>
        <ul>{(Object.keys(SKIP_LABELS[language]) as SkipReason[]).map((reason) => {
          const count = selectionNotice.skipped.filter((file) => file.reason === reason).length;
          return count ? <li key={reason}>{SKIP_LABELS[language][reason]}：{count}</li> : null;
        })}</ul>
        <p>{language === "zh" ? "数量和容量限制同时生效；因总容量或数量限制跳过的图片，可另建一批处理。" : "Both limits apply. Files skipped for total size or count can be processed in another batch."}</p>
      </div>
      <details><summary>{language === "zh" ? "查看被跳过的文件及原因" : "Show skipped files and reasons"}</summary>
        <ul className="batch-skipped-files">{selectionNotice.skipped.map((file, index) => <li key={index}><span>{file.name}</span> — {SKIP_LABELS[language][file.reason]}</li>)}</ul>
      </details>
    </div>}
    {zipError && <p className="batch-error" role="alert"><AlertTriangle size={16} />{zipError}</p>}
    {operation === "metadata" && containsHeic && <p className="batch-warning" role="status"><AlertTriangle size={16} />{t.heicTextWarning}</p>}
    <div className={`batch-summary ${running ? "is-running" : completionState ? "is-complete" : ""}`} role="status" aria-live="polite">
      <div className="batch-progress-heading"><strong>{running ? t.processing : completionState === "stopped" ? t.stopped : completionState === "complete" ? t.complete : t.progress}</strong><strong>{progressPercent}%</strong></div>
      <div className="batch-progress-track" aria-hidden="true"><span style={{ width: `${progressPercent}%` }} /></div>
      <div className="batch-progress-detail">
        {running && currentItem ? <span>{t.currentFile(statusLabel(currentItem.status), currentItem.source.name)}</span> : completionState ? <><Check size={15} />{t.completionSummary(counts.success, counts.failed)}<span className="batch-sound"><Volume2 size={15} />{t.completionSound}</span></> : <><span>{t.completedItems(counts.completed, items.length)}</span><span>{formatBytes(counts.totalSize)} / 1 GB</span><span>{counts.success} {t.success} · {counts.failed} {t.failed}</span></>}
      </div>
    </div>
    <div className="batch-list" aria-live="polite">
      {items.length === 0 ? <div className="batch-empty"><FileImage size={24} />{t.noFiles}</div> : items.map((item) => <article className={`batch-row status-${item.status}`} key={item.id}>
        <FileImage size={18} /><div><strong>{item.source.name}</strong><small>{formatBytes(item.source.size)} · {statusLabel(item.status)}{item.reason ? ` · ${item.reason}` : ""}{item.skippedTextFields?.length ? ` · ${t.skippedTextFields(item.skippedTextFields.map((field) => t[field]).join("、"))}` : ""}</small></div>
        {item.status === "success" && item.output ? <button type="button" className="text-button" onClick={() => { if (item.output) download(item.output, item.output.name); }}><Download size={16} />{t.download}</button> : item.status === "reading" || item.status === "writing" || item.status === "verifying" ? <RefreshCw className="spin" size={17} /> : item.status === "failed" ? <AlertTriangle size={17} /> : item.status === "success" ? <Check size={17} /> : null}
      </article>)}</div>
    <div className="batch-footer">
      <p>{t.noDelivery}</p>
      <div>
        {counts.success > 0 && <button type="button" className="secondary-button" disabled={running || zipBusy} onClick={() => void downloadZip()}><Download className={zipBusy ? "spin" : undefined} size={16} />{zipBusy && zipProgress ? `${t.packingZip} ${zipProgress[0]} / ${zipProgress[1]}` : t.downloadZip}</button>}
        {counts.failed > 0 && !running && <button type="button" className="secondary-button" onClick={() => void run(true)}><RefreshCw size={16} />{t.retry}</button>}
        {items.length > 0 && !running && <button type="button" className="text-button" onClick={() => { setItems([]); setSelectionNotice(null); setSelectionError(""); setConfigurationLocked(false); setCompletionState(null); }}>{t.clear}</button>}
        {running ? <button type="button" className="secondary-button" onClick={() => { stopRef.current = true; }}>{t.stop}</button> : <button type="button" className="primary-button" disabled={!items.some((item) => item.status === "waiting" || item.status === "cancelled") || (operation === "metadata" && !metadataReady) || (operation === "shiftTime" && !timeOffsetReady) || (operation === "writeGps" && !gpsEdits)} onClick={() => void run()}><Play size={16} />{t.start}</button>}
      </div>
    </div>
  </section>;
}
