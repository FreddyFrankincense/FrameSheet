import Papa from 'papaparse';
import {
  FilmEntry,
  ImportedCsvStructure,
  LetterboxdCsvPreset,
  TierGrade,
} from '../types/letterboxd';
import { inferTierFromRating, resolveFilmMetadata, slugifyTitle } from '../data/filmCatalog';

interface RawCsvRow {
  Date?: string;
  Name?: string;
  Title?: string;
  Year?: string;
  'Release Year'?: string;
  'Letterboxd URI'?: string;
  URI?: string;
  Rating?: string;
  Rating10?: string;
  Rewatch?: string;
  Tags?: string;
  'Watched Date'?: string;
  WatchedDate?: string;
  Review?: string;
  Notes?: string;
  Genres?: string;
  Director?: string;
  Directors?: string;
  Rank?: string;
  Position?: string;
  Tier?: string;
  Liked?: string;
  Watchlist?: string;
}

export const LETTERBOXD_CSV_HEADERS: Record<
  Exclude<LetterboxdCsvPreset, 'custom'>,
  string[]
> = {
  diary: [
    'Date',
    'Name',
    'Year',
    'Letterboxd URI',
    'Rating',
    'Rewatch',
    'Tags',
    'Watched Date',
  ],
  reviews: [
    'Date',
    'Name',
    'Year',
    'Letterboxd URI',
    'Rating',
    'Rewatch',
    'Review',
    'Tags',
    'Watched Date',
  ],
  ratings: ['Date', 'Name', 'Year', 'Letterboxd URI', 'Rating'],
  watched: ['Date', 'Name', 'Year', 'Letterboxd URI'],
  watchlist: ['Date', 'Name', 'Year', 'Letterboxd URI'],
};

const INTERNAL_TAGS = new Set(['manual-entry', 'letterboxd-watchlist']);
const SYNTHETIC_NOTE_PREFIXES = [
  'Logged via external profile view.',
  'Added to Watchlist.',
  'Synced from Letterboxd Watchlist',
];

function cleanExportTags(tags: string[]): string {
  return tags
    .map((t) => t.trim())
    .filter((t) => Boolean(t) && !INTERNAL_TAGS.has(t))
    .join(', ');
}

function cleanExportReview(notes: string): string {
  const trimmed = (notes || '').trim();
  if (!trimmed) return '';
  if (SYNTHETIC_NOTE_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) {
    return '';
  }
  return trimmed;
}

export function parseStarString(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const num = parseFloat(trimmed);
  if (!Number.isNaN(num) && num >= 0.5 && num <= 5.0) {
    return Math.round(num * 2) / 2;
  }

  const fullStars = (trimmed.match(/★/g) || []).length;
  const halfStar = trimmed.includes('½') ? 0.5 : 0;
  if (fullStars > 0 || halfStar > 0) {
    return fullStars + halfStar;
  }

  const ratedMatch = trimmed.match(/rated-(\d+)/);
  if (ratedMatch) {
    const val = parseInt(ratedMatch[1], 10) / 2;
    if (val >= 0.5 && val <= 5.0) return val;
  }

  return null;
}

function detectPresetFromHeadersAndFilename(
  headers: string[],
  filename: string
): LetterboxdCsvPreset {
  const lowerFilename = filename.toLowerCase();
  const normalized = headers.map((h) => h.trim());
  const key = normalized.join(',');

  if (lowerFilename.includes('watchlist')) {
    return 'watchlist';
  }
  if (key === LETTERBOXD_CSV_HEADERS.diary.join(',')) {
    return 'diary';
  }
  if (key === LETTERBOXD_CSV_HEADERS.reviews.join(',')) {
    return 'reviews';
  }
  if (key === LETTERBOXD_CSV_HEADERS.ratings.join(',')) {
    return 'ratings';
  }
  if (key === LETTERBOXD_CSV_HEADERS.watched.join(',')) {
    return 'watched';
  }
  return 'custom';
}

/**
 * Inspects uploaded Letterboxd CSV files to capture their exact column headers,
 * preset format, date sorting direction, and rating number formatting so that
 * subsequent CSV exports match the imported CSV structure and organization.
 */
export function extractImportedCsvStructure(
  csvContents: { filename: string; content: string }[]
): ImportedCsvStructure {
  const defaultStructure: ImportedCsvStructure = {
    preset: 'diary',
    headers: [...LETTERBOXD_CSV_HEADERS.diary],
    filename: 'diary.csv',
    dateOrder: 'desc',
    useFixedOneDecimalRating: false,
  };

  if (!csvContents || csvContents.length === 0) {
    return defaultStructure;
  }

  // Prefer the richest logged file (reviews > diary > ratings > watched > watchlist) when multiple files are imported
  const priorityOrder = ['reviews', 'diary', 'ratings', 'watched', 'films', 'watchlist'];
  const primaryFile =
    [...csvContents].sort((a, b) => {
      const aName = a.filename.toLowerCase();
      const bName = b.filename.toLowerCase();
      const aIdx = priorityOrder.findIndex((p) => aName.includes(p));
      const bIdx = priorityOrder.findIndex((p) => bName.includes(p));
      const aScore = aIdx === -1 ? 99 : aIdx;
      const bScore = bIdx === -1 ? 99 : bIdx;
      return aScore - bScore;
    })[0] || csvContents[0];

  const parsed = Papa.parse<RawCsvRow>(primaryFile.content.trim(), {
    header: true,
    skipEmptyLines: true,
  });

  const rawHeaders = (parsed.meta.fields || []).map((h) => h.trim()).filter(Boolean);
  if (rawHeaders.length === 0) {
    return defaultStructure;
  }

  const preset = detectPresetFromHeadersAndFilename(rawHeaders, primaryFile.filename);

  // Detect chronological order (asc vs desc) from the imported rows
  let firstDate: string | null = null;
  let lastDate: string | null = null;
  let sawFixedDecimalWholeRating = false;
  let sawIntegerWholeRating = false;

  parsed.data.forEach((row) => {
    const d = (row['Watched Date'] || row.WatchedDate || row.Date || '').trim();
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      if (!firstDate) firstDate = d;
      lastDate = d;
    }
    const r = (row.Rating || '').trim();
    if (/^[1-5]\.0$/.test(r)) {
      sawFixedDecimalWholeRating = true;
    } else if (/^[1-5]$/.test(r)) {
      sawIntegerWholeRating = true;
    }
  });

  const dateOrder: 'asc' | 'desc' =
    firstDate && lastDate && firstDate !== lastDate
      ? firstDate < lastDate
        ? 'asc'
        : 'desc'
      : 'desc';

  return {
    preset,
    headers: rawHeaders,
    filename: primaryFile.filename || 'diary.csv',
    dateOrder,
    useFixedOneDecimalRating: sawFixedDecimalWholeRating && !sawIntegerWholeRating,
  };
}

/**
 * Parses one or more Letterboxd CSV files (diary.csv, ratings.csv, watched.csv, reviews.csv, watchlist.csv)
 * and merges them by film key (Title + Year). Uses watchlist.csv (or Watchlist column) as the source of truth
 * for the `watchlist` boolean flag.
 */
export function parseLetterboxdCsvFiles(
  csvContents: { filename: string; content: string }[]
): FilmEntry[] {
  const mergedMap = new Map<string, FilmEntry>();
  const hasExplicitWatchlistCsv = csvContents.some((c) =>
    c.filename.toLowerCase().includes('watchlist')
  );
  const watchlistTruthKeys = new Set<string>();

  csvContents.forEach(({ filename, content }) => {
    const parsed = Papa.parse<RawCsvRow>(content.trim(), {
      header: true,
      skipEmptyLines: true,
    });

    const lowerName = filename.toLowerCase();
    const isLikedFile = lowerName.includes('likes');
    const isWatchlistFile = lowerName.includes('watchlist');

    parsed.data.forEach((row, index) => {
      const title = (row.Name || row.Title || '').trim();
      if (!title) return;

      const yearRaw = parseInt((row.Year || row['Release Year'] || '').trim(), 10);
      const uri = (row['Letterboxd URI'] || row.URI || '').trim();
      const slugFromUri = uri.includes('/film/')
        ? uri.split('/film/')[1]?.replace(/\/$/, '')
        : undefined;

      const meta = resolveFilmMetadata(
        title,
        Number.isNaN(yearRaw) ? undefined : yearRaw,
        slugFromUri
      );
      const key = `${meta.title.toLowerCase()}::${meta.year}`;

      const rating10Val = row.Rating10 ? parseInt(row.Rating10.trim(), 10) / 2 : null;
      const rating =
        parseStarString(row.Rating) ??
        (rating10Val && !Number.isNaN(rating10Val) && rating10Val >= 0.5 && rating10Val <= 5.0
          ? rating10Val
          : null);

      const explicitWatchlistCol =
        (row.Watchlist || '').trim().toLowerCase() === 'yes' ||
        (row.Watchlist || '').trim().toLowerCase() === 'true';
      const isOnWatchlist = isWatchlistFile || explicitWatchlistCol;

      if (isOnWatchlist) {
        watchlistTruthKeys.add(key);
      }

      // In Letterboxd's watchlist.csv, 'Date' is the date the film was added to the watchlist, NOT a watched date
      const explicitWatchedDate = (row['Watched Date'] || row.WatchedDate || '').trim();
      const rawDate = (row.Date || '').trim();
      const watchedDate = isWatchlistFile
        ? explicitWatchedDate || null
        : explicitWatchedDate || rawDate || null;
      const loggedDate = rawDate || explicitWatchedDate || null;

      const rewatch =
        (row.Rewatch || '').trim().toLowerCase() === 'yes' ||
        (row.Rewatch || '').trim().toLowerCase() === 'true';
      const liked =
        isLikedFile ||
        (row.Liked || '').trim().toLowerCase() === 'yes' ||
        (row.Liked || '').trim().toLowerCase() === 'true';

      const rowTags = (row.Tags || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      if (isWatchlistFile && !rowTags.includes('letterboxd-watchlist')) {
        rowTags.push('letterboxd-watchlist');
      }

      const customGenres = (row.Genres || '')
        .split(/[,|·]/)
        .map((g) => g.trim())
        .filter(Boolean);

      const notes = (row.Review || row.Notes || '').trim();
      const rankRawStr = row.Position || row.Rank;
      const customRankRaw = rankRawStr ? parseInt(rankRawStr, 10) : null;
      const customRank =
        customRankRaw && !Number.isNaN(customRankRaw) ? customRankRaw : null;

      const existing = mergedMap.get(key);
      if (existing) {
        if (rating !== null) {
          existing.rating = rating;
          if (existing.tier === 'Unranked') {
            existing.tier = inferTierFromRating(rating);
          }
        }
        if (watchedDate) {
          existing.watchedDate = watchedDate;
        }
        if (loggedDate && !existing.loggedDate) {
          existing.loggedDate = loggedDate;
        }
        if (rewatch) existing.rewatch = true;
        if (liked) existing.liked = true;
        if (isOnWatchlist) existing.watchlist = true;
        if (rowTags.length > 0) {
          existing.tags = Array.from(new Set([...existing.tags, ...rowTags]));
        }
        if (notes && !existing.notes) {
          existing.notes = notes;
        }
        if (uri && (!existing.letterboxdUri || !existing.letterboxdUri.includes('boxd.it'))) {
          existing.letterboxdUri = uri;
        }
      } else {
        const tierRaw = (row.Tier || '').trim() as TierGrade;
        const validTiers: TierGrade[] = ['S', 'A', 'B', 'C', 'D', 'Unranked'];
        const resolvedTier = validTiers.includes(tierRaw)
          ? tierRaw
          : isOnWatchlist && rating === null
          ? 'Unranked'
          : inferTierFromRating(rating);

        mergedMap.set(key, {
          id: `${meta.slug}-${index}-${Date.now()}`,
          title: meta.title,
          year: meta.year,
          letterboxdUri: uri || `https://letterboxd.com/film/${meta.slug}/`,
          slug: meta.slug || slugifyTitle(meta.title, meta.year),
          rating,
          watchedDate,
          loggedDate,
          rewatch,
          liked,
          watchlist: isOnWatchlist,
          tags: rowTags,
          genres: customGenres.length > 0 ? customGenres : meta.genres,
          director: (row.Directors || row.Director || '').trim() || meta.director,
          runtimeMinutes: meta.runtimeMinutes,
          country: meta.country,
          customRank,
          tier: resolvedTier,
          notes:
            notes ||
            (isWatchlistFile && loggedDate
              ? `Synced from Letterboxd Watchlist (added ${loggedDate}).`
              : ''),
        });
      }
    });
  });

  // If watchlist.csv was explicitly included, enforce it as the exact source of truth for `watchlist`
  if (hasExplicitWatchlistCsv) {
    mergedMap.forEach((entry, key) => {
      entry.watchlist = watchlistTruthKeys.has(key);
    });
  }

  const entries = Array.from(mergedMap.values());
  entries.sort((a, b) => {
    if (a.watchlist !== b.watchlist) {
      return a.watchlist ? 1 : -1;
    }
    if (a.watchedDate && b.watchedDate && a.watchedDate !== b.watchedDate) {
      return b.watchedDate.localeCompare(a.watchedDate);
    }
    return (b.rating ?? 0) - (a.rating ?? 0);
  });

  // Assign initial customRank order by rating descending for logged films
  const loggedByRating = entries
    .filter((e) => !e.watchlist)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  loggedByRating.forEach((entry, idx) => {
    if (entry.customRank === null) {
      entry.customRank = idx + 1;
    }
  });

  return entries;
}

export interface ExportCsvOptions {
  /**
   * Which Letterboxd CSV file preset to use.
   * If 'match_imported' (default), uses `importedStructure` if present,
   * or 'watchlist' if all passed films are on the watchlist, otherwise 'diary'.
   */
  preset?: LetterboxdCsvPreset | 'match_imported';
  /**
   * Structure metadata captured when the profile's CSV was originally imported.
   */
  importedStructure?: ImportedCsvStructure;
  /**
   * If true, keeps the exact row order passed in `films` instead of sorting by Date.
   * Defaults to false (organizes rows chronologically by Date/Watched Date to match Letterboxd CSVs).
   */
  preserveCurrentOrder?: boolean;
}

function formatLetterboxdRating(
  rating: number | null,
  useFixedOneDecimal: boolean
): string {
  if (rating === null || Number.isNaN(rating)) return '';
  if (useFixedOneDecimal) {
    return rating.toFixed(1);
  }
  return Number.isInteger(rating) ? String(rating) : rating.toFixed(1);
}

function mapFilmToHeaderValue(
  film: FilmEntry,
  header: string,
  todayIso: string,
  useFixedOneDecimalRating: boolean,
  rowIndex: number
): string | number {
  const normalized = header.trim();
  const lower = normalized.toLowerCase();

  switch (lower) {
    case 'date':
      return film.loggedDate || film.watchedDate || todayIso;
    case 'name':
    case 'title':
      return film.title;
    case 'year':
    case 'release year':
      return film.year;
    case 'letterboxd uri':
    case 'uri':
      return (
        film.letterboxdUri ||
        `https://letterboxd.com/film/${film.slug || slugifyTitle(film.title, film.year)}/`
      );
    case 'rating':
      return formatLetterboxdRating(film.rating, useFixedOneDecimalRating);
    case 'rating10':
      return film.rating !== null ? Math.round(film.rating * 2) : '';
    case 'rewatch':
      // Letterboxd native CSVs use 'Yes' for rewatch and empty string '' when false
      return film.rewatch ? 'Yes' : '';
    case 'tags':
      return cleanExportTags(film.tags);
    case 'watched date':
    case 'watcheddate':
      return film.watchlist ? '' : film.watchedDate || film.loggedDate || '';
    case 'review':
    case 'notes':
      return cleanExportReview(film.notes);
    case 'directors':
    case 'director':
      return film.director || '';
    case 'position':
    case 'rank':
      return film.customRank ?? rowIndex + 1;
    case 'liked':
      return film.liked ? 'Yes' : '';
    default:
      return '';
  }
}

/**
 * Exports films to a CSV string that strictly matches the file structure, column headers,
 * value formatting, and row organization of a Letterboxd CSV file so it can be directly
 * imported back into Letterboxd without error.
 */
export function exportFilmsToCsv(
  films: FilmEntry[],
  options: ExportCsvOptions = {}
): string {
  const todayIso = new Date().toISOString().slice(0, 10);
  const {
    preset = 'match_imported',
    importedStructure,
    preserveCurrentOrder = false,
  } = options;

  const allAreWatchlist = films.length > 0 && films.every((f) => f.watchlist);

  // Resolve target preset & headers
  let resolvedPreset: LetterboxdCsvPreset = 'diary';
  let headers: string[] = [...LETTERBOXD_CSV_HEADERS.diary];
  let dateOrder: 'asc' | 'desc' = importedStructure?.dateOrder ?? 'desc';
  const useFixedOneDecimalRating =
    importedStructure?.useFixedOneDecimalRating ?? false;

  if (preset === 'match_imported') {
    if (allAreWatchlist) {
      resolvedPreset = 'watchlist';
      headers = [...LETTERBOXD_CSV_HEADERS.watchlist];
    } else if (importedStructure && importedStructure.headers.length > 0) {
      resolvedPreset = importedStructure.preset;
      headers = [...importedStructure.headers];
      dateOrder = importedStructure.dateOrder;
    } else {
      // Check if any logged film has a user review; if all standard diary columns, use diary.csv
      resolvedPreset = 'diary';
      headers = [...LETTERBOXD_CSV_HEADERS.diary];
    }
  } else if (preset === 'custom' && importedStructure?.headers.length) {
    resolvedPreset = 'custom';
    headers = [...importedStructure.headers];
  } else if (preset !== 'custom') {
    resolvedPreset = preset;
    headers = [...LETTERBOXD_CSV_HEADERS[preset]];
  }

  // Filter rows according to the Letterboxd file type so Watchlist items are never
  // accidentally mixed into Watched/Diary imports (which would mark them as watched on Letterboxd)
  let targetFilms: FilmEntry[];
  if (resolvedPreset === 'watchlist') {
    const wl = films.filter((f) => f.watchlist);
    targetFilms = wl.length > 0 ? wl : films;
  } else if (resolvedPreset === 'ratings') {
    targetFilms = films.filter((f) => !f.watchlist && f.rating !== null);
  } else {
    const logged = films.filter((f) => !f.watchlist);
    targetFilms = logged.length > 0 ? logged : films;
  }

  // Organize rows chronologically by Date / Watched Date matching Letterboxd's native CSV organization
  const organizedFilms = [...targetFilms];
  if (!preserveCurrentOrder) {
    organizedFilms.sort((a, b) => {
      const dateA =
        resolvedPreset === 'watchlist'
          ? a.loggedDate || a.watchedDate || ''
          : a.watchedDate || a.loggedDate || '';
      const dateB =
        resolvedPreset === 'watchlist'
          ? b.loggedDate || b.watchedDate || ''
          : b.watchedDate || b.loggedDate || '';

      if (dateA && dateB && dateA !== dateB) {
        return dateOrder === 'asc'
          ? dateA.localeCompare(dateB)
          : dateB.localeCompare(dateA);
      }
      if (dateA && !dateB) return -1;
      if (!dateA && dateB) return 1;
      return a.title.localeCompare(b.title);
    });
  }

  const dataRows = organizedFilms.map((film, idx) =>
    headers.map((header) =>
      mapFilmToHeaderValue(film, header, todayIso, useFixedOneDecimalRating, idx)
    )
  );

  return Papa.unparse({
    fields: headers,
    data: dataRows,
  });
}

export function getLetterboxdExportFilename(
  preset: LetterboxdCsvPreset | 'match_imported',
  importedStructure?: ImportedCsvStructure,
  allAreWatchlist = false
): string {
  if (preset === 'match_imported') {
    if (allAreWatchlist) return 'watchlist.csv';
    if (importedStructure?.filename) {
      return importedStructure.filename.endsWith('.csv')
        ? importedStructure.filename
        : `${importedStructure.filename}.csv`;
    }
    return 'diary.csv';
  }
  if (preset === 'custom' && importedStructure?.filename) {
    return importedStructure.filename;
  }
  return `${preset}.csv`;
}

