import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  FileText,
  GitCompare,
  Search,
  Table2,
  Undo2,
  X,
} from 'lucide-react';
import { FilmEntry, ProfileAccount } from '../types/letterboxd';
import {
  cloneFilmsArray,
  computeProfileDeviations,
  EditableFilmField,
  FilmDeviationRecord,
  WordDiffSegment,
} from '../utils/baselineDiff';

interface ChangesSummaryViewProps {
  profile: ProfileAccount;
  onUpdateFilms: (films: FilmEntry[]) => void;
  onOpenInSpreadsheet: (filmId?: string) => void;
}

type DeviationCategoryFilter =
  | 'all'
  | 'reviews'
  | 'ratings'
  | 'watchlist'
  | 'other_fields'
  | 'added_removed';

function renderWordDiffCallout(segments: WordDiffSegment[]): React.ReactNode {
  return (
    <span className="leading-relaxed">
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

export const ChangesSummaryView: React.FC<ChangesSummaryViewProps> = ({
  profile,
  onUpdateFilms,
  onOpenInSpreadsheet,
}) => {
  const [categoryFilter, setCategoryFilter] =
    useState<DeviationCategoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSideBySideIds, setExpandedSideBySideIds] = useState<
    Record<string, boolean>
  >({});

  const deviationSummary = useMemo(
    () => computeProfileDeviations(profile.baselineFilms, profile.films),
    [profile.baselineFilms, profile.films]
  );

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

  // Revert an entire film back to its original Letterboxd baseline state
  const handleRevertFilm = (filmId: string) => {
    const record = deviationSummary.byFilmId.get(filmId);
    if (!record) return;

    if (record.status === 'added_in_app') {
      const updated = profile.films.filter((f) => f.id !== filmId);
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

  // Revert all changes in FrameSheet back to the original Letterboxd baseline
  const handleRevertAllToBaseline = () => {
    if (!profile.baselineFilms) return;
    onUpdateFilms(cloneFilmsArray(profile.baselineFilms));
  };

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return deviationSummary.records.filter((rec: FilmDeviationRecord) => {
      if (categoryFilter === 'reviews') {
        if (!rec.fieldDeviations.some((d) => d.field === 'notes')) return false;
      } else if (categoryFilter === 'ratings') {
        if (!rec.fieldDeviations.some((d) => d.field === 'rating')) return false;
      } else if (categoryFilter === 'watchlist') {
        if (!rec.fieldDeviations.some((d) => d.field === 'watchlist'))
          return false;
      } else if (categoryFilter === 'added_removed') {
        if (rec.status !== 'added_in_app' && rec.status !== 'removed_in_app')
          return false;
      } else if (categoryFilter === 'other_fields') {
        if (
          !rec.fieldDeviations.some(
            (d) =>
              d.field !== 'notes' &&
              d.field !== 'rating' &&
              d.field !== 'watchlist'
          )
        ) {
          return false;
        }
      }

      if (q) {
        const matchesTitle = rec.title.toLowerCase().includes(q);
        const matchesYear = String(rec.year).includes(q);
        const matchesField = rec.fieldDeviations.some(
          (d) =>
            d.label.toLowerCase().includes(q) ||
            d.baselineDisplay.toLowerCase().includes(q) ||
            d.currentDisplay.toLowerCase().includes(q)
        );
        if (!matchesTitle && !matchesYear && !matchesField) return false;
      }

      return true;
    });
  }, [deviationSummary.records, categoryFilter, searchQuery]);

  return (
    <div className="space-y-5">
      {/* Top Banner & Global Revert Action */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <div className="flex items-center gap-2.5">
              <GitCompare className="w-4 h-4 text-amber-400 shrink-0" />
              <h2 className="text-base font-display font-semibold text-slate-100">
                Letterboxd Source-of-Truth Audit &amp; Summary of Changes
              </h2>
              <span
                className={`px-2 py-0.5 text-xs font-mono tabular-nums rounded border ${
                  deviationSummary.totalDeviationCount === 0
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                }`}
              >
                {deviationSummary.totalDeviationCount === 0
                  ? '100% Synced with Letterboxd Baseline'
                  : `${deviationSummary.totalDeviationCount} ${
                      deviationSummary.totalDeviationCount === 1
                        ? 'deviation'
                        : 'deviations'
                    } across ${deviationSummary.records.length} ${
                      deviationSummary.records.length === 1 ? 'film' : 'films'
                    }`}
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Original Letterboxd data (scraped via external browser view or imported via CSV) is preserved as the immutable baseline for{' '}
              <strong className="text-slate-200">{profile.displayName}</strong> (@
              {profile.username}). Every modification made inside FrameSheet — including inline review edits, star rating adjustments, and watchlist changes — is tracked below with one-click revert controls.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => onOpenInSpreadsheet()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-md transition-colors"
            >
              <Table2 className="w-3.5 h-3.5 text-amber-400" />
              Back to Spreadsheet
            </button>

            {deviationSummary.totalDeviationCount > 0 && (
              <button
                type="button"
                onClick={handleRevertAllToBaseline}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/40 rounded-md transition-colors"
              >
                <Undo2 className="w-3.5 h-3.5" />
                Revert All Changes ({deviationSummary.totalDeviationCount})
              </button>
            )}
          </div>
        </div>

        {/* KPI Cards Breakdown */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-5 pt-4 border-t border-slate-800/80 font-mono tabular-nums">
          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
            <div className="text-[11px] font-sans text-slate-400">
              Total Deviations
            </div>
            <div className="text-xl font-bold text-amber-400 mt-1">
              {deviationSummary.totalDeviationCount}
            </div>
            <div className="text-[11px] font-sans text-slate-500 mt-0.5">
              Across {deviationSummary.records.length} films
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
            <div className="text-[11px] font-sans text-slate-400">
              Altered Reviews
            </div>
            <div className="text-xl font-bold text-amber-300 mt-1">
              {deviationSummary.reviewEditsCount}
            </div>
            <div className="text-[11px] font-sans text-slate-500 mt-0.5">
              Word-diff callouts active
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
            <div className="text-[11px] font-sans text-slate-400">
              Rating Deviations
            </div>
            <div className="text-xl font-bold text-amber-300 mt-1">
              {deviationSummary.ratingEditsCount}
            </div>
            <div className="text-[11px] font-sans text-slate-500 mt-0.5">
              vs. Letterboxd stars
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
            <div className="text-[11px] font-sans text-slate-400">
              Watchlist Flips
            </div>
            <div className="text-xl font-bold text-sky-400 mt-1">
              {deviationSummary.watchlistEditsCount}
            </div>
            <div className="text-[11px] font-sans text-slate-500 mt-0.5">
              Watchlist ↔ Logged
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
            <div className="text-[11px] font-sans text-slate-400">
              Added in App
            </div>
            <div className="text-xl font-bold text-emerald-400 mt-1">
              {deviationSummary.addedFilmsCount}
            </div>
            <div className="text-[11px] font-sans text-slate-500 mt-0.5">
              New rows not in baseline
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
            <div className="text-[11px] font-sans text-slate-400">
              Removed Rows
            </div>
            <div className="text-xl font-bold text-rose-400 mt-1">
              {deviationSummary.removedFilmsCount}
            </div>
            <div className="text-[11px] font-sans text-slate-500 mt-0.5">
              Deleted from baseline
            </div>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar for Deviation Records */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ['all', `All Changes (${deviationSummary.records.length})`],
              ['reviews', `Review Edits (${deviationSummary.reviewEditsCount})`],
              ['ratings', `Rating Edits (${deviationSummary.ratingEditsCount})`],
              [
                'watchlist',
                `Watchlist Changes (${deviationSummary.watchlistEditsCount})`,
              ],
              [
                'added_removed',
                `Added / Removed (${
                  deviationSummary.addedFilmsCount +
                  deviationSummary.removedFilmsCount
                })`,
              ],
              ['other_fields', 'Dates, Tags & Tiers'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setCategoryFilter(key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors font-mono tabular-nums ${
                categoryFilter === key
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative min-w-[240px] flex-1 max-w-xs">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter changed movies or text..."
            className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-md text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Deviation Records List */}
      {deviationSummary.records.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-12 text-center space-y-3">
          <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
          <h3 className="text-base font-display font-semibold text-slate-100">
            Zero Deviations — FrameSheet Matches Letterboxd Source of Truth
          </h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
            Every film&apos;s review text, star rating, watchlist flag, diary date, and tag list in FrameSheet currently matches the original data imported or scraped from Letterboxd.
          </p>
          <button
            type="button"
            onClick={() => onOpenInSpreadsheet()}
            className="px-4 py-2 text-xs font-medium bg-amber-500 text-slate-950 rounded-md hover:bg-amber-400 transition-colors"
          >
            Open Spreadsheet Ledger
          </button>
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-8 text-center text-xs text-slate-400">
          No changed movies match the current filter.{' '}
          <button
            type="button"
            onClick={() => {
              setCategoryFilter('all');
              setSearchQuery('');
            }}
            className="text-amber-400 hover:underline ml-1"
          >
            Reset filter
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRecords.map((rec) => {
            const filmObj = rec.currentFilm || rec.baselineFilm;
            const showSideBySide = expandedSideBySideIds[rec.filmId] ?? false;

            return (
              <div
                key={rec.filmId}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg overflow-hidden transition-colors"
              >
                {/* Film Header Bar */}
                <div className="px-4 py-3 bg-slate-950/70 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-sm font-display font-bold text-slate-100">
                      {rec.title}{' '}
                      <span className="font-mono font-normal text-slate-400">
                        ({rec.year})
                      </span>
                    </span>

                    {filmObj?.director && (
                      <span className="text-xs text-slate-400">
                        · Directed by {filmObj.director}
                      </span>
                    )}

                    {rec.status === 'modified' && (
                      <span className="px-2 py-0.5 text-[11px] font-mono rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        {rec.fieldDeviations.length}{' '}
                        {rec.fieldDeviations.length === 1
                          ? 'field edited'
                          : 'fields edited'}
                      </span>
                    )}

                    {rec.status === 'added_in_app' && (
                      <span className="px-2 py-0.5 text-[11px] font-mono rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        Added in FrameSheet (Not in Letterboxd Baseline)
                      </span>
                    )}

                    {rec.status === 'removed_in_app' && (
                      <span className="px-2 py-0.5 text-[11px] font-mono rounded bg-rose-500/20 text-rose-300 border border-rose-500/40">
                        Removed from FrameSheet (Present in Letterboxd Baseline)
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {filmObj?.letterboxdUri && (
                      <a
                        href={filmObj.letterboxdUri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-slate-400 hover:text-amber-300 bg-slate-900 border border-slate-800 rounded transition-colors"
                      >
                        <span>Letterboxd</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}

                    {rec.status !== 'removed_in_app' && (
                      <button
                        type="button"
                        onClick={() => onOpenInSpreadsheet(rec.filmId)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-slate-200 hover:text-amber-300 bg-slate-900 border border-slate-800 rounded transition-colors"
                      >
                        <Table2 className="w-3 h-3 text-amber-400" />
                        <span>Inspect in Sheet</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleRevertFilm(rec.filmId)}
                      className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition-colors"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      <span>
                        {rec.status === 'added_in_app'
                          ? 'Remove Added Row'
                          : rec.status === 'removed_in_app'
                          ? 'Restore Letterboxd Film'
                          : 'Revert Entire Film'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Body: Field Deviations or Added/Removed Details */}
                <div className="p-4 space-y-3">
                  {rec.status === 'added_in_app' && rec.currentFilm && (
                    <div className="text-xs text-slate-300 flex flex-wrap items-center gap-4">
                      <span>
                        Status:{' '}
                        <strong className="font-mono text-emerald-300">
                          {rec.currentFilm.watchlist
                            ? 'Watchlist (Want to Watch)'
                            : 'Logged'}
                        </strong>
                      </span>
                      <span>
                        Rating:{' '}
                        <strong className="font-mono text-amber-400">
                          {rec.currentFilm.rating !== null
                            ? `${rec.currentFilm.rating.toFixed(1)} ★`
                            : 'Unrated'}
                        </strong>
                      </span>
                      {rec.currentFilm.notes && (
                        <span className="text-slate-400">
                          Notes: &ldquo;{rec.currentFilm.notes}&rdquo;
                        </span>
                      )}
                    </div>
                  )}

                  {rec.status === 'removed_in_app' && rec.baselineFilm && (
                    <div className="text-xs text-slate-300 flex flex-wrap items-center gap-4">
                      <span>
                        Letterboxd Baseline Status:{' '}
                        <strong className="font-mono text-rose-300">
                          {rec.baselineFilm.watchlist
                            ? 'Watchlist (Want to Watch)'
                            : 'Logged'}
                        </strong>
                      </span>
                      <span>
                        Letterboxd Rating:{' '}
                        <strong className="font-mono text-amber-400">
                          {rec.baselineFilm.rating !== null
                            ? `${rec.baselineFilm.rating.toFixed(1)} ★`
                            : 'Unrated'}
                        </strong>
                      </span>
                      {rec.baselineFilm.watchedDate && (
                        <span>
                          Watched Date:{' '}
                          <strong className="font-mono">
                            {rec.baselineFilm.watchedDate}
                          </strong>
                        </span>
                      )}
                    </div>
                  )}

                  {rec.fieldDeviations.map((dev) => (
                    <div
                      key={dev.field}
                      className="p-3 rounded-lg bg-slate-950/90 border border-slate-800/90 space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-mono font-semibold text-amber-400">
                            {dev.label}
                          </span>
                          {dev.field !== 'notes' ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 font-mono">
                                Letterboxd Truth: {dev.baselineDisplay}
                              </span>
                              <span className="text-slate-500">→</span>
                              <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 font-mono font-semibold">
                                FrameSheet: {dev.currentDisplay}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 flex items-center gap-1.5">
                              <FileText className="w-3.5 h-3.5 text-amber-400" />
                              <span>
                                Review altered from Letterboxd standard — inline word diff callout:
                              </span>
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {dev.field === 'notes' && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedSideBySideIds((prev) => ({
                                  ...prev,
                                  [rec.filmId]: !showSideBySide,
                                }))
                              }
                              className="px-2 py-1 text-[11px] font-mono text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800 rounded"
                            >
                              {showSideBySide
                                ? 'Hide Side-by-Side'
                                : 'Compare Side-by-Side'}
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleRevertField(rec.filmId, dev.field)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono text-slate-200 hover:text-amber-300 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded transition-colors"
                          >
                            <Undo2 className="w-3 h-3" />
                            <span>Revert {dev.label}</span>
                          </button>
                        </div>
                      </div>

                      {/* Review Word-Level Diff Callout */}
                      {dev.field === 'notes' && dev.wordDiff && (
                        <div className="space-y-2">
                          <div className="p-3 rounded-md bg-slate-900/90 border border-amber-500/30 text-xs text-slate-200 leading-relaxed">
                            {renderWordDiffCallout(dev.wordDiff)}
                          </div>
                          <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-400">
                            <span>
                              Legend:{' '}
                              <ins className="bg-amber-500/25 text-amber-200 border-b border-amber-400 no-underline px-1.5 py-0.5 rounded font-medium">
                                Inserted / Edited in FrameSheet
                              </ins>
                            </span>
                            <span>
                              <del className="bg-rose-500/20 text-rose-300 line-through px-1.5 py-0.5 rounded">
                                Removed from Original Letterboxd Review
                              </del>
                            </span>
                          </div>

                          {showSideBySide && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                              <div className="p-3 rounded bg-slate-900 border border-slate-800 space-y-1">
                                <div className="text-[11px] font-mono text-slate-400">
                                  Original Letterboxd Review (Source of Truth)
                                </div>
                                <p className="text-xs text-slate-300 leading-relaxed">
                                  {dev.baselineDisplay}
                                </p>
                              </div>
                              <div className="p-3 rounded bg-amber-950/20 border border-amber-500/40 space-y-1">
                                <div className="text-[11px] font-mono text-amber-300">
                                  Current FrameSheet Review (Edited)
                                </div>
                                <p className="text-xs text-slate-100 leading-relaxed">
                                  {dev.currentDisplay}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
