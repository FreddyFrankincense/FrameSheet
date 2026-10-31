import React, { useMemo, useState } from 'react';
import { Calendar, Flame, Heart, RotateCcw, Star, X } from 'lucide-react';
import { FilmEntry, ProfileAccount } from '../types/letterboxd';

interface ViewingCalendarHeatmapProps {
  profile: ProfileAccount;
}

type HeatmapColorMode = 'mean_rating' | 'max_rating' | 'volume';

interface DayCellData {
  dateStr: string; // YYYY-MM-DD
  dayOfMonth: number;
  monthIndex: number; // 0..11
  dayOfWeek: number; // 0 (Sun) .. 6 (Sat)
  inYear: boolean;
  films: FilmEntry[];
  count: number;
  meanRating: number | null;
  maxRating: number | null;
}

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatStarGlyphs(rating: number): string {
  const full = Math.floor(rating);
  const half = rating % 1 !== 0;
  return '★'.repeat(full) + (half ? '½' : '');
}

function formatReadableDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dateObj = new Date(Date.UTC(y, m - 1, d));
  return dateObj.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function getRatingIntensityClasses(rating: number | null, count: number): string {
  if (count === 0) {
    return 'bg-slate-950/90 border-slate-800/60 hover:border-slate-600';
  }
  if (rating === null) {
    return 'bg-slate-700/70 border-slate-600 hover:border-slate-400';
  }
  if (rating >= 4.75) {
    // 5.0★ Masterpiece intensity
    return 'bg-amber-300 border-amber-200 shadow-[0_0_5px_rgba(251,191,36,0.4)] hover:border-white';
  }
  if (rating >= 4.25) {
    // 4.5★ Near-masterpiece intensity
    return 'bg-amber-400 border-amber-300 hover:border-white';
  }
  if (rating >= 3.5) {
    // 3.5★ - 4.0★ High rating intensity
    return 'bg-amber-500/80 border-amber-400/80 hover:border-amber-200';
  }
  if (rating >= 2.5) {
    // 2.5★ - 3.0★ Moderate rating intensity
    return 'bg-amber-700/75 border-amber-600/70 hover:border-amber-400';
  }
  // 0.5★ - 2.0★ Low rating intensity
  return 'bg-amber-950/95 border-amber-800/75 hover:border-amber-500';
}

function getVolumeIntensityClasses(count: number): string {
  if (count === 0) {
    return 'bg-slate-950/90 border-slate-800/60 hover:border-slate-600';
  }
  if (count === 1) {
    return 'bg-amber-800/75 border-amber-700/70 hover:border-amber-400';
  }
  if (count === 2) {
    return 'bg-amber-600/85 border-amber-500/80 hover:border-amber-300';
  }
  if (count === 3) {
    return 'bg-amber-400 border-amber-300 hover:border-white';
  }
  return 'bg-amber-300 border-amber-200 shadow-[0_0_5px_rgba(251,191,36,0.4)] hover:border-white';
}

