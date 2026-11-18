import { useEffect, useState } from 'react';
import type { NextAiringEpisode } from '@7anime/shared';

export function formatAiringCountdown(airingAt?: number | null, episodeNumber?: number | null): string | null {
  if (!airingAt || airingAt <= 0) return null;

  const now = Math.floor(Date.now() / 1000);
  const remainingSeconds = airingAt - now;

  if (remainingSeconds <= 0) {
    return episodeNumber ? `Ep ${episodeNumber} aired recently` : 'Aired recently';
  }

  const days = Math.floor(remainingSeconds / 86400);
  const hours = Math.floor((remainingSeconds % 86400) / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);

  const prefix = episodeNumber ? `Next ep in ` : 'Next ep in ';

  if (days > 0) {
    return `${prefix}${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${prefix}${hours}h ${minutes}m`;
  }
  return `${prefix}${Math.max(1, minutes)}m`;
}

export function useAiringCountdown(nextEpisode?: NextAiringEpisode | null) {
  const [countdownText, setCountdownText] = useState<string | null>(() =>
    formatAiringCountdown(nextEpisode?.airingAt, nextEpisode?.episode)
  );

  useEffect(() => {
    if (!nextEpisode?.airingAt) {
      setCountdownText(null);
      return;
    }

    const update = () => {
      setCountdownText(formatAiringCountdown(nextEpisode.airingAt, nextEpisode.episode));
    };

    update();
    const interval = setInterval(update, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, [nextEpisode?.airingAt, nextEpisode?.episode]);

  return countdownText;
}
