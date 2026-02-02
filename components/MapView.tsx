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
    }).setView([1.3521, 103.8198], 11);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(mapInstance.current);

    // Zoom control top-right
    L.control.zoom({ position: 'topright' }).addTo(mapInstance.current);

    return () => {
      mapInstance.current?.remove();
      mapInstance.current = null;
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
      
      // Gray if not analyzed yet
      const getColor = (score: number | undefined) => {
        if (score === undefined) return '#94a3b8'; // Slate-400
        if (score >= 80) return '#ef4444'; // Red-500
        if (score >= 50) return '#f97316'; // Orange-500
        return '#22c55e'; // Green-500
      };

      const score = camera.trafficScore?.score;
      const color = getColor(score);
      
      if (existing) {
        existing.setStyle({ fillColor: color, color: '#ffffff' });
      } else {
        const marker = L.circleMarker([camera.latitude, camera.longitude], {
          radius: 8,
          fillColor: color,
          color: '#ffffff',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.9,
        }).addTo(map);

        marker.on('click', () => onSelectCamera(camera));
        // Add a simple tooltip
        const tooltipText = score !== undefined ? `Score: ${score}` : 'Tap to analyze';
        marker.bindTooltip(tooltipText, { 
          direction: 'top', 
          offset: [0, -10],
          className: 'px-2 py-1 bg-slate-800 text-white text-xs rounded shadow-lg border-0'
        });

        markersRef.current.set(camera.id, marker);
      }
    });
  }, [cameras, onSelectCamera]);

  // Handle User Location
  useEffect(() => {
    if (userLocation && mapInstance.current) {
      // Could add a specialized user marker here
    }
  }, [userLocation]);

  return <div ref={mapContainer} className="h-full w-full z-0" />;
};

export default MapView;