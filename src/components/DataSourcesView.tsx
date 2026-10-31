import React, { useState } from 'react';
import {
  CheckCircle2,
  Code2,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Globe,
  Loader2,
  Trash2,
  Upload,
} from 'lucide-react';
import { ExternalScrapeResponse, ProfileAccount } from '../types/letterboxd';
import { cloneFilmsArray } from '../utils/baselineDiff';
import {
  exportFilmsToCsv,
  extractImportedCsvStructure,
  getLetterboxdExportFilename,
  parseLetterboxdCsvFiles,
} from '../utils/letterboxdParser';

interface DataSourcesViewProps {
  profiles: ProfileAccount[];
  activeProfileId: string;
  onAddOrUpdateProfile: (profile: ProfileAccount, setAsActive: boolean) => void;
  onDeleteProfile: (id: string) => void;
  onSelectActiveProfile: (id: string) => void;
}

const SAMPLE_LETTERBOXD_CSV = `Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date
2026-10-25,Parasite,2019,https://boxd.it/hTha,5,Yes,"35mm, criterion",2026-10-25
2026-10-18,Anatomy of a Fall,2023,https://boxd.it/zSub,4.5,,"cannes, courtroom",2026-10-18
2026-10-11,Challengers,2024,https://boxd.it/zCha,4.5,Yes,"imax, score",2026-10-11
2026-10-02,Dune: Part Two,2024,https://boxd.it/zDun,4.5,,"70mm, sci-fi",2026-10-02
2026-09-21,The Substance,2024,https://boxd.it/zSub2,4,,"midnight, horror",2026-09-21
2026-09-14,In the Mood for Love,2000,https://boxd.it/29tA,5,Yes,"wong-kar-wai, romance",2026-09-14
2026-08-30,Zodiac,2007,https://boxd.it/29zO,4.5,Yes,"fincher, procedural",2026-08-30
2026-08-19,Poor Things,2023,https://boxd.it/zPoo,3.5,,"arthouse",2026-08-19
2026-08-05,The Thing,1982,https://boxd.it/29tH,5,Yes,"carpenter, horror",2026-08-05
2026-07-22,Mulholland Drive,2001,https://boxd.it/29mD,5,Yes,"lynch, mystery",2026-07-22`;

