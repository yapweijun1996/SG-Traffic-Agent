import { API_URL, ROAD_NAMES, CORRIDOR_CONFIG } from '../constants';
import { Camera, TrafficImageApiData, TrafficCameraRaw, TrafficScore, TrafficHistoryEntry, Corridor } from '../types';
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { DB } from '../utils/db';

// Helper to convert Blob to Base64
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Remove data:image/jpeg;base64, prefix
      resolve(base64String.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Helper to convert URL to Base64 (needed for Gemini inline data)
// Includes CORS handling via multiple proxy fallbacks
async function urlToBase64(url: string): Promise<string> {

  // Strategy 1: Direct Fetch
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (response.ok) {
      const blob = await response.blob();
      return await blobToBase64(blob);
    }
  } catch (e) {
    console.warn(`Direct fetch failed for ${url}, attempting proxies...`);
  }

  // Strategy 2: wsrv.nl (Reliable Image Proxy/CDN)
  try {
    const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=jpg`;
    const response = await fetch(proxyUrl);
    if (response.ok) {
      const blob = await response.blob();
      return await blobToBase64(blob);
    }
  } catch (e) {
    console.warn(`wsrv.nl failed for ${url}`);
  }

  // Strategy 3: corsproxy.io
  try {
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl);
    if (response.ok) {
      const blob = await response.blob();
      return await blobToBase64(blob);
    }
  } catch (e) {
    console.warn(`corsproxy.io failed for ${url}`);
  }

  // Strategy 4: allorigins.win
  try {
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl);
    if (response.ok) {
      const blob = await response.blob();
      return await blobToBase64(blob);
    }
  } catch (e) {
    console.warn(`allorigins failed for ${url}`);
  }

  console.error(`All fetch attempts failed for ${url}`);
  throw new Error("Could not retrieve image data from any source.");
}

// Name mapper with fallback
function getCameraName(id: string): string {
  if (ROAD_NAMES[id]) return ROAD_NAMES[id];
  if (id.startsWith('10')) return `KJE Camera ${id}`;
  if (id.startsWith('11') || id.startsWith('77')) return `TPE Camera ${id}`;
  if (id.startsWith('15')) return `AYE Camera ${id}`;
  if (id.startsWith('17') || id.startsWith('47')) return `PIE Camera ${id}`;
  if (id.startsWith('27') || id.startsWith('67')) return `SLE/BKE Camera ${id}`;
  if (id.startsWith('57')) return `CTE Camera ${id}`;
  return `Camera ${id}`;
}

export const TrafficService = {
  // Load cached data for instant startup
  getCachedCameras: async (): Promise<Camera[]> => {
    try {
      return await DB.getCameras();
    } catch (e) {
      console.warn("Failed to load cached cameras", e);
      return [];
    }
  },

  // Main ingestion pipeline
  fetchCameras: async (previousCameras: Map<string, Camera> = new Map()): Promise<Camera[]> => {
    try {
      // 1. Fetch from API
      const response = await fetch(API_URL);
      if (!response.ok) throw new Error('Network response was not ok');

      const data: TrafficImageApiData = await response.json();
      const items = data.items[0]; // Get latest snapshot

      if (!items) return Array.from(previousCameras.values());

      // 2. Process Data
      const processedCameras = items.cameras.map((raw) => {
        const prev = previousCameras.get(raw.camera_id);

        let existingScore: TrafficScore | null = null;
        let history = prev ? [...prev.history] : [];

        // Preserve score even if image changed, valid for 10 minutes
        if (prev && prev.trafficScore) {
          const age = new Date().getTime() - new Date(prev.trafficScore.analyzedAt).getTime();
          const isFresh = age < 10 * 60 * 1000; // 10 minutes validity

          if (isFresh) {
            existingScore = prev.trafficScore;
          }
        }

        return {
          id: raw.camera_id,
          latitude: raw.location.latitude,
          longitude: raw.location.longitude,
          imageUrl: raw.image,
          timestamp: raw.timestamp,
          md5: raw.image_metadata.md5,
          locationName: getCameraName(raw.camera_id),
          trafficScore: existingScore, // Persist or Null
          history: history
        };
      });

      // 3. Cache to IndexedDB (Wait for it)
      await DB.saveCameras(processedCameras).catch(e => console.error("Failed to cache cameras", e));

      return processedCameras;

    } catch (error) {
      console.error('Error fetching traffic data:', error);

      // 4. Fallback: If network fails, return previously known state or DB state
      // If previousCameras is empty (first load), try loading from DB again just in case
      if (previousCameras.size === 0) {
        try {
          return await DB.getCameras();
        } catch (dbError) {
          throw error; // If both fail, throw original error
        }
      }

      throw error;
    }
  },

  // REAL AI Analysis using Gemini
  analyzeCameraWithGemini: async (camera: Camera, modelId: string = 'gemini-3-flash-preview', userApiKey?: string): Promise<Camera> => {
    try {
      // 1. Get potential keys from various sources
      // We use explicit references so Vite's define/replacement works correctly
      const viteApiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || (import.meta as any).env?.VITE_API_KEY;
      const processApiKey = typeof process !== 'undefined' ? (process.env?.GEMINI_API_KEY || process.env?.API_KEY) : undefined;

      const candidates = [userApiKey, viteApiKey, processApiKey];
      const actualKey = candidates.find(k =>
        k && typeof k === 'string' && k.trim().length > 10 && k !== 'PLACEHOLDER_API_KEY' && k !== 'undefined'
      );

      console.debug(`[TrafficService] Analysis trigger for ${camera.id}. Key Source: ${userApiKey ? 'User' : 'System'}. Key fragment: ${actualKey ? actualKey.substring(0, 4) + '...' : 'NONE'}`);

      if (!actualKey) {
        throw new Error("Gemini API Key is missing. Please go to the 'Settings' tab and enter a valid API Key.");
      }


      // Initialize AI inside the function to support dynamic key switching
      const ai = new GoogleGenAI({ apiKey: actualKey });

      const base64Image = await urlToBase64(camera.imageUrl);

      const scoreSchema: Schema = {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.INTEGER, description: "0-100 traffic density score. 0=Empty, 100=Gridlock." },
          label: { type: Type.STRING, enum: ['CLEAR', 'MODERATE', 'HEAVY', 'CONGESTED'] },
          description: { type: Type.STRING, description: "Short, punchy analysis of the visual traffic situation." },
          trend: { type: Type.STRING, enum: ['UP', 'DOWN', 'FLAT'], description: "Visual estimation of flow. If cars are stopped, trend is worsening (UP)." }
        },
        required: ["score", "label", "description", "trend"]
      };

      const response = await ai.models.generateContent({
        model: modelId,
        contents: {
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
            {
              text: `You are a Singapore Land Transport Authority traffic analyst. 
                     Analyze this CCTV footage for traffic density. 
                     Singapore roads are left-hand drive. 
                     Ignore parked cars on shoulders if any.
                     Focus on the main carriageway.
                     Return a JSON object with a traffic score (0-100).` }
          ]
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: scoreSchema,
          systemInstruction: "You are a precise traffic monitoring AI. Be conservative with high scores."
        }
      });

      const parsedResult = JSON.parse(response.text || "{}");

      const newScore: TrafficScore = {
        score: parsedResult.score || 0,
        confidence: 0.9,
        trend: parsedResult.trend || 'FLAT',
        delta: 0,
        description: parsedResult.description || "Traffic analyzed by Gemini AI.",
        label: parsedResult.label || 'CLEAR',
        analyzedAt: new Date().toISOString()
      };

      // Update history
      const newHistory = [...camera.history, { timestamp: new Date().toISOString(), score: newScore.score }];
      if (newHistory.length > 10) newHistory.shift();

      // Calculate Delta if we have history
      if (newHistory.length >= 2) {
        newScore.delta = newScore.score - newHistory[newHistory.length - 2].score;
      }

      const updatedCamera = {
        ...camera,
        trafficScore: newScore,
        history: newHistory
      };

      // Update in DB immediately
      await DB.updateCamera(updatedCamera);

      return updatedCamera;

    } catch (error) {
      console.error(`Gemini Analysis failed for ${camera.id} with model ${modelId}:`, error);
      throw error; // Propagate error so UI can show API Key error if needed
    }
  },

  // Batch Analysis with Concurrency Control
  analyzeBatch: async (
    cameras: Camera[],
    onProgress: (updatedCamera: Camera) => void,
    onItemComplete?: () => void,
    modelId: string = 'gemini-3-flash-preview',
    apiKey?: string
  ) => {
    // Process in chunks to respect browser/API limits
    const CHUNK_SIZE = 3;

    for (let i = 0; i < cameras.length; i += CHUNK_SIZE) {
      const chunk = cameras.slice(i, i + CHUNK_SIZE);

      await Promise.all(chunk.map(async (camera) => {
        try {
          const updated = await TrafficService.analyzeCameraWithGemini(camera, modelId, apiKey);
          // Only trigger progress update if we actually got a score (analysis succeeded)
          if (updated.trafficScore) {
            onProgress(updated);
          }
        } catch (e) {
          console.error(`Batch item failed: ${camera.id}`, e);
        } finally {
          if (onItemComplete) onItemComplete();
        }
      }));

      // Small breather between chunks to avoid rate limiting
      if (i + CHUNK_SIZE < cameras.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  },

  // Planner Layer: Analyze corridors based on available scores
  analyzeCorridors: (cameras: Camera[]): Corridor[] => {
    return CORRIDOR_CONFIG.map(config => {
      const corridorCameras = cameras.filter(c =>
        config.pattern.test(c.locationName) || config.pattern.test(c.id)
      );

      if (corridorCameras.length === 0) return null;

      // Only count cameras that have been analyzed
      const analyzedCameras = corridorCameras.filter(c => c.trafficScore !== null);

      if (analyzedCameras.length === 0) {
        return {
          id: config.id,
          name: config.name,
          cameraIds: corridorCameras.map(c => c.id),
          avgScore: 0,
          status: 'UNKNOWN',
          trend: 'UNKNOWN'
        };
      }

      const totalScore = analyzedCameras.reduce((sum, c) => sum + (c.trafficScore?.score || 0), 0);
      const avgScore = Math.round(totalScore / analyzedCameras.length);

      const upVotes = analyzedCameras.filter(c => c.trafficScore?.trend === 'UP').length;
      const downVotes = analyzedCameras.filter(c => c.trafficScore?.trend === 'DOWN').length;

      let trend: Corridor['trend'] = 'STABLE';
      if (upVotes > downVotes) trend = 'WORSENING';
      else if (downVotes > upVotes) trend = 'IMPROVING';

      let status: Corridor['status'] = 'CLEAR';
      if (avgScore > 75) status = 'HEAVY';
      else if (avgScore > 50) status = 'MODERATE';

      return {
        id: config.id,
        name: config.name,
        cameraIds: corridorCameras.map(c => c.id),
        avgScore,
        status,
        trend
      };
    }).filter((c): c is Corridor => c !== null).sort((a, b) => b.avgScore - a.avgScore);
  }
};