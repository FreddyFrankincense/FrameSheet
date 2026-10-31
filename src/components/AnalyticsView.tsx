import React, { useEffect, useMemo, useState } from 'react';
import { BarChart2, ChevronLeft, ChevronRight, Search, Star } from 'lucide-react';
import { ProfileAccount } from '../types/letterboxd';

interface AnalyticsViewProps {
  profile: ProfileAccount;
}

const RATING_BUCKETS = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];

function formatStarGlyphs(rating: number): string {
  const full = Math.floor(rating);
  const half = rating % 1 !== 0;
  return '★'.repeat(full) + (half ? '½' : '');
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ profile }) => {
  const [selectedRatingBucket, setSelectedRatingBucket] = useState<number | null>(null);
  const [selectedPeriodBucket, setSelectedPeriodBucket] = useState<string | null>(null);
  const [chartOrientation, setChartOrientation] = useState<'vertical' | 'horizontal'>('vertical');
  const [timelineGranularity, setTimelineGranularity] = useState<'yearly' | 'monthly'>('yearly');

  // Drilldown tray pagination & search so large buckets (e.g. 400+ films at 3.5★) stay compact
  const [trayPage, setTrayPage] = useState<number>(1);
  const [traySearch, setTraySearch] = useState<string>('');
  const TRAY_PAGE_SIZE = 12;

  useEffect(() => {
    setTrayPage(1);
    setTraySearch('');
  }, [selectedRatingBucket, selectedPeriodBucket, profile.id]);

  const stats = useMemo(() => {
    const films = profile.films;
    const ratedFilms = films.filter((f) => f.rating !== null);
    const totalCount = films.length;
    const ratedCount = ratedFilms.length;

    const sumRatings = ratedFilms.reduce((acc, f) => acc + (f.rating ?? 0), 0);
    const meanRating = ratedCount > 0 ? sumRatings / ratedCount : 0;

    // Standard deviation
    const variance =
      ratedCount > 0
        ? ratedFilms.reduce((acc, f) => acc + Math.pow((f.rating ?? 0) - meanRating, 2), 0) /
          ratedCount
        : 0;
    const stdDev = Math.sqrt(variance);

    // Median rating
    const sortedRatings = ratedFilms
      .map((f) => f.rating as number)
      .sort((a, b) => a - b);
    const medianRating =
      sortedRatings.length > 0
        ? sortedRatings[Math.floor(sortedRatings.length / 2)]
        : 0;

    const totalMinutes = films.reduce((acc, f) => acc + (f.runtimeMinutes || 0), 0);
    const totalHours = Math.round(totalMinutes / 60);
    const rewatches = films.filter((f) => f.rewatch).length;
    const likedCount = films.filter((f) => f.liked).length;
    const fiveStarCount = ratedFilms.filter((f) => f.rating === 5.0).length;

    // 1. Rating distribution buckets (0.5 to 5.0)
    let runningCount = 0;
    const ratingDist = RATING_BUCKETS.map((bucket) => {
      const matching = ratedFilms.filter((f) => f.rating === bucket);
      runningCount += matching.length;
      return {
        bucket,
        glyph: formatStarGlyphs(bucket),
        count: matching.length,
        share: ratedCount > 0 ? (matching.length / ratedCount) * 100 : 0,
        cumulativePct: ratedCount > 0 ? (runningCount / ratedCount) * 100 : 0,
      };
    });
    const maxBucketCount = Math.max(1, ...ratingDist.map((d) => d.count));

    // Modal rating (most frequent bucket)
    const modalBucket = [...ratingDist].sort((a, b) => b.count - a.count)[0];

    // Y-axis ticks for vertical bar chart
    const yAxisMax = Math.max(4, Math.ceil(maxBucketCount / 5) * 5);
    const yAxisTicks = [
      yAxisMax,
      Math.round(yAxisMax * 0.75),
      Math.round(yAxisMax * 0.5),
      Math.round(yAxisMax * 0.25),
      0,
    ];

    // 2. Viewing timeline (Yearly for multi-year archives + Monthly for recent 12m)
    const periodMap = new Map<
      string,
      { period: string; firstWatch: number; rewatch: number; total: number; ratingSum: number; ratedTotal: number }
    >();

    films.forEach((f) => {
      if (!f.watchedDate) return;
      const key =
        timelineGranularity === 'yearly'
          ? f.watchedDate.slice(0, 4)
          : f.watchedDate.slice(0, 7);
      if (!key) return;
      const cur = periodMap.get(key) || {
        period: key,
        firstWatch: 0,
        rewatch: 0,
        total: 0,
        ratingSum: 0,
        ratedTotal: 0,
      };
      cur.total += 1;
      if (f.rewatch) cur.rewatch += 1;
      else cur.firstWatch += 1;
      if (f.rating !== null) {
        cur.ratingSum += f.rating;
        cur.ratedTotal += 1;
      }
      periodMap.set(key, cur);
    });

    const timeline = Array.from(periodMap.values())
      .sort((a, b) => a.period.localeCompare(b.period))
      .slice(-12);
    const maxPeriodTotal = Math.max(1, ...timeline.map((t) => t.total));

    // 3. Genre breakdown & bias relative to meanRating
    const genreMap = new Map<
      string,
      { genre: string; count: number; ratingSum: number; ratedCount: number; rewatches: number }
    >();
    films.forEach((f) => {
      f.genres.forEach((g) => {
        const cur = genreMap.get(g) || {
          genre: g,
          count: 0,
          ratingSum: 0,
          ratedCount: 0,
          rewatches: 0,
        };
        cur.count += 1;
        if (f.rewatch) cur.rewatches += 1;
        if (f.rating !== null) {
          cur.ratingSum += f.rating;
          cur.ratedCount += 1;
        }
        genreMap.set(g, cur);
      });
    });

    const genreBreakdown = Array.from(genreMap.values())
      .map((g) => {
        const avg = g.ratedCount > 0 ? g.ratingSum / g.ratedCount : meanRating;
        return {
          ...g,
          avgRating: avg,
          bias: avg - meanRating,
          share: totalCount > 0 ? (g.count / totalCount) * 100 : 0,
        };
      })
      .sort((a, b) => b.count - a.count);

    // 4. Release Decade breakdown
    const decadeMap = new Map<
      string,
      { decade: string; count: number; ratingSum: number; ratedCount: number }
    >();
    films.forEach((f) => {
      const dec = `${Math.floor(f.year / 10) * 10}s`;
      const cur = decadeMap.get(dec) || {
        decade: dec,
        count: 0,
        ratingSum: 0,
        ratedCount: 0,
      };
      cur.count += 1;
      if (f.rating !== null) {
        cur.ratingSum += f.rating;
        cur.ratedCount += 1;
      }
      decadeMap.set(dec, cur);
    });

    const decades = Array.from(decadeMap.values())
      .map((d) => ({
        ...d,
        avgRating: d.ratedCount > 0 ? d.ratingSum / d.ratedCount : 0,
      }))
      .sort((a, b) => a.decade.localeCompare(b.decade));
    const maxDecadeCount = Math.max(1, ...decades.map((d) => d.count));

    // 5. Top Directors
    const directorMap = new Map<string, { director: string; count: number; ratingSum: number }>();
    films.forEach((f) => {
      if (!f.director || f.director === 'Catalog Enriched') return;
      const cur = directorMap.get(f.director) || {
        director: f.director,
        count: 0,
        ratingSum: 0,
      };
      cur.count += 1;
      cur.ratingSum += f.rating ?? meanRating;
      directorMap.set(f.director, cur);
    });
    const topDirectors = Array.from(directorMap.values())
      .map((d) => ({
        ...d,
        avgRating: d.ratingSum / d.count,
      }))
      .sort((a, b) => b.count - a.count || b.avgRating - a.avgRating)
      .slice(0, 8);

    return {
      totalCount,
      ratedCount,
      meanRating,
      medianRating,
      stdDev,
      totalHours,
      rewatches,
      likedCount,
      fiveStarCount,
      ratingDist,
      maxBucketCount,
      modalBucket,
      yAxisMax,
      yAxisTicks,
      timeline,
      maxPeriodTotal,
      genreBreakdown,
      decades,
      maxDecadeCount,
      topDirectors,
    };
  }, [profile.films, timelineGranularity]);

  const bucketFilteredFilms = useMemo(() => {
    let base = profile.films;
    if (selectedRatingBucket !== null) {
      base = base.filter((f) => f.rating === selectedRatingBucket);
    } else if (selectedPeriodBucket !== null) {
      base = base.filter(
        (f) => f.watchedDate && f.watchedDate.startsWith(selectedPeriodBucket)
      );
    } else {
      return [];
    }

    const q = traySearch.trim().toLowerCase();
    if (q) {
      base = base.filter(
        (f) =>
          f.title.toLowerCase().includes(q) ||
          f.director.toLowerCase().includes(q) ||
          f.genres.some((g) => g.toLowerCase().includes(q))
      );
    }
    return base;
  }, [profile.films, selectedRatingBucket, selectedPeriodBucket, traySearch]);

  const trayTotalPages = Math.max(1, Math.ceil(bucketFilteredFilms.length / TRAY_PAGE_SIZE));
  const safeTrayPage = Math.min(trayPage, trayTotalPages);
  const paginatedTrayFilms = bucketFilteredFilms.slice(
    (safeTrayPage - 1) * TRAY_PAGE_SIZE,
    safeTrayPage * TRAY_PAGE_SIZE
  );

  // Mean position percentage across the 0.5..5.0 axis
  const meanAxisPositionPct = useMemo(() => {
    if (stats.ratedCount === 0) return 50;
    return Math.max(0, Math.min(100, ((stats.meanRating - 0.25) / 5.0) * 100));
  }, [stats.meanRating, stats.ratedCount]);

  return (
    <div className="space-y-6">
      {/* Top Metric Summary Strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-400 mb-1">Total Logged Films</div>
          <div className="text-2xl font-display font-bold font-mono tabular-nums text-slate-100">
            {stats.totalCount.toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
            {stats.ratedCount.toLocaleString()} rated · {stats.likedCount.toLocaleString()} liked
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-400 mb-1">Mean Rating</div>
          <div className="text-2xl font-display font-bold font-mono tabular-nums text-amber-400">
            {stats.meanRating.toFixed(2)} ★
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
            Median {stats.medianRating.toFixed(1)} ★ · σ {stats.stdDev.toFixed(2)}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-400 mb-1">Viewing Runtime</div>
          <div className="text-2xl font-display font-bold font-mono tabular-nums text-slate-100">
            {stats.totalHours.toLocaleString()}h
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
            {(stats.totalHours / 24).toFixed(1)} continuous days
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-400 mb-1">Rewatch Cadence</div>
          <div className="text-2xl font-display font-bold font-mono tabular-nums text-emerald-400">
            {stats.totalCount > 0
              ? `${Math.round((stats.rewatches / stats.totalCount) * 100)}%`
              : '0%'}
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
            {stats.rewatches.toLocaleString()} rewatched entries
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-400 mb-1">5.0★ Masterpiece Rate</div>
          <div className="text-2xl font-display font-bold font-mono tabular-nums text-slate-100">
            {stats.ratedCount > 0
              ? `${((stats.fiveStarCount / stats.ratedCount) * 100).toFixed(1)}%`
              : '0.0%'}
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
            {stats.fiveStarCount.toLocaleString()} films at 5.0 ★
          </div>
        </div>
      </div>

      {/* Primary Two-Column Charts: Star Rating Frequency Distribution + Viewing Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Star Rating Frequency Distribution Bar Chart (0.5★ – 5.0★) */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-display font-semibold text-slate-100">
                  Star Rating Frequency Distribution (0.5★ – 5.0★)
                </h3>
              </div>

              <div className="flex items-center gap-1 p-0.5 bg-slate-950 border border-slate-800 rounded-md">
                <button
                  type="button"
                  onClick={() => setChartOrientation('vertical')}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    chartOrientation === 'vertical'
                      ? 'bg-slate-800 text-slate-100'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Columns
                </button>
                <button
                  type="button"
                  onClick={() => setChartOrientation('horizontal')}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    chartOrientation === 'horizontal'
                      ? 'bg-slate-800 text-slate-100'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Horizontal Bars
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mb-5 font-mono tabular-nums">
              <span>Mean: {stats.meanRating.toFixed(2)}★</span>
              <span aria-hidden="true">·</span>
              <span>Median: {stats.medianRating.toFixed(1)}★</span>
              <span aria-hidden="true">·</span>
              <span>
                Mode:{' '}
                {stats.modalBucket
                  ? `${stats.modalBucket.bucket.toFixed(1)}★ (${stats.modalBucket.count.toLocaleString()})`
                  : '—'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-sans text-slate-500">Click bar to inspect</span>
            </div>
          </div>

          {chartOrientation === 'vertical' ? (
            <div>
              <div className="relative flex h-56 pt-4">
                <div className="w-10 pr-2 flex flex-col justify-between text-right text-[10px] font-mono tabular-nums text-slate-500 pb-6 select-none">
                  {stats.yAxisTicks.map((tick, idx) => (
                    <span key={idx} className="leading-none">
                      {tick.toLocaleString()}
                    </span>
                  ))}
                </div>

                <div className="relative flex-1 flex flex-col">
                  <div className="absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between pointer-events-none">
                    {stats.yAxisTicks.map((_, idx) => (
                      <div
                        key={idx}
                        className="w-full border-b border-slate-800/70 border-dashed last:border-solid last:border-slate-700"
                      />
                    ))}
                  </div>

                  {stats.ratedCount > 0 && (
                    <div
                      style={{ left: `${meanAxisPositionPct}%` }}
                      className="absolute top-0 bottom-6 border-l border-amber-400/60 border-dashed z-10 pointer-events-none"
                      title={`Mean Rating: ${stats.meanRating.toFixed(2)}★`}
                    >
                      <span className="absolute -top-3.5 -translate-x-1/2 px-1.5 py-0.5 text-[10px] font-mono tabular-nums bg-slate-950 border border-amber-500/40 rounded text-amber-300 whitespace-nowrap">
                        Avg {stats.meanRating.toFixed(2)}★
                      </span>
                    </div>
                  )}

                  <div className="relative z-10 flex-1 flex items-end gap-2 pb-6 px-1">
                    {stats.ratingDist.map((item) => {
                      const heightPct =
                        item.count > 0
                          ? Math.max(6, Math.round((item.count / stats.yAxisMax) * 100))
                          : 2;
                      const isSelected = selectedRatingBucket === item.bucket;

                      return (
                        <button
                          key={item.bucket}
                          type="button"
                          onClick={() => {
                            setSelectedPeriodBucket(null);
                            setSelectedRatingBucket((prev) =>
                              prev === item.bucket ? null : item.bucket
                            );
                          }}
                          title={`${item.bucket.toFixed(1)}★ (${item.glyph}): ${item.count.toLocaleString()} films (${item.share.toFixed(1)}%)`}
                          className="flex-1 flex flex-col items-center justify-end h-full group focus:outline-none"
                        >
                          <span
                            className={`text-[10px] font-mono tabular-nums mb-1 transition-colors ${
                              isSelected
                                ? 'text-amber-300 font-bold'
                                : item.count > 0
                                ? 'text-slate-300 group-hover:text-white'
                                : 'text-slate-600'
                            }`}
                          >
                            {item.count.toLocaleString()}
                          </span>
                          <div className="w-full flex-1 flex items-end justify-center">
                            <div
                              style={{ height: `${heightPct}%` }}
                              className={`w-full rounded-t transition-all ${
                                isSelected
                                  ? 'bg-amber-400 ring-2 ring-amber-300/60'
                                  : item.count === 0
                                  ? 'bg-slate-800/50'
                                  : item.bucket >= 4.5
                                  ? 'bg-amber-500/90 group-hover:bg-amber-400'
                                  : item.bucket >= 3.5
                                  ? 'bg-emerald-500/80 group-hover:bg-emerald-400'
                                  : item.bucket >= 2.5
                                  ? 'bg-sky-500/75 group-hover:bg-sky-400'
                                  : 'bg-rose-500/75 group-hover:bg-rose-400'
                              }`}
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="h-6 flex items-center gap-2 px-1">
                    {stats.ratingDist.map((item) => {
                      const isSelected = selectedRatingBucket === item.bucket;
                      return (
                        <div
                          key={item.bucket}
                          className={`flex-1 text-center font-mono tabular-nums leading-tight ${
                            isSelected ? 'text-amber-400 font-semibold' : 'text-slate-400'
                          }`}
                        >
                          <div className="text-[11px]">{item.bucket.toFixed(1)}★</div>
                          <div className="text-[9px] text-slate-500">
                            {item.share > 0 ? `${Math.round(item.share)}%` : '0%'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5 pt-1">
              {[...stats.ratingDist].reverse().map((item) => {
                const widthPct =
                  item.count > 0
                    ? Math.max(4, Math.round((item.count / stats.maxBucketCount) * 100))
                    : 0;
                const isSelected = selectedRatingBucket === item.bucket;

                return (
                  <button
                    key={item.bucket}
                    type="button"
                    onClick={() => {
                      setSelectedPeriodBucket(null);
                      setSelectedRatingBucket((prev) =>
                        prev === item.bucket ? null : item.bucket
                      );
                    }}
                    className={`w-full flex items-center gap-3 py-1 px-2 rounded transition-colors text-left ${
                      isSelected ? 'bg-amber-500/15' : 'hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="w-12 font-mono tabular-nums text-xs text-slate-200 flex items-center gap-1 shrink-0">
                      <span>{item.bucket.toFixed(1)}</span>
                      <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                    </div>
                    <div className="w-16 text-xs text-amber-400/90 font-mono shrink-0">
                      {item.glyph}
                    </div>
                    <div className="flex-1 h-3 bg-slate-950 rounded overflow-hidden">
                      <div
                        style={{ width: `${widthPct}%` }}
                        className={`h-full rounded transition-all ${
                          isSelected
                            ? 'bg-amber-400'
                            : item.bucket >= 4.5
                            ? 'bg-amber-500'
                            : item.bucket >= 3.5
                            ? 'bg-emerald-500'
                            : item.bucket >= 2.5
                            ? 'bg-sky-500'
                            : 'bg-rose-500'
                        }`}
                      />
                    </div>
                    <div className="w-24 text-right font-mono tabular-nums text-xs text-slate-300 shrink-0">
                      {item.count.toLocaleString()}{' '}
                      <span className="text-slate-500">({item.share.toFixed(0)}%)</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Chart 2: Viewing History Timeline (Yearly vs. Monthly Switcher for High-Volume Archives) */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <h3 className="text-sm font-display font-semibold text-slate-100">
                Viewing Diary Volume Over Time
              </h3>
              <div className="flex items-center gap-1 p-0.5 bg-slate-950 border border-slate-800 rounded-md">
                <button
                  type="button"
                  onClick={() => {
                    setTimelineGranularity('yearly');
                    setSelectedPeriodBucket(null);
                  }}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    timelineGranularity === 'yearly'
                      ? 'bg-slate-800 text-slate-100'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  By Year
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTimelineGranularity('monthly');
                    setSelectedPeriodBucket(null);
                  }}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    timelineGranularity === 'monthly'
                      ? 'bg-slate-800 text-slate-100'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Recent 12 Months
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-400 mb-6">
              First-time watches (blue) vs. rewatches (green) across {timelineGranularity === 'yearly' ? 'calendar years' : 'recent months'}.
            </p>
          </div>

          <div className="h-52 flex items-end gap-2.5 pt-6 pb-2 border-b border-slate-800">
            {stats.timeline.map((m) => {
              const totalPct = Math.max(
                m.total > 0 ? 10 : 2,
                Math.round((m.total / stats.maxPeriodTotal) * 100)
              );
              const rewatchShare = m.total > 0 ? (m.rewatch / m.total) * 100 : 0;
              const isSelected = selectedPeriodBucket === m.period;

              return (
                <button
                  key={m.period}
                  type="button"
                  onClick={() => {
                    setSelectedRatingBucket(null);
                    setSelectedPeriodBucket((prev) =>
                      prev === m.period ? null : m.period
                    );
                  }}
                  className="flex-1 flex flex-col items-center justify-end h-full group focus:outline-none"
                >
                  <span className="text-[10px] font-mono tabular-nums text-slate-400 mb-1.5 group-hover:text-slate-100">
                    {m.total.toLocaleString()}
                  </span>
                  <div className="w-full h-36 flex items-end justify-center">
                    <div
                      style={{ height: `${totalPct}%` }}
                      className={`w-full rounded-t overflow-hidden flex flex-col justify-end transition-all ${
                        isSelected ? 'ring-2 ring-amber-400' : ''
                      }`}
                    >
                      {m.rewatch > 0 && (
                        <div
                          style={{ height: `${rewatchShare}%` }}
                          className="w-full bg-emerald-400"
                          title={`${m.rewatch.toLocaleString()} rewatches`}
                        />
                      )}
                      <div
                        style={{ height: `${100 - rewatchShare}%` }}
                        className="w-full bg-sky-500/80 group-hover:bg-sky-400"
                        title={`${m.firstWatch.toLocaleString()} first-time watches`}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2.5 pt-2">
            {stats.timeline.map((m) => (
              <div
                key={m.period}
                className="flex-1 text-center text-[10px] font-mono tabular-nums text-slate-400 truncate"
              >
                {timelineGranularity === 'yearly' ? m.period : m.period.slice(2)}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Paginated & Searchable Drilldown Tray when user clicks a Rating or Period bar */}
      {(selectedRatingBucket !== null || selectedPeriodBucket !== null) && (
        <div className="bg-slate-900 border border-amber-500/40 rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-xs font-display font-semibold text-amber-300">
                {selectedRatingBucket !== null
                  ? `Films Rated ${selectedRatingBucket.toFixed(1)} ★ (${formatStarGlyphs(
                      selectedRatingBucket
                    )}) — ${bucketFilteredFilms.length.toLocaleString()} matching entries`
                  : `Films Logged in ${selectedPeriodBucket} — ${bucketFilteredFilms.length.toLocaleString()} matching entries`}
              </h4>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative w-52">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={traySearch}
                  onChange={(e) => {
                    setTraySearch(e.target.value);
                    setTrayPage(1);
                  }}
                  placeholder="Filter within bucket..."
                  className="w-full pl-8 pr-2.5 py-1 text-xs bg-slate-950 border border-slate-800 rounded text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedRatingBucket(null);
                  setSelectedPeriodBucket(null);
                }}
                className="text-xs text-slate-400 hover:text-slate-200 whitespace-nowrap"
              >
                Close inspection
              </button>
            </div>
          </div>

          {paginatedTrayFilms.length === 0 ? (
            <p className="text-xs text-slate-400">
              No films match the current filter in this bucket.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {paginatedTrayFilms.map((f) => (
                  <div
                    key={f.id}
                    className="p-2.5 bg-slate-950 border border-slate-800 rounded flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="truncate">
                      <div className="font-medium text-slate-100 truncate">{f.title}</div>
                      <div className="text-slate-500 font-mono tabular-nums truncate">
                        {f.year} · {f.director}
                      </div>
                    </div>
                    <div className="font-mono tabular-nums text-amber-400 shrink-0">
                      {f.rating !== null ? `${f.rating.toFixed(1)}★` : '—'}
                    </div>
                  </div>
                ))}
              </div>

              {trayTotalPages > 1 && (
                <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs font-mono tabular-nums text-slate-400">
                  <span>
                    Showing {(safeTrayPage - 1) * TRAY_PAGE_SIZE + 1}–
                    {Math.min(safeTrayPage * TRAY_PAGE_SIZE, bucketFilteredFilms.length)} of{' '}
                    {bucketFilteredFilms.length.toLocaleString()}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={safeTrayPage <= 1}
                      onClick={() => setTrayPage((p) => Math.max(1, p - 1))}
                      className="p-1 rounded bg-slate-950 border border-slate-800 text-slate-300 disabled:opacity-40"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span>
                      Page {safeTrayPage} / {trayTotalPages}
                    </span>
                    <button
                      type="button"
                      disabled={safeTrayPage >= trayTotalPages}
                      onClick={() => setTrayPage((p) => Math.min(trayTotalPages, p + 1))}
                      className="p-1 rounded bg-slate-950 border border-slate-800 text-slate-300 disabled:opacity-40"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Secondary Two-Column Charts: Genre Bias & Release Decade Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-lg p-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-display font-semibold text-slate-100">
              Genre Volume & Personal Rating Bias
            </h3>
            <span className="text-xs font-mono tabular-nums text-slate-400">
              Baseline Mean: {stats.meanRating.toFixed(2)} ★
            </span>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            Frequency of genres logged alongside how much higher or lower you rate each genre relative to your overall average.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] text-slate-400">
                  <th className="py-2 pr-3">Genre</th>
                  <th className="py-2 px-3 text-right">Films</th>
                  <th className="py-2 px-3 w-36">Volume Share</th>
                  <th className="py-2 px-3 text-right">Mean Rating</th>
                  <th className="py-2 pl-3 text-right">Bias vs. Avg</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {stats.genreBreakdown.map((g) => (
                  <tr key={g.genre} className="h-9 hover:bg-slate-800/30">
                    <td className="py-1.5 pr-3 font-medium text-slate-200">{g.genre}</td>
                    <td className="py-1.5 px-3 text-right font-mono tabular-nums text-slate-300">
                      {g.count.toLocaleString()}
                    </td>
                    <td className="py-1.5 px-3">
                      <div className="w-full h-2 bg-slate-950 rounded overflow-hidden">
                        <div
                          style={{ width: `${Math.min(100, g.share)}%` }}
                          className="h-full bg-amber-500/80 rounded"
                        />
                      </div>
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono tabular-nums text-amber-400">
                      {g.avgRating.toFixed(2)} ★
                    </td>
                    <td
                      className={`py-1.5 pl-3 text-right font-mono tabular-nums ${
                        g.bias >= 0.05
                          ? 'text-emerald-400'
                          : g.bias <= -0.05
                          ? 'text-rose-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {g.bias >= 0 ? `+${g.bias.toFixed(2)}` : g.bias.toFixed(2)} ★
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-5 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
            <h3 className="text-sm font-display font-semibold text-slate-100 mb-1">
              Viewing by Release Decade
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Film count and average star rating across cinematic eras.
            </p>
            <div className="space-y-2.5">
              {stats.decades.map((d) => {
                const widthPct = Math.round((d.count / stats.maxDecadeCount) * 100);
                return (
                  <div key={d.decade} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                      <span className="text-slate-200 font-medium">{d.decade}</span>
                      <span className="text-slate-400">
                        {d.count.toLocaleString()} films ·{' '}
                        <strong className="text-amber-400">{d.avgRating.toFixed(2)} ★</strong>
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-950 rounded overflow-hidden">
                      <div
                        style={{ width: `${widthPct}%` }}
                        className="h-full bg-sky-500/80 rounded"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
            <h3 className="text-sm font-display font-semibold text-slate-100 mb-1">
              Most-Logged Directors
            </h3>
            <p className="text-xs text-slate-400 mb-3">
              Auteurs with the highest diary frequency in this profile.
            </p>
            <div className="divide-y divide-slate-800/60 text-xs">
              {stats.topDirectors.map((dir) => (
                <div
                  key={dir.director}
                  className="py-2 flex items-center justify-between font-mono tabular-nums"
                >
                  <span className="font-sans font-medium text-slate-200">
                    {dir.director}
                  </span>
                  <span className="text-slate-400">
                    {dir.count.toLocaleString()} films ·{' '}
                    <strong className="text-amber-400">{dir.avgRating.toFixed(2)} ★</strong>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
