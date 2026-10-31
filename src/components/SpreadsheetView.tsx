import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart2,
  Bookmark,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Columns,
  Download,
  ExternalLink,
  FileText,
  GitCompare,
  Heart,
  ListOrdered,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { ALL_GENRES, inferTierFromRating, resolveFilmMetadata } from '../data/filmCatalog';
import {
  FilmEntry,
  LetterboxdCsvPreset,
  ProfileAccount,
  TierGrade,
} from '../types/letterboxd';
import {
  exportFilmsToCsv,
  getLetterboxdExportFilename,
  LETTERBOXD_CSV_HEADERS,
} from '../utils/letterboxdParser';
import {
  computeProfileDeviations,
  EditableFilmField,
  WordDiffSegment,
} from '../utils/baselineDiff';
import { FilmGroupCohort, GroupHistogramPanel } from './GroupHistogramPanel';

interface SpreadsheetViewProps {
  profile: ProfileAccount;
  onUpdateFilms: (films: FilmEntry[]) => void;
  onOpenImport: () => void;
  onOpenChangesSummary?: () => void;
  onOpenCohortInAnalytics?: (cohort: FilmGroupCohort) => void;
  onSaveCohort?: (name: string, films: FilmEntry[]) => void;
  initialInspectedFilmId?: string | null;
  onClearInitialInspectedFilm?: () => void;
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
type ReviewMatchMode = 'phrase' | 'whole_word' | 'all_words' | 'any_word';

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

const SYNTHETIC_NOTE_PREFIXES = [
  'Synced from Letterboxd Watchlist',
  'Logged via external profile view.',
  'Added to Watchlist.',
];

function isGenuineWrittenReview(notes: string | undefined | null): boolean {
  const trimmed = (notes || '').trim();
  if (!trimmed) return false;
  return !SYNTHETIC_NOTE_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanReviewQuery(raw: string): string {
  return raw
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .trim();
}

function evaluateReviewQuery(
  reviewText: string,
  rawQuery: string,
  mode: ReviewMatchMode
): { matches: boolean; highlightTerms: string[] } {
  const cleaned = cleanReviewQuery(rawQuery);
  if (!cleaned) {
    return { matches: true, highlightTerms: [] };
  }
  if (!isGenuineWrittenReview(reviewText)) {
    return { matches: false, highlightTerms: [] };
  }

  const lowerReview = reviewText.toLowerCase();
  const lowerQuery = cleaned.toLowerCase();

  if (mode === 'phrase') {
    const matches = lowerReview.includes(lowerQuery);
    return { matches, highlightTerms: matches ? [cleaned] : [] };
  }

  if (mode === 'whole_word') {
    const pattern = new RegExp(
      `(?:^|[^a-zA-Z0-9])(${escapeRegExp(cleaned)})(?=$|[^a-zA-Z0-9])`,
      'i'
    );
    const matches = pattern.test(reviewText);
    return { matches, highlightTerms: matches ? [cleaned] : [] };
  }

  const words = cleaned
    .split(/[\s,]+/)
    .map((w) => w.trim())
    .filter(Boolean);
  if (words.length === 0) {
    return { matches: true, highlightTerms: [] };
  }

  if (mode === 'all_words') {
    const matches = words.every((w) => lowerReview.includes(w.toLowerCase()));
    return { matches, highlightTerms: matches ? words : [] };
  }

  // any_word
  const matchedWords = words.filter((w) => lowerReview.includes(w.toLowerCase()));
  return {
    matches: matchedWords.length > 0,
    highlightTerms: matchedWords,
  };
}

function renderHighlightedText(
  text: string,
  highlightTerms: string[],
  maxSnippetLength?: number
): React.ReactNode {
  if (!text) return '—';
  const validTerms = Array.from(
    new Set(highlightTerms.map((t) => t.trim()).filter(Boolean))
  ).sort((a, b) => b.length - a.length);

  if (validTerms.length === 0) {
    if (maxSnippetLength && text.length > maxSnippetLength) {
      return `${text.slice(0, maxSnippetLength)}…`;
    }
    return text;
  }

  let displaySlice = text;
  if (maxSnippetLength && text.length > maxSnippetLength) {
    const lowerText = text.toLowerCase();
    let firstMatchIdx = -1;
    for (const term of validTerms) {
      const idx = lowerText.indexOf(term.toLowerCase());
      if (idx !== -1 && (firstMatchIdx === -1 || idx < firstMatchIdx)) {
        firstMatchIdx = idx;
      }
    }
    if (firstMatchIdx !== -1) {
      const halfWindow = Math.floor(maxSnippetLength / 2);
      const start = Math.max(0, firstMatchIdx - halfWindow);
      const end = Math.min(text.length, start + maxSnippetLength);
      const prefix = start > 0 ? '…' : '';
      const suffix = end < text.length ? '…' : '';
      displaySlice = `${prefix}${text.slice(start, end)}${suffix}`;
    } else {
      displaySlice = `${text.slice(0, maxSnippetLength)}…`;
    }
  }

  const regex = new RegExp(`(${validTerms.map(escapeRegExp).join('|')})`, 'gi');
  const parts = displaySlice.split(regex);

  return parts.map((part, i) => {
    const isMatch = validTerms.some(
      (term) => term.toLowerCase() === part.toLowerCase()
    );
    return isMatch ? (
      <mark
        key={i}
        className="bg-amber-500/30 text-amber-200 px-1 py-0.5 rounded font-medium"
      >
        {part}
      </mark>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    );
  });
}

const SUGGESTED_REVIEW_PHRASES = [
  'action-packed',
  'slow-burn',
  'practical effects',
  'haunting score',
  'career-best performance',
  'razor-sharp',
  'visceral cinematography',
  'third act',
  'bleak atmosphere',
  'rewatchable',
];

function renderWordDiffCallout(
  segments: WordDiffSegment[],
  compact?: boolean
): React.ReactNode {
  return (
    <span className={compact ? 'leading-snug' : 'leading-relaxed'}>
      {segments.map((seg, idx) => {
        if (seg.type === 'added') {
          return (
            <ins
              key={idx}
              title="Inserted / edited in FrameSheet (deviates from Letterboxd source of truth)"
              className="bg-amber-500/25 text-amber-200 border-b border-amber-400 no-underline px-1 py-0.5 rounded font-medium"
            >
              {seg.text}
            </ins>
          );
        }
        if (seg.type === 'removed') {
          return (
            <del
              key={idx}
              title="Removed from original Letterboxd review"
              className="bg-rose-500/20 text-rose-300 line-through px-1 py-0.5 rounded opacity-90"
            >
              {seg.text}
            </del>
          );
        }
        return <React.Fragment key={idx}>{seg.text}</React.Fragment>;
      })}
    </span>
  );
}

export const SpreadsheetView: React.FC<SpreadsheetViewProps> = ({
  profile,
  onUpdateFilms,
  onOpenImport,
  onOpenChangesSummary,
  onOpenCohortInAnalytics,
  onSaveCohort,
  initialInspectedFilmId,
  onClearInitialInspectedFilm,
}) => {
  // Primary Watchlist vs. Logged filter state
  const [watchStatusFilter, setWatchStatusFilter] = useState<WatchStatusFilter>('all');

  // Filtering state
  const [searchQuery, setSearchQuery] = useState('');
  const [reviewSearchQuery, setReviewSearchQuery] = useState('');
  const [reviewMatchMode, setReviewMatchMode] = useState<ReviewMatchMode>('phrase');
  const [showPhraseLexicon, setShowPhraseLexicon] = useState(false);
  const [filterReviewedOnly, setFilterReviewedOnly] = useState(false);
  const [filterDeviationsOnly, setFilterDeviationsOnly] = useState(false);
  const [selectedGenre, setSelectedGenre] = useState<string>('ALL');
  const [selectedTier, setSelectedTier] = useState<string>('ALL');
  const [selectedWatchedYear, setSelectedWatchedYear] = useState<string>('ALL');
  const [selectedDecade, setSelectedDecade] = useState<string>('ALL');
  const [selectedRatingBand, setSelectedRatingBand] = useState<string>('ALL');
  const [filterLikedOnly, setFilterLikedOnly] = useState(false);
  const [filterRewatchOnly, setFilterRewatchOnly] = useState(false);

  // Manual Film Selection & Cohort Histogram state
  const [selectedFilmIds, setSelectedFilmIds] = useState<Set<string>>(new Set());
  const [showGroupHistograms, setShowGroupHistograms] = useState(false);
  const [pinnedSectionCohort, setPinnedSectionCohort] =
    useState<FilmGroupCohort | null>(null);

  // Grouping, Sorting & Pagination state
  const [groupBy, setGroupBy] = useState<GroupByMode>('none');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [groupVisibleLimit, setGroupVisibleLimit] = useState<Record<string, number>>({});
  const [sortField, setSortField] = useState<SortField>('customRank');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Column visibility, Export options & Inspector drawer state
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportPreset, setExportPreset] = useState<
    LetterboxdCsvPreset | 'match_imported'
  >('match_imported');
  const [exportPreserveOrder, setExportPreserveOrder] = useState(false);
  const [optionalCols, setOptionalCols] = useState<OptionalColumnsState>({
    flags: true,
    director: true,
    runtime: false,
    notes: false,
  });
  const [inspectedFilmId, setInspectedFilmId] = useState<string | null>(
    initialInspectedFilmId || null
  );

  useEffect(() => {
    if (initialInspectedFilmId) {
      setInspectedFilmId(initialInspectedFilmId);
      onClearInitialInspectedFilm?.();
    }
  }, [initialInspectedFilmId, onClearInitialInspectedFilm]);

  // Clear selection when profile changes
  useEffect(() => {
    setSelectedFilmIds(new Set());
    setPinnedSectionCohort(null);
  }, [profile.id]);

  // Quick-add row state
  const [showAddRow, setShowAddRow] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newYear, setNewYear] = useState('2026');
  const [newRating, setNewRating] = useState('4.0');
  const [newDate, setNewDate] = useState('2026-10-30');
  const [newIsWatchlist, setNewIsWatchlist] = useState(false);
  const [newGenres, setNewGenres] = useState('');
  const [newNotes, setNewNotes] = useState('');

  // Counts for Logged, Watchlist & Written Reviews
  const statusCounts = useMemo(() => {
    let watchlistCount = 0;
    let loggedCount = 0;
    let reviewedCount = 0;
    profile.films.forEach((f) => {
      if (f.watchlist) watchlistCount += 1;
      else loggedCount += 1;
      if (isGenuineWrittenReview(f.notes)) {
        reviewedCount += 1;
      }
    });
    return {
      all: profile.films.length,
      logged: loggedCount,
      watchlist: watchlistCount,
      reviewed: reviewedCount,
    };
  }, [profile.films]);

  // Phrase frequency counts across all written reviews in the active profile
  const reviewPhraseCounts = useMemo(() => {
    const writtenReviews = profile.films
      .filter((f) => isGenuineWrittenReview(f.notes))
      .map((f) => f.notes.toLowerCase());

    return SUGGESTED_REVIEW_PHRASES.map((phrase) => {
      const lowerPhrase = phrase.toLowerCase();
      let count = 0;
      writtenReviews.forEach((rev) => {
        if (rev.includes(lowerPhrase)) {
          count += 1;
        }
      });
      return { phrase, count };
    }).filter((item) => item.count > 0);
  }, [profile.films]);

  // Compute deviations between FrameSheet working state and original Letterboxd baseline ("source of truth")
  const deviationSummary = useMemo(
    () => computeProfileDeviations(profile.baselineFilms, profile.films),
    [profile.baselineFilms, profile.films]
  );

  // Reset pagination to page 1 when filters or profile change
  useEffect(() => {
    setCurrentPage(1);
  }, [
    profile.id,
    watchStatusFilter,
    searchQuery,
    reviewSearchQuery,
    reviewMatchMode,
    filterReviewedOnly,
    filterDeviationsOnly,
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

  // Revert a single field on a film back to the Letterboxd baseline source of truth
  const handleRevertField = (filmId: string, field: EditableFilmField) => {
    const record = deviationSummary.byFilmId.get(filmId);
    if (!record || !record.baselineFilm) return;
    const base = record.baselineFilm;

    const updated = profile.films.map((film) => {
      if (film.id !== filmId) return film;
      const next: FilmEntry = {
        ...film,
        [field]: Array.isArray(base[field])
          ? [...(base[field] as string[])]
          : base[field],
      };
      // If reverting rating or watchlist, also restore baseline tier/rank if they were auto-adjusted
      if (field === 'rating') {
        next.tier = base.tier;
      }
      if (field === 'watchlist') {
        next.rating = base.rating;
        next.watchedDate = base.watchedDate;
        next.liked = base.liked;
        next.tier = base.tier;
        next.customRank = base.customRank;
      }
      return next;
    });
    onUpdateFilms(updated);
  };

  // Revert an entire film back to its original Letterboxd baseline state (or remove if added in app, or restore if deleted)
  const handleRevertFilm = (filmId: string) => {
    const record = deviationSummary.byFilmId.get(filmId);
    if (!record) return;

    if (record.status === 'added_in_app') {
      const updated = profile.films.filter((f) => f.id !== filmId);
      if (inspectedFilmId === filmId) setInspectedFilmId(null);
      onUpdateFilms(updated);
      return;
    }

    if (record.status === 'removed_in_app' && record.baselineFilm) {
      const restored: FilmEntry = {
        ...record.baselineFilm,
        tags: [...record.baselineFilm.tags],
        genres: [...record.baselineFilm.genres],
      };
      onUpdateFilms([restored, ...profile.films]);
      return;
    }

    if (record.baselineFilm) {
      const restored: FilmEntry = {
        ...record.baselineFilm,
        tags: [...record.baselineFilm.tags],
        genres: [...record.baselineFilm.genres],
      };
      const updated = profile.films.map((f) => (f.id === filmId ? restored : f));
      onUpdateFilms(updated);
    }
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
    const hasReviewQ = Boolean(cleanReviewQuery(reviewSearchQuery));

    const filtered = profile.films.filter((film) => {
      if (watchStatusFilter === 'logged' && film.watchlist) return false;
      if (watchStatusFilter === 'watchlist' && !film.watchlist) return false;

      if (filterDeviationsOnly && !deviationSummary.byFilmId.has(film.id)) {
        return false;
      }

      if (filterReviewedOnly && !isGenuineWrittenReview(film.notes)) {
        return false;
      }

      if (hasReviewQ) {
        const evalRes = evaluateReviewQuery(
          film.notes,
          reviewSearchQuery,
          reviewMatchMode
        );
        if (!evalRes.matches) return false;
      }

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
    reviewSearchQuery,
    reviewMatchMode,
    filterReviewedOnly,
    filterDeviationsOnly,
    deviationSummary,
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

  const handleExportCsv = (
    overridePreset?: LetterboxdCsvPreset | 'match_imported'
  ) => {
    const targetPreset = overridePreset ?? exportPreset;
    const allFilteredAreWatchlist =
      watchStatusFilter === 'watchlist' ||
      (filteredAndSortedFilms.length > 0 &&
        filteredAndSortedFilms.every((f) => f.watchlist));

    // If user explicitly chooses watchlist.csv while viewing 'all' or 'logged', pull watchlist from profile.films
    const sourcePool =
      targetPreset === 'watchlist' && !allFilteredAreWatchlist
        ? profile.films.filter((f) => f.watchlist)
        : filteredAndSortedFilms;

    const csv = exportFilmsToCsv(sourcePool, {
      preset: targetPreset,
      importedStructure: profile.importedCsvStructure,
      preserveCurrentOrder: exportPreserveOrder,
    });

    const filename = getLetterboxdExportFilename(
      targetPreset,
      profile.importedCsvStructure,
      allFilteredAreWatchlist
    );

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const activeExportHeadersPreview = useMemo(() => {
    const allFilteredAreWatchlist =
      watchStatusFilter === 'watchlist' ||
      (filteredAndSortedFilms.length > 0 &&
        filteredAndSortedFilms.every((f) => f.watchlist));

    if (exportPreset === 'match_imported') {
      if (allFilteredAreWatchlist) {
        return LETTERBOXD_CSV_HEADERS.watchlist.join(',');
      }
      if (profile.importedCsvStructure?.headers.length) {
        return profile.importedCsvStructure.headers.join(',');
      }
      return LETTERBOXD_CSV_HEADERS.diary.join(',');
    }
    if (exportPreset === 'custom' && profile.importedCsvStructure?.headers.length) {
      return profile.importedCsvStructure.headers.join(',');
    }
    if (exportPreset !== 'custom') {
      return LETTERBOXD_CSV_HEADERS[exportPreset].join(',');
    }
    return LETTERBOXD_CSV_HEADERS.diary.join(',');
  }, [
    exportPreset,
    watchStatusFilter,
    filteredAndSortedFilms,
    profile.importedCsvStructure,
  ]);

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

  // Toggle a single film in/out of the manual selection set
  const handleToggleSelectFilm = (filmId: string) => {
    setSelectedFilmIds((prev) => {
      const next = new Set(prev);
      if (next.has(filmId)) {
        next.delete(filmId);
      } else {
        next.add(filmId);
      }
      return next;
    });
    setPinnedSectionCohort(null);
  };

  // Toggle all films in a given slice (e.g. current page or all filtered)
  const handleToggleSelectSlice = (slice: FilmEntry[]) => {
    const allSelected =
      slice.length > 0 && slice.every((f) => selectedFilmIds.has(f.id));
    setSelectedFilmIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        slice.forEach((f) => next.delete(f.id));
      } else {
        slice.forEach((f) => next.add(f.id));
      }
      return next;
    });
    setPinnedSectionCohort(null);
  };

  // Active cohort for the GroupHistogramPanel (prioritizes pinned accordion group -> manual checkbox selection -> current search/filter results)
  const activeHistogramCohort = useMemo<FilmGroupCohort>(() => {
    if (pinnedSectionCohort) {
      return pinnedSectionCohort;
    }

    if (selectedFilmIds.size > 0) {
      const selectedList = profile.films.filter((f) => selectedFilmIds.has(f.id));
      return {
        id: 'manual-selection',
        label: `Selected Movies (${selectedList.length})`,
        description:
          'Custom assembled group of movies selected via spreadsheet checkboxes.',
        sourceType: 'manual_selection',
        films: selectedList,
      };
    }

    const activeParts: string[] = [];
    const cleanedRevQ = cleanReviewQuery(reviewSearchQuery);
    if (cleanedRevQ) {
      activeParts.push(`Review Phrase: "${cleanedRevQ}"`);
    }
    if (searchQuery.trim()) {
      activeParts.push(`Query: "${searchQuery.trim()}"`);
    }
    if (watchStatusFilter === 'watchlist') {
      activeParts.push('Watchlist');
    } else if (watchStatusFilter === 'logged') {
      activeParts.push('Logged');
    }
    if (selectedGenre !== 'ALL') activeParts.push(`Genre: ${selectedGenre}`);
    if (selectedTier !== 'ALL') activeParts.push(`Tier ${selectedTier}`);
    if (selectedWatchedYear !== 'ALL')
      activeParts.push(`Watched ${selectedWatchedYear}`);
    if (selectedDecade !== 'ALL') activeParts.push(`Released ${selectedDecade}`);
    if (selectedRatingBand !== 'ALL')
      activeParts.push(`Rating ${selectedRatingBand}`);
    if (filterLikedOnly) activeParts.push('Liked');
    if (filterRewatchOnly) activeParts.push('Rewatches');
    if (filterReviewedOnly) activeParts.push('Reviewed');
    if (filterDeviationsOnly) activeParts.push('Edited vs. LB');

    const label =
      activeParts.length > 0
        ? activeParts.join(' · ')
        : `All Profile Films (${filteredAndSortedFilms.length})`;

    return {
      id: `search-${label}`,
      label,
      description:
        activeParts.length > 0
          ? `Histograms of release year, star rating, watched date, genre, and runtime for ${filteredAndSortedFilms.length.toLocaleString()} matching movies.`
          : `Histograms across all ${filteredAndSortedFilms.length.toLocaleString()} movies in the current sheet view.`,
      sourceType: 'search_results',
      films: filteredAndSortedFilms,
    };
  }, [
    pinnedSectionCohort,
    selectedFilmIds,
    profile.films,
    reviewSearchQuery,
    searchQuery,
    watchStatusFilter,
    selectedGenre,
    selectedTier,
    selectedWatchedYear,
    selectedDecade,
    selectedRatingBand,
    filterLikedOnly,
    filterRewatchOnly,
    filterReviewedOnly,
    filterDeviationsOnly,
    filteredAndSortedFilms,
  ]);

  const renderTableRows = (rows: FilmEntry[]) => (
    <tbody className="divide-y divide-slate-800/60 text-xs">
      {rows.map((film) => {
        const isInspected = inspectedFilmId === film.id;
        const isRowSelected = selectedFilmIds.has(film.id);
        const devRecord = deviationSummary.byFilmId.get(film.id);
        const hasDeviation = Boolean(devRecord);
        const ratingDev = devRecord?.fieldDeviations.find((d) => d.field === 'rating');
        const watchlistDev = devRecord?.fieldDeviations.find((d) => d.field === 'watchlist');
        const dateDev = devRecord?.fieldDeviations.find((d) => d.field === 'watchedDate');
        const notesDev = devRecord?.fieldDeviations.find((d) => d.field === 'notes');
        const likedDev = devRecord?.fieldDeviations.find((d) => d.field === 'liked');
        const rewatchDev = devRecord?.fieldDeviations.find((d) => d.field === 'rewatch');

        return (
          <tr
            key={film.id}
            className={`min-h-9 transition-colors group ${
              isRowSelected
                ? 'bg-amber-500/15 hover:bg-amber-500/20'
                : isInspected
                ? 'bg-amber-500/10'
                : hasDeviation
                ? 'bg-amber-950/20 hover:bg-amber-950/30 border-l-2 border-l-amber-400'
                : film.watchlist
                ? 'bg-sky-950/15 hover:bg-slate-800/40'
                : 'hover:bg-slate-800/40'
            }`}
          >
            {/* Select Row Checkbox for Assembling Custom Film Groups */}
            <td className="pl-3 pr-1 py-1 w-8">
              <input
                type="checkbox"
                checked={isRowSelected}
                onChange={() => handleToggleSelectFilm(film.id)}
                aria-label={`Select ${film.title} for group analysis`}
                className="accent-amber-500 rounded cursor-pointer"
              />
            </td>

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

            {/* Film Title + Deviation Callout + Inspector Drawer Trigger */}
            <td className="px-3 py-1 font-medium text-slate-100">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={() =>
                      setInspectedFilmId((prev) => (prev === film.id ? null : film.id))
                    }
                    className="text-left truncate max-w-[230px] hover:text-amber-300 transition-colors"
                    title="Click to inspect full review, Letterboxd baseline diff, watchlist status, and film details"
                  >
                    {film.title}
                  </button>
                  {devRecord && (
                    <button
                      type="button"
                      onClick={() => setInspectedFilmId(film.id)}
                      title={
                        devRecord.status === 'added_in_app'
                          ? 'Added in FrameSheet (Not in original Letterboxd baseline) — Click to inspect or revert'
                          : `Deviates from Letterboxd baseline (${devRecord.fieldDeviations
                              .map((d) => d.label)
                              .join(', ')}) — Click to inspect diff or revert`
                      }
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 shrink-0"
                    >
                      <span>
                        {devRecord.status === 'added_in_app'
                          ? '+ New Row'
                          : `Δ ${devRecord.fieldDeviations.length} Edited`}
                      </span>
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  {devRecord && (
                    <button
                      type="button"
                      onClick={() => handleRevertFilm(film.id)}
                      title="Revert this movie to original Letterboxd source of truth"
                      className="inline-flex items-center gap-1 text-[11px] text-amber-300 hover:text-amber-200 px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-500/40"
                    >
                      <Undo2 className="w-3 h-3" />
                      Revert
                    </button>
                  )}
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

            {/* Rating (Numeric + Stars; with Letterboxd Baseline Deviation Callout) */}
            <td className="px-3 py-1 text-right font-mono tabular-nums">
              <div className="flex flex-col items-end">
                <select
                  aria-label={`Rating for ${film.title}`}
                  value={film.rating ?? ''}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    handleFieldChange(film.id, 'rating', Number.isNaN(val) ? null : val);
                  }}
                  className={`px-1.5 py-0.5 text-xs font-mono tabular-nums bg-transparent border rounded focus:outline-none text-right ${
                    ratingDev
                      ? 'border-amber-500/60 bg-amber-500/10 text-amber-300 font-semibold'
                      : 'border-transparent hover:border-slate-700 focus:border-amber-500 focus:bg-slate-950 ' +
                        (film.rating !== null ? 'text-amber-400' : 'text-slate-500')
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
                {ratingDev && (
                  <button
                    type="button"
                    onClick={() => handleRevertField(film.id, 'rating')}
                    title="Click to revert rating to Letterboxd baseline"
                    className="text-[10px] font-mono tabular-nums text-amber-300/90 hover:text-amber-200 underline flex items-center gap-0.5 mt-0.5"
                  >
                    <span>LB: {ratingDev.baselineDisplay}</span>
                    <Undo2 className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            </td>

            {/* Watched Date */}
            <td className="px-3 py-1 font-mono tabular-nums text-slate-300">
              <div className="flex flex-col items-start">
                <input
                  type="date"
                  aria-label={`Watched date for ${film.title}`}
                  value={film.watchedDate || ''}
                  onChange={(e) => {
                    const nextDate = e.target.value || null;
                    handleFieldChange(film.id, 'watchedDate', nextDate);
                  }}
                  className={`bg-transparent border rounded px-1 py-0.5 text-xs font-mono tabular-nums focus:outline-none ${
                    dateDev
                      ? 'border-amber-500/60 bg-amber-500/10 text-amber-200'
                      : 'border-transparent hover:border-slate-700 focus:border-amber-500 focus:bg-slate-950 text-slate-300'
                  }`}
                />
                {dateDev && (
                  <button
                    type="button"
                    onClick={() => handleRevertField(film.id, 'watchedDate')}
                    title="Click to revert watched date to Letterboxd baseline"
                    className="text-[10px] font-mono tabular-nums text-amber-300/90 hover:text-amber-200 underline flex items-center gap-0.5 mt-0.5"
                  >
                    <span>LB: {dateDev.baselineDisplay}</span>
                    <Undo2 className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            </td>

            {/* Optional: Flags (Watchlist, Liked & Rewatch) */}
            {optionalCols.flags && (
              <td className="px-2 py-1">
                <div className="flex flex-col items-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        handleFieldChange(film.id, 'watchlist', !film.watchlist)
                      }
                      title={
                        watchlistDev
                          ? `Modified from Letterboxd (${watchlistDev.baselineDisplay} → ${watchlistDev.currentDisplay}). Click to toggle.`
                          : film.watchlist
                          ? 'On Letterboxd Watchlist (Click to mark as Logged)'
                          : 'Logged Film (Click to move to Watchlist)'
                      }
                      className={`p-1 rounded transition-colors ${
                        watchlistDev
                          ? 'ring-1 ring-amber-400 bg-amber-500/15 text-amber-300'
                          : film.watchlist
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
                      title={
                        likedDev
                          ? `Modified from Letterboxd (${likedDev.baselineDisplay} → ${likedDev.currentDisplay})`
                          : film.liked
                          ? 'Liked on Letterboxd'
                          : 'Mark as Liked'
                      }
                      className={`p-1 rounded transition-colors ${
                        likedDev
                          ? 'ring-1 ring-amber-400 bg-amber-500/15 text-rose-300'
                          : film.liked
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
                      title={
                        rewatchDev
                          ? `Modified from Letterboxd (${rewatchDev.baselineDisplay} → ${rewatchDev.currentDisplay})`
                          : film.rewatch
                          ? 'Logged as Rewatch'
                          : 'Mark as Rewatch'
                      }
                      className={`p-1 rounded transition-colors ${
                        rewatchDev
                          ? 'ring-1 ring-amber-400 bg-amber-500/15 text-emerald-300'
                          : film.rewatch
                          ? 'text-emerald-400 hover:text-emerald-300'
                          : 'text-slate-600 hover:text-slate-400'
                      }`}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {watchlistDev && (
                    <button
                      type="button"
                      onClick={() => handleRevertField(film.id, 'watchlist')}
                      title="Revert Watchlist status to Letterboxd baseline"
                      className="text-[10px] font-mono text-amber-300 hover:underline mt-0.5"
                    >
                      LB: {watchlistDev.baselineDisplay}
                    </button>
                  )}
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

            {/* Optional or Auto-Surfaced Review Excerpt, Phrase Search & Inline Edited Callout Column */}
            {(optionalCols.notes ||
              Boolean(cleanReviewQuery(reviewSearchQuery)) ||
              filterReviewedOnly ||
              filterDeviationsOnly ||
              deviationSummary.reviewEditsCount > 0) && (
              <td className="px-3 py-1.5 text-slate-300 max-w-[360px]">
                {(() => {
                  // If this film's review was edited compared to the Letterboxd baseline, render an inline diff callout!
                  if (notesDev && notesDev.wordDiff) {
                    return (
                      <div className="space-y-1 bg-amber-950/30 border border-amber-500/40 rounded px-2 py-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-amber-300 font-semibold">
                            Edited Review Callout vs. Letterboxd
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRevertField(film.id, 'notes')}
                            title="Revert review text to original Letterboxd baseline"
                            className="inline-flex items-center gap-0.5 text-[10px] font-mono text-amber-300 hover:text-amber-100 underline shrink-0"
                          >
                            <Undo2 className="w-2.5 h-2.5" />
                            Revert Review
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setInspectedFilmId((prev) =>
                              prev === film.id ? null : film.id
                            )
                          }
                          className="text-left block w-full text-xs text-slate-200 line-clamp-2 hover:text-white"
                          title="Click to open full side-by-side review diff in inspector"
                        >
                          {renderWordDiffCallout(notesDev.wordDiff, true)}
                        </button>
                      </div>
                    );
                  }

                  const hasReview = isGenuineWrittenReview(film.notes);
                  if (!hasReview) {
                    return (
                      <span className="text-slate-500">
                        {film.tags.length > 0 ? film.tags.join(' · ') : '—'}
                      </span>
                    );
                  }
                  const evalRes = evaluateReviewQuery(
                    film.notes,
                    reviewSearchQuery,
                    reviewMatchMode
                  );
                  return (
                    <button
                      type="button"
                      onClick={() =>
                        setInspectedFilmId((prev) =>
                          prev === film.id ? null : film.id
                        )
                      }
                      title={film.notes}
                      className="text-left block w-full truncate hover:text-slate-100 transition-colors"
                    >
                      {renderHighlightedText(
                        film.notes,
                        evalRes.highlightTerms,
                        95
                      )}
                    </button>
                  );
                })()}
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
    Boolean(cleanReviewQuery(reviewSearchQuery)) ||
    filterReviewedOnly ||
    filterDeviationsOnly ||
    selectedGenre !== 'ALL' ||
    selectedTier !== 'ALL' ||
    selectedWatchedYear !== 'ALL' ||
    selectedDecade !== 'ALL' ||
    selectedRatingBand !== 'ALL' ||
    filterLikedOnly ||
    filterRewatchOnly;

  const showNotesColumn =
    optionalCols.notes ||
    Boolean(cleanReviewQuery(reviewSearchQuery)) ||
    filterReviewedOnly ||
    filterDeviationsOnly ||
    deviationSummary.reviewEditsCount > 0;

  return (
    <div className="space-y-3 relative">
      {/* Compact High-Volume Faceted Filter & Action Toolbar */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* Segmented Watchlist vs. Logged Switcher + Dual Search (General + Review Phrase Search) */}
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[300px]">
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

            <div className="relative min-w-[175px] max-w-[220px] flex-1">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Title, director, tag..."
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-md text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear title search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Dedicated Review Word & Phrase Search Input + Match Mode */}
            <div className="flex items-center flex-1 min-w-[270px] max-w-md bg-slate-950 border border-slate-800 focus-within:border-amber-500 rounded-md overflow-hidden">
              <div className="relative flex-1 flex items-center">
                <FileText className="w-3.5 h-3.5 text-amber-400/80 absolute left-2.5 pointer-events-none" />
                <input
                  type="text"
                  value={reviewSearchQuery}
                  onChange={(e) => setReviewSearchQuery(e.target.value)}
                  placeholder='Search reviews for phrase (e.g. "action-packed")...'
                  aria-label="Search reviews for specific words or phrases"
                  className="w-full pl-8 pr-7 py-1.5 text-xs bg-transparent text-slate-100 placeholder:text-slate-500 focus:outline-none"
                />
                {reviewSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setReviewSearchQuery('')}
                    aria-label="Clear review phrase search"
                    className="absolute right-1.5 text-slate-500 hover:text-slate-200"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              <select
                value={reviewMatchMode}
                onChange={(e) =>
                  setReviewMatchMode(e.target.value as ReviewMatchMode)
                }
                aria-label="Review search match mode"
                title="Choose how review words or phrases are matched"
                className="px-2 py-1.5 text-[11px] bg-slate-900 border-l border-slate-800 text-slate-300 focus:outline-none cursor-pointer shrink-0"
              >
                <option value="phrase">Exact Phrase</option>
                <option value="whole_word">Whole Word</option>
                <option value="all_words">All Words</option>
                <option value="any_word">Any Word</option>
              </select>
              <button
                type="button"
                onClick={() => setShowPhraseLexicon((v) => !v)}
                title="Browse recurring review phrases & terms in your log"
                className={`px-2 py-1.5 text-[11px] border-l border-slate-800 transition-colors whitespace-nowrap shrink-0 ${
                  showPhraseLexicon || Boolean(cleanReviewQuery(reviewSearchQuery))
                    ? 'bg-amber-500/20 text-amber-300 font-medium'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                Phrases
              </button>
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
              onClick={() => {
                setPinnedSectionCohort(null);
                setShowGroupHistograms((v) => !v);
              }}
              title="Plot Release Year, Star Rating, Watched Date, Genre, and Runtime histograms for the current search results or selected movies"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 font-mono tabular-nums ${
                showGroupHistograms || Boolean(cleanReviewQuery(reviewSearchQuery))
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                  : 'bg-slate-950 border-slate-800 text-slate-200 hover:border-slate-700'
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5 text-amber-400" />
              <span>
                {selectedFilmIds.size > 0
                  ? `Group Histograms (${selectedFilmIds.size} selected)`
                  : `Group Histograms (${totalFiltered.toLocaleString()})`}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onOpenChangesSummary?.()}
              title="Open the Summary of Changes page to review and revert deviations from the Letterboxd baseline"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 font-mono tabular-nums ${
                deviationSummary.totalDeviationCount > 0
                  ? 'bg-amber-950/40 border-amber-500/40 text-amber-300 hover:bg-amber-500/20'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <GitCompare className="w-3.5 h-3.5 text-amber-400" />
              <span>
                Summary of Changes ({deviationSummary.totalDeviationCount})
              </span>
            </button>

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

            <div className="relative flex items-center">
              <button
                type="button"
                onClick={() => handleExportCsv()}
                title={`Export Letterboxd-compatible CSV (${activeExportHeadersPreview})`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-500 text-slate-950 rounded-l-md hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
              <button
                type="button"
                onClick={() => setShowExportMenu((v) => !v)}
                aria-label="Choose Letterboxd CSV export format"
                title="Configure Letterboxd CSV schema & organization"
                className="px-2 py-1.5 text-xs font-medium bg-amber-500 text-slate-950 border-l border-amber-600/50 rounded-r-md hover:bg-amber-400 transition-colors"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>

              {showExportMenu && (
                <div className="absolute right-0 top-full mt-1.5 w-80 bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-3 z-30 space-y-2.5 text-xs">
                  <div className="pb-2 border-b border-slate-800">
                    <div className="font-display font-semibold text-slate-100">
                      Letterboxd CSV Export Schema
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Matches Letterboxd&apos;s exact import/export file headers and chronological date organization.
                    </p>
                  </div>

                  <div className="space-y-1">
                    <div className="text-[11px] font-medium text-slate-400">
                      Target File Structure:
                    </div>
                    {(
                      [
                        [
                          'match_imported',
                          profile.importedCsvStructure
                            ? `Match Imported (${profile.importedCsvStructure.filename})`
                            : 'Match Imported / Default (diary.csv)',
                        ],
                        ['diary', 'diary.csv (Logged Diary Entries)'],
                        ['reviews', 'reviews.csv (Diary + Review Text)'],
                        ['ratings', 'ratings.csv (Rated Films Only)'],
                        ['watched', 'watched.csv (Watched History)'],
                        ['watchlist', 'watchlist.csv (Watchlist Only)'],
                      ] as const
                    ).map(([presetKey, label]) => (
                      <button
                        key={presetKey}
                        type="button"
                        onClick={() => {
                          setExportPreset(presetKey);
                          handleExportCsv(presetKey);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded flex items-center justify-between transition-colors ${
                          exportPreset === presetKey
                            ? 'bg-amber-500/20 text-amber-300 font-medium'
                            : 'text-slate-200 hover:bg-slate-800'
                        }`}
                      >
                        <span className="truncate">{label}</span>
                        <Download className="w-3 h-3 shrink-0 opacity-75" />
                      </button>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-slate-800 space-y-2">
                    <label className="flex items-center justify-between gap-2 text-[11px] text-slate-300 cursor-pointer">
                      <span>Keep current sheet sort order</span>
                      <input
                        type="checkbox"
                        checked={exportPreserveOrder}
                        onChange={(e) => setExportPreserveOrder(e.target.checked)}
                        className="accent-amber-500"
                      />
                    </label>
                    <div className="p-2 rounded bg-slate-950 border border-slate-800 font-mono text-[10px] text-slate-400 break-all">
                      <span className="text-slate-500 block mb-0.5">Active Header Row:</span>
                      {activeExportHeadersPreview}
                    </div>
                  </div>
                </div>
              )}
            </div>
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

          <button
            type="button"
            onClick={() => setFilterReviewedOnly((v) => !v)}
            className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 font-mono tabular-nums ${
              filterReviewedOnly
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            Reviewed ({statusCounts.reviewed.toLocaleString()})
          </button>

          <button
            type="button"
            onClick={() => setFilterDeviationsOnly((v) => !v)}
            title="Show only movies that have been edited in FrameSheet compared to the original Letterboxd baseline"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 font-mono tabular-nums ${
              filterDeviationsOnly
                ? 'bg-amber-500 text-slate-950 border-amber-400 font-semibold'
                : deviationSummary.totalDeviationCount > 0
                ? 'bg-amber-950/30 border-amber-500/40 text-amber-300 hover:bg-amber-500/20'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <GitCompare className="w-3 h-3" />
            <span>
              Deviations Only (
              {deviationSummary.modifiedFilmsCount + deviationSummary.addedFilmsCount})
            </span>
          </button>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setWatchStatusFilter('all');
                setSearchQuery('');
                setReviewSearchQuery('');
                setFilterReviewedOnly(false);
                setFilterDeviationsOnly(false);
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

        {/* Review Phrase Concordance & Active Match Summary Bar */}
        {(showPhraseLexicon || Boolean(cleanReviewQuery(reviewSearchQuery))) && (
          <div className="pt-2.5 border-t border-slate-800/80 space-y-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-slate-300">
                <FileText className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="font-medium">Review Phrase Search:</span>
                {cleanReviewQuery(reviewSearchQuery) ? (
                  <span>
                    Found{' '}
                    <strong className="font-mono tabular-nums text-amber-400">
                      {totalFiltered.toLocaleString()}
                    </strong>{' '}
                    {totalFiltered === 1 ? 'movie' : 'movies'} where your review{' '}
                    {reviewMatchMode === 'phrase'
                      ? 'contains the phrase'
                      : reviewMatchMode === 'whole_word'
                      ? 'contains the exact word/term'
                      : reviewMatchMode === 'all_words'
                      ? 'contains all words in'
                      : 'contains any word in'}{' '}
                    <code className="font-mono text-amber-300 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                      &ldquo;{cleanReviewQuery(reviewSearchQuery)}&rdquo;
                    </code>
                  </span>
                ) : (
                  <span className="text-slate-400">
                    Click any recurring phrase below or type a custom word/phrase above to see every movie where you used it in your review.
                  </span>
                )}
              </div>

              {cleanReviewQuery(reviewSearchQuery) && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setPinnedSectionCohort(null);
                      setShowGroupHistograms(true);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded bg-amber-500 text-slate-950 hover:bg-amber-400 transition-colors"
                  >
                    <BarChart2 className="w-3.5 h-3.5" />
                    <span>Plot Year &amp; Rating Histograms</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewSearchQuery('')}
                    className="text-xs text-slate-400 hover:text-amber-400 underline"
                  >
                    Clear Phrase Search
                  </button>
                </div>
              )}
            </div>

            {reviewPhraseCounts.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-400 mr-1">
                  Recurring phrases in your reviews (click to filter &amp; view histograms):
                </span>
                {reviewPhraseCounts.map(({ phrase, count }) => {
                  const isActivePhrase =
                    cleanReviewQuery(reviewSearchQuery).toLowerCase() ===
                    phrase.toLowerCase();
                  return (
                    <button
                      key={phrase}
                      type="button"
                      onClick={() => {
                        if (isActivePhrase) {
                          setReviewSearchQuery('');
                        } else {
                          setReviewMatchMode('phrase');
                          setReviewSearchQuery(phrase);
                          setPinnedSectionCohort(null);
                          setShowGroupHistograms(true);
                        }
                      }}
                      className={`px-2 py-0.5 text-[11px] rounded border transition-colors font-mono tabular-nums ${
                        isActivePhrase
                          ? 'bg-amber-500 text-slate-950 border-amber-400 font-semibold'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-amber-500/50 hover:text-amber-300'
                      }`}
                    >
                      &ldquo;{phrase}&rdquo; ({count})
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Active Manual Selection Bar for Assembled Film Groups */}
        {selectedFilmIds.size > 0 && (
          <div className="pt-2.5 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-amber-300">
              <CheckSquare className="w-3.5 h-3.5 shrink-0" />
              <span>
                Assembled Group:{' '}
                <strong className="font-mono tabular-nums">
                  {selectedFilmIds.size.toLocaleString()}
                </strong>{' '}
                {selectedFilmIds.size === 1 ? 'movie' : 'movies'} selected
              </span>
              {selectedFilmIds.size < totalFiltered && (
                <button
                  type="button"
                  onClick={() => {
                    const next = new Set(selectedFilmIds);
                    filteredAndSortedFilms.forEach((f) => next.add(f.id));
                    setSelectedFilmIds(next);
                  }}
                  className="text-[11px] text-slate-300 hover:text-amber-300 underline ml-1"
                >
                  Select all {totalFiltered.toLocaleString()} filtered movies
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setPinnedSectionCohort(null);
                  setShowGroupHistograms(true);
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-amber-500 text-slate-950 rounded hover:bg-amber-400 transition-colors"
              >
                <BarChart2 className="w-3.5 h-3.5" />
                <span>Plot Group Histograms</span>
              </button>
              {onOpenCohortInAnalytics && (
                <button
                  type="button"
                  onClick={() => onOpenCohortInAnalytics(activeHistogramCohort)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-slate-950 border border-amber-500/40 text-amber-300 rounded hover:bg-amber-500/15 transition-colors"
                >
                  <span>Open in Full Analytics</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedFilmIds(new Set())}
                className="px-2 py-1 text-xs text-slate-400 hover:text-slate-200"
              >
                Clear Selection
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Interactive Histograms Panel for Searched, Selected, or Grouped Movies */}
      {(showGroupHistograms || Boolean(cleanReviewQuery(reviewSearchQuery))) && (
        <GroupHistogramPanel
          cohort={activeHistogramCohort}
          baselineAllFilms={profile.films}
          onClose={() => {
            setShowGroupHistograms(false);
            setPinnedSectionCohort(null);
          }}
          onOpenInFullAnalytics={onOpenCohortInAnalytics}
          onSaveCohort={onSaveCohort}
          onInspectFilm={(id) => setInspectedFilmId(id)}
        />
      )}

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
                  <th className="py-2.5 pl-3 pr-1 w-8">
                    <input
                      type="checkbox"
                      checked={
                        paginatedFlatFilms.length > 0 &&
                        paginatedFlatFilms.every((f) => selectedFilmIds.has(f.id))
                      }
                      onChange={() => handleToggleSelectSlice(paginatedFlatFilms)}
                      title="Select/deselect all rows on this page for group histogram analysis"
                      aria-label="Select all rows on this page"
                      className="accent-amber-500 rounded cursor-pointer"
                    />
                  </th>
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
                  {showNotesColumn && (
                    <th className="py-2.5 px-3 min-w-[240px]">
                      {cleanReviewQuery(reviewSearchQuery)
                        ? `Review Match ("${cleanReviewQuery(reviewSearchQuery)}")`
                        : 'Review Excerpt & Notes'}
                    </th>
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
                <div className="w-full px-4 py-2.5 bg-slate-900 hover:bg-slate-800/60 flex flex-wrap items-center justify-between gap-4 transition-colors">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedGroups((prev) => ({
                        ...prev,
                        [section.key]: !isExpanded,
                      }))
                    }
                    className="flex items-center gap-2.5 text-left"
                  >
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-amber-400 shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                    <span className="text-xs font-display font-semibold text-slate-100">
                      {section.key}
                    </span>
                  </button>

                  <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums text-slate-400">
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
                    <button
                      type="button"
                      onClick={() => {
                        setPinnedSectionCohort({
                          id: `group-${section.key}`,
                          label: section.key,
                          description: `Histograms for ${section.items.length.toLocaleString()} movies in group "${section.key}".`,
                          sourceType: 'group_section',
                          films: section.items,
                        });
                        setShowGroupHistograms(true);
                      }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-sans font-medium rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 transition-colors"
                      title={`Plot Release Year, Star Rating, and Genre histograms for ${section.key}`}
                    >
                      <BarChart2 className="w-3 h-3" />
                      <span>Histograms</span>
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-800">
                    <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
                      <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 z-10 bg-slate-950">
                          <tr className="border-b border-slate-800 text-[11px] font-medium text-slate-400">
                            <th className="py-2 pl-3 pr-1 w-8">
                              <input
                                type="checkbox"
                                checked={
                                  section.items.length > 0 &&
                                  section.items.every((f) =>
                                    selectedFilmIds.has(f.id)
                                  )
                                }
                                onChange={() =>
                                  handleToggleSelectSlice(section.items)
                                }
                                title={`Select all ${section.items.length} films in ${section.key}`}
                                className="accent-amber-500 rounded cursor-pointer"
                              />
                            </th>
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
                            {showNotesColumn && (
                              <th className="py-2 px-3 min-w-[240px]">
                                {cleanReviewQuery(reviewSearchQuery)
                                  ? `Review Match ("${cleanReviewQuery(reviewSearchQuery)}")`
                                  : 'Review Excerpt & Notes'}
                              </th>
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
      {inspectedFilm &&
        (() => {
          const inspectedDev = deviationSummary.byFilmId.get(inspectedFilm.id);
          const ratingDev = inspectedDev?.fieldDeviations.find(
            (d) => d.field === 'rating'
          );
          const watchlistDev = inspectedDev?.fieldDeviations.find(
            (d) => d.field === 'watchlist'
          );
          const dateDev = inspectedDev?.fieldDeviations.find(
            (d) => d.field === 'watchedDate'
          );
          const rankDev = inspectedDev?.fieldDeviations.find(
            (d) => d.field === 'customRank'
          );
          const tierDev = inspectedDev?.fieldDeviations.find(
            (d) => d.field === 'tier'
          );
          const genresDev = inspectedDev?.fieldDeviations.find(
            (d) => d.field === 'genres'
          );
          const tagsDev = inspectedDev?.fieldDeviations.find(
            (d) => d.field === 'tags'
          );
          const notesDev = inspectedDev?.fieldDeviations.find(
            (d) => d.field === 'notes'
          );

          return (
            <div className="fixed inset-y-0 right-0 z-40 w-full max-w-md bg-slate-900 border-l border-slate-800 shadow-2xl p-6 overflow-y-auto flex flex-col justify-between">
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-800">
                  <div>
                    <div className="text-xs font-mono tabular-nums text-amber-400 mb-1">
                      {inspectedFilm.watchlist
                        ? 'Letterboxd Watchlist (Want to Watch)'
                        : `Rank #${inspectedFilm.customRank ?? '—'} · Tier ${
                            inspectedFilm.tier
                          }`}
                    </div>
                    <h3 className="text-lg font-display font-bold text-slate-100">
                      {inspectedFilm.title} ({inspectedFilm.year})
                    </h3>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Directed by {inspectedFilm.director} ·{' '}
                      {inspectedFilm.runtimeMinutes}m · {inspectedFilm.country}
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

                {/* Letterboxd Baseline Deviation Banner inside Inspector */}
                {inspectedDev ? (
                  <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-500/40 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                        <GitCompare className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          {inspectedDev.status === 'added_in_app'
                            ? 'Added in FrameSheet (Not in Letterboxd Baseline)'
                            : `Deviates from Letterboxd Baseline (${inspectedDev.fieldDeviations.length} ${
                                inspectedDev.fieldDeviations.length === 1
                                  ? 'field'
                                  : 'fields'
                              })`}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRevertFilm(inspectedFilm.id)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-amber-500 text-slate-950 rounded hover:bg-amber-400 transition-colors shrink-0"
                      >
                        <Undo2 className="w-3 h-3" />
                        Revert Film
                      </button>
                    </div>
                    {inspectedDev.fieldDeviations.length > 0 && (
                      <div className="text-[11px] text-slate-300">
                        Modified fields:{' '}
                        <span className="font-mono text-amber-200">
                          {inspectedDev.fieldDeviations.map((d) => d.label).join(' · ')}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-xs text-slate-400">
                    <span>Matches Original Letterboxd Source of Truth</span>
                    <span className="font-mono text-emerald-400">Unmodified ✓</span>
                  </div>
                )}

                {/* Watchlist vs. Logged Status Toggle */}
                <div
                  className={`p-3 bg-slate-950 border rounded-lg space-y-2 ${
                    watchlistDev ? 'border-amber-500/50' : 'border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
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
                  {watchlistDev && (
                    <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-amber-300 font-mono">
                      <span>Letterboxd Baseline: {watchlistDev.baselineDisplay}</span>
                      <button
                        type="button"
                        onClick={() => handleRevertField(inspectedFilm.id, 'watchlist')}
                        className="inline-flex items-center gap-1 underline hover:text-amber-100"
                      >
                        <Undo2 className="w-3 h-3" />
                        Revert
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-slate-400">Star Rating</label>
                      {ratingDev && (
                        <button
                          type="button"
                          onClick={() => handleRevertField(inspectedFilm.id, 'rating')}
                          className="text-[10px] font-mono text-amber-300 hover:underline inline-flex items-center gap-0.5"
                          title="Revert rating to Letterboxd baseline"
                        >
                          <span>LB: {ratingDev.baselineDisplay}</span>
                          <Undo2 className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
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
                      className={`w-full px-3 py-1.5 text-xs font-mono tabular-nums bg-slate-950 border rounded-md text-amber-400 ${
                        ratingDev ? 'border-amber-500/60' : 'border-slate-800'
                      }`}
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
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-slate-400">Watched Date</label>
                      {dateDev && (
                        <button
                          type="button"
                          onClick={() =>
                            handleRevertField(inspectedFilm.id, 'watchedDate')
                          }
                          className="text-[10px] font-mono text-amber-300 hover:underline inline-flex items-center gap-0.5"
                          title="Revert watched date to Letterboxd baseline"
                        >
                          <span>LB: {dateDev.baselineDisplay}</span>
                          <Undo2 className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
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
                      className={`w-full px-3 py-1.5 text-xs font-mono tabular-nums bg-slate-950 border rounded-md text-slate-200 ${
                        dateDev ? 'border-amber-500/60' : 'border-slate-800'
                      }`}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-slate-400">Custom Rank #</label>
                      {rankDev && (
                        <button
                          type="button"
                          onClick={() =>
                            handleRevertField(inspectedFilm.id, 'customRank')
                          }
                          className="text-[10px] font-mono text-amber-300 hover:underline inline-flex items-center gap-0.5"
                        >
                          <span>LB: {rankDev.baselineDisplay}</span>
                          <Undo2 className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
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
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-slate-400">Tier Classification</label>
                      {tierDev && (
                        <button
                          type="button"
                          onClick={() => handleRevertField(inspectedFilm.id, 'tier')}
                          className="text-[10px] font-mono text-amber-300 hover:underline inline-flex items-center gap-0.5"
                        >
                          <span>LB: {tierDev.baselineDisplay}</span>
                          <Undo2 className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
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
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-slate-400">
                      Genres (separated by · or comma)
                    </label>
                    {genresDev && (
                      <button
                        type="button"
                        onClick={() => handleRevertField(inspectedFilm.id, 'genres')}
                        className="text-[10px] font-mono text-amber-300 hover:underline inline-flex items-center gap-0.5"
                      >
                        <span>Revert Genres</span>
                        <Undo2 className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
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
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-slate-400">
                      Tags (comma-separated)
                    </label>
                    {tagsDev && (
                      <button
                        type="button"
                        onClick={() => handleRevertField(inspectedFilm.id, 'tags')}
                        className="text-[10px] font-mono text-amber-300 hover:underline inline-flex items-center gap-0.5"
                      >
                        <span>LB: {tagsDev.baselineDisplay}</span>
                        <Undo2 className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
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

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs text-slate-400">
                      Review / Personal Log Notes
                    </label>
                    {notesDev && (
                      <button
                        type="button"
                        onClick={() => handleRevertField(inspectedFilm.id, 'notes')}
                        className="inline-flex items-center gap-1 text-[11px] font-mono text-amber-300 hover:text-amber-100 underline"
                      >
                        <Undo2 className="w-3 h-3" />
                        Revert to Letterboxd Review
                      </button>
                    )}
                  </div>

                  {/* Callout of Edited Review Portions vs. Original Letterboxd Review */}
                  {notesDev && notesDev.wordDiff && (
                    <div className="p-3 rounded-md bg-amber-950/25 border border-amber-500/40 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between text-[11px] font-mono text-amber-300">
                        <span>Edited Portions Callout (vs. Letterboxd Standard)</span>
                        <span>Word Diff</span>
                      </div>
                      <div className="p-2 rounded bg-slate-950 border border-slate-800 text-slate-200 leading-relaxed">
                        {renderWordDiffCallout(notesDev.wordDiff)}
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-3 pt-0.5">
                        <span>
                          <ins className="bg-amber-500/25 text-amber-200 border-b border-amber-400 no-underline px-1 rounded">
                            Added / Altered in App
                          </ins>
                        </span>
                        <span>
                          <del className="bg-rose-500/20 text-rose-300 line-through px-1 rounded">
                            Removed from Letterboxd
                          </del>
                        </span>
                      </div>
                    </div>
                  )}

                  {cleanReviewQuery(reviewSearchQuery) &&
                    isGenuineWrittenReview(inspectedFilm.notes) && (
                      <div className="p-2.5 rounded-md bg-slate-950 border border-amber-500/40 text-xs text-slate-200 leading-relaxed">
                        <div className="text-[11px] font-mono text-amber-400 mb-1">
                          Matched Review Phrase Highlight:
                        </div>
                        {renderHighlightedText(
                          inspectedFilm.notes,
                          evaluateReviewQuery(
                            inspectedFilm.notes,
                            reviewSearchQuery,
                            reviewMatchMode
                          ).highlightTerms
                        )}
                      </div>
                    )}

                  <textarea
                    rows={4}
                    value={inspectedFilm.notes}
                    onChange={(e) =>
                      handleFieldChange(inspectedFilm.id, 'notes', e.target.value)
                    }
                    placeholder="Write or edit review notes for this film..."
                    className={`w-full px-3 py-2 text-xs bg-slate-950 border rounded-md text-slate-200 focus:outline-none focus:border-amber-500 ${
                      notesDev ? 'border-amber-500/60' : 'border-slate-800'
                    }`}
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
          );
        })()}
    </div>
  );
};
