import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Plus,
  Search,
} from 'lucide-react';
import { FilmEntry, ProfileAccount } from '../types/letterboxd';

interface ComparisonViewProps {
  profiles: ProfileAccount[];
  primaryProfileId: string;
  secondaryProfileId: string;
  onSelectPrimary: (id: string) => void;
  onSelectSecondary: (id: string) => void;
  onOpenImport: () => void;
}

type CompareFilterTab =
  | 'all_shared'
  | 'similar'
  | 'dissimilar'
  | 'shared_favorites'
  | 'only_a'
  | 'only_b';

type SharedSortOrder = 'delta_desc' | 'delta_asc' | 'combined_desc' | 'year_desc';

interface SharedFilmPair {
  key: string;
  title: string;
  year: number;
  director: string;
  genres: string[];
  letterboxdUri: string;
  filmA: FilmEntry;
  filmB: FilmEntry;
  ratingA: number;
  ratingB: number;
  delta: number; // ratingA - ratingB
  absDelta: number;
}

export const ComparisonView: React.FC<ComparisonViewProps> = ({
  profiles,
  primaryProfileId,
  secondaryProfileId,
  onSelectPrimary,
  onSelectSecondary,
  onOpenImport,
}) => {
  const [activeTab, setActiveTab] = useState<CompareFilterTab>('all_shared');
  const [selectedGenreFilter, setSelectedGenreFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sharedSort, setSharedSort] = useState<SharedSortOrder>('delta_desc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    primaryProfileId,
    secondaryProfileId,
    activeTab,
    selectedGenreFilter,
    searchQuery,
    sharedSort,
  ]);

  const profileA = useMemo(
    () => profiles.find((p) => p.id === primaryProfileId) || profiles[0],
    [profiles, primaryProfileId]
  );

  const profileB = useMemo(
    () =>
      profiles.find((p) => p.id === secondaryProfileId) ||
      profiles.find((p) => p.id !== profileA?.id) ||
      profiles[0],
    [profiles, secondaryProfileId, profileA]
  );

  const comparison = useMemo(() => {
    if (!profileA || !profileB) return null;

    const mapA = new Map<string, FilmEntry>();
    profileA.films.forEach((f) => {
      mapA.set(`${f.title.toLowerCase()}::${f.year}`, f);
    });

    const mapB = new Map<string, FilmEntry>();
    profileB.films.forEach((f) => {
      mapB.set(`${f.title.toLowerCase()}::${f.year}`, f);
    });

    const shared: SharedFilmPair[] = [];
    const onlyA: FilmEntry[] = [];
    const onlyB: FilmEntry[] = [];

    mapA.forEach((filmA, key) => {
      const filmB = mapB.get(key);
      if (filmB) {
        const rA = filmA.rating ?? 3.5;
        const rB = filmB.rating ?? 3.5;
        const delta = rA - rB;
        const mergedGenres = Array.from(new Set([...filmA.genres, ...filmB.genres]));
        shared.push({
          key,
          title: filmA.title,
          year: filmA.year,
          director: filmA.director,
          genres: mergedGenres,
          letterboxdUri: filmA.letterboxdUri,
          filmA,
          filmB,
          ratingA: rA,
          ratingB: rB,
          delta,
          absDelta: Math.abs(delta),
        });
      } else {
        onlyA.push(filmA);
      }
    });

    mapB.forEach((filmB, key) => {
      if (!mapA.has(key)) {
        onlyB.push(filmB);
      }
    });

    const totalUniqueCombined = shared.length + onlyA.length + onlyB.length;
    const jaccardPct =
      totalUniqueCombined > 0 ? (shared.length / totalUniqueCombined) * 100 : 0;

    // Similar (absDelta <= 0.5) vs Dissimilar (absDelta >= 1.0)
    const similarPairs = shared.filter((p) => p.absDelta <= 0.5);
    const dissimilarPairs = shared.filter((p) => p.absDelta >= 1.0);
    const sharedFavorites = shared.filter((p) => p.ratingA >= 4.0 && p.ratingB >= 4.0);

    const meanAbsDiff =
      shared.length > 0
        ? shared.reduce((acc, p) => acc + p.absDelta, 0) / shared.length
        : 0;

    const compatibilityScore = Math.max(
      0,
      Math.min(100, Math.round((1 - meanAbsDiff / 2.5) * 100))
    );

    const genreStatsMap = new Map<
      string,
      {
        genre: string;
        sharedCount: number;
        similarCount: number;
        dissimilarCount: number;
        onlyACount: number;
        onlyBCount: number;
        sumA: number;
        sumB: number;
        sumAbsDelta: number;
      }
    >();

    const ensureGenre = (g: string) => {
      let item = genreStatsMap.get(g);
      if (!item) {
        item = {
          genre: g,
          sharedCount: 0,
          similarCount: 0,
          dissimilarCount: 0,
          onlyACount: 0,
          onlyBCount: 0,
          sumA: 0,
          sumB: 0,
          sumAbsDelta: 0,
        };
        genreStatsMap.set(g, item);
      }
      return item;
    };

    shared.forEach((pair) => {
      pair.genres.forEach((g) => {
        const st = ensureGenre(g);
        st.sharedCount += 1;
        if (pair.absDelta <= 0.5) st.similarCount += 1;
        if (pair.absDelta >= 1.0) st.dissimilarCount += 1;
        st.sumA += pair.ratingA;
        st.sumB += pair.ratingB;
        st.sumAbsDelta += pair.absDelta;
      });
    });

    onlyA.forEach((f) => {
      f.genres.forEach((g) => {
        const st = ensureGenre(g);
        st.onlyACount += 1;
      });
    });

    onlyB.forEach((f) => {
      f.genres.forEach((g) => {
        const st = ensureGenre(g);
        st.onlyBCount += 1;
      });
    });

    const genreMatrix = Array.from(genreStatsMap.values())
      .map((st) => ({
        ...st,
        avgA: st.sharedCount > 0 ? st.sumA / st.sharedCount : 0,
        avgB: st.sharedCount > 0 ? st.sumB / st.sharedCount : 0,
        meanDiff: st.sharedCount > 0 ? (st.sumA - st.sumB) / st.sharedCount : 0,
        meanAbsDelta: st.sharedCount > 0 ? st.sumAbsDelta / st.sharedCount : 0,
      }))
      .sort(
        (a, b) =>
          b.sharedCount - a.sharedCount ||
          b.onlyACount + b.onlyBCount - (a.onlyACount + a.onlyBCount)
      );

    const maxGenreShared = Math.max(1, ...genreMatrix.map((g) => g.sharedCount));

    return {
      shared,
      onlyA: onlyA.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)),
      onlyB: onlyB.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)),
      totalUniqueCombined,
      jaccardPct,
      similarPairs,
      dissimilarPairs,
      sharedFavorites,
      meanAbsDiff,
      compatibilityScore,
      genreMatrix,
      maxGenreShared,
    };
  }, [profileA, profileB]);

  if (!comparison || !profileA || !profileB) {
    return null;
  }

  const filteredSharedList = useMemo(() => {
    let base: SharedFilmPair[] = comparison.shared;
    if (activeTab === 'similar') {
      base = comparison.similarPairs;
    } else if (activeTab === 'dissimilar') {
      base = comparison.dissimilarPairs;
    } else if (activeTab === 'shared_favorites') {
      base = comparison.sharedFavorites;
    }

    if (selectedGenreFilter !== 'ALL') {
      base = base.filter((p) => p.genres.includes(selectedGenreFilter));
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      base = base.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.director.toLowerCase().includes(q) ||
          p.genres.some((g) => g.toLowerCase().includes(q))
      );
    }

    const sorted = [...base];
    sorted.sort((a, b) => {
      if (sharedSort === 'delta_desc') return b.absDelta - a.absDelta;
      if (sharedSort === 'delta_asc') return a.absDelta - b.absDelta;
      if (sharedSort === 'combined_desc') return b.ratingA + b.ratingB - (a.ratingA + a.ratingB);
      return b.year - a.year;
    });
    return sorted;
  }, [comparison, activeTab, selectedGenreFilter, searchQuery, sharedSort]);

  const filteredExclusiveList = useMemo(() => {
    const source = activeTab === 'only_a' ? comparison.onlyA : comparison.onlyB;
    const q = searchQuery.trim().toLowerCase();
    return source.filter((f) => {
      if (selectedGenreFilter !== 'ALL' && !f.genres.includes(selectedGenreFilter)) {
        return false;
      }
      if (q) {
        return (
          f.title.toLowerCase().includes(q) ||
          f.director.toLowerCase().includes(q) ||
          f.genres.some((g) => g.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [comparison, activeTab, selectedGenreFilter, searchQuery]);

  const isExclusiveMode = activeTab === 'only_a' || activeTab === 'only_b';
  const totalRows = isExclusiveMode
    ? filteredExclusiveList.length
    : filteredSharedList.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalRows);

  const paginatedShared = filteredSharedList.slice(startIndex, endIndex);
  const paginatedExclusive = filteredExclusiveList.slice(startIndex, endIndex);

  const topOverlapGenre = comparison.genreMatrix[0];
  const mostDivergentGenre = [...comparison.genreMatrix]
    .filter((g) => g.sharedCount >= 2)
    .sort((a, b) => b.meanAbsDelta - a.meanAbsDelta)[0];

  return (
    <div className="space-y-6">
      {/* Profile Selector Control Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">
              Primary Account (Profile A)
            </label>
            <select
              value={profileA.id}
              onChange={(e) => onSelectPrimary(e.target.value)}
              className="px-3 py-1.5 text-xs font-medium bg-slate-950 border border-slate-800 rounded-md text-amber-400 focus:outline-none focus:border-amber-500"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  @{p.username} ({p.displayName} · {p.films.length.toLocaleString()} films)
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => {
              onSelectPrimary(profileB.id);
              onSelectSecondary(profileA.id);
            }}
            title="Swap Profile A and Profile B"
            className="mt-5 p-2 bg-slate-950 border border-slate-800 rounded-md text-slate-400 hover:text-slate-100 hover:border-slate-700 transition-colors"
          >
            <ArrowLeftRight className="w-4 h-4" />
          </button>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">
              Comparison Account (Profile B)
            </label>
            <select
              value={profileB.id}
              onChange={(e) => onSelectSecondary(e.target.value)}
              className="px-3 py-1.5 text-xs font-medium bg-slate-950 border border-slate-800 rounded-md text-sky-400 focus:outline-none focus:border-sky-500"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  @{p.username} ({p.displayName} · {p.films.length.toLocaleString()} films)
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenImport}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-slate-950 border border-slate-800 text-slate-200 rounded-md hover:border-slate-700 hover:bg-slate-800/60 transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-3.5 h-3.5 text-amber-400" />
          Add Another Letterboxd Profile to Compare
        </button>
      </div>

      {/* Overlap & Compatibility KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-400 mb-1">Shared Movies Logged</div>
          <div className="text-2xl font-display font-bold font-mono tabular-nums text-slate-100">
            {comparison.shared.length.toLocaleString()}{' '}
            <span className="text-sm font-normal text-slate-400">
              ({comparison.jaccardPct.toFixed(1)}% overlap)
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
            {comparison.onlyA.length.toLocaleString()} unique to @{profileA.username} ·{' '}
            {comparison.onlyB.length.toLocaleString()} unique to @{profileB.username}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-400 mb-1">Similar vs. Dissimilar Split</div>
          <div className="text-2xl font-display font-bold font-mono tabular-nums text-emerald-400">
            {comparison.similarPairs.length.toLocaleString()} similar{' '}
            <span className="text-slate-500 font-normal">/</span>{' '}
            <span className="text-rose-400">
              {comparison.dissimilarPairs.length.toLocaleString()} divergent
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
            Similar: Δ ≤ 0.5★ · Divergent: Δ ≥ 1.0★
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-400 mb-1">Taste Agreement Index</div>
          <div className="text-2xl font-display font-bold font-mono tabular-nums text-amber-400">
            {comparison.compatibilityScore}%
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
            Mean rating gap: ±{comparison.meanAbsDiff.toFixed(2)} ★ across shared films
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-400 mb-1">Highest Genre Overlap</div>
          <div className="text-2xl font-display font-bold text-slate-100 truncate">
            {topOverlapGenre ? topOverlapGenre.genre : '—'}
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
            {topOverlapGenre
              ? `${topOverlapGenre.sharedCount.toLocaleString()} shared films`
              : 'No shared films'}
            {mostDivergentGenre
              ? ` · Most split: ${mostDivergentGenre.genre} (±${mostDivergentGenre.meanAbsDelta.toFixed(
                  2
                )}★)`
              : ''}
          </div>
        </div>
      </div>

      {/* Genre Overlap & Rating Divergence Matrix */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <h3 className="text-sm font-display font-semibold text-slate-100">
            Genre Overlap Frequency & Rating Divergence Matrix
          </h3>
          <span className="text-xs font-mono tabular-nums text-slate-400">
            Click any genre row to filter the movie comparison ledger below
          </span>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Ranks which genres two accounts share most frequently, how many films in each genre have similar vs. dissimilar ratings, and which account rates the genre higher.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] text-slate-400">
                <th className="py-2 pr-3">Genre</th>
                <th className="py-2 px-3 text-right">Shared Films</th>
                <th className="py-2 px-3 w-44">Overlap Frequency</th>
                <th className="py-2 px-3 text-right">Similar (≤0.5★)</th>
                <th className="py-2 px-3 text-right">Dissimilar (≥1.0★)</th>
                <th className="py-2 px-3 text-right text-amber-400">@{profileA.username} Avg</th>
                <th className="py-2 px-3 text-right text-sky-400">@{profileB.username} Avg</th>
                <th className="py-2 pl-3 text-right">Avg Gap (|Δ|)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {comparison.genreMatrix.map((g) => {
                const isSelected = selectedGenreFilter === g.genre;
                const barWidth = Math.round((g.sharedCount / comparison.maxGenreShared) * 100);
                return (
                  <tr
                    key={g.genre}
                    onClick={() =>
                      setSelectedGenreFilter((prev) => (prev === g.genre ? 'ALL' : g.genre))
                    }
                    className={`h-9 cursor-pointer transition-colors ${
                      isSelected ? 'bg-amber-500/15' : 'hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="py-1.5 pr-3 font-medium text-slate-100">{g.genre}</td>
                    <td className="py-1.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-200">
                      {g.sharedCount.toLocaleString()}
                    </td>
                    <td className="py-1.5 px-3">
                      <div className="w-full h-2 bg-slate-950 rounded overflow-hidden flex">
                        <div
                          style={{ width: `${barWidth}%` }}
                          className="h-full bg-amber-500/80 rounded"
                        />
                      </div>
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono tabular-nums text-emerald-400">
                      {g.similarCount.toLocaleString()}
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono tabular-nums text-rose-400">
                      {g.dissimilarCount.toLocaleString()}
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono tabular-nums text-amber-300">
                      {g.sharedCount > 0 ? `${g.avgA.toFixed(2)} ★` : '—'}
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono tabular-nums text-sky-300">
                      {g.sharedCount > 0 ? `${g.avgB.toFixed(2)} ★` : '—'}
                    </td>
                    <td className="py-1.5 pl-3 text-right font-mono tabular-nums text-slate-300">
                      {g.sharedCount > 0 ? `±${g.meanAbsDelta.toFixed(2)} ★` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginated Movie-by-Movie Contrast & Blindspot Explorer */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden flex flex-col">
        <div className="p-3.5 border-b border-slate-800 space-y-3">
          {/* Interactive Segmented Filter Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => setActiveTab('all_shared')}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'all_shared'
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All Shared ({comparison.shared.length.toLocaleString()})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('similar')}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'similar'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Similar Ratings ({comparison.similarPairs.length.toLocaleString()})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('dissimilar')}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'dissimilar'
                    ? 'bg-rose-500/20 text-rose-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Biggest Disagreements ({comparison.dissimilarPairs.length.toLocaleString()})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('shared_favorites')}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'shared_favorites'
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Shared Favorites ({comparison.sharedFavorites.length.toLocaleString()})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('only_a')}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'only_a'
                    ? 'bg-slate-800 text-amber-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Only @{profileA.username} ({comparison.onlyA.length.toLocaleString()})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('only_b')}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'only_b'
                    ? 'bg-slate-800 text-sky-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Only @{profileB.username} ({comparison.onlyB.length.toLocaleString()})
              </button>
            </div>

            {/* Search & Sort Controls for Comparison Table */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-56">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search compared movies..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-md text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              {!isExclusiveMode && (
                <select
                  value={sharedSort}
                  onChange={(e) => setSharedSort(e.target.value as SharedSortOrder)}
                  aria-label="Sort shared films"
                  className="px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-md text-slate-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="delta_desc">Sort: Largest Rating Gap</option>
                  <option value="delta_asc">Sort: Closest Agreement</option>
                  <option value="combined_desc">Sort: Highest Combined ★</option>
                  <option value="year_desc">Sort: Release Year</option>
                </select>
              )}

              {selectedGenreFilter !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setSelectedGenreFilter('ALL')}
                  className="px-2.5 py-1.5 text-xs bg-amber-500/15 border border-amber-500/40 text-amber-300 rounded-md hover:bg-amber-500/25"
                >
                  Genre: {selectedGenreFilter} ×
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Bounded Scrollable Table Viewport */}
        {!isExclusiveMode ? (
          <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-slate-950">
                <tr className="border-b border-slate-800 text-[11px] text-slate-400">
                  <th className="py-2.5 px-4">Film Title</th>
                  <th className="py-2.5 px-3 text-right">Year</th>
                  <th className="py-2.5 px-3">Genres</th>
                  <th className="py-2.5 px-3 text-right text-amber-400">
                    @{profileA.username}
                  </th>
                  <th className="py-2.5 px-3 text-right text-sky-400">
                    @{profileB.username}
                  </th>
                  <th className="py-2.5 px-3 text-right">Rating Delta</th>
                  <th className="py-2.5 px-4">Director</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {paginatedShared.map((pair) => (
                  <tr key={pair.key} className="h-9 hover:bg-slate-800/40">
                    <td className="px-4 py-1.5 font-medium text-slate-100">
                      <div className="flex items-center gap-2">
                        <span>{pair.title}</span>
                        <a
                          href={pair.letterboxdUri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-500 hover:text-amber-400"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-slate-400">
                      {pair.year}
                    </td>
                    <td className="px-3 py-1.5 text-slate-300">
                      {pair.genres.join(' · ')}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums font-semibold text-amber-400">
                      {pair.ratingA.toFixed(1)} ★
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums font-semibold text-sky-400">
                      {pair.ratingB.toFixed(1)} ★
                    </td>
                    <td
                      className={`px-3 py-1.5 text-right font-mono tabular-nums font-medium ${
                        pair.absDelta === 0
                          ? 'text-emerald-400'
                          : pair.absDelta <= 0.5
                          ? 'text-slate-300'
                          : 'text-rose-400'
                      }`}
                    >
                      {pair.delta === 0
                        ? 'Exact Match (0.0★)'
                        : pair.delta > 0
                        ? `+${pair.delta.toFixed(1)}★ (@${profileA.username})`
                        : `${pair.delta.toFixed(1)}★ (@${profileB.username})`}
                    </td>
                    <td className="px-4 py-1.5 text-slate-400 truncate max-w-xs">
                      {pair.director}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-slate-950">
                <tr className="border-b border-slate-800 text-[11px] text-slate-400">
                  <th className="py-2.5 px-4">Film Title</th>
                  <th className="py-2.5 px-3 text-right">Year</th>
                  <th className="py-2.5 px-3">Director</th>
                  <th className="py-2.5 px-3">Genres</th>
                  <th className="py-2.5 px-3 text-right">
                    Logged Rating by @
                    {activeTab === 'only_a' ? profileA.username : profileB.username}
                  </th>
                  <th className="py-2.5 px-4">Watched Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {paginatedExclusive.map((film) => (
                  <tr key={film.id} className="h-9 hover:bg-slate-800/40">
                    <td className="px-4 py-1.5 font-medium text-slate-100">
                      {film.title}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-slate-400">
                      {film.year}
                    </td>
                    <td className="px-3 py-1.5 text-slate-300">{film.director}</td>
                    <td className="px-3 py-1.5 text-slate-300">
                      {film.genres.join(' · ')}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-amber-400 font-semibold">
                      {film.rating !== null ? `${film.rating.toFixed(1)} ★` : 'Unrated'}
                    </td>
                    <td className="px-4 py-1.5 font-mono tabular-nums text-slate-400">
                      {film.watchedDate || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Comparison Table Pagination Footer */}
        <div className="px-4 py-2.5 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3 font-mono tabular-nums text-slate-400">
            <span>
              Rows{' '}
              <strong className="text-slate-200">
                {totalRows > 0 ? (startIndex + 1).toLocaleString() : 0}–
                {endIndex.toLocaleString()}
              </strong>{' '}
              of <strong className="text-slate-200">{totalRows.toLocaleString()}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <label className="inline-flex items-center gap-1.5 font-sans">
              <span>Per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 font-mono tabular-nums text-slate-200"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
          </div>

          <div className="flex items-center gap-1.5 font-mono tabular-nums">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage(1)}
              className="px-2 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300 disabled:opacity-40"
            >
              First
            </button>
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-1 rounded bg-slate-900 border border-slate-800 text-slate-300 disabled:opacity-40"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 text-slate-300">
              Page <strong className="text-amber-400">{safePage}</strong> of{' '}
              <strong>{totalPages.toLocaleString()}</strong>
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="p-1 rounded bg-slate-900 border border-slate-800 text-slate-300 disabled:opacity-40"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage(totalPages)}
              className="px-2 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300 disabled:opacity-40"
            >
              Last
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
