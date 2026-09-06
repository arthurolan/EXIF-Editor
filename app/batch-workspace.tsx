"use client";

import { AlertTriangle, Check, Download, FileImage, FolderOpen, ImagePlus, Play, RefreshCw, ShieldCheck, X } from "lucide-react";
import { type ChangeEvent, useMemo, useRef, useState } from "react";
import { processBatchFile, type BatchOperation, type BatchPhase } from "./batch-processor";
import { imageFormatFromFile } from "./metadata/formats";

const MAX_FILES = 100;
const MAX_FILE_SIZE = 500 * 1024 * 1024;
const MAX_TOTAL_SIZE = 500 * 1024 * 1024;

type QueueStatus = "waiting" | BatchPhase | "success" | "failed" | "cancelled";
type QueueItem = { id: string; source: File; operation: BatchOperation; status: QueueStatus; reason?: string; output?: File };
type Language = "zh" | "en";

const copy = {
  zh: {
    title: "批量隐私处理", subtitle: "按顺序逐张写入和复核；未通过核验的副本不会交付。", choose: "选择多张照片", folder: "选择文件夹", back: "返回单张编辑", privacy: "隐私清理", gps: "删除 GPS", start: "开始处理", stop: "处理完当前项后停止", retry: "重试失败项", clear: "清空队列", download: "下载", downloadZip: "下载 ZIP（全部成功项）", packingZip: "正在打包 ZIP", waiting: "等待中", reading: "读取中", writing: "写入中", verifying: "核验中", success: "已通过核验", failed: "失败", cancelled: "已停止", limits: "最多 100 个文件、总计 500 MB；单张最大 500 MB。", selectionError: "无法加入队列：仅支持当前支持的图片格式，且需符合文件数和容量上限。", skippedFiles: (count: number) => `已跳过 ${count} 个不支持或超出上限的文件；其余已加入队列。`, noFiles: "请选择至少一张可处理的照片。", progress: "进度", complete: "处理完成", noDelivery: "失败或未核验的文件不会提供下载。ZIP 仅包含已验证副本。", folderHint: "文件夹选择依赖 Chromium 浏览器；也可以直接多选文件。",
  },
  en: {
    title: "Batch privacy processing", subtitle: "Files are written and verified one at a time. Unverified copies are never delivered.", choose: "Choose photos", folder: "Choose folder", back: "Back to single editor", privacy: "Privacy cleanup", gps: "Remove GPS", start: "Start processing", stop: "Stop after current item", retry: "Retry failed", clear: "Clear queue", download: "Download", downloadZip: "Download ZIP (all verified copies)", packingZip: "Packing ZIP", waiting: "Waiting", reading: "Reading", writing: "Writing", verifying: "Verifying", success: "Verified", failed: "Failed", cancelled: "Stopped", limits: "Up to 100 files / 500 MB total; 500 MB per file.", selectionError: "Could not add files: use a supported image format within the file-count and size limits.", skippedFiles: (count: number) => `Skipped ${count} unsupported or over-limit file${count === 1 ? "" : "s"}; the rest joined the queue.`, noFiles: "Choose at least one processable photo.", progress: "Progress", complete: "Processing complete", noDelivery: "Failed or unverified files never receive a download. The ZIP contains verified copies only.", folderHint: "Folder selection depends on Chromium browsers; multi-file selection is always available.",
  },
} as const;

const formatBytes = (size: number) => size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;

