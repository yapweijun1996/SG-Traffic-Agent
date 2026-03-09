import { API_URL, ROAD_NAMES, CORRIDOR_CONFIG, GEMMA_DEFAULT_MODEL, GEMINI_USER_KEY_MODELS } from '../constants';
import { Camera, TrafficImageApiData, TrafficCameraRaw, TrafficScore, Corridor } from '../types';
import { DB } from '../utils/db';
import { callGeminiAPI, extractGeminiText } from './geminiTransport';

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

function parseTrafficAnalysis(rawText: string): Record<string, any> {
  const text = rawText
    .replace(/```json\s*/gi, '')
    .replace(/```/g, '')
    .trim();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('Gemma returned a non-JSON response.');
    }
    return JSON.parse(text.slice(start, end + 1));
  }
}

function normalizeUserApiKey(key?: string): string | null {
  if (!key || typeof key !== 'string') return null;
  const trimmed = key.trim();
  if (trimmed.length <= 10 || trimmed === 'PLACEHOLDER_API_KEY' || trimmed === 'undefined') {
    return null;
  }
  return trimmed;
}

function buildTrafficAnalysisParts(base64Image: string) {
  return [
    { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
    {
      text: `Rate traffic congestion from this single Singapore road CCTV image.
Score the worst affected visible main carriageway direction, not the average of both directions.
If one carriageway is heavily queued while the other still moves, score from the queued carriageway.
Ignore shoulders, slip roads unless they block the mainline, parked vehicles, and tiny distant vehicles.
Singapore roads are left-hand drive.

Work through this checklist internally before answering:
1. Identify the main visible carriageway directions.
2. Pick the worst affected direction only.
3. Check for queue length, brake-light density, stopped vehicles, cones, officers, or blocked lanes.
4. Decide whether traffic is free flow, dense but moving, queued, stop-go, or near standstill.
5. Apply the scoring guide to that worst affected direction.
6. Map the score to the label and infer trend from visible queue growth or clearing.
Do not reveal this reasoning. Output only the final JSON object.

Visual rules:
- Long dense queue of many vehicles in one direction = HEAVY or CONGESTED
- Mostly red brake lights or bumper-to-bumper spacing = HEAVY or CONGESTED
- Officers, cones, stopped vehicles, or blocked lanes on the carriageway = incident; do not score below 70 if upstream traffic is queueing
- Near standstill or tailback through most of the visible direction = 80 to 100
- Free flow requires healthy spacing and no meaningful queue in the scored direction

Score guide:
- 0 to 19: almost empty or very light free flow
- 20 to 34: light flow with healthy gaps
- 35 to 49: moderate moving traffic with some compression
- 50 to 69: heavy moving traffic or clear queue
- 70 to 84: sustained queue / stop-go / incident spillback
- 85 to 100: near standstill or severe lane-blocking tailback

Label mapping:
CLEAR for 0-24
MODERATE for 25-44
HEAVY for 45-69
CONGESTED for 70-100

Trend guidance:
UP if a visible queue tail, brake-light compression, incident spillback, or lane blockage suggests worsening
DOWN if a queue is clearly clearing and spacing is reopening
otherwise FLAT

Description requirements:
- 6 to 12 words
- mention the dominant problem: queue, blockage, lane closure, dense but moving, or checkpoint tailback
- do not guess road names, destinations, or locations not directly visible

Return exactly one JSON object:
{"score":0,"label":"CLEAR","description":"free flow with wide gaps","trend":"FLAT"}

Rules:
- score must be an integer from 0 to 100
- label must be CLEAR, MODERATE, HEAVY, or CONGESTED
- trend must be UP, DOWN, or FLAT
- no markdown
- no extra explanation`
    }
  ];
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
  analyzeCameraWithGemini: async (camera: Camera, modelId: string = GEMMA_DEFAULT_MODEL, userApiKey?: string): Promise<Camera> => {
    try {
      const validUserKey = normalizeUserApiKey(userApiKey);
      const wantsGeminiUserModel = GEMINI_USER_KEY_MODELS.has(modelId);
      const base64Image = await urlToBase64(camera.imageUrl);
      const parts = buildTrafficAnalysisParts(base64Image);
      const generationConfig = {
        temperature: 0.1,
        topP: 0.9,
        topK: 20,
        ...(wantsGeminiUserModel ? { maxOutputTokens: 128 } : {}),
      };

      let response;

      if (wantsGeminiUserModel && validUserKey) {
        try {
          response = await callGeminiAPI({
            model: modelId,
            parts,
            generationConfig,
            primaryKeys: [validUserKey],
            fallbackKeys: [],
          });
        } catch (geminiError) {
          console.warn(`[TrafficService] Falling back to ${GEMMA_DEFAULT_MODEL} after Gemini user-key failure for ${camera.id}`, geminiError);
          response = await callGeminiAPI({
            model: GEMMA_DEFAULT_MODEL,
            parts,
            generationConfig,
          });
        }
      } else {
        response = await callGeminiAPI({
          model: GEMMA_DEFAULT_MODEL,
          parts,
          generationConfig,
        });
      }

      const parsedResult = parseTrafficAnalysis(extractGeminiText(response) || '');

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
      if (error instanceof Error && error.message.includes('Gemini API keys are unavailable')) {
        throw new Error("Gemini API keys are missing. Add encrypted keys to gemma_code.jsonl or provide a fallback key in Settings.");
      }
      throw error; // Propagate error so UI can show API Key error if needed
    }
  },

  // Batch Analysis with Concurrency Control
  analyzeBatch: async (
    cameras: Camera[],
    onProgress: (updatedCamera: Camera) => void,
    onItemComplete?: () => void,
    modelId: string = GEMMA_DEFAULT_MODEL,
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
