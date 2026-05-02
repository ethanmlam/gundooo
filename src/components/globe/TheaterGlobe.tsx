import Globe from 'react-globe.gl';
import { useEffect, useMemo, useRef } from 'react';
import type { Theater } from '../../data/theaters';
import { importantPlaces } from '../../data/cities';

type Props = {
  theaters: Theater[];
  onSelect: (theater: Theater) => void;
};

export function TheaterGlobe({ theaters, onSelect }: Props) {
  const globeRef = useRef<any>(null);
  const points = useMemo(() => theaters.map((t) => ({ ...t, size: t.risk === 'High' ? 0.42 : 0.28 })), [theaters]);
  const labels = useMemo(() => {
    const activeTheaters = theaters.map((t) => ({ ...t, kind: 'theater' as const, priority: 120 }));
    const priorityByName: Record<string, number> = {
      'Strait of Hormuz': 115,
      'Taiwan Strait': 112,
      'Malacca Strait': 110,
      'Suez Canal': 108,
      'Bab el-Mandeb': 106,
      'South China Sea': 102,
      'Persian Gulf': 98,
      'Red Sea': 96,
      'Black Sea': 90,
      'Baltic Sea': 86,
      Singapore: 84,
      Dubai: 82,
      Tokyo: 80,
      Shanghai: 78,
      Beijing: 76,
      London: 74,
      'New York': 72,
      'Washington DC': 70,
      'San Francisco': 68,
    };
    const candidates = [...activeTheaters, ...importantPlaces]
      .map((place: any) => ({
        ...place,
        priority: place.priority ?? priorityByName[place.name] ?? (place.kind === 'chokepoint' ? 88 : place.kind === 'sea' ? 48 : 42),
      }))
      .sort((a, b) => b.priority - a.priority);

    const angularDistance = (a: any, b: any) => {
      const toRad = Math.PI / 180;
      const lat1 = a.lat * toRad;
      const lat2 = b.lat * toRad;
      const dLat = (b.lat - a.lat) * toRad;
      const dLng = (b.lng - a.lng) * toRad;
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
      return 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) / toRad;
    };

    return candidates.reduce<any[]>((kept, label) => {
      const labelPadding = label.kind === 'theater' || label.kind === 'chokepoint' ? 11 : label.kind === 'sea' ? 14 : 8;
      const textWidthPadding = Math.min(8, label.name.length * 0.22);
      const minDistance = labelPadding + textWidthPadding;
      if (kept.some((existing) => angularDistance(existing, label) < Math.max(minDistance, existing.minDistance * 0.72))) {
        return kept;
      }
      return [...kept, { ...label, minDistance }];
    }, []).slice(0, 42);
  }, [theaters]);

  useEffect(() => {
    const controls = globeRef.current?.controls?.();
    if (controls) {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.45;
    }
    globeRef.current?.pointOfView?.({ lat: 19, lng: 105, altitude: 2.05 }, 900);
  }, []);

  return <Globe
    ref={globeRef}
    backgroundColor="rgba(0,0,0,0)"
    globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
    bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
    pointsData={points}
    pointLat="lat"
    pointLng="lng"
    pointAltitude={0.025}
    pointRadius="size"
    pointColor={(d: any) => d.risk === 'High' ? '#f59e0b' : '#d4a552'}
    pointLabel={(d: any) => `${d.name} · ${d.risk}`}
    onPointClick={(d: any) => onSelect(d)}
    labelsData={labels}
    labelLat="lat"
    labelLng="lng"
    labelText="name"
    labelSize={(d: any) => d.kind === 'theater' || d.kind === 'chokepoint' ? 0.82 : d.kind === 'sea' ? 0.7 : 0.54}
    labelDotRadius={(d: any) => d.kind === 'city' ? 0.045 : 0.075}
    labelColor={(d: any) => d.kind === 'theater' ? 'rgba(255,255,255,0.92)' : d.kind === 'chokepoint' ? 'rgba(255,180,80,0.84)' : d.kind === 'sea' ? 'rgba(91,216,247,0.58)' : 'rgba(210,218,230,0.44)'}
    labelAltitude={(d: any) => d.kind === 'city' ? 0.01 : 0.014}
    labelResolution={2}
    arcsData={points.filter((p) => p.risk === 'High').map((p) => ({ startLat: p.lat, startLng: p.lng, endLat: p.lat + 6, endLng: p.lng + 18 }))}
    arcStartLat="startLat"
    arcStartLng="startLng"
    arcEndLat="endLat"
    arcEndLng="endLng"
    arcColor={() => ['rgba(255,79,95,.15)', 'rgba(255,79,95,.55)']}
    arcDashLength={0.35}
    arcDashGap={2}
    arcDashAnimateTime={3200}
  />;
}
