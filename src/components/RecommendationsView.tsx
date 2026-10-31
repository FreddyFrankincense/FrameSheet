import React, { useMemo, useState } from 'react';
import {
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Compass,
  ExternalLink,
  EyeOff,
  RotateCcw,
  Search,
  Sparkles,
  Star,
  X,
} from 'lucide-react';
import { FilmEntry, ProfileAccount } from '../types/letterboxd';
import {
  computeProfileRecommendations,
  RecommendationPathway,
  RecommendedFilmItem,
} from '../utils/recommendationEngine';

interface RecommendationsViewProps {
  profile: ProfileAccount;
  onUpdateFilms: (films: FilmEntry[]) => void;
  onUpdateDismissedRecommendations: (dismissedSlugs: string[]) => void;
}

type WatchlistFilterMode = 'all' | 'not_on_watchlist' | 'on_watchlist';

const PATHWAY_LABELS: Record<RecommendationPathway, string> = {
  all: 'All Signals',
  director_affinity: 'Director Rating Bias',
  writer_frequency: 'Frequent Writers',
  subgenre_popular: 'Popular in Sub-Genre',
  decade_sweet_spot: 'Decade Sweet Spot',
};

const PAGE_SIZE = 12;

export const RecommendationsView: React.FC<RecommendationsViewProps> = ({
  profile,
  onUpdateFilms,
  onUpdateDismissedRecommendations,
}) => {
  const [selectedPathway, setSelectedPathway] =
    useState<RecommendationPathway>('all');
  const [watchlistFilter, setWatchlistFilter] =
    useState<WatchlistFilterMode>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCreatorFilter, setSelectedCreatorFilter] = useState<string | null>(
    null
  );
  const [showDismissedDrawer, setShowDismissedDrawer] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const { fingerprint, recommendations, dismissedItems } = useMemo(
    () => computeProfileRecommendations(profile),
    [profile]
  );

  // Pathway counts for the filter bar
  const pathwayCounts = useMemo(() => {
    const counts: Record<RecommendationPathway, number> = {
      all: recommendations.length,
      director_affinity: 0,
      writer_frequency: 0,
      subgenre_popular: 0,
      decade_sweet_spot: 0,
    };
    for (const item of recommendations) {
      const hasTypes = new Set(item.reasons.map((r) => r.type));
      hasTypes.forEach((t) => {
        counts[t] += 1;
      });
    }
    return counts;
  }, [recommendations]);

  const filteredRecommendations = useMemo(() => {
    let list = recommendations;

    if (selectedPathway !== 'all') {
      list = list.filter((item) =>
        item.reasons.some((r) => r.type === selectedPathway)
      );
      // Sort by weight of the selected pathway
      list = [...list].sort((a, b) => {
        const wa =
          a.reasons.find((r) => r.type === selectedPathway)?.weightScore ?? 0;
        const wb =
          b.reasons.find((r) => r.type === selectedPathway)?.weightScore ?? 0;
        return wb - wa || b.matchScore - a.matchScore;
      });
    }

    if (watchlistFilter === 'not_on_watchlist') {
      list = list.filter((item) => !item.isOnWatchlist);
    } else if (watchlistFilter === 'on_watchlist') {
      list = list.filter((item) => item.isOnWatchlist);
    }

    if (selectedCreatorFilter) {
      const target = selectedCreatorFilter.toLowerCase();
      list = list.filter(
        (item) =>
          item.director.toLowerCase() === target ||
          item.writers.some((w) => w.toLowerCase() === target) ||
          item.subgenres.some((sg) => sg.toLowerCase() === target) ||
          `${Math.floor(item.year / 10) * 10}s`.toLowerCase() === target
      );
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.director.toLowerCase().includes(q) ||
          item.writers.some((w) => w.toLowerCase().includes(q)) ||
          item.subgenres.some((sg) => sg.toLowerCase().includes(q)) ||
          item.genres.some((g) => g.toLowerCase().includes(q)) ||
          String(item.year).includes(q) ||
          item.reasons.some(
            (r) =>
              r.headline.toLowerCase().includes(q) ||
              r.detail.toLowerCase().includes(q) ||
              r.supportingFilms.some((sf) => sf.title.toLowerCase().includes(q))
          )
      );
    }

    return list;
  }, [
    recommendations,
    selectedPathway,
    watchlistFilter,
    selectedCreatorFilter,
    searchQuery,
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredRecommendations.length / PAGE_SIZE)
  );
  const safePage = Math.min(currentPage, totalPages);
  const paginatedItems = filteredRecommendations.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  const handleDismissFilm = (slug: string) => {
    const current = profile.dismissedRecommendations || [];
    const normalized = slug.toLowerCase();
    if (!current.some((s) => s.toLowerCase() === normalized)) {
      onUpdateDismissedRecommendations([...current, slug]);
    }
  };

  const handleRestoreDismissedFilm = (slug: string) => {
    const current = profile.dismissedRecommendations || [];
    const normalized = slug.toLowerCase();
    onUpdateDismissedRecommendations(
      current.filter((s) => s.toLowerCase() !== normalized)
    );
  };

  const handleRestoreAllDismissed = () => {
    onUpdateDismissedRecommendations([]);
    setShowDismissedDrawer(false);
  };

  const handleAddToWatchlist = (item: RecommendedFilmItem) => {
    if (item.isOnWatchlist) return;
    const today = new Date().toISOString().slice(0, 10);
    const newEntry: FilmEntry = {
      id: `rec-watchlist-${item.slug}-${Date.now()}`,
      title: item.title,
      year: item.year,
      letterboxdUri: item.letterboxdUri,
      slug: item.slug,
      rating: null,
      watchedDate: null,
      loggedDate: today,
      rewatch: false,
      liked: false,
      watchlist: true,
      tags: ['letterboxd-watchlist', 'framesheet-recommended'],
      genres: item.genres,
      director: item.director,
      runtimeMinutes: item.runtimeMinutes,
      country: item.country,
      customRank: null,
      tier: 'Unranked',
      notes: `Added to Watchlist from FrameSheet Recommendations (${item.matchScore}% match — ${item.reasons[0]?.headline || 'Affinity Match'}).`,
    };
    onUpdateFilms([newEntry, ...profile.films]);
  };

  const watchlistMatchCount = useMemo(
    () => recommendations.filter((r) => r.isOnWatchlist).length,
    [recommendations]
  );

  return (
    <div className="space-y-6">
      {/* Section 1: Active Profile Taste Fingerprint (Directors, Screenwriters, Sub-Genres, Decades) */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-3.5">
          <div>
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-amber-400 shrink-0" />
              <h2 className="text-sm font-display font-semibold text-slate-100">
                Personal Taste & Rating Affinity Fingerprint (@{profile.username})
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Computed from{' '}
              <span className="font-mono tabular-nums text-slate-200">
                {fingerprint.loggedCount.toLocaleString()}
              </span>{' '}
              logged films (baseline mean{' '}
              <span className="font-mono tabular-nums text-amber-400 font-semibold">
                {fingerprint.baselineMean.toFixed(2)}★
              </span>
              ). Click any director, writer, sub-genre, or decade below to filter unseen recommendations.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {selectedCreatorFilter && (
              <button
                type="button"
                onClick={() => {
                  setSelectedCreatorFilter(null);
                  setCurrentPage(1);
                }}
                className="px-3 py-1.5 text-xs font-medium bg-amber-500/15 text-amber-300 border border-amber-500/40 rounded-md inline-flex items-center gap-1.5 hover:bg-amber-500/25 transition-colors whitespace-nowrap shrink-0"
              >
                <span>Filtered by: {selectedCreatorFilter}</span>
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowDismissedDrawer((prev) => !prev)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 font-mono tabular-nums ${
                showDismissedDrawer
                  ? 'bg-slate-800 text-amber-300 border-amber-500/50'
                  : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700 hover:text-slate-100'
              }`}
            >
              <EyeOff className="w-3.5 h-3.5 text-slate-400" />
              <span>Dismissed Films ({dismissedItems.length})</span>
            </button>
          </div>
        </div>

        {/* 4-Column Affinity Matrix */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Column 1: High-Affinity Directors */}
          <div className="bg-slate-950 border border-slate-800/80 rounded-md p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-display font-semibold text-slate-200">
                High-Rated Directors
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                Avg ★ vs. Mean
              </span>
            </div>
            <div className="divide-y divide-slate-800/60 text-xs">
              {fingerprint.topDirectors.slice(0, 5).map((dir) => {
                const isSelected = selectedCreatorFilter === dir.name;
                return (
                  <button
                    key={dir.name}
                    type="button"
                    onClick={() => {
                      setSelectedCreatorFilter((prev) =>
                        prev === dir.name ? null : dir.name
                      );
                      setCurrentPage(1);
                    }}
                    className={`w-full py-1.5 flex items-center justify-between gap-2 text-left transition-colors ${
                      isSelected
                        ? 'text-amber-300 font-semibold'
                        : 'text-slate-300 hover:text-amber-300'
                    }`}
                  >
                    <span className="truncate">
                      {dir.name}{' '}
                      <span className="text-slate-500 font-mono tabular-nums">
                        ({dir.count})
                      </span>
                    </span>
                    <span className="font-mono tabular-nums shrink-0 text-emerald-400">
                      {dir.avgRating.toFixed(2)}★ (
                      {dir.deltaVsMean >= 0 ? '+' : ''}
                      {dir.deltaVsMean.toFixed(2)})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Column 2: Frequent Screenwriters */}
          <div className="bg-slate-950 border border-slate-800/80 rounded-md p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-display font-semibold text-slate-200">
                Frequent Screenwriters
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                Logged · Avg ★
              </span>
            </div>
            <div className="divide-y divide-slate-800/60 text-xs">
              {fingerprint.topWriters.slice(0, 5).map((writer) => {
                const isSelected = selectedCreatorFilter === writer.name;
                return (
                  <button
                    key={writer.name}
                    type="button"
                    onClick={() => {
                      setSelectedCreatorFilter((prev) =>
                        prev === writer.name ? null : writer.name
                      );
                      setCurrentPage(1);
                    }}
                    className={`w-full py-1.5 flex items-center justify-between gap-2 text-left transition-colors ${
                      isSelected
                        ? 'text-amber-300 font-semibold'
                        : 'text-slate-300 hover:text-amber-300'
                    }`}
                  >
                    <span className="truncate">{writer.name}</span>
                    <span className="font-mono tabular-nums shrink-0 text-slate-400">
                      {writer.count} logged ·{' '}
                      <strong className="text-amber-400">
                        {writer.avgRating.toFixed(2)}★
                      </strong>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Column 3: Signature Sub-Genres */}
          <div className="bg-slate-950 border border-slate-800/80 rounded-md p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-display font-semibold text-slate-200">
                Signature Sub-Genres
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                Volume · Avg ★
              </span>
            </div>
            <div className="divide-y divide-slate-800/60 text-xs">
              {fingerprint.topSubgenres.slice(0, 5).map((sg) => {
                const isSelected = selectedCreatorFilter === sg.name;
                return (
                  <button
                    key={sg.name}
                    type="button"
                    onClick={() => {
                      setSelectedCreatorFilter((prev) =>
                        prev === sg.name ? null : sg.name
                      );
                      setCurrentPage(1);
                    }}
                    className={`w-full py-1.5 flex items-center justify-between gap-2 text-left transition-colors ${
                      isSelected
                        ? 'text-amber-300 font-semibold'
                        : 'text-slate-300 hover:text-amber-300'
                    }`}
                  >
                    <span className="truncate">{sg.name}</span>
                    <span className="font-mono tabular-nums shrink-0 text-slate-400">
                      {sg.count} ·{' '}
                      <strong className="text-amber-400">
                        {sg.avgRating.toFixed(2)}★
                      </strong>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Column 4: Release Decade Sweet Spots */}
          <div className="bg-slate-950 border border-slate-800/80 rounded-md p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-display font-semibold text-slate-200">
                Peak Rating Decades
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                Avg ★ vs. Mean
              </span>
            </div>
            <div className="divide-y divide-slate-800/60 text-xs">
              {fingerprint.topDecades.slice(0, 5).map((dec) => {
                const isSelected = selectedCreatorFilter === dec.name;
                return (
                  <button
                    key={dec.name}
                    type="button"
                    onClick={() => {
                      setSelectedCreatorFilter((prev) =>
                        prev === dec.name ? null : dec.name
                      );
                      setCurrentPage(1);
                    }}
                    className={`w-full py-1.5 flex items-center justify-between gap-2 text-left transition-colors ${
                      isSelected
                        ? 'text-amber-300 font-semibold'
                        : 'text-slate-300 hover:text-amber-300'
                    }`}
                  >
                    <span className="font-mono tabular-nums">
                      {dec.name}{' '}
                      <span className="text-slate-500">({dec.count})</span>
                    </span>
                    <span
                      className={`font-mono tabular-nums shrink-0 ${
                        dec.deltaVsMean >= 0 ? 'text-emerald-400' : 'text-slate-400'
                      }`}
                    >
                      {dec.avgRating.toFixed(2)}★ (
                      {dec.deltaVsMean >= 0 ? '+' : ''}
                      {dec.deltaVsMean.toFixed(2)})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Collapsible Manageable Dismissed Films Drawer */}
      {showDismissedDrawer && (
        <div className="bg-slate-900 border border-amber-500/40 rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-xs font-display font-semibold text-amber-300">
                Films Removed from Recommendation Consideration ({dismissedItems.length})
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                These films are excluded from @{profile.username}’s recommendation list. Restore any title to return it to consideration.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {dismissedItems.length > 0 && (
                <button
                  type="button"
                  onClick={handleRestoreAllDismissed}
                  className="px-3 py-1.5 text-xs font-medium bg-slate-950 hover:bg-slate-800 text-amber-300 border border-amber-500/40 rounded-md inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restore All ({dismissedItems.length})</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowDismissedDrawer(false)}
                className="px-2.5 py-1.5 text-xs text-slate-400 hover:text-slate-200 whitespace-nowrap shrink-0"
              >
                Close Drawer
              </button>
            </div>
          </div>

          {dismissedItems.length === 0 ? (
            <p className="text-xs text-slate-400 py-2">
              No films have been removed from consideration yet. Click "Remove from Consideration" on any recommendation below to exclude it.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {dismissedItems.map((item) => (
                <div
                  key={item.slug}
                  className="p-3 bg-slate-950 border border-slate-800 rounded-md flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-slate-200 truncate">
                      {item.title}{' '}
                      <span className="font-mono tabular-nums text-slate-500">
                        ({item.year})
                      </span>
                    </div>
                    <div className="text-slate-400 truncate mt-0.5">
                      Dir. {item.director} · {item.matchScore}% match
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRestoreDismissedFilm(item.slug)}
                    className="px-2.5 py-1 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-700 rounded inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Restore</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Section 2: Pathway Filter Controls, Watchlist Filter & Live Search */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Segmented Pathway Tabs */}
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg">
            {(
              [
                'all',
                'director_affinity',
                'writer_frequency',
                'subgenre_popular',
                'decade_sweet_spot',
              ] as RecommendationPathway[]
            ).map((pathway) => {
              const isSelected = selectedPathway === pathway;
              return (
                <button
                  key={pathway}
                  type="button"
                  onClick={() => {
                    setSelectedPathway(pathway);
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 font-mono tabular-nums ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-slate-100 hover:bg-slate-900'
                  }`}
                >
                  <span className="font-sans">{PATHWAY_LABELS[pathway]}</span> (
                  {pathwayCounts[pathway]})
                </button>
              );
            })}
          </div>

          {/* Watchlist Inclusion Filter */}
          <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setWatchlistFilter('all');
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                watchlistFilter === 'all'
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Unseen ({recommendations.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setWatchlistFilter('not_on_watchlist');
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                watchlistFilter === 'not_on_watchlist'
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              New Discoveries ({recommendations.length - watchlistMatchCount})
            </button>
            <button
              type="button"
              onClick={() => {
                setWatchlistFilter('on_watchlist');
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                watchlistFilter === 'on_watchlist'
                  ? 'bg-slate-800 text-sky-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              On Watchlist ({watchlistMatchCount})
            </button>
          </div>
        </div>

        {/* Search Input & Result Summary */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search recommendations by film title, director, screenwriter, sub-genre, or cited diary movie..."
              className="w-full pl-8 pr-8 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-md text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setCurrentPage(1);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="text-xs text-slate-400 font-mono tabular-nums">
            Showing {filteredRecommendations.length.toLocaleString()} recommended unseen films
          </div>
        </div>
      </div>

      {/* Section 3: Ranked Recommendation Cards with Explainable Citations & Dismissal Controls */}
      {paginatedItems.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-8 text-center space-y-3">
          <div className="text-sm font-display font-semibold text-slate-200">
            No recommendations match the current filter criteria
          </div>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Try resetting your active pathway, search query, or creator filter, or check the Dismissed Films drawer if you previously removed titles from consideration.
          </p>
          <div className="pt-1">
            <button
              type="button"
              onClick={() => {
                setSelectedPathway('all');
                setWatchlistFilter('all');
                setSelectedCreatorFilter(null);
                setSearchQuery('');
                setCurrentPage(1);
              }}
              className="px-4 py-2 text-xs font-medium bg-amber-500 text-slate-950 rounded-md hover:bg-amber-400 transition-colors"
            >
              Reset Recommendation Filters
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {paginatedItems.map((item, idx) => {
            const globalRank = (safePage - 1) * PAGE_SIZE + idx + 1;

            return (
              <div
                key={item.slug}
                className="bg-slate-900 border border-slate-800 rounded-lg p-5 flex flex-col justify-between gap-4 hover:border-slate-700 transition-colors"
              >
                <div className="space-y-3">
                  {/* Top Header Row: Rank, Title, Year, Watchlist Status, and Match Score */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono tabular-nums mb-1">
                        <span className="text-amber-400 font-semibold">
                          #{globalRank}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{item.year}</span>
                        <span aria-hidden="true">·</span>
                        <span>{item.runtimeMinutes}m</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-sans">{item.country}</span>
                        {item.isOnWatchlist && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-sky-400 font-sans font-medium inline-flex items-center gap-1">
                              <Bookmark className="w-3 h-3 fill-sky-400/30" />
                              On Watchlist
                            </span>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-display font-bold text-slate-100 truncate">
                          {item.title}
                        </h3>
                        <a
                          href={item.letterboxdUri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-500 hover:text-amber-400 transition-colors shrink-0"
                          title="Open on Letterboxd"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>

                      {/* Unboxed Metadata Line: Director, Writers, Sub-Genres */}
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-300 mt-1">
                        <span>
                          Dir.{' '}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCreatorFilter(item.director);
                              setCurrentPage(1);
                            }}
                            className="font-medium text-slate-100 hover:text-amber-300 underline decoration-slate-700"
                          >
                            {item.director}
                          </button>
                        </span>
                        <span aria-hidden="true" className="text-slate-600">
                          ·
                        </span>
                        <span className="text-slate-400">
                          Writ.{' '}
                          {item.writers.map((w, wIdx) => (
                            <React.Fragment key={w}>
                              {wIdx > 0 && ', '}
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedCreatorFilter(w);
                                  setCurrentPage(1);
                                }}
                                className="text-slate-300 hover:text-amber-300 underline decoration-slate-700"
                              >
                                {w}
                              </button>
                            </React.Fragment>
                          ))}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400 mt-1">
                        <span>{item.subgenres.join(' · ')}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums text-slate-400">
                          LB Avg {item.communityAvgRating.toFixed(2)}★
                        </span>
                      </div>
                    </div>

                    {/* Right Match & Predicted Rating Readout */}
                    <div className="text-right shrink-0 bg-slate-950 border border-slate-800 rounded-md px-3 py-2">
                      <div className="text-sm font-display font-bold font-mono tabular-nums text-amber-400">
                        {item.matchScore}% Match
                      </div>
                      <div className="text-[11px] font-mono tabular-nums text-emerald-400 mt-0.5 flex items-center justify-end gap-1">
                        <Star className="w-3 h-3 fill-emerald-400 text-emerald-400" />
                        <span>Est. {item.predictedRating.toFixed(1)}★</span>
                      </div>
                    </div>
                  </div>

                  {/* Explainable Recommendation Drivers & Diary Evidence */}
                  <div className="bg-slate-950 border border-slate-800/90 rounded-md p-3 space-y-2.5">
                    {item.reasons.slice(0, 2).map((reason, rIdx) => (
                      <div
                        key={`${reason.type}-${rIdx}`}
                        className={
                          rIdx > 0 ? 'pt-2 border-t border-slate-800/70' : ''
                        }
                      >
                        <div className="flex items-center gap-1.5 text-xs font-medium text-amber-300">
                          <Sparkles className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                          <span>{reason.headline}</span>
                        </div>
                        <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                          {reason.detail}
                        </p>
                        {reason.supportingFilms.length > 0 && (
                          <div className="text-[11px] text-slate-400 mt-1 font-mono tabular-nums">
                            <span className="font-sans text-slate-500">
                              Your logged reference films:{' '}
                            </span>
                            {reason.supportingFilms.map((sf, sfIdx) => (
                              <React.Fragment key={`${sf.title}-${sf.year}`}>
                                {sfIdx > 0 && ' · '}
                                <span className="text-slate-300">
                                  {sf.title} ({sf.year}
                                  {sf.rating !== null
                                    ? `, ${sf.rating.toFixed(1)}★`
                                    : ''}
                                  {sf.rewatch ? ', ↻' : ''})
                                </span>
                              </React.Fragment>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action Footer: Acclaim Note + Watchlist Action + Remove from Consideration */}
                <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-[11px] text-slate-400 truncate max-w-xs">
                    {item.acclaimNote}
                  </span>

                  <div className="flex items-center gap-2 shrink-0">
                    {item.isOnWatchlist ? (
                      <span className="px-3 py-1.5 text-xs font-medium bg-sky-500/15 text-sky-300 border border-sky-500/30 rounded-md inline-flex items-center gap-1.5 whitespace-nowrap shrink-0">
                        <Check className="w-3.5 h-3.5" />
                        <span>On Your Watchlist</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleAddToWatchlist(item)}
                        className="px-3 py-1.5 text-xs font-medium bg-slate-950 hover:bg-slate-800 text-sky-300 border border-sky-500/40 rounded-md inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                      >
                        <Bookmark className="w-3.5 h-3.5" />
                        <span>+ Add to Watchlist</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleDismissFilm(item.slug)}
                      className="px-3 py-1.5 text-xs font-medium bg-slate-950 hover:bg-rose-950/50 text-slate-300 hover:text-rose-300 border border-slate-800 hover:border-rose-500/40 rounded-md inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                      title="Remove this film from recommendation consideration"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                      <span>Remove from Consideration</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 flex items-center justify-between text-xs font-mono tabular-nums text-slate-400">
          <span>
            Showing {(safePage - 1) * PAGE_SIZE + 1}–
            {Math.min(safePage * PAGE_SIZE, filteredRecommendations.length)} of{' '}
            {filteredRecommendations.length.toLocaleString()} recommendations
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-40 inline-flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Prev</span>
            </button>
            <span>
              Page {safePage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-40 inline-flex items-center gap-1"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
