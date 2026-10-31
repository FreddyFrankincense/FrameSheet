import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Bookmark,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Columns,
  Download,
  ExternalLink,
  Heart,
  ListOrdered,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { ALL_GENRES, inferTierFromRating, resolveFilmMetadata } from '../data/filmCatalog';
import { FilmEntry, ProfileAccount, TierGrade } from '../types/letterboxd';
import { exportFilmsToCsv } from '../utils/letterboxdParser';

interface SpreadsheetViewProps {
  profile: ProfileAccount;
  onUpdateFilms: (films: FilmEntry[]) => void;
  onOpenImport: () => void;
}

type SortField =
  | 'customRank'
  | 'title'
  | 'year'
  | 'rating'
  | 'watchedDate'
  | 'runtimeMinutes'
  | 'director'
  | 'tier';

type GroupByMode = 'none' | 'status' | 'watchedYear' | 'tier' | 'genre' | 'decade';
type WatchStatusFilter = 'logged' | 'watchlist' | 'all';

interface OptionalColumnsState {
  flags: boolean;
  director: boolean;
  runtime: boolean;
  notes: boolean;
}

const TIER_ORDER: Record<TierGrade, number> = {
  S: 1,
  A: 2,
  B: 3,
  C: 4,
  D: 5,
  Unranked: 6,
};

const RATING_STEPS = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];

export const SpreadsheetView: React.FC<SpreadsheetViewProps> = ({
  profile,
  onUpdateFilms,
  onOpenImport,
}) => {
  // Primary Watchlist vs. Logged filter state
  const [watchStatusFilter, setWatchStatusFilter] = useState<WatchStatusFilter>('all');

  // Filtering state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState<string>('ALL');
  const [selectedTier, setSelectedTier] = useState<string>('ALL');
  const [selectedWatchedYear, setSelectedWatchedYear] = useState<string>('ALL');
  const [selectedDecade, setSelectedDecade] = useState<string>('ALL');
  const [selectedRatingBand, setSelectedRatingBand] = useState<string>('ALL');
  const [filterLikedOnly, setFilterLikedOnly] = useState(false);
  const [filterRewatchOnly, setFilterRewatchOnly] = useState(false);

  // Grouping, Sorting & Pagination state
  const [groupBy, setGroupBy] = useState<GroupByMode>('none');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [groupVisibleLimit, setGroupVisibleLimit] = useState<Record<string, number>>({});
  const [sortField, setSortField] = useState<SortField>('customRank');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Column visibility & Inspector drawer state for clean screen density
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [optionalCols, setOptionalCols] = useState<OptionalColumnsState>({
    flags: true,
    director: true,
    runtime: false,
    notes: false,
  });
  const [inspectedFilmId, setInspectedFilmId] = useState<string | null>(null);

  // Quick-add row state
  const [showAddRow, setShowAddRow] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newYear, setNewYear] = useState('2026');
  const [newRating, setNewRating] = useState('4.0');
  const [newDate, setNewDate] = useState('2026-10-30');
  const [newIsWatchlist, setNewIsWatchlist] = useState(false);
  const [newGenres, setNewGenres] = useState('');
  const [newNotes, setNewNotes] = useState('');

  // Counts for Logged vs. Watchlist
  const statusCounts = useMemo(() => {
    let watchlistCount = 0;
    let loggedCount = 0;
    profile.films.forEach((f) => {
      if (f.watchlist) watchlistCount += 1;
      else loggedCount += 1;
    });
    return {
      all: profile.films.length,
      logged: loggedCount,
      watchlist: watchlistCount,
    };
  }, [profile.films]);

  // Reset pagination to page 1 when filters or profile change
  useEffect(() => {
    setCurrentPage(1);
  }, [
    profile.id,
    watchStatusFilter,
    searchQuery,
    selectedGenre,
    selectedTier,
    selectedWatchedYear,
    selectedDecade,
    selectedRatingBand,
    filterLikedOnly,
    filterRewatchOnly,
    groupBy,
  ]);

  // Distinct watched years and release decades for fast faceted filtering
  const facetOptions = useMemo(() => {
    const watchedYears = new Set<string>();
    const decades = new Set<string>();
    profile.films.forEach((f) => {
      if (f.watchedDate && f.watchedDate.length >= 4) {
        watchedYears.add(f.watchedDate.slice(0, 4));
      }
      if (f.year) {
        decades.add(`${Math.floor(f.year / 10) * 10}s`);
      }
    });
    return {
      watchedYears: Array.from(watchedYears).sort((a, b) => b.localeCompare(a)),
      decades: Array.from(decades).sort((a, b) => b.localeCompare(a)),
    };
  }, [profile.films]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection(
        field === 'rating' || field === 'watchedDate' || field === 'year' ? 'desc' : 'asc'
      );
    }
  };

  const handleFieldChange = <K extends keyof FilmEntry>(
    filmId: string,
    field: K,
    value: FilmEntry[K]
  ) => {
    const updated = profile.films.map((film) => {
      if (film.id !== filmId) return film;
      const next = { ...film, [field]: value };
      if (field === 'rating' && typeof value === 'number') {
        next.tier = inferTierFromRating(value);
        // If user logs a star rating on a Watchlist movie, mark it as watched/logged and assign today's date if blank
        if (film.watchlist) {
          next.watchlist = false;
          if (!next.watchedDate) {
            next.watchedDate = new Date().toISOString().slice(0, 10);
          }
        }
      }
      if (field === 'watchlist' && value === true) {
        // When toggled onto Watchlist (want to watch), clear watched rank if unrated
        if (next.rating === null) {
          next.tier = 'Unranked';
          next.customRank = null;
        }
      }
      return next;
    });
    onUpdateFilms(updated);
  };

  const handleDeleteFilm = (filmId: string) => {
    const updated = profile.films.filter((f) => f.id !== filmId);
    if (inspectedFilmId === filmId) {
      setInspectedFilmId(null);
    }
    onUpdateFilms(updated);
  };

  const handleAutoRankByRating = () => {
    const loggedFilms = profile.films.filter((f) => !f.watchlist);
    const sorted = [...loggedFilms].sort((a, b) => {
      const rDiff = (b.rating ?? 0) - (a.rating ?? 0);
      if (rDiff !== 0) return rDiff;
      if (a.liked !== b.liked) return a.liked ? -1 : 1;
      return (b.watchedDate || '').localeCompare(a.watchedDate || '');
    });
    const rankedMap = new Map<string, { rank: number; tier: TierGrade }>();
    sorted.forEach((f, idx) => {
      rankedMap.set(f.id, {
        rank: idx + 1,
        tier: inferTierFromRating(f.rating),
      });
    });

    const updated = profile.films.map((f) => {
      if (f.watchlist) {
        return { ...f, customRank: null, tier: 'Unranked' as TierGrade };
      }
      const info = rankedMap.get(f.id);
      return info ? { ...f, customRank: info.rank, tier: info.tier } : f;
    });
    onUpdateFilms(updated);
    setSortField('customRank');
    setSortDirection('asc');
    setCurrentPage(1);
  };

  const handleAddFilmSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const parsedYear = parseInt(newYear, 10) || 2026;
    const parsedRating = parseFloat(newRating);
    const validRating =
      newIsWatchlist ? null : !Number.isNaN(parsedRating) ? parsedRating : null;
    const meta = resolveFilmMetadata(newTitle.trim(), parsedYear);
    const customGenres = newGenres
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean);

    const newEntry: FilmEntry = {
      id: `${meta.slug}-${Date.now()}`,
      title: meta.title,
      year: meta.year,
      letterboxdUri: `https://letterboxd.com/film/${meta.slug}/`,
      slug: meta.slug,
      rating: validRating,
      watchedDate: newIsWatchlist ? null : newDate || null,
      loggedDate: newDate || new Date().toISOString().slice(0, 10),
      rewatch: false,
      liked: !newIsWatchlist && validRating !== null && validRating >= 4.0,
      watchlist: newIsWatchlist,
      tags: newIsWatchlist ? ['letterboxd-watchlist'] : ['manual-entry'],
      genres: customGenres.length > 0 ? customGenres : meta.genres,
      director: meta.director,
      runtimeMinutes: meta.runtimeMinutes,
      country: meta.country,
      customRank: newIsWatchlist ? null : 1,
      tier: newIsWatchlist ? 'Unranked' : inferTierFromRating(validRating),
      notes:
        newNotes.trim() ||
        (newIsWatchlist ? 'Added to Watchlist.' : ''),
    };

    onUpdateFilms([newEntry, ...profile.films]);
    setNewTitle('');
    setNewNotes('');
    setNewGenres('');
    setShowAddRow(false);
  };

  const filteredAndSortedFilms = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = profile.films.filter((film) => {
      if (watchStatusFilter === 'logged' && film.watchlist) return false;
      if (watchStatusFilter === 'watchlist' && !film.watchlist) return false;

      if (q) {
        const matchesTitle = film.title.toLowerCase().includes(q);
        const matchesDirector = film.director.toLowerCase().includes(q);
        const matchesNotes = film.notes.toLowerCase().includes(q);
        const matchesTags = film.tags.some((t) => t.toLowerCase().includes(q));
        const matchesGenre = film.genres.some((g) => g.toLowerCase().includes(q));
        if (!matchesTitle && !matchesDirector && !matchesNotes && !matchesTags && !matchesGenre) {
          return false;
        }
      }
      if (selectedGenre !== 'ALL' && !film.genres.includes(selectedGenre)) {
        return false;
      }
      if (selectedTier !== 'ALL' && film.tier !== selectedTier) {
        return false;
      }
      if (
        selectedWatchedYear !== 'ALL' &&
        (!film.watchedDate || !film.watchedDate.startsWith(selectedWatchedYear))
      ) {
        return false;
      }
      if (selectedDecade !== 'ALL') {
        const filmDecade = `${Math.floor(film.year / 10) * 10}s`;
        if (filmDecade !== selectedDecade) return false;
      }
      if (selectedRatingBand !== 'ALL') {
        const r = film.rating;
        if (selectedRatingBand === '4.5+' && (r === null || r < 4.5)) return false;
        if (selectedRatingBand === '4.0+' && (r === null || r < 4.0)) return false;
        if (selectedRatingBand === '3.0-3.5' && (r === null || r < 3.0 || r > 3.5)) return false;
        if (selectedRatingBand === 'under3' && (r === null || r >= 3.0)) return false;
        if (selectedRatingBand === 'unrated' && r !== null) return false;
      }
      if (filterLikedOnly && !film.liked) {
        return false;
      }
      if (filterRewatchOnly && !film.rewatch) {
        return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      const dir = sortDirection === 'asc' ? 1 : -1;
      switch (sortField) {
        case 'customRank':
          return ((a.customRank ?? 999999) - (b.customRank ?? 999999)) * dir;
        case 'title':
          return a.title.localeCompare(b.title) * dir;
        case 'year':
          return (a.year - b.year) * dir;
        case 'rating':
          return ((a.rating ?? -1) - (b.rating ?? -1)) * dir;
        case 'watchedDate':
          return (a.watchedDate || '').localeCompare(b.watchedDate || '') * dir;
        case 'runtimeMinutes':
          return (a.runtimeMinutes - b.runtimeMinutes) * dir;
        case 'director':
          return a.director.localeCompare(b.director) * dir;
        case 'tier':
          return (TIER_ORDER[a.tier] - TIER_ORDER[b.tier]) * dir;
        default:
          return 0;
      }
    });

    return filtered;
  }, [
    profile.films,
    watchStatusFilter,
    searchQuery,
    selectedGenre,
    selectedTier,
    selectedWatchedYear,
    selectedDecade,
    selectedRatingBand,
    filterLikedOnly,
    filterRewatchOnly,
    sortField,
    sortDirection,
  ]);

  const handleExportCsv = () => {
    const csv = exportFilmsToCsv(filteredAndSortedFilms);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${profile.username}-letterboxd-sheet.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Pagination math for Flat Sheet mode
  const totalFiltered = filteredAndSortedFilms.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalFiltered);
  const paginatedFlatFilms = useMemo(
    () => filteredAndSortedFilms.slice(startIndex, endIndex),
    [filteredAndSortedFilms, startIndex, endIndex]
  );

  // Grouped Accordion Sections when groupBy !== 'none'
  const groupedSections = useMemo(() => {
    if (groupBy === 'none') return [];
    const map = new Map<string, FilmEntry[]>();

    filteredAndSortedFilms.forEach((film) => {
      let groupKey = 'Other';
      if (groupBy === 'status') {
        groupKey = film.watchlist
          ? 'Letterboxd Watchlist (Want to Watch)'
          : 'Logged & Watched Films';
      } else if (groupBy === 'tier') {
        groupKey = `Tier ${film.tier}`;
      } else if (groupBy === 'genre') {
        groupKey = film.genres[0] || 'Uncategorized';
      } else if (groupBy === 'decade') {
        const decade = Math.floor(film.year / 10) * 10;
        groupKey = `${decade}s`;
      } else if (groupBy === 'watchedYear') {
        groupKey = film.watchlist
          ? 'Watchlist (Unwatched)'
          : film.watchedDate
          ? `${film.watchedDate.slice(0, 4)} Diary`
          : 'Undated Logs';
      }
      const list = map.get(groupKey) || [];
      list.push(film);
      map.set(groupKey, list);
    });

    return Array.from(map.entries())
      .map(([key, items]) => {
        const rated = items.filter((f) => f.rating !== null);
        const avg =
          rated.length > 0
            ? rated.reduce((s, f) => s + (f.rating ?? 0), 0) / rated.length
            : 0;
        const sTierCount = items.filter((f) => f.tier === 'S').length;
        const watchlistInGroup = items.filter((f) => f.watchlist).length;
        return { key, items, avg, sTierCount, watchlistInGroup };
      })
      .sort((a, b) => {
        if (groupBy === 'status') {
          return a.key.startsWith('Logged') ? -1 : 1;
        }
        if (groupBy === 'watchedYear' || groupBy === 'decade') {
          return b.key.localeCompare(a.key);
        }
        if (groupBy === 'tier') {
          return a.key.localeCompare(b.key);
        }
        return b.items.length - a.items.length;
      });
  }, [filteredAndSortedFilms, groupBy]);

  const inspectedFilm = useMemo(
    () => profile.films.find((f) => f.id === inspectedFilmId) || null,
    [profile.films, inspectedFilmId]
  );

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-600 shrink-0" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-amber-400 shrink-0" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
    );
  };

  const renderTableRows = (rows: FilmEntry[]) => (
    <tbody className="divide-y divide-slate-800/60 text-xs">
      {rows.map((film) => {
        const isInspected = inspectedFilmId === film.id;
        return (
          <tr
            key={film.id}
            className={`h-9 transition-colors group ${
              isInspected
                ? 'bg-amber-500/10'
                : film.watchlist
                ? 'bg-sky-950/15 hover:bg-slate-800/40'
                : 'hover:bg-slate-800/40'
            }`}
          >
            {/* Rank # */}
            <td className="px-3 py-1 font-mono tabular-nums">
              {film.watchlist ? (
                <span
                  className="text-[11px] font-mono text-sky-400"
                  title="On Letterboxd Watchlist (not yet ranked)"
                >
                  WL
                </span>
              ) : (
                <input
                  type="number"
                  min={1}
                  aria-label={`Rank for ${film.title}`}
                  value={film.customRank ?? ''}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    handleFieldChange(film.id, 'customRank', Number.isNaN(val) ? null : val);
                  }}
                  className="w-14 px-1.5 py-0.5 text-xs font-mono tabular-nums bg-transparent border border-transparent hover:border-slate-700 focus:border-amber-500 focus:bg-slate-950 rounded text-slate-300 focus:outline-none"
                />
              )}
            </td>

            {/* Tier selector */}
            <td className="px-2 py-1">
              <select
                aria-label={`Tier for ${film.title}`}
                value={film.tier}
                onChange={(e) =>
                  handleFieldChange(film.id, 'tier', e.target.value as TierGrade)
                }
                className={`px-1.5 py-0.5 text-xs font-mono font-semibold bg-transparent border border-transparent hover:border-slate-700 focus:border-amber-500 focus:bg-slate-950 rounded focus:outline-none ${
                  film.tier === 'S'
                    ? 'text-amber-400'
                    : film.tier === 'A'
                    ? 'text-emerald-400'
                    : film.tier === 'B'
                    ? 'text-sky-400'
                    : film.tier === 'C'
                    ? 'text-slate-300'
                    : 'text-slate-500'
                }`}
              >
                <option value="S">S</option>
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
                <option value="D">D</option>
                <option value="Unranked">—</option>
              </select>
            </td>

            {/* Film Title + Inspector Drawer Trigger */}
            <td className="px-3 py-1 font-medium text-slate-100">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setInspectedFilmId((prev) => (prev === film.id ? null : film.id))
                  }
                  className="text-left truncate max-w-[260px] hover:text-amber-300 transition-colors"
                  title="Click to inspect full review, watchlist status, tags, and film details"
                >
                  {film.title}
                </button>
                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setInspectedFilmId((prev) => (prev === film.id ? null : film.id))
                    }
                    className="text-[11px] text-slate-400 hover:text-slate-100 px-1.5 py-0.5 rounded bg-slate-800/80"
                  >
                    Inspect
                  </button>
                  <a
                    href={film.letterboxdUri}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open on Letterboxd"
                    className="text-slate-500 hover:text-amber-400"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </td>

            {/* Release Year */}
            <td className="px-2.5 py-1 text-right font-mono tabular-nums text-slate-400">
              {film.year}
            </td>

            {/* Rating (Numeric + Stars; selecting a rating on a Watchlist item logs it!) */}
            <td className="px-3 py-1 text-right font-mono tabular-nums">
              <select
                aria-label={`Rating for ${film.title}`}
                value={film.rating ?? ''}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  handleFieldChange(film.id, 'rating', Number.isNaN(val) ? null : val);
                }}
                className={`px-1.5 py-0.5 text-xs font-mono tabular-nums bg-transparent border border-transparent hover:border-slate-700 focus:border-amber-500 focus:bg-slate-950 rounded focus:outline-none text-right ${
                  film.rating !== null ? 'text-amber-400' : 'text-slate-500'
                }`}
              >
                <option value="">
                  {film.watchlist ? 'Want to Watch' : 'Unrated'}
                </option>
                {RATING_STEPS.map((step) => (
                  <option key={step} value={step}>
                    {step.toFixed(1)} ★
                  </option>
                ))}
              </select>
            </td>

            {/* Watched Date */}
            <td className="px-3 py-1 font-mono tabular-nums text-slate-300">
              <input
                type="date"
                aria-label={`Watched date for ${film.title}`}
                value={film.watchedDate || ''}
                onChange={(e) => {
                  const nextDate = e.target.value || null;
                  handleFieldChange(film.id, 'watchedDate', nextDate);
                }}
                className="bg-transparent border border-transparent hover:border-slate-700 focus:border-amber-500 focus:bg-slate-950 rounded px-1 py-0.5 text-xs font-mono tabular-nums text-slate-300 focus:outline-none"
              />
            </td>

            {/* Optional: Flags (Watchlist, Liked & Rewatch) */}
            {optionalCols.flags && (
              <td className="px-2 py-1">
                <div className="flex items-center justify-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      handleFieldChange(film.id, 'watchlist', !film.watchlist)
                    }
                    title={
                      film.watchlist
                        ? 'On Letterboxd Watchlist (Click to mark as Logged)'
                        : 'Logged Film (Click to move to Watchlist)'
                    }
                    className={`p-1 rounded transition-colors ${
                      film.watchlist
                        ? 'text-sky-400 hover:text-sky-300'
                        : 'text-slate-600 hover:text-slate-400'
                    }`}
                  >
                    <Bookmark
                      className="w-3.5 h-3.5"
                      fill={film.watchlist ? 'currentColor' : 'none'}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFieldChange(film.id, 'liked', !film.liked)}
                    title={film.liked ? 'Liked on Letterboxd' : 'Mark as Liked'}
                    className={`p-1 rounded transition-colors ${
                      film.liked
                        ? 'text-rose-400 hover:text-rose-300'
                        : 'text-slate-600 hover:text-slate-400'
                    }`}
                  >
                    <Heart
                      className="w-3.5 h-3.5"
                      fill={film.liked ? 'currentColor' : 'none'}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFieldChange(film.id, 'rewatch', !film.rewatch)}
                    title={film.rewatch ? 'Logged as Rewatch' : 'Mark as Rewatch'}
                    className={`p-1 rounded transition-colors ${
                      film.rewatch
                        ? 'text-emerald-400 hover:text-emerald-300'
                        : 'text-slate-600 hover:text-slate-400'
                    }`}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </td>
            )}

            {/* Genres (Zero-Pill unboxed text with · separators) */}
            <td className="px-3 py-1 text-slate-300 truncate max-w-[180px]">
              {film.genres.join(' · ')}
            </td>

            {/* Optional: Director */}
            {optionalCols.director && (
              <td className="px-3 py-1 text-slate-400 truncate max-w-[150px]">
                {film.director}
              </td>
            )}

            {/* Optional: Runtime */}
            {optionalCols.runtime && (
              <td className="px-2.5 py-1 text-right font-mono tabular-nums text-slate-400">
                {film.runtimeMinutes}m
              </td>
            )}

            {/* Optional: Notes & Tags */}
            {optionalCols.notes && (
              <td className="px-3 py-1 text-slate-400 truncate max-w-[200px]">
                {film.notes || film.tags.join(' · ') || '—'}
              </td>
            )}

            {/* Delete Row */}
            <td className="px-2 py-1 text-right">
              <button
                type="button"
                onClick={() => handleDeleteFilm(film.id)}
                title="Remove row from spreadsheet"
                className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 p-1 rounded transition-opacity"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </td>
          </tr>
        );
      })}
    </tbody>
  );

  if (profile.films.length === 0) {
    return (
      <div className="border border-slate-800 bg-slate-900/50 rounded-lg p-12 text-center my-6">
        <h3 className="text-lg font-display font-semibold text-slate-100 mb-2">
          No Logged or Watchlist Movies in This Profile Yet
        </h3>
        <p className="text-sm text-slate-400 max-w-md mx-auto mb-6">
          Fetch an external Letterboxd account by username or import a Letterboxd CSV export (diary.csv, ratings.csv, watchlist.csv) to populate the spreadsheet.
        </p>
        <button
          onClick={onOpenImport}
          className="px-4 py-2 text-xs font-medium bg-amber-500 text-slate-950 rounded-md hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0"
        >
          Import or Fetch Letterboxd Data
        </button>
      </div>
    );
  }

  const hasActiveFilters =
    watchStatusFilter !== 'all' ||
    Boolean(searchQuery) ||
    selectedGenre !== 'ALL' ||
    selectedTier !== 'ALL' ||
    selectedWatchedYear !== 'ALL' ||
    selectedDecade !== 'ALL' ||
    selectedRatingBand !== 'ALL' ||
    filterLikedOnly ||
    filterRewatchOnly;

  return (
    <div className="space-y-3 relative">
      {/* Compact High-Volume Faceted Filter & Action Toolbar */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* Segmented Watchlist vs. Logged Switcher + Search Input */}
          <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[300px]">
            <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg shrink-0">
              <button
                type="button"
                onClick={() => setWatchStatusFilter('all')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 font-mono tabular-nums ${
                  watchStatusFilter === 'all'
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All ({statusCounts.all.toLocaleString()})
              </button>
              <button
                type="button"
                onClick={() => setWatchStatusFilter('logged')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 font-mono tabular-nums ${
                  watchStatusFilter === 'logged'
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Logged ({statusCounts.logged.toLocaleString()})
              </button>
              <button
                type="button"
                onClick={() => setWatchStatusFilter('watchlist')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 font-mono tabular-nums ${
                  watchStatusFilter === 'watchlist'
                    ? 'bg-sky-500/20 text-sky-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Bookmark className="w-3 h-3" />
                Watchlist ({statusCounts.watchlist.toLocaleString()})
              </button>
            </div>

            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search title, director, tag..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-md text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Primary Actions & Column Density Controls */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowColumnMenu((v) => !v)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-slate-950 border border-slate-800 text-slate-300 rounded-md hover:border-slate-700 transition-colors whitespace-nowrap shrink-0"
              >
                <Columns className="w-3.5 h-3.5 text-slate-400" />
                Columns
              </button>
              {showColumnMenu && (
                <div className="absolute right-0 mt-1.5 w-52 bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-2.5 z-30 space-y-1.5 text-xs">
                  <div className="text-[11px] font-medium text-slate-400 pb-1 border-b border-slate-800">
                    Toggle Optional Columns
                  </div>
                  {(
                    [
                      ['flags', 'Watchlist / Liked / Rewatch'],
                      ['director', 'Director Column'],
                      ['runtime', 'Runtime (Minutes)'],
                      ['notes', 'Inline Notes Preview'],
                    ] as const
                  ).map(([colKey, label]) => (
                    <label
                      key={colKey}
                      className="flex items-center justify-between py-1 px-1.5 hover:bg-slate-800/60 rounded cursor-pointer text-slate-200"
                    >
                      <span>{label}</span>
                      <input
                        type="checkbox"
                        checked={optionalCols[colKey]}
                        onChange={() =>
                          setOptionalCols((prev) => ({
                            ...prev,
                            [colKey]: !prev[colKey],
                          }))
                        }
                        className="accent-amber-500"
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleAutoRankByRating}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-slate-950 border border-slate-800 text-slate-200 rounded-md hover:border-slate-700 transition-colors whitespace-nowrap shrink-0"
            >
              <ListOrdered className="w-3.5 h-3.5 text-amber-400" />
              Auto-Rank Logged ({statusCounts.logged.toLocaleString()})
            </button>

            <button
              type="button"
              onClick={() => setShowAddRow((v) => !v)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-slate-950 border border-slate-800 text-slate-200 rounded-md hover:border-slate-700 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-400" />
              Add Film / Watchlist
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-500 text-slate-950 rounded-md hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Second Row: Multi-Dimension Facets & Grouping Mode */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/80">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mr-1">
            <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
            <span>Facets:</span>
          </div>

          <select
            value={groupBy}
            onChange={(e) => {
              const mode = e.target.value as GroupByMode;
              setGroupBy(mode);
              setExpandedGroups({});
            }}
            aria-label="Group rows by"
            className="px-2.5 py-1 text-xs bg-slate-950 border border-amber-500/40 rounded-md text-amber-300 font-medium focus:outline-none focus:border-amber-500"
          >
            <option value="none">View: Paginated Flat Sheet</option>
            <option value="status">Group: By Status (Logged vs. Watchlist)</option>
            <option value="watchedYear">Group: By Watched Year</option>
            <option value="tier">Group: By Ranking Tier (S–D)</option>
            <option value="genre">Group: By Primary Genre</option>
            <option value="decade">Group: By Release Decade</option>
          </select>

          <select
            value={selectedGenre}
            onChange={(e) => setSelectedGenre(e.target.value)}
            aria-label="Filter by genre"
            className="px-2.5 py-1 text-xs bg-slate-950 border border-slate-800 rounded-md text-slate-200 focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">All Genres</option>
            {ALL_GENRES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>

          <select
            value={selectedWatchedYear}
            onChange={(e) => setSelectedWatchedYear(e.target.value)}
            aria-label="Filter by watched year"
            className="px-2.5 py-1 text-xs bg-slate-950 border border-slate-800 rounded-md text-slate-200 font-mono tabular-nums focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">All Diary Years</option>
            {facetOptions.watchedYears.map((yr) => (
              <option key={yr} value={yr}>
                Watched in {yr}
              </option>
            ))}
          </select>

          <select
            value={selectedDecade}
            onChange={(e) => setSelectedDecade(e.target.value)}
            aria-label="Filter by release decade"
            className="px-2.5 py-1 text-xs bg-slate-950 border border-slate-800 rounded-md text-slate-200 font-mono tabular-nums focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">All Release Decades</option>
            {facetOptions.decades.map((dec) => (
              <option key={dec} value={dec}>
                Released {dec}
              </option>
            ))}
          </select>

          <select
            value={selectedRatingBand}
            onChange={(e) => setSelectedRatingBand(e.target.value)}
            aria-label="Filter by rating band"
            className="px-2.5 py-1 text-xs bg-slate-950 border border-slate-800 rounded-md text-slate-200 focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">All Star Ratings</option>
            <option value="4.5+">4.5★ – 5.0★ (Masterpieces)</option>
            <option value="4.0+">4.0★ & Above</option>
            <option value="3.0-3.5">3.0★ – 3.5★ (Solid)</option>
            <option value="under3">Under 3.0★</option>
            <option value="unrated">Unrated / Watchlist</option>
          </select>

          <select
            value={selectedTier}
            onChange={(e) => setSelectedTier(e.target.value)}
            aria-label="Filter by tier"
            className="px-2.5 py-1 text-xs bg-slate-950 border border-slate-800 rounded-md text-slate-200 focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">All Tiers</option>
            <option value="S">Tier S</option>
            <option value="A">Tier A</option>
            <option value="B">Tier B</option>
            <option value="C">Tier C</option>
            <option value="D">Tier D</option>
          </select>

          <button
            type="button"
            onClick={() => setFilterLikedOnly((v) => !v)}
            className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
              filterLikedOnly
                ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            Liked
          </button>

          <button
            type="button"
            onClick={() => setFilterRewatchOnly((v) => !v)}
            className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
              filterRewatchOnly
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            Rewatches
          </button>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setWatchStatusFilter('all');
                setSearchQuery('');
                setSelectedGenre('ALL');
                setSelectedTier('ALL');
                setSelectedWatchedYear('ALL');
                setSelectedDecade('ALL');
                setSelectedRatingBand('ALL');
                setFilterLikedOnly(false);
                setFilterRewatchOnly(false);
              }}
              className="ml-auto text-xs text-amber-400 hover:underline whitespace-nowrap shrink-0"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Inline Add Film / Watchlist Row Drawer */}
      {showAddRow && (
        <form
          onSubmit={handleAddFilmSubmit}
          className="bg-slate-900 border border-slate-800 rounded-lg p-4 grid grid-cols-1 md:grid-cols-6 gap-3 items-end"
        >
          <div className="md:col-span-2">
            <label className="block text-xs text-slate-400 mb-1">Film Title</label>
            <input
              type="text"
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Decision to Leave"
              className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-md text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Release Year</label>
            <input
              type="number"
              value={newYear}
              onChange={(e) => setNewYear(e.target.value)}
              className="w-full px-3 py-1.5 text-xs font-mono tabular-nums bg-slate-950 border border-slate-800 rounded-md text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Entry Status</label>
            <select
              value={newIsWatchlist ? 'watchlist' : 'logged'}
              onChange={(e) => setNewIsWatchlist(e.target.value === 'watchlist')}
              className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-md text-slate-100"
            >
              <option value="logged">Logged / Watched</option>
              <option value="watchlist">Watchlist (Want to Watch)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              {newIsWatchlist ? 'Rating (Unwatched)' : 'Rating (0.5–5.0)'}
            </label>
            <select
              disabled={newIsWatchlist}
              value={newRating}
              onChange={(e) => setNewRating(e.target.value)}
              className="w-full px-3 py-1.5 text-xs font-mono tabular-nums bg-slate-950 border border-slate-800 rounded-md text-slate-100 disabled:opacity-40"
            >
              {RATING_STEPS.map((r) => (
                <option key={r} value={r}>
                  {r.toFixed(1)} ★
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="flex-1 px-3 py-1.5 text-xs font-medium bg-amber-500 text-slate-950 rounded-md hover:bg-amber-400 transition-colors whitespace-nowrap"
            >
              {newIsWatchlist ? 'Add to Watchlist' : 'Add Logged Row'}
            </button>
            <button
              type="button"
              onClick={() => setShowAddRow(false)}
              className="px-3 py-1.5 text-xs font-medium bg-slate-800 text-slate-300 rounded-md hover:bg-slate-700 transition-colors whitespace-nowrap"
            >
              Cancel
            </button>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-slate-400 mb-1">
              {newIsWatchlist ? 'Date Added to Watchlist' : 'Watched Date'}
            </label>
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="w-full px-3 py-1.5 text-xs font-mono tabular-nums bg-slate-950 border border-slate-800 rounded-md text-slate-100"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-slate-400 mb-1">
              Genres (comma-separated, optional)
            </label>
            <input
              type="text"
              value={newGenres}
              onChange={(e) => setNewGenres(e.target.value)}
              placeholder="Mystery, Romance, Thriller"
              className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-md text-slate-100"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-slate-400 mb-1">Review / Notes</label>
            <input
              type="text"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="Screening notes or why it's on your watchlist..."
              className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-md text-slate-100"
            />
          </div>
        </form>
      )}

      {/* MODE 1: Paginated Bounded-Height Flat Sheet */}
      {groupBy === 'none' ? (
        <div className="border border-slate-800 bg-slate-900/70 rounded-lg overflow-hidden flex flex-col">
          {/* Bounded Scrollable Table Viewport */}
          <div className="overflow-x-auto max-h-[540px] overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-20 bg-slate-950 shadow-sm">
                <tr className="border-b border-slate-800 text-[11px] font-medium text-slate-400 select-none">
                  <th className="py-2.5 px-3 w-16">
                    <button
                      type="button"
                      onClick={() => handleSort('customRank')}
                      className="inline-flex items-center gap-1 hover:text-slate-200 whitespace-nowrap"
                    >
                      <span>Rank</span>
                      {renderSortIcon('customRank')}
                    </button>
                  </th>
                  <th className="py-2.5 px-2 w-16">
                    <button
                      type="button"
                      onClick={() => handleSort('tier')}
                      className="inline-flex items-center gap-1 hover:text-slate-200 whitespace-nowrap"
                    >
                      <span>Tier</span>
                      {renderSortIcon('tier')}
                    </button>
                  </th>
                  <th className="py-2.5 px-3 min-w-[220px]">
                    <button
                      type="button"
                      onClick={() => handleSort('title')}
                      className="inline-flex items-center gap-1 hover:text-slate-200 whitespace-nowrap"
                    >
                      <span>Film Title</span>
                      {renderSortIcon('title')}
                    </button>
                  </th>
                  <th className="py-2.5 px-2.5 w-16 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort('year')}
                      className="inline-flex items-center justify-end gap-1 hover:text-slate-200 whitespace-nowrap ml-auto"
                    >
                      <span>Year</span>
                      {renderSortIcon('year')}
                    </button>
                  </th>
                  <th className="py-2.5 px-3 w-32 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort('rating')}
                      className="inline-flex items-center justify-end gap-1 hover:text-slate-200 whitespace-nowrap ml-auto"
                    >
                      <span>Rating</span>
                      {renderSortIcon('rating')}
                    </button>
                  </th>
                  <th className="py-2.5 px-3 w-32">
                    <button
                      type="button"
                      onClick={() => handleSort('watchedDate')}
                      className="inline-flex items-center gap-1 hover:text-slate-200 whitespace-nowrap"
                    >
                      <span>Watched</span>
                      {renderSortIcon('watchedDate')}
                    </button>
                  </th>
                  {optionalCols.flags && (
                    <th
                      className="py-2.5 px-2 w-24 text-center"
                      title="Watchlist (Bookmark) · Liked (Heart) · Rewatch"
                    >
                      WL · Like · Re
                    </th>
                  )}
                  <th className="py-2.5 px-3 min-w-[150px]">Genres</th>
                  {optionalCols.director && (
                    <th className="py-2.5 px-3 min-w-[140px]">
                      <button
                        type="button"
                        onClick={() => handleSort('director')}
                        className="inline-flex items-center gap-1 hover:text-slate-200 whitespace-nowrap"
                      >
                        <span>Director</span>
                        {renderSortIcon('director')}
                      </button>
                    </th>
                  )}
                  {optionalCols.runtime && (
                    <th className="py-2.5 px-2.5 w-20 text-right">
                      <button
                        type="button"
                        onClick={() => handleSort('runtimeMinutes')}
                        className="inline-flex items-center justify-end gap-1 hover:text-slate-200 whitespace-nowrap ml-auto"
                      >
                        <span>Min</span>
                        {renderSortIcon('runtimeMinutes')}
                      </button>
                    </th>
                  )}
                  {optionalCols.notes && (
                    <th className="py-2.5 px-3 min-w-[180px]">Notes & Tags</th>
                  )}
                  <th className="py-2.5 px-2 w-10"></th>
                </tr>
              </thead>
              {renderTableRows(paginatedFlatFilms)}
            </table>
          </div>

          {/* Sticky Bottom Pagination & Row Density Bar */}
          <div className="px-4 py-2.5 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3 font-mono tabular-nums text-slate-400">
              <span>
                Rows{' '}
                <strong className="text-slate-200">
                  {totalFiltered > 0 ? (startIndex + 1).toLocaleString() : 0}–
                  {endIndex.toLocaleString()}
                </strong>{' '}
                of <strong className="text-slate-200">{totalFiltered.toLocaleString()}</strong>
                {totalFiltered !== profile.films.length &&
                  ` (filtered from ${profile.films.length.toLocaleString()})`}
              </span>
              <span aria-hidden="true">·</span>
              <label className="inline-flex items-center gap-1.5 font-sans">
                <span>Rows per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 font-mono tabular-nums text-slate-200 focus:outline-none focus:border-amber-500"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={250}>250</option>
                </select>
              </label>
            </div>

            <div className="flex items-center gap-1.5 font-mono tabular-nums">
              <button
                type="button"
                disabled={safeCurrentPage <= 1}
                onClick={() => setCurrentPage(1)}
                className="px-2 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
              >
                First
              </button>
              <button
                type="button"
                disabled={safeCurrentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-1 rounded bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              <span className="px-2.5 text-slate-300">
                Page <strong className="text-amber-400">{safeCurrentPage}</strong> of{' '}
                <strong>{totalPages.toLocaleString()}</strong>
              </span>

              <button
                type="button"
                disabled={safeCurrentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="p-1 rounded bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                aria-label="Next page"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={safeCurrentPage >= totalPages}
                onClick={() => setCurrentPage(totalPages)}
                className="px-2 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
              >
                Last
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* MODE 2: Collapsible Group Accordion Matrix for High-Volume Organization */
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1 text-xs text-slate-400">
            <span>
              Organized <strong className="text-slate-200">{totalFiltered.toLocaleString()}</strong>{' '}
              films into <strong className="text-slate-200">{groupedSections.length}</strong>{' '}
              collapsible groups. Click any group row to expand or collapse its films.
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  const next: Record<string, boolean> = {};
                  groupedSections.slice(0, 5).forEach((s) => {
                    next[s.key] = true;
                  });
                  setExpandedGroups(next);
                }}
                className="text-amber-400 hover:underline"
              >
                Expand Top 5
              </button>
              <button
                type="button"
                onClick={() => setExpandedGroups({})}
                className="text-slate-400 hover:text-slate-200 hover:underline"
              >
                Collapse All
              </button>
            </div>
          </div>

          {groupedSections.map((section, idx) => {
            const isExpanded = expandedGroups[section.key] ?? idx === 0;
            const limit = groupVisibleLimit[section.key] || 25;
            const visibleSlice = section.items.slice(0, limit);
            const sharePct =
              totalFiltered > 0
                ? ((section.items.length / totalFiltered) * 100).toFixed(1)
                : '0.0';

            return (
              <div
                key={section.key}
                className="border border-slate-800 bg-slate-900/70 rounded-lg overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedGroups((prev) => ({
                      ...prev,
                      [section.key]: !isExpanded,
                    }))
                  }
                  className="w-full px-4 py-2.5 bg-slate-900 hover:bg-slate-800/60 flex items-center justify-between gap-4 transition-colors text-left"
                >
                  <div className="flex items-center gap-2.5">
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-amber-400 shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                    <span className="text-xs font-display font-semibold text-slate-100">
                      {section.key}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-mono tabular-nums text-slate-400">
                    <span>
                      <strong className="text-slate-200">
                        {section.items.length.toLocaleString()}
                      </strong>{' '}
                      films ({sharePct}%)
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Mean <strong className="text-amber-400">{section.avg.toFixed(2)} ★</strong>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Watchlist:{' '}
                      <strong className="text-sky-400">{section.watchlistInGroup}</strong>
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-800">
                    <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
                      <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 z-10 bg-slate-950">
                          <tr className="border-b border-slate-800 text-[11px] font-medium text-slate-400">
                            <th className="py-2 px-3 w-16">Rank</th>
                            <th className="py-2 px-2 w-16">Tier</th>
                            <th className="py-2 px-3 min-w-[220px]">Film Title</th>
                            <th className="py-2 px-2.5 w-16 text-right">Year</th>
                            <th className="py-2 px-3 w-32 text-right">Rating</th>
                            <th className="py-2 px-3 w-32">Watched</th>
                            {optionalCols.flags && (
                              <th className="py-2 px-2 w-24 text-center">WL · Like · Re</th>
                            )}
                            <th className="py-2 px-3 min-w-[150px]">Genres</th>
                            {optionalCols.director && (
                              <th className="py-2 px-3 min-w-[140px]">Director</th>
                            )}
                            {optionalCols.runtime && (
                              <th className="py-2 px-2.5 w-20 text-right">Min</th>
                            )}
                            {optionalCols.notes && (
                              <th className="py-2 px-3 min-w-[180px]">Notes & Tags</th>
                            )}
                            <th className="py-2 px-2 w-10"></th>
                          </tr>
                        </thead>
                        {renderTableRows(visibleSlice)}
                      </table>
                    </div>

                    {section.items.length > limit && (
                      <div className="px-4 py-2 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs font-mono tabular-nums text-slate-400">
                        <span>
                          Showing {visibleSlice.length.toLocaleString()} of{' '}
                          {section.items.length.toLocaleString()} films in {section.key}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setGroupVisibleLimit((prev) => ({
                              ...prev,
                              [section.key]: limit + 50,
                            }))
                          }
                          className="text-amber-400 hover:underline font-sans font-medium"
                        >
                          Load 50 More Rows
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Slide-Over Film Inspector Drawer */}
      {inspectedFilm && (
        <div className="fixed inset-y-0 right-0 z-40 w-full max-w-md bg-slate-900 border-l border-slate-800 shadow-2xl p-6 overflow-y-auto flex flex-col justify-between">
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-800">
              <div>
                <div className="text-xs font-mono tabular-nums text-amber-400 mb-1">
                  {inspectedFilm.watchlist
                    ? 'Letterboxd Watchlist (Want to Watch)'
                    : `Rank #${inspectedFilm.customRank ?? '—'} · Tier ${inspectedFilm.tier}`}
                </div>
                <h3 className="text-lg font-display font-bold text-slate-100">
                  {inspectedFilm.title} ({inspectedFilm.year})
                </h3>
                <div className="text-xs text-slate-400 mt-0.5">
                  Directed by {inspectedFilm.director} · {inspectedFilm.runtimeMinutes}m ·{' '}
                  {inspectedFilm.country}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectedFilmId(null)}
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800"
                aria-label="Close inspector"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Watchlist vs. Logged Status Toggle */}
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-medium text-slate-200">
                  Watchlist Status (Letterboxd Source of Truth)
                </div>
                <div className="text-[11px] text-slate-400">
                  {inspectedFilm.watchlist
                    ? 'Currently marked as Want to Watch on your Watchlist.'
                    : 'Marked as Watched / Logged in your diary.'}
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  handleFieldChange(
                    inspectedFilm.id,
                    'watchlist',
                    !inspectedFilm.watchlist
                  )
                }
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                  inspectedFilm.watchlist
                    ? 'bg-sky-500/20 border-sky-500/50 text-sky-300'
                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-slate-100'
                }`}
              >
                <Bookmark
                  className="w-3.5 h-3.5"
                  fill={inspectedFilm.watchlist ? 'currentColor' : 'none'}
                />
                {inspectedFilm.watchlist ? 'On Watchlist' : 'Logged'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Star Rating</label>
                <select
                  value={inspectedFilm.rating ?? ''}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    handleFieldChange(
                      inspectedFilm.id,
                      'rating',
                      Number.isNaN(val) ? null : val
                    );
                  }}
                  className="w-full px-3 py-1.5 text-xs font-mono tabular-nums bg-slate-950 border border-slate-800 rounded-md text-amber-400"
                >
                  <option value="">
                    {inspectedFilm.watchlist ? 'Unwatched (Rate to Log)' : 'Unrated'}
                  </option>
                  {RATING_STEPS.map((step) => (
                    <option key={step} value={step}>
                      {step.toFixed(1)} ★
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Watched Date</label>
                <input
                  type="date"
                  value={inspectedFilm.watchedDate || ''}
                  onChange={(e) =>
                    handleFieldChange(
                      inspectedFilm.id,
                      'watchedDate',
                      e.target.value || null
                    )
                  }
                  className="w-full px-3 py-1.5 text-xs font-mono tabular-nums bg-slate-950 border border-slate-800 rounded-md text-slate-200"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Custom Rank #</label>
                <input
                  type="number"
                  min={1}
                  disabled={inspectedFilm.watchlist}
                  value={inspectedFilm.customRank ?? ''}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    handleFieldChange(
                      inspectedFilm.id,
                      'customRank',
                      Number.isNaN(val) ? null : val
                    );
                  }}
                  className="w-full px-3 py-1.5 text-xs font-mono tabular-nums bg-slate-950 border border-slate-800 rounded-md text-slate-200 disabled:opacity-40"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Tier Classification</label>
                <select
                  value={inspectedFilm.tier}
                  onChange={(e) =>
                    handleFieldChange(
                      inspectedFilm.id,
                      'tier',
                      e.target.value as TierGrade
                    )
                  }
                  className="w-full px-3 py-1.5 text-xs font-mono bg-slate-950 border border-slate-800 rounded-md text-slate-200"
                >
                  <option value="S">Tier S</option>
                  <option value="A">Tier A</option>
                  <option value="B">Tier B</option>
                  <option value="C">Tier C</option>
                  <option value="D">Tier D</option>
                  <option value="Unranked">Unranked</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Genres (separated by · or comma)
              </label>
              <input
                type="text"
                value={inspectedFilm.genres.join(' · ')}
                onChange={(e) => {
                  const nextGenres = e.target.value
                    .split(/[·,|/]/)
                    .map((s) => s.trim())
                    .filter(Boolean);
                  handleFieldChange(inspectedFilm.id, 'genres', nextGenres);
                }}
                className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-md text-slate-200"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Tags (comma-separated)
              </label>
              <input
                type="text"
                value={inspectedFilm.tags.join(', ')}
                onChange={(e) => {
                  const nextTags = e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean);
                  handleFieldChange(inspectedFilm.id, 'tags', nextTags);
                }}
                placeholder="35mm, criterion, letterboxd-watchlist..."
                className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-md text-slate-200"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Review / Personal Log Notes
              </label>
              <textarea
                rows={4}
                value={inspectedFilm.notes}
                onChange={(e) =>
                  handleFieldChange(inspectedFilm.id, 'notes', e.target.value)
                }
                placeholder="Write or edit review notes for this film..."
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-md text-slate-200 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
            <a
              href={inspectedFilm.letterboxdUri}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:underline"
            >
              <span>View on Letterboxd</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <button
              type="button"
              onClick={() => setInspectedFilmId(null)}
              className="px-4 py-1.5 text-xs font-medium bg-amber-500 text-slate-950 rounded-md hover:bg-amber-400"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