export const ViewingCalendarHeatmap: React.FC<ViewingCalendarHeatmapProps> = ({
  profile,
}) => {
  const [colorMode, setColorMode] = useState<HeatmapColorMode>('mean_rating');
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null);
  const [hoveredCell, setHoveredCell] = useState<DayCellData | null>(null);

  // Group all logged (non-watchlist) films by watchedDate (or loggedDate fallback)
  const { yearCounts, filmsByDate, availableYears } = useMemo(() => {
    const byDate = new Map<string, FilmEntry[]>();
    const yCounts = new Map<number, number>();

    profile.films.forEach((film) => {
      if (film.watchlist) return;
      const rawDate = film.watchedDate || film.loggedDate;
      if (!rawDate || rawDate.length < 10) return;
      const dateStr = rawDate.slice(0, 10);
      const yr = parseInt(dateStr.slice(0, 4), 10);
      if (Number.isNaN(yr) || yr < 1970 || yr > 2100) return;

      const list = byDate.get(dateStr) || [];
      list.push(film);
      byDate.set(dateStr, list);

      yCounts.set(yr, (yCounts.get(yr) || 0) + 1);
    });

    const years = Array.from(yCounts.keys()).sort((a, b) => b - a);
    if (years.length === 0) {
      years.push(new Date().getFullYear());
    }

    return {
      yearCounts: yCounts,
      filmsByDate: byDate,
      availableYears: years,
    };
  }, [profile.films]);

  const [selectedYear, setSelectedYear] = useState<number>(() => availableYears[0] || 2026);

  // Keep selectedYear valid when switching profiles
  const activeYear = availableYears.includes(selectedYear)
    ? selectedYear
    : availableYears[0] || 2026;

  // Build GitHub-style 53-week x 7-day calendar grid for activeYear
  const calendarData = useMemo(() => {
    const startOfYear = new Date(Date.UTC(activeYear, 0, 1));
    const endOfYear = new Date(Date.UTC(activeYear, 11, 31));
    const startDayOfWeek = startOfYear.getUTCDay(); // 0 (Sun) .. 6 (Sat)

    // Start grid on the Sunday of the first week
    const gridStart = new Date(startOfYear);
    gridStart.setUTCDate(gridStart.getUTCDate() - startDayOfWeek);

    // End grid on the Saturday of the final week
    const endDayOfWeek = endOfYear.getUTCDay();
    const gridEnd = new Date(endOfYear);
    gridEnd.setUTCDate(gridEnd.getUTCDate() + (6 - endDayOfWeek));

    const weeks: DayCellData[][] = [];
    const monthStartCols: { month: string; colIndex: number }[] = [];
    let seenMonths = new Set<number>();

    let current = new Date(gridStart);
    let weekIndex = 0;

    let activeDaysCount = 0;
    let totalFilmsInYear = 0;
    let ratedFilmsInYear = 0;
    let ratingSumInYear = 0;
    let longestStreak = 0;
    let currentStreak = 0;
    let peakDay: DayCellData | null = null;
    let firstActiveDay: DayCellData | null = null;

    while (current <= gridEnd) {
      const week: DayCellData[] = [];
      for (let dow = 0; dow < 7; dow++) {
        const y = current.getUTCFullYear();
        const m = current.getUTCMonth();
        const d = current.getUTCDate();
        const inYear = y === activeYear;
        const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

        const dayFilms = inYear ? filmsByDate.get(dateStr) || [] : [];
        const rated = dayFilms.filter((f) => f.rating !== null);
        const meanRating =
          rated.length > 0
            ? rated.reduce((acc, f) => acc + (f.rating ?? 0), 0) / rated.length
            : null;
        const maxRating =
          rated.length > 0
            ? Math.max(...rated.map((f) => f.rating as number))
            : null;

        const cell: DayCellData = {
          dateStr,
          dayOfMonth: d,
          monthIndex: m,
          dayOfWeek: dow,
          inYear,
          films: dayFilms,
          count: dayFilms.length,
          meanRating,
          maxRating,
        };

        if (inYear) {
          if (d === 1 && !seenMonths.has(m)) {
            seenMonths.add(m);
            monthStartCols.push({ month: MONTH_LABELS[m], colIndex: weekIndex });
          }
          if (dayFilms.length > 0) {
            activeDaysCount += 1;
            totalFilmsInYear += dayFilms.length;
            currentStreak += 1;
            if (currentStreak > longestStreak) {
              longestStreak = currentStreak;
            }
            if (!firstActiveDay) {
              firstActiveDay = cell;
            }
            if (
              !peakDay ||
              dayFilms.length > peakDay.count ||
              (dayFilms.length === peakDay.count &&
                (meanRating ?? 0) > (peakDay.meanRating ?? 0))
            ) {
              peakDay = cell;
            }
            rated.forEach((rf) => {
              ratedFilmsInYear += 1;
              ratingSumInYear += rf.rating ?? 0;
            });
          } else {
            currentStreak = 0;
          }
        }

        week.push(cell);
        current.setUTCDate(current.getUTCDate() + 1);
      }
      weeks.push(week);
      weekIndex += 1;
    }

    const daysInYear =
      (activeYear % 4 === 0 && activeYear % 100 !== 0) || activeYear % 400 === 0
        ? 366
        : 365;

    return {
      weeks,
      monthStartCols,
      activeDaysCount,
      daysInYear,
      totalFilmsInYear,
      yearMeanRating: ratedFilmsInYear > 0 ? ratingSumInYear / ratedFilmsInYear : 0,
      longestStreak,
      peakDay: peakDay as DayCellData | null,
      firstActiveDay: firstActiveDay as DayCellData | null,
    };
  }, [activeYear, filmsByDate]);

  // Resolve currently inspected day (user selection or peak day default)
  const inspectedDayCell = useMemo(() => {
    if (selectedDateStr) {
      for (const week of calendarData.weeks) {
        for (const cell of week) {
          if (cell.inYear && cell.dateStr === selectedDateStr) {
            return cell;
          }
        }
      }
    }
    return calendarData.peakDay || calendarData.firstActiveDay || null;
  }, [selectedDateStr, calendarData]);

  const activePreviewCell = hoveredCell || inspectedDayCell;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
      {/* Header Row: Title, Year Switcher & Color Intensity Mode */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-amber-400 shrink-0" />
            <h3 className="text-sm font-display font-semibold text-slate-100">
              Viewing Activity &amp; Star Rating Intensity Heatmap
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            GitHub-style daily diary contribution graph for <strong className="text-slate-200">{activeYear}</strong>, color-coded by rating intensity (0.5★ to 5.0★). Click any day square to inspect films logged that day.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Color Intensity Mode Switcher */}
          <div className="flex items-center gap-1 p-0.5 bg-slate-950 border border-slate-800 rounded-md">
            {(
              [
                ['mean_rating', 'Mean Rating (★)'],
                ['max_rating', 'Peak Rating (★)'],
                ['volume', 'Films Count'],
              ] as const
            ).map(([modeKey, label]) => (
              <button
                key={modeKey}
                type="button"
                onClick={() => setColorMode(modeKey)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  colorMode === modeKey
                    ? 'bg-slate-800 text-amber-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Year Selector Pills */}
          <div className="flex items-center gap-1 p-0.5 bg-slate-950 border border-slate-800 rounded-md overflow-x-auto max-w-full">
            {availableYears.slice(0, 7).map((yr) => {
              const count = yearCounts.get(yr) || 0;
              const isSelected = yr === activeYear;
              return (
                <button
                  key={yr}
                  type="button"
                  onClick={() => {
                    setSelectedYear(yr);
                    setSelectedDateStr(null);
                  }}
                  className={`px-2.5 py-1 text-[11px] font-mono tabular-nums rounded transition-colors whitespace-nowrap shrink-0 ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {yr} ({count})
                </button>
              );
            })}
            {availableYears.length > 7 && (
              <select
                aria-label="Select older diary year"
                value={activeYear}
                onChange={(e) => {
                  setSelectedYear(Number(e.target.value));
                  setSelectedDateStr(null);
                }}
                className="px-2 py-1 text-[11px] font-mono tabular-nums bg-slate-900 text-slate-300 rounded border border-slate-800 focus:outline-none"
              >
                {availableYears.map((yr) => (
                  <option key={yr} value={yr}>
                    {yr} ({yearCounts.get(yr) || 0} films)
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Year Summary Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono tabular-nums">
        <div className="px-3.5 py-2.5 rounded-md bg-slate-950 border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-sans text-slate-400">
              {activeYear} Films Logged
            </div>
            <div className="text-base font-bold text-slate-100 mt-0.5">
              {calendarData.totalFilmsInYear.toLocaleString()} films
            </div>
          </div>
          <span className="text-[11px] text-amber-400">
            {calendarData.yearMeanRating > 0
              ? `${calendarData.yearMeanRating.toFixed(2)} ★ avg`
              : '—'}
          </span>
        </div>

        <div className="px-3.5 py-2.5 rounded-md bg-slate-950 border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-sans text-slate-400">
              Active Screening Days
            </div>
            <div className="text-base font-bold text-slate-100 mt-0.5">
              {calendarData.activeDaysCount} / {calendarData.daysInYear}d
            </div>
          </div>
          <span className="text-[11px] text-emerald-400">
            {((calendarData.activeDaysCount / calendarData.daysInYear) * 100).toFixed(1)}%
          </span>
        </div>

        <div className="px-3.5 py-2.5 rounded-md bg-slate-950 border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-sans text-slate-400">
              Longest Viewing Streak
            </div>
            <div className="text-base font-bold text-amber-400 mt-0.5 flex items-center gap-1">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <span>
                {calendarData.longestStreak}{' '}
                {calendarData.longestStreak === 1 ? 'day' : 'days'}
              </span>
            </div>
          </div>
          <span className="text-[11px] font-sans text-slate-500">Consecutive</span>
        </div>

        <div className="px-3.5 py-2.5 rounded-md bg-slate-950 border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-sans text-slate-400">
              Peak Diary Day
            </div>
            <div className="text-base font-bold text-slate-100 mt-0.5">
              {calendarData.peakDay
                ? `${calendarData.peakDay.count} ${
                    calendarData.peakDay.count === 1 ? 'film' : 'films'
                  }`
                : '0 films'}
            </div>
          </div>
          {calendarData.peakDay && (
            <button
              type="button"
              onClick={() => setSelectedDateStr(calendarData.peakDay?.dateStr || null)}
              className="text-[11px] text-amber-400 hover:underline"
            >
              {calendarData.peakDay.dateStr.slice(5)}
            </button>
          )}
        </div>
      </div>

      {/* Calendar Heatmap Matrix (53 Weeks x 7 Days) */}
      <div className="p-4 rounded-lg bg-slate-950/70 border border-slate-800/90 overflow-x-auto">
        <div className="min-w-[740px]">
          {/* Month Labels Row */}
          <div className="flex items-center mb-1.5 pl-9 relative h-4">
            {calendarData.monthStartCols.map(({ month, colIndex }) => (
              <span
                key={month}
                style={{
                  left: `calc(2.25rem + ${colIndex * 14}px)`,
                }}
                className="absolute text-[10px] font-mono text-slate-400 select-none"
              >
                {month}
              </span>
            ))}
          </div>

          {/* Grid Body: Day-of-Week Labels + 53 Week Columns */}
          <div className="flex items-start gap-2">
            {/* Day-of-Week Labels (Sun..Sat) */}
            <div className="w-7 flex flex-col gap-[3px] text-[10px] font-mono text-slate-500 select-none pt-[1px]">
              {DAY_LABELS.map((dayLabel, idx) => (
                <div
                  key={dayLabel}
                  className="h-[11px] leading-[11px] flex items-center"
                >
                  {idx % 2 === 1 ? dayLabel : ''}
                </div>
              ))}
            </div>

            {/* Week Columns */}
            <div
              className="flex gap-[3px]"
              onMouseLeave={() => setHoveredCell(null)}
            >
              {calendarData.weeks.map((week, wIdx) => (
                <div key={wIdx} className="flex flex-col gap-[3px]">
                  {week.map((cell) => {
                    if (!cell.inYear) {
                      return (
                        <div
                          key={cell.dateStr}
                          className="w-[11px] h-[11px] rounded-[2px] bg-transparent"
                        />
                      );
                    }

                    const isSelected =
                      inspectedDayCell?.dateStr === cell.dateStr &&
                      cell.count > 0;

                    const ratingTarget =
                      colorMode === 'max_rating'
                        ? cell.maxRating
                        : cell.meanRating;

                    const colorClasses =
                      colorMode === 'volume'
                        ? getVolumeIntensityClasses(cell.count)
                        : getRatingIntensityClasses(ratingTarget, cell.count);

                    const tooltipSummary =
                      cell.count === 0
                        ? `${formatReadableDate(cell.dateStr)}: No films logged`
                        : `${formatReadableDate(cell.dateStr)}: ${cell.count} ${
                            cell.count === 1 ? 'film' : 'films'
                          } (${
                            cell.meanRating !== null
                              ? `Avg ${cell.meanRating.toFixed(1)}★`
                              : 'Unrated'
                          }) — ${cell.films.map((f) => f.title).join(', ')}`;

                    return (
                      <button
                        key={cell.dateStr}
                        type="button"
                        onClick={() => setSelectedDateStr(cell.dateStr)}
                        onMouseEnter={() => setHoveredCell(cell)}
                        title={tooltipSummary}
                        aria-label={tooltipSummary}
                        className={`w-[11px] h-[11px] rounded-[2px] border transition-transform relative focus:outline-none ${colorClasses} ${
                          isSelected
                            ? 'ring-2 ring-white scale-125 z-10'
                            : 'hover:scale-125 hover:z-10'
                        }`}
                      >
                        {cell.count > 1 && (
                          <span className="sr-only">
                            {cell.count} films logged
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Legend & Color Scale Footer */}
          <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-400">
            <div className="flex items-center gap-2 font-mono tabular-nums">
              {activePreviewCell ? (
                <span>
                  <strong className="text-slate-200">
                    {formatReadableDate(activePreviewCell.dateStr)}
                  </strong>
                  :{' '}
                  {activePreviewCell.count === 0 ? (
                    <span className="text-slate-500">0 films logged</span>
                  ) : (
                    <>
                      <strong className="text-amber-400">
                        {activePreviewCell.count}{' '}
                        {activePreviewCell.count === 1 ? 'film' : 'films'}
                      </strong>
                      {activePreviewCell.meanRating !== null && (
                        <>
                          {' '}
                          · Mean{' '}
                          <strong className="text-amber-300">
                            {activePreviewCell.meanRating.toFixed(2)} ★
                          </strong>
                        </>
                      )}
                      {activePreviewCell.maxRating !== null &&
                        activePreviewCell.count > 1 && (
                          <>
                            {' '}
                            · Peak{' '}
                            <strong className="text-amber-200">
                              {activePreviewCell.maxRating.toFixed(1)} ★
                            </strong>
                          </>
                        )}
                    </>
                  )}
                </span>
              ) : (
                <span>Hover or click any day square to inspect diary logs</span>
              )}
            </div>

            {colorMode !== 'volume' ? (
              <div className="flex flex-wrap items-center gap-2 font-mono text-[10px]">
                <span className="text-slate-500 font-sans">Rating Intensity:</span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-[2px] bg-slate-950 border border-slate-800 inline-block" />
                  <span>0 films</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-[2px] bg-amber-950 border border-amber-800/80 inline-block" />
                  <span>≤2.0★</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-[2px] bg-amber-700/80 border border-amber-600 inline-block" />
                  <span>2.5–3.0★</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-[2px] bg-amber-500/85 border border-amber-400 inline-block" />
                  <span>3.5–4.0★</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-[2px] bg-amber-400 border border-amber-300 inline-block" />
                  <span>4.5★</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-[2px] bg-amber-300 border border-amber-200 inline-block" />
                  <span>5.0★</span>
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 font-mono text-[10px]">
                <span className="text-slate-500 font-sans">Daily Log Volume:</span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-[2px] bg-slate-950 border border-slate-800 inline-block" />
                  <span>0</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-[2px] bg-amber-800/75 border border-amber-700 inline-block" />
                  <span>1 film</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-[2px] bg-amber-600/85 border border-amber-500 inline-block" />
                  <span>2 films</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-[2px] bg-amber-400 border border-amber-300 inline-block" />
                  <span>3+ films</span>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Selected Day Film Log Inspector Card */}
      {inspectedDayCell && inspectedDayCell.count > 0 && (
        <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs">
              <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />
              <span className="font-display font-semibold text-slate-100">
                Diary Logs on {formatReadableDate(inspectedDayCell.dateStr)}
              </span>
              <span className="font-mono tabular-nums text-slate-400">
                · {inspectedDayCell.count}{' '}
                {inspectedDayCell.count === 1 ? 'movie' : 'movies'}
                {inspectedDayCell.meanRating !== null &&
                  ` · ${inspectedDayCell.meanRating.toFixed(2)} ★ avg`}
              </span>
            </div>

            {selectedDateStr && (
              <button
                type="button"
                onClick={() => setSelectedDateStr(null)}
                className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200"
              >
                <X className="w-3 h-3" />
                <span>Reset to Peak Day</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {inspectedDayCell.films.map((film) => (
              <div
                key={film.id}
                className="p-2.5 rounded bg-slate-900 border border-slate-800/90 flex items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-medium text-slate-100 truncate">
                    {film.title}
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-400 truncate">
                    {film.year} · {film.director}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {film.liked && (
                    <Heart className="w-3 h-3 text-rose-400 fill-rose-400" />
                  )}
                  {film.rewatch && (
                    <RotateCcw className="w-3 h-3 text-emerald-400" />
                  )}
                  <span
                    className="font-mono tabular-nums font-semibold text-amber-400"
                    title={
                      film.rating !== null
                        ? `${film.rating.toFixed(1)} ★ (${formatStarGlyphs(film.rating)})`
                        : 'Unrated'
                    }
                  >
                    {film.rating !== null ? `${film.rating.toFixed(1)}★` : '—'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
