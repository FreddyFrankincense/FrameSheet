import { FilmEntry } from '../types/letterboxd';

export type EditableFilmField =
  | 'notes'
  | 'rating'
  | 'watchlist'
  | 'watchedDate'
  | 'liked'
  | 'rewatch'
  | 'tags'
  | 'genres'
  | 'customRank'
  | 'tier';

export interface WordDiffSegment {
  type: 'unchanged' | 'added' | 'removed';
  text: string;
}

export interface FieldDeviation {
  field: EditableFilmField;
  label: string;
  baselineDisplay: string;
  currentDisplay: string;
  wordDiff?: WordDiffSegment[];
}

export interface FilmDeviationRecord {
  filmId: string;
  title: string;
  year: number;
  status: 'modified' | 'added_in_app' | 'removed_in_app';
  baselineFilm: FilmEntry | null;
  currentFilm: FilmEntry | null;
  fieldDeviations: FieldDeviation[];
}

export interface ProfileDeviationSummary {
  totalDeviationCount: number;
  modifiedFilmsCount: number;
  addedFilmsCount: number;
  removedFilmsCount: number;
  reviewEditsCount: number;
  ratingEditsCount: number;
  watchlistEditsCount: number;
  records: FilmDeviationRecord[];
  byFilmId: Map<string, FilmDeviationRecord>;
}

/**
 * Computes a word-level Longest Common Subsequence (LCS) diff between the original
 * Letterboxd review text and the edited FrameSheet review text so edited portions
 * can be visually called out inline.
 */
export function computeReviewWordDiff(
  baselineText: string,
  currentText: string
): WordDiffSegment[] {
  const baseTrimmed = (baselineText || '').trim();
  const currTrimmed = (currentText || '').trim();

  if (baseTrimmed === currTrimmed) {
    return currTrimmed ? [{ type: 'unchanged', text: currTrimmed }] : [];
  }
  if (!baseTrimmed) {
    return [{ type: 'added', text: currTrimmed }];
  }
  if (!currTrimmed) {
    return [{ type: 'removed', text: baseTrimmed }];
  }

  // Split preserving whitespace tokens for natural reconstruction
  const baseTokens = baseTrimmed.split(/(\s+)/).filter((t) => t.length > 0);
  const currTokens = currTrimmed.split(/(\s+)/).filter((t) => t.length > 0);

  // Guard for very long texts to keep UI instantaneous
  if (baseTokens.length * currTokens.length > 90000) {
    return [
      { type: 'removed', text: baseTrimmed },
      { type: 'added', text: currTrimmed },
    ];
  }

  const m = baseTokens.length;
  const n = currTokens.length;
  const dp: Uint16Array[] = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (baseTokens[i] === currTokens[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const rawSegments: WordDiffSegment[] = [];
  let i = 0;
  let j = 0;

  while (i < m && j < n) {
    if (baseTokens[i] === currTokens[j]) {
      rawSegments.push({ type: 'unchanged', text: baseTokens[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rawSegments.push({ type: 'removed', text: baseTokens[i] });
      i++;
    } else {
      rawSegments.push({ type: 'added', text: currTokens[j] });
      j++;
    }
  }
  while (i < m) {
    rawSegments.push({ type: 'removed', text: baseTokens[i] });
    i++;
  }
  while (j < n) {
    rawSegments.push({ type: 'added', text: currTokens[j] });
    j++;
  }

  // Merge adjacent segments of the same type for clean DOM rendering
  const merged: WordDiffSegment[] = [];
  for (const seg of rawSegments) {
    const prev = merged[merged.length - 1];
    if (prev && prev.type === seg.type) {
      prev.text += seg.text;
    } else {
      merged.push({ ...seg });
    }
  }

  return merged;
}

function normalizeArrayStr(arr: string[]): string {
  return arr
    .map((s) => s.trim())
    .filter(Boolean)
    .join(', ');
}

export function compareFilmToBaseline(
  baseline: FilmEntry,
  current: FilmEntry
): FieldDeviation[] {
  const deviations: FieldDeviation[] = [];

  // 1. Review / Notes comparison
  const baseNotes = (baseline.notes || '').trim();
  const currNotes = (current.notes || '').trim();
  if (baseNotes !== currNotes) {
    deviations.push({
      field: 'notes',
      label: 'Review / Notes',
      baselineDisplay: baseNotes || '(No review)',
      currentDisplay: currNotes || '(Removed review)',
      wordDiff: computeReviewWordDiff(baseNotes, currNotes),
    });
  }

  // 2. Star Rating comparison
  if (baseline.rating !== current.rating) {
    deviations.push({
      field: 'rating',
      label: 'Star Rating',
      baselineDisplay:
        baseline.rating !== null ? `${baseline.rating.toFixed(1)} ★` : 'Unrated',
      currentDisplay:
        current.rating !== null ? `${current.rating.toFixed(1)} ★` : 'Unrated',
    });
  }

  // 3. Watchlist Inclusion comparison
  if (baseline.watchlist !== current.watchlist) {
    deviations.push({
      field: 'watchlist',
      label: 'Watchlist Inclusion',
      baselineDisplay: baseline.watchlist ? 'On Watchlist' : 'Logged (Watched)',
      currentDisplay: current.watchlist ? 'On Watchlist' : 'Logged (Watched)',
    });
  }

  // 4. Watched Date comparison
  const baseDate = baseline.watchedDate || '';
  const currDate = current.watchedDate || '';
  if (baseDate !== currDate) {
    deviations.push({
      field: 'watchedDate',
      label: 'Watched Date',
      baselineDisplay: baseDate || 'Unwatched / No Date',
      currentDisplay: currDate || 'Unwatched / No Date',
    });
  }

  // 5. Liked flag comparison
  if (baseline.liked !== current.liked) {
    deviations.push({
      field: 'liked',
      label: 'Liked Status',
      baselineDisplay: baseline.liked ? 'Liked (♥)' : 'Not Liked',
      currentDisplay: current.liked ? 'Liked (♥)' : 'Not Liked',
    });
  }

  // 6. Rewatch flag comparison
  if (baseline.rewatch !== current.rewatch) {
    deviations.push({
      field: 'rewatch',
      label: 'Rewatch Status',
      baselineDisplay: baseline.rewatch ? 'Rewatch' : 'First Watch',
      currentDisplay: current.rewatch ? 'Rewatch' : 'First Watch',
    });
  }

  // 7. Tags comparison
  const baseTags = normalizeArrayStr(baseline.tags);
  const currTags = normalizeArrayStr(current.tags);
  if (baseTags !== currTags) {
    deviations.push({
      field: 'tags',
      label: 'Tags',
      baselineDisplay: baseTags || '(None)',
      currentDisplay: currTags || '(None)',
    });
  }

  // 8. Genres comparison
  const baseGenres = normalizeArrayStr(baseline.genres);
  const currGenres = normalizeArrayStr(current.genres);
  if (baseGenres !== currGenres) {
    deviations.push({
      field: 'genres',
      label: 'Genres',
      baselineDisplay: baseGenres || '(None)',
      currentDisplay: currGenres || '(None)',
    });
  }

  // 9. Tier Grade comparison
  if (baseline.tier !== current.tier) {
    deviations.push({
      field: 'tier',
      label: 'Tier Grade',
      baselineDisplay: `Tier ${baseline.tier}`,
      currentDisplay: `Tier ${current.tier}`,
    });
  }

  // 10. Custom Rank comparison
  if (baseline.customRank !== current.customRank) {
    deviations.push({
      field: 'customRank',
      label: 'Custom Rank',
      baselineDisplay:
        baseline.customRank !== null ? `#${baseline.customRank}` : 'Unranked',
      currentDisplay:
        current.customRank !== null ? `#${current.customRank}` : 'Unranked',
    });
  }

  return deviations;
}

/**
 * Compares the active FrameSheet film list against the original Letterboxd baseline
 * ("source of truth") and returns a complete summary + per-film lookup map.
 */
export function computeProfileDeviations(
  baselineFilms: FilmEntry[] | undefined,
  currentFilms: FilmEntry[]
): ProfileDeviationSummary {
  const byFilmId = new Map<string, FilmDeviationRecord>();
  const records: FilmDeviationRecord[] = [];

  if (!baselineFilms || baselineFilms.length === 0) {
    return {
      totalDeviationCount: 0,
      modifiedFilmsCount: 0,
      addedFilmsCount: 0,
      removedFilmsCount: 0,
      reviewEditsCount: 0,
      ratingEditsCount: 0,
      watchlistEditsCount: 0,
      records,
      byFilmId,
    };
  }

  const baselineById = new Map<string, FilmEntry>();
  const baselineByTitleYear = new Map<string, FilmEntry>();

  baselineFilms.forEach((b) => {
    baselineById.set(b.id, b);
    baselineByTitleYear.set(`${b.title.toLowerCase()}::${b.year}`, b);
  });

  const matchedBaselineIds = new Set<string>();
  let modifiedFilmsCount = 0;
  let addedFilmsCount = 0;
  let removedFilmsCount = 0;
  let reviewEditsCount = 0;
  let ratingEditsCount = 0;
  let watchlistEditsCount = 0;
  let totalDeviationCount = 0;

  currentFilms.forEach((curr) => {
    const base =
      baselineById.get(curr.id) ||
      baselineByTitleYear.get(`${curr.title.toLowerCase()}::${curr.year}`);

    if (!base) {
      const rec: FilmDeviationRecord = {
        filmId: curr.id,
        title: curr.title,
        year: curr.year,
        status: 'added_in_app',
        baselineFilm: null,
        currentFilm: curr,
        fieldDeviations: [
          {
            field: 'watchlist',
            label: 'Added in FrameSheet',
            baselineDisplay: 'Not in Letterboxd Baseline',
            currentDisplay: curr.watchlist
              ? 'Added to Watchlist in App'
              : `Added as Logged (${curr.rating !== null ? `${curr.rating.toFixed(1)} ★` : 'Unrated'})`,
          },
        ],
      };
      records.push(rec);
      byFilmId.set(curr.id, rec);
      addedFilmsCount += 1;
      totalDeviationCount += 1;
      return;
    }

    matchedBaselineIds.add(base.id);
    const diffs = compareFilmToBaseline(base, curr);
    if (diffs.length > 0) {
      const rec: FilmDeviationRecord = {
        filmId: curr.id,
        title: curr.title,
        year: curr.year,
        status: 'modified',
        baselineFilm: base,
        currentFilm: curr,
        fieldDeviations: diffs,
      };
      records.push(rec);
      byFilmId.set(curr.id, rec);
      modifiedFilmsCount += 1;
      totalDeviationCount += diffs.length;
      if (diffs.some((d) => d.field === 'notes')) reviewEditsCount += 1;
      if (diffs.some((d) => d.field === 'rating')) ratingEditsCount += 1;
      if (diffs.some((d) => d.field === 'watchlist')) watchlistEditsCount += 1;
    }
  });

  // Check for films present in original Letterboxd baseline that were deleted in FrameSheet
  baselineFilms.forEach((base) => {
    if (!matchedBaselineIds.has(base.id)) {
      const rec: FilmDeviationRecord = {
        filmId: base.id,
        title: base.title,
        year: base.year,
        status: 'removed_in_app',
        baselineFilm: base,
        currentFilm: null,
        fieldDeviations: [
          {
            field: 'watchlist',
            label: 'Deleted from FrameSheet',
            baselineDisplay: base.watchlist
              ? 'On Letterboxd Watchlist'
              : `Logged on Letterboxd (${base.rating !== null ? `${base.rating.toFixed(1)} ★` : 'Unrated'})`,
            currentDisplay: 'Removed in App',
          },
        ],
      };
      records.push(rec);
      byFilmId.set(base.id, rec);
      removedFilmsCount += 1;
      totalDeviationCount += 1;
    }
  });

  return {
    totalDeviationCount,
    modifiedFilmsCount,
    addedFilmsCount,
    removedFilmsCount,
    reviewEditsCount,
    ratingEditsCount,
    watchlistEditsCount,
    records,
    byFilmId,
  };
}

export function cloneFilmsArray(films: FilmEntry[]): FilmEntry[] {
  return films.map((f) => ({
    ...f,
    tags: [...f.tags],
    genres: [...f.genres],
  }));
}
