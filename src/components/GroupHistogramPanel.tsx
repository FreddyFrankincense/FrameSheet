import React, { useMemo, useState } from 'react';
import {
  BarChart2,
  BookmarkPlus,
  Calendar,
  Clock,
  ExternalLink,
  Film,
  Layers,
  Sparkles,
  Star,
  X,
} from 'lucide-react';
import { FilmEntry } from '../types/letterboxd';

export interface FilmGroupCohort {
  id: string;
  label: string;
  description: string;
  sourceType: 'search_results' | 'manual_selection' | 'group_section' | 'saved_group';
  films: FilmEntry[];
}

interface GroupHistogramPanelProps {
  cohort: FilmGroupCohort;
  baselineAllFilms: FilmEntry[];
  onClose?: () => void;
  onOpenInFullAnalytics?: (cohort: FilmGroupCohort) => void;
  onSaveCohort?: (name: string, films: FilmEntry[]) => void;
  onInspectFilm?: (filmId: string) => void;
}

type HistogramDimension =
  | 'release_year'
  | 'rating'
  | 'watched_date'
  | 'genre'
  | 'runtime';

type YearBinSize = 'exact_year' | '5_year' | 'decade';

const RATING_BUCKETS = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];

const RUNTIME_BINS = [
  { key: '<90m', label: '< 90m', min: 0, max: 89 },
  { key: '90-104m', label: '90–104m', min: 90, max: 104 },
  { key: '105-119m', label: '105–119m', min: 105, max: 119 },
  { key: '120-139m', label: '120–139m', min: 120, max: 139 },
  { key: '140-164m', label: '140–164m', min: 140, max: 164 },
  { key: '165m+', label: '165m+', min: 165, max: 9999 },
];

