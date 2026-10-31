import { CatalogFilmMeta, FilmEntry, ProfileAccount, TierGrade } from '../types/letterboxd';

export const ALL_GENRES = [
  'Drama',
  'Thriller',
  'Sci-Fi',
  'Horror',
  'Comedy',
  'Crime',
  'Romance',
  'Mystery',
  'Animation',
  'Documentary',
  'Action',
  'Fantasy',
  'History',
  'Music',
] as const;

export const FILM_CATALOG: CatalogFilmMeta[] = [
  { title: 'Parasite', year: 2019, slug: 'parasite-2019', genres: ['Drama', 'Thriller', 'Comedy'], director: 'Bong Joon-ho', runtimeMinutes: 132, country: 'South Korea' },
  { title: 'Portrait of a Lady on Fire', year: 2019, slug: 'portrait-of-a-lady-on-fire', genres: ['Drama', 'Romance', 'History'], director: 'Céline Sciamma', runtimeMinutes: 122, country: 'France' },
  { title: 'Anatomy of a Fall', year: 2023, slug: 'anatomy-of-a-fall', genres: ['Drama', 'Mystery', 'Crime'], director: 'Justine Triet', runtimeMinutes: 152, country: 'France' },
  { title: 'Past Lives', year: 2023, slug: 'past-lives', genres: ['Drama', 'Romance'], director: 'Celine Song', runtimeMinutes: 106, country: 'USA' },
  { title: 'The Zone of Interest', year: 2023, slug: 'the-zone-of-interest', genres: ['Drama', 'History'], director: 'Jonathan Glazer', runtimeMinutes: 105, country: 'UK' },
  { title: 'Poor Things', year: 2023, slug: 'poor-things-2023', genres: ['Comedy', 'Sci-Fi', 'Romance'], director: 'Yorgos Lanthimos', runtimeMinutes: 141, country: 'Ireland' },
  { title: 'Oppenheimer', year: 2023, slug: 'oppenheimer-2023', genres: ['Drama', 'History'], director: 'Christopher Nolan', runtimeMinutes: 180, country: 'USA' },
  { title: 'Challengers', year: 2024, slug: 'challengers-2024', genres: ['Drama', 'Romance'], director: 'Luca Guadagnino', runtimeMinutes: 131, country: 'USA' },
  { title: 'Dune: Part Two', year: 2024, slug: 'dune-part-two', genres: ['Sci-Fi', 'Action', 'Drama'], director: 'Denis Villeneuve', runtimeMinutes: 166, country: 'USA' },
  { title: 'Anora', year: 2024, slug: 'anora', genres: ['Drama', 'Comedy', 'Romance'], director: 'Sean Baker', runtimeMinutes: 139, country: 'USA' },
  { title: 'The Substance', year: 2024, slug: 'the-substance', genres: ['Horror', 'Sci-Fi', 'Drama'], director: 'Coralie Fargeat', runtimeMinutes: 141, country: 'France' },
  { title: 'The Brutalist', year: 2024, slug: 'the-brutalist', genres: ['Drama', 'History'], director: 'Brady Corbet', runtimeMinutes: 215, country: 'USA' },
  { title: 'Conclave', year: 2024, slug: 'conclave', genres: ['Thriller', 'Drama', 'Mystery'], director: 'Edward Berger', runtimeMinutes: 120, country: 'UK' },
  { title: 'Nosferatu', year: 2024, slug: 'nosferatu-2024', genres: ['Horror', 'Fantasy', 'Drama'], director: 'Robert Eggers', runtimeMinutes: 132, country: 'USA' },
  { title: 'I Saw the TV Glow', year: 2024, slug: 'i-saw-the-tv-glow', genres: ['Drama', 'Horror', 'Fantasy'], director: 'Jane Schoenbrun', runtimeMinutes: 100, country: 'USA' },
  { title: 'Civil War', year: 2024, slug: 'civil-war-2024', genres: ['Action', 'Thriller', 'Drama'], director: 'Alex Garland', runtimeMinutes: 109, country: 'USA' },
  { title: 'Furiosa: A Mad Max Saga', year: 2024, slug: 'furiosa-a-mad-max-saga', genres: ['Action', 'Sci-Fi'], director: 'George Miller', runtimeMinutes: 148, country: 'Australia' },
  { title: 'Flow', year: 2024, slug: 'flow-2024', genres: ['Animation', 'Fantasy'], director: 'Gints Zilbalodis', runtimeMinutes: 85, country: 'Latvia' },
  { title: 'Sinners', year: 2025, slug: 'sinners-2025', genres: ['Horror', 'Thriller', 'Drama'], director: 'Ryan Coogler', runtimeMinutes: 137, country: 'USA' },
  { title: 'Mickey 17', year: 2025, slug: 'mickey-17', genres: ['Sci-Fi', 'Comedy', 'Drama'], director: 'Bong Joon-ho', runtimeMinutes: 139, country: 'USA' },
  { title: '28 Years Later', year: 2025, slug: '28-years-later', genres: ['Horror', 'Thriller', 'Sci-Fi'], director: 'Danny Boyle', runtimeMinutes: 126, country: 'UK' },
  { title: 'In the Mood for Love', year: 2000, slug: 'in-the-mood-for-love', genres: ['Drama', 'Romance'], director: 'Wong Kar-wai', runtimeMinutes: 98, country: 'Hong Kong' },
  { title: 'Mulholland Drive', year: 2001, slug: 'mulholland-drive', genres: ['Mystery', 'Thriller', 'Drama'], director: 'David Lynch', runtimeMinutes: 147, country: 'USA' },
  { title: 'Spirited Away', year: 2001, slug: 'spirited-away', genres: ['Animation', 'Fantasy'], director: 'Hayao Miyazaki', runtimeMinutes: 125, country: 'Japan' },
  { title: 'Yi Yi', year: 2000, slug: 'yi-yi', genres: ['Drama', 'Romance'], director: 'Edward Yang', runtimeMinutes: 173, country: 'Taiwan' },
  { title: 'Memories of Murder', year: 2003, slug: 'memories-of-murder', genres: ['Crime', 'Drama', 'Thriller'], director: 'Bong Joon-ho', runtimeMinutes: 131, country: 'South Korea' },
  { title: 'Oldboy', year: 2003, slug: 'oldboy', genres: ['Action', 'Thriller', 'Mystery'], director: 'Park Chan-wook', runtimeMinutes: 120, country: 'South Korea' },
  { title: 'Eternal Sunshine of the Spotless Mind', year: 2004, slug: 'eternal-sunshine-of-the-spotless-mind', genres: ['Sci-Fi', 'Drama', 'Romance'], director: 'Michel Gondry', runtimeMinutes: 108, country: 'USA' },
  { title: 'There Will Be Blood', year: 2007, slug: 'there-will-be-blood', genres: ['Drama', 'History'], director: 'Paul Thomas Anderson', runtimeMinutes: 158, country: 'USA' },
  { title: 'No Country for Old Men', year: 2007, slug: 'no-country-for-old-men', genres: ['Crime', 'Thriller', 'Drama'], director: 'Joel & Ethan Coen', runtimeMinutes: 122, country: 'USA' },
  { title: 'Zodiac', year: 2007, slug: 'zodiac', genres: ['Crime', 'Mystery', 'Thriller'], director: 'David Fincher', runtimeMinutes: 157, country: 'USA' },
  { title: 'The Social Network', year: 2010, slug: 'the-social-network', genres: ['Drama', 'History'], director: 'David Fincher', runtimeMinutes: 120, country: 'USA' },
  { title: 'Drive', year: 2011, slug: 'drive-2011', genres: ['Crime', 'Thriller', 'Action'], director: 'Nicolas Winding Refn', runtimeMinutes: 100, country: 'USA' },
  { title: 'The Master', year: 2012, slug: 'the-master-2012', genres: ['Drama'], director: 'Paul Thomas Anderson', runtimeMinutes: 138, country: 'USA' },
  { title: 'Whiplash', year: 2014, slug: 'whiplash-2014', genres: ['Drama', 'Music'], director: 'Damien Chazelle', runtimeMinutes: 106, country: 'USA' },
  { title: 'Interstellar', year: 2014, slug: 'interstellar', genres: ['Sci-Fi', 'Drama'], director: 'Christopher Nolan', runtimeMinutes: 169, country: 'USA' },
  { title: 'Grand Budapest Hotel', year: 2014, slug: 'the-grand-budapest-hotel', genres: ['Comedy', 'Drama', 'Crime'], director: 'Wes Anderson', runtimeMinutes: 100, country: 'USA' },
  { title: 'Mad Max: Fury Road', year: 2015, slug: 'mad-max-fury-road', genres: ['Action', 'Sci-Fi', 'Thriller'], director: 'George Miller', runtimeMinutes: 120, country: 'Australia' },
  { title: 'Carol', year: 2015, slug: 'carol-2015', genres: ['Romance', 'Drama'], director: 'Todd Haynes', runtimeMinutes: 118, country: 'UK' },
  { title: 'Moonlight', year: 2016, slug: 'moonlight-2016', genres: ['Drama'], director: 'Barry Jenkins', runtimeMinutes: 111, country: 'USA' },
  { title: 'The Handmaiden', year: 2016, slug: 'the-handmaiden', genres: ['Thriller', 'Drama', 'Romance'], director: 'Park Chan-wook', runtimeMinutes: 145, country: 'South Korea' },
  { title: 'Arrival', year: 2016, slug: 'arrival-2016', genres: ['Sci-Fi', 'Drama', 'Mystery'], director: 'Denis Villeneuve', runtimeMinutes: 116, country: 'USA' },
  { title: 'La La Land', year: 2016, slug: 'la-la-land', genres: ['Music', 'Romance', 'Drama'], director: 'Damien Chazelle', runtimeMinutes: 128, country: 'USA' },
  { title: 'Get Out', year: 2017, slug: 'get-out-2017', genres: ['Horror', 'Thriller', 'Mystery'], director: 'Jordan Peele', runtimeMinutes: 104, country: 'USA' },
  { title: 'Phantom Thread', year: 2017, slug: 'phantom-thread', genres: ['Drama', 'Romance'], director: 'Paul Thomas Anderson', runtimeMinutes: 130, country: 'USA' },
  { title: 'Blade Runner 2049', year: 2017, slug: 'blade-runner-2049', genres: ['Sci-Fi', 'Drama', 'Mystery'], director: 'Denis Villeneuve', runtimeMinutes: 164, country: 'USA' },
  { title: 'Lady Bird', year: 2017, slug: 'lady-bird', genres: ['Comedy', 'Drama'], director: 'Greta Gerwig', runtimeMinutes: 94, country: 'USA' },
  { title: 'Hereditary', year: 2018, slug: 'hereditary', genres: ['Horror', 'Drama', 'Mystery'], director: 'Ari Aster', runtimeMinutes: 127, country: 'USA' },
  { title: 'Burning', year: 2018, slug: 'burning-2018', genres: ['Mystery', 'Drama', 'Thriller'], director: 'Lee Chang-dong', runtimeMinutes: 148, country: 'South Korea' },
  { title: 'Spider-Man: Into the Spider-Verse', year: 2018, slug: 'spider-man-into-the-spider-verse', genres: ['Animation', 'Action', 'Sci-Fi'], director: 'Bob Persichetti, Peter Ramsey, Rodney Rothman', runtimeMinutes: 117, country: 'USA' },
  { title: 'The Lighthouse', year: 2019, slug: 'the-lighthouse-2019', genres: ['Horror', 'Drama', 'Fantasy'], director: 'Robert Eggers', runtimeMinutes: 109, country: 'USA' },
  { title: 'Uncut Gems', year: 2019, slug: 'uncut-gems', genres: ['Crime', 'Thriller', 'Drama'], director: 'Josh & Benny Safdie', runtimeMinutes: 135, country: 'USA' },
  { title: 'Drive My Car', year: 2021, slug: 'drive-my-car', genres: ['Drama'], director: 'Ryusuke Hamaguchi', runtimeMinutes: 179, country: 'Japan' },
  { title: 'The Worst Person in the World', year: 2021, slug: 'the-worst-person-in-the-world', genres: ['Drama', 'Romance', 'Comedy'], director: 'Joachim Trier', runtimeMinutes: 128, country: 'Norway' },
  { title: 'Aftersun', year: 2022, slug: 'aftersun', genres: ['Drama'], director: 'Charlotte Wells', runtimeMinutes: 102, country: 'UK' },
  { title: 'Tár', year: 2022, slug: 'tar-2022', genres: ['Drama', 'Music'], director: 'Todd Field', runtimeMinutes: 158, country: 'USA' },
  { title: 'Decision to Leave', year: 2022, slug: 'decision-to-leave', genres: ['Mystery', 'Romance', 'Thriller'], director: 'Park Chan-wook', runtimeMinutes: 138, country: 'South Korea' },
  { title: 'Everything Everywhere All at Once', year: 2022, slug: 'everything-everywhere-all-at-once', genres: ['Sci-Fi', 'Action', 'Comedy'], director: 'Daniel Kwan, Daniel Scheinert', runtimeMinutes: 139, country: 'USA' },
  { title: 'The Banshees of Inisherin', year: 2022, slug: 'the-banshees-of-inisherin', genres: ['Drama', 'Comedy'], director: 'Martin McDonagh', runtimeMinutes: 114, country: 'Ireland' },
  { title: 'Nope', year: 2022, slug: 'nope', genres: ['Horror', 'Sci-Fi', 'Mystery'], director: 'Jordan Peele', runtimeMinutes: 130, country: 'USA' },
  { title: 'Seven Samurai', year: 1954, slug: 'seven-samurai', genres: ['Action', 'Drama', 'History'], director: 'Akira Kurosawa', runtimeMinutes: 207, country: 'Japan' },
  { title: 'Vertigo', year: 1958, slug: 'vertigo', genres: ['Mystery', 'Romance', 'Thriller'], director: 'Alfred Hitchcock', runtimeMinutes: 128, country: 'USA' },
  { title: '12 Angry Men', year: 1957, slug: '12-angry-men', genres: ['Drama', 'Crime'], director: 'Sidney Lumet', runtimeMinutes: 97, country: 'USA' },
  { title: 'Harakiri', year: 1962, slug: 'harakiri', genres: ['Drama', 'History', 'Action'], director: 'Masaki Kobayashi', runtimeMinutes: 133, country: 'Japan' },
  { title: 'Persona', year: 1966, slug: 'persona', genres: ['Drama', 'Mystery'], director: 'Ingmar Bergman', runtimeMinutes: 83, country: 'Sweden' },
  { title: '2001: A Space Odyssey', year: 1968, slug: '2001-a-space-odyssey', genres: ['Sci-Fi', 'Mystery'], director: 'Stanley Kubrick', runtimeMinutes: 149, country: 'UK' },
  { title: 'The Godfather', year: 1972, slug: 'the-godfather', genres: ['Crime', 'Drama'], director: 'Francis Ford Coppola', runtimeMinutes: 175, country: 'USA' },
  { title: 'Chinatown', year: 1974, slug: 'chinatown', genres: ['Crime', 'Mystery', 'Thriller'], director: 'Roman Polanski', runtimeMinutes: 130, country: 'USA' },
  { title: 'Barry Lyndon', year: 1975, slug: 'barry-lyndon', genres: ['Drama', 'History', 'Romance'], director: 'Stanley Kubrick', runtimeMinutes: 185, country: 'UK' },
  { title: 'Taxi Driver', year: 1976, slug: 'taxi-driver', genres: ['Crime', 'Drama'], director: 'Martin Scorsese', runtimeMinutes: 114, country: 'USA' },
  { title: 'Alien', year: 1979, slug: 'alien', genres: ['Horror', 'Sci-Fi'], director: 'Ridley Scott', runtimeMinutes: 117, country: 'UK' },
  { title: 'Stalker', year: 1979, slug: 'stalker', genres: ['Sci-Fi', 'Drama'], director: 'Andrei Tarkovsky', runtimeMinutes: 162, country: 'USSR' },
  { title: 'The Shining', year: 1980, slug: 'the-shining', genres: ['Horror', 'Thriller'], director: 'Stanley Kubrick', runtimeMinutes: 146, country: 'USA' },
  { title: 'Blow Out', year: 1981, slug: 'blow-out', genres: ['Thriller', 'Mystery', 'Crime'], director: 'Brian De Palma', runtimeMinutes: 108, country: 'USA' },
  { title: 'The Thing', year: 1982, slug: 'the-thing', genres: ['Horror', 'Sci-Fi', 'Mystery'], director: 'John Carpenter', runtimeMinutes: 109, country: 'USA' },
  { title: 'Paris, Texas', year: 1984, slug: 'paris-texas', genres: ['Drama'], director: 'Wim Wenders', runtimeMinutes: 145, country: 'West Germany' },
  { title: 'Stop Making Sense', year: 1984, slug: 'stop-making-sense', genres: ['Documentary', 'Music'], director: 'Jonathan Demme', runtimeMinutes: 88, country: 'USA' },
  { title: 'Blue Velvet', year: 1986, slug: 'blue-velvet', genres: ['Mystery', 'Thriller', 'Crime'], director: 'David Lynch', runtimeMinutes: 120, country: 'USA' },
  { title: 'Do the Right Thing', year: 1989, slug: 'do-the-right-thing', genres: ['Drama', 'Comedy'], director: 'Spike Lee', runtimeMinutes: 120, country: 'USA' },
  { title: 'GoodFellas', year: 1990, slug: 'goodfellas', genres: ['Crime', 'Drama'], director: 'Martin Scorsese', runtimeMinutes: 145, country: 'USA' },
  { title: 'The Silence of the Lambs', year: 1991, slug: 'the-silence-of-the-lambs', genres: ['Crime', 'Horror', 'Thriller'], director: 'Jonathan Demme', runtimeMinutes: 118, country: 'USA' },
  { title: 'Chungking Express', year: 1994, slug: 'chungking-express', genres: ['Drama', 'Romance', 'Comedy'], director: 'Wong Kar-wai', runtimeMinutes: 102, country: 'Hong Kong' },
  { title: 'Pulp Fiction', year: 1994, slug: 'pulp-fiction', genres: ['Crime', 'Thriller', 'Comedy'], director: 'Quentin Tarantino', runtimeMinutes: 154, country: 'USA' },
  { title: 'Heat', year: 1995, slug: 'heat-1995', genres: ['Crime', 'Drama', 'Action'], director: 'Michael Mann', runtimeMinutes: 170, country: 'USA' },
  { title: 'Before Sunrise', year: 1995, slug: 'before-sunrise', genres: ['Romance', 'Drama'], director: 'Richard Linklater', runtimeMinutes: 101, country: 'USA' },
  { title: 'La Haine', year: 1995, slug: 'la-haine', genres: ['Drama', 'Crime'], director: 'Mathieu Kassovitz', runtimeMinutes: 98, country: 'France' },
  { title: 'Fargo', year: 1996, slug: 'fargo', genres: ['Crime', 'Thriller', 'Comedy'], director: 'Joel & Ethan Coen', runtimeMinutes: 98, country: 'USA' },
  { title: 'Cure', year: 1997, slug: 'cure', genres: ['Crime', 'Horror', 'Mystery'], director: 'Kiyoshi Kurosawa', runtimeMinutes: 111, country: 'Japan' },
  { title: 'The Matrix', year: 1999, slug: 'the-matrix', genres: ['Sci-Fi', 'Action'], director: 'Lana & Lilly Wachowski', runtimeMinutes: 136, country: 'USA' },
  { title: 'Eyes Wide Shut', year: 1999, slug: 'eyes-wide-shut', genres: ['Mystery', 'Drama', 'Thriller'], director: 'Stanley Kubrick', runtimeMinutes: 159, country: 'UK' },
  { title: 'Beau Travail', year: 1999, slug: 'beau-travail', genres: ['Drama'], director: 'Claire Denis', runtimeMinutes: 92, country: 'France' },
];

