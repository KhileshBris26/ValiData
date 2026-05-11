import React, { createContext, useState, useContext } from 'react';

type Platform = 'snowflake' | 'databricks';

interface PlatformContextType {
  platform: Platform;
  setPlatform: (p: Platform) => void;
}

const PlatformContext = createContext<PlatformContextType | undefined>(undefined);

export const PlatformProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [platform, setPlatformState] = useState<Platform>(() => {
    return (localStorage.getItem('robin_active_platform') as Platform) || 'snowflake';
  });

  const setPlatform = (p: Platform) => {
    setPlatformState(p);
    localStorage.setItem('robin_active_platform', p);
  };

  return (
    <PlatformContext.Provider value={{ platform, setPlatform }}>
      {children}
    </PlatformContext.Provider>
  );
};

export const usePlatform = () => {
  const context = useContext(PlatformContext);
  if (!context) throw new Error('usePlatform must be used within PlatformProvider');
  return context;
};