export const GroupHistogramPanel: React.FC<GroupHistogramPanelProps> = ({
  cohort,
  baselineAllFilms,
  onClose,
  onOpenInFullAnalytics,
  onSaveCohort,
  onInspectFilm,
}) => {
  const [activeDimension, setActiveDimension] =
    useState<HistogramDimension>('release_year');
  const [yearBinSize, setYearBinSize] = useState<YearBinSize>('exact_year');
  const [selectedBinKey, setSelectedBinKey] = useState<string | null>(null);
  const [customGroupName, setCustomGroupName] = useState('');
  const [showSavePrompt, setShowSavePrompt] = useState(false);

  // Compute baseline & cohort summary metrics
  const metrics = useMemo(() => {
    const films = cohort.films;
    const rated = films.filter((f) => f.rating !== null);
    const meanRating =
      rated.length > 0
        ? rated.reduce((s, f) => s + (f.rating ?? 0), 0) / rated.length
        : 0;

    const allRated = baselineAllFilms.filter((f) => f.rating !== null);
    const baselineMean =
      allRated.length > 0
        ? allRated.reduce((s, f) => s + (f.rating ?? 0), 0) / allRated.length
        : 0;

    const ratingDelta = rated.length > 0 ? meanRating - baselineMean : 0;

    const years = films.map((f) => f.year).filter(Boolean);
    const minYear = years.length > 0 ? Math.min(...years) : 0;
    const maxYear = years.length > 0 ? Math.max(...years) : 0;
    const medianYear =
      years.length > 0
        ? [...years].sort((a, b) => a - b)[Math.floor(years.length / 2)]
        : 0;

    const avgRuntime =
      films.length > 0
        ? Math.round(
            films.reduce((s, f) => s + (f.runtimeMinutes || 0), 0) / films.length
          )
        : 0;

    return {
      total: films.length,
      ratedCount: rated.length,
      meanRating,
      baselineMean,
      ratingDelta,
      minYear,
      maxYear,
      medianYear,
      avgRuntime,
      shareOfProfile:
        baselineAllFilms.length > 0
          ? (films.length / baselineAllFilms.length) * 100
          : 0,
    };
  }, [cohort.films, baselineAllFilms]);

  // Build histogram bins for all 5 dimensions
  const histogramData = useMemo(() => {
    const films = cohort.films;

    // 1. Release Year / Era Histogram
    const releaseYearBins: {
      key: string;
      label: string;
      shortLabel: string;
      count: number;
      share: number;
      meanRating: number | null;
      films: FilmEntry[];
    }[] = [];

    if (films.length > 0) {
      const binMap = new Map<string, { label: string; shortLabel: string; films: FilmEntry[] }>();

      if (yearBinSize === 'exact_year') {
        const years = films.map((f) => f.year).filter(Boolean);
        const minY = Math.min(...years);
        const maxY = Math.max(...years);
        // If span is reasonable (<= 36 years), show continuous axis including 0-count years for true histogram shape
        if (maxY - minY <= 36) {
          for (let y = minY; y <= maxY; y++) {
            binMap.set(String(y), {
              label: String(y),
              shortLabel: `'${String(y).slice(-2)}`,
              films: [],
            });
          }
        }
        films.forEach((f) => {
          const k = String(f.year);
          const cur = binMap.get(k) || {
            label: k,
            shortLabel: `'${k.slice(-2)}`,
            films: [],
          };
          cur.films.push(f);
          binMap.set(k, cur);
        });
      } else if (yearBinSize === '5_year') {
        films.forEach((f) => {
          const start = Math.floor(f.year / 5) * 5;
          const end = start + 4;
          const k = `${start}-${end}`;
          const cur = binMap.get(k) || {
            label: `${start}–${end}`,
            shortLabel: `${start}s`,
            films: [],
          };
          cur.films.push(f);
          binMap.set(k, cur);
        });
      } else {
        // decade
        films.forEach((f) => {
          const dec = Math.floor(f.year / 10) * 10;
          const k = `${dec}s`;
          const cur = binMap.get(k) || {
            label: `${dec}s`,
            shortLabel: `${dec}s`,
            films: [],
          };
          cur.films.push(f);
          binMap.set(k, cur);
        });
      }

      Array.from(binMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .forEach(([key, val]) => {
          const rated = val.films.filter((f) => f.rating !== null);
          const avg =
            rated.length > 0
              ? rated.reduce((s, f) => s + (f.rating ?? 0), 0) / rated.length
              : null;
          releaseYearBins.push({
            key,
            label: val.label,
            shortLabel: val.shortLabel,
            count: val.films.length,
            share: films.length > 0 ? (val.films.length / films.length) * 100 : 0,
            meanRating: avg,
            films: val.films,
          });
        });
    }

    // 2. Star Rating Histogram (0.5★ - 5.0★)
    const ratingBins = RATING_BUCKETS.map((bucket) => {
      const matching = films.filter((f) => f.rating === bucket);
      return {
        key: `${bucket.toFixed(1)}`,
        label: `${bucket.toFixed(1)} ★`,
        shortLabel: `${bucket.toFixed(1)}★`,
        count: matching.length,
        share: films.length > 0 ? (matching.length / films.length) * 100 : 0,
        meanRating: bucket,
        films: matching,
      };
    });

    // 3. Watched Year Histogram
    const watchedMap = new Map<string, FilmEntry[]>();
    films.forEach((f) => {
      const wKey = f.watchlist
        ? 'Watchlist'
        : f.watchedDate && f.watchedDate.length >= 4
        ? f.watchedDate.slice(0, 4)
        : 'Undated';
      const list = watchedMap.get(wKey) || [];
      list.push(f);
      watchedMap.set(wKey, list);
    });
    const watchedBins = Array.from(watchedMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, list]) => {
        const rated = list.filter((f) => f.rating !== null);
        const avg =
          rated.length > 0
            ? rated.reduce((s, f) => s + (f.rating ?? 0), 0) / rated.length
            : null;
        return {
          key,
          label: key === 'Watchlist' ? 'On Watchlist' : `Watched ${key}`,
          shortLabel: key,
          count: list.length,
          share: films.length > 0 ? (list.length / films.length) * 100 : 0,
          meanRating: avg,
          films: list,
        };
      });

    // 4. Genre Histogram
    const genreMap = new Map<string, FilmEntry[]>();
    films.forEach((f) => {
      f.genres.forEach((g) => {
        const list = genreMap.get(g) || [];
        list.push(f);
        genreMap.set(g, list);
      });
    });
    const genreBins = Array.from(genreMap.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 12)
      .map(([genre, list]) => {
        const rated = list.filter((f) => f.rating !== null);
        const avg =
          rated.length > 0
            ? rated.reduce((s, f) => s + (f.rating ?? 0), 0) / rated.length
            : null;
        return {
          key: genre,
          label: genre,
          shortLabel: genre.length > 10 ? `${genre.slice(0, 9)}…` : genre,
          count: list.length,
          share: films.length > 0 ? (list.length / films.length) * 100 : 0,
          meanRating: avg,
          films: list,
        };
      });

    // 5. Runtime Histogram
    const runtimeBins = RUNTIME_BINS.map((bin) => {
      const matching = films.filter(
        (f) => f.runtimeMinutes >= bin.min && f.runtimeMinutes <= bin.max
      );
      const rated = matching.filter((f) => f.rating !== null);
      const avg =
        rated.length > 0
          ? rated.reduce((s, f) => s + (f.rating ?? 0), 0) / rated.length
          : null;
      return {
        key: bin.key,
        label: bin.label,
        shortLabel: bin.label,
        count: matching.length,
        share: films.length > 0 ? (matching.length / films.length) * 100 : 0,
        meanRating: avg,
        films: matching,
      };
    });

    return {
      release_year: releaseYearBins,
      rating: ratingBins,
      watched_date: watchedBins,
      genre: genreBins,
      runtime: runtimeBins,
    };
  }, [cohort.films, yearBinSize]);

  const activeBins = histogramData[activeDimension];
  const maxBinCount = useMemo(
    () => Math.max(1, ...activeBins.map((b) => b.count)),
    [activeBins]
  );

  const selectedBin = useMemo(
    () => activeBins.find((b) => b.key === selectedBinKey) || null,
    [activeBins, selectedBinKey]
  );

  return (
    <div className="bg-slate-900 border border-amber-500/40 rounded-lg overflow-hidden shadow-lg">
      {/* Header Bar */}
      <div className="px-4 py-3 bg-slate-950/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="p-1.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-400">
            <BarChart2 className="w-4 h-4" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xs font-display font-bold text-slate-100 uppercase tracking-wider">
                Group &amp; Search Cohort Histograms
              </h3>
              <span className="px-2 py-0.5 text-xs font-mono font-semibold rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                {cohort.label}
              </span>
              <span className="text-xs font-mono tabular-nums text-slate-400">
                ({metrics.total.toLocaleString()}{' '}
                {metrics.total === 1 ? 'film' : 'films'} ·{' '}
                {metrics.shareOfProfile.toFixed(1)}% of account)
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {cohort.description}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onSaveCohort && (
            <div className="relative">
              {showSavePrompt ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const name = customGroupName.trim() || cohort.label;
                    onSaveCohort(name, cohort.films);
                    setCustomGroupName('');
                    setShowSavePrompt(false);
                  }}
                  className="flex items-center gap-1.5 bg-slate-900 border border-amber-500/50 rounded-md p-1"
                >
                  <input
                    type="text"
                    value={customGroupName}
                    onChange={(e) => setCustomGroupName(e.target.value)}
                    placeholder={cohort.label}
                    className="px-2 py-0.5 text-xs bg-slate-950 border border-slate-800 rounded text-slate-100 focus:outline-none focus:border-amber-500 w-40"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="px-2 py-0.5 text-[11px] font-medium bg-amber-500 text-slate-950 rounded hover:bg-amber-400"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSavePrompt(false)}
                    className="p-0.5 text-slate-400 hover:text-slate-200"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setCustomGroupName(cohort.label);
                    setShowSavePrompt(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-md transition-colors"
                  title="Save this group of films as a named cohort for quick analysis"
                >
                  <BookmarkPlus className="w-3.5 h-3.5 text-amber-400" />
                  <span>Save Group</span>
                </button>
              )}
            </div>
          )}

          {onOpenInFullAnalytics && (
            <button
              type="button"
              onClick={() => onOpenInFullAnalytics(cohort)}
              className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md transition-colors"
              title="Apply all full-page Analytics visualizations (including the Calendar Heatmap and Genre Bias tables) to this specific group of films"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Open Group in Full Analytics</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-100 rounded"
              title="Close group histogram panel"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Group KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 bg-slate-950/40 border-b border-slate-800/80 text-xs font-mono tabular-nums">
        <div className="px-3 py-2 rounded bg-slate-950 border border-slate-800/90 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-sans text-slate-400">Group Size</div>
            <div className="text-sm font-bold text-slate-100">
              {metrics.total.toLocaleString()} films
            </div>
          </div>
          <span className="text-[11px] text-slate-400">
            {metrics.ratedCount.toLocaleString()} rated
          </span>
        </div>

        <div className="px-3 py-2 rounded bg-slate-950 border border-slate-800/90 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-sans text-slate-400">
              Group Mean Rating
            </div>
            <div className="text-sm font-bold text-amber-400">
              {metrics.meanRating.toFixed(2)} ★
            </div>
          </div>
          <span
            className={`text-[11px] ${
              metrics.ratingDelta >= 0.05
                ? 'text-emerald-400'
                : metrics.ratingDelta <= -0.05
                ? 'text-rose-400'
                : 'text-slate-400'
            }`}
            title={`Account overall mean rating: ${metrics.baselineMean.toFixed(2)} ★`}
          >
            {metrics.ratingDelta >= 0
              ? `+${metrics.ratingDelta.toFixed(2)}★`
              : `${metrics.ratingDelta.toFixed(2)}★`}{' '}
            vs avg
          </span>
        </div>

        <div className="px-3 py-2 rounded bg-slate-950 border border-slate-800/90 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-sans text-slate-400">
              Release Year Span
            </div>
            <div className="text-sm font-bold text-slate-100">
              {metrics.minYear > 0
                ? `${metrics.minYear}–${metrics.maxYear}`
                : '—'}
            </div>
          </div>
          <span className="text-[11px] text-sky-400">
            Med {metrics.medianYear || '—'}
          </span>
        </div>

        <div className="px-3 py-2 rounded bg-slate-950 border border-slate-800/90 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-sans text-slate-400">
              Mean Runtime
            </div>
            <div className="text-sm font-bold text-slate-100">
              {metrics.avgRuntime} min
            </div>
          </div>
          <span className="text-[11px] text-slate-400">
            {(metrics.avgRuntime / 60).toFixed(1)}h avg
          </span>
        </div>
      </div>

      {/* Dimension Selector Tabs + Granularity Controls */}
      <div className="px-4 pt-3 pb-2 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/60">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ['release_year', 'Release Year Histogram', Calendar],
              ['rating', 'Star Rating Histogram (0.5–5.0★)', Star],
              ['watched_date', 'Watched Year Histogram', Film],
              ['genre', 'Genre Distribution', Layers],
              ['runtime', 'Runtime Histogram', Clock],
            ] as const
          ).map(([dimKey, label, Icon]) => {
            const isActive = activeDimension === dimKey;
            return (
              <button
                key={dimKey}
                type="button"
                onClick={() => {
                  setActiveDimension(dimKey);
                  setSelectedBinKey(null);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                  isActive
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-semibold'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-slate-100 hover:border-slate-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {activeDimension === 'release_year' && (
          <div className="flex items-center gap-1 p-0.5 bg-slate-950 border border-slate-800 rounded-md text-[11px]">
            {(
              [
                ['exact_year', 'By Year'],
                ['5_year', '5-Year Bins'],
                ['decade', 'By Decade'],
              ] as const
            ).map(([binKey, label]) => (
              <button
                key={binKey}
                type="button"
                onClick={() => {
                  setYearBinSize(binKey);
                  setSelectedBinKey(null);
                }}
                className={`px-2.5 py-1 rounded transition-colors ${
                  yearBinSize === binKey
                    ? 'bg-slate-800 text-amber-300 font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main Histogram Canvas */}
      <div className="p-4">
        {activeBins.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            No films in this group to plot.
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>
                Showing{' '}
                <strong className="text-slate-200 font-mono">
                  {activeBins.length}
                </strong>{' '}
                histogram bins for <strong className="text-amber-300">{cohort.label}</strong>.
                Click any bar to inspect the specific films in that bin.
              </span>
              {selectedBin && (
                <button
                  type="button"
                  onClick={() => setSelectedBinKey(null)}
                  className="text-amber-400 hover:underline"
                >
                  Clear bin selection ({selectedBin.label})
                </button>
              )}
            </div>

            <div className="overflow-x-auto pb-2">
              <div
                className="h-48 pt-6 pb-2 px-2 bg-slate-950/60 border border-slate-800/80 rounded-lg flex items-end gap-1.5"
                style={{
                  minWidth: `${Math.max(480, activeBins.length * 36)}px`,
                }}
              >
                {activeBins.map((bin) => {
                  const heightPct =
                    bin.count > 0
                      ? Math.max(8, Math.round((bin.count / maxBinCount) * 100))
                      : 2;
                  const isSelected = selectedBinKey === bin.key;

                  // Color bar by mean rating of the bin
                  const barColor = isSelected
                    ? 'bg-amber-300 ring-2 ring-white'
                    : bin.count === 0
                    ? 'bg-slate-800/40'
                    : (bin.meanRating ?? 3.8) >= 4.2
                    ? 'bg-amber-400 hover:bg-amber-300'
                    : (bin.meanRating ?? 3.8) >= 3.5
                    ? 'bg-emerald-500/85 hover:bg-emerald-400'
                    : 'bg-sky-500/85 hover:bg-sky-400';

                  return (
                    <button
                      key={bin.key}
                      type="button"
                      onClick={() =>
                        setSelectedBinKey((prev) =>
                          prev === bin.key ? null : bin.key
                        )
                      }
                      title={`${bin.label}: ${bin.count} ${
                        bin.count === 1 ? 'film' : 'films'
                      } (${bin.share.toFixed(1)}%)${
                        bin.meanRating !== null
                          ? ` · Avg ${bin.meanRating.toFixed(2)}★`
                          : ''
                      }`}
                      className="flex-1 min-w-[24px] h-full flex flex-col items-center justify-end group focus:outline-none"
                    >
                      <span
                        className={`text-[10px] font-mono tabular-nums mb-1 ${
                          isSelected
                            ? 'text-amber-300 font-bold'
                            : bin.count > 0
                            ? 'text-slate-300 group-hover:text-white'
                            : 'text-slate-700'
                        }`}
                      >
                        {bin.count > 0 ? bin.count : ''}
                      </span>

                      <div className="w-full flex-1 flex items-end justify-center">
                        <div
                          style={{ height: `${heightPct}%` }}
                          className={`w-full max-w-[36px] rounded-t transition-all ${barColor}`}
                        />
                      </div>

                      <div
                        className={`mt-1.5 text-[10px] font-mono tabular-nums truncate max-w-full ${
                          isSelected
                            ? 'text-amber-300 font-semibold'
                            : 'text-slate-400'
                        }`}
                      >
                        {bin.shortLabel}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Drilldown of Films Inside Selected Histogram Bin */}
        {selectedBin && selectedBin.films.length > 0 && (
          <div className="mt-3 p-3 rounded-lg bg-slate-950 border border-amber-500/40 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-display font-semibold text-amber-300">
                {selectedBin.label} — {selectedBin.count}{' '}
                {selectedBin.count === 1 ? 'film' : 'films'} in &ldquo;
                {cohort.label}&rdquo;
                {selectedBin.meanRating !== null &&
                  ` (Mean ${selectedBin.meanRating.toFixed(2)} ★)`}
              </span>
              <button
                type="button"
                onClick={() => setSelectedBinKey(null)}
                className="text-slate-400 hover:text-slate-200 text-[11px]"
              >
                Close bin
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
              {selectedBin.films.map((film) => (
                <button
                  key={film.id}
                  type="button"
                  onClick={() => onInspectFilm?.(film.id)}
                  className="p-2 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-left flex items-center justify-between gap-2 text-xs transition-colors"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-slate-100 truncate">
                      {film.title}
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 truncate">
                      {film.year} · {film.director}
                    </div>
                  </div>
                  <span className="font-mono tabular-nums text-amber-400 shrink-0">
                    {film.rating !== null ? `${film.rating.toFixed(1)}★` : 'WL'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