const ARCHIVE_DIRECTORS = [
  { name: 'Agnès Varda', country: 'France', genres: ['Documentary', 'Drama'] },
  { name: 'Michael Haneke', country: 'Austria', genres: ['Drama', 'Thriller'] },
  { name: 'Hirokazu Kore-eda', country: 'Japan', genres: ['Drama'] },
  { name: 'Kelly Reichardt', country: 'USA', genres: ['Drama', 'History'] },
  { name: 'Pedro Almodóvar', country: 'Spain', genres: ['Drama', 'Romance', 'Comedy'] },
  { name: 'Abbas Kiarostami', country: 'Iran', genres: ['Drama'] },
  { name: 'David Cronenberg', country: 'Canada', genres: ['Horror', 'Sci-Fi', 'Thriller'] },
  { name: 'Kathryn Bigelow', country: 'USA', genres: ['Action', 'Thriller'] },
  { name: 'Apichatpong Weerasethakul', country: 'Thailand', genres: ['Drama', 'Fantasy'] },
  { name: 'Krzysztof Kieślowski', country: 'Poland', genres: ['Drama', 'Mystery', 'Romance'] },
  { name: 'Rainer Werner Fassbinder', country: 'Germany', genres: ['Drama', 'Romance'] },
  { name: 'Chantal Akerman', country: 'Belgium', genres: ['Drama'] },
  { name: 'John Cassavetes', country: 'USA', genres: ['Drama', 'Romance'] },
  { name: 'Dario Argento', country: 'Italy', genres: ['Horror', 'Mystery', 'Thriller'] },
  { name: 'Satoshi Kon', country: 'Japan', genres: ['Animation', 'Mystery', 'Thriller'] },
  { name: 'Hou Hsiao-hsien', country: 'Taiwan', genres: ['Drama', 'History'] },
  { name: 'Steven Soderbergh', country: 'USA', genres: ['Crime', 'Thriller', 'Comedy'] },
  { name: 'Éric Rohmer', country: 'France', genres: ['Romance', 'Drama', 'Comedy'] },
  { name: 'Tsai Ming-liang', country: 'Taiwan', genres: ['Drama'] },
  { name: 'Lucrecia Martel', country: 'Argentina', genres: ['Drama', 'Mystery'] },
];

