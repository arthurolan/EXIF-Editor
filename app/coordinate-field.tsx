"use client";

import { useId, useState } from "react";
import { coordinatePreview, parseCoordinateInput, type CoordinateAxis } from "./coordinate-input";

export function CoordinateField({ axis, value, onChange, language, disabled = false }: {
  axis: CoordinateAxis;
  value: string;
  onChange: (value: string) => void;
  language: "zh" | "en";
  disabled?: boolean;
}) {
  const id = useId();
  const [touched, setTouched] = useState(false);
  const latitude = axis === "latitude";
  const parsed = parseCoordinateInput(value, axis);
  const invalid = touched && Boolean(value.trim()) && parsed === null;
  const label = language === "zh" ? (latitude ? "纬度" : "经度") : (latitude ? "Latitude" : "Longitude");
  const example = latitude ? "31.230416 / 31°13′49.5″ N" : "121.473701 / 121°28′25.3″ E";
  return <label className="coordinate-field" htmlFor={id}>
    <span id={`${id}-label`}>{label}</span>
    <input id={id} type="text" value={value} disabled={disabled}
      onChange={(event) => { setTouched(false); onChange(event.target.value); }}
      onBlur={() => setTouched(true)}
      aria-labelledby={`${id}-label`} aria-describedby={`${id}-hint`} aria-invalid={invalid}
      placeholder={latitude ? "31.230416" : "121.473701"} />
    <small id={`${id}-hint`} className={invalid ? "coordinate-feedback invalid" : "coordinate-feedback"} aria-live="polite">
      {invalid
        ? language === "zh" ? "无法识别：请检查方向和范围，分、秒须小于 60。" : "Check direction and range; minutes and seconds must be below 60."
        : parsed !== null
          ? `${language === "zh" ? "十进制坐标" : "Decimal degrees"}: ${coordinatePreview(parsed)}°`
          : `${language === "zh" ? "示例" : "Examples"}: ${example}`}
    </small>
  </label>;
}
