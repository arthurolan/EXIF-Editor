"use client";

import maplibregl, { Map as MapLibreMap, Marker } from "maplibre-gl";
import { ExternalLink, LocateFixed, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { appleMapsCoordinates } from "./coordinate-conversion.mjs";

type Props = {
  language: "zh" | "en";
  latitude: number;
  longitude: number;
  onChange: (latitude: number, longitude: number) => void;
};

const DEFAULT_POSITION: [number, number] = [121.473701, 31.230416];
const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

function hasValidCoordinates(latitude: number, longitude: number) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}

export default function MapPicker({ language, latitude, longitude, onChange }: Props) {
  const mapNode = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const coordinateRef = useRef({ latitude, longitude });
  const [mapState, setMapState] = useState<"loading" | "ready" | "error">("loading");
  const [retryNonce, setRetryNonce] = useState(0);
  const appleMapsUrl = useMemo(() => {
    if (!hasValidCoordinates(latitude, longitude)) return null;
    const appleCoordinates = appleMapsCoordinates(latitude, longitude);
    const coordinates = `${appleCoordinates.latitude.toFixed(6)},${appleCoordinates.longitude.toFixed(6)}`;
    return `https://maps.apple.com/?ll=${encodeURIComponent(coordinates)}&q=${encodeURIComponent(coordinates)}&z=16`;
  }, [latitude, longitude]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    coordinateRef.current = { latitude, longitude };
  }, [latitude, longitude]);

  useEffect(() => {
    if (!mapNode.current) return;

    let hasLoaded = false;
    let loadTimer: number | undefined;
    const currentCoordinates = coordinateRef.current;
    const initialIsValid = hasValidCoordinates(
      currentCoordinates.latitude,
      currentCoordinates.longitude,
    );
    const initial: [number, number] = initialIsValid
      ? [currentCoordinates.longitude, currentCoordinates.latitude]
      : DEFAULT_POSITION;
    const markerNode = document.createElement("div");
    markerNode.className = "map-marker";
    markerNode.setAttribute("aria-label", "WGS-84 location");

    try {
      const map = new maplibregl.Map({
        container: mapNode.current,
        style: OPENFREEMAP_STYLE,
        center: initial,
        zoom: initialIsValid ? 13 : 10,
      });
      const marker = new maplibregl.Marker({ element: markerNode })
        .setLngLat(initial)
        .addTo(map);

      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      map.on("click", (event) => {
        marker.setLngLat(event.lngLat);
        onChangeRef.current(event.lngLat.lat, event.lngLat.lng);
      });
      map.once("load", () => {
        hasLoaded = true;
        if (loadTimer) window.clearTimeout(loadTimer);
        setMapState("ready");
      });
      map.on("error", () => {
        if (!hasLoaded) setMapState("error");
      });

      loadTimer = window.setTimeout(() => {
        if (!hasLoaded) setMapState("error");
      }, 15000);
      mapRef.current = map;
      markerRef.current = marker;
      window.setTimeout(() => map.resize(), 0);
    } catch {
      window.setTimeout(() => setMapState("error"), 0);
    }

    return () => {
      if (loadTimer) window.clearTimeout(loadTimer);
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [retryNonce]);

  useEffect(() => {
    markerRef.current?.getElement().setAttribute(
      "aria-label",
      language === "zh" ? "当前选择的位置" : "Currently selected location",
    );
  }, [language, mapState]);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    if (!hasValidCoordinates(latitude, longitude)) return;
    markerRef.current.setLngLat([longitude, latitude]);
  }, [latitude, longitude]);

  const locate = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((position) => {
      const next: [number, number] = [position.coords.longitude, position.coords.latitude];
      mapRef.current?.setCenter(next);
      mapRef.current?.setZoom(15);
      markerRef.current?.setLngLat(next);
      onChangeRef.current(next[1], next[0]);
    });
  };

  return (
    <div className="map-shell">
      <div className="map-frame">
        <div
          ref={mapNode}
          className="map-canvas"
          aria-label={language === "zh" ? "位置点选地图" : "Location picker map"}
        />
        {mapState === "loading" ? (
          <div className="map-status" role="status">
            {language === "zh" ? "正在加载地图…" : "Loading map…"}
          </div>
        ) : null}
        {mapState === "error" ? (
          <div className="map-status map-error" role="status">
            <strong>{language === "zh" ? "地图暂时无法载入" : "The map could not be loaded"}</strong>
            <span>
              {language === "zh"
                ? "仍可直接填写经纬度，照片编辑和导出不会受影响。"
                : "You can still enter coordinates directly. Editing and export remain available."}
            </span>
            <button
              type="button"
              onClick={() => {
                setMapState("loading");
                setRetryNonce((value) => value + 1);
              }}
            >
              <RefreshCw size={14} />{language === "zh" ? "重试地图" : "Retry map"}
            </button>
          </div>
        ) : null}
      </div>
      <div className="map-toolbar">
        <span>
          {language === "zh" ? "点击地图选择位置 · WGS-84" : "Click the map to choose a location · WGS-84"}
        </span>
        <div className="map-actions">
          {appleMapsUrl ? (
            <a href={appleMapsUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={14} />
              {language === "zh" ? "在 Apple 地图中查看" : "View in Apple Maps"}
            </a>
          ) : null}
          <button type="button" onClick={locate}>
            <LocateFixed size={15} />{language === "zh" ? "定位到我" : "Use my location"}
          </button>
        </div>
      </div>
    </div>
  );
}
