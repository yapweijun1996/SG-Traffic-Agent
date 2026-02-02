import React, { useEffect, useState } from 'react';
import { Camera } from '../types';
import { TrafficService } from '../services/trafficService';
import { X, TrendingUp, TrendingDown, Minus, Clock, ShieldCheck, MapPin, Sparkles, Loader2 } from 'lucide-react';

interface CameraDetailModalProps {
  camera: Camera | null;
  onClose: () => void;
  isWatchlisted: boolean;
  onToggleWatchlist: (id: string) => void;
  onCameraUpdate: (updatedCamera: Camera) => void;
  modelId: string;
}

const CameraDetailModal: React.FC<CameraDetailModalProps> = ({ 
  camera, 
  onClose, 
  isWatchlisted,
  onToggleWatchlist,
  onCameraUpdate,
  modelId
}) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    if (!camera) return;

    // Auto-analyze if no score exists or score is older than 5 minutes
    const shouldAnalyze = !camera.trafficScore || 
      (new Date().getTime() - new Date(camera.trafficScore.analyzedAt).getTime() > 5 * 60 * 1000);

    if (shouldAnalyze && !isAnalyzing) {
      handleAnalyze();
    }
  }, [camera?.id]); // Only trigger on ID change

  const handleAnalyze = async () => {
    if (!camera) return;
    setIsAnalyzing(true);
    try {
      const updatedCamera = await TrafficService.analyzeCameraWithGemini(camera, modelId);
      onCameraUpdate(updatedCamera);
    } catch (e) {
      console.error("Analysis failed", e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!camera) return null;

  const trafficScore = camera.trafficScore;
  
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-red-600 bg-red-50 border-red-200';
    if (score >= 50) return 'text-orange-600 bg-orange-50 border-orange-200';
    return 'text-green-600 bg-green-50 border-green-200';
  };

  const scoreColorClass = trafficScore ? getScoreColor(trafficScore.score) : 'text-slate-400 bg-slate-50 border-slate-200';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-800 text-lg">{camera.locationName}</h3>
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <MapPin className="w-3 h-3" />
              <span>{camera.latitude.toFixed(4)}, {camera.longitude.toFixed(4)}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Content Scrollable */}
        <div className="overflow-y-auto p-4 space-y-4">
          
          {/* Image Feed */}
          <div className="relative aspect-video bg-slate-100 rounded-lg overflow-hidden border border-slate-200 shadow-inner group">
            <img 
              src={camera.imageUrl} 
              alt={`Traffic at ${camera.locationName}`}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] px-2 py-1 rounded backdrop-blur-md">
              {new Date(camera.timestamp).toLocaleTimeString()}
            </div>
          </div>

          {/* Traffic Agent Score Card */}
          {trafficScore ? (
             <div className={`p-4 rounded-xl border ${scoreColorClass} flex items-center justify-between transition-all duration-300 relative overflow-hidden`}>
                {isAnalyzing && <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10 flex items-center justify-center"><Loader2 className="animate-spin text-blue-600"/></div>}
                
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider opacity-70">Gemini Traffic Score</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black">{trafficScore.score}</span>
                    <span className="text-sm font-medium">/100</span>
                  </div>
                </div>
                
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-1 text-sm font-bold">
                    {trafficScore.trend === 'UP' && <TrendingUp className="w-4 h-4" />}
                    {trafficScore.trend === 'DOWN' && <TrendingDown className="w-4 h-4" />}
                    {trafficScore.trend === 'FLAT' && <Minus className="w-4 h-4" />}
                    <span>{trafficScore.trend}</span>
                  </div>
                  <div className="text-[10px] uppercase font-bold opacity-70">Trend</div>
                </div>
             </div>
          ) : (
             <div className="p-6 rounded-xl border border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 gap-2">
                {isAnalyzing ? (
                   <>
                     <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                     <span className="text-sm font-medium text-slate-600">Gemini AI is analyzing this road...</span>
                   </>
                ) : (
                   <div className="text-center">
                     <p className="text-sm mb-2">No AI analysis yet.</p>
                     <button 
                       onClick={handleAnalyze} 
                       className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold flex items-center gap-2"
                     >
                       <Sparkles className="w-4 h-4" /> Analyze Now
                     </button>
                   </div>
                )}
             </div>
          )}

          {/* Agent Insight */}
          {trafficScore && (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 relative">
              <div className="flex items-center gap-2 text-slate-800 font-semibold text-sm">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                <span>Gemini Insight</span>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                {trafficScore.description}
              </p>
              <div className="flex items-center gap-4 pt-2 border-t border-slate-200/60 mt-2">
                 <div className="flex items-center gap-1 text-xs text-slate-400">
                    <Clock className="w-3 h-3" />
                    <span>Analyzed at {new Date(trafficScore.analyzedAt).toLocaleTimeString()}</span>
                 </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-3">
          <button 
            onClick={() => onToggleWatchlist(camera.id)}
            className={`flex-1 py-3 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
              isWatchlisted 
                ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' 
                : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-600/20'
            }`}
          >
            {isWatchlisted ? 'Remove from Watchlist' : 'Add to Watchlist'}
          </button>
        </div>

      </div>
    </div>
  );
};

export default CameraDetailModal;