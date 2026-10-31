import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Plus,
  Search,
  Trophy,
} from 'lucide-react';
import { inferTierFromRating, resolveFilmMetadata } from '../data/filmCatalog';
import {
  AwardOutcomeStatus,
  ExternalCanonicalList,
  ExternalListCategory,
  ExternalListEntry,
  INDUSTRY_AND_CRITIC_LISTS,
} from '../data/industryLists';
import { FilmEntry, ProfileAccount } from '../types/letterboxd';

interface ExternalListsViewProps {
  profile: ProfileAccount;
  onUpdateFilms: (films: FilmEntry[]) => void;
}

type CategoryFilter = 'all' | ExternalListCategory;
type EntryFilterTab = 'all' | 'watched' | 'unwatched' | 'winners' | 'nominees' | 'divergent';
type ListSortOrder = 'list_rank' | 'user_rating_desc' | 'user_rating_asc' | 'delta_desc';

const RATING_STEPS = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];

export const ExternalListsView: React.FC<ExternalListsViewProps> = ({
  profile,
  onUpdateFilms,
}) => {
  const [customLists, setCustomLists] = useState<ExternalCanonicalList[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [selectedListId, setSelectedListId] = useState<string>(
    INDUSTRY_AND_CRITIC_LISTS[0].id
  );
  const [entryTab, setEntryTab] = useState<EntryFilterTab>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<ListSortOrder>('list_rank');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Custom list creator modal/drawer state
  const [showCustomBuilder, setShowCustomBuilder] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListOrg, setNewListOrg] = useState('');
  const [newListCategory, setNewListCategory] = useState<ExternalListCategory>('periodical');
  const [newListRawLines, setNewListRawLines] = useState('');

  const allLists = useMemo(
    () => [...INDUSTRY_AND_CRITIC_LISTS, ...customLists],
    [customLists]
  );

  const visibleLists = useMemo(() => {
    if (categoryFilter === 'all') return allLists;
    return allLists.filter((l) => l.category === categoryFilter);
  }, [allLists, categoryFilter]);

  const activeList = useMemo(
    () => allLists.find((l) => l.id === selectedListId) || allLists[0],
    [allLists, selectedListId]
  );

  useEffect(() => {
    setCurrentPage(1);
    setEntryTab('all');
  }, [selectedListId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [entryTab, searchQuery, sortOrder]);

  // Build fast lookup map of the active profile's logged films by normalized title + year (and title fallback)
  const profileFilmLookup = useMemo(() => {
    const exactMap = new Map<string, FilmEntry>();
    const titleOnlyMap = new Map<string, FilmEntry>();
    profile.films.forEach((f) => {
      const normTitle = f.title.trim().toLowerCase();
      exactMap.set(`${normTitle}::${f.year}`, f);
      if (!titleOnlyMap.has(normTitle)) {
        titleOnlyMap.set(normTitle, f);
      }
    });
    return { exactMap, titleOnlyMap };
  }, [profile.films]);

  const profileOverallMean = useMemo(() => {
    const rated = profile.films.filter((f) => f.rating !== null);
    if (rated.length === 0) return 0;
    return rated.reduce((acc, f) => acc + (f.rating ?? 0), 0) / rated.length;
  }, [profile.films]);

  // Compute summary stats for every list so the user can compare completion across Oscars, BAFTAs, Sight & Sound, Empire, EW at a glance
  const listSummaries = useMemo(() => {
    return allLists.map((list) => {
      let watchedCount = 0;
      let winnersTotal = 0;
      let winnersWatched = 0;
      let nomineesTotal = 0;
      let nomineesWatched = 0;
      let userRatingSum = 0;
      let userRatedCount = 0;

      list.entries.forEach((entry) => {
        const key = `${entry.title.trim().toLowerCase()}::${entry.year}`;
        const matched =
          profileFilmLookup.exactMap.get(key) ||
          profileFilmLookup.titleOnlyMap.get(entry.title.trim().toLowerCase());

        if (entry.status === 'Winner') winnersTotal += 1;
        if (entry.status === 'Nominee') nomineesTotal += 1;

        if (matched && !matched.watchlist) {
          watchedCount += 1;
          if (entry.status === 'Winner') winnersWatched += 1;
          if (entry.status === 'Nominee') nomineesWatched += 1;
          if (matched.rating !== null) {
            userRatingSum += matched.rating;
            userRatedCount += 1;
          }
        }
      });

      const totalEntries = list.entries.length;
      const completionPct =
        totalEntries > 0 ? Math.round((watchedCount / totalEntries) * 100) : 0;
      const userMean = userRatedCount > 0 ? userRatingSum / userRatedCount : 0;

      return {
        list,
        totalEntries,
        watchedCount,
        unwatchedCount: totalEntries - watchedCount,
        completionPct,
        winnersTotal,
        winnersWatched,
        nomineesTotal,
        nomineesWatched,
        userMean,
      };
    });
  }, [allLists, profileFilmLookup]);

  // Enrich active list entries with user's logged FilmEntry (if watched) and alignment delta
  const activeListEvaluated = useMemo(() => {
    if (!activeList) return null;

    const rows = activeList.entries.map((entry) => {
      const key = `${entry.title.trim().toLowerCase()}::${entry.year}`;
      const userFilm =
        profileFilmLookup.exactMap.get(key) ||
        profileFilmLookup.titleOnlyMap.get(entry.title.trim().toLowerCase()) ||
        null;

      const watched = Boolean(userFilm && !userFilm.watchlist);
      const onWatchlist = Boolean(userFilm && userFilm.watchlist);
      const userRating = watched ? userFilm?.rating ?? null : null;
      const delta =
        userRating !== null ? userRating - entry.consensusRating : null;
      const absDelta = delta !== null ? Math.abs(delta) : 0;

      return {
        entry,
        watched,
        onWatchlist,
        userFilm,
        userRating,
        delta,
        absDelta,
      };
    });

    const summary = listSummaries.find((s) => s.list.id === activeList.id)!;
    const divergentRows = rows.filter((r) => r.watched && r.absDelta >= 0.7);
    const consensusAvg =
      activeList.entries.reduce((acc, e) => acc + e.consensusRating, 0) /
      Math.max(1, activeList.entries.length);

    return {
      rows,
      summary,
      divergentCount: divergentRows.length,
      consensusAvg,
    };
  }, [activeList, profileFilmLookup, listSummaries]);

  const filteredAndSortedRows = useMemo(() => {
    if (!activeListEvaluated) return [];

    let list = activeListEvaluated.rows.filter((r) => {
      if (entryTab === 'watched' && !r.watched) return false;
      if (entryTab === 'unwatched' && r.watched) return false;
      if (entryTab === 'winners' && r.entry.status !== 'Winner') return false;
      if (entryTab === 'nominees' && r.entry.status !== 'Nominee') return false;
      if (entryTab === 'divergent' && (!r.watched || r.absDelta < 0.7)) return false;

      const q = searchQuery.trim().toLowerCase();
      if (q) {
        const matchTitle = r.entry.title.toLowerCase().includes(q);
        const matchDir = r.entry.director.toLowerCase().includes(q);
        const matchCeremony = r.entry.ceremonyOrIssue.toLowerCase().includes(q);
        const matchAccolade = r.entry.accoladeDetail.toLowerCase().includes(q);
        if (!matchTitle && !matchDir && !matchCeremony && !matchAccolade) {
          return false;
        }
      }
      return true;
    });

    list = [...list].sort((a, b) => {
      if (sortOrder === 'list_rank') {
        return a.entry.rank - b.entry.rank;
      }
      if (sortOrder === 'user_rating_desc') {
        return (b.userRating ?? -1) - (a.userRating ?? -1);
      }
      if (sortOrder === 'user_rating_asc') {
        return (a.userRating ?? 99) - (b.userRating ?? 99);
      }
      return b.absDelta - a.absDelta;
    });

    return list;
  }, [activeListEvaluated, entryTab, searchQuery, sortOrder]);

  // Quick-log or update rating directly from the external list comparison table
  const handleQuickRateListFilm = (entry: ExternalListEntry, ratingValue: string) => {
    const parsedRating = parseFloat(ratingValue);
    const validRating = !Number.isNaN(parsedRating) ? parsedRating : null;

    const normTitle = entry.title.trim().toLowerCase();
    const existing =
      profileFilmLookup.exactMap.get(`${normTitle}::${entry.year}`) ||
      profileFilmLookup.titleOnlyMap.get(normTitle);

    if (existing) {
      const updated = profile.films.map((f) =>
        f.id === existing.id
          ? {
              ...f,
              watchlist: false,
              watchedDate: f.watchedDate || new Date().toISOString().slice(0, 10),
              rating: validRating,
              tier: inferTierFromRating(validRating),
            }
          : f
      );
      onUpdateFilms(updated);
    } else if (validRating !== null) {
      const meta = resolveFilmMetadata(entry.title, entry.year);
      const today = new Date().toISOString().slice(0, 10);
      const newEntry: FilmEntry = {
        id: `${meta.slug}-${Date.now()}`,
        title: entry.title,
        year: entry.year,
        letterboxdUri: `https://letterboxd.com/film/${meta.slug}/`,
        slug: meta.slug,
        rating: validRating,
        watchedDate: today,
        loggedDate: today,
        rewatch: false,
        liked: validRating >= 4.0,
        watchlist: false,
        tags: [activeList.shortName.toLowerCase().replace(/[^a-z0-9]+/g, '-')],
        genres: entry.genres.length > 0 ? entry.genres : meta.genres,
        director: entry.director || meta.director,
        runtimeMinutes: meta.runtimeMinutes,
        country: meta.country,
        customRank: profile.films.length + 1,
        tier: inferTierFromRating(validRating),
        notes: `${entry.ceremonyOrIssue} — ${entry.accoladeDetail}`,
      };
      onUpdateFilms([newEntry, ...profile.films]);
    }
  };

  const handleCreateCustomList = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim() || !newListRawLines.trim()) return;

    const lines = newListRawLines
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    const parsedEntries: ExternalListEntry[] = lines.map((line, idx) => {
      // Matches patterns like "1. Mulholland Drive (2001) - Winner" or "Parasite (2019)"
      const cleaned = line.replace(/^\d+[.)]\s*/, '');
      const yearMatch = cleaned.match(/\((\d{4})\)/);
      const year = yearMatch ? parseInt(yearMatch[1], 10) : 2024;
      const titlePart = cleaned.split(/\(\d{4}\)/)[0]?.trim() || cleaned;
      const afterYear = cleaned.split(/\(\d{4}\)/)[1] || '';
      const isWinner = /winner|won|#1\b/i.test(afterYear);
      const isNominee = /nominee|nominated/i.test(afterYear);
      const status: AwardOutcomeStatus = isWinner
        ? 'Winner'
        : isNominee
        ? 'Nominee'
        : 'Ranked';

      const meta = resolveFilmMetadata(titlePart, year);
      return {
        rank: idx + 1,
        title: meta.title,
        year: meta.year,
        director: meta.director,
        genres: meta.genres,
        status,
        ceremonyOrIssue: newListOrg.trim() || 'Custom Ballot',
        accoladeDetail:
          afterYear.replace(/^[\s\-–·:]+/, '').trim() || `Ranked #${idx + 1}`,
        consensusRating: 4.2,
      };
    });

    if (parsedEntries.length === 0) return;

    const newList: ExternalCanonicalList = {
      id: `custom-list-${Date.now()}`,
      title: newListName.trim(),
      shortName: newListName.trim(),
      organization: newListOrg.trim() || 'Custom Editorial List',
      category: newListCategory,
      description: `Custom imported list (${parsedEntries.length} films).`,
      hasWinnerNomineeSplit: parsedEntries.some(
        (e) => e.status === 'Winner' || e.status === 'Nominee'
      ),
      entries: parsedEntries,
    };

    setCustomLists((prev) => [...prev, newList]);
    setSelectedListId(newList.id);
    setNewListName('');
    setNewListOrg('');
    setNewListRawLines('');
    setShowCustomBuilder(false);
  };

  if (!activeListEvaluated) return null;

  const totalRows = filteredAndSortedRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalRows);
  const paginatedRows = filteredAndSortedRows.slice(startIndex, endIndex);

  const { summary } = activeListEvaluated;
  const biasVsProfile =
    summary.userMean > 0 && profileOverallMean > 0
      ? summary.userMean - profileOverallMean
      : 0;

  return (
    <div className="space-y-6">
      {/* Top Category Filter & Custom List Action Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => setCategoryFilter('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              categoryFilter === 'all'
                ? 'bg-slate-800 text-slate-100'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All Lists ({allLists.length})
          </button>
          <button
            type="button"
            onClick={() => setCategoryFilter('awards')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              categoryFilter === 'awards'
                ? 'bg-amber-500/20 text-amber-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Major Awards (Oscars · BAFTA · Globes · Guilds)
          </button>
          <button
            type="button"
            onClick={() => setCategoryFilter('critics_poll')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              categoryFilter === 'critics_poll'
                ? 'bg-emerald-500/20 text-emerald-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Sight & Sound / Critics Polls
          </button>
          <button
            type="button"
            onClick={() => setCategoryFilter('periodical')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              categoryFilter === 'periodical'
                ? 'bg-sky-500/20 text-sky-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Periodicals (Empire · Entertainment Weekly)
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowCustomBuilder((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-950 border border-slate-800 text-slate-200 rounded-md hover:border-slate-700 transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-3.5 h-3.5 text-amber-400" />
          Add Custom Awards / Periodical List
        </button>
      </div>

      {/* Optional Custom List / Ballot Creator Drawer */}
      {showCustomBuilder && (
        <form
          onSubmit={handleCreateCustomList}
          className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-display font-semibold text-slate-100">
              Create Custom Non-Letterboxd Awards Ballot or Periodical Ranking
            </h4>
            <button
              type="button"
              onClick={() => setShowCustomBuilder(false)}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">List Title</label>
              <input
                type="text"
                required
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                placeholder="e.g. Cannes Palme d'Or Winners"
                className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-md text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Organization / Publication
              </label>
              <input
                type="text"
                value={newListOrg}
                onChange={(e) => setNewListOrg(e.target.value)}
                placeholder="e.g. Festival de Cannes / IndieWire"
                className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-md text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Category</label>
              <select
                value={newListCategory}
                onChange={(e) =>
                  setNewListCategory(e.target.value as ExternalListCategory)
                }
                className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-md text-slate-100"
              >
                <option value="awards">Major Awards (Wins & Nominations)</option>
                <option value="critics_poll">Decennial / All-Time Critics Poll</option>
                <option value="periodical">Periodical Annual Best-Of List</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Films (One per line, e.g. <code className="font-mono text-slate-300">1. Anatomy of a Fall (2023) - Winner</code>)
            </label>
            <textarea
              rows={4}
              required
              value={newListRawLines}
              onChange={(e) => setNewListRawLines(e.target.value)}
              placeholder={`1. Anatomy of a Fall (2023) - Palme d'Or Winner\n2. The Zone of Interest (2023) - Grand Prix Winner\n3. Parasite (2019) - Palme d'Or Winner`}
              className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-md text-slate-200"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-1.5 text-xs font-medium bg-amber-500 text-slate-950 rounded-md hover:bg-amber-400"
          >
            Compare Against My Profile
          </button>
        </form>
      )}

      {/* Compact Cross-List Selector Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {visibleLists.map((list) => {
          const st = listSummaries.find((s) => s.list.id === list.id)!;
          const isSelected = list.id === activeList.id;

          return (
            <button
              key={list.id}
              type="button"
              onClick={() => setSelectedListId(list.id)}
              className={`text-left p-3.5 rounded-lg border transition-colors flex flex-col justify-between ${
                isSelected
                  ? 'bg-slate-900 border-amber-500/70'
                  : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400 mb-1">
                  <span className="truncate">{list.organization}</span>
                  <span className="font-mono tabular-nums text-amber-400 font-semibold shrink-0">
                    {st.completionPct}%
                  </span>
                </div>
                <div className="text-xs font-display font-semibold text-slate-100 mb-2 line-clamp-1">
                  {list.shortName}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="w-full h-1.5 bg-slate-950 rounded overflow-hidden">
                  <div
                    style={{ width: `${st.completionPct}%` }}
                    className={`h-full rounded ${
                      isSelected ? 'bg-amber-400' : 'bg-emerald-500/80'
                    }`}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-400">
                  <span>
                    {st.watchedCount}/{st.totalEntries} seen
                  </span>
                  {list.hasWinnerNomineeSplit ? (
                    <span>
                      {st.winnersWatched}/{st.winnersTotal} Winners
                    </span>
                  ) : (
                    <span>
                      Avg {st.userMean > 0 ? `${st.userMean.toFixed(2)}★` : '—'}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected List Header & 4-Column KPI Summary */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span>{activeList.organization}</span>
              <span aria-hidden="true">·</span>
              <span>
                {activeList.category === 'awards'
                  ? 'Major Film Awards (Wins & Nominations)'
                  : activeList.category === 'critics_poll'
                  ? 'International Critics Poll'
                  : 'Periodical Best-Of Ranking'}
              </span>
            </div>
            <h2 className="text-lg font-display font-bold text-slate-100">
              {activeList.title}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">{activeList.description}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3.5">
            <div className="text-xs text-slate-400 mb-1">List Completion</div>
            <div className="text-xl font-display font-bold font-mono tabular-nums text-slate-100">
              {summary.watchedCount} / {summary.totalEntries}{' '}
              <span className="text-sm font-normal text-amber-400">
                ({summary.completionPct}%)
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
              {summary.unwatchedCount} unseen blindspots remaining
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3.5">
            <div className="text-xs text-slate-400 mb-1">
              {activeList.hasWinnerNomineeSplit
                ? 'Winners vs. Nominees Seen'
                : 'Top-10 Canon Coverage'}
            </div>
            {activeList.hasWinnerNomineeSplit ? (
              <>
                <div className="text-xl font-display font-bold font-mono tabular-nums text-emerald-400">
                  {summary.winnersWatched}/{summary.winnersTotal} Winners
                </div>
                <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
                  {summary.nomineesWatched}/{summary.nomineesTotal} Nominees logged
                </div>
              </>
            ) : (
              <>
                <div className="text-xl font-display font-bold font-mono tabular-nums text-emerald-400">
                  {
                    activeListEvaluated.rows
                      .slice(0, 10)
                      .filter((r) => r.watched).length
                  }
                  /{Math.min(10, summary.totalEntries)} Top 10
                </div>
                <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
                  Top-tier periodical/poll essentials
                </div>
              </>
            )}
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3.5">
            <div className="text-xs text-slate-400 mb-1">Your Mean Rating on List</div>
            <div className="text-xl font-display font-bold font-mono tabular-nums text-amber-400">
              {summary.userMean > 0 ? `${summary.userMean.toFixed(2)} ★` : '—'}
            </div>
            <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
              {biasVsProfile >= 0
                ? `+${biasVsProfile.toFixed(2)}★ vs. your profile mean (${profileOverallMean.toFixed(
                    2
                  )}★)`
                : `${biasVsProfile.toFixed(2)}★ vs. your profile mean (${profileOverallMean.toFixed(
                    2
                  )}★)`}
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3.5">
            <div className="text-xs text-slate-400 mb-1">Consensus Alignment</div>
            <div className="text-xl font-display font-bold font-mono tabular-nums text-slate-100">
              {activeListEvaluated.divergentCount} Hot Takes
            </div>
            <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
              List Benchmark Mean: {activeListEvaluated.consensusAvg.toFixed(2)} ★
            </div>
          </div>
        </div>
      </div>

      {/* Bounded & Paginated List Comparison Ledger */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden flex flex-col">
        <div className="p-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          {/* Interactive Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setEntryTab('all')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                entryTab === 'all'
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All ({summary.totalEntries})
            </button>
            <button
              type="button"
              onClick={() => setEntryTab('watched')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                entryTab === 'watched'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Watched ({summary.watchedCount})
            </button>
            <button
              type="button"
              onClick={() => setEntryTab('unwatched')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                entryTab === 'unwatched'
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Unwatched Checklist ({summary.unwatchedCount})
            </button>
            {activeList.hasWinnerNomineeSplit && (
              <>
                <button
                  type="button"
                  onClick={() => setEntryTab('winners')}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    entryTab === 'winners'
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Winners Only ({summary.winnersTotal})
                </button>
                <button
                  type="button"
                  onClick={() => setEntryTab('nominees')}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    entryTab === 'nominees'
                      ? 'bg-sky-500/20 text-sky-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Nominees Only ({summary.nomineesTotal})
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setEntryTab('divergent')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                entryTab === 'divergent'
                  ? 'bg-rose-500/20 text-rose-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Hot Takes ({activeListEvaluated.divergentCount})
            </button>
          </div>

          {/* Search & Sort Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-56">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search title, ceremony, award..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-md text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as ListSortOrder)}
              aria-label="Sort list entries"
              className="px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-md text-slate-200 focus:outline-none focus:border-amber-500"
            >
              <option value="list_rank">Sort: Official List / Ceremony Order</option>
              <option value="user_rating_desc">Sort: Your Rating (High → Low)</option>
              <option value="user_rating_asc">Sort: Your Rating (Low → High)</option>
              <option value="delta_desc">Sort: Largest Consensus Divergence</option>
            </select>
          </div>
        </div>

        {/* Bounded Scrollable Table Viewport */}
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-slate-950">
              <tr className="border-b border-slate-800 text-[11px] text-slate-400">
                <th className="py-2.5 px-3 w-14 text-right">#</th>
                <th className="py-2.5 px-3 w-28">Status</th>
                <th className="py-2.5 px-3 min-w-[200px]">Film Title</th>
                <th className="py-2.5 px-2.5 w-16 text-right">Year</th>
                <th className="py-2.5 px-3 min-w-[160px]">Ceremony / Issue</th>
                <th className="py-2.5 px-3 min-w-[240px]">Accolade / Poll Distinction</th>
                <th className="py-2.5 px-3 w-36 text-right text-amber-400">
                  @{profile.username} Rating
                </th>
                <th className="py-2.5 px-3 w-28 text-right">Your Sheet Rank</th>
                <th className="py-2.5 px-3 w-32 text-right">vs. Consensus</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {paginatedRows.map(({ entry, watched, userFilm, userRating, delta }) => (
                <tr
                  key={`${entry.title}-${entry.year}-${entry.rank}`}
                  className={`h-10 transition-colors ${
                    watched ? 'hover:bg-slate-800/40' : 'bg-slate-950/30 hover:bg-slate-800/30'
                  }`}
                >
                  {/* Rank */}
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums text-slate-400">
                    {entry.rank}
                  </td>

                  {/* Watched + Winner/Nominee Status */}
                  <td className="px-3 py-1.5">
                    <div
                      className="flex items-center gap-1.5"
                      title={
                        watched
                          ? 'Logged in your profile'
                          : 'Not yet logged in your profile'
                      }
                    >
                      {watched ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <Circle className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                      )}
                      <span
                        className={`font-medium whitespace-nowrap ${
                          entry.status === 'Winner'
                            ? 'text-amber-400'
                            : entry.status === 'Nominee'
                            ? 'text-sky-400'
                            : 'text-slate-300'
                        }`}
                      >
                        {entry.status}
                      </span>
                    </div>
                  </td>

                  {/* Film Title & Director */}
                  <td className="px-3 py-1.5">
                    <div className="font-medium text-slate-100">{entry.title}</div>
                    <div className="text-[11px] text-slate-500">{entry.director}</div>
                  </td>

                  {/* Release Year */}
                  <td className="px-2.5 py-1.5 text-right font-mono tabular-nums text-slate-400">
                    {entry.year}
                  </td>

                  {/* Ceremony or Periodical Issue */}
                  <td className="px-3 py-1.5 text-slate-300">{entry.ceremonyOrIssue}</td>

                  {/* Accolade Detail */}
                  <td className="px-3 py-1.5 text-slate-400">
                    <div className="flex items-center gap-1.5">
                      {entry.status === 'Winner' && (
                        <Award className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      )}
                      <span>{entry.accoladeDetail}</span>
                    </div>
                  </td>

                  {/* User Rating or Quick-Log Selector */}
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                    <select
                      aria-label={`Rate ${entry.title}`}
                      value={userRating ?? ''}
                      onChange={(e) => handleQuickRateListFilm(entry, e.target.value)}
                      className={`px-2 py-0.5 text-xs font-mono tabular-nums rounded border focus:outline-none ${
                        watched
                          ? 'bg-slate-950 border-slate-800 text-amber-400 font-semibold'
                          : 'bg-slate-950 border-slate-800/80 text-slate-500 hover:border-amber-500/50 hover:text-slate-300'
                      }`}
                    >
                      <option value="">
                        {watched ? 'Logged (Unrated)' : '+ Quick Log ★'}
                      </option>
                      {RATING_STEPS.map((step) => (
                        <option key={step} value={step}>
                          {step.toFixed(1)} ★
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* User Custom Rank & Tier in their Spreadsheet */}
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums text-slate-400">
                    {userFilm ? (
                      <span>
                        #{userFilm.customRank ?? '—'} ·{' '}
                        <strong className="text-slate-200">{userFilm.tier}</strong>
                      </span>
                    ) : (
                      <span className="text-slate-600">Unseen</span>
                    )}
                  </td>

                  {/* Delta vs Consensus */}
                  <td
                    className={`px-3 py-1.5 text-right font-mono tabular-nums ${
                      delta === null
                        ? 'text-slate-600'
                        : delta >= 0.4
                        ? 'text-emerald-400'
                        : delta <= -0.4
                        ? 'text-rose-400'
                        : 'text-slate-300'
                    }`}
                  >
                    {delta === null
                      ? `Est. ${entry.consensusRating.toFixed(1)}★`
                      : delta >= 0
                      ? `+${delta.toFixed(1)}★`
                      : `${delta.toFixed(1)}★`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-4 py-2.5 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3 font-mono tabular-nums text-slate-400">
            <span>
              Showing{' '}
              <strong className="text-slate-200">
                {totalRows > 0 ? startIndex + 1 : 0}–{endIndex}
              </strong>{' '}
              of <strong className="text-slate-200">{totalRows}</strong> entries
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
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </label>
          </div>

          <div className="flex items-center gap-1.5 font-mono tabular-nums">
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
              <strong>{totalPages}</strong>
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="p-1 rounded bg-slate-900 border border-slate-800 text-slate-300 disabled:opacity-40"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
