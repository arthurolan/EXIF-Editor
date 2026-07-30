"use client";

import L, { Map as LeafletMap, CircleMarker } from "leaflet";
import { LocateFixed } from "lucide-react";
import { useEffect, useRef } from "react";

type Props = {
  language: "zh" | "en";
  latitude: number;
  longitude: number;
  onChange: (latitude: number, longitude: number) => void;
};

const DEFAULT_POSITION: [number, number] = [31.230416, 121.473701];

export default function MapPicker({ language, latitude, longitude, onChange }: Props) {
  const mapNode = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<CircleMarker | null>(null);
  const onChangeRef = useRef(onChange);
  const initialPositionRef = useRef<[number, number]>(
    Number.isFinite(latitude) && Number.isFinite(longitude)
      ? [latitude, longitude]
      : DEFAULT_POSITION,
  );
  const initialHasCoordinatesRef = useRef(
    Number.isFinite(latitude) && Number.isFinite(longitude),
  );

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!mapNode.current || mapRef.current) return;
    const valid = initialHasCoordinatesRef.current;
    const initial = initialPositionRef.current;
    const map = L.map(mapNode.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView(initial, valid ? 13 : 10);

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    const marker = L.circleMarker(initial, {
      radius: 9,
      color: "#fffaf0",
      weight: 3,
      fillColor: "#ef6b32",
      fillOpacity: 1,
    }).addTo(map);

    map.on("click", (event: L.LeafletMouseEvent) => {
      marker.setLatLng(event.latlng);
      onChangeRef.current(event.latlng.lat, event.latlng.lng);
    });

    mapRef.current = map;
    markerRef.current = marker;
    window.setTimeout(() => map.invalidateSize(), 0);

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    markerRef.current.setLatLng([latitude, longitude]);
  }, [latitude, longitude]);

  const locate = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((position) => {
      const next: [number, number] = [position.coords.latitude, position.coords.longitude];
      mapRef.current?.setView(next, 15);
      markerRef.current?.setLatLng(next);
      onChangeRef.current(...next);
    });
  };

  return (
    <div className="map-shell">
      <div
        ref={mapNode}
        className="map-canvas"
        aria-label={language === "zh" ? "位置点选地图" : "Location picker map"}
      />
      <div className="map-toolbar">
        <span>
          {language === "zh" ? "点击地图选择位置 · WGS-84" : "Click the map to choose a location · WGS-84"}
        </span>
        <button type="button" onClick={locate}>
          <LocateFixed size={15} />{language === "zh" ? "定位到我" : "Use my location"}
        </button>
      </div>
    </div>
  );
}
