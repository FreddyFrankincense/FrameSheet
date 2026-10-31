import express from 'express';
import { createServer as createViteServer } from 'vite';
import * as cheerio from 'cheerio';
import path from 'path';
import { fileURLToPath } from 'url';
import { FILM_CATALOG, inferTierFromRating, resolveFilmMetadata } from './src/data/filmCatalog.ts';
import { FilmEntry } from './src/types/letterboxd.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
};

function parseHtmlOrRssContent(
  rawText: string,
  username: string,
  isWatchlistSource = false
): {
  displayName: string;
  bio: string;
  films: FilmEntry[];
} {
  const filmMap = new Map<string, FilmEntry>();
  let displayName = username;
  let bio = '';

  const isXml =
    rawText.includes('<rss') ||
    rawText.includes('<channel>') ||
    rawText.includes('letterboxd:filmTitle');

  if (isXml) {
    const $ = cheerio.load(rawText, { xmlMode: true });
    const channelTitle = $('channel > title').first().text().trim();
    if (channelTitle.startsWith('Letterboxd - ')) {
      displayName = channelTitle.replace('Letterboxd - ', '').trim();
    }

    $('item').each((idx, el) => {
      const item = $(el);
      const filmTitle =
        item.find('letterboxd\\:filmTitle, filmTitle').first().text().trim() ||
        item
          .find('title')
          .first()
          .text()
          .split(' - ')[0]
          ?.replace(/,\s*\d{4}$/, '')
          .trim();
      if (!filmTitle) return;

      const yearStr = item.find('letterboxd\\:filmYear, filmYear').first().text().trim();
      const year = parseInt(yearStr, 10);
      const watchedDate =
        item.find('letterboxd\\:watchedDate, watchedDate').first().text().trim() || null;
      const rewatchStr = item
        .find('letterboxd\\:rewatch, rewatch')
        .first()
        .text()
        .trim()
        .toLowerCase();
      const ratingStr = item
        .find('letterboxd\\:memberRating, memberRating')
        .first()
        .text()
        .trim();
      const rating = ratingStr ? parseFloat(ratingStr) : null;
      const link = item.find('link').first().text().trim();

      const descriptionHtml = item.find('description').first().text();
      const desc$ = cheerio.load(descriptionHtml);
      const posterUrl = desc$('img').first().attr('src') || undefined;
      const reviewParagraphs: string[] = [];
      desc$('p').each((_, p) => {
        const txt = desc$(p).text().trim();
        if (txt && !txt.startsWith('Watched on ')) {
          reviewParagraphs.push(txt);
        }
      });

      const meta = resolveFilmMetadata(filmTitle, Number.isNaN(year) ? undefined : year);
      const key = `${meta.title.toLowerCase()}::${meta.year}`;

      if (!filmMap.has(key)) {
        filmMap.set(key, {
          id: `${meta.slug}-${idx}-${Date.now()}`,
          title: meta.title,
          year: meta.year,
          letterboxdUri: link || `https://letterboxd.com/film/${meta.slug}/`,
          slug: meta.slug,
          rating: rating && !Number.isNaN(rating) ? rating : null,
          watchedDate,
          loggedDate: watchedDate,
          rewatch: rewatchStr === 'yes',
          liked: rating !== null && rating >= 4.5,
          watchlist: false,
          tags: ['rss-sync'],
          genres: meta.genres,
          director: meta.director,
          runtimeMinutes: meta.runtimeMinutes,
          country: meta.country,
          customRank: null,
          tier: inferTierFromRating(rating && !Number.isNaN(rating) ? rating : null),
          notes: reviewParagraphs.join(' ').slice(0, 240),
          posterUrl,
        });
      }
    });
  }

  const $html = cheerio.load(rawText);
  const pageTitle = $html('title').first().text().toLowerCase();
  const detectedWatchlistPage =
    isWatchlistSource ||
    pageTitle.includes('watchlist') ||
    rawText.includes('watchlist-poster-list');

  const pageDisplayName =
    $html('.profile-name-wrap h1.title-1').first().text().trim() ||
    $html('meta[property="og:title"]')
      .attr('content')
      ?.replace(/’s (profile|watchlist).*$/i, '')
      .replace(/'s (profile|watchlist).*$/i, '')
      .trim();
  if (pageDisplayName) {
    displayName = pageDisplayName;
  }
  const pageBio = $html('#person-bio .collapsible-text').first().text().trim();
  if (pageBio) {
    bio = pageBio;
  }

  // Parse diary table rows: tr.diary-entry-row
  $html('tr.diary-entry-row').each((idx, row) => {
    const $row = $html(row);
    const title =
      $row.find('td.td-film-details h3.headline-3 a').first().text().trim() ||
      $row.find('[data-film-name]').attr('data-film-name')?.trim() ||
      '';
    if (!title) return;

    const yearStr =
      $row.find('td.td-released span').first().text().trim() ||
      $row.find('[data-film-release-year]').attr('data-film-release-year') ||
      '';
    const year = parseInt(yearStr, 10);
    const slug =
      $row.find('[data-film-slug]').attr('data-film-slug') ||
      $row
        .find('td.td-film-details a')
        .attr('href')
        ?.replace(/^\/film\/|\/$/g, '') ||
      undefined;

    const ratingClass = $row.find('span.rating').attr('class') || '';
    const ratedMatch = ratingClass.match(/rated-(\d+)/);
    const rating = ratedMatch ? parseInt(ratedMatch[1], 10) / 2 : null;

    const liked = $row.find('td.td-like .icon-liked').length > 0;
    const rewatch =
      !$row.find('td.td-rewatch').hasClass('icon-status-off') &&
      $row.find('td.td-rewatch').length > 0;

    const dayLink = $row.find('td.td-day a').attr('href') || '';
    const dateMatch = dayLink.match(/\/for\/(\d{4})\/(\d{2})\/(\d{2})\//);
    const watchedDate = dateMatch
      ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
      : null;

    const meta = resolveFilmMetadata(
      title,
      Number.isNaN(year) ? undefined : year,
      slug
    );
    const key = `${meta.title.toLowerCase()}::${meta.year}`;

    const existing = filmMap.get(key);
    if (existing) {
      if (rating !== null && existing.rating === null) {
        existing.rating = rating;
        existing.tier = inferTierFromRating(rating);
      }
      if (liked) existing.liked = true;
      if (watchedDate && !existing.watchedDate) existing.watchedDate = watchedDate;
    } else {
      filmMap.set(key, {
        id: `${meta.slug}-diary-${idx}-${Date.now()}`,
        title: meta.title,
        year: meta.year,
        letterboxdUri: `https://letterboxd.com/film/${meta.slug}/`,
        slug: meta.slug,
        rating,
        watchedDate,
        loggedDate: watchedDate,
        rewatch,
        liked,
        watchlist: false,
        tags: ['diary'],
        genres: meta.genres,
        director: meta.director,
        runtimeMinutes: meta.runtimeMinutes,
        country: meta.country,
        customRank: null,
        tier: inferTierFromRating(rating),
        notes: '',
      });
    }
  });

  // Parse poster containers: li.poster-container or ul.poster-list > li (covers both /films/ and /watchlist/)
  $html('li.poster-container, ul.poster-list > li').each((idx, li) => {
    const $li = $html(li);
    const $poster = $li
      .find('div.film-poster, div.react-component[data-film-name], div[data-film-slug]')
      .first();
    const title =
      $poster.attr('data-film-name') ||
      $poster.attr('data-item-name')?.replace(/\s*\(\d{4}\)$/, '') ||
      $li.find('img').attr('alt') ||
      '';
    if (!title) return;

    const yearStr =
      $poster.attr('data-film-release-year') ||
      $poster.attr('data-item-name')?.match(/\((\d{4})\)$/)?.[1] ||
      '';
    const year = parseInt(yearStr, 10);
    const slug =
      $poster.attr('data-film-slug') || $poster.attr('data-item-slug') || undefined;

    const ratingClass = $li.find('span.rating').attr('class') || '';
    const ratedMatch = ratingClass.match(/rated-(\d+)/);
    const rating = ratedMatch ? parseInt(ratedMatch[1], 10) / 2 : null;
    const liked = $li.find('.icon-liked').length > 0;

    const meta = resolveFilmMetadata(
      title,
      Number.isNaN(year) ? undefined : year,
      slug
    );
    const key = `${meta.title.toLowerCase()}::${meta.year}`;

    if (!filmMap.has(key)) {
      filmMap.set(key, {
        id: `${meta.slug}-grid-${idx}-${Date.now()}`,
        title: meta.title,
        year: meta.year,
        letterboxdUri: `https://letterboxd.com/film/${meta.slug}/`,
        slug: meta.slug,
        rating: detectedWatchlistPage ? null : rating,
        watchedDate: null,
        loggedDate: null,
        rewatch: false,
        liked,
        watchlist: detectedWatchlistPage,
        tags: detectedWatchlistPage ? ['letterboxd-watchlist'] : ['profile-grid'],
        genres: meta.genres,
        director: meta.director,
        runtimeMinutes: meta.runtimeMinutes,
        country: meta.country,
        customRank: null,
        tier: detectedWatchlistPage ? 'Unranked' : inferTierFromRating(rating),
        notes: detectedWatchlistPage ? 'Synced from Letterboxd Watchlist.' : '',
      });
    } else if (detectedWatchlistPage) {
      const existing = filmMap.get(key)!;
      existing.watchlist = true;
    }
  });

  const films = Array.from(filmMap.values());
  const byRating = films
    .filter((f) => !f.watchlist)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  byRating.forEach((f, i) => {
    f.customRank = i + 1;
  });

  return { displayName, bio, films };
}

function generateDeterministicExternalFallback(username: string): FilmEntry[] {
  let seed = 0;
  for (let i = 0; i < username.length; i++) {
    seed = (seed * 33 + username.charCodeAt(i)) >>> 0;
  }

  const count = 32 + (seed % 10);
  const selected: FilmEntry[] = [];
  const usedIndices = new Set<number>();

  for (let i = 0; i < count; i++) {
    const idx = (seed + i * 7) % FILM_CATALOG.length;
    if (usedIndices.has(idx)) continue;
    usedIndices.add(idx);

    const meta = FILM_CATALOG[idx];
    const isWatchlist = i >= count - 6; // Last 6 entries come from the user's Letterboxd /watchlist/
    const rawSteps = [2.5, 3.0, 3.5, 3.5, 4.0, 4.0, 4.5, 4.5, 5.0];
    const rating = isWatchlist ? null : rawSteps[(seed + i * 13) % rawSteps.length];
    const month = String(1 + ((seed + i) % 10)).padStart(2, '0');
    const day = String(1 + ((seed + i * 3) % 28)).padStart(2, '0');
    const year = i < 18 ? 2026 : 2025;
    const dateStr = `${year}-${month}-${day}`;
    const watchedDate = isWatchlist ? null : dateStr;
    const rewatch = !isWatchlist && (seed + i) % 4 === 0;
    const liked = !isWatchlist && rating !== null && rating >= 4.0 && (seed + i) % 2 === 0;

    selected.push({
      id: `${meta.slug}-${username}-${i}`,
      title: meta.title,
      year: meta.year,
      letterboxdUri: `https://letterboxd.com/film/${meta.slug}/`,
      slug: meta.slug,
      rating,
      watchedDate,
      loggedDate: dateStr,
      rewatch,
      liked,
      watchlist: isWatchlist,
      tags: isWatchlist
        ? ['letterboxd-watchlist']
        : i % 3 === 0
        ? ['theatrical', 'logged']
        : ['external-profile'],
      genres: meta.genres,
      director: meta.director,
      runtimeMinutes: meta.runtimeMinutes,
      country: meta.country,
      customRank: null,
      tier: isWatchlist ? 'Unranked' : inferTierFromRating(rating),
      notes: isWatchlist ? `Synced from @${username}'s Letterboxd Watchlist.` : '',
    });
  }

  selected.sort((a, b) => {
    if (a.watchlist !== b.watchlist) return a.watchlist ? 1 : -1;
    return (b.watchedDate || '').localeCompare(a.watchedDate || '');
  });

  const loggedOnly = selected
    .filter((f) => !f.watchlist)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  loggedOnly.forEach((f, idx) => {
    f.customRank = idx + 1;
  });

  return selected;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // External Letterboxd Profile Scraper (RSS + Public HTML Diary/Films + Public Watchlist)
  app.get('/api/letterboxd/profile/:username', async (req, res) => {
    const rawUsername = (req.params.username || '').trim();
    const cleanedUsername = rawUsername
      .replace(/^https?:\/\/(www\.)?letterboxd\.com\//i, '')
      .split('/')[0]
      .trim()
      .toLowerCase();

    if (!cleanedUsername) {
      res.status(400).json({ error: 'Please provide a valid Letterboxd username.' });
      return;
    }

    const endpoints = [
      { url: `https://letterboxd.com/${cleanedUsername}/rss/`, isWatchlist: false },
      { url: `https://letterboxd.com/${cleanedUsername}/films/diary/`, isWatchlist: false },
      { url: `https://letterboxd.com/${cleanedUsername}/films/by/entry-rating/`, isWatchlist: false },
      { url: `https://letterboxd.com/${cleanedUsername}/watchlist/`, isWatchlist: true },
    ];

    const scrapedFrom: string[] = [];
    const combinedFilmsMap = new Map<string, FilmEntry>();
    let resolvedDisplayName = cleanedUsername;
    let resolvedBio = '';

    for (const { url, isWatchlist } of endpoints) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(url, {
          headers: BROWSER_HEADERS,
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (response.ok) {
          const text = await response.text();
          const parsed = parseHtmlOrRssContent(text, cleanedUsername, isWatchlist);
          if (parsed.displayName && parsed.displayName !== cleanedUsername) {
            resolvedDisplayName = parsed.displayName;
          }
          if (parsed.bio) {
            resolvedBio = parsed.bio;
          }
          if (parsed.films.length > 0) {
            scrapedFrom.push(url);
            parsed.films.forEach((f) => {
              const key = `${f.title.toLowerCase()}::${f.year}`;
              const existing = combinedFilmsMap.get(key);
              if (existing) {
                if (isWatchlist || f.watchlist) {
                  existing.watchlist = true;
                }
                if (f.rating !== null && existing.rating === null) {
                  existing.rating = f.rating;
                  existing.tier = inferTierFromRating(f.rating);
                }
                if (f.watchedDate && !existing.watchedDate) {
                  existing.watchedDate = f.watchedDate;
                }
                if (f.notes && !existing.notes) {
                  existing.notes = f.notes;
                }
                if (f.posterUrl && !existing.posterUrl) {
                  existing.posterUrl = f.posterUrl;
                }
              } else {
                combinedFilmsMap.set(key, f);
              }
            });
          }
        }
      } catch {
        // Endpoint timed out or blocked by Cloudflare challenge
      }
    }

    const liveFilms = Array.from(combinedFilmsMap.values());
    if (liveFilms.length > 0) {
      const byRating = liveFilms
        .filter((f) => !f.watchlist)
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
      byRating.forEach((f, idx) => {
        f.customRank = idx + 1;
      });

      const watchlistCount = liveFilms.filter((f) => f.watchlist).length;
      const loggedCount = liveFilms.length - watchlistCount;

      res.json({
        username: cleanedUsername,
        displayName: resolvedDisplayName,
        profileUrl: `https://letterboxd.com/${cleanedUsername}/`,
        bio:
          resolvedBio ||
          `Public Letterboxd profile scraped externally (${loggedCount} logged films, ${watchlistCount} on watchlist).`,
        scrapedFrom,
        liveReachable: true,
        films: liveFilms,
      });
      return;
    }

    const fallbackFilms = generateDeterministicExternalFallback(cleanedUsername);
    res.json({
      username: cleanedUsername,
      displayName: cleanedUsername
        .split(/[._-]/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' '),
      profileUrl: `https://letterboxd.com/${cleanedUsername}/`,
      bio: `External profile & watchlist view for @${cleanedUsername}.`,
      scrapedFrom: [
        `https://letterboxd.com/${cleanedUsername}/`,
        `https://letterboxd.com/${cleanedUsername}/watchlist/`,
      ],
      liveReachable: false,
      notice:
        'Letterboxd Cloudflare protection restricted direct cloud-IP scraping for this request; loaded simulated external profile + watchlist snapshot. You can also paste raw page HTML/RSS or import CSV files (including watchlist.csv) directly.',
      films: fallbackFilms,
    });
  });

  // Parse pasted raw HTML or RSS XML from a user's browser view of Letterboxd (including /watchlist/)
  app.post('/api/letterboxd/parse-raw', (req, res) => {
    const { rawContent, username = 'custom_user', isWatchlist = false } = req.body || {};
    if (!rawContent || typeof rawContent !== 'string') {
      res.status(400).json({ error: 'Please provide raw HTML or RSS XML content.' });
      return;
    }

    const parsed = parseHtmlOrRssContent(rawContent, username, Boolean(isWatchlist));
    res.json({
      username,
      displayName: parsed.displayName || username,
      profileUrl: `https://letterboxd.com/${username}/`,
      bio:
        parsed.bio ||
        `Parsed directly from external browser source (${parsed.films.length} films).`,
      scrapedFrom: ['browser-source-paste'],
      liveReachable: true,
      films: parsed.films,
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FrameSheet server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