export const DataSourcesView: React.FC<DataSourcesViewProps> = ({
  profiles,
  activeProfileId,
  onAddOrUpdateProfile,
  onDeleteProfile,
  onSelectActiveProfile,
}) => {
  // 1. External Browser Scrape State
  const [scrapeInput, setScrapeInput] = useState('');
  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [scrapeStatus, setScrapeStatus] = useState<{
    type: 'success' | 'info' | 'error';
    message: string;
  } | null>(null);

  // 2. CSV Upload State
  const [csvUsername, setCsvUsername] = useState('');
  const [csvDisplayName, setCsvDisplayName] = useState('');
  const [csvTargetMode, setCsvTargetMode] = useState<'new' | 'merge'>('new');
  const [uploadedFiles, setUploadedFiles] = useState<{ filename: string; content: string }[]>([]);
  const [csvStatus, setCsvStatus] = useState<string | null>(null);

  // 3. Raw Browser Source Paste State
  const [rawPasteUsername, setRawPasteUsername] = useState('');
  const [rawPasteContent, setRawPasteContent] = useState('');
  const [rawPasteLoading, setRawPasteLoading] = useState(false);

  const handleExternalFetch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scrapeInput.trim()) return;

    setScrapeLoading(true);
    setScrapeStatus(null);

    try {
      const cleaned = scrapeInput
        .trim()
        .replace(/^https?:\/\/(www\.)?letterboxd\.com\//i, '')
        .split('/')[0]
        .trim();

      const response = await fetch(`/api/letterboxd/profile/${encodeURIComponent(cleaned)}`);
      const data: ExternalScrapeResponse = await response.json();

      if (!response.ok) {
        throw new Error((data as unknown as { error?: string }).error || 'Failed to fetch profile');
      }

      const newProfile: ProfileAccount = {
        id: `profile-${data.username}-${Date.now()}`,
        username: data.username,
        displayName: data.displayName || data.username,
        sourceType: 'external_scrape',
        lastSyncedAt: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
        profileUrl: data.profileUrl,
        bio: data.bio,
        films: cloneFilmsArray(data.films),
        baselineFilms: cloneFilmsArray(data.films),
      };

      onAddOrUpdateProfile(newProfile, true);
      setScrapeInput('');
      setScrapeStatus({
        type: data.liveReachable ? 'success' : 'info',
        message: data.notice
          ? `${data.notice} Loaded ${data.films.length} films for @${data.username}.`
          : `Successfully scraped ${data.films.length} films from public Letterboxd profile @${data.username}.`,
      });
    } catch (err) {
      setScrapeStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unable to fetch external Letterboxd profile.',
      });
    } finally {
      setScrapeLoading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const loaded: { filename: string; content: string }[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const text = await file.text();
      loaded.push({ filename: file.name, content: text });
    }
    setUploadedFiles((prev) => [...prev, ...loaded]);
  };

  const handleCsvImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadedFiles.length === 0) return;

    const parsedFilms = parseLetterboxdCsvFiles(uploadedFiles);
    const detectedStructure = extractImportedCsvStructure(uploadedFiles);

    if (csvTargetMode === 'merge') {
      const target = profiles.find((p) => p.id === activeProfileId);
      if (target) {
        const existingMap = new Map(
          target.films.map((f) => [`${f.title.toLowerCase()}::${f.year}`, f])
        );
        parsedFilms.forEach((f) => {
          existingMap.set(`${f.title.toLowerCase()}::${f.year}`, f);
        });
        const combined = Array.from(existingMap.values());
        onAddOrUpdateProfile(
          {
            ...target,
            lastSyncedAt: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
            films: cloneFilmsArray(combined),
            baselineFilms: cloneFilmsArray(combined),
            importedCsvStructure:
              detectedStructure.preset !== 'watchlist'
                ? detectedStructure
                : target.importedCsvStructure || detectedStructure,
          },
          true
        );
        setCsvStatus(
          `Merged ${parsedFilms.length} CSV entries into @${target.username} (${combined.length} total films). Schema preserved: ${detectedStructure.headers.join(', ')}`
        );
        setUploadedFiles([]);
        return;
      }
    }

    const cleanUser =
      csvUsername
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_') || `csv_user_${profiles.length + 1}`;
    const display = csvDisplayName.trim() || cleanUser;

    const newProfile: ProfileAccount = {
      id: `profile-csv-${cleanUser}-${Date.now()}`,
      username: cleanUser,
      displayName: display,
      sourceType: 'csv_import',
      lastSyncedAt: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
      profileUrl: `https://letterboxd.com/${cleanUser}/`,
      bio: `Imported from ${uploadedFiles.map((f) => f.filename).join(', ')} (${parsedFilms.length} films).`,
      films: cloneFilmsArray(parsedFilms),
      baselineFilms: cloneFilmsArray(parsedFilms),
      importedCsvStructure: detectedStructure,
    };

    onAddOrUpdateProfile(newProfile, true);
    setCsvStatus(
      `Imported ${parsedFilms.length} films into new profile @${cleanUser} (Matched export headers: ${detectedStructure.headers.join(', ')}).`
    );
    setUploadedFiles([]);
    setCsvUsername('');
    setCsvDisplayName('');
  };

  const handleDownloadSampleCsv = () => {
    const blob = new Blob([SAMPLE_LETTERBOXD_CSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'diary.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportProfileCsv = (
    prof: ProfileAccount,
    mode: 'logged' | 'watchlist'
  ) => {
    const csv = exportFilmsToCsv(prof.films, {
      preset: mode === 'watchlist' ? 'watchlist' : 'match_imported',
      importedStructure: prof.importedCsvStructure,
    });
    const filename =
      mode === 'watchlist'
        ? 'watchlist.csv'
        : getLetterboxdExportFilename('match_imported', prof.importedCsvStructure, false);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRawPasteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawPasteContent.trim()) return;

    setRawPasteLoading(true);
    try {
      const cleanUser =
        rawPasteUsername.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_') ||
        'browser_import';
      const response = await fetch('/api/letterboxd/parse-raw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: cleanUser,
          rawContent: rawPasteContent,
        }),
      });
      const data: ExternalScrapeResponse = await response.json();
      if (data.films && data.films.length > 0) {
        const newProfile: ProfileAccount = {
          id: `profile-raw-${cleanUser}-${Date.now()}`,
          username: data.username,
          displayName: data.displayName || cleanUser,
          sourceType: 'external_scrape',
          lastSyncedAt: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
          profileUrl: `https://letterboxd.com/${cleanUser}/`,
          bio: data.bio,
          films: cloneFilmsArray(data.films),
          baselineFilms: cloneFilmsArray(data.films),
        };
        onAddOrUpdateProfile(newProfile, true);
        setRawPasteContent('');
        setScrapeStatus({
          type: 'success',
          message: `Extracted ${data.films.length} films from pasted Letterboxd HTML/RSS source for @${cleanUser}.`,
        });
      } else {
        setScrapeStatus({
          type: 'error',
          message:
            'No film entries detected in pasted content. Paste the source of a Letterboxd /rss/ feed or /films/diary/ page.',
        });
      }
    } finally {
      setRawPasteLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Loaded Profiles Registry */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
        <h3 className="text-sm font-display font-semibold text-slate-100 mb-1">
          Loaded Letterboxd Profiles in Workspace
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          Switch active spreadsheet profiles or manage accounts available for side-by-side comparison.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {profiles.map((p) => {
            const isActive = p.id === activeProfileId;
            const rated = p.films.filter((f) => f.rating !== null);
            const avg =
              rated.length > 0
                ? rated.reduce((s, f) => s + (f.rating ?? 0), 0) / rated.length
                : 0;

            return (
              <div
                key={p.id}
                className={`p-4 rounded-lg border transition-colors flex flex-col justify-between ${
                  isActive
                    ? 'bg-slate-950 border-amber-500/60'
                    : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-display font-semibold text-sm text-slate-100 truncate">
                      {p.displayName}
                    </span>
                    <a
                      href={p.profileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-mono text-amber-400 hover:underline inline-flex items-center gap-1 shrink-0"
                    >
                      @{p.username}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="text-xs text-slate-400 font-mono tabular-nums mb-2">
                    {p.films.length} films · Mean {avg.toFixed(2)} ★ ·{' '}
                    {p.sourceType === 'csv_import' ? 'CSV Export' : 'External Profile'}
                  </div>
                  {p.bio && (
                    <p className="text-xs text-slate-500 line-clamp-2 mb-3">{p.bio}</p>
                  )}
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-800/80">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectActiveProfile(p.id)}
                      className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                        isActive
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                      }`}
                    >
                      {isActive ? 'Active in Sheet' : 'Open in Sheet'}
                    </button>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleExportProfileCsv(p, 'logged')}
                        title="Export logged films in exact Letterboxd CSV format (diary.csv)"
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-mono bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded text-slate-300 hover:text-amber-300 transition-colors"
                      >
                        <Download className="w-3 h-3" />
                        {p.importedCsvStructure?.filename || 'diary.csv'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExportProfileCsv(p, 'watchlist')}
                        title="Export watchlist films in exact Letterboxd watchlist.csv format"
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-mono bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded text-sky-300 hover:text-sky-200 transition-colors"
                      >
                        <Download className="w-3 h-3" />
                        watchlist.csv
                      </button>
                      {profiles.length > 1 && (
                        <button
                          type="button"
                          onClick={() => onDeleteProfile(p.id)}
                          title="Remove profile from workspace"
                          className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Two Primary Ingestion Pipelines: External Browser Fetch + CSV Export Upload */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Method 1: External Public Profile Fetcher */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Globe className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-display font-semibold text-slate-100">
                1. Collect via External Public Letterboxd Profile
              </h3>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Enter any public Letterboxd username or profile URL (what a visitor finding your account through a review sees). Queries the account&apos;s public RSS feed and film diary pages externally.
            </p>

            <form onSubmit={handleExternalFetch} className="space-y-3">
              <div>
                <label className="block text-xs text-slate-300 mb-1">
                  Letterboxd Username or Profile URL
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    required
                    value={scrapeInput}
                    onChange={(e) => setScrapeInput(e.target.value)}
                    placeholder="e.g. dave, karsten, or https://letterboxd.com/username"
                    className="flex-1 px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-md text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="submit"
                    disabled={scrapeLoading}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-amber-500 text-slate-950 rounded-md hover:bg-amber-400 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                  >
                    {scrapeLoading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Fetching...
                      </>
                    ) : (
                      'Fetch External Profile'
                    )}
                  </button>
                </div>
              </div>
            </form>

            {scrapeStatus && (
              <div
                className={`mt-4 p-3 rounded-md border text-xs ${
                  scrapeStatus.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : scrapeStatus.type === 'info'
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}
              >
                {scrapeStatus.message}
              </div>
            )}
          </div>

          {/* Optional Direct Browser Source Paste */}
          <div className="mt-6 pt-5 border-t border-slate-800">
            <div className="flex items-center gap-2 mb-1">
              <Code2 className="w-4 h-4 text-sky-400" />
              <h4 className="text-xs font-display font-semibold text-slate-200">
                Direct Browser Page Source / RSS XML Paste
              </h4>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              Viewing a profile in your browser? You can also copy the page source from{' '}
              <code className="font-mono text-slate-300">letterboxd.com/&lt;user&gt;/films/diary/</code> or{' '}
              <code className="font-mono text-slate-300">/rss/</code> and paste it here for instant parsing.
            </p>
            <form onSubmit={handleRawPasteSubmit} className="space-y-2.5">
              <input
                type="text"
                value={rawPasteUsername}
                onChange={(e) => setRawPasteUsername(e.target.value)}
                placeholder="Account username label (e.g. sophie_cinema)"
                className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-md text-slate-100"
              />
              <textarea
                rows={3}
                value={rawPasteContent}
                onChange={(e) => setRawPasteContent(e.target.value)}
                placeholder="Paste raw HTML (<tr class='diary-entry-row'>...) or RSS XML (<rss>...) here"
                className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-md text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
              />
              <button
                type="submit"
                disabled={rawPasteLoading || !rawPasteContent.trim()}
                className="px-3.5 py-1.5 text-xs font-medium bg-slate-800 text-slate-100 rounded-md hover:bg-slate-700 disabled:opacity-40 transition-colors"
              >
                Parse Browser Source
              </button>
            </form>
          </div>
        </div>

        {/* Method 2: Letterboxd CSV Archive Importer */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-display font-semibold text-slate-100">
                  2. Import Letterboxd CSV Export Files
                </h3>
              </div>
              <button
                type="button"
                onClick={handleDownloadSampleCsv}
                className="inline-flex items-center gap-1 text-xs text-amber-400 hover:underline whitespace-nowrap shrink-0"
              >
                <Download className="w-3 h-3" />
                Sample CSV
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Upload <code className="font-mono text-slate-300">diary.csv</code>,{' '}
              <code className="font-mono text-slate-300">ratings.csv</code>,{' '}
              <code className="font-mono text-slate-300">watched.csv</code>,{' '}
              <code className="font-mono text-slate-300">reviews.csv</code>, or{' '}
              <code className="font-mono text-sky-300">watchlist.csv</code> exported from Letterboxd. Uploading <code className="font-mono text-sky-300">watchlist.csv</code> sets your Letterboxd Watchlist as the source of truth for want-to-watch items.
            </p>

            <form onSubmit={handleCsvImportSubmit} className="space-y-3">
              <div className="flex items-center gap-2 p-1 bg-slate-950 border border-slate-800 rounded-lg w-fit">
                <button
                  type="button"
                  onClick={() => setCsvTargetMode('new')}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                    csvTargetMode === 'new'
                      ? 'bg-slate-800 text-slate-100'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Create New Profile
                </button>
                <button
                  type="button"
                  onClick={() => setCsvTargetMode('merge')}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                    csvTargetMode === 'merge'
                      ? 'bg-slate-800 text-slate-100'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Merge into Active Profile
                </button>
              </div>

              {csvTargetMode === 'new' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">
                      Account Handle
                    </label>
                    <input
                      type="text"
                      value={csvUsername}
                      onChange={(e) => setCsvUsername(e.target.value)}
                      placeholder="e.g. alex_film"
                      className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-md text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={csvDisplayName}
                      onChange={(e) => setCsvDisplayName(e.target.value)}
                      placeholder="e.g. Alex Rivera"
                      className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-md text-slate-100"
                    />
                  </div>
                </div>
              )}

              <label className="flex flex-col items-center justify-center border border-dashed border-slate-700 hover:border-amber-500/60 bg-slate-950/60 rounded-lg p-6 cursor-pointer transition-colors text-center">
                <Upload className="w-5 h-5 text-slate-400 mb-2" />
                <span className="text-xs font-medium text-slate-200">
                  Click to select Letterboxd CSV files
                </span>
                <span className="text-[11px] text-slate-500 mt-0.5">
                  Supports diary.csv, ratings.csv, watched.csv, reviews.csv
                </span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>

              {uploadedFiles.length > 0 && (
                <div className="bg-slate-950 border border-slate-800 rounded-md p-2.5 space-y-1.5">
                  <div className="text-[11px] text-slate-400 font-medium">
                    Staged CSV Files ({uploadedFiles.length}):
                  </div>
                  {uploadedFiles.map((f, i) => (
                    <div
                      key={`${f.filename}-${i}`}
                      className="flex items-center justify-between text-xs font-mono text-slate-300"
                    >
                      <span>{f.filename}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setUploadedFiles((prev) => prev.filter((_, idx) => idx !== i))
                        }
                        className="text-slate-500 hover:text-rose-400"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="submit"
                disabled={uploadedFiles.length === 0}
                className="w-full py-2 text-xs font-medium bg-emerald-500 text-slate-950 rounded-md hover:bg-emerald-400 disabled:opacity-40 transition-colors"
              >
                Import & Enrich CSV Data
              </button>
            </form>

            {csvStatus && (
              <div className="mt-3 p-3 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{csvStatus}</span>
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800 text-xs text-slate-500">
            Supported Letterboxd CSV columns:{' '}
            <span className="font-mono text-slate-400">
              Date · Name · Year · Letterboxd URI · Rating · Rewatch · Tags · Watched Date
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