const TITLE_ADJECTIVES = [
  'Silent', 'Midnight', 'Distant', 'Crimson', 'Last', 'Forgotten', 'Velvet', 'Pale',
  'Electric', 'Autumn', 'Winter', 'Glass', 'Broken', 'Hidden', 'Golden', 'Bitter',
  'Nocturnal', 'Hollow', 'Sacred', 'Burning', 'Double', 'Northern', 'Southern', 'Neon',
  'Phantom', 'Paper', 'Cold', 'Wild', 'Concrete', 'Shadow', 'Silver', 'Blind',
];

const TITLE_NOUNS = [
  'Harbor', 'Labyrinth', 'Horizon', 'Echoes', 'Passage', 'Portrait', 'Chronicle', 'Sonata',
  'Mirage', 'Verdict', 'Boundary', 'Current', 'Protocol', 'Testament', 'Threshold', 'Garden',
  'Requiem', 'Corridor', 'Departure', 'Nocturne', 'Meridian', 'Witness', 'Reflection', 'Highway',
  'Signal', 'Fugue', 'Interlude', 'Pavilion', 'Sanctuary', 'Solstice', 'Archive', 'Station',
];

const BELL_CURVE_RATINGS = [
  0.5, 1.0, 1.5, 1.5, 2.0, 2.0, 2.0, 2.5, 2.5, 2.5, 2.5, 2.5,
  3.0, 3.0, 3.0, 3.0, 3.0, 3.0, 3.0, 3.0,
  3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5,
  4.0, 4.0, 4.0, 4.0, 4.0, 4.0, 4.0, 4.0,
  4.5, 4.5, 4.5, 4.5,
  5.0, 5.0,
];

