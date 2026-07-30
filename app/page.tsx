"use client";

import {
  AlertTriangle,
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Download,
  FileImage,
  Fingerprint,
  ImagePlus,
  LockKeyhole,
  Map,
  MapPin,
  Navigation,
  PenLine,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";

const MapPicker = dynamic(() => import("./map-picker"), {
  ssr: false,
  loading: () => <div className="map-loading">正在准备地图…</div>,
});

type ExifTag = {
  value?: unknown;
  description?: string | number;
};

type ExifTags = Record<string, ExifTag>;

type EditableData = {
  dateTime: string;
  artist: string;
  copyright: string;
  description: string;
  latitude: string;
  longitude: string;
  altitude: string;
  direction: string;
};

type GpsMode = "keep" | "edit" | "remove";

type DiffItem = {
  label: string;
  before: string;
  after: string;
  kind?: "danger";
};

type FileInfo = {
  name: string;
  size: number;
  width: number;
  height: number;
};

const EMPTY_DATA: EditableData = {
  dateTime: "",
  artist: "",
  copyright: "",
  description: "",
  latitude: "",
  longitude: "",
  altitude: "",
  direction: "",
};

const MAX_FILE_SIZE = 100 * 1024 * 1024;

const valueOf = (tag?: ExifTag): string => {
  if (!tag) return "";
  const value = tag.description ?? tag.value;
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
};

const firstTag = (tags: ExifTags, names: string[]): string => {
  for (const name of names) {
    const value = valueOf(tags[name]);
    if (value && value !== "undefined") return value;
  }
  return "";
};

const parseCoordinate = (value: string): string => {
  const match = value.replace(/[°'"]/g, " ").match(/-?\d+(?:\.\d+)?/);
  return match ? match[0] : "";
};

const gpsCoordinate = (tags: ExifTags, axis: "Latitude" | "Longitude"): string => {
  const coordinate = Number(parseCoordinate(firstTag(tags, [`GPS${axis}`])));
  if (!Number.isFinite(coordinate)) return "";
  const reference = firstTag(tags, [`GPS${axis}Ref`]);
  const isNegative = axis === "Latitude" ? /south|^s$/i.test(reference) : /west|^w$/i.test(reference);
  return String(isNegative ? -Math.abs(coordinate) : Math.abs(coordinate));
};

const exifDateToInput = (value: string): string => {
  const match = value.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}` : "";
};

const inputDateToExif = (value: string): string => {
  if (!value) return "";
  const [date, time] = value.split("T");
  return `${date.replaceAll("-", ":")} ${time}:00`;
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const display = (value: string, fallback = "未设置"): string => value.trim() || fallback;

const getImageDimensions = (url: string): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("无法读取图片尺寸"));
    image.src = url;
  });

const scanPayload = (buffer: ArrayBuffer): Uint8Array => {
  const bytes = new Uint8Array(buffer);
  for (let index = 2; index < bytes.length - 4; ) {
    if (bytes[index] !== 0xff) {
      index += 1;
      continue;
    }
    const marker = bytes[index + 1];
    if (marker === 0xda) return bytes.slice(index);
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      index += 2;
      continue;
    }
    const length = (bytes[index + 2] << 8) | bytes[index + 3];
    if (length < 2) break;
    index += 2 + length;
  }
  return bytes;
};

const digest = async (bytes: Uint8Array): Promise<string> => {
  const safeBytes = new Uint8Array(bytes);
  const result = await crypto.subtle.digest("SHA-256", safeBytes.buffer);
  return Array.from(new Uint8Array(result))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [tags, setTags] = useState<ExifTags>({});
  const [original, setOriginal] = useState<EditableData>(EMPTY_DATA);
  const [form, setForm] = useState<EditableData>(EMPTY_DATA);
  const [gpsMode, setGpsMode] = useState<GpsMode>("keep");
  const [mapLoaded, setMapLoaded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [verified, setVerified] = useState(false);
  const [pixelVerified, setPixelVerified] = useState(false);
  const [c2paDetected, setC2paDetected] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const assign = (key: keyof EditableData, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setVerified(false);
    setStatus("");
  };

  const readFile = async (selected: File) => {
    setError("");
    setStatus("");
    setVerified(false);
    setPixelVerified(false);
    setReviewOpen(false);

    if (!["image/jpeg", "image/jpg"].includes(selected.type) && !/\.jpe?g$/i.test(selected.name)) {
      setError("首版仅支持 JPEG 图片（.jpg 或 .jpeg）。");
      return;
    }
    if (selected.size > MAX_FILE_SIZE) {
      setError("图片超过 100 MB。请先选择体积更小的 JPEG 文件。");
      return;
    }

    setBusy(true);
    try {
      const { default: ExifReader } = await import("exifreader");
      const loaded = (await ExifReader.load(selected, {
        includeUnknown: true,
      })) as ExifTags;
      const nextUrl = URL.createObjectURL(selected);
      const dimensions = await getImageDimensions(nextUrl);

      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(nextUrl);
      setFile(selected);
      setFileInfo({
        name: selected.name,
        size: selected.size,
        ...dimensions,
      });
      setTags(loaded);

      const latitude = gpsCoordinate(loaded, "Latitude");
      const longitude = gpsCoordinate(loaded, "Longitude");
      const nextData: EditableData = {
        dateTime: exifDateToInput(
          firstTag(loaded, ["DateTimeOriginal", "DateTimeDigitized", "DateTime"]),
        ),
        artist: firstTag(loaded, ["Artist", "Author", "XPAuthor"]),
        copyright: firstTag(loaded, ["Copyright"]),
        description: firstTag(loaded, ["ImageDescription", "Description", "Caption-Abstract"]),
        latitude,
        longitude,
        altitude: parseCoordinate(firstTag(loaded, ["GPSAltitude"])),
        direction: parseCoordinate(firstTag(loaded, ["GPSImgDirection"])),
      };
      setOriginal(nextData);
      setForm(nextData);
      setGpsMode(latitude && longitude ? "keep" : "edit");
      setMapLoaded(false);
      setC2paDetected(
        Object.keys(loaded).some((key) => /c2pa|jumbf|content.?credential/i.test(key)),
      );
    } catch (cause) {
      console.error(cause);
      setError("没有成功解析这张图片。文件可能已损坏，或包含暂不支持的元数据结构。");
    } finally {
      setBusy(false);
    }
  };

  const onInput = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (selected) void readFile(selected);
    event.target.value = "";
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const selected = event.dataTransfer.files?.[0];
    if (selected) void readFile(selected);
  };

  const reset = () => {
    setForm(original);
    setGpsMode(original.latitude && original.longitude ? "keep" : "edit");
    setVerified(false);
    setPixelVerified(false);
    setStatus("");
  };

  const hasValidCoordinates =
    Number.isFinite(Number(form.latitude)) &&
    Number.isFinite(Number(form.longitude)) &&
    Math.abs(Number(form.latitude)) <= 90 &&
    Math.abs(Number(form.longitude)) <= 180;

  const diffs = useMemo<DiffItem[]>(() => {
    const items: DiffItem[] = [];
    const push = (label: string, before: string, after: string) => {
      if (before !== after) items.push({ label, before: display(before), after: display(after) });
    };

    push("拍摄时间", original.dateTime, form.dateTime);
    push("作者", original.artist, form.artist);
    push("版权", original.copyright, form.copyright);
    push("图像描述", original.description, form.description);

    if (gpsMode === "remove" && (original.latitude || original.longitude || original.altitude)) {
      items.push({
        label: "GPS 位置",
        before:
          original.latitude && original.longitude
            ? `${original.latitude}, ${original.longitude}`
            : "存在 GPS 信息",
        after: "完整删除 GPS IFD",
        kind: "danger",
      });
    } else if (gpsMode === "edit") {
      push(
        "GPS 坐标",
        original.latitude && original.longitude
          ? `${original.latitude}, ${original.longitude}`
          : "",
        form.latitude && form.longitude ? `${form.latitude}, ${form.longitude}` : "",
      );
      push("海拔", original.altitude, form.altitude);
      push("拍摄方向", original.direction, form.direction);
    }
    return items;
  }, [form, gpsMode, original]);

  const openReview = () => {
    setError("");
    if (gpsMode === "edit" && !hasValidCoordinates) {
      setError("请输入有效的 WGS-84 经纬度：纬度范围 −90～90，经度范围 −180～180。");
      return;
    }
    if (!diffs.length) {
      setError("还没有需要写入的修改。");
      return;
    }
    setReviewOpen(true);
  };

  const exportFile = async () => {
    if (!file) return;
    setBusy(true);
    setError("");
    setStatus("正在本地写入元数据…");
    setVerified(false);
    setPixelVerified(false);

    try {
      const writeTags: Record<string, string | number> = {};
      if (form.dateTime !== original.dateTime) {
        writeTags.DateTimeOriginal = inputDateToExif(form.dateTime);
      }
      if (form.artist !== original.artist) writeTags.Artist = form.artist;
      if (form.copyright !== original.copyright) writeTags.Copyright = form.copyright;
      if (form.description !== original.description) writeTags.ImageDescription = form.description;

      if (gpsMode === "remove") {
        writeTags["GPS:All"] = "";
      } else if (gpsMode === "edit") {
        const latitude = Number(form.latitude);
        const longitude = Number(form.longitude);
        writeTags.GPSLatitude = Math.abs(latitude);
        writeTags.GPSLatitudeRef = latitude < 0 ? "S" : "N";
        writeTags.GPSLongitude = Math.abs(longitude);
        writeTags.GPSLongitudeRef = longitude < 0 ? "W" : "E";
        if (form.altitude !== original.altitude) {
          writeTags.GPSAltitude = form.altitude ? Number(form.altitude) : "";
        }
        if (form.direction !== original.direction) {
          writeTags.GPSImgDirection = form.direction ? Number(form.direction) : "";
          if (form.direction) writeTags.GPSImgDirectionRef = "T";
        }
      }

      const [{ writeMetadata }, { default: ExifReader }] = await Promise.all([
        import("@uswriting/exiftool"),
        import("exifreader"),
      ]);
      const result = await writeMetadata(file, writeTags);
      if (!result.success) throw new Error(result.error || "ExifTool 写入失败");

      const outputBuffer = result.data;
      const outputName = `${file.name.replace(/\.jpe?g$/i, "")}_edited.jpg`;
      const outputFile = new File([outputBuffer], outputName, { type: "image/jpeg" });

      setStatus("正在重新读取并核验导出文件…");
      const verifiedTags = (await ExifReader.load(outputFile, {
        includeUnknown: true,
      })) as ExifTags;

      const verifiedLat = gpsCoordinate(verifiedTags, "Latitude");
      const verifiedLng = gpsCoordinate(verifiedTags, "Longitude");
      const gpsOk =
        gpsMode === "remove"
          ? !Object.keys(verifiedTags).some((key) => /^GPS/i.test(key))
          : gpsMode === "edit"
            ? Math.abs(Number(verifiedLat) - Number(form.latitude)) < 0.000001 &&
              Math.abs(Number(verifiedLng) - Number(form.longitude)) < 0.000001
            : true;
      const editableFieldsOk =
        (form.dateTime === original.dateTime ||
          exifDateToInput(
            firstTag(verifiedTags, ["DateTimeOriginal", "DateTimeDigitized", "DateTime"]),
          ) === form.dateTime) &&
        (form.artist === original.artist ||
          firstTag(verifiedTags, ["Artist", "Author", "XPAuthor"]) === form.artist) &&
        (form.copyright === original.copyright ||
          firstTag(verifiedTags, ["Copyright"]) === form.copyright) &&
        (form.description === original.description ||
          firstTag(verifiedTags, ["ImageDescription", "Description", "Caption-Abstract"]) ===
            form.description);

      const [originalBuffer, nextBuffer] = await Promise.all([
        file.arrayBuffer(),
        outputFile.arrayBuffer(),
      ]);
      const [originalDigest, nextDigest] = await Promise.all([
        digest(scanPayload(originalBuffer)),
        digest(scanPayload(nextBuffer)),
      ]);
      const samePixels = originalDigest === nextDigest;

      setVerified(gpsOk && editableFieldsOk);
      setPixelVerified(samePixels);
      if (!gpsOk) throw new Error("写入后的 GPS 复核未通过，已阻止下载。");
      if (!editableFieldsOk) throw new Error("写入后的字段复核未通过，已阻止下载。");
      if (!samePixels) throw new Error("检测到 JPEG 压缩图像数据发生变化，已阻止下载。");

      const href = URL.createObjectURL(outputFile);
      const link = document.createElement("a");
      link.href = href;
      link.download = outputName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 2_000);
      setStatus(`已验证并导出 ${outputName}`);
      setReviewOpen(false);
    } catch (cause) {
      console.error(cause);
      setError(cause instanceof Error ? cause.message : "导出失败，请换一张 JPEG 后重试。");
      setStatus("");
      setReviewOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const hasFile = Boolean(file && fileInfo);
  const cameraRows = [
    ["相机", firstTag(tags, ["Make"]), firstTag(tags, ["Model"])],
    ["镜头", firstTag(tags, ["LensModel", "Lens"])],
    ["光圈", firstTag(tags, ["FNumber", "ApertureValue"])],
    ["快门", firstTag(tags, ["ExposureTime"])],
    ["ISO", firstTag(tags, ["ISOSpeedRatings", "PhotographicSensitivity"])],
    ["焦距", firstTag(tags, ["FocalLength"])],
  ];

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="影刻·EXIF 首页">
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          <span>影刻<em>·EXIF</em></span>
        </a>
        <div className="header-note">
          <LockKeyhole size={15} />
          图片只在你的浏览器中处理
        </div>
        <a className="about-link" href="#privacy">
          关于隐私
        </a>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow"><span /> PRIVATE · LOCAL · LOSSLESS</div>
        <h1>重写照片的时间、地点和描述</h1>
        <p>
          读取并编辑 JPEG 的 EXIF 信息，在地图上点选位置。
          <br />不上传原片，不改变画质，只导出新的副本。
        </p>
        <div className="hero-steps" aria-label="处理流程">
          <span><b>01</b>选择照片</span>
          <ArrowRight size={16} />
          <span><b>02</b>编辑信息</span>
          <ArrowRight size={16} />
          <span><b>03</b>核验导出</span>
        </div>
      </section>

      <section className="workspace" aria-label="EXIF 编辑工作区">
        {!hasFile ? (
          <div
            className={`dropzone ${dragging ? "is-dragging" : ""}`}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".jpg,.jpeg,image/jpeg"
              onChange={onInput}
              aria-label="选择 JPEG 照片"
            />
            <div className="drop-visual" aria-hidden="true">
              <div className="photo-sheet sheet-back" />
              <div className="photo-sheet sheet-front">
                <span className="mini-sun" />
                <span className="mini-hill" />
              </div>
              <span className="pin-dot"><MapPin size={18} /></span>
            </div>
            <p className="drop-kicker">从这里开始</p>
            <h2>把一张照片拖到这里</h2>
            <p>或从设备中选择一张 JPEG 图片</p>
            <button className="primary-button select-button" onClick={() => inputRef.current?.click()} disabled={busy}>
              {busy ? <RefreshCw className="spin" size={18} /> : <ImagePlus size={18} />}
              {busy ? "正在读取…" : "选择照片"}
            </button>
            <div className="drop-meta">
              <span>JPG / JPEG</span>
              <span>单张最大 100 MB</span>
              <span><ShieldCheck size={14} />不会上传</span>
            </div>
          </div>
        ) : (
          <div className="editor-shell">
            <div className="editor-topbar">
              <div className="file-title">
                <FileImage size={19} />
                <div>
                  <strong>{fileInfo?.name}</strong>
                  <span>{fileInfo?.width} × {fileInfo?.height} · {formatBytes(fileInfo?.size ?? 0)}</span>
                </div>
              </div>
              <button className="text-button" onClick={() => inputRef.current?.click()}>
                <Upload size={16} />更换照片
              </button>
              <input ref={inputRef} className="sr-only" type="file" accept=".jpg,.jpeg,image/jpeg" onChange={onInput} />
            </div>

            {c2paDetected && (
              <div className="warning-banner">
                <Fingerprint size={18} />
                检测到 Content Credentials / C2PA 信息；修改元数据可能影响其验证结果。
              </div>
            )}

            <div className="editor-grid">
              <aside className="preview-column">
                <div className="image-frame">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt="待编辑照片预览" />
                </div>
                <div className="readonly-card">
                  <div className="card-title">
                    <Camera size={17} />
                    <span>拍摄参数</span>
                    <small>只读</small>
                  </div>
                  <dl>
                    {cameraRows.map(([label, ...values]) => {
                      const value = values.filter(Boolean).join(" ");
                      return value ? (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ) : null;
                    })}
                  </dl>
                  {!cameraRows.some(([, ...values]) => values.some(Boolean)) && (
                    <p className="empty-note">这张照片没有可显示的相机参数。</p>
                  )}
                  <button className="details-toggle" onClick={() => setDetailsOpen((open) => !open)}>
                    查看全部已读取标签
                    <ChevronDown size={15} className={detailsOpen ? "rotate" : ""} />
                  </button>
                  {detailsOpen && (
                    <div className="tag-list">
                      {Object.entries(tags).slice(0, 80).map(([key, tag]) => (
                        <div key={key}><span>{key}</span><b>{valueOf(tag) || "—"}</b></div>
                      ))}
                    </div>
                  )}
                </div>
              </aside>

              <div className="form-column">
                <section className="form-section">
                  <div className="section-heading">
                    <span className="section-icon"><MapPin size={18} /></span>
                    <div>
                      <h2>位置</h2>
                      <p>写入 EXIF 的坐标始终使用 WGS-84</p>
                    </div>
                  </div>
                  <div className="segmented" role="group" aria-label="GPS 处理方式">
                    {([
                      ["keep", "保留原位置"],
                      ["edit", original.latitude ? "修改位置" : "添加位置"],
                      ["remove", "删除位置"],
                    ] as const).map(([mode, label]) => (
                      <button
                        key={mode}
                        className={gpsMode === mode ? "active" : ""}
                        onClick={() => {
                          setGpsMode(mode);
                          setVerified(false);
                        }}
                      >
                        {mode === "remove" && <Trash2 size={14} />}
                        {label}
                      </button>
                    ))}
                  </div>

                  {gpsMode === "remove" ? (
                    <div className="danger-panel">
                      <AlertTriangle size={19} />
                      <div>
                        <strong>将完整删除 GPS 信息</strong>
                        <p>经纬度、海拔、方向、GPS 时间等整个 GPS IFD 都会被清除。</p>
                      </div>
                    </div>
                  ) : gpsMode === "keep" ? (
                    <div className="keep-panel">
                      <Navigation size={18} />
                      <div>
                        <span>原始坐标</span>
                        <strong>
                          {original.latitude && original.longitude
                            ? `${original.latitude}, ${original.longitude}`
                            : "照片中没有 GPS 信息"}
                        </strong>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="coordinate-grid">
                        <label>
                          <span>纬度 <small>Latitude</small></span>
                          <input
                            inputMode="decimal"
                            value={form.latitude}
                            onChange={(event) => assign("latitude", event.target.value)}
                            placeholder="31.230416"
                          />
                        </label>
                        <label>
                          <span>经度 <small>Longitude</small></span>
                          <input
                            inputMode="decimal"
                            value={form.longitude}
                            onChange={(event) => assign("longitude", event.target.value)}
                            placeholder="121.473701"
                          />
                        </label>
                      </div>
                      <div className="coordinate-hint">
                        <CircleHelp size={14} />
                        南纬和西经请输入负数；例如悉尼约为 −33.8688, 151.2093
                      </div>

                      {!mapLoaded ? (
                        <button className="map-consent" onClick={() => setMapLoaded(true)}>
                          <span><Map size={20} /></span>
                          <div>
                            <strong>在地图上点选位置</strong>
                            <small>点击后才会加载 OpenStreetMap 图块，图块服务会获知当前视野附近区域</small>
                          </div>
                          <ArrowRight size={18} />
                        </button>
                      ) : (
                        <MapPicker
                          latitude={Number(form.latitude)}
                          longitude={Number(form.longitude)}
                          onChange={(latitude, longitude) => {
                            setForm((current) => ({
                              ...current,
                              latitude: latitude.toFixed(6),
                              longitude: longitude.toFixed(6),
                            }));
                            setVerified(false);
                          }}
                        />
                      )}

                      <div className="coordinate-grid compact">
                        <label>
                          <span>海拔 <small>米，可选</small></span>
                          <input
                            inputMode="decimal"
                            value={form.altitude}
                            onChange={(event) => assign("altitude", event.target.value)}
                            placeholder="例如 12.5"
                          />
                        </label>
                        <label>
                          <span>拍摄方向 <small>0–359°，可选</small></span>
                          <input
                            inputMode="decimal"
                            value={form.direction}
                            onChange={(event) => assign("direction", event.target.value)}
                            placeholder="例如 90"
                          />
                        </label>
                      </div>
                    </>
                  )}
                </section>

                <section className="form-section">
                  <div className="section-heading">
                    <span className="section-icon"><Clock3 size={18} /></span>
                    <div>
                      <h2>时间与文字</h2>
                      <p>仅修改常用、兼容性较好的字段</p>
                    </div>
                  </div>
                  <div className="field-stack">
                    <label>
                      <span>拍摄时间</span>
                      <input
                        type="datetime-local"
                        value={form.dateTime}
                        onChange={(event) => assign("dateTime", event.target.value)}
                      />
                    </label>
                    <div className="two-fields">
                      <label>
                        <span>作者</span>
                        <input value={form.artist} onChange={(event) => assign("artist", event.target.value)} placeholder="摄影者姓名" />
                      </label>
                      <label>
                        <span>版权</span>
                        <input value={form.copyright} onChange={(event) => assign("copyright", event.target.value)} placeholder="© 2026 姓名" />
                      </label>
                    </div>
                    <label>
                      <span>图像描述</span>
                      <textarea
                        rows={3}
                        maxLength={1000}
                        value={form.description}
                        onChange={(event) => assign("description", event.target.value)}
                        placeholder="为这张照片写下一段说明…"
                      />
                      <small className="counter">{form.description.length} / 1000</small>
                    </label>
                  </div>
                </section>
              </div>
            </div>

            <div className="editor-footer">
              <button className="secondary-button" onClick={reset} disabled={!diffs.length || busy}>
                <RotateCcw size={16} />撤销全部修改
              </button>
              <div className="change-count">
                {diffs.length ? <><span>{diffs.length}</span> 项待写入</> : "尚无修改"}
              </div>
              <button className="primary-button export-button" onClick={openReview} disabled={busy || !diffs.length}>
                <Sparkles size={17} />核对并导出副本
              </button>
            </div>
          </div>
        )}

        {error && <div className="message error-message"><AlertTriangle size={17} />{error}</div>}
        {status && (
          <div className={`message ${verified && pixelVerified ? "success-message" : "status-message"}`}>
            {verified && pixelVerified ? <Check size={17} /> : <RefreshCw className={busy ? "spin" : ""} size={17} />}
            <span>{status}</span>
            {verified && pixelVerified && <small>GPS 已复核 · 压缩图像数据未改变</small>}
          </div>
        )}
      </section>

      <section className="trust-section" id="privacy">
        <div className="trust-intro">
          <span className="eyebrow"><span /> 你的照片，属于你</span>
          <h2>我们不会看你的照片</h2>
          <p>读取、修改和验证全部在当前浏览器标签页内完成。只有你主动打开地图时，地图图块才会联网加载。</p>
        </div>
        <div className="trust-grid">
          <article><LockKeyhole size={22} /><strong>本地处理</strong><p>照片不会发送到服务器，也不会被保存。</p></article>
          <article><PenLine size={22} /><strong>无损写入</strong><p>只改写元数据段，不使用 Canvas 重压缩图片。</p></article>
          <article><Download size={22} /><strong>导出副本</strong><p>默认生成带有 _edited 后缀的新文件，不覆盖原片。</p></article>
          <article><ShieldCheck size={22} /><strong>双重验证</strong><p>导出前重新读取 EXIF，并比对 JPEG 压缩数据指纹。</p></article>
        </div>
      </section>

      <footer>
        <div className="brand footer-brand">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span>影刻<em>·EXIF</em></span>
        </div>
        <p>照片只在浏览器本地处理，默认导出新的副本。</p>
        <p className="footer-credit">
          <span>© 2026 E.O创作</span>
          <span aria-hidden="true">·</span>
          <a href="mailto:arthurolan99@gmail.com">arthurolan99@gmail.com</a>
        </p>
      </footer>

      {reviewOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !busy) setReviewOpen(false);
        }}>
          <section className="review-modal" role="dialog" aria-modal="true" aria-labelledby="review-title">
            <button className="modal-close" aria-label="关闭" onClick={() => setReviewOpen(false)} disabled={busy}>
              <X size={20} />
            </button>
            <span className="modal-kicker">导出前确认</span>
            <h2 id="review-title">这些信息将被写入副本</h2>
            <p className="modal-copy">原片不会被覆盖。写入后会重新读取 EXIF，并确认 JPEG 压缩图像数据保持不变。</p>
            <div className="diff-list">
              {diffs.map((diff) => (
                <div className={`diff-row ${diff.kind === "danger" ? "danger-diff" : ""}`} key={diff.label}>
                  <strong>{diff.label}</strong>
                  <span>{diff.before}</span>
                  <ArrowRight size={15} />
                  <b>{diff.after}</b>
                </div>
              ))}
            </div>
            <div className="output-name">
              <FileImage size={18} />
              <span>输出文件</span>
              <strong>{file?.name.replace(/\.jpe?g$/i, "")}_edited.jpg</strong>
            </div>
            <button className="primary-button modal-action" onClick={() => void exportFile()} disabled={busy}>
              {busy ? <RefreshCw className="spin" size={18} /> : <Download size={18} />}
              {busy ? "正在写入并验证…" : "确认写入并下载"}
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
