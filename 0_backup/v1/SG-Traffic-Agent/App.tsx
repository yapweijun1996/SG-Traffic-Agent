import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Layout from './components/Layout';
import MapView from './components/MapView';
import CameraList from './components/CameraList';
import CameraDetailModal from './components/CameraDetailModal';
import { ViewState, Camera, UserPreferences, Corridor } from './types';
import { TrafficService } from './services/trafficService';
import { Storage } from './utils/storage';
import { DB } from './utils/db';
import { DEFAULT_PREFERENCES, AVAILABLE_MODELS } from './constants';
import { AlertTriangle, Loader2, ArrowUpRight, ArrowDownRight, Minus, Route, Cpu, ShieldCheck } from 'lucide-react';

const App: React.FC = () => {
  // --- State ---
  const [currentView, setCurrentView] = useState<ViewState>(ViewState.MAP);

  // Data State
  const [cameras, setCameras] = useState<Map<string, Camera>>(new Map());
  const [corridors, setCorridors] = useState<Corridor[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Batch Analysis State
  const [isBatchAnalyzing, setIsBatchAnalyzing] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number, total: number } | null>(null);

  // User State
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [watchlistIds, setWatchlistIds] = useState<string[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);

  // --- Initialization & Data Fetching ---

  // Load local data on mount (Sync + Async)
  useEffect(() => {
    // 1. Sync Load (Preferences)
    const savedWatchlist = Storage.getWatchlist();
    const savedPrefs = Storage.getPreferences();
    setWatchlistIds(savedWatchlist);
    setPreferences(savedPrefs);

    // 2. Async Load (Cached Cameras from IndexedDB)
    const loadAndFetch = async () => {
      try {
        const cached = await TrafficService.getCachedCameras();
        let initialMap = new Map<string, Camera>();

        if (cached.length > 0) {
          // Explicitly type the Map to ensure values are treated as Camera objects
          initialMap = new Map<string, Camera>(cached.map(c => [c.id, c]));
          setCameras(initialMap);
          setLastUpdated(new Date(cached[0].timestamp)); // Approximate
          setIsLoading(false); // Remove loading screen immediately if cache exists
          console.log(`[App] Loaded ${cached.length} cameras from cache`);
        }

        // 3. Trigger Network Fetch after attempting cache load
        // Pass the loaded map directly to avoid closure staleness
        await fetchData(initialMap);
      } catch (e) {
        console.error("Failed to load initial data", e);
        // Fallback to basic fetch
        fetchData();
      }
    };

    loadAndFetch();
  }, []);

  // Update Corridors whenever cameras change (including single or batch updates)
  useEffect(() => {
    // Explicitly type the list to ensure it recognized as Camera[]
    const list: Camera[] = Array.from(cameras.values());
    if (list.length > 0) {
      setCorridors(TrafficService.analyzeCorridors(list));
    }
  }, [cameras]);

  const fetchData = useCallback(async (overrideCameras?: Map<string, Camera>) => {
    // Only show loading if we have NO data at all
    // If overrideCameras is provided, we have data
    const camerasToUse = overrideCameras || cameras;
    setIsLoading(prev => camerasToUse.size === 0);
    setError(null);
    try {
      // Pass existing cameras (which might be from DB) to maintain history and SCORES
      const data = await TrafficService.fetchCameras(camerasToUse);
      // Explicitly type the Map
      const cameraMap = new Map<string, Camera>(data.map(c => [c.id, c]));
      setCameras(cameraMap);
      setLastUpdated(new Date());
    } catch (err) {
      console.error(err);
      if (camerasToUse.size === 0) {
        setError('Failed to update traffic data. Please check your connection.');
      } else {
        // If we have data, just log error, don't block UI
        console.warn("Network update failed, using cached data.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [cameras]); // Dependency on 'cameras' allows history tracking

  // Auto-refresh interval
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (preferences.autoRefresh) {
        fetchData();
      }
    }, preferences.refreshInterval * 1000);

    return () => clearInterval(intervalId);
  }, [preferences.refreshInterval, preferences.autoRefresh, fetchData]);

  // --- Handlers ---

  const handleToggleWatchlist = (id: string) => {
    const newWatchlist = watchlistIds.includes(id)
      ? watchlistIds.filter(wid => wid !== id)
      : [...watchlistIds, id];

    setWatchlistIds(newWatchlist);
    Storage.setWatchlist(newWatchlist);
  };

  const handleSelectCamera = (camera: Camera) => {
    setSelectedCamera(camera);
  };

  const handleCameraUpdate = async (updatedCamera: Camera) => {
    // When a camera is analyzed in the modal, we update the global state
    setCameras(prev => {
      const newMap = new Map(prev);
      newMap.set(updatedCamera.id, updatedCamera);
      return newMap;
    });
    // Also update the selected camera if it's open
    if (selectedCamera?.id === updatedCamera.id) {
      setSelectedCamera(updatedCamera);
    }

    // Save to IndexedDB to persist analysis
    try {
      await DB.updateCamera(updatedCamera);
      console.log(`[App] Persisted analysis for ${updatedCamera.id} to IndexedDB`);
    } catch (e) {
      console.error(`[App] Failed to persist camera ${updatedCamera.id}`, e);
    }
  };

  const handleBatchAnalyze = async (targets: Camera[]) => {
    if (isBatchAnalyzing || targets.length === 0) return;
    setIsBatchAnalyzing(true);
    setBatchProgress({ current: 0, total: targets.length });

    let processedCount = 0;

    // Optimistic / incremental updates
    await TrafficService.analyzeBatch(
      targets,
      (updatedCamera) => {
        handleCameraUpdate(updatedCamera);
      },
      () => {
        processedCount++;
        setBatchProgress({ current: processedCount, total: targets.length });
      },
      preferences.modelId, // Pass the selected model ID
      preferences.apiKey // Pass the user-provided API Key
    );

    setIsBatchAnalyzing(false);
    setBatchProgress(null);
  };

  const handleSelectCorridor = (corridor: Corridor) => {
    const firstCam = cameras.get(corridor.cameraIds[0]);
    if (firstCam) setSelectedCamera(firstCam);
  };

  const handleClearData = async () => {
    try {
      localStorage.clear();
      await DB.clearAll();
      window.location.reload();
    } catch (e) {
      console.error("Failed to clear data", e);
      window.location.reload();
    }
  };

  // --- Derived Data ---

  const cameraList = useMemo(() => Array.from(cameras.values()), [cameras]);

  const watchlistCameras = useMemo(() => {
    return cameraList.filter(c => watchlistIds.includes(c.id));
  }, [cameraList, watchlistIds]);

  const sortedByScore = useMemo(() => {
    // Push unanalyzed cameras to the bottom or treat as score 0
    return [...cameraList].sort((a, b) => (b.trafficScore?.score || -1) - (a.trafficScore?.score || -1));
  }, [cameraList]);

  const anomalies = useMemo(() => {
    return sortedByScore.filter(c => (c.trafficScore?.score || 0) > 85);
  }, [sortedByScore]);

  const analyzedCount = useMemo(() => {
    return cameraList.filter(c => c.trafficScore !== null).length;
  }, [cameraList]);

  // --- Render Views ---

  const renderContent = () => {
    if (isLoading && cameras.size === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
          <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
          <p>Connecting to Singapore Traffic Agents...</p>
        </div>
      );
    }

    if (error && cameras.size === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-6 text-center">
          <AlertTriangle className="w-12 h-12 text-amber-500 mb-4" />
          <h2 className="text-xl font-bold text-slate-800">Connection Failed</h2>
          <p className="text-slate-500 mt-2 mb-6">{error}</p>
          <button
            onClick={fetchData}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
          >
            Retry Connection
          </button>
        </div>
      );
    }

    switch (currentView) {
      case ViewState.MAP:
        return (
          <div className="h-full w-full relative">
            <MapView
              cameras={cameraList}
              onSelectCamera={handleSelectCamera}
            />
            <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-md p-3 rounded-xl shadow-lg border border-slate-200 z-[400] max-w-[200px]">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">AI Status</div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${analyzedCount > 0 ? 'bg-green-500' : 'bg-slate-300'} ${isBatchAnalyzing ? 'animate-ping' : ''}`} />
                <span className="text-sm font-semibold text-slate-700">
                  {analyzedCount} / {cameraList.length} Analyzed
                </span>
              </div>
              {isBatchAnalyzing && (
                <div className="text-[10px] text-blue-600 font-medium mt-1 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {batchProgress ? `Processing ${batchProgress.current}/${batchProgress.total}` : 'Batch Processing...'}
                </div>
              )}
              {anomalies.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-200 text-xs text-red-600 font-bold flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {anomalies.length} High Congestion
                </div>
              )}
            </div>
          </div>
        );

      case ViewState.LIST:
        return (
          <CameraList
            cameras={sortedByScore}
            title="Congestion Ranking"
            onSelectCamera={handleSelectCamera}
            emptyMessage="Tap a camera on the map to analyze traffic."
            onAnalyzeBatch={handleBatchAnalyze}
            isAnalyzing={isBatchAnalyzing}
            progress={batchProgress}
          />
        );

      case ViewState.WATCHLIST:
        return (
          <CameraList
            cameras={watchlistCameras}
            title="My Watchlist"
            emptyMessage="No cameras saved. Star a camera to add it here."
            onSelectCamera={handleSelectCamera}
            onAnalyzeBatch={handleBatchAnalyze}
            isAnalyzing={isBatchAnalyzing}
            progress={batchProgress}
          />
        );

      case ViewState.SUMMARY:
        return (
          <div className="p-4 md:p-6 max-w-3xl mx-auto overflow-y-auto h-full pb-20">
            <h2 className="text-2xl font-bold mb-6 text-slate-800">Traffic Intelligence Report</h2>

            {/* Dynamic Summary Card */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-6">
              <h3 className="font-semibold text-lg mb-4 text-blue-900 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-blue-600" />
                Current Situation
              </h3>
              <p className="text-slate-600 leading-relaxed mb-4">
                {analyzedCount === 0 ? (
                  "No cameras have been analyzed yet. Tap 'Analyze' in the List view or select a camera to start."
                ) : (
                  <>
                    The AI has analyzed <strong>{analyzedCount}</strong> locations.
                    There are currently <strong>{anomalies.length} high-congestion zones</strong> detected.
                  </>
                )}
              </p>
            </div>

            {/* Corridor Ranking */}
            <div className="mb-6">
              <h3 className="font-semibold text-lg mb-3 text-slate-800 flex items-center gap-2">
                <Route className="w-5 h-5 text-slate-500" />
                Corridor Status (Based on AI Data)
              </h3>
              <div className="space-y-3">
                {corridors.map(c => (
                  <div
                    key={c.id}
                    onClick={() => handleSelectCorridor(c)}
                    className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between cursor-pointer hover:border-blue-300 transition-colors"
                  >
                    <div>
                      <div className="font-bold text-slate-800">{c.name}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-2">
                        {c.status === 'UNKNOWN' ? (
                          <span className="text-slate-400">Not enough data</span>
                        ) : (
                          <>
                            <span>Avg Score: {c.avgScore}</span>
                            <span className="text-slate-300">•</span>
                            <span className={`${c.status === 'HEAVY' ? 'text-red-500' : c.status === 'MODERATE' ? 'text-orange-500' : 'text-green-500'}`}>
                              {c.status}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      {c.trend === 'WORSENING' && <div className="flex items-center text-red-500 text-xs font-bold"><ArrowUpRight className="w-4 h-4 mr-1" /> Worsening</div>}
                      {c.trend === 'IMPROVING' && <div className="flex items-center text-green-500 text-xs font-bold"><ArrowDownRight className="w-4 h-4 mr-1" /> Improving</div>}
                      {c.trend === 'STABLE' && <div className="flex items-center text-slate-400 text-xs font-bold"><Minus className="w-4 h-4 mr-1" /> Stable</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="text-xs text-slate-400 text-center pb-8">
              Last analysis: {lastUpdated?.toLocaleTimeString()}
            </div>
          </div>
        );

      case ViewState.SETTINGS:
        return (
          <div className="p-6 max-w-lg mx-auto">
            <h2 className="text-2xl font-bold mb-6 text-slate-800">Settings</h2>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden space-y-px">

              {/* Model Selection */}
              <div className="p-4 bg-white flex flex-col gap-2">
                <div className="flex items-center gap-2 mb-1">
                  <Cpu className="w-5 h-5 text-blue-600" />
                  <span className="font-semibold text-slate-800">AI Model</span>
                </div>
                <p className="text-xs text-slate-500 mb-2">Select the Gemini model used for traffic analysis.</p>
                <select
                  value={preferences.modelId}
                  onChange={(e) => {
                    const newPrefs = { ...preferences, modelId: e.target.value };
                    setPreferences(newPrefs);
                    Storage.setPreferences(newPrefs);
                  }}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  {AVAILABLE_MODELS.map(model => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* API Key Setup */}
              <div className="p-4 bg-white flex flex-col gap-2 border-t border-slate-100">
                <div className="flex items-center gap-2 mb-1">
                  <div className="bg-amber-100 p-1 rounded-md text-amber-600">
                    <Cpu className="w-4 h-4" />
                  </div>
                  <span className="font-semibold text-slate-800">Gemini API Key</span>
                </div>
                <p className="text-xs text-slate-500 mb-2">
                  Enter your Gemini API key to enable AI traffic analysis. You can get one from the <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Google AI Studio</a>.
                </p>
                <div className="relative">
                  <input
                    type="password"
                    value={preferences.apiKey || ''}
                    onChange={(e) => {
                      const newPrefs = { ...preferences, apiKey: e.target.value };
                      setPreferences(newPrefs);
                      Storage.setPreferences(newPrefs);
                    }}
                    placeholder="Enter your API Key"
                    className="w-full p-2 pr-10 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                  {preferences.apiKey && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                  )}
                </div>
                {!preferences.apiKey && (
                  <div className="flex items-center gap-1.5 mt-1 text-amber-600 bg-amber-50 p-2 rounded-md border border-amber-100">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-bold uppercase tracking-tight">AI Offline: Key Required</span>
                  </div>
                )}
              </div>

              {/* Auto Refresh Toggle */}
              <div className="p-4 bg-white flex items-center justify-between border-t border-slate-100">
                <span className="font-medium text-slate-700">Auto Refresh (5 min)</span>
                <button
                  onClick={() => {
                    const newPrefs = { ...preferences, autoRefresh: !preferences.autoRefresh };
                    setPreferences(newPrefs);
                    Storage.setPreferences(newPrefs);
                  }}
                  className={`w-11 h-6 flex items-center rounded-full transition-colors ${preferences.autoRefresh ? 'bg-blue-600' : 'bg-slate-200'}`}
                >
                  <span className={`w-4 h-4 bg-white rounded-full shadow transform transition-transform ml-1 ${preferences.autoRefresh ? 'translate-x-5' : ''}`} />
                </button>
              </div>

              {/* Clear Data */}
              <div className="p-4 bg-white flex items-center justify-between border-t border-slate-100">
                <span className="font-medium text-slate-700">Storage</span>
                <button
                  onClick={handleClearData}
                  className="text-sm text-red-600 font-medium hover:underline"
                >
                  Clear & Reset App
                </button>
              </div>
            </div>
          </div>
        );

      default:
        return <div>View not found</div>;
    }
  };

  return (
    <Layout currentView={currentView} setView={setCurrentView}>
      {renderContent()}

      {/* Global Modal */}
      <CameraDetailModal
        camera={selectedCamera}
        onClose={() => setSelectedCamera(null)}
        isWatchlisted={selectedCamera ? watchlistIds.includes(selectedCamera.id) : false}
        onToggleWatchlist={handleToggleWatchlist}
        onCameraUpdate={handleCameraUpdate}
        modelId={preferences.modelId}
        apiKey={preferences.apiKey}
      />
    </Layout>
  );
};

export default App;