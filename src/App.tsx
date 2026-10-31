import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  BarChart3,
  Database,
  ExternalLink,
  Table2,
  Trophy,
  UserCheck,
} from 'lucide-react';
import { INITIAL_PROFILES } from './data/filmCatalog';
import { FilmEntry, ProfileAccount } from './types/letterboxd';
import { SpreadsheetView } from './components/SpreadsheetView';
import { AnalyticsView } from './components/AnalyticsView';
import { ComparisonView } from './components/ComparisonView';
import { ExternalListsView } from './components/ExternalListsView';
import { DataSourcesView } from './components/DataSourcesView';

type WorkspaceTab = 'spreadsheet' | 'analytics' | 'compare' | 'awards_lists' | 'sources';

const STORAGE_KEY = 'framesheet_letterboxd_profiles_v3';

export default function App() {
  const [profiles, setProfiles] = useState<ProfileAccount[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // Fallback to initial profiles
    }
    return INITIAL_PROFILES;
  });

  const [activeProfileId, setActiveProfileId] = useState<string>(() => {
    return INITIAL_PROFILES[0].id;
  });

  const [compareSecondaryId, setCompareSecondaryId] = useState<string>(() => {
    return INITIAL_PROFILES[1]?.id || INITIAL_PROFILES[0].id;
  });

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('spreadsheet');

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
    } catch {
      // Ignore storage quota errors
    }
  }, [profiles]);

  const activeProfile = useMemo(() => {
    return profiles.find((p) => p.id === activeProfileId) || profiles[0];
  }, [profiles, activeProfileId]);

  const handleUpdateActiveFilms = (updatedFilms: FilmEntry[]) => {
    if (!activeProfile) return;
    setProfiles((prev) =>
      prev.map((p) =>
        p.id === activeProfile.id
          ? {
              ...p,
              films: updatedFilms,
              lastSyncedAt: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
            }
          : p
      )
    );
  };

  const handleAddOrUpdateProfile = (newProfile: ProfileAccount, setAsActive: boolean) => {
    setProfiles((prev) => {
      const exists = prev.some((p) => p.id === newProfile.id);
      if (exists) {
        return prev.map((p) => (p.id === newProfile.id ? newProfile : p));
      }
      return [newProfile, ...prev];
    });
    if (setAsActive) {
      setActiveProfileId(newProfile.id);
      setActiveTab('spreadsheet');
    }
  };

  const handleDeleteProfile = (id: string) => {
    setProfiles((prev) => {
      if (prev.length <= 1) return prev;
      const filtered = prev.filter((p) => p.id !== id);
      if (activeProfileId === id && filtered[0]) {
        setActiveProfileId(filtered[0].id);
      }
      if (compareSecondaryId === id && filtered[0]) {
        setCompareSecondaryId(filtered[1]?.id || filtered[0].id);
      }
      return filtered;
    });
  };

  const activeSummary = useMemo(() => {
    if (!activeProfile) {
      return {
        loggedCount: 0,
        watchlistCount: 0,
        ratedCount: 0,
        meanRating: 0,
        sTierCount: 0,
        topGenre: '—',
      };
    }
    const loggedFilms = activeProfile.films.filter((f) => !f.watchlist);
    const watchlistFilms = activeProfile.films.filter((f) => f.watchlist);
    const rated = loggedFilms.filter((f) => f.rating !== null);
    const mean =
      rated.length > 0
        ? rated.reduce((s, f) => s + (f.rating ?? 0), 0) / rated.length
        : 0;
    const sTierCount = loggedFilms.filter((f) => f.tier === 'S').length;

    const genreCounts = new Map<string, number>();
    loggedFilms.forEach((f) => {
      f.genres.forEach((g) => {
        genreCounts.set(g, (genreCounts.get(g) || 0) + 1);
      });
    });
    const topGenre =
      Array.from(genreCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

    return {
      loggedCount: loggedFilms.length,
      watchlistCount: watchlistFilms.length,
      ratedCount: rated.length,
      meanRating: mean,
      sTierCount,
      topGenre,
    };
  }, [activeProfile]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-slate-800 bg-slate-950 sticky top-0 z-30">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#spreadsheet"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('spreadsheet');
          }}
          className="text-lg font-display font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
        >
          FrameSheet
        </a>

        {/* Zone 2: 5 concise single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
          <a
            href="#spreadsheet"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('spreadsheet');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'spreadsheet'
                ? 'text-slate-100 border-amber-400'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            Spreadsheet
          </a>
          <a
            href="#analytics"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('analytics');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'analytics'
                ? 'text-slate-100 border-amber-400'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            Analytics
          </a>
          <a
            href="#compare"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('compare');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'compare'
                ? 'text-slate-100 border-amber-400'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            Profile Compare
          </a>
          <a
            href="#awards-lists"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('awards_lists');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'awards_lists'
                ? 'text-slate-100 border-amber-400'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            Awards & Lists
          </a>
          <a
            href="#sources"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('sources');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'sources'
                ? 'text-slate-100 border-amber-400'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            Data Sources
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('sources')}
            className="px-4 py-2 text-xs font-medium text-slate-950 bg-amber-500 rounded-lg hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0"
          >
            Import / Fetch Profile
          </button>
        </div>
      </header>

      {/* Workspace Canvas: Sidebar + Main Content Viewport */}
      <div className="flex-1 flex flex-col lg:flex-row">
        {/* Left Sidebar (260px on desktop) */}
        <aside className="w-full lg:w-[260px] shrink-0 border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-900/40 p-4 flex flex-col justify-between gap-6">
          <div className="space-y-6">
            {/* Mobile Navigation Switcher */}
            <div className="grid grid-cols-5 gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg md:hidden">
              <button
                type="button"
                onClick={() => setActiveTab('spreadsheet')}
                className={`py-1.5 text-xs font-medium rounded whitespace-nowrap ${
                  activeTab === 'spreadsheet'
                    ? 'bg-slate-800 text-amber-400'
                    : 'text-slate-400'
                }`}
              >
                Sheet
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('analytics')}
                className={`py-1.5 text-xs font-medium rounded whitespace-nowrap ${
                  activeTab === 'analytics'
                    ? 'bg-slate-800 text-amber-400'
                    : 'text-slate-400'
                }`}
              >
                Charts
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('compare')}
                className={`py-1.5 text-xs font-medium rounded whitespace-nowrap ${
                  activeTab === 'compare'
                    ? 'bg-slate-800 text-amber-400'
                    : 'text-slate-400'
                }`}
              >
                Users
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('awards_lists')}
                className={`py-1.5 text-xs font-medium rounded whitespace-nowrap ${
                  activeTab === 'awards_lists'
                    ? 'bg-slate-800 text-amber-400'
                    : 'text-slate-400'
                }`}
              >
                Awards
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('sources')}
                className={`py-1.5 text-xs font-medium rounded whitespace-nowrap ${
                  activeTab === 'sources'
                    ? 'bg-slate-800 text-amber-400'
                    : 'text-slate-400'
                }`}
              >
                Import
              </button>
            </div>

            {/* Active Letterboxd Account Switcher */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-display font-semibold text-slate-300">
                  Active Profile
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTab('sources')}
                  className="text-xs text-amber-400 hover:underline"
                >
                  + Add
                </button>
              </div>
              <div className="space-y-1.5">
                {profiles.map((prof) => {
                  const isSelected = prof.id === activeProfile?.id;
                  return (
                    <button
                      key={prof.id}
                      type="button"
                      onClick={() => setActiveProfileId(prof.id)}
                      className={`w-full text-left px-3 py-2 rounded-md border transition-colors flex items-center justify-between gap-2 ${
                        isSelected
                          ? 'bg-slate-900 border-amber-500/50 text-slate-100'
                          : 'bg-slate-950/40 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                      }`}
                    >
                      <div className="truncate">
                        <div className="text-xs font-medium truncate">
                          {prof.displayName}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 truncate">
                          @{prof.username} · {prof.sourceType === 'csv_import' ? 'CSV' : 'External'}
                        </div>
                      </div>
                      <span className="text-xs font-mono tabular-nums text-amber-400 shrink-0">
                        {prof.films.length.toLocaleString()}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Active Profile Snapshot Metrics */}
            {activeProfile && (
              <div className="pt-4 border-t border-slate-800/80 space-y-2.5">
                <div className="text-xs font-display font-semibold text-slate-300">
                  Account Ledger Summary
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Logged Movies</span>
                    <span className="font-mono tabular-nums text-slate-200">
                      {activeSummary.loggedCount.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Watchlist</span>
                    <span className="font-mono tabular-nums text-sky-400">
                      {activeSummary.watchlistCount.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Mean Star Rating</span>
                    <span className="font-mono tabular-nums text-amber-400 font-semibold">
                      {activeSummary.meanRating.toFixed(2)} ★
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Tier S (≥4.5★)</span>
                    <span className="font-mono tabular-nums text-emerald-400">
                      {activeSummary.sTierCount.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Primary Genre</span>
                    <span className="text-slate-200">{activeSummary.topGenre}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Quick Contrast / Compare Launcher */}
            {profiles.length > 1 && activeProfile && (
              <div className="pt-4 border-t border-slate-800/80 space-y-2.5">
                <div className="text-xs font-display font-semibold text-slate-300">
                  Quick Contrast Against
                </div>
                <div className="space-y-1">
                  {profiles
                    .filter((p) => p.id !== activeProfile.id)
                    .map((other) => (
                      <button
                        key={other.id}
                        type="button"
                        onClick={() => {
                          setCompareSecondaryId(other.id);
                          setActiveTab('compare');
                        }}
                        className="w-full px-2.5 py-1.5 text-xs bg-slate-950/60 hover:bg-slate-900 border border-slate-800 rounded flex items-center justify-between text-slate-300 hover:text-amber-300 transition-colors"
                      >
                        <span className="truncate">vs. @{other.username}</span>
                        <ArrowLeftRight className="w-3 h-3 shrink-0 text-slate-500" />
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* Workspace Mode Switcher in Sidebar Footer */}
          <div className="pt-4 border-t border-slate-800/80 space-y-1">
            <button
              type="button"
              onClick={() => setActiveTab('spreadsheet')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'spreadsheet'
                  ? 'bg-slate-800 text-amber-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Table2 className="w-4 h-4" />
              <span>Spreadsheet Ledger</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('analytics')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'analytics'
                  ? 'bg-slate-800 text-amber-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Viewing & Rating Charts</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('compare')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'compare'
                  ? 'bg-slate-800 text-amber-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              <span>Two-Profile Comparison</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('awards_lists')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'awards_lists'
                  ? 'bg-slate-800 text-amber-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Trophy className="w-4 h-4" />
              <span>Awards, Polls & Periodicals</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('sources')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'sources'
                  ? 'bg-slate-800 text-amber-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Database className="w-4 h-4" />
              <span>External Scrape & CSV</span>
            </button>
          </div>
        </aside>

        {/* Main Content Viewport */}
        <main className="flex-1 min-w-0 p-6 space-y-6">
          {/* Contextual Workspace Header */}
          {activeProfile && (
            <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                  <span>Letterboxd Workspace</span>
                  <span aria-hidden="true">/</span>
                  <a
                    href={activeProfile.profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-amber-400 hover:underline inline-flex items-center gap-1"
                  >
                    @{activeProfile.username}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <span aria-hidden="true">·</span>
                  <span>
                    Source:{' '}
                    {activeProfile.sourceType === 'csv_import'
                      ? 'Platform CSV Export'
                      : 'External Browser Profile'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    Synced {activeProfile.lastSyncedAt}
                  </span>
                </div>
                <h1 className="text-2xl font-display font-bold text-slate-100">
                  {activeTab === 'spreadsheet' &&
                    `${activeProfile.displayName} — Film Ranking & Diary Spreadsheet`}
                  {activeTab === 'analytics' &&
                    `${activeProfile.displayName} — Viewing History & Rating Analytics`}
                  {activeTab === 'compare' &&
                    'Two-Profile Contrast, Shared Movies & Genre Divergence'}
                  {activeTab === 'awards_lists' &&
                    `${activeProfile.displayName} — Industry Awards, Critic Polls & Periodicals`}
                  {activeTab === 'sources' &&
                    'External Letterboxd Account Scraper & CSV Import Center'}
                </h1>
              </div>

              {activeProfile.bio &&
                activeTab !== 'compare' &&
                activeTab !== 'awards_lists' &&
                activeTab !== 'sources' && (
                  <p className="text-xs text-slate-400 max-w-md">{activeProfile.bio}</p>
                )}
            </div>
          )}

          {/* Active Workspace View */}
          {activeTab === 'spreadsheet' && activeProfile && (
            <SpreadsheetView
              profile={activeProfile}
              onUpdateFilms={handleUpdateActiveFilms}
              onOpenImport={() => setActiveTab('sources')}
            />
          )}

          {activeTab === 'analytics' && activeProfile && (
            <AnalyticsView profile={activeProfile} />
          )}

          {activeTab === 'compare' && (
            <ComparisonView
              profiles={profiles}
              primaryProfileId={activeProfileId}
              secondaryProfileId={compareSecondaryId}
              onSelectPrimary={setActiveProfileId}
              onSelectSecondary={setCompareSecondaryId}
              onOpenImport={() => setActiveTab('sources')}
            />
          )}

          {activeTab === 'awards_lists' && activeProfile && (
            <ExternalListsView
              profile={activeProfile}
              onUpdateFilms={handleUpdateActiveFilms}
            />
          )}

          {activeTab === 'sources' && (
            <DataSourcesView
              profiles={profiles}
              activeProfileId={activeProfileId}
              onAddOrUpdateProfile={handleAddOrUpdateProfile}
              onDeleteProfile={handleDeleteProfile}
              onSelectActiveProfile={(id) => {
                setActiveProfileId(id);
                setActiveTab('spreadsheet');
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
}
