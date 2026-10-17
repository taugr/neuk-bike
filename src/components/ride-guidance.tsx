'use client';
import { useUnits } from '@/components/units-provider';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  Volume2,
  VolumeX,
  RefreshCw,
} from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import {
  describeCycleRouteInstruction,
  type CycleRoute,
} from '@/lib/cyclestreets';
import { formatLocalizedDistance } from '@/lib/i18n/format';
import { localeDetails } from '@/lib/i18n/locales';
import {
  getNextRouteGuidance,
  type LiveRouteProgress,
} from '@/lib/route-progress';
import { getRouteInstructionManeuver } from '@/lib/route-instructions';

const audioMutedStorageKey = 'cycle-parking-ride-audio-muted';

export function RideGuidance({
  route,
  progress,
  tracking,
  rerouting,
  rerouteError,
  onReroute,
}: {
  route: CycleRoute;
  progress: LiveRouteProgress | null;
  tracking: boolean;
  rerouting: boolean;
  rerouteError: string | null;
  onReroute: () => void;
}) {
  const { t, locale } = useLanguage();
  const { units } = useUnits();
  const [muted, setMuted] = useState(false);
  const [audioPreferenceLoaded, setAudioPreferenceLoaded] = useState(false);
  const [wakeSupported, setWakeSupported] = useState<boolean | null>(null);
  const [wakeStatus, setWakeStatus] = useState<
    'idle' | 'active' | 'paused' | 'error'
  >('idle');
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [audioError, setAudioError] = useState(false);
  const lastSpoken = useRef<string | null>(null);
  const announcedInstructions = useRef(new Set<string>());
  const riding = tracking && !progress?.hasArrived;
  const next = progress
    ? getNextRouteGuidance(route, progress.travelledMeters)
    : null;
  const maneuver = next
    ? getRouteInstructionManeuver(next.instruction)
    : 'arrive';
  const Icon =
    maneuver === 'left'
      ? CornerUpLeft
      : maneuver === 'right'
        ? CornerUpRight
        : maneuver === 'arrive'
          ? Flag
          : ArrowUp;
  const instructionText = next
    ? describeCycleRouteInstruction(next.instruction, locale, units)
    : t('rideContinueToDestination');
  const cue = progress?.isOffRoute
    ? t('rideOffRoute')
    : progress?.hasArrived
      ? t('arrivedDestination')
      : next
        ? t('rideInDistance', {
            distance: formatLocalizedDistance(
              next.distanceMeters,
              locale,
              units,
            ),
            instruction: instructionText,
          })
        : instructionText;
  const cueId = progress?.isOffRoute
    ? 'off-route'
    : progress?.hasArrived
      ? 'arrived'
      : `${next?.instruction.id ?? 'finish'}:${next && next.distanceMeters <= 50 ? 'near' : 'ahead'}`;

  useEffect(() => {
    try {
      setMuted(localStorage.getItem(audioMutedStorageKey) === 'true');
    } catch {
      // Audio is on by default; this ride remains usable without storage.
    }
    setAudioPreferenceLoaded(true);
  }, []);

  useEffect(() => {
    setWakeSupported(window.isSecureContext && 'wakeLock' in navigator);
    if (!('speechSynthesis' in window)) return;
    const updateVoices = () => {
      // Use a device voice only: route instructions should not go to a speech service.
      setVoice(
        window.speechSynthesis
          .getVoices()
          .find(
            (candidate) =>
              candidate.localService &&
              candidate.lang.toLowerCase().split('-')[0] === locale,
          ) ?? null,
      );
    };
    updateVoices();
    window.speechSynthesis.addEventListener('voiceschanged', updateVoices);
    return () =>
      window.speechSynthesis.removeEventListener('voiceschanged', updateVoices);
  }, [locale]);

  useEffect(() => {
    if (!riding || !wakeSupported) {
      setWakeStatus('idle');
      return;
    }
    let disposed = false;
    let pending = false;
    let lock: WakeLockSentinel | null = null;
    const acquire = async () => {
      if (disposed || pending || lock || document.visibilityState !== 'visible')
        return;
      pending = true;
      try {
        const acquired = await navigator.wakeLock.request('screen');
        if (disposed) {
          await acquired.release();
          return;
        }
        lock = acquired;
        setWakeStatus('active');
        acquired.addEventListener('release', () => {
          if (lock === acquired) lock = null;
          if (!disposed) setWakeStatus('paused');
        });
      } catch {
        if (!disposed) setWakeStatus('error');
      } finally {
        pending = false;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    void acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (lock) void lock.release().catch(() => {});
    };
  }, [riding, wakeSupported]);

  const speakCue = useCallback(() => {
    if (!voice) return;
    const key = `${locale}:${cueId}`;
    if (lastSpoken.current === key) return;
    if (cueId === 'off-route') announcedInstructions.current.clear();
    else if (cueId !== 'arrived') {
      if (announcedInstructions.current.has(key)) return;
      announcedInstructions.current.add(key);
    }
    lastSpoken.current = key;
    const utterance = new SpeechSynthesisUtterance(cue);
    utterance.voice = voice;
    utterance.lang = localeDetails[locale].formattingLocale;
    utterance.onerror = (event) => {
      if (event.error !== 'canceled' && event.error !== 'interrupted')
        setAudioError(true);
    };
    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch {
      setAudioError(true);
    }
  }, [voice, locale, cue, cueId]);

  useEffect(() => {
    if (
      !audioPreferenceLoaded ||
      muted ||
      !tracking ||
      !voice ||
      rerouting ||
      audioError
    ) {
      lastSpoken.current = null;
      announcedInstructions.current.clear();
      return;
    }
    speakCue();
  }, [
    audioPreferenceLoaded,
    muted,
    tracking,
    voice,
    rerouting,
    audioError,
    speakCue,
  ]);

  useEffect(() => {
    if (!tracking) setAudioError(false);
  }, [tracking]);

  useEffect(() => {
    if ((!tracking || rerouting) && 'speechSynthesis' in window)
      window.speechSynthesis.cancel();
    return () => {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, [tracking, rerouting]);

  function toggleAudio() {
    const nextMuted = !muted && !audioError;
    setMuted(nextMuted);
    setAudioError(false);
    try {
      localStorage.setItem(audioMutedStorageKey, String(nextMuted));
    } catch {
      // Keep the current ride's choice when browser storage is blocked.
    }
    if (nextMuted) window.speechSynthesis.cancel();
    else {
      lastSpoken.current = null;
      announcedInstructions.current.clear();
      // Retry from the actual tap as some browsers require user activation.
      speakCue();
    }
  }

  if (!tracking) return null;
  const audioSilent = muted || audioError || !voice;
  const audioLabel = !voice
    ? t('rideAudioUnavailable')
    : t(audioSilent ? 'rideUnmute' : 'rideMute');

  return (
    <section
      className="ride-guidance"
      aria-label={t('rideOptions')}
      data-testid="ride-guidance"
    >
      {tracking && progress && !progress.hasArrived ? (
        <div
          className={`ride-next-turn${progress.isOffRoute ? ' ride-next-turn--off-route' : ''}`}
          data-testid="ride-next-turn"
        >
          <Icon size={32} aria-hidden="true" />
          <div className="ride-turn-content">
            <div className="ride-turn-heading">
              <strong>
                {progress.isOffRoute
                  ? t('rideOffRoute')
                  : formatLocalizedDistance(
                      next?.distanceMeters ?? progress.remainingMeters,
                      locale,
                      units,
                    )}
              </strong>
              <button
                type="button"
                className="ride-audio-toggle"
                data-testid="ride-audio-toggle"
                data-muted={audioSilent}
                aria-label={audioLabel}
                title={audioLabel}
                disabled={!voice || !audioPreferenceLoaded}
                onClick={toggleAudio}
              >
                {audioSilent ? (
                  <VolumeX size={21} aria-hidden="true" />
                ) : (
                  <Volume2 size={21} aria-hidden="true" />
                )}
              </button>
            </div>
            <p role="status">
              {progress.isOffRoute ? t('rideOffRouteHelp') : instructionText}
            </p>
            {!progress.isOffRoute ? (
              <small>
                {t('rideRemaining', {
                  distance: formatLocalizedDistance(
                    progress.remainingMeters,
                    locale,
                    units,
                  ),
                })}
              </small>
            ) : null}
          </div>
        </div>
      ) : null}
      {tracking && progress?.isOffRoute ? (
        <button
          className="ride-reroute"
          type="button"
          disabled={rerouting}
          onClick={onReroute}
        >
          <RefreshCw
            size={18}
            className={rerouting ? 'is-spinning' : undefined}
            aria-hidden="true"
          />
          {t(rerouting ? 'rideRecalculating' : 'rideRecalculate')}
        </button>
      ) : null}
      {rerouteError ? (
        <p role="status" className="ride-help">
          {rerouteError}
        </p>
      ) : null}
      {riding ? (
        <p className="ride-help" aria-live="polite">
          {wakeSupported === false ||
          wakeStatus === 'error' ||
          wakeStatus === 'paused'
            ? t('rideWakeLimited')
            : null}
          {!muted && !voice
            ? ` ${t('rideAudioUnavailable')}`
            : audioError
              ? ` ${t('rideAudioRetry')}`
              : null}
        </p>
      ) : null}
    </section>
  );
}
