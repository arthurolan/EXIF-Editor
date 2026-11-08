"use client";

import {
  AlertTriangle,
  ArrowRight,
  Camera,
  Check,
  CircleHelp,
  Clock3,
  Download,
  FileImage,
  Fingerprint,
  ImagePlus,
  ListChecks,
  LockKeyhole,
  Map,
  MapPin,
  Navigation,
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
import { outputNameFor } from "./export-delivery.mjs";
import { CoordinateField } from "./coordinate-field";
import { coordinatePreview, parseCoordinateInput } from "./coordinate-input";
import { batchGpsEditsAreVerified, batchGpsWriteTags, parseBatchGpsEdits } from "./batch-processor";
import { BatchWorkspace } from "./batch-workspace";
import {
  imageDataDigest,
  imageFormatFromFile,
  fileForMetadataWrite,
  formatSafetyFromBuffer,
  type ImageFormatInfo,
} from "./metadata/formats";
import {
  ADVANCED_DELETE_TAGS,
  AdvancedDeleteTag,
  CLEANUP_PRESETS,
  CleanupPreset,
  MetadataField,
  normalizeExifToolFields,
} from "./metadata/schema";
import {
  expandCleanupTargets,
  gpsDeletionTags,
  isGpsLocationMetadataField,
  privacySerialDeletionTagsForPreset,
  remainingDeletionTargets,
  remainingPrivacySerialFields,
} from "./metadata/clean";
import {
  SemanticFieldKey,
  semanticConflicts,
  semanticValueFromFields,
  semanticValueMatches,
  semanticWriteTags,
} from "./metadata/semantic";

import { numericFieldMatches, storedNumericValue } from "./metadata/numeric";
import { writeMetadataInStages } from "./metadata/write-stages";

const MapPicker = dynamic(() => import("./map-picker"), {
  ssr: false,
});

type Language = "zh" | "en";

const COPY = {
  zh: {
    home: "影刻·照片元数据首页",
    localHeader: "图片只在你的浏览器中处理",
    privacyLink: "关于隐私",
    versionBadge: "V2.1",
    heroTitle: "照片元数据工作台",
    heroCopy1: "读取、编辑和清理 JPEG、PNG、WebP，以及实验性 TIFF、HEIC/HEIF 的 EXIF、XMP 与 IPTC 信息。",
    heroCopy2: "不上传原片，不改变画质，只导出新的副本。",
    flowLabel: "处理流程",
    chooseStep: "选择照片",
    editStep: "编辑信息",
    verifyStep: "核验导出",
    workspaceLabel: "照片元数据工作区",
    chooseAria: "选择 JPEG、PNG、WebP、TIFF 或 HEIC/HEIF 图片",
    startHere: "从这里开始",
    dropTitle: "把一张照片拖到这里",
    dropCopy: "或从设备中选择 JPEG、PNG、WebP、TIFF 或 HEIC/HEIF 图片",
    reading: "正在读取…",
    choosePhoto: "选择照片",
    maxSize: "单张最大 500 MB",
    neverUpload: "不会上传",
    changePhoto: "更换照片",
    c2paWarning: "检测到 Content Credentials / C2PA 信息；修改元数据可能影响其验证结果。",
    previewAlt: "待编辑照片预览",
    cameraSettings: "拍摄参数",
    editable: "可编辑",
    cameraSettingsHint: "可为胶片扫描或缺失元数据的照片手动补充",
    make: "品牌",
    model: "型号",
    lensModel: "镜头型号",
    makePlaceholder: "例如 Leica",
    modelPlaceholder: "例如 M6",
    lensPlaceholder: "例如 Summicron-M 35mm f/2",
    aperturePlaceholder: "例如 2.8",
    shutterPlaceholder: "例如 1/125",
    isoPlaceholder: "例如 400",
    focalLengthPlaceholder: "例如 35",
    invalidCameraSettings: "请检查拍摄参数：光圈、快门速度和焦距须为正数，ISO 须为正整数；不需要的字段可以留空。",
    location: "位置",
    wgsHint: "写入 EXIF 的坐标始终使用 WGS-84",
    gpsModes: "GPS 处理方式",
    keepLocation: "保留原位置",
    editLocation: "修改位置",
    addLocation: "添加位置",
    removeLocation: "删除位置",
    removeGpsTitle: "将完整删除 GPS 信息",
    removeGpsCopy: "经纬度、海拔、方向、GPS 时间等整个 GPS IFD 都会被清除。",
    originalCoordinates: "原始坐标",
    noGps: "照片中没有 GPS 信息",
    latitude: "纬度",
    longitude: "经度",
    coordinateHint: "支持十进制、度分秒、度分及中文方向。南纬／西经可用负数或 S／W；例如 31°13′49.5″ N。请核对下方的十进制解析结果。",
    pickOnMap: "在地图上点选位置",
    mapConsent: "点击后才会从 OpenFreeMap 加载地图，地图服务会获知当前视野附近区域",
    altitude: "海拔",
    metresOptional: "米，可选",
    exampleAltitude: "例如 12.5",
    direction: "拍摄方向",
    degreesOptional: "0–359°，可选",
    exampleDirection: "例如 90",
    timeAndText: "时间与文字",
    commonFields: "仅修改常用、兼容性较好的字段",
    dateTaken: "拍摄时间",
    title: "标题",
    titlePlaceholder: "例如 春日街角",
    artist: "作者",
    artistPlaceholder: "摄影者姓名",
    copyright: "版权",
    copyrightPlaceholder: "© 2026 姓名",
    keywords: "关键词",
    keywordsPlaceholder: "旅行, 胶片, 上海",
    city: "城市",
    cityPlaceholder: "例如 上海",
    country: "国家/地区",
    countryPlaceholder: "例如 中国",
    description: "图像描述",
    descriptionPlaceholder: "为这张照片写下一段说明…",
    syncedFields: "兼容同步写入 EXIF / XMP / IPTC 对应字段",
    conflictCheck: "冲突检查",
    conflictHint: "检测 EXIF、XMP、IPTC 中语义相同但值不一致的字段。",
    noConflicts: "未检测到常用语义字段冲突",
    useThisValue: "采用此值",
    valueApplied: "已采用",
    conflictSync: "冲突同步",
    allTagsBrowser: "全部标签浏览器",
    allTagsHint: "按元数据组查看，MakerNotes 默认只读。",
    detectedGroups: "检测到的元数据组",
    cleanupTitle: "隐私清理",
    cleanupHint: "预设会作为删除指令写入副本，原片仍不会被覆盖。",
    cleanupNone: "不清理",
    cleanupPrivacy: "隐私清理",
    cleanupAppearance: "保留视觉外观",
    cleanupFull: "彻底清空",
    cleanupPrivacyCopy: "删除 GPS、序列号、缩略图和处理软件痕迹",
    cleanupAppearanceCopy: "删除大部分元数据，但保留 ICC 色彩配置",
    cleanupFullCopy: "尽可能删除全部元数据，可能影响颜色、方向和认证",
    cleanupDiff: "清理预设",
    groupDeleteTitle: "按组删除",
    groupDeleteHint: "可单独移除指定元数据组，并可与清理预设组合使用。",
    groupDeleteEXIF: "删除 EXIF",
    groupDeleteGPS: "删除 GPS",
    groupDeleteXMP: "删除 XMP",
    groupDeleteIPTC: "删除 IPTC",
    groupDeleteMakerNotes: "删除 MakerNotes",
    groupDeleteICC: "删除 ICC 色彩配置",
    groupDeletePhotoshop: "删除 Photoshop 数据",
    groupDeleteThumbnail: "删除缩略图",
    groupDeletePreview: "删除预览图",
    groupDeleteC2PA: "删除 Content Credentials",
    groupDeleteDiff: "单独删除",
    undoAll: "撤销全部修改",
    changesPending: "项待写入",
    noChanges: "尚无修改",
    changePreview: "修改摘要",
    changePreviewHint: "选择导出前，可先核对本次会写入副本的字段。",
    noChangePreview: "改动会实时出现在这里。",
    reviewExport: "核对并导出副本",
    verificationNote: "GPS 已复核 · 压缩图像数据未改变",
    privacyCopy: "仅在当前浏览器本地处理，不上传原片；写入后会复核字段与图像编码数据，并导出新副本。",
    footerCopy: "本地处理 · 无损写入 · 导出副本",
    close: "关闭",
    reviewKicker: "导出前确认",
    reviewTitle: "这些信息将被写入副本",
    reviewCopy: "原片不会被覆盖。写入后会重新读取元数据，并确认图像编码数据保持不变。",
    reviewCopyStructural: "原片不会被覆盖。写入后会重新读取元数据，并复核图像容器结构；HEIC/HEIF 无法进行像素级哈希比对。",
    outputFile: "输出文件",
    writing: "正在写入并验证…",
    confirmDownload: "确认写入并验证",
    readyKicker: "已完成验证",
    readyTitle: "副本已准备好",
    readyCopy: "点击下方按钮打开系统共享菜单，然后选择“存储到文件”、照片或其他应用。",
    shareAndSave: "共享 / 存储到文件",
    directDownload: "直接下载（备用）",
    directDownloadHint: "如果共享菜单不可用，可尝试直接下载。文件链接会一直保留到你关闭或重新导出。",
    readyToSave: "已验证，等待你选择保存位置",
    shareFailed: "无法打开系统共享菜单，请使用“直接下载（备用）”。",
    downloadStarted: "已交给浏览器下载",
    unset: "未设置",
    camera: "相机",
    lens: "镜头",
    aperture: "光圈",
    shutter: "快门",
    focalLength: "焦距",
    gpsLocation: "GPS 位置",
    gpsExists: "存在 GPS 信息",
    gpsRemoved: "完整删除 GPS IFD",
    gpsCoordinates: "GPS 坐标",
    jpegOnly: "目前支持 JPEG、PNG、WebP，以及实验性 TIFF、HEIC / HEIF 图片。",
    experimentalFormatWarning: "实验性格式：TIFF 会复核图像数据区；HEIC/HEIF 仅复核容器与 mdat 数据存在，不能进行像素级哈希比对。浏览器预览及第三方兼容性可能有限。",
    heicRetentionWarning: "此 HEIC 含 HDR、景深或人像效果等辅助图像数据。相关 XMP 与 ICC 配置是图像项目的一部分，会保留以保护视觉效果；标准 XMP、GPS 和隐私字段仍可清理。",
    heicFullWipeUnsupported: "此 HEIC 的辅助图像 XMP 与 ICC 配置无法在不损害 HDR、景深或颜色的情况下安全删除，因此不支持彻底清空或删除 ICC 色彩配置。",
    verificationNoteStructural: "字段已复核 · 图像容器结构复核通过",
    fileTooLarge: "图片超过 500 MB。请先选择体积更小的文件。",
    parseFailed: "没有成功解析这张图片。文件可能已损坏，或包含暂不支持的元数据结构。",
    invalidCoordinates: "请检查位置输入：支持十进制、度分秒和度分；纬度须为 −90～90，经度为 −180～180，海拔须为数字，方向须在 0（含）至 360（不含）之间。",
    nothingToWrite: "还没有需要写入的修改。",
    writingMetadata: "正在本地写入元数据…",
    preparingWriter: "正在准备本地写入工具…",
    writeTimedOut: "本地写入超过五分钟，已安全终止。请关闭其他占用内存的页面后重试。",
    writerResourceFailed: "本地写入组件载入失败。请刷新页面后重试；若仍失败，请确认网站资源已完整更新。",
    writeFailed: "ExifTool 写入失败",
    verifyingFile: "正在重新读取并核验导出文件…",
    cleaningMetadata: "正在清理旧元数据…",
    metadataReadFailed: "无法重新读取处理后的元数据，已阻止下载。",
    cleanupThenWrite: "先清理所选的旧元数据，再写入本次修改的字段。新填写的字段会保留，并可能重新建立 EXIF、XMP 或 IPTC 数据组；未修改的旧字段不会自动补回。删除 Photoshop 组也会删除其中的 IPTC 信息。明确选择“删除位置”时仍会删除 GPS。",
    gpsVerificationFailed: "写入后的 GPS 复核未通过，已阻止下载。",
    fieldVerificationFailed: "写入后的字段复核未通过，已阻止下载。",
    cleanupVerificationFailed: "写入后的隐私清理复核未通过，已阻止下载。",
    pixelsChanged: "检测到图像编码数据发生变化，已阻止下载。",
    exported: "已验证并导出",
    exportFailed: "导出失败，请换一张图片后重试。",
  },
  en: {
    home: "Yingke photo metadata home",
    localHeader: "Your image stays in your browser",
    privacyLink: "Privacy",
    versionBadge: "V2.1",
    heroTitle: "Photo Metadata Workspace",
    heroCopy1: "Read, edit, and clean JPEG, PNG, WebP, and experimental TIFF and HEIC/HEIF EXIF, XMP, and IPTC metadata.",
    heroCopy2: "Your original never leaves the browser or gets recompressed.",
    flowLabel: "Workflow",
    chooseStep: "Choose photo",
    editStep: "Edit metadata",
    verifyStep: "Verify & export",
    workspaceLabel: "Photo metadata workspace",
    chooseAria: "Choose a JPEG, PNG, WebP, TIFF, or HEIC/HEIF image",
    startHere: "START HERE",
    dropTitle: "Drop a photo here",
    dropCopy: "or choose a JPEG, PNG, WebP, TIFF, or HEIC/HEIF image from your device",
    reading: "Reading…",
    choosePhoto: "Choose photo",
    maxSize: "Up to 500 MB",
    neverUpload: "Never uploaded",
    changePhoto: "Change photo",
    c2paWarning: "Content Credentials / C2PA data detected. Editing metadata may affect verification.",
    previewAlt: "Photo preview",
    cameraSettings: "Camera settings",
    editable: "Editable",
    cameraSettingsHint: "Add settings manually for film scans or photos with missing metadata",
    make: "Make",
    model: "Model",
    lensModel: "Lens model",
    makePlaceholder: "e.g. Leica",
    modelPlaceholder: "e.g. M6",
    lensPlaceholder: "e.g. Summicron-M 35mm f/2",
    aperturePlaceholder: "e.g. 2.8",
    shutterPlaceholder: "e.g. 1/125",
    isoPlaceholder: "e.g. 400",
    focalLengthPlaceholder: "e.g. 35",
    invalidCameraSettings: "Check the camera settings: aperture, shutter speed, and focal length must be positive; ISO must be a positive integer. Leave unused fields blank.",
    location: "Location",
    wgsHint: "Coordinates written to EXIF always use WGS-84",
    gpsModes: "GPS editing mode",
    keepLocation: "Keep original",
    editLocation: "Edit location",
    addLocation: "Add location",
    removeLocation: "Remove location",
    removeGpsTitle: "All GPS data will be removed",
    removeGpsCopy: "The complete GPS IFD—including coordinates, altitude, direction, and GPS time—will be cleared.",
    originalCoordinates: "Original coordinates",
    noGps: "This photo has no GPS data",
    latitude: "Latitude",
    longitude: "Longitude",
    coordinateHint: "Use decimal degrees, DMS or degrees/minutes, e.g. 31°13′49.5″ N. South/west accept a minus sign or S/W. Check the parsed decimal values below each field.",
    pickOnMap: "Choose a location on the map",
    mapConsent: "OpenFreeMap loads only after this click, revealing the approximate map area to the map service.",
    altitude: "Altitude",
    metresOptional: "metres, optional",
    exampleAltitude: "e.g. 12.5",
    direction: "Direction",
    degreesOptional: "0–359°, optional",
    exampleDirection: "e.g. 90",
    timeAndText: "Time & text",
    commonFields: "Only common, widely compatible fields can be edited",
    dateTaken: "Date taken",
    title: "Title",
    titlePlaceholder: "e.g. Spring street corner",
    artist: "Artist",
    artistPlaceholder: "Photographer’s name",
    copyright: "Copyright",
    copyrightPlaceholder: "© 2026 Name",
    keywords: "Keywords",
    keywordsPlaceholder: "travel, film, Shanghai",
    city: "City",
    cityPlaceholder: "e.g. Shanghai",
    country: "Country / Region",
    countryPlaceholder: "e.g. China",
    description: "Image description",
    descriptionPlaceholder: "Write a note about this photo…",
    syncedFields: "Writes compatible EXIF / XMP / IPTC fields together",
    conflictCheck: "Conflict check",
    conflictHint: "Detects semantic mismatches across EXIF, XMP, and IPTC.",
    noConflicts: "No common semantic conflicts detected",
    useThisValue: "Use this value",
    valueApplied: "Applied",
    conflictSync: "Conflict sync",
    allTagsBrowser: "All tags browser",
    allTagsHint: "Browse by metadata group. MakerNotes stay read-only by default.",
    detectedGroups: "Detected metadata groups",
    cleanupTitle: "Privacy cleanup",
    cleanupHint: "Presets are written as deletion instructions to the copy. The original is still untouched.",
    cleanupNone: "No cleanup",
    cleanupPrivacy: "Privacy cleanup",
    cleanupAppearance: "Keep visual appearance",
    cleanupFull: "Full metadata wipe",
    cleanupPrivacyCopy: "Removes GPS, serial numbers, thumbnails, and processing software traces",
    cleanupAppearanceCopy: "Removes most metadata but keeps the ICC color profile",
    cleanupFullCopy: "Removes as much metadata as possible; may affect color, orientation, and credentials",
    cleanupDiff: "Cleanup preset",
    groupDeleteTitle: "Remove by group",
    groupDeleteHint: "Remove individual metadata groups. These can be combined with a cleanup preset.",
    groupDeleteEXIF: "Remove EXIF",
    groupDeleteGPS: "Remove GPS",
    groupDeleteXMP: "Remove XMP",
    groupDeleteIPTC: "Remove IPTC",
    groupDeleteMakerNotes: "Remove MakerNotes",
    groupDeleteICC: "Remove ICC profile",
    groupDeletePhotoshop: "Remove Photoshop data",
    groupDeleteThumbnail: "Remove thumbnail",
    groupDeletePreview: "Remove preview image",
    groupDeleteC2PA: "Remove Content Credentials",
    groupDeleteDiff: "Group removal",
    undoAll: "Undo all changes",
    changesPending: "changes pending",
    noChanges: "No changes yet",
    changePreview: "Change summary",
    changePreviewHint: "Review the fields that will be written to the copy before exporting.",
    noChangePreview: "Edits will appear here in real time.",
    reviewExport: "Review & export copy",
    verificationNote: "GPS verified · Compressed image data unchanged",
    privacyCopy: "Everything runs locally in this browser. The original is never uploaded; written fields and encoded image data are checked before a new copy is exported.",
    footerCopy: "Local processing · Lossless editing · Export a copy",
    close: "Close",
    reviewKicker: "BEFORE EXPORT",
    reviewTitle: "These changes will be written to the copy",
    reviewCopy: "Your original will not be overwritten. Metadata is read again after writing and the encoded image data is checked.",
    reviewCopyStructural: "Your original will not be overwritten. Metadata is read again after writing and the image container is verified; HEIC/HEIF cannot use a pixel-level hash.",
    outputFile: "Output file",
    writing: "Writing & verifying…",
    confirmDownload: "Write changes & verify",
    readyKicker: "VERIFIED",
    readyTitle: "Your copy is ready",
    readyCopy: "Open the system share sheet, then choose Save to Files, Photos, or another app.",
    shareAndSave: "Share / Save to Files",
    directDownload: "Direct download (fallback)",
    directDownloadHint: "If the share sheet is unavailable, try the direct download. The file link stays active until you close or export again.",
    readyToSave: "Verified and ready for you to choose a save location",
    shareFailed: "The system share sheet could not be opened. Use the direct download fallback.",
    downloadStarted: "Download handed to the browser",
    unset: "Not set",
    camera: "Camera",
    lens: "Lens",
    aperture: "Aperture",
    shutter: "Shutter",
    focalLength: "Focal length",
    gpsLocation: "GPS location",
    gpsExists: "GPS data exists",
    gpsRemoved: "Remove complete GPS IFD",
    gpsCoordinates: "GPS coordinates",
    jpegOnly: "JPEG, PNG, WebP, and experimental TIFF and HEIC / HEIF images are currently supported.",
    experimentalFormatWarning: "Experimental format: TIFF image data areas are checked. HEIC/HEIF verifies only the container and mdat data presence, not a pixel-level hash. Browser previews and third-party compatibility may be limited.",
    heicRetentionWarning: "This HEIC contains auxiliary HDR, depth, or portrait-effect image data. Its related XMP and ICC profiles are retained to protect visual rendering; standard XMP, GPS, and privacy fields can still be cleaned.",
    heicFullWipeUnsupported: "This HEIC's auxiliary-image XMP and ICC profiles cannot be safely removed without affecting HDR, depth, or color, so full wipe and ICC-profile removal are unavailable.",
    verificationNoteStructural: "Fields verified · Image container structure verified",
    fileTooLarge: "This image is larger than 500 MB. Please choose a smaller file.",
    parseFailed: "This image could not be parsed. It may be damaged or contain an unsupported metadata structure.",
    invalidCoordinates: "Check the location: use decimal degrees, DMS or degrees/minutes; latitude −90 to 90, longitude −180 to 180, numeric altitude and direction from 0 (inclusive) to 360 (exclusive).",
    nothingToWrite: "There are no changes to write yet.",
    writingMetadata: "Writing metadata locally…",
    preparingWriter: "Preparing the local metadata writer…",
    writeTimedOut: "Local writing exceeded five minutes and was safely stopped. Close other memory-heavy tabs and try again.",
    writerResourceFailed: "The local writer could not load. Refresh the page and try again; if it persists, the site assets may not have updated completely.",
    writeFailed: "ExifTool could not write the metadata",
    verifyingFile: "Reading and verifying the exported file…",
    cleaningMetadata: "Cleaning existing metadata…",
    metadataReadFailed: "Could not re-read the processed metadata. The download was blocked.",
    cleanupThenWrite: "Selected old metadata is cleaned first, then your explicit edits are written. New values are kept and may recreate EXIF, XMP or IPTC groups; unchanged old fields are not restored. Removing Photoshop also removes its contained IPTC. Choosing Remove location still removes GPS.",
    gpsVerificationFailed: "GPS verification failed after writing. The download was blocked.",
    fieldVerificationFailed: "Field verification failed after writing. The download was blocked.",
    cleanupVerificationFailed: "Privacy cleanup verification failed after writing. The download was blocked.",
    pixelsChanged: "The encoded image data changed. The download was blocked.",
    exported: "Verified and exported",
    exportFailed: "Export failed. Please try another image.",
  },
} as const;

type ExifTag = {
  value?: unknown;
  description?: string | number;
};

type ExifTags = Record<string, ExifTag>;

type EditableData = {
  make: string;
  model: string;
  lensModel: string;
  aperture: string;
  shutterSpeed: string;
  iso: string;
  focalLength: string;
  dateTime: string;
  title: string;
  artist: string;
  copyright: string;
  keywords: string;
  city: string;
  country: string;
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
  width?: number;
  height?: number;
  format: ImageFormatInfo;
};

const EMPTY_DATA: EditableData = {
  make: "",
  model: "",
  lensModel: "",
  aperture: "",
  shutterSpeed: "",
  iso: "",
  focalLength: "",
  dateTime: "",
  title: "",
  artist: "",
  copyright: "",
  keywords: "",
  city: "",
  country: "",
  description: "",
  latitude: "",
  longitude: "",
  altitude: "",
  direction: "",
};

const MAX_FILE_SIZE = 500 * 1024 * 1024;

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

const numericTag = (tags: ExifTags, names: string[], allowFraction = false): string => {
  for (const name of names) {
    // ApertureValue is an APEX value, so its display conversion remains the fallback.
    if (name === "ApertureValue") continue;
    const stored = storedNumericValue(tags[name]?.value, allowFraction);
    if (stored !== null) return stored;
  }
  const value = firstTag(tags, names);
  const pattern = allowFraction ? /\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?|-?\d+(?:\.\d+)?/ : /-?\d+(?:\.\d+)?/;
  return value.match(pattern)?.[0]?.replaceAll(" ", "") ?? "";
};

const positiveNumber = (value: string): boolean =>
  value === "" || (Number.isFinite(Number(value)) && Number(value) > 0);

const positiveExposure = (value: string): boolean => {
  if (!value) return true;
  const fraction = value.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (fraction) return Number(fraction[1]) > 0 && Number(fraction[2]) > 0;
  return positiveNumber(value);
};

const parseCoordinate = (value: string): string => {
  const match = value.replace(/[°'"]/g, " ").match(/-?\d+(?:\.\d+)?/);
  return match ? match[0] : "";
};

const gpsCoordinate = (tags: ExifTags, axis: "Latitude" | "Longitude"): string => {
  const raw = parseCoordinate(firstTag(tags, [`GPS${axis}`]));
  if (!raw) return "";
  const coordinate = Number(raw);
  if (!Number.isFinite(coordinate)) return "";
  const reference = firstTag(tags, [`GPS${axis}Ref`]);
  const isNegative = axis === "Latitude" ? /south|^s$/i.test(reference) : /west|^w$/i.test(reference);
  return String(isNegative ? -Math.abs(coordinate) : Math.abs(coordinate));
};

const signedAltitude = (tags: ExifTags): string => {
  const value = storedNumericValue(tags.GPSAltitude?.value) ?? parseCoordinate(firstTag(tags, ["GPSAltitude"]));
  if (!value) return "";
  const reference = firstTag(tags, ["GPSAltitudeRef"]);
  return String(/below|^1$|^3$/i.test(reference) ? -Math.abs(Number(value)) : Number(value));
};

const exifDateToInput = (value: string): string => {
  const match = value.match(/^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2})/);
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

// TIFF keeps these baseline IFD entries even after ExifTool deletes metadata:
// they describe how to decode the image rather than user metadata. Treating
// them as a cleanup leak blocks every valid TIFF export.
const REQUIRED_TIFF_IMAGE_TAGS = new Set([
  "NewSubfileType",
  "SubfileType",
  "ImageWidth",
  "ImageHeight",
  "BitsPerSample",
  "Compression",
  "PhotometricInterpretation",
  "StripOffsets",
  "SamplesPerPixel",
  "RowsPerStrip",
  "StripByteCounts",
  "PlanarConfiguration",
  "TileWidth",
  "TileLength",
  "TileOffsets",
  "TileByteCounts",
  "SampleFormat",
  "Predictor",
  "ExtraSamples",
  "Orientation",
  "XResolution",
  "YResolution",
  "XPosition",
  "YPosition",
  "ResolutionUnit",
  "SubIFD",
  "ExifOffset",
  "GPSInfo",
  "YCbCrCoefficients",
  "YCbCrSubSampling",
  "YCbCrPositioning",
  "ReferenceBlackWhite",
  "ColorMap",
  "SMinSampleValue",
  "SMaxSampleValue",
  "TransferFunction",
  "WhitePoint",
  "PrimaryChromaticities",
]);

const isRequiredTiffImageField = (key: string): boolean => {
  const separator = key.indexOf(":");
  if (separator < 0 || !["EXIF", "IFD0", "IFD1", "ExifIFD"].includes(key.slice(0, separator))) return false;
  return REQUIRED_TIFF_IMAGE_TAGS.has(key.slice(separator + 1));
};

const isRequiredHeicVisualMetadata = (key: string): boolean =>
  /^ICC_Profile\d*:/i.test(key) ||
  /^XMP-(?:x:|semanticSegmentationMatte:|apdi:|depthData:|depthBlurEffect:|portraitLightingEffect:|HDRGainMap:)/.test(key);

const display = (value: string, fallback: string): string => value.trim() || fallback;

const getImageDimensions = (url: string): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("无法读取图片尺寸"));
    image.src = url;
  });

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const operationBusyRef = useRef(false);
  const [language, setLanguage] = useState<Language>("zh");
  const [file, setFile] = useState<File | null>(null);
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewAvailable, setPreviewAvailable] = useState(false);
  const [metadataFields, setMetadataFields] = useState<MetadataField[]>([]);
  const [resolvedConflicts, setResolvedConflicts] = useState<
    Partial<Record<SemanticFieldKey, string>>
  >({});
  const [original, setOriginal] = useState<EditableData>(EMPTY_DATA);
  const [form, setForm] = useState<EditableData>(EMPTY_DATA);
  const [gpsMode, setGpsMode] = useState<GpsMode>("keep");
  const [cleanupPreset, setCleanupPreset] = useState<CleanupPreset>("none");
  const [groupDeletes, setGroupDeletes] = useState<AdvancedDeleteTag[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [verified, setVerified] = useState(false);
  const [pixelVerified, setPixelVerified] = useState(false);
  const [c2paDetected, setC2paDetected] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const t = COPY[language];

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const savedLanguage = window.localStorage.getItem("yingke-exif-language");
      const preferredLanguage: Language =
        savedLanguage === "zh" || savedLanguage === "en"
          ? savedLanguage
          : navigator.language.toLowerCase().startsWith("zh")
            ? "zh"
            : "en";
      setLanguage(preferredLanguage);
      document.documentElement.lang = preferredLanguage === "zh" ? "zh-CN" : "en";
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

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

  const resolveConflict = (key: SemanticFieldKey, value: string) => {
    // datetime-local expects a local ISO-like value. Conflict values from EXIF,
    // XMP, and IPTC use different precisions and may include a timezone.
    const normalizedValue = key === "dateTime" ? exifDateToInput(value) : value;
    assign(key, normalizedValue);
    // A selected value must be written back to every compatible tag even when
    // it matches the value initially chosen for the form.
    setResolvedConflicts((current) => ({ ...current, [key]: normalizedValue }));
  };

  const changeLanguage = (nextLanguage: Language) => {
    setLanguage(nextLanguage);
    window.localStorage.setItem("yingke-exif-language", nextLanguage);
    document.documentElement.lang = nextLanguage === "zh" ? "zh-CN" : "en";
    setError("");
    setStatus("");
  };

  const readFile = async (selected: File) => {
    if (operationBusyRef.current) return;
    operationBusyRef.current = true;
    setBusy(true);
    setError("");
    setStatus(t.reading);
    setVerified(false);
    setPixelVerified(false);
    setReviewOpen(false);
    try {
      const format = imageFormatFromFile(selected);
      if (!format) throw new Error(t.jpegOnly);
      if (selected.size > MAX_FILE_SIZE) throw new Error(t.fileTooLarge);
      const formatSafety = formatSafetyFromBuffer(await selected.arrayBuffer(), format.format);
      if (!formatSafety.writable) throw new Error(formatSafety.reason);
      const [{ default: ExifReader }, { readMetadataInWorker }] = await Promise.all([
        import("exifreader"),
        import("./exif-write-client"),
      ]);
      // Keep the two parsers sequential. On 30–100 MB camera JPEGs this avoids
      // holding two complete virtual-file copies in memory at the same time.
      const loaded = (await ExifReader.load(selected, {
        includeUnknown: true,
      }).catch(() => ({}))) as ExifTags;
      const exifToolResult = await readMetadataInWorker(selected, (phase) => {
        setStatus(phase === "loading" ? t.preparingWriter : t.reading);
      });
      if (!exifToolResult.success) throw new Error(`${t.parseFailed} ${exifToolResult.error}`);
      const nextUrl = URL.createObjectURL(selected);
      const dimensions = await getImageDimensions(nextUrl).catch(() => null);
      const nextMetadataFields = exifToolResult.success
        ? normalizeExifToolFields(exifToolResult.data)
        : [];

      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(nextUrl);
      setFile(selected);
      setFileInfo({
        name: selected.name,
        size: selected.size,
        ...(dimensions ?? {}),
        format,
      });
      setPreviewAvailable(Boolean(dimensions));
      setMetadataFields(nextMetadataFields);
      setResolvedConflicts({});

      const latitude = gpsCoordinate(loaded, "Latitude");
      const longitude = gpsCoordinate(loaded, "Longitude");
      const nextData: EditableData = {
        make: semanticValueFromFields(nextMetadataFields, "make") || firstTag(loaded, ["Make"]),
        model: semanticValueFromFields(nextMetadataFields, "model") || firstTag(loaded, ["Model"]),
        lensModel:
          semanticValueFromFields(nextMetadataFields, "lensModel") ||
          firstTag(loaded, ["LensModel", "Lens"]),
        aperture: numericTag(loaded, ["FNumber", "ApertureValue"]),
        shutterSpeed: numericTag(loaded, ["ExposureTime"], true),
        iso: numericTag(loaded, ["ISOSpeedRatings", "PhotographicSensitivity"]),
        focalLength: numericTag(loaded, ["FocalLength"]),
        dateTime: exifDateToInput(
          semanticValueFromFields(nextMetadataFields, "dateTime") ||
            firstTag(loaded, ["DateTimeOriginal", "DateTimeDigitized", "DateTime"]),
        ),
        title: semanticValueFromFields(nextMetadataFields, "title"),
        artist:
          semanticValueFromFields(nextMetadataFields, "artist") ||
          firstTag(loaded, ["Artist", "Author", "XPAuthor"]),
        copyright:
          semanticValueFromFields(nextMetadataFields, "copyright") || firstTag(loaded, ["Copyright"]),
        keywords: semanticValueFromFields(nextMetadataFields, "keywords"),
        city: semanticValueFromFields(nextMetadataFields, "city"),
        country: semanticValueFromFields(nextMetadataFields, "country"),
        description:
          semanticValueFromFields(nextMetadataFields, "description") ||
          firstTag(loaded, ["ImageDescription", "Description", "Caption-Abstract"]),
        latitude,
        longitude,
        altitude: signedAltitude(loaded),
        direction: parseCoordinate(firstTag(loaded, ["GPSImgDirection"])),
      };
      setOriginal(nextData);
      setForm(nextData);
      setGpsMode(latitude && longitude ? "keep" : "edit");
      setCleanupPreset("none");
      setGroupDeletes([]);
      setMapLoaded(false);
      setC2paDetected(
        [...Object.keys(loaded), ...nextMetadataFields.map((field) => field.key)].some((key) =>
          /c2pa|jumbf|content.?credential/i.test(key),
        ),
      );
      setStatus("");
    } catch (cause) {
      console.error(cause);
      setError(cause instanceof Error ? cause.message : t.parseFailed);
      setStatus("");
    } finally {
      operationBusyRef.current = false;
      setBusy(false);
    }
  };

  const onInput = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (selected) void readFile(selected);
    event.target.value = "";
  };

  const onDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (busy || !event.dataTransfer.types.includes("Files")) return;
    dragDepthRef.current += 1;
    setDragging(true);
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!busy) event.dataTransfer.dropEffect = "copy";
  };

  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragging(false);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepthRef.current = 0;
    setDragging(false);
    if (busy) return;
    const selected = event.dataTransfer.files?.[0];
    if (selected) void readFile(selected);
  };

  const reset = () => {
    setForm(original);
    setResolvedConflicts({});
    setGpsMode(original.latitude && original.longitude ? "keep" : "edit");
    setCleanupPreset("none");
    setGroupDeletes([]);
    setVerified(false);
    setPixelVerified(false);
    setStatus("");
  };

  const hasGpsEdits = gpsMode === "edit" &&
    (["latitude", "longitude", "altitude", "direction"] as const).some((key) => form[key] !== original[key]);

  const parsedGps = parseBatchGpsEdits({ latitude: form.latitude, longitude: form.longitude, altitude: form.altitude, direction: form.direction });

  const hasValidCameraSettings =
    positiveNumber(form.aperture) &&
    positiveExposure(form.shutterSpeed) &&
    (form.iso === "" || (/^\d+$/.test(form.iso) && Number(form.iso) > 0)) &&
    positiveNumber(form.focalLength);

  const semanticLabels = useMemo<Record<SemanticFieldKey, string>>(
    () => ({
      artist: t.artist,
      copyright: t.copyright,
      title: t.title,
      description: t.description,
      keywords: t.keywords,
      dateTime: t.dateTaken,
      make: t.make,
      model: t.model,
      lensModel: t.lensModel,
      city: t.city,
      country: t.country,
    }),
    [t],
  );
  const shouldWriteSemanticField = (key: SemanticFieldKey): boolean =>
    form[key] !== original[key] || key in resolvedConflicts;

  const diffs = useMemo<DiffItem[]>(() => {
    const items: DiffItem[] = [];
    const push = (label: string, before: string, after: string) => {
      if (before !== after) {
        items.push({ label, before: display(before, t.unset), after: display(after, t.unset) });
      }
    };

    push(t.make, original.make, form.make);
    push(t.model, original.model, form.model);
    push(t.lensModel, original.lensModel, form.lensModel);
    push(t.aperture, original.aperture, form.aperture);
    push(t.shutter, original.shutterSpeed, form.shutterSpeed);
    push("ISO", original.iso, form.iso);
    push(t.focalLength, original.focalLength, form.focalLength);
    push(t.dateTaken, original.dateTime, form.dateTime);
    push(t.title, original.title, form.title);
    push(t.artist, original.artist, form.artist);
    push(t.copyright, original.copyright, form.copyright);
    push(t.keywords, original.keywords, form.keywords);
    push(t.city, original.city, form.city);
    push(t.country, original.country, form.country);
    push(t.description, original.description, form.description);

    for (const key of Object.keys(resolvedConflicts) as SemanticFieldKey[]) {
      if (form[key] === original[key]) {
        items.push({
          label: `${semanticLabels[key]} · ${t.conflictSync}`,
          before: t.unset,
          after: form[key],
        });
      }
    }

    if (gpsMode === "remove" && (original.latitude || original.longitude || original.altitude)) {
      items.push({
        label: t.gpsLocation,
        before:
          original.latitude && original.longitude
            ? `${original.latitude}, ${original.longitude}`
            : t.gpsExists,
        after: t.gpsRemoved,
        kind: "danger",
      });
    } else if (gpsMode === "edit") {
      push(
        t.gpsCoordinates,
        original.latitude && original.longitude
          ? `${original.latitude}, ${original.longitude}`
          : "",
        form.latitude && form.longitude ? `${coordinatePreview(parseCoordinateInput(form.latitude, "latitude") ?? NaN)}, ${coordinatePreview(parseCoordinateInput(form.longitude, "longitude") ?? NaN)}` : "",
      );
      push(t.altitude, original.altitude, form.altitude);
      push(t.direction, original.direction, form.direction);
    }
    if (cleanupPreset !== "none") {
      const cleanupLabels: Record<CleanupPreset, string> = {
        none: t.cleanupNone,
        privacy: t.cleanupPrivacy,
        appearance: t.cleanupAppearance,
        full: t.cleanupFull,
      };
      items.push({
        label: t.cleanupDiff,
        before: t.cleanupNone,
        after: cleanupLabels[cleanupPreset],
        kind: cleanupPreset === "full" ? "danger" : undefined,
      });
    }
    if (groupDeletes.length) {
      items.push({
        label: t.groupDeleteDiff,
        before: t.unset,
        after: groupDeletes.join(", "),
        kind: "danger",
      });
    }
    return items;
  }, [
    cleanupPreset,
    form,
    gpsMode,
    groupDeletes,
    original,
    resolvedConflicts,
    semanticLabels,
    t,
  ]);

  const conflicts = useMemo(
    () => semanticConflicts(metadataFields, semanticLabels),
    [metadataFields, semanticLabels],
  );

  const groupCounts = useMemo(() => {
    const counts = new globalThis.Map<string, number>();
    for (const field of metadataFields) {
      counts.set(field.group, (counts.get(field.group) ?? 0) + 1);
    }
    return [...counts.entries()];
  }, [metadataFields]);

  const openReview = () => {
    setError("");
    if (!hasValidCameraSettings) {
      setError(t.invalidCameraSettings);
      return;
    }
    if (hasGpsEdits && !parsedGps) {
      setError(t.invalidCoordinates);
      return;
    }
    if (
      fileInfo?.format.format === "heic" &&
      (cleanupPreset === "full" || groupDeletes.includes("ICC_Profile:All"))
    ) {
      setError(t.heicFullWipeUnsupported);
      return;
    }
    if (!diffs.length) {
      setError(t.nothingToWrite);
      return;
    }
    setReviewOpen(true);
  };

  const exportFile = async () => {
    if (!file || operationBusyRef.current) return;
    const format = imageFormatFromFile(file);
    if (!format) {
      setError(t.exportFailed);
      return;
    }
    operationBusyRef.current = true;
    setBusy(true);
    setError("");
    setStatus(t.writingMetadata);
    setVerified(false);
    setPixelVerified(false);

    // A full-resolution preview can consume hundreds of MB for a large JPEG.
    // Release it before ExifTool creates its own in-memory source and output files.
    const restorePreview = Boolean(previewUrl);
    if (restorePreview) {
      setPreviewUrl("");
      setPreviewAvailable(false);
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    }

    try {
      const writeTags: Record<string, string | number | boolean | (string | number | boolean)[]> = {};
      if (shouldWriteSemanticField("make")) {
        Object.assign(writeTags, semanticWriteTags("make", form.make));
      }
      if (shouldWriteSemanticField("model")) {
        Object.assign(writeTags, semanticWriteTags("model", form.model));
      }
      if (shouldWriteSemanticField("lensModel")) {
        Object.assign(writeTags, semanticWriteTags("lensModel", form.lensModel));
      }
      if (form.aperture !== original.aperture) {
        writeTags.FNumber = form.aperture;
        if (!form.aperture) writeTags.ApertureValue = "";
      }
      if (form.shutterSpeed !== original.shutterSpeed) writeTags.ExposureTime = form.shutterSpeed;
      if (form.iso !== original.iso) writeTags.ISO = form.iso;
      if (form.focalLength !== original.focalLength) writeTags.FocalLength = form.focalLength;
      if (shouldWriteSemanticField("dateTime")) {
        Object.assign(writeTags, semanticWriteTags("dateTime", inputDateToExif(form.dateTime)));
      }
      if (shouldWriteSemanticField("title")) {
        Object.assign(writeTags, semanticWriteTags("title", form.title));
      }
      if (shouldWriteSemanticField("artist")) {
        Object.assign(writeTags, semanticWriteTags("artist", form.artist));
      }
      if (shouldWriteSemanticField("copyright")) {
        Object.assign(writeTags, semanticWriteTags("copyright", form.copyright));
      }
      if (shouldWriteSemanticField("keywords")) {
        Object.assign(writeTags, semanticWriteTags("keywords", form.keywords));
      }
      if (shouldWriteSemanticField("city")) {
        Object.assign(writeTags, semanticWriteTags("city", form.city));
      }
      if (shouldWriteSemanticField("country")) {
        Object.assign(writeTags, semanticWriteTags("country", form.country));
      }
      if (shouldWriteSemanticField("description")) {
        Object.assign(writeTags, semanticWriteTags("description", form.description));
      }

      const cleanupDeletionTargets = [...CLEANUP_PRESETS[cleanupPreset].tags];
      const requestedDeletionTargets = expandCleanupTargets([
        ...cleanupDeletionTargets,
        ...groupDeletes,
      ], format.format);
      const removesTiffExif =
        format.format === "tiff" &&
        requestedDeletionTargets.some((tag) => tag === "All" || tag === "EXIF:All");
      const cleanupWriteTags: typeof writeTags = {};
      const deletesOldGps = gpsMode === "remove" || requestedDeletionTargets.some(
        (tag) => ["GPS:All", "EXIF:All", "All"].includes(tag),
      );
      const shouldDeleteGps = deletesOldGps && !hasGpsEdits;

      if (deletesOldGps) {
        // WebP and PNG often carry GPS in XMP or EXIF aliases instead of the
        // GPS IFD. Remove each source field actually found, in addition to the
        // standard GPS group, without touching ExifTool's derived Composite tags.
        for (const tag of gpsDeletionTags(metadataFields)) cleanupWriteTags[tag] = "";
      }
      if (hasGpsEdits) {
        if (!parsedGps) throw new Error(t.invalidCoordinates);
        Object.assign(writeTags, batchGpsWriteTags({
          latitude: parsedGps.latitude, longitude: parsedGps.longitude,
          ...(form.altitude !== original.altitude && parsedGps.altitude !== undefined ? { altitude: parsedGps.altitude } : {}),
          ...(form.direction !== original.direction && parsedGps.direction !== undefined ? { direction: parsedGps.direction } : {}),
        }));
        if (form.altitude !== original.altitude && !form.altitude.trim()) {
          writeTags.GPSAltitude = ""; writeTags.GPSAltitudeRef = "";
        }
        if (form.direction !== original.direction && !form.direction.trim()) {
          writeTags.GPSImgDirection = ""; writeTags.GPSImgDirectionRef = "";
        }
      }
      for (const tag of requestedDeletionTargets) {
        cleanupWriteTags[tag] = "";
      }
      const privacySerialDeletionTargets = privacySerialDeletionTagsForPreset(
        metadataFields,
        cleanupPreset,
      );
      for (const tag of expandCleanupTargets(privacySerialDeletionTargets, format.format)) cleanupWriteTags[tag] = "";
      if (removesTiffExif) {
        // ExifTool retains writable IFD0 fields when asked to delete EXIF:All
        // from a TIFF. Clear the actual non-structural IFD entries explicitly;
        // the required image-layout entries stay intact for a valid output.
        for (const field of metadataFields) {
          if (field.group === "EXIF" && !isRequiredTiffImageField(field.key)) {
            cleanupWriteTags[field.key] = "";
          }
        }
      }

      const { readMetadataInWorker, writeMetadataInWorker } = await import("./exif-write-client");
      const readVerifiedFields = async (processed: File) => {
        setStatus(t.verifyingFile);
        const result = await readMetadataInWorker(processed, undefined, { numeric: true });
        if (!result.success) throw new Error(`${t.metadataReadFailed} ${result.error}`);
        return normalizeExifToolFields(result.data);
      };
      const outputName = outputNameFor(file.name, format.extension);
      const outputFile = await writeMetadataInStages({
        file: await fileForMetadataWrite(file, format.format),
        edits: writeTags,
        deletions: cleanupWriteTags,
        write: async (input, tags, stage) => {
          const hasIptcTextWrite = Object.entries(tags).some(
            ([tag, value]) => tag.startsWith("IPTC:") && value !== "",
          );
          const removesIccProfile = stage === "cleanup" && requestedDeletionTargets.some(
            (tag) => tag === "All" || tag === "ICC_Profile:All",
          );
          const result = await writeMetadataInWorker(input,
            hasIptcTextWrite ? { ...tags, "IPTC:CodedCharacterSet": "UTF8" } : tags,
            ["-charset", "UTF8", ...(hasIptcTextWrite ? ["-charset", "IPTC=UTF8"] : []),
              // Silence the expected ICC-removal notice only for the cleanup pass.
              ...(removesIccProfile ? ["-q", "-q"] : [])],
            (phase) => setStatus(phase === "loading" ? t.preparingWriter : stage === "cleanup" ? t.cleaningMetadata : t.writingMetadata),
          );
          if (!result.success) {
            throw new Error(result.error === "EXIF_WRITE_TIMEOUT" ? t.writeTimedOut
              : result.error.startsWith("EXIF_WASM_") ? t.writerResourceFailed
              : `${stage === "cleanup" ? t.cleaningMetadata : t.writeFailed} ${result.error}`);
          }
          return new File([result.data], outputName, { type: format.mimeType });
        },
        verifyCleanup: async (cleaned) => {
          const fields = await readVerifiedFields(cleaned);
          const deletionFields = format.format === "tiff"
            ? fields.filter((field) => !isRequiredTiffImageField(field.key))
            : format.format === "heic"
              ? fields.filter((field) => !isRequiredHeicVisualMetadata(field.key))
              : fields;
          const remaining = remainingDeletionTargets(deletionFields, [
            ...requestedDeletionTargets,
            ...privacySerialDeletionTargets,
            ...(deletesOldGps ? ["GPS:All"] : []),
          ]);
          const serials = cleanupPreset === "privacy" ? remainingPrivacySerialFields(deletionFields) : [];
          if (remaining.length || serials.length) {
            throw new Error(`${t.cleanupVerificationFailed} ${[...remaining, ...serials.map((field) => field.key)].join(", ")}`);
          }
        },
      });
      const outputBuffer = await outputFile.arrayBuffer();

      setStatus(t.verifyingFile);
      const verifiedMetadataFields = await readVerifiedFields(outputFile);

      const gpsOk = shouldDeleteGps
        ? !verifiedMetadataFields.some(isGpsLocationMetadataField)
        : !hasGpsEdits || (parsedGps !== null && batchGpsEditsAreVerified(verifiedMetadataFields, {
          latitude: parsedGps.latitude, longitude: parsedGps.longitude,
          ...(form.altitude !== original.altitude && parsedGps.altitude !== undefined ? { altitude: parsedGps.altitude } : {}),
          ...(form.direction !== original.direction && parsedGps.direction !== undefined ? { direction: parsedGps.direction } : {}),
        }) &&
          (form.altitude === original.altitude || form.altitude.trim() || !verifiedMetadataFields.some((field) => field.tag === "GPSAltitude")) &&
          (form.direction === original.direction || form.direction.trim() || !verifiedMetadataFields.some((field) => field.tag === "GPSImgDirection")));
      const failedFields: string[] = [];
      for (const key of Object.keys(semanticLabels) as SemanticFieldKey[]) {
        if (!shouldWriteSemanticField(key)) continue;
        const matches = semanticValueMatches(verifiedMetadataFields, key, key === "dateTime" ? inputDateToExif(form.dateTime) : form[key]);
        if (!matches) failedFields.push(semanticLabels[key]);
      }
      const numericChecks = [
        ["aperture", t.aperture, "FNumber"],
        ["shutterSpeed", t.shutter, "ExposureTime"],
        ["iso", "ISO", "ISO"],
        ["focalLength", t.focalLength, "FocalLength"],
      ] as const;
      for (const [key, label, tag] of numericChecks) {
        if (form[key] !== original[key] &&
          !numericFieldMatches(verifiedMetadataFields, tag, form[key])) {
          failedFields.push(label);
        }
      }
      const editableFieldsOk = failedFields.length === 0;

      // HEIC metadata item payloads are stored inside the ISO-BMFF mdat box.
      // Hashing the entire box therefore reports every legitimate metadata edit
      // as an image change. For HEIC/HEIF, re-check the output container and
      // rely on ExifTool's metadata-only writer instead of a false pixel hash.
      const samePixels =
        format.format === "heic"
          ? formatSafetyFromBuffer(outputBuffer, format.format).writable
          : (await imageDataDigest(file, format.format)) ===
            (await imageDataDigest(outputFile, format.format));

      setVerified(Boolean(gpsOk) && editableFieldsOk);
      setPixelVerified(samePixels);
      if (!gpsOk) throw new Error(t.gpsVerificationFailed);
      if (!editableFieldsOk) throw new Error(`${t.fieldVerificationFailed} ${failedFields.join("、")}`);
      if (!samePixels) throw new Error(t.pixelsChanged);

      const href = URL.createObjectURL(outputFile);
      const link = document.createElement("a");
      link.href = href;
      link.download = outputName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 60_000);
      setStatus(`${t.exported} ${outputName}`);
      setReviewOpen(false);
    } catch (cause) {
      console.error(cause);
      setError(cause instanceof Error ? cause.message : t.exportFailed);
      setStatus("");
      setReviewOpen(false);
    } finally {
      if (restorePreview) {
        setPreviewUrl(URL.createObjectURL(file));
        setPreviewAvailable(true);
      }
      operationBusyRef.current = false;
      setBusy(false);
    }
  };

  const hasFile = Boolean(file && fileInfo);
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label={t.home}>
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          <span>影刻<em>·元数据</em></span>
        </a>
        <div className="header-note">
          <LockKeyhole size={15} />
          {t.localHeader}
        </div>
        <div className="header-actions">
          <div className="language-switch" role="group" aria-label="Language / 语言">
            <button
              type="button"
              className={language === "zh" ? "active" : ""}
              aria-pressed={language === "zh"}
              onClick={() => changeLanguage("zh")}
            >
              中文
            </button>
            <button
              type="button"
              className={language === "en" ? "active" : ""}
              aria-pressed={language === "en"}
              onClick={() => changeLanguage("en")}
            >
              EN
            </button>
          </div>
          <a className="about-link" href="#privacy">
            {t.privacyLink}
          </a>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-badges">
          <div className="eyebrow"><span /> PRIVATE · LOCAL · LOSSLESS</div>
          <strong>{t.versionBadge}</strong>
        </div>
        <h1>{t.heroTitle}</h1>
        <p>
          {t.heroCopy1}
          <br />{t.heroCopy2}
        </p>
        <div className="hero-steps" aria-label={t.flowLabel}>
          <span><b>01</b>{t.chooseStep}</span>
          <ArrowRight size={16} />
          <span><b>02</b>{t.editStep}</span>
          <ArrowRight size={16} />
          <span><b>03</b>{t.verifyStep}</span>
        </div>
      </section>

      <section className="workspace" aria-label={t.workspaceLabel}>
        {!hasFile && batchMode ? (
          <BatchWorkspace language={language} onClose={() => setBatchMode(false)} />
        ) : !hasFile ? (
          <div
            className={`dropzone ${dragging ? "is-dragging" : ""}`}
            onDragEnter={onDragEnter}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.tif,.tiff,.heic,.heif,image/jpeg,image/png,image/webp,image/tiff,image/heic,image/heif"
              onChange={onInput}
              aria-label={t.chooseAria}
            />
            <div className="drop-visual" aria-hidden="true">
              <div className="photo-sheet sheet-back" />
              <div className="photo-sheet sheet-front">
                <span className="mini-sun" />
                <span className="mini-hill" />
              </div>
              <span className="pin-dot"><MapPin size={18} /></span>
            </div>
            <p className="drop-kicker">{t.startHere}</p>
            <h2>{t.dropTitle}</h2>
            <p>{t.dropCopy}</p>
            <button className="primary-button select-button" onClick={() => inputRef.current?.click()} disabled={busy}>
              {busy ? <RefreshCw className="spin" size={18} /> : <ImagePlus size={18} />}
              {busy ? t.reading : t.choosePhoto}
            </button>
            <button className="batch-entry-button" type="button" onClick={() => setBatchMode(true)} disabled={busy}>
              <ListChecks size={16} />{language === "zh" ? "批量照片处理" : "Batch photo processing"}
            </button>
            <div className="drop-meta">
              <span>JPEG / PNG / WebP / TIFF / HEIC</span>
              <span>{t.maxSize}</span>
              <span><ShieldCheck size={14} />{t.neverUpload}</span>
            </div>
          </div>
        ) : (
          <div
            className={`editor-shell ${dragging ? "is-dragging" : ""}`}
            onDragEnter={onDragEnter}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            aria-busy={busy}
          >
            <div className="editor-topbar">
              <div className="file-title">
                <FileImage size={19} />
                <div>
                  <strong>{fileInfo?.name}</strong>
                  <span>
                    {fileInfo?.width && fileInfo.height
                      ? `${fileInfo.width} × ${fileInfo.height} · `
                      : ""}
                    {fileInfo?.format.label}{fileInfo?.format.experimental ? ` · ${language === "zh" ? "实验性" : "Experimental"}` : ""} · {formatBytes(fileInfo?.size ?? 0)}
                  </span>
                </div>
              </div>
              <button
                className="text-button"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
              >
                <Upload size={16} />{t.changePhoto}
              </button>
              <input ref={inputRef} className="sr-only" type="file" accept=".jpg,.jpeg,.png,.webp,.tif,.tiff,.heic,.heif,image/jpeg,image/png,image/webp,image/tiff,image/heic,image/heif" onChange={onInput} />
            </div>

            {c2paDetected && (
              <div className="warning-banner">
                <Fingerprint size={18} />
                {t.c2paWarning}
              </div>
            )}
            {fileInfo?.format.experimental && (
              <div className="warning-banner">
                <AlertTriangle size={18} />
                {t.experimentalFormatWarning}
              </div>
            )}
            {fileInfo?.format.format === "heic" && (
              <div className="warning-banner">
                <AlertTriangle size={18} />
                {t.heicRetentionWarning}
              </div>
            )}

            <div className="editor-grid">
              <aside className="preview-column">
                <div className="image-frame">
                  {previewAvailable ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={previewUrl} alt={t.previewAlt} />
                  ) : (
                    <div className="preview-unavailable" role="status">
                      <FileImage size={28} />
                      <strong>{fileInfo?.format.label}</strong>
                      <span>{language === "zh" ? "此浏览器无法预览该文件，仍可编辑元数据。" : "This browser cannot preview the file, but its metadata can still be edited."}</span>
                    </div>
                  )}
                </div>
                <div className="camera-card">
                  <div className="card-title">
                    <Camera size={17} />
                    <span>{t.cameraSettings}</span>
                    <small>{t.editable}</small>
                  </div>
                  <p className="camera-hint">{t.cameraSettingsHint}</p>
                  <div className="camera-fields">
                    <label><span>{t.make}</span><input value={form.make} onChange={(event) => assign("make", event.target.value)} placeholder={t.makePlaceholder} /></label>
                    <label><span>{t.model}</span><input value={form.model} onChange={(event) => assign("model", event.target.value)} placeholder={t.modelPlaceholder} /></label>
                    <label className="wide"><span>{t.lensModel}</span><input value={form.lensModel} onChange={(event) => assign("lensModel", event.target.value)} placeholder={t.lensPlaceholder} /></label>
                    <label><span>{t.aperture} <small>f/</small></span><input inputMode="decimal" value={form.aperture} onChange={(event) => assign("aperture", event.target.value)} placeholder={t.aperturePlaceholder} /></label>
                    <label><span>{t.shutter} <small>s</small></span><input inputMode="text" value={form.shutterSpeed} onChange={(event) => assign("shutterSpeed", event.target.value)} placeholder={t.shutterPlaceholder} /></label>
                    <label><span>ISO</span><input inputMode="numeric" value={form.iso} onChange={(event) => assign("iso", event.target.value)} placeholder={t.isoPlaceholder} /></label>
                    <label><span>{t.focalLength} <small>mm</small></span><input inputMode="decimal" value={form.focalLength} onChange={(event) => assign("focalLength", event.target.value)} placeholder={t.focalLengthPlaceholder} /></label>
                  </div>
                </div>
              </aside>

              <div className="form-column">
                <section className="form-section">
                  <div className="section-heading">
                    <span className="section-icon"><MapPin size={18} /></span>
                    <div>
                      <h2>{t.location}</h2>
                      <p>{t.wgsHint}</p>
                    </div>
                  </div>
                  <div className="segmented" role="group" aria-label={t.gpsModes}>
                    {([
                      ["keep", t.keepLocation],
                      ["edit", original.latitude ? t.editLocation : t.addLocation],
                      ["remove", t.removeLocation],
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
                        <strong>{t.removeGpsTitle}</strong>
                        <p>{t.removeGpsCopy}</p>
                      </div>
                    </div>
                  ) : gpsMode === "keep" ? (
                    <div className="keep-panel">
                      <Navigation size={18} />
                      <div>
                        <span>{t.originalCoordinates}</span>
                        <strong>
                          {original.latitude && original.longitude
                            ? `${original.latitude}, ${original.longitude}`
                            : t.noGps}
                        </strong>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="coordinate-grid">
                        <CoordinateField axis="latitude" language={language} value={form.latitude} onChange={(value) => assign("latitude", value)} />
                        <CoordinateField axis="longitude" language={language} value={form.longitude} onChange={(value) => assign("longitude", value)} />
                      </div>
                      <div className="coordinate-hint">
                        <CircleHelp size={14} />
                        {t.coordinateHint}
                      </div>

                      {!mapLoaded && !busy ? (
                        <button className="map-consent" onClick={() => setMapLoaded(true)}>
                          <span><Map size={20} /></span>
                          <div>
                            <strong>{t.pickOnMap}</strong>
                            <small>{t.mapConsent}</small>
                          </div>
                          <ArrowRight size={18} />
                        </button>
                      ) : mapLoaded && !busy ? (
                        <MapPicker
                          language={language}
                          latitude={parseCoordinateInput(form.latitude, "latitude") ?? NaN}
                          longitude={parseCoordinateInput(form.longitude, "longitude") ?? NaN}
                          onChange={(latitude, longitude) => {
                            setForm((current) => ({
                              ...current,
                              latitude: latitude.toFixed(6),
                              longitude: longitude.toFixed(6),
                            }));
                            setVerified(false);
                          }}
                        />
                      ) : null}

                      <div className="coordinate-grid compact">
                        <label>
                          <span>{t.altitude} <small>{t.metresOptional}</small></span>
                          <input
                            inputMode="decimal"
                            value={form.altitude}
                            onChange={(event) => assign("altitude", event.target.value)}
                            placeholder={t.exampleAltitude}
                          />
                        </label>
                        <label>
                          <span>{t.direction} <small>{t.degreesOptional}</small></span>
                          <input
                            inputMode="decimal"
                            value={form.direction}
                            onChange={(event) => assign("direction", event.target.value)}
                            placeholder={t.exampleDirection}
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
                      <h2>{t.timeAndText}</h2>
                      <p>{t.syncedFields}</p>
                    </div>
                  </div>
                  <div className="field-stack">
                    <label>
                      <span>{t.dateTaken}</span>
                      <input
                        type="datetime-local"
                        value={form.dateTime}
                        onChange={(event) => assign("dateTime", event.target.value)}
                      />
                    </label>
                    <label>
                      <span>{t.title}</span>
                      <input value={form.title} onChange={(event) => assign("title", event.target.value)} placeholder={t.titlePlaceholder} />
                    </label>
                    <div className="two-fields">
                      <label>
                        <span>{t.artist}</span>
                        <input value={form.artist} onChange={(event) => assign("artist", event.target.value)} placeholder={t.artistPlaceholder} />
                      </label>
                      <label>
                        <span>{t.copyright}</span>
                        <input value={form.copyright} onChange={(event) => assign("copyright", event.target.value)} placeholder={t.copyrightPlaceholder} />
                      </label>
                    </div>
                    <label>
                      <span>{t.keywords}</span>
                      <input value={form.keywords} onChange={(event) => assign("keywords", event.target.value)} placeholder={t.keywordsPlaceholder} />
                    </label>
                    <div className="two-fields">
                      <label>
                        <span>{t.city}</span>
                        <input value={form.city} onChange={(event) => assign("city", event.target.value)} placeholder={t.cityPlaceholder} />
                      </label>
                      <label>
                        <span>{t.country}</span>
                        <input value={form.country} onChange={(event) => assign("country", event.target.value)} placeholder={t.countryPlaceholder} />
                      </label>
                    </div>
                    <label>
                      <span>{t.description}</span>
                      <textarea
                        rows={3}
                        maxLength={1000}
                        value={form.description}
                        onChange={(event) => assign("description", event.target.value)}
                        placeholder={t.descriptionPlaceholder}
                      />
                      <small className="counter">{form.description.length} / 1000</small>
                    </label>
                  </div>
                </section>

                <section className="form-section">
                  <div className="section-heading">
                    <span className="section-icon"><AlertTriangle size={18} /></span>
                    <div>
                      <h2>{t.conflictCheck}</h2>
                      <p>{t.conflictHint}</p>
                    </div>
                  </div>
                  {conflicts.length ? (
                    <div className="conflict-list">
                      {conflicts.map((conflict) => (
                        <article className="conflict-card" key={conflict.key}>
                          <strong>{conflict.label}</strong>
                          {conflict.values.map((item) => (
                            <button
                              type="button"
                              key={`${conflict.key}-${item.tag}-${item.value}`}
                              className={
                                resolvedConflicts[conflict.key] === item.value
                                  ? "is-selected"
                                  : undefined
                              }
                              aria-pressed={
                                resolvedConflicts[conflict.key] ===
                                (conflict.key === "dateTime" ? exifDateToInput(item.value) : item.value)
                              }
                              onClick={() => resolveConflict(conflict.key, item.value)}
                            >
                              <span>{item.tag}</span>
                              <b>{item.value}</b>
                              <small>
                                {resolvedConflicts[conflict.key] ===
                                (conflict.key === "dateTime" ? exifDateToInput(item.value) : item.value)
                                  ? t.valueApplied
                                  : t.useThisValue}
                              </small>
                            </button>
                          ))}
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-diff conflict-empty">
                      <Check size={16} />
                      <span>{t.noConflicts}</span>
                    </div>
                  )}
                </section>

                <section className="form-section">
                  <div className="section-heading">
                    <span className="section-icon"><ShieldCheck size={18} /></span>
                    <div>
                      <h2>{t.cleanupTitle}</h2>
                      <p>{t.cleanupHint}</p>
                    </div>
                  </div>
                  <div className="cleanup-grid" role="radiogroup" aria-label={t.cleanupTitle}>
                    {([
                      ["none", t.cleanupNone, t.noChanges],
                      ["privacy", t.cleanupPrivacy, t.cleanupPrivacyCopy],
                      ["appearance", t.cleanupAppearance, t.cleanupAppearanceCopy],
                      ["full", t.cleanupFull, t.cleanupFullCopy],
                    ] as const).map(([preset, label, copy]) => (
                      <button
                        type="button"
                        role="radio"
                        aria-checked={cleanupPreset === preset}
                        className={cleanupPreset === preset ? "active" : ""}
                        key={preset}
                        onClick={() => {
                          setCleanupPreset(preset);
                          setVerified(false);
                        }}
                      >
                        <strong>{label}</strong>
                        <span>{copy}</span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="form-section">
                  <div className="section-heading">
                    <span className="section-icon"><Trash2 size={18} /></span>
                    <div>
                      <h2>{t.groupDeleteTitle}</h2>
                      <p>{t.groupDeleteHint}</p>
                    </div>
                  </div>
                  <div className="group-delete-list">
                    {ADVANCED_DELETE_TAGS.map((tag) => {
                      const labels: Record<AdvancedDeleteTag, string> = {
                        "EXIF:All": t.groupDeleteEXIF,
                        "GPS:All": t.groupDeleteGPS,
                        "XMP:All": t.groupDeleteXMP,
                        "IPTC:All": t.groupDeleteIPTC,
                        "MakerNotes:All": t.groupDeleteMakerNotes,
                        "ICC_Profile:All": t.groupDeleteICC,
                        "Photoshop:All": t.groupDeletePhotoshop,
                        ThumbnailImage: t.groupDeleteThumbnail,
                        PreviewImage: t.groupDeletePreview,
                        "JUMBF:All": t.groupDeleteC2PA,
                      };
                      return (
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={groupDeletes.includes(tag)}
                        className={groupDeletes.includes(tag) ? "active" : ""}
                        key={tag}
                        onClick={() => {
                          setGroupDeletes((current) =>
                            current.includes(tag)
                              ? current.filter((item) => item !== tag)
                              : [...current, tag],
                          );
                          setVerified(false);
                        }}
                      >
                        <span>{labels[tag]}</span>
                        <small>{tag}</small>
                      </button>
                      );
                    })}
                  </div>
                </section>

                <section className="form-section">
                  <div className="section-heading">
                    <span className="section-icon"><ListChecks size={18} /></span>
                    <div>
                      <h2>{t.allTagsBrowser}</h2>
                      <p>{t.allTagsHint}</p>
                    </div>
                  </div>
                  <div className="group-pills" aria-label={t.detectedGroups}>
                    {groupCounts.map(([group, count]) => (
                      <span key={group}>{group}<b>{count}</b></span>
                    ))}
                  </div>
                  <div className="metadata-table">
                    {metadataFields.slice(0, 160).map((field) => (
                      <div className={`metadata-row risk-${field.risk}`} key={field.key}>
                        <span>{field.group}</span>
                        <strong>{field.tag}</strong>
                        <b>{field.value || t.unset}</b>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>

            <section className="change-review-panel" aria-label={t.changePreview}>
              <div className="change-review-heading">
                <span className="section-icon"><ListChecks size={18} /></span>
                <div>
                  <h2>{t.changePreview}</h2>
                  <p>{t.changePreviewHint}</p>
                </div>
              </div>
              <div className="inline-diff-list">
                  {diffs.length ? (
                    diffs.slice(0, 5).map((diff) => (
                      <div
                        className={`inline-diff ${diff.kind === "danger" ? "danger-diff" : ""}`}
                        key={diff.label}
                      >
                        <strong>{diff.label}</strong>
                        <span>{diff.before}</span>
                        <ArrowRight size={14} />
                        <b>{diff.after}</b>
                      </div>
                    ))
                  ) : (
                    <div className="empty-diff">
                      <Sparkles size={16} />
                      <span>{t.noChangePreview}</span>
                    </div>
                  )}
              </div>
            </section>

            <div className="editor-footer">
              <button className="secondary-button" onClick={reset} disabled={!diffs.length || busy}>
                <RotateCcw size={16} />{t.undoAll}
              </button>
              <div className="change-count">
                {diffs.length ? <><span>{diffs.length}</span> {t.changesPending}</> : t.noChanges}
              </div>
              <button className="primary-button export-button" onClick={openReview} disabled={busy || !diffs.length}>
                <Sparkles size={17} />{t.reviewExport}
              </button>
            </div>
          </div>
        )}

        {error && <div className="message error-message"><AlertTriangle size={17} />{error}</div>}
        {status && (
          <div className={`message ${verified && pixelVerified ? "success-message" : "status-message"}`}>
            {verified && pixelVerified ? <Check size={17} /> : <RefreshCw className={busy ? "spin" : ""} size={17} />}
            <span>{status}</span>
            {verified && pixelVerified && <small>{fileInfo?.format.verification === "structural" ? t.verificationNoteStructural : t.verificationNote}</small>}
          </div>
        )}
      </section>

      <section className="trust-strip" id="privacy">
        <LockKeyhole size={18} />
        <p>{t.privacyCopy}</p>
      </section>

      <footer>
        <div className="brand footer-brand">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span>影刻<em>·元数据</em></span>
        </div>
        <p>{t.footerCopy}</p>
        <p className="footer-credit">
          <span>© 2026 E.O创作</span>
          <span aria-hidden="true">·</span>
          <a href="mailto:eo@eomoment.com">eo@eomoment.com</a>
        </p>
      </footer>

      {reviewOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !busy) setReviewOpen(false);
        }}>
          <section className="review-modal" role="dialog" aria-modal="true" aria-labelledby="review-title">
            <button className="modal-close" aria-label={t.close} onClick={() => setReviewOpen(false)} disabled={busy}>
              <X size={20} />
            </button>
            <span className="modal-kicker">{t.reviewKicker}</span>
            <h2 id="review-title">{t.reviewTitle}</h2>
            <p className="modal-copy">{fileInfo?.format.verification === "structural" ? t.reviewCopyStructural : t.reviewCopy}</p>
            {(cleanupPreset !== "none" || groupDeletes.length > 0) && <p className="modal-copy">{t.cleanupThenWrite}</p>}
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
              <span>{t.outputFile}</span>
              <strong>{file && fileInfo ? outputNameFor(file.name, fileInfo.format.extension) : ""}</strong>
            </div>
            <button className="primary-button modal-action" onClick={() => void exportFile()} disabled={busy}>
              {busy ? <RefreshCw className="spin" size={18} /> : <Download size={18} />}
              {busy ? status || t.writing : t.confirmDownload}
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
