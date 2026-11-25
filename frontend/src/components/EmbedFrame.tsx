import React, { forwardRef } from 'react';
import type { ResolvedEmbedResult } from '@/src/services/player';

export interface EmbedFrameProps {
  resolved: ResolvedEmbedResult;
  title: string;
  reloadKey: number;
  onLoad?: () => void;
  onError?: () => void;
}

/**
 * Isolated Embed Iframe Renderer
 *
 * Applies provider-specific sandbox policies:
 * - AnimeTVPlus (Server 1): Strict sandbox ("allow-scripts allow-forms allow-presentation")
 * - NXsha Hindi (Hindi): Standard sandbox ("allow-scripts allow-same-origin allow-forms allow-presentation")
 * - MegaPlay (Beta / Backup): Preserved legacy non-sandboxed embed for postMessage & stream init
 *
 * Popups (allow-popups, allow-popups-to-escape-sandbox) and top-level navigation
 * (allow-top-navigation*) are strictly forbidden for AnimeTVPlus and NXsha Hindi.
 */
export const EmbedFrame = forwardRef<HTMLIFrameElement, EmbedFrameProps>(
  ({ resolved, title, reloadKey, onLoad, onError }, ref) => {
    if (!resolved.ok || !resolved.embedUrl) {
      return null;
    }

    return (
      <iframe
        key={`${resolved.serverId}-${resolved.embedUrl}-${reloadKey}`}
        ref={ref}
        src={resolved.embedUrl}
        title={title}
        className="glassplayer__embed-iframe"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          border: 0,
          background: '#06070b',
          zIndex: 1,
        }}
        allowFullScreen
        allow={resolved.allowAttribute}
        {...(resolved.sandboxAttribute ? { sandbox: resolved.sandboxAttribute } : {})}
        referrerPolicy="no-referrer-when-downgrade"
        onLoad={onLoad}
        onError={onError}
      />
    );
  }
);

EmbedFrame.displayName = 'EmbedFrame';
