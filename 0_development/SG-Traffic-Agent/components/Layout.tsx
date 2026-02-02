import React from 'react';
import { ViewState } from '../types';
import { Map, List, Star, AlertTriangle, FileText, Settings } from 'lucide-react';

interface LayoutProps {
  currentView: ViewState;
  setView: (view: ViewState) => void;
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ currentView, setView, children }) => {
  const navItems = [
    { id: ViewState.MAP, label: 'Map', icon: Map },
    { id: ViewState.LIST, label: 'List', icon: List },
    { id: ViewState.WATCHLIST, label: 'Watchlist', icon: Star },
    { id: ViewState.SUMMARY, label: 'Summary', icon: FileText },
    { id: ViewState.SETTINGS, label: 'Settings', icon: Settings },
  ];

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 shadow-sm z-10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-1.5 rounded-lg">
            <Map className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800 leading-tight">SG Traffic Agent</h1>
            <p className="text-xs text-slate-500 font-medium">Live Intelligence Map</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Placeholder for future top-bar actions */}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative">
        {children}
      </main>

      {/* Bottom Navigation (Mobile First) */}
      <nav className="bg-white border-t border-slate-200 pb-safe z-20 shrink-0">
        <div className="flex justify-around items-center h-16 max-w-lg mx-auto px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${isActive ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'
                  }`}
              >
                <Icon className={`w-6 h-6 ${isActive ? 'fill-current opacity-20' : ''}`} strokeWidth={isActive ? 2.5 : 2} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default Layout;
