// API Response Types
export interface TrafficImageApiData {
  items: {
    timestamp: string;
    cameras: TrafficCameraRaw[];
  }[];
  api_info: {
    status: string;
  };
}

export interface TrafficCameraRaw {
  timestamp: string;
  image: string;
  location: {
    latitude: number;
    longitude: number;
  };
  camera_id: string;
  image_metadata: {
    height: number;
    width: number;
    md5: string;
  };
}

// App Domain Types
export interface Camera {
  id: string;
  latitude: number;
  longitude: number;
  imageUrl: string;
  timestamp: string;
  md5: string;
  locationName: string; // Derived or mapped name
  trafficScore: TrafficScore | null; // Null means not yet analyzed by AI
  history: TrafficHistoryEntry[]; // Memory layer
  isAnalyzing?: boolean;
}

export interface TrafficHistoryEntry {
  timestamp: string;
  score: number;
}

export interface TrafficScore {
  score: number; // 0-100
  confidence: number; // 0-1
  trend: 'UP' | 'DOWN' | 'FLAT';
  delta: number;
  description: string; // Agentic insight
  label: 'CLEAR' | 'MODERATE' | 'HEAVY' | 'CONGESTED';
  analyzedAt: string; // ISO string of when AI performed analysis
}

export interface Corridor {
  id: string;
  name: string;
  cameraIds: string[];
  avgScore: number;
  status: 'CLEAR' | 'MODERATE' | 'HEAVY' | 'UNKNOWN';
  trend: 'IMPROVING' | 'WORSENING' | 'STABLE' | 'UNKNOWN';
}

export enum ViewState {
  MAP = 'MAP',
  LIST = 'LIST',
  WATCHLIST = 'WATCHLIST',
  SUMMARY = 'SUMMARY',
  SETTINGS = 'SETTINGS',
}

export type SortOption = 'SCORE_DESC' | 'SCORE_ASC' | 'DISTANCE';

export interface UserPreferences {
  refreshInterval: number; // in seconds
  autoRefresh: boolean;
  showHeatmap: boolean;
  modelId: string; // Selected Gemini Model ID
  apiKey?: string; // Optional user-provided Gemini API Key
}