import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { Camera } from '../types';

interface MapViewProps {
  cameras: Camera[];
  onSelectCamera: (camera: Camera) => void;
  userLocation?: { lat: number; lng: number } | null;
}

const MapView: React.FC<MapViewProps> = ({ cameras, onSelectCamera, userLocation }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.CircleMarker>>(new Map());

  // Initialize Map
  useEffect(() => {
    if (!mapContainer.current || mapInstance.current) return;

    mapInstance.current = L.map(mapContainer.current, {
      zoomControl: false,
      attributionControl: false,
      preferCanvas: false,
    }).setView([1.3521, 103.8198], 11);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(mapInstance.current);

    // Zoom control top-right
    L.control.zoom({ position: 'topright' }).addTo(mapInstance.current);

    return () => {
      // Cleanup: remove all markers and map instance
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current.clear();

      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  // Update Markers
  useEffect(() => {
    if (!mapInstance.current) return;

    const map = mapInstance.current;
    const currentIds = new Set(cameras.map(c => c.id));

    // Remove old markers
    markersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    });

    // Add/Update markers
    cameras.forEach(camera => {
      const existing = markersRef.current.get(camera.id);

      // Color based on traffic score
      const getColor = (score: number | undefined) => {
        if (score === undefined) return '#94a3b8'; // Slate-400 (not analyzed)
        if (score >= 80) return '#ef4444'; // Red-500 (heavy congestion)
        if (score >= 50) return '#f97316'; // Orange-500 (moderate)
        return '#22c55e'; // Green-500 (clear)
      };

      const score = camera.trafficScore?.score;
      const color = getColor(score);

      if (existing) {
        // Update existing marker color
        existing.setStyle({ fillColor: color, color: '#ffffff' });
      } else {
        // Create new marker
        const marker = L.circleMarker([camera.latitude, camera.longitude], {
          radius: 10,
          fillColor: color,
          color: '#ffffff',
          weight: 3,
          opacity: 1,
          fillOpacity: 0.85,
        }).addTo(map);

        marker.on('click', () => onSelectCamera(camera));

        // Tooltip with camera name and score
        const tooltipText = score !== undefined
          ? `${camera.locationName}: ${score}`
          : camera.locationName;
        marker.bindTooltip(tooltipText, {
          direction: 'top',
          offset: [0, -12],
          className: 'leaflet-tooltip-custom'
        });

        markersRef.current.set(camera.id, marker);
      }
    });
  }, [cameras, onSelectCamera]);

  // Handle User Location (future feature)
  useEffect(() => {
    if (userLocation && mapInstance.current) {
      // Could add a user location marker here
    }
  }, [userLocation]);

  return <div ref={mapContainer} className="h-full w-full z-0" />;
};

export default MapView;