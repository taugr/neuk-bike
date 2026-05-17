'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type BeforeInstallPromptChoice = {
  outcome: 'accepted' | 'dismissed';
  platform: string;
};

type BeforeInstallPromptEvent = Event & {
  readonly platforms: string[];
  readonly userChoice: Promise<BeforeInstallPromptChoice>;
  prompt: () => Promise<void>;
};

type PwaInstallPromptProps = {
  assetBasePath: string;
  children: ReactNode;
};

type PwaInstallPromptContextValue = {
  canInstall: boolean;
  installApp: () => Promise<void>;
};

const PwaInstallPromptContext = createContext<PwaInstallPromptContextValue>({
  canInstall: false,
  installApp: async () => {},
});

function assetPath(assetBasePath: string, path: string) {
  return `${assetBasePath}${path}`;
}

function isAndroidBrowser() {
  return /\bAndroid\b/i.test(navigator.userAgent);
}

export function usePwaInstallPrompt() {
  return useContext(PwaInstallPromptContext);
}

export default function PwaInstallPrompt({
  assetBasePath,
  children,
}: PwaInstallPromptProps) {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    const registerServiceWorker = async () => {
      try {
        await navigator.serviceWorker.register(
          assetPath(assetBasePath, '/sw.js'),
          {
            scope: assetPath(assetBasePath, '/') || '/',
          },
        );
      } catch {
        // Installability is progressive enhancement; the app still works without a service worker.
      }
    };

    void registerServiceWorker();
  }, []);

  useEffect(() => {
    function handleBeforeInstallPrompt(event: Event) {
      if (!isAndroidBrowser()) {
        return;
      }

      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    }

    function handleAppInstalled() {
      setInstallPrompt(null);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt,
      );
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const installApp = useCallback(async () => {
    if (!installPrompt) {
      return;
    }

    setInstallPrompt(null);

    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
    } catch {
      // The browser owns install UI failures; there is no recovery action in-app.
    }
  }, [installPrompt]);

  const contextValue = useMemo(
    () => ({
      canInstall: installPrompt !== null,
      installApp,
    }),
    [installApp, installPrompt],
  );

  return (
    <PwaInstallPromptContext.Provider value={contextValue}>
      {children}
    </PwaInstallPromptContext.Provider>
  );
}
