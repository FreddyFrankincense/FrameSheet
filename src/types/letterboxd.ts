export type TierGrade = 'S' | 'A' | 'B' | 'C' | 'D' | 'Unranked';

export interface FilmEntry {
  id: string;
  title: string;
  year: number;
  letterboxdUri: string;
  slug: string;
  rating: number | null; // 0.5 to 5.0
  watchedDate: string | null; // YYYY-MM-DD (null if on Watchlist and not yet watched)
  loggedDate: string | null; // YYYY-MM-DD (date logged or date added to Watchlist)
  rewatch: boolean;
  liked: boolean;
  watchlist: boolean; // Sourced from Letterboxd Watchlist (/watchlist/ or watchlist.csv)
  tags: string[];
  genres: string[];
  director: string;
  runtimeMinutes: number;
  country: string;
  customRank: number | null;
  tier: TierGrade;
  notes: string;
  posterUrl?: string;
}

export type LetterboxdCsvPreset =
  | 'diary'
  | 'reviews'
  | 'ratings'
  | 'watched'
  | 'watchlist'
  | 'custom';

export interface ImportedCsvStructure {
  preset: LetterboxdCsvPreset;
  headers: string[];
  filename: string;
  dateOrder: 'asc' | 'desc';
  useFixedOneDecimalRating: boolean;
}

export interface ProfileAccount {
  id: string;
  username: string;
  displayName: string;
  sourceType: 'external_scrape' | 'csv_import' | 'curated_profile';
  lastSyncedAt: string;
  profileUrl: string;
  bio?: string;
  films: FilmEntry[];
  baselineFilms?: FilmEntry[];
  importedCsvStructure?: ImportedCsvStructure;
  dismissedRecommendations?: string[]; // Slugs of films removed from consideration in Recommendations
}

export interface CatalogFilmMeta {
  title: string;
  year: number;
  slug: string;
  genres: string[];
  director: string;
  runtimeMinutes: number;
  country: string;
}

export interface ExternalScrapeResponse {
  username: string;
  displayName: string;
  profileUrl: string;
  bio: string;
  scrapedFrom: string[];
  liveReachable: boolean;
  notice?: string;
  films: FilmEntry[];
}
