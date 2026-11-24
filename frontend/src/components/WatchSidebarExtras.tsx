import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mic, Star } from 'lucide-react';
import type { AnimeTitle } from '@/src/types/anime';

interface WatchSidebarExtrasProps {
  relatedAnime: AnimeTitle[];
}

export const WatchSidebarExtras: React.FC<WatchSidebarExtrasProps> = ({
  relatedAnime,
}) => {
  const [showAllRelated, setShowAllRelated] = useState(false);

  const visibleRelated = showAllRelated ? relatedAnime : relatedAnime.slice(0, 3);

  return (
    <div className="wr-extras">
      {relatedAnime.length > 0 && (
        <section className="wr-shelf" aria-label="Related">
          <h2 className="wr-shelf__title">Related</h2>
          <div className="wr-shelf__items">
            {visibleRelated.map((item) => (
              <Link
                key={item.routeId}
                to={`/anime/${item.routeId}/1`}
                className="wr-rel"
              >
                <span className="wr-rel__thumb">
                  <img src={item.poster} alt="" />
                  {item.score !== null && (
                    <span className="wr-rel__score">
                      <Star size={10} fill="#ffd35a" color="#ffd35a" />
                      <span>{item.score.toFixed(1)}</span>
                    </span>
                  )}
                  {item.dubCount > 0 && (
                    <span className="wr-rel__dub">
                      <Mic size={10} />
                      <span>DUB</span>
                    </span>
                  )}
                  <span className="wr-rel__eps">
                    {item.episodeCount === 1 ? '1 ep' : `${item.episodeCount || 12} eps`}
                  </span>
                </span>

                <span className="wr-rel__details">
                  <span className="wr-rel__title">{item.title}</span>
                  <span className="wr-rel__desc">{item.synopsis}</span>
                  <span className="wr-rel__meta">
                    {item.genres.slice(0, 2).join(' & ') || item.type}
                    {item.year ? ` · ${item.season ? `${item.season} ` : ''}${item.year}` : ''}
                  </span>
                </span>
              </Link>
            ))}
          </div>

          {relatedAnime.length > 3 && (
            <button
              type="button"
              className="wr-show-more"
              onClick={() => setShowAllRelated((p) => !p)}
            >
              {showAllRelated ? 'Show less' : `Show ${relatedAnime.length - 3} more`}
            </button>
          )}
        </section>
      )}
    </div>
  );
};
