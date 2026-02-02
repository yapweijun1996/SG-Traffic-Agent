import React from 'react';
import { Camera } from '../types';
import { ChevronRight, ArrowUpRight, ArrowDownRight, Minus, Sparkles, Loader2, Play } from 'lucide-react';

interface CameraListProps {
  cameras: Camera[];
  onSelectCamera: (camera: Camera) => void;
  title?: string;
  emptyMessage?: string;
  onAnalyzeBatch?: (cameras: Camera[]) => void;
  isAnalyzing?: boolean;
  progress?: { current: number; total: number } | null;
}

const CameraList: React.FC<CameraListProps> = ({ 
  cameras, 
  onSelectCamera, 
  title,
  emptyMessage = "No cameras found.",
  onAnalyzeBatch,
  isAnalyzing = false,
  progress
}) => {
  const getTrendIcon = (trend?: string) => {
    switch (trend) {
      case 'UP': return <ArrowUpRight className="w-4 h-4 text-red-500" />;
      case 'DOWN': return <ArrowDownRight className="w-4 h-4 text-green-500" />;
      case 'FLAT': return <Minus className="w-4 h-4 text-slate-400" />;
      default: return null;
    }
  };

  const getScoreColor = (score?: number) => {
    if (score === undefined) return 'bg-slate-100 text-slate-500';
    if (score >= 80) return 'bg-red-100 text-red-700';
    if (score >= 50) return 'bg-orange-100 text-orange-700';
    return 'bg-green-100 text-green-700';
  };

  const handleBatchClick = () => {
    if (!onAnalyzeBatch || isAnalyzing) return;
    
    // Logic: Prioritize unanalyzed cameras. If all are analyzed, refresh all.
    const unanalyzed = cameras.filter(c => !c.trafficScore);
    const targets = unanalyzed.length > 0 ? unanalyzed : cameras;
    
    onAnalyzeBatch(targets);
  };

  const unanalyzedCount = cameras.filter(c => !c.trafficScore).length;
  const analysisTargetLabel = unanalyzedCount > 0 ? `(${unanalyzedCount} New)` : 'All';

  return (
    <div className="flex flex-col h-full bg-white">
      {title && (
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 shrink-0 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-slate-800">{title}</h2>
            <p className="text-xs text-slate-500">{cameras.length} cameras monitoring</p>
          </div>
          
          {onAnalyzeBatch && cameras.length > 0 && (
             <button
               onClick={handleBatchClick}
               disabled={isAnalyzing}
               className={`text-xs px-3 py-1.5 rounded-lg font-semibold flex items-center gap-2 transition-all ${
                 isAnalyzing 
                   ? 'bg-slate-200 text-slate-500 cursor-not-allowed' 
                   : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm active:scale-95'
               }`}
             >
               {isAnalyzing ? (
                 <>
                   <Loader2 className="w-3 h-3 animate-spin" />
                   {progress ? `${progress.current}/${progress.total}` : 'Analyzing...'}
                 </>
               ) : (
                 <>
                   <Play className="w-3 h-3 fill-current" />
                   Analyze {analysisTargetLabel}
                 </>
               )}
             </button>
          )}
        </div>
      )}
      
      <div className="flex-1 overflow-y-auto">
        {cameras.length === 0 ? (
           <div className="flex flex-col items-center justify-center h-48 text-slate-400 text-sm">
             <p>{emptyMessage}</p>
           </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {cameras.map((camera) => (
              <button
                key={camera.id}
                onClick={() => onSelectCamera(camera)}
                className="w-full flex items-center p-4 hover:bg-slate-50 transition-colors text-left group"
              >
                {/* Thumbnail */}
                <div className="w-16 h-16 bg-slate-200 rounded-lg overflow-hidden shrink-0 border border-slate-200 relative">
                  <img src={camera.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                  {/* Highlight if newly analyzed (optional, hard to track in this item view without extra props) */}
                </div>

                {/* Info */}
                <div className="ml-3 flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                     <h3 className="text-sm font-semibold text-slate-800 truncate pr-2">
                       {camera.locationName}
                     </h3>
                     <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${getScoreColor(camera.trafficScore?.score)}`}>
                       {camera.trafficScore ? camera.trafficScore.score : '?'}
                     </span>
                  </div>
                  
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="truncate">{camera.id}</span>
                    <div className="flex items-center gap-1">
                      {camera.trafficScore ? (
                        <>
                          {getTrendIcon(camera.trafficScore.trend)}
                          <span>{camera.trafficScore.delta !== 0 ? Math.abs(camera.trafficScore.delta) : ''}</span>
                        </>
                      ) : (
                        <span className="flex items-center gap-1 text-blue-500 font-medium">
                          <Sparkles className="w-3 h-3" />
                          <span>Tap to analyze</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <ChevronRight className="w-5 h-5 text-slate-300 ml-2 group-hover:text-slate-400" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CameraList;