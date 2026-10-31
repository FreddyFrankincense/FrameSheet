import Papa from 'papaparse';
import { FilmEntry, TierGrade } from '../types/letterboxd';
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
  Rewatch?: string;
  Tags?: string;
  'Watched Date'?: string;
  Review?: string;
  Notes?: string;
  Genres?: string;
  Director?: string;
  Rank?: string;
  Tier?: string;
  Liked?: string;
  Watchlist?: string;
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

/**
 * Parses one or more Letterboxd CSV files (diary.csv, ratings.csv, watched.csv, reviews.csv, watchlist.csv)
 * and merges them by film key (Title + Year). Uses watchlist.csv (or Watchlist column) as the source of truth
 * for the `watchlist` boolean flag.
 */
export function parseLetterboxdCsvFiles(csvContents: { filename: string; content: string }[]): FilmEntry[] {
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

      const meta = resolveFilmMetadata(title, Number.isNaN(yearRaw) ? undefined : yearRaw, slugFromUri);
      const key = `${meta.title.toLowerCase()}::${meta.year}`;

      const rating = parseStarString(row.Rating);
      const explicitWatchlistCol =
        (row.Watchlist || '').trim().toLowerCase() === 'yes' ||
        (row.Watchlist || '').trim().toLowerCase() === 'true';
      const isOnWatchlist = isWatchlistFile || explicitWatchlistCol;

      if (isOnWatchlist) {
        watchlistTruthKeys.add(key);
      }

      // In Letterboxd's watchlist.csv, 'Date' is the date the film was added to the watchlist, NOT a watched date
      const watchedDate = isWatchlistFile
        ? (row['Watched Date'] || '').trim() || null
        : (row['Watched Date'] || row.Date || '').trim() || null;
      const loggedDate = (row.Date || row['Watched Date'] || '').trim() || null;

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

      const notes = (row.Notes || row.Review || '').trim();
      const customRankRaw = row.Rank ? parseInt(row.Rank, 10) : null;
      const customRank = customRankRaw && !Number.isNaN(customRankRaw) ? customRankRaw : null;

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
        if (rewatch) existing.rewatch = true;
        if (liked) existing.liked = true;
        if (isOnWatchlist) existing.watchlist = true;
        if (rowTags.length > 0) {
          existing.tags = Array.from(new Set([...existing.tags, ...rowTags]));
        }
        if (notes && !existing.notes) {
          existing.notes = notes;
        }
        if (uri && !existing.letterboxdUri.includes('boxd.it')) {
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
          director: (row.Director || '').trim() || meta.director,
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

export function exportFilmsToCsv(films: FilmEntry[]): string {
  const rows = films.map((f) => ({
    Rank: f.customRank ?? '',
    Tier: f.tier,
    Name: f.title,
    Year: f.year,
    Rating: f.rating ?? '',
    'Watched Date': f.watchedDate ?? '',
    Watchlist: f.watchlist ? 'Yes' : 'No',
    Rewatch: f.rewatch ? 'Yes' : 'No',
    Liked: f.liked ? 'Yes' : 'No',
    Genres: f.genres.join(', '),
    Director: f.director,
    Runtime: f.runtimeMinutes,
    Tags: f.tags.join(', '),
    Notes: f.notes,
    'Letterboxd URI': f.letterboxdUri,
  }));
  return Papa.unparse(rows);
}