export function slugifyTitle(title: string, year?: number): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return year ? `${base}-${year}` : base;
}

export function inferTierFromRating(rating: number | null): TierGrade {
  if (rating === null) return 'Unranked';
  if (rating >= 4.5) return 'S';
  if (rating >= 4.0) return 'A';
  if (rating >= 3.0) return 'B';
  if (rating >= 2.0) return 'C';
  return 'D';
}

export function resolveFilmMetadata(title: string, year?: number, slug?: string): CatalogFilmMeta {
  const normalizedTitle = title.trim().toLowerCase();
  const match = FILM_CATALOG.find(
    (f) =>
      f.title.toLowerCase() === normalizedTitle ||
      (slug && f.slug.toLowerCase() === slug.toLowerCase())
  );
  if (match) {
    return match;
  }

  const genres: string[] = [];
  const lower = normalizedTitle;
  if (/night|blood|dead|dark|scream|witch|evil|ghost|saw|curse|vampire|zombie|haunt|omen|terror|substance|nosferatu/.test(lower)) {
    genres.push('Horror', 'Thriller');
  }
  if (/space|star|alien|future|dune|matrix|blade|cyber|mars|moon|robot|time|planet|2049|mickey/.test(lower)) {
    genres.push('Sci-Fi');
  }
  if (/love|heart|kiss|wedding|bride|romance|summer|before|affair|lady|past/.test(lower)) {
    genres.push('Romance', 'Drama');
  }
  if (/murder|crime|detective|cop|heist|gun|city|mafia|godfather|thief|anatomy|zodiac|conclave/.test(lower)) {
    genres.push('Crime', 'Mystery');
  }
  if (/war|battle|king|empire|soldier|history|century|army/.test(lower)) {
    genres.push('History', 'Drama');
  }
  if (/song|music|band|jazz|symphony|sound|concert|whiplash/.test(lower)) {
    genres.push('Music', 'Drama');
  }

  let hash = 0;
  for (let i = 0; i < normalizedTitle.length; i++) {
    hash = (hash * 31 + normalizedTitle.charCodeAt(i)) >>> 0;
  }

  if (genres.length === 0) {
    const primary = ALL_GENRES[hash % ALL_GENRES.length];
    const secondary = ALL_GENRES[(hash + 3) % ALL_GENRES.length];
    genres.push(primary);
    if (secondary !== primary) genres.push(secondary);
  }

  const runtimeMinutes = 92 + (hash % 68);
  const resolvedYear = year && year > 1890 ? year : 1965 + (hash % 61);
  const dirObj = ARCHIVE_DIRECTORS[hash % ARCHIVE_DIRECTORS.length];

  return {
    title: title.trim(),
    year: resolvedYear,
    slug: slug || slugifyTitle(title, resolvedYear),
    genres: Array.from(new Set(genres)).slice(0, 3),
    director: dirObj.name,
    runtimeMinutes,
    country: dirObj.country,
  };
}

/**
 * Generates a realistic multi-thousand film archive for testing and organizing
 * high-volume Letterboxd accounts (e.g., 1,500 to 3,500 logged films).
 */
export function generateHighVolumeFilmArchive(
  totalCount: number,
  seedOffset: number,
  ratingBias = 0
): FilmEntry[] {
  const entries: FilmEntry[] = [];
  const totalPoolSize = 2600;

  for (let i = 0; i < totalCount; i++) {
    // Use a deterministic permutation over a shared 2,600-film universe so two multi-thousand accounts
    // share realistic overlap (~60-75% overlap) while also having hundreds of unique blindspots.
    const catalogId = (i + seedOffset * 137) % totalPoolSize;
    let meta: CatalogFilmMeta;

    if (catalogId < FILM_CATALOG.length) {
      meta = FILM_CATALOG[catalogId];
    } else {
      const adj = TITLE_ADJECTIVES[catalogId % TITLE_ADJECTIVES.length];
      const noun = TITLE_NOUNS[Math.floor(catalogId / TITLE_ADJECTIVES.length) % TITLE_NOUNS.length];
      const suffixNum = Math.floor(catalogId / (TITLE_ADJECTIVES.length * TITLE_NOUNS.length));
      const releaseYear = 1952 + ((catalogId * 17) % 74); // 1952..2025
      const title = suffixNum > 0 ? `The ${adj} ${noun} ${suffixNum + 1}` : `The ${adj} ${noun}`;
      const dir = ARCHIVE_DIRECTORS[catalogId % ARCHIVE_DIRECTORS.length];
      const extraGenre = ALL_GENRES[(catalogId * 7) % ALL_GENRES.length];
      const genres = Array.from(new Set([...dir.genres, extraGenre])).slice(0, 3);

      meta = {
        title,
        year: releaseYear,
        slug: slugifyTitle(title, releaseYear),
        genres,
        director: dir.name,
        runtimeMinutes: 88 + ((catalogId * 13) % 78),
        country: dir.country,
      };
    }

    const ratingHash = (catalogId * 37 + seedOffset * 53 + i * 11) >>> 0;
    // Designate ~8% of entries as active Letterboxd Watchlist items (unwatched movies the user wants to watch)
    const isWatchlistEntry = i >= Math.floor(totalCount * 0.92);

    const baseRating = BELL_CURVE_RATINGS[ratingHash % BELL_CURVE_RATINGS.length];
    const shifted = Math.max(0.5, Math.min(5.0, Math.round((baseRating + ratingBias) * 2) / 2));
    const isUnrated = isWatchlistEntry || ratingHash % 29 === 0;
    const finalRating = isUnrated ? null : shifted;

    // Distribute watched dates across 2019–2026 for logged films; null for unwatched watchlist items
    const watchYear = 2026 - Math.floor((i / totalCount) * 7.5);
    const watchMonth = String(1 + ((ratingHash + i) % 10)).padStart(2, '0');
    const watchDay = String(1 + ((ratingHash * 3 + i) % 28)).padStart(2, '0');
    const dateStr = `${watchYear}-${watchMonth}-${watchDay}`;
    const watchedDate = isWatchlistEntry ? null : dateStr;

    const rewatch = !isWatchlistEntry && ratingHash % 6 === 0;
    const liked = !isWatchlistEntry && finalRating !== null && finalRating >= 4.0 && ratingHash % 2 === 0;

    const tags: string[] = [];
    if (isWatchlistEntry) {
      tags.push('letterboxd-watchlist');
    } else {
      if (ratingHash % 5 === 0) tags.push('35mm');
      if (ratingHash % 7 === 0) tags.push('criterion');
      if (ratingHash % 9 === 0) tags.push('theatrical');
      if (rewatch) tags.push('rewatch');
    }

    const reviewTemplates = [
      `Relentlessly action-packed from the opening sequence through its breathless third act; ${meta.director} stages every set-piece with razor-sharp precision and tactile practical effects.`,
      `A hypnotic slow-burn character study anchored by visceral cinematography and a haunting score that lingers long after the credits roll.`,
      `Delivers a career-best performance at its center, balancing bleak atmosphere with unexpected dark humor and tightly plotted tension.`,
      `Pure kinetic cinema: an action-packed masterclass in spatial choreography, thunderous sound design, and practical effects work.`,
      `Intimate, melancholic, and deeply human. ${meta.director} crafts a lush visual poem with razor-sharp dialogue and an emotional gut-punch in the final reel.`,
      `Endlessly rewatchable late-night thriller with neon-lit framing, propulsive editing, and a haunting score that elevates every scene.`,
      `Starts as a taut procedural before erupting into an action-packed, high-stakes finale with remarkable practical effects and staging.`,
      `A bold, uncompromising slow-burn drama from ${meta.director} featuring visceral cinematography and an unforgettable third act payoff.`,
      `Sharp, atmospheric, and fiercely original—combines a career-best performance with razor-sharp dialogue and immaculate production design.`,
      `Watched on 35mm repertory print (${meta.country}, ${meta.runtimeMinutes}m). ${meta.director}'s command of tone turns a bleak atmosphere into something transcendent and rewatchable.`,
    ];

    let reviewNote = '';
    if (isWatchlistEntry) {
      reviewNote = `Synced from Letterboxd Watchlist (added ${dateStr}).`;
    } else if (i < 60 || ratingHash % 2 === 0) {
      reviewNote = reviewTemplates[(ratingHash + i) % reviewTemplates.length];
    }

    entries.push({
      id: `${meta.slug}-${seedOffset}-${i}`,
      title: meta.title,
      year: meta.year,
      letterboxdUri: `https://letterboxd.com/film/${meta.slug}/`,
      slug: meta.slug,
      rating: finalRating,
      watchedDate,
      loggedDate: dateStr,
      rewatch,
      liked,
      watchlist: isWatchlistEntry,
      tags,
      genres: meta.genres,
      director: meta.director,
      runtimeMinutes: meta.runtimeMinutes,
      country: meta.country,
      customRank: isWatchlistEntry ? null : i + 1,
      tier: isWatchlistEntry ? 'Unranked' : inferTierFromRating(finalRating),
      notes: reviewNote,
    });
  }

  // Assign customRank sorted by rating desc for logged (non-watchlist) films
  const loggedOnly = entries.filter((f) => !f.watchlist);
  const sortedByRating = [...loggedOnly].sort((a, b) => {
    const rDiff = (b.rating ?? 0) - (a.rating ?? 0);
    if (rDiff !== 0) return rDiff;
    if (a.liked !== b.liked) return a.liked ? -1 : 1;
    return (b.watchedDate || '').localeCompare(a.watchedDate || '');
  });

  const rankMap = new Map<string, number>();
  sortedByRating.forEach((f, idx) => {
    rankMap.set(f.id, idx + 1);
  });

  entries.forEach((f) => {
    f.customRank = f.watchlist ? null : rankMap.get(f.id) ?? null;
  });

  return entries;
}

function cloneArchive(films: FilmEntry[]): FilmEntry[] {
  return films.map((f) => ({
    ...f,
    tags: [...f.tags],
    genres: [...f.genres],
  }));
}

function buildPrimaryProfileWithSampleEdits(): {
  baselineFilms: FilmEntry[];
  workingFilms: FilmEntry[];
} {
  const baselineFilms = generateHighVolumeFilmArchive(2150, 1, 0);
  const workingFilms = cloneArchive(baselineFilms);

  // Seed 3 representative FrameSheet edits so deviation callouts and revert controls are immediately visible:
  // 1. Alter the review text on Rank #1 film to demonstrate inline word-level review diff callouts
  const rank1Film = workingFilms.find((f) => f.customRank === 1);
  if (rank1Film && rank1Film.notes) {
    rank1Film.notes = rank1Film.notes.replace(
      'razor-sharp',
      'career-defining, razor-sharp'
    ) + ' Upgraded on second 70mm screening.';
  }

  // 2. Adjust star rating on Rank #2 film compared to Letterboxd baseline
  const rank2Film = workingFilms.find((f) => f.customRank === 2);
  if (rank2Film) {
    rank2Film.rating = rank2Film.rating === 5.0 ? 4.5 : 5.0;
    rank2Film.tier = inferTierFromRating(rank2Film.rating);
  }

  // 3. Toggle a Watchlist item to Logged (Watched) in FrameSheet compared to Letterboxd's Watchlist truth
  const firstWatchlistFilm = workingFilms.find((f) => f.watchlist);
  if (firstWatchlistFilm) {
    firstWatchlistFilm.watchlist = false;
    firstWatchlistFilm.rating = 4.0;
    firstWatchlistFilm.watchedDate = '2026-10-30';
    firstWatchlistFilm.tier = 'A';
  }

  return { baselineFilms, workingFilms };
}

