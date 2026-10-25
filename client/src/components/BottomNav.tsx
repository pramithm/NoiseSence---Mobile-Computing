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
    <nav className="bottom-nav-container">
      <div className="bottom-nav-inner">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          if (tab.isAction) {
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`nav-action-btn ${isActive ? 'nav-action-active' : ''} ${
                  isMeasuring ? 'nav-action-pulsing' : ''
                }`}
                aria-label={tab.label}
              >
                <div className="action-circle">
                  <Icon size={22} className={isMeasuring ? 'pulse-icon' : ''} />
                </div>
                <span className="nav-label">{tab.label}</span>
              </button>
            );
          }

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`nav-item ${isActive ? 'nav-item-active' : ''}`}
              aria-label={tab.label}
            >
              <div className="nav-icon-wrapper">
                <Icon size={20} />
                {isActive && <span className="active-glow-dot"></span>}
              </div>
              <span className="nav-label">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
