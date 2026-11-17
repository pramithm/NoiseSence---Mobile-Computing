import React from 'react';
import { LayoutDashboard, Mic, MapPin, History } from 'lucide-react';

export type ActiveTab = 'dashboard' | 'measure' | 'map' | 'history';

interface BottomNavProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  isMeasuring?: boolean;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onTabChange,
  isMeasuring = false
}) => {
  const tabs = [
    { id: 'dashboard' as ActiveTab, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'measure' as ActiveTab, label: 'Measure', icon: Mic, isAction: true },
    { id: 'map' as ActiveTab, label: 'Noise Map', icon: MapPin },
    { id: 'history' as ActiveTab, label: 'History', icon: History }
  ];

  return (
    <nav className="bottom-nav-container" aria-label="Main Navigation">
      <div className="bottom-nav-inner">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`nav-item ${isActive ? 'nav-item-active' : ''} ${
                tab.isAction ? 'nav-item-primary' : ''
              }`}
              aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <div className={`nav-icon-wrapper ${tab.isAction ? 'nav-icon-action' : ''} ${isMeasuring && tab.isAction ? 'nav-icon-measuring' : ''}`}>
                <Icon size={tab.isAction ? 20 : 19} className={isMeasuring && tab.isAction ? 'pulse-icon' : ''} />
              </div>
              <span className="nav-label">{tab.label}</span>
              {isActive && <span className="active-pill-indicator" />}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