const primaryData = buildPrimaryProfileWithSampleEdits();
const compare1Baseline = generateHighVolumeFilmArchive(1680, 4, 0.2);
const compare2Baseline = generateHighVolumeFilmArchive(1240, 9, -0.25);

export const INITIAL_PROFILES: ProfileAccount[] = [
  {
    id: 'profile-primary',
    username: 'janderson_cinema',
    displayName: 'Julian Anderson',
    sourceType: 'csv_import',
    lastSyncedAt: '2026-10-30 21:45 UTC',
    profileUrl: 'https://letterboxd.com/janderson_cinema/',
    bio: '8-year Letterboxd archive (2,150 logged films, 35mm repertory screenings, festival diaries, and complete ratings ledger).',
    films: primaryData.workingFilms,
    baselineFilms: primaryData.baselineFilms,
    importedCsvStructure: {
      preset: 'diary',
      headers: [
        'Date',
        'Name',
        'Year',
        'Letterboxd URI',
        'Rating',
        'Rewatch',
        'Tags',
        'Watched Date',
      ],
      filename: 'diary.csv',
      dateOrder: 'desc',
      useFixedOneDecimalRating: false,
    },
  },
  {
    id: 'profile-compare-1',
    username: 'elena_rostova',
    displayName: 'Elena Rostova',
    sourceType: 'external_scrape',
    lastSyncedAt: '2026-10-30 20:10 UTC',
    profileUrl: 'https://letterboxd.com/elena_rostova/',
    bio: 'Film programmer & genre maximalist (1,680 logged films across international horror, sci-fi, and melodrama).',
    films: cloneArchive(compare1Baseline),
    baselineFilms: compare1Baseline,
  },
  {
    id: 'profile-compare-2',
    username: 'marcus_vance',
    displayName: 'Marcus Vance',
    sourceType: 'csv_import',
    lastSyncedAt: '2026-10-29 14:20 UTC',
    profileUrl: 'https://letterboxd.com/marcus_vance/',
    bio: 'Hard-boiled crime, 1970s New Hollywood, and international noir archive (1,240 logged films).',
    films: cloneArchive(compare2Baseline),
    baselineFilms: compare2Baseline,
    importedCsvStructure: {
      preset: 'diary',
      headers: [
        'Date',
        'Name',
        'Year',
        'Letterboxd URI',
        'Rating',
        'Rewatch',
        'Tags',
        'Watched Date',
      ],
      filename: 'diary.csv',
      dateOrder: 'desc',
      useFixedOneDecimalRating: false,
    },
  },
];