export function BatchWorkspace({ language, onClose }: { language: Language; onClose: () => void }) {
  const t = copy[language];
  const inputRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const stopRef = useRef(false);
  const [operation, setOperation] = useState<BatchOperation>("privacy");
  const [items, setItems] = useState<QueueItem[]>([]);
  const [running, setRunning] = useState(false);
  const [selectionError, setSelectionError] = useState("");
  const [selectionNotice, setSelectionNotice] = useState("");
  const [zipBusy, setZipBusy] = useState(false);
  const [zipProgress, setZipProgress] = useState<[number, number] | null>(null);
  const [zipError, setZipError] = useState("");

  const counts = useMemo(() => ({
    completed: items.filter((item) => item.status === "success" || item.status === "failed").length,
    success: items.filter((item) => item.status === "success").length,
    failed: items.filter((item) => item.status === "failed").length,
    totalSize: items.reduce((sum, item) => sum + item.source.size, 0),
  }), [items]);

  const addFiles = (files: FileList | null) => {
    if (!files || running) return;
    setSelectionError(""); setSelectionNotice("");
    const candidates = Array.from(files);
    const existingSize = items.reduce((sum, item) => sum + item.source.size, 0);
    const accepted: QueueItem[] = [];
    let totalSize = existingSize;
    for (const source of candidates) {
      if (!imageFormatFromFile(source) || source.size > MAX_FILE_SIZE || items.length + accepted.length >= MAX_FILES || totalSize + source.size > MAX_TOTAL_SIZE) continue;
      totalSize += source.size;
      accepted.push({ id: `${source.name}-${source.size}-${source.lastModified}-${crypto.randomUUID()}`, source, operation, status: "waiting" });
    }
    const skipped = candidates.length - accepted.length;
    if (skipped) {
      if (accepted.length) setSelectionNotice(t.skippedFiles(skipped));
      else setSelectionError(t.selectionError);
    }
    if (accepted.length) setItems((current) => [...current, ...accepted]);
  };

  const onFiles = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(event.target.files);
    event.target.value = "";
  };

  const update = (id: string, patch: Partial<QueueItem>) => setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));

  const run = async (onlyFailed = false) => {
    const queue = items.filter((item) => onlyFailed ? item.status === "failed" : item.status === "waiting" || item.status === "cancelled");
    if (!queue.length) return;
    stopRef.current = false;
    setRunning(true);
    for (const item of queue) {
      if (stopRef.current) {
        update(item.id, { status: "cancelled", reason: undefined });
        continue;
      }
      update(item.id, { status: "reading", reason: undefined, output: undefined });
      const result = await processBatchFile(item.source, item.operation, (phase) => update(item.id, { status: phase }));
      if (result.success) update(item.id, { status: "success", output: result.file });
      else update(item.id, { status: "failed", reason: result.reason });
    }
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
  const folderProps = { webkitdirectory: "", directory: "" } as unknown as Record<string, string>;

  return <section className="batch-shell" aria-busy={running}>
    <div className="batch-heading">
      <div><span className="section-icon"><ShieldCheck size={18} /></span><h2>{t.title}</h2><p>{t.subtitle}</p></div>
      <button type="button" className="text-button" onClick={onClose} disabled={running}><X size={16} />{t.back}</button>
    </div>
    <div className="batch-controls">
      <div className="batch-operation" role="radiogroup" aria-label={t.title}>
        <button type="button" role="radio" aria-checked={operation === "privacy"} className={operation === "privacy" ? "active" : ""} disabled={running} onClick={() => setOperation("privacy")}>{t.privacy}</button>
        <button type="button" role="radio" aria-checked={operation === "removeGps"} className={operation === "removeGps" ? "active" : ""} disabled={running} onClick={() => setOperation("removeGps")}>{t.gps}</button>
      </div>
      <div className="batch-actions">
        <button type="button" className="secondary-button" disabled={running} onClick={() => inputRef.current?.click()}><ImagePlus size={16} />{t.choose}</button>
        <button type="button" className="secondary-button" disabled={running} onClick={() => folderRef.current?.click()}><FolderOpen size={16} />{t.folder}</button>
      </div>
      <input ref={inputRef} className="sr-only" type="file" multiple accept=".jpg,.jpeg,.png,.webp,.tif,.tiff,.heic,.heif,image/jpeg,image/png,image/webp,image/tiff,image/heic,image/heif" onChange={onFiles} />
      <input ref={folderRef} className="sr-only" type="file" multiple {...folderProps} accept=".jpg,.jpeg,.png,.webp,.tif,.tiff,.heic,.heif,image/jpeg,image/png,image/webp,image/tiff,image/heic,image/heif" onChange={onFiles} />
    </div>
    <p className="batch-hint">{t.limits} {t.folderHint}</p>
    {selectionError && <p className="batch-error" role="alert"><AlertTriangle size={16} />{selectionError}</p>}
    {selectionNotice && <p className="batch-notice" role="status"><Check size={16} />{selectionNotice}</p>}
    {zipError && <p className="batch-error" role="alert"><AlertTriangle size={16} />{zipError}</p>}
    <div className="batch-summary"><strong>{t.progress}</strong><span>{counts.completed} / {items.length}</span><span>{formatBytes(counts.totalSize)}</span><span>{counts.success} {t.success} · {counts.failed} {t.failed}</span></div>
    <div className="batch-list" aria-live="polite">
      {items.length === 0 ? <div className="batch-empty"><FileImage size={24} />{t.noFiles}</div> : items.map((item) => <article className={`batch-row status-${item.status}`} key={item.id}>
        <FileImage size={18} /><div><strong>{item.source.name}</strong><small>{formatBytes(item.source.size)} · {statusLabel(item.status)}{item.reason ? ` · ${item.reason}` : ""}</small></div>
        {item.status === "success" && item.output ? <button type="button" className="text-button" onClick={() => { if (item.output) download(item.output, item.output.name); }}><Download size={16} />{t.download}</button> : item.status === "reading" || item.status === "writing" || item.status === "verifying" ? <RefreshCw className="spin" size={17} /> : item.status === "failed" ? <AlertTriangle size={17} /> : item.status === "success" ? <Check size={17} /> : null}
      </article>)}</div>
    <div className="batch-footer">
      <p>{t.noDelivery}</p>
      <div>
        {counts.success > 0 && <button type="button" className="secondary-button" disabled={running || zipBusy} onClick={() => void downloadZip()}><Download className={zipBusy ? "spin" : undefined} size={16} />{zipBusy && zipProgress ? `${t.packingZip} ${zipProgress[0]} / ${zipProgress[1]}` : t.downloadZip}</button>}
        {counts.failed > 0 && !running && <button type="button" className="secondary-button" onClick={() => void run(true)}><RefreshCw size={16} />{t.retry}</button>}
        {items.length > 0 && !running && <button type="button" className="text-button" onClick={() => setItems([])}>{t.clear}</button>}
        {running ? <button type="button" className="secondary-button" onClick={() => { stopRef.current = true; }}>{t.stop}</button> : <button type="button" className="primary-button" disabled={!items.some((item) => item.status === "waiting" || item.status === "cancelled")} onClick={() => void run()}><Play size={16} />{t.start}</button>}
      </div>
    </div>
  </section>;
}
