import { FILM_CATALOG, slugifyTitle } from '../data/filmCatalog';
import { FilmEntry, ProfileAccount } from '../types/letterboxd';

export type RecommendationPathway =
  | 'all'
  | 'director_affinity'
  | 'writer_frequency'
  | 'subgenre_popular'
  | 'decade_sweet_spot';

export interface SupportingDiaryFilm {
  title: string;
  year: number;
  rating: number | null;
  rewatch: boolean;
}

export interface RecommendationDriverReason {
  type: Exclude<RecommendationPathway, 'all'>;
  headline: string;
  detail: string;
  supportingFilms: SupportingDiaryFilm[];
  weightScore: number;
}

export interface RecommendedFilmItem {
  slug: string;
  title: string;
  year: number;
  director: string;
  writers: string[];
  genres: string[];
  subgenres: string[];
  runtimeMinutes: number;
  country: string;
  letterboxdUri: string;
  popularityScore: number; // 1..100 Letterboxd community popularity index
  communityAvgRating: number; // e.g., 4.24
  acclaimNote: string;
  matchScore: number; // 55..99
  predictedRating: number; // 0.5..5.0
  primaryPathway: Exclude<RecommendationPathway, 'all'>;
  reasons: RecommendationDriverReason[];
  isOnWatchlist: boolean;
  watchlistAddedDate: string | null;
}

export interface AffinityEntityStat {
  name: string;
  count: number;
  ratedCount: number;
  avgRating: number;
  deltaVsMean: number;
  rewatches: number;
  sampleFilms: SupportingDiaryFilm[];
}

export interface ProfileTasteFingerprint {
  baselineMean: number;
  loggedCount: number;
  ratedCount: number;
  topDirectors: AffinityEntityStat[];
  topWriters: AffinityEntityStat[];
  topSubgenres: AffinityEntityStat[];
  topDecades: AffinityEntityStat[];
}

interface EnrichedCandidateSeed {
  title: string;
  year: number;
  slug: string;
  director: string;
  writers: string[];
  genres: string[];
  subgenres: string[];
  runtimeMinutes: number;
  country: string;
  popularityScore: number;
  communityAvgRating: number;
  acclaimNote: string;
}

/**
 * Maps directors and known films to their screenwriters and sub-genres so
 * every logged film in the user's diary contributes to Screenwriter and Sub-Genre
 * affinity calculations even when imported from standard Letterboxd CSVs.
 */
const DIRECTOR_CREATIVE_GRAPH: Record<
  string,
  { writers: string[]; subgenres: string[] }
> = {
  'Bong Joon-ho': {
    writers: ['Bong Joon-ho', 'Han Jin-won', 'Ha Joon-won'],
    subgenres: ['Social Thriller', 'Dark Satire', 'Procedural Mystery'],
  },
  'Park Chan-wook': {
    writers: ['Park Chan-wook', 'Jeong Seo-kyeong'],
    subgenres: ['Neo-Noir', 'Psychological Thriller', 'Vengeance Cinema'],
  },
  'Denis Villeneuve': {
    writers: ['Denis Villeneuve', 'Eric Roth', 'Jon Spaihts', 'Taylor Sheridan'],
    subgenres: ['Hard Sci-Fi', 'Atmospheric Mystery', 'Neo-Noir'],
  },
  'Christopher Nolan': {
    writers: ['Christopher Nolan', 'Jonathan Nolan'],
    subgenres: ['High-Concept Sci-Fi', 'Non-Linear Thriller', 'Historical Epic'],
  },
  'Paul Thomas Anderson': {
    writers: ['Paul Thomas Anderson'],
    subgenres: ['Character Study', 'Period Epic', 'Psychological Drama'],
  },
  'David Fincher': {
    writers: ['Aaron Sorkin', 'Andrew Kevin Walker', 'James Vanderbilt'],
    subgenres: ['Procedural Mystery', 'Neo-Noir', 'Psychological Thriller'],
  },
  'Martin Scorsese': {
    writers: ['Paul Schrader', 'Nicholas Pileggi', 'Steven Zaillian', 'Eric Roth'],
    subgenres: ['Crime Saga', 'Urban Noir', 'Character Study'],
  },
  'Stanley Kubrick': {
    writers: ['Stanley Kubrick', 'Arthur C. Clarke', 'Diane Johnson'],
    subgenres: ['Existential Sci-Fi', 'Psychological Horror', 'Period Epic'],
  },
  'Joel & Ethan Coen': {
    writers: ['Joel Coen', 'Ethan Coen'],
    subgenres: ['Neo-Noir', 'Dark Satire', 'Crime Procedural'],
  },
  'Michel Gondry': {
    writers: ['Charlie Kaufman', 'Michel Gondry'],
    subgenres: ['Surrealist Romance', 'Existential Sci-Fi'],
  },
  'Wong Kar-wai': {
    writers: ['Wong Kar-wai'],
    subgenres: ['Nocturnal Melodrama', 'Art-House Romance'],
  },
  'David Lynch': {
    writers: ['David Lynch', 'Barry Gifford', 'Robert Engels'],
    subgenres: ['Dream-Logic Mystery', 'Neo-Noir', 'Surrealist Horror'],
  },
  'Hayao Miyazaki': {
    writers: ['Hayao Miyazaki'],
    subgenres: ['Hand-Drawn Fantasy', 'Mythic Adventure'],
  },
  'Céline Sciamma': {
    writers: ['Céline Sciamma'],
    subgenres: ['Intimate Romantic Drama', 'Chamber Period Drama'],
  },
  'Justine Triet': {
    writers: ['Justine Triet', 'Arthur Harari'],
    subgenres: ['Legal & Procedural Mystery', 'Psychological Drama'],
  },
  'Celine Song': {
    writers: ['Celine Song'],
    subgenres: ['Intimate Romantic Drama', 'Character Study'],
  },
  'Yorgos Lanthimos': {
    writers: ['Tony McNamara', 'Efthimis Filippou', 'Yorgos Lanthimos'],
    subgenres: ['Absurdist Satire', 'Dark Satire', 'Surrealist Romance'],
  },
  'Luca Guadagnino': {
    writers: ['Justin Kuritzkes', 'David Kajganich', 'James Ivory'],
    subgenres: ['Sensory Melodrama', 'Intimate Romantic Drama'],
  },
  'Sean Baker': {
    writers: ['Sean Baker', 'Chris Bergoch'],
    subgenres: ['Social Realism', 'Dark Satire'],
  },
  'Robert Eggers': {
    writers: ['Robert Eggers', 'Max Eggers', 'Sjón'],
    subgenres: ['Folk & Cosmic Horror', 'Period Psychological Horror'],
  },
  'Ari Aster': {
    writers: ['Ari Aster'],
    subgenres: ['Folk & Cosmic Horror', 'Psychological Horror'],
  },
  'Alex Garland': {
    writers: ['Alex Garland'],
    subgenres: ['Hard Sci-Fi', 'Dystopian Thriller', 'Folk & Cosmic Horror'],
  },
  'Danny Boyle': {
    writers: ['Alex Garland', 'John Hodge'],
    subgenres: ['Dystopian Thriller', 'Kinetic Crime & Sci-Fi'],
  },
  'George Miller': {
    writers: ['George Miller', 'Nico Lathouris', 'Brendan McCarthy'],
    subgenres: ['Kinetic Action Opera', 'Dystopian Thriller'],
  },
  'Jordan Peele': {
    writers: ['Jordan Peele'],
    subgenres: ['Social Thriller', 'Folk & Cosmic Horror'],
  },
  'Damien Chazelle': {
    writers: ['Damien Chazelle'],
    subgenres: ['Obsessive Artist Drama', 'Jazz & Musical Cinema'],
  },
  'Greta Gerwig': {
    writers: ['Greta Gerwig', 'Noah Baumbach'],
    subgenres: ['Coming-of-Age Comedy', 'Character Study'],
  },
  'Michael Mann': {
    writers: ['Michael Mann', 'Eric Roth'],
    subgenres: ['Urban Noir', 'Tactical Action Thriller', 'Crime Procedural'],
  },
  'Quentin Tarantino': {
    writers: ['Quentin Tarantino'],
    subgenres: ['Non-Linear Crime', 'Revisionist Western', 'Vengeance Cinema'],
  },
  'Richard Linklater': {
    writers: ['Richard Linklater', 'Kim Krizan', 'Julie Delpy', 'Ethan Hawke'],
    subgenres: ['Intimate Romantic Drama', 'Walk-and-Talk Dialogue'],
  },
  'Akira Kurosawa': {
    writers: ['Akira Kurosawa', 'Shinobu Hashimoto', 'Hideo Oguni'],
    subgenres: ['Jidaigeki Samurai Epic', 'Procedural Mystery', 'Period Epic'],
  },
  'Alfred Hitchcock': {
    writers: ['Alec Coppel', 'Samuel A. Taylor', 'John Michael Hayes', 'Ernest Lehman'],
    subgenres: ['Psychological Thriller', 'Obsessive Mystery', 'Neo-Noir'],
  },
  'Andrei Tarkovsky': {
    writers: ['Andrei Tarkovsky', 'Arkady Strugatsky', 'Boris Strugatsky'],
    subgenres: ['Existential Sci-Fi', 'Poetic Slow Cinema'],
  },
  'John Carpenter': {
    writers: ['Bill Lancaster', 'John Carpenter', 'Debra Hill'],
    subgenres: ['Folk & Cosmic Horror', 'Synth-Driven Sci-Fi'],
  },
  'Agnès Varda': {
    writers: ['Agnès Varda'],
    subgenres: ['French New Wave', 'Essay & Personal Documentary'],
  },
  'Michael Haneke': {
    writers: ['Michael Haneke'],
    subgenres: ['Psychological Thriller', 'Social Thriller', 'Character Study'],
  },
  'Hirokazu Kore-eda': {
    writers: ['Hirokazu Kore-eda', 'Yuji Sakamoto'],
    subgenres: ['Humanist Family Drama', 'Character Study'],
  },
  'Kelly Reichardt': {
    writers: ['Kelly Reichardt', 'Jonathan Raymond'],
    subgenres: ['Minimalist Americana', 'Revisionist Western', 'Character Study'],
  },
  'Pedro Almodóvar': {
    writers: ['Pedro Almodóvar'],
    subgenres: ['Nocturnal Melodrama', 'Psychological Thriller'],
  },
  'Abbas Kiarostami': {
    writers: ['Abbas Kiarostami'],
    subgenres: ['Poetic Slow Cinema', 'Humanist Family Drama'],
  },
  'David Cronenberg': {
    writers: ['David Cronenberg', 'Steven Knight'],
    subgenres: ['Body & Techno Horror', 'Psychological Thriller', 'Existential Sci-Fi'],
  },
  'Kathryn Bigelow': {
    writers: ['Mark Boal', 'Kathryn Bigelow', 'James Cameron'],
    subgenres: ['Tactical Action Thriller', 'Procedural Mystery'],
  },
  'Apichatpong Weerasethakul': {
    writers: ['Apichatpong Weerasethakul'],
    subgenres: ['Dream-Logic Mystery', 'Poetic Slow Cinema'],
  },
  'Krzysztof Kieślowski': {
    writers: ['Krzysztof Kieślowski', 'Krzysztof Piesiewicz'],
    subgenres: ['Metaphysical Drama', 'Intimate Romantic Drama'],
  },
  'Rainer Werner Fassbinder': {
    writers: ['Rainer Werner Fassbinder'],
    subgenres: ['Nocturnal Melodrama', 'Social Thriller'],
  },
  'Chantal Akerman': {
    writers: ['Chantal Akerman'],
    subgenres: ['Poetic Slow Cinema', 'Character Study'],
  },
  'John Cassavetes': {
    writers: ['John Cassavetes'],
    subgenres: ['Character Study', 'Psychological Drama'],
  },
  'Dario Argento': {
    writers: ['Dario Argento', 'Daria Nicolodi'],
    subgenres: ['Giallo Supernatural Horror', 'Dream-Logic Mystery'],
  },
  'Satoshi Kon': {
    writers: ['Satoshi Kon', 'Sadayuki Murai'],
    subgenres: ['Psychological Anime Thriller', 'Dream-Logic Mystery'],
  },
  'Hou Hsiao-hsien': {
    writers: ['Chu T’ien-wen', 'Hou Hsiao-hsien'],
    subgenres: ['Poetic Slow Cinema', 'Period Epic'],
  },
  'Steven Soderbergh': {
    writers: ['Scott Z. Burns', 'Ed Solomon', 'David Koepp'],
    subgenres: ['Crime Procedural', 'Tactical Action Thriller', 'Social Thriller'],
  },
  'Éric Rohmer': {
    writers: ['Éric Rohmer'],
    subgenres: ['Walk-and-Talk Dialogue', 'Intimate Romantic Drama'],
  },
  'Tsai Ming-liang': {
    writers: ['Tsai Ming-liang', 'Tsai Yi-chun'],
    subgenres: ['Poetic Slow Cinema', 'Nocturnal Melodrama'],
  },
  'Lucrecia Martel': {
    writers: ['Lucrecia Martel'],
    subgenres: ['Atmospheric Mystery', 'Psychological Drama'],
  },
};

/**
 * Curated candidate film pool spanning unseen works by the exact directors,
 * screenwriters, sub-genres, and eras tracked in FrameSheet.
 */
const EXTRA_RECOMMENDATION_CANDIDATES: EnrichedCandidateSeed[] = [
  {
    title: 'Mother',
    year: 2009,
    slug: 'mother-2009',
    director: 'Bong Joon-ho',
    writers: ['Bong Joon-ho', 'Park Eun-kyo'],
    genres: ['Crime', 'Drama', 'Mystery'],
    subgenres: ['Procedural Mystery', 'Social Thriller', 'Psychological Thriller'],
    runtimeMinutes: 129,
    country: 'South Korea',
    popularityScore: 93,
    communityAvgRating: 4.18,
    acclaimNote: 'Un Certain Regard Premiere · Asian Film Award for Best Film & Screenplay',
  },
  {
    title: 'The Host',
    year: 2006,
    slug: 'the-host-2006',
    director: 'Bong Joon-ho',
    writers: ['Bong Joon-ho', 'Ha Joon-won', 'Baek Chul-hyun'],
    genres: ['Horror', 'Sci-Fi', 'Drama'],
    subgenres: ['Social Thriller', 'Dark Satire', 'Folk & Cosmic Horror'],
    runtimeMinutes: 120,
    country: 'South Korea',
    popularityScore: 91,
    communityAvgRating: 3.98,
    acclaimNote: 'Cannes Directors’ Fortnight · Blue Dragon Best Film Winner',
  },
  {
    title: 'Joint Security Area',
    year: 2000,
    slug: 'joint-security-area',
    director: 'Park Chan-wook',
    writers: ['Park Chan-wook', 'Jeong Seo-kyeong', 'Kim Hyun-seok'],
    genres: ['Mystery', 'Thriller', 'Drama'],
    subgenres: ['Procedural Mystery', 'Neo-Noir', 'Psychological Thriller'],
    runtimeMinutes: 110,
    country: 'South Korea',
    popularityScore: 92,
    communityAvgRating: 4.21,
    acclaimNote: 'Berlinale Competition · Blue Dragon Best Film & Director',
  },
  {
    title: 'Sympathy for Mr. Vengeance',
    year: 2002,
    slug: 'sympathy-for-mr-vengeance',
    director: 'Park Chan-wook',
    writers: ['Park Chan-wook', 'Lee Jae-soon', 'Lee Moo-young'],
    genres: ['Crime', 'Thriller', 'Drama'],
    subgenres: ['Vengeance Cinema', 'Neo-Noir', 'Social Thriller'],
    runtimeMinutes: 129,
    country: 'South Korea',
    popularityScore: 89,
    communityAvgRating: 4.02,
    acclaimNote: 'First chapter of Park Chan-wook’s Vengeance Trilogy',
  },
  {
    title: 'Incendies',
    year: 2010,
    slug: 'incendies-2010',
    director: 'Denis Villeneuve',
    writers: ['Denis Villeneuve', 'Valérie Beaugrand-Champagne'],
    genres: ['Drama', 'Mystery', 'History'],
    subgenres: ['Atmospheric Mystery', 'Psychological Drama', 'Non-Linear Thriller'],
    runtimeMinutes: 131,
    country: 'Canada',
    popularityScore: 96,
    communityAvgRating: 4.38,
    acclaimNote: 'Academy Award Nominee for Best International Feature · Letterboxd Top 100',
  },
  {
    title: 'Prisoners',
    year: 2013,
    slug: 'prisoners-2013',
    director: 'Denis Villeneuve',
    writers: ['Aaron Guzikowski'],
    genres: ['Crime', 'Thriller', 'Mystery'],
    subgenres: ['Procedural Mystery', 'Neo-Noir', 'Psychological Thriller'],
    runtimeMinutes: 153,
    country: 'USA',
    popularityScore: 97,
    communityAvgRating: 4.24,
    acclaimNote: 'Academy Award Nominee for Best Cinematography (Roger Deakins)',
  },
  {
    title: 'Sicario',
    year: 2015,
    slug: 'sicario-2015',
    director: 'Denis Villeneuve',
    writers: ['Taylor Sheridan'],
    genres: ['Action', 'Crime', 'Thriller'],
    subgenres: ['Tactical Action Thriller', 'Neo-Noir', 'Crime Procedural'],
    runtimeMinutes: 121,
    country: 'USA',
    popularityScore: 95,
    communityAvgRating: 4.08,
    acclaimNote: 'Cannes Palme d’Or Competition · 3× Academy Award Nominee',
  },
  {
    title: 'The Prestige',
    year: 2006,
    slug: 'the-prestige',
    director: 'Christopher Nolan',
    writers: ['Christopher Nolan', 'Jonathan Nolan'],
    genres: ['Mystery', 'Thriller', 'Sci-Fi'],
    subgenres: ['Non-Linear Thriller', 'Obsessive Artist Drama', 'Period Epic'],
    runtimeMinutes: 130,
    country: 'UK',
    popularityScore: 97,
    communityAvgRating: 4.29,
    acclaimNote: 'Letterboxd Top 250 Narrative Feature · 2× Academy Award Nominee',
  },
  {
    title: 'Memento',
    year: 2000,
    slug: 'memento-2000',
    director: 'Christopher Nolan',
    writers: ['Christopher Nolan', 'Jonathan Nolan'],
    genres: ['Mystery', 'Thriller', 'Crime'],
    subgenres: ['Non-Linear Thriller', 'Neo-Noir', 'Psychological Thriller'],
    runtimeMinutes: 113,
    country: 'USA',
    popularityScore: 96,
    communityAvgRating: 4.19,
    acclaimNote: 'Academy Award Nominee for Best Original Screenplay & Editing',
  },
  {
    title: 'Boogie Nights',
    year: 1997,
    slug: 'boogie-nights',
    director: 'Paul Thomas Anderson',
    writers: ['Paul Thomas Anderson'],
    genres: ['Drama', 'Comedy'],
    subgenres: ['Character Study', 'Period Epic', 'Crime Saga'],
    runtimeMinutes: 155,
    country: 'USA',
    popularityScore: 95,
    communityAvgRating: 4.28,
    acclaimNote: '3× Academy Award Nominee including Best Original Screenplay',
  },
  {
    title: 'Magnolia',
    year: 1999,
    slug: 'magnolia-1999',
    director: 'Paul Thomas Anderson',
    writers: ['Paul Thomas Anderson'],
    genres: ['Drama'],
    subgenres: ['Character Study', 'Psychological Drama', 'Nocturnal Melodrama'],
    runtimeMinutes: 188,
    country: 'USA',
    popularityScore: 94,
    communityAvgRating: 4.23,
    acclaimNote: 'Berlinale Golden Bear Winner · 3× Academy Award Nominee',
  },
  {
    title: 'Se7en',
    year: 1995,
    slug: 'se7en-1995',
    director: 'David Fincher',
    writers: ['Andrew Kevin Walker'],
    genres: ['Crime', 'Mystery', 'Thriller'],
    subgenres: ['Procedural Mystery', 'Neo-Noir', 'Psychological Thriller'],
    runtimeMinutes: 127,
    country: 'USA',
    popularityScore: 98,
    communityAvgRating: 4.34,
    acclaimNote: 'Letterboxd Top 100 · Iconic 1990s Neo-Noir Procedural',
  },
  {
    title: 'The Girl with the Dragon Tattoo',
    year: 2011,
    slug: 'the-girl-with-the-dragon-tattoo-2011',
    director: 'David Fincher',
    writers: ['Steven Zaillian'],
    genres: ['Crime', 'Mystery', 'Thriller'],
    subgenres: ['Procedural Mystery', 'Neo-Noir', 'Atmospheric Mystery'],
    runtimeMinutes: 158,
    country: 'USA',
    popularityScore: 92,
    communityAvgRating: 3.96,
    acclaimNote: 'Academy Award Winner for Best Film Editing',
  },
  {
    title: 'After Hours',
    year: 1985,
    slug: 'after-hours-1985',
    director: 'Martin Scorsese',
    writers: ['Joseph Minion'],
    genres: ['Comedy', 'Thriller', 'Drama'],
    subgenres: ['Urban Noir', 'Dark Satire', 'Surrealist Mystery'],
    runtimeMinutes: 97,
    country: 'USA',
    popularityScore: 94,
    communityAvgRating: 4.22,
    acclaimNote: 'Cannes Best Director Winner · Criterion Spine #1189',
  },
  {
    title: 'The King of Comedy',
    year: 1982,
    slug: 'the-king-of-comedy',
    director: 'Martin Scorsese',
    writers: ['Paul D. Zimmerman'],
    genres: ['Drama', 'Comedy', 'Crime'],
    subgenres: ['Character Study', 'Dark Satire', 'Obsessive Artist Drama'],
    runtimeMinutes: 109,
    country: 'USA',
    popularityScore: 93,
    communityAvgRating: 4.19,
    acclaimNote: 'BAFTA Winner for Best Original Screenplay',
  },
  {
    title: 'First Reformed',
    year: 2017,
    slug: 'first-reformed',
    director: 'Paul Schrader',
    writers: ['Paul Schrader'],
    genres: ['Drama', 'Thriller'],
    subgenres: ['Character Study', 'Psychological Drama', 'Poetic Slow Cinema'],
    runtimeMinutes: 113,
    country: 'USA',
    popularityScore: 92,
    communityAvgRating: 4.12,
    acclaimNote: 'Written by Taxi Driver screenwriter Paul Schrader · Oscar Nominee',
  },
  {
    title: 'Synecdoche, New York',
    year: 2008,
    slug: 'synecdoche-new-york',
    director: 'Charlie Kaufman',
    writers: ['Charlie Kaufman'],
    genres: ['Drama'],
    subgenres: ['Obsessive Artist Drama', 'Surrealist Romance', 'Existential Sci-Fi'],
    runtimeMinutes: 124,
    country: 'USA',
    popularityScore: 94,
    communityAvgRating: 4.26,
    acclaimNote: 'Written & directed by Eternal Sunshine screenwriter Charlie Kaufman',
  },
  {
    title: 'Adaptation.',
    year: 2002,
    slug: 'adaptation-2002',
    director: 'Spike Jonze',
    writers: ['Charlie Kaufman'],
    genres: ['Comedy', 'Drama', 'Crime'],
    subgenres: ['Obsessive Artist Drama', 'Dark Satire', 'Surrealist Romance'],
    runtimeMinutes: 115,
    country: 'USA',
    popularityScore: 93,
    communityAvgRating: 4.14,
    acclaimNote: 'BAFTA Winner for Best Adapted Screenplay (Charlie Kaufman)',
  },
  {
    title: 'Ex Machina',
    year: 2014,
    slug: 'ex-machina-2014',
    director: 'Alex Garland',
    writers: ['Alex Garland'],
    genres: ['Sci-Fi', 'Thriller', 'Drama'],
    subgenres: ['Hard Sci-Fi', 'Psychological Thriller', 'Dystopian Thriller'],
    runtimeMinutes: 108,
    country: 'UK',
    popularityScore: 96,
    communityAvgRating: 4.06,
    acclaimNote: 'Academy Award Winner & Best Original Screenplay Nominee (Alex Garland)',
  },
  {
    title: 'Annihilation',
    year: 2018,
    slug: 'annihilation-2018',
    director: 'Alex Garland',
    writers: ['Alex Garland'],
    genres: ['Sci-Fi', 'Horror', 'Mystery'],
    subgenres: ['Hard Sci-Fi', 'Folk & Cosmic Horror', 'Atmospheric Mystery'],
    runtimeMinutes: 115,
    country: 'UK',
    popularityScore: 93,
    communityAvgRating: 3.79,
    acclaimNote: 'Written & directed by Alex Garland · Cosmic Sci-Fi Landmark',
  },
  {
    title: 'Sunshine',
    year: 2007,
    slug: 'sunshine-2007',
    director: 'Danny Boyle',
    writers: ['Alex Garland'],
    genres: ['Sci-Fi', 'Thriller'],
    subgenres: ['Hard Sci-Fi', 'Existential Sci-Fi', 'Psychological Thriller'],
    runtimeMinutes: 107,
    country: 'UK',
    popularityScore: 90,
    communityAvgRating: 3.88,
    acclaimNote: 'Danny Boyle & screenwriter Alex Garland collaboration',
  },
  {
    title: 'Caché',
    year: 2005,
    slug: 'cache-2005',
    director: 'Michael Haneke',
    writers: ['Michael Haneke'],
    genres: ['Mystery', 'Thriller', 'Drama'],
    subgenres: ['Psychological Thriller', 'Social Thriller', 'Atmospheric Mystery'],
    runtimeMinutes: 117,
    country: 'France',
    popularityScore: 93,
    communityAvgRating: 4.11,
    acclaimNote: 'Cannes Best Director & FIPRESCI Prize Winner · Sight & Sound Top 100',
  },
  {
    title: 'The Piano Teacher',
    year: 2001,
    slug: 'the-piano-teacher',
    director: 'Michael Haneke',
    writers: ['Michael Haneke'],
    genres: ['Drama', 'Romance'],
    subgenres: ['Psychological Drama', 'Obsessive Artist Drama', 'Character Study'],
    runtimeMinutes: 131,
    country: 'Austria',
    popularityScore: 95,
    communityAvgRating: 4.27,
    acclaimNote: 'Cannes Grand Prix, Best Actress & Best Actor Winner · Criterion Collection',
  },
  {
    title: 'Shoplifters',
    year: 2018,
    slug: 'shoplifters-2018',
    director: 'Hirokazu Kore-eda',
    writers: ['Hirokazu Kore-eda'],
    genres: ['Drama', 'Crime'],
    subgenres: ['Humanist Family Drama', 'Social Realism', 'Character Study'],
    runtimeMinutes: 121,
    country: 'Japan',
    popularityScore: 96,
    communityAvgRating: 4.29,
    acclaimNote: 'Cannes Palme d’Or Winner · Academy Award Nominee',
  },
  {
    title: 'Monster',
    year: 2023,
    slug: 'monster-2023',
    director: 'Hirokazu Kore-eda',
    writers: ['Yuji Sakamoto'],
    genres: ['Drama', 'Mystery', 'Thriller'],
    subgenres: ['Humanist Family Drama', 'Non-Linear Thriller', 'Procedural Mystery'],
    runtimeMinutes: 126,
    country: 'Japan',
    popularityScore: 96,
    communityAvgRating: 4.38,
    acclaimNote: 'Cannes Best Screenplay Winner (Yuji Sakamoto) · Letterboxd Top 100',
  },
  {
    title: 'First Cow',
    year: 2019,
    slug: 'first-cow',
    director: 'Kelly Reichardt',
    writers: ['Kelly Reichardt', 'Jonathan Raymond'],
    genres: ['Drama', 'History'],
    subgenres: ['Minimalist Americana', 'Revisionist Western', 'Character Study'],
    runtimeMinutes: 122,
    country: 'USA',
    popularityScore: 91,
    communityAvgRating: 4.02,
    acclaimNote: 'New York Film Critics Circle Best Film Winner',
  },
  {
    title: 'All About My Mother',
    year: 1999,
    slug: 'all-about-my-mother',
    director: 'Pedro Almodóvar',
    writers: ['Pedro Almodóvar'],
    genres: ['Drama', 'Comedy'],
    subgenres: ['Nocturnal Melodrama', 'Character Study'],
    runtimeMinutes: 101,
    country: 'Spain',
    popularityScore: 94,
    communityAvgRating: 4.28,
    acclaimNote: 'Academy Award Winner for Best International Feature · Cannes Best Director',
  },
  {
    title: 'Videodrome',
    year: 1983,
    slug: 'videodrome',
    director: 'David Cronenberg',
    writers: ['David Cronenberg'],
    genres: ['Horror', 'Sci-Fi', 'Mystery'],
    subgenres: ['Body & Techno Horror', 'Surrealist Horror', 'Psychological Thriller'],
    runtimeMinutes: 87,
    country: 'Canada',
    popularityScore: 93,
    communityAvgRating: 4.05,
    acclaimNote: 'Criterion Collection Spine #248 · Landmark Body & Media Horror',
  },
  {
    title: 'Eastern Promises',
    year: 2007,
    slug: 'eastern-promises',
    director: 'David Cronenberg',
    writers: ['Steven Knight'],
    genres: ['Crime', 'Thriller', 'Drama'],
    subgenres: ['Crime Saga', 'Urban Noir', 'Procedural Mystery'],
    runtimeMinutes: 100,
    country: 'UK',
    popularityScore: 91,
    communityAvgRating: 3.97,
    acclaimNote: 'TIFF People’s Choice Award Winner · Written by Steven Knight',
  },
  {
    title: 'Perfect Blue',
    year: 1997,
    slug: 'perfect-blue',
    director: 'Satoshi Kon',
    writers: ['Sadayuki Murai', 'Satoshi Kon'],
    genres: ['Animation', 'Thriller', 'Horror'],
    subgenres: ['Psychological Anime Thriller', 'Dream-Logic Mystery', 'Obsessive Artist Drama'],
    runtimeMinutes: 81,
    country: 'Japan',
    popularityScore: 97,
    communityAvgRating: 4.39,
    acclaimNote: 'Letterboxd Top 50 All-Time · Masterpiece of Psychological Animation',
  },
  {
    title: 'Paprika',
    year: 2006,
    slug: 'paprika-2006',
    director: 'Satoshi Kon',
    writers: ['Satoshi Kon', 'Seishi Minakami'],
    genres: ['Animation', 'Sci-Fi', 'Mystery'],
    subgenres: ['Psychological Anime Thriller', 'Dream-Logic Mystery', 'High-Concept Sci-Fi'],
    runtimeMinutes: 90,
    country: 'Japan',
    popularityScore: 95,
    communityAvgRating: 4.18,
    acclaimNote: 'Venice Golden Lion Competition · Visionary Sci-Fi Anime',
  },
  {
    title: 'Three Colors: Red',
    year: 1994,
    slug: 'three-colors-red',
    director: 'Krzysztof Kieślowski',
    writers: ['Krzysztof Kieślowski', 'Krzysztof Piesiewicz'],
    genres: ['Drama', 'Mystery', 'Romance'],
    subgenres: ['Metaphysical Drama', 'Intimate Romantic Drama'],
    runtimeMinutes: 99,
    country: 'France',
    popularityScore: 96,
    communityAvgRating: 4.36,
    acclaimNote: '3× Academy Award Nominee including Best Director & Original Screenplay',
  },
  {
    title: 'The Double Life of Véronique',
    year: 1991,
    slug: 'the-double-life-of-veronique',
    director: 'Krzysztof Kieślowski',
    writers: ['Krzysztof Kieślowski', 'Krzysztof Piesiewicz'],
    genres: ['Drama', 'Mystery', 'Music'],
    subgenres: ['Metaphysical Drama', 'Art-House Romance', 'Dream-Logic Mystery'],
    runtimeMinutes: 98,
    country: 'France',
    popularityScore: 93,
    communityAvgRating: 4.21,
    acclaimNote: 'Cannes Best Actress & FIPRESCI Prize Winner · Criterion Collection',
  },
  {
    title: 'Close-Up',
    year: 1990,
    slug: 'close-up-1990',
    director: 'Abbas Kiarostami',
    writers: ['Abbas Kiarostami'],
    genres: ['Documentary', 'Drama', 'Crime'],
    subgenres: ['Poetic Slow Cinema', 'Legal & Procedural Mystery', 'Essay & Personal Documentary'],
    runtimeMinutes: 98,
    country: 'Iran',
    popularityScore: 96,
    communityAvgRating: 4.44,
    acclaimNote: 'Sight & Sound Top 20 All-Time Poll · Criterion Collection',
  },
  {
    title: 'Cleo from 5 to 7',
    year: 1962,
    slug: 'cleo-from-5-to-7',
    director: 'Agnès Varda',
    writers: ['Agnès Varda'],
    genres: ['Drama', 'Music'],
    subgenres: ['French New Wave', 'Character Study'],
    runtimeMinutes: 90,
    country: 'France',
    popularityScore: 95,
    communityAvgRating: 4.31,
    acclaimNote: 'Sight & Sound Top 15 All-Time · Defining French New Wave Classic',
  },
  {
    title: 'Zero Dark Thirty',
    year: 2012,
    slug: 'zero-dark-thirty',
    director: 'Kathryn Bigelow',
    writers: ['Mark Boal'],
    genres: ['Thriller', 'Drama', 'History'],
    subgenres: ['Tactical Action Thriller', 'Procedural Mystery'],
    runtimeMinutes: 157,
    country: 'USA',
    popularityScore: 91,
    communityAvgRating: 3.89,
    acclaimNote: '5× Academy Award Nominee including Best Picture & Best Original Screenplay',
  },
  {
    title: 'Strange Days',
    year: 1995,
    slug: 'strange-days-1995',
    director: 'Kathryn Bigelow',
    writers: ['James Cameron', 'Jay Cocks'],
    genres: ['Sci-Fi', 'Crime', 'Thriller'],
    subgenres: ['Neo-Noir', 'Body & Techno Horror', 'Tactical Action Thriller'],
    runtimeMinutes: 145,
    country: 'USA',
    popularityScore: 92,
    communityAvgRating: 4.09,
    acclaimNote: 'Directed by Kathryn Bigelow · Cult 1990s Cyberpunk Neo-Noir',
  },
  {
    title: 'Suspiria',
    year: 1977,
    slug: 'suspiria-1977',
    director: 'Dario Argento',
    writers: ['Dario Argento', 'Daria Nicolodi'],
    genres: ['Horror', 'Mystery'],
    subgenres: ['Giallo Supernatural Horror', 'Dream-Logic Mystery'],
    runtimeMinutes: 99,
    country: 'Italy',
    popularityScore: 94,
    communityAvgRating: 4.07,
    acclaimNote: 'Technicolor Giallo Landmark · Score by Goblin',
  },
  {
    title: 'The Insider',
    year: 1999,
    slug: 'the-insider-1999',
    director: 'Michael Mann',
    writers: ['Michael Mann', 'Eric Roth'],
    genres: ['Drama', 'Thriller', 'History'],
    subgenres: ['Procedural Mystery', 'Social Thriller', 'Character Study'],
    runtimeMinutes: 157,
    country: 'USA',
    popularityScore: 93,
    communityAvgRating: 4.19,
    acclaimNote: '7× Academy Award Nominee · Written by Michael Mann & Eric Roth',
  },
  {
    title: 'Thief',
    year: 1981,
    slug: 'thief-1981',
    director: 'Michael Mann',
    writers: ['Michael Mann'],
    genres: ['Crime', 'Thriller', 'Drama'],
    subgenres: ['Urban Noir', 'Crime Procedural', 'Synth-Driven Sci-Fi'],
    runtimeMinutes: 123,
    country: 'USA',
    popularityScore: 94,
    communityAvgRating: 4.18,
    acclaimNote: 'Cannes Palme d’Or Competition · Criterion Collection Spine #700',
  },
  {
    title: 'Michael Clayton',
    year: 2007,
    slug: 'michael-clayton',
    director: 'Tony Gilroy',
    writers: ['Tony Gilroy'],
    genres: ['Thriller', 'Drama', 'Crime'],
    subgenres: ['Legal & Procedural Mystery', 'Neo-Noir', 'Social Thriller'],
    runtimeMinutes: 119,
    country: 'USA',
    popularityScore: 94,
    communityAvgRating: 4.16,
    acclaimNote: '7× Academy Award Nominee including Best Picture & Original Screenplay',
  },
  {
    title: 'High and Low',
    year: 1963,
    slug: 'high-and-low',
    director: 'Akira Kurosawa',
    writers: ['Akira Kurosawa', 'Hideo Oguni', 'Ryuuzo Kikushima', 'Eijiro Hisaita'],
    genres: ['Crime', 'Drama', 'Mystery'],
    subgenres: ['Procedural Mystery', 'Social Thriller', 'Urban Noir'],
    runtimeMinutes: 143,
    country: 'Japan',
    popularityScore: 98,
    communityAvgRating: 4.59,
    acclaimNote: 'Letterboxd #2 Highest-Rated Narrative Feature · Criterion Collection',
  },
  {
    title: 'Ran',
    year: 1985,
    slug: 'ran-1985',
    director: 'Akira Kurosawa',
    writers: ['Akira Kurosawa', 'Hideo Oguni', 'Masato Ide'],
    genres: ['Action', 'Drama', 'History'],
    subgenres: ['Jidaigeki Samurai Epic', 'Period Epic'],
    runtimeMinutes: 162,
    country: 'Japan',
    popularityScore: 97,
    communityAvgRating: 4.46,
    acclaimNote: 'Academy Award Winner & Best Director Nominee · 4K Restoration Classic',
  },
  {
    title: 'Rear Window',
    year: 1954,
    slug: 'rear-window',
    director: 'Alfred Hitchcock',
    writers: ['John Michael Hayes'],
    genres: ['Mystery', 'Thriller'],
    subgenres: ['Obsessive Mystery', 'Psychological Thriller', 'Procedural Mystery'],
    runtimeMinutes: 112,
    country: 'USA',
    popularityScore: 98,
    communityAvgRating: 4.38,
    acclaimNote: '4× Academy Award Nominee · National Film Registry Essential',
  },
  {
    title: 'Fallen Angels',
    year: 1995,
    slug: 'fallen-angels-1995',
    director: 'Wong Kar-wai',
    writers: ['Wong Kar-wai'],
    genres: ['Crime', 'Romance', 'Drama'],
    subgenres: ['Nocturnal Melodrama', 'Urban Noir', 'Art-House Romance'],
    runtimeMinutes: 99,
    country: 'Hong Kong',
    popularityScore: 96,
    communityAvgRating: 4.31,
    acclaimNote: 'Companion to Chungking Express · Shot by Christopher Doyle',
  },
  {
    title: 'Lost Highway',
    year: 1997,
    slug: 'lost-highway',
    director: 'David Lynch',
    writers: ['David Lynch', 'Barry Gifford'],
    genres: ['Mystery', 'Thriller', 'Horror'],
    subgenres: ['Dream-Logic Mystery', 'Neo-Noir', 'Surrealist Horror'],
    runtimeMinutes: 134,
    country: 'USA',
    popularityScore: 93,
    communityAvgRating: 4.13,
    acclaimNote: 'Criterion Collection 4K Restoration · Co-written by Barry Gifford',
  },
  {
    title: 'The Witch',
    year: 2015,
    slug: 'the-witch-2015',
    director: 'Robert Eggers',
    writers: ['Robert Eggers'],
    genres: ['Horror', 'Mystery', 'Drama'],
    subgenres: ['Folk & Cosmic Horror', 'Period Psychological Horror'],
    runtimeMinutes: 93,
    country: 'USA',
    popularityScore: 95,
    communityAvgRating: 3.92,
    acclaimNote: 'Sundance Directing Award Winner · Landmark A24 Folk Horror',
  },
  {
    title: 'Inside Llewyn Davis',
    year: 2013,
    slug: 'inside-llewyn-davis',
    director: 'Joel & Ethan Coen',
    writers: ['Joel Coen', 'Ethan Coen'],
    genres: ['Drama', 'Music'],
    subgenres: ['Obsessive Artist Drama', 'Character Study', 'Jazz & Musical Cinema'],
    runtimeMinutes: 105,
    country: 'USA',
    popularityScore: 95,
    communityAvgRating: 4.16,
    acclaimNote: 'Cannes Grand Prix Winner · Criterion Collection Spine #800',
  },
  {
    title: 'Miller’s Crossing',
    year: 1990,
    slug: 'millers-crossing',
    director: 'Joel & Ethan Coen',
    writers: ['Joel Coen', 'Ethan Coen'],
    genres: ['Crime', 'Drama', 'Thriller'],
    subgenres: ['Neo-Noir', 'Crime Saga', 'Period Epic'],
    runtimeMinutes: 115,
    country: 'USA',
    popularityScore: 92,
    communityAvgRating: 4.12,
    acclaimNote: 'Written & directed by Joel & Ethan Coen · Criterion Collection',
  },
  {
    title: 'Solaris',
    year: 1972,
    slug: 'solaris-1972',
    director: 'Andrei Tarkovsky',
    writers: ['Andrei Tarkovsky', 'Fridrikh Gorenshteyn'],
    genres: ['Sci-Fi', 'Drama', 'Mystery'],
    subgenres: ['Existential Sci-Fi', 'Poetic Slow Cinema', 'Psychological Drama'],
    runtimeMinutes: 167,
    country: 'USSR',
    popularityScore: 95,
    communityAvgRating: 4.33,
    acclaimNote: 'Cannes Grand Prix Winner · Sight & Sound Top 100',
  },
];

/**
 * Infers screenwriters and sub-genres for any film entry (either from our explicit
 * seed table, the director creative graph, or genre heuristics).
 */
export function resolveWritersAndSubgenres(
  title: string,
  director: string,
  genres: string[],
  slug?: string
): { writers: string[]; subgenres: string[] } {
  const lowerSlug = (slug || '').toLowerCase();
  const lowerTitle = title.toLowerCase();

  const extraMatch = EXTRA_RECOMMENDATION_CANDIDATES.find(
    (c) => c.slug.toLowerCase() === lowerSlug || c.title.toLowerCase() === lowerTitle
  );
  if (extraMatch) {
    return { writers: extraMatch.writers, subgenres: extraMatch.subgenres };
  }

  const graph = DIRECTOR_CREATIVE_GRAPH[director];
  if (graph) {
    return {
      writers: graph.writers,
      subgenres: graph.subgenres,
    };
  }

  // Fallback sub-genres derived from primary genres
  const inferredSubgenres: string[] = [];
  if (genres.includes('Crime') && genres.includes('Thriller')) {
    inferredSubgenres.push('Neo-Noir', 'Procedural Mystery');
  } else if (genres.includes('Sci-Fi') && genres.includes('Horror')) {
    inferredSubgenres.push('Folk & Cosmic Horror', 'Body & Techno Horror');
  } else if (genres.includes('Sci-Fi')) {
    inferredSubgenres.push('Hard Sci-Fi', 'Existential Sci-Fi');
  } else if (genres.includes('Horror')) {
    inferredSubgenres.push('Psychological Horror', 'Folk & Cosmic Horror');
  } else if (genres.includes('Mystery') || genres.includes('Thriller')) {
    inferredSubgenres.push('Psychological Thriller', 'Procedural Mystery');
  } else if (genres.includes('Romance')) {
    inferredSubgenres.push('Intimate Romantic Drama');
  } else {
    inferredSubgenres.push('Character Study');
  }

  return {
    writers: director ? [director] : ['Ensemble Screenplay'],
    subgenres: inferredSubgenres,
  };
}

/**
 * Builds the full universe of candidate films by combining:
 * 1. EXTRA_RECOMMENDATION_CANDIDATES (iconic unseen films by key directors/writers/sub-genres)
 * 2. FILM_CATALOG (92 canonical films with enriched writer & sub-genre metadata)
 * 3. Any films currently on the user's Letterboxd Watchlist (so Watchlist items are evaluated and badged)
 */
function buildCandidatePool(profile: ProfileAccount): EnrichedCandidateSeed[] {
  const map = new Map<string, EnrichedCandidateSeed>();

  for (const seed of EXTRA_RECOMMENDATION_CANDIDATES) {
    map.set(seed.slug.toLowerCase(), seed);
  }

  for (const cat of FILM_CATALOG) {
    const key = cat.slug.toLowerCase();
    if (!map.has(key)) {
      const { writers, subgenres } = resolveWritersAndSubgenres(
        cat.title,
        cat.director,
        cat.genres,
        cat.slug
      );
      map.set(key, {
        title: cat.title,
        year: cat.year,
        slug: cat.slug,
        director: cat.director,
        writers,
        genres: cat.genres,
        subgenres,
        runtimeMinutes: cat.runtimeMinutes,
        country: cat.country,
        popularityScore: 91,
        communityAvgRating: 4.18,
        acclaimNote: `Acclaimed ${cat.year} ${cat.country} cinema essential`,
      });
    }
  }

  // Also include any film currently on the user's Watchlist so it can be scored & badged
  for (const f of profile.films) {
    if (!f.watchlist) continue;
    const key = (f.slug || slugifyTitle(f.title, f.year)).toLowerCase();
    if (!map.has(key)) {
      const { writers, subgenres } = resolveWritersAndSubgenres(
        f.title,
        f.director,
        f.genres,
        f.slug
      );
      map.set(key, {
        title: f.title,
        year: f.year,
        slug: f.slug || key,
        director: f.director,
        writers,
        genres: f.genres,
        subgenres,
        runtimeMinutes: f.runtimeMinutes || 115,
        country: f.country || 'USA',
        popularityScore: 86,
        communityAvgRating: 4.04,
        acclaimNote: 'Saved on your Letterboxd Watchlist',
      });
    }
  }

  return Array.from(map.values());
}

export function computeProfileRecommendations(profile: ProfileAccount): {
  fingerprint: ProfileTasteFingerprint;
  recommendations: RecommendedFilmItem[];
  dismissedItems: RecommendedFilmItem[];
} {
  const loggedFilms = profile.films.filter((f) => !f.watchlist);
  const watchlistFilms = profile.films.filter((f) => f.watchlist);
  const ratedFilms = loggedFilms.filter((f) => f.rating !== null);

  const baselineMean =
    ratedFilms.length > 0
      ? ratedFilms.reduce((acc, f) => acc + (f.rating ?? 0), 0) / ratedFilms.length
      : 3.5;

  // Sets for fast lookup
  const loggedSlugs = new Set<string>();
  const loggedTitleYearKeys = new Set<string>();
  for (const f of loggedFilms) {
    if (f.slug) loggedSlugs.add(f.slug.toLowerCase());
    loggedSlugs.add(slugifyTitle(f.title, f.year).toLowerCase());
    loggedTitleYearKeys.add(`${f.title.trim().toLowerCase()}::${f.year}`);
  }

  const watchlistBySlug = new Map<string, FilmEntry>();
  const watchlistByTitleYear = new Map<string, FilmEntry>();
  for (const f of watchlistFilms) {
    if (f.slug) watchlistBySlug.set(f.slug.toLowerCase(), f);
    watchlistBySlug.set(slugifyTitle(f.title, f.year).toLowerCase(), f);
    watchlistByTitleYear.set(`${f.title.trim().toLowerCase()}::${f.year}`, f);
  }

  const dismissedSet = new Set<string>(
    (profile.dismissedRecommendations || []).map((s) => s.toLowerCase())
  );

  // Accumulate stats across 4 dimensions: Director, Screenwriter, Sub-Genre, Release Decade
  const directorMap = new Map<string, AffinityEntityStat>();
  const writerMap = new Map<string, AffinityEntityStat>();
  const subgenreMap = new Map<string, AffinityEntityStat>();
  const decadeMap = new Map<string, AffinityEntityStat>();

  const recordEntity = (
    map: Map<string, AffinityEntityStat>,
    key: string,
    film: FilmEntry
  ) => {
    if (!key) return;
    let stat = map.get(key);
    if (!stat) {
      stat = {
        name: key,
        count: 0,
        ratedCount: 0,
        avgRating: baselineMean,
        deltaVsMean: 0,
        rewatches: 0,
        sampleFilms: [],
      };
      map.set(key, stat);
    }
    stat.count += 1;
    if (film.rewatch) stat.rewatches += 1;
    if (film.rating !== null) {
      const prevSum = stat.avgRating * stat.ratedCount;
      stat.ratedCount += 1;
      stat.avgRating = (prevSum + film.rating) / stat.ratedCount;
      stat.deltaVsMean = stat.avgRating - baselineMean;
    }
    if (stat.sampleFilms.length < 10) {
      stat.sampleFilms.push({
        title: film.title,
        year: film.year,
        rating: film.rating,
        rewatch: film.rewatch,
      });
    }
  };

  for (const f of loggedFilms) {
    if (f.director && f.director !== 'Catalog Enriched') {
      recordEntity(directorMap, f.director, f);
    }
    const { writers, subgenres } = resolveWritersAndSubgenres(
      f.title,
      f.director,
      f.genres,
      f.slug
    );
    for (const w of writers) {
      recordEntity(writerMap, w, f);
    }
    for (const sg of subgenres) {
      recordEntity(subgenreMap, sg, f);
    }
    const dec = `${Math.floor(f.year / 10) * 10}s`;
    recordEntity(decadeMap, dec, f);
  }

  // Sort sampleFilms inside each stat by rating desc so citations highlight the user's favorite logged films
  const finalizeStats = (map: Map<string, AffinityEntityStat>, minCount = 2) => {
    const list = Array.from(map.values());
    list.forEach((s) => {
      s.sampleFilms.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    });
    return list
      .filter((s) => s.count >= minCount)
      .sort(
        (a, b) =>
          b.deltaVsMean * Math.min(4, b.count) - a.deltaVsMean * Math.min(4, a.count) ||
          b.count - a.count
      );
  };

  const fingerprint: ProfileTasteFingerprint = {
    baselineMean,
    loggedCount: loggedFilms.length,
    ratedCount: ratedFilms.length,
    topDirectors: finalizeStats(directorMap, 2).slice(0, 6),
    topWriters: finalizeStats(writerMap, 2)
      .sort((a, b) => b.count * (1 + Math.max(0, b.deltaVsMean)) - a.count * (1 + Math.max(0, a.deltaVsMean)))
      .slice(0, 6),
    topSubgenres: finalizeStats(subgenreMap, 3)
      .sort((a, b) => b.count * (1 + Math.max(0, b.deltaVsMean)) - a.count * (1 + Math.max(0, a.deltaVsMean)))
      .slice(0, 6),
    topDecades: finalizeStats(decadeMap, 3).slice(0, 5),
  };

  // Evaluate all unlogged candidate films
  const candidates = buildCandidatePool(profile);
  const activeRecommendations: RecommendedFilmItem[] = [];
  const dismissedItems: RecommendedFilmItem[] = [];

  for (const cand of candidates) {
    const slugLower = cand.slug.toLowerCase();
    const titleYearKey = `${cand.title.trim().toLowerCase()}::${cand.year}`;

    // Skip if already logged/watched by the user
    if (loggedSlugs.has(slugLower) || loggedTitleYearKeys.has(titleYearKey)) {
      continue;
    }

    const watchlistMatch =
      watchlistBySlug.get(slugLower) || watchlistByTitleYear.get(titleYearKey);

    const reasons: RecommendationDriverReason[] = [];

    // 1. Director Affinity Signal
    const dirStat = directorMap.get(cand.director);
    if (dirStat && dirStat.count >= 1 && (dirStat.deltaVsMean >= 0.05 || dirStat.count >= 3)) {
      const dirWeight =
        28 +
        Math.max(0, dirStat.deltaVsMean) * 26 +
        Math.min(18, dirStat.count * 2.2) +
        Math.min(8, dirStat.rewatches * 2);
      const sign = dirStat.deltaVsMean >= 0 ? '+' : '';
      reasons.push({
        type: 'director_affinity',
        headline: `Unseen film by high-affinity director ${cand.director}`,
        detail: `You logged ${dirStat.count.toLocaleString()} film${
          dirStat.count === 1 ? '' : 's'
        } by ${cand.director} with an average of ${dirStat.avgRating.toFixed(2)}★ (${sign}${dirStat.deltaVsMean.toFixed(
          2
        )}★ vs. your ${baselineMean.toFixed(2)}★ mean).`,
        supportingFilms: dirStat.sampleFilms.slice(0, 3),
        weightScore: dirWeight,
      });
    }

    // 2. Screenwriter Frequency Signal
    let bestWriterStat: AffinityEntityStat | null = null;
    for (const w of cand.writers) {
      const wStat = writerMap.get(w);
      if (!wStat || wStat.count < 2) continue;
      if (
        !bestWriterStat ||
        wStat.count * (1 + Math.max(0, wStat.deltaVsMean)) >
          bestWriterStat.count * (1 + Math.max(0, bestWriterStat.deltaVsMean))
      ) {
        bestWriterStat = wStat;
      }
    }
    if (bestWriterStat && bestWriterStat.count >= 2) {
      const writerWeight =
        24 +
        Math.min(22, bestWriterStat.count * 2.4) +
        Math.max(0, bestWriterStat.deltaVsMean) * 20;
      const sign = bestWriterStat.deltaVsMean >= 0 ? '+' : '';
      reasons.push({
        type: 'writer_frequency',
        headline: `Written by frequent screenwriter ${bestWriterStat.name}`,
        detail: `You have logged ${bestWriterStat.count.toLocaleString()} films written by ${
          bestWriterStat.name
        } (avg ${bestWriterStat.avgRating.toFixed(2)}★, ${sign}${bestWriterStat.deltaVsMean.toFixed(
          2
        )}★ vs. profile mean).`,
        supportingFilms: bestWriterStat.sampleFilms.slice(0, 3),
        weightScore: writerWeight,
      });
    }

    // 3. Popular Film in Frequently Watched Sub-Genre Signal
    let bestSubgenreStat: AffinityEntityStat | null = null;
    for (const sg of cand.subgenres) {
      const sgStat = subgenreMap.get(sg);
      if (!sgStat || sgStat.count < 2) continue;
      if (
        !bestSubgenreStat ||
        sgStat.count * (1 + Math.max(0, sgStat.deltaVsMean)) >
          bestSubgenreStat.count * (1 + Math.max(0, bestSubgenreStat.deltaVsMean))
      ) {
        bestSubgenreStat = sgStat;
      }
    }
    if (bestSubgenreStat) {
      const sgSharePct =
        loggedFilms.length > 0
          ? Math.round((bestSubgenreStat.count / loggedFilms.length) * 100)
          : 0;
      const sgWeight =
        20 +
        Math.min(20, Math.log2(bestSubgenreStat.count + 1) * 3.2) +
        Math.max(0, bestSubgenreStat.deltaVsMean) * 18 +
        (cand.popularityScore - 80) * 0.45;
      reasons.push({
        type: 'subgenre_popular',
        headline: `Popular landmark in ${bestSubgenreStat.name}`,
        detail: `You frequently watch ${
          bestSubgenreStat.name
        } (${bestSubgenreStat.count.toLocaleString()} logged films${
          sgSharePct > 0 ? `, ${sgSharePct}% of diary` : ''
        } · avg ${bestSubgenreStat.avgRating.toFixed(2)}★) and this holds a ${cand.communityAvgRating.toFixed(
          2
        )}★ community rating.`,
        supportingFilms: bestSubgenreStat.sampleFilms.slice(0, 3),
        weightScore: sgWeight,
      });
    }

    // 4. Era / Release Decade Bias Signal
    const decKey = `${Math.floor(cand.year / 10) * 10}s`;
    const decStat = decadeMap.get(decKey);
    if (decStat && decStat.count >= 3 && (decStat.deltaVsMean >= 0.02 || decStat.count >= 25)) {
      const decWeight =
        16 +
        Math.max(0, decStat.deltaVsMean) * 24 +
        Math.min(14, Math.log2(decStat.count + 1) * 2);
      const sign = decStat.deltaVsMean >= 0 ? '+' : '';
      reasons.push({
        type: 'decade_sweet_spot',
        headline: `${decKey} Cinema Sweet Spot (${cand.year})`,
        detail: `You have logged ${decStat.count.toLocaleString()} films from the ${decKey} at an average of ${decStat.avgRating.toFixed(
          2
        )}★ (${sign}${decStat.deltaVsMean.toFixed(2)}★ vs. baseline).`,
        supportingFilms: decStat.sampleFilms.slice(0, 3),
        weightScore: decWeight,
      });
    }

    if (reasons.length === 0) continue;

    // Sort reasons by weight descending so the strongest signal is primary
    reasons.sort((a, b) => b.weightScore - a.weightScore);
    const primaryReason = reasons[0];

    // Composite match score (62..99%)
    const topWeight = primaryReason.weightScore;
    const secondaryBonus = reasons
      .slice(1)
      .reduce((acc, r) => acc + r.weightScore * 0.22, 0);
    const rawScore = Math.round(topWeight + secondaryBonus);
    const matchScore = Math.max(64, Math.min(99, rawScore));

    // Predicted personal rating anchored to user's baseline + weighted signal delta
    const dirDelta = dirStat ? dirStat.deltaVsMean * 0.45 : 0;
    const writerDelta = bestWriterStat ? bestWriterStat.deltaVsMean * 0.25 : 0;
    const sgDelta = bestSubgenreStat ? bestSubgenreStat.deltaVsMean * 0.2 : 0;
    const acclaimBoost = (cand.communityAvgRating - 4.0) * 0.35;
    const rawPred = baselineMean + dirDelta + writerDelta + sgDelta + acclaimBoost;
    const predictedRating = Math.max(
      3.0,
      Math.min(5.0, Math.round(rawPred * 2) / 2)
    );

    const item: RecommendedFilmItem = {
      slug: cand.slug,
      title: cand.title,
      year: cand.year,
      director: cand.director,
      writers: cand.writers,
      genres: cand.genres,
      subgenres: cand.subgenres,
      runtimeMinutes: cand.runtimeMinutes,
      country: cand.country,
      letterboxdUri: `https://letterboxd.com/film/${cand.slug}/`,
      popularityScore: cand.popularityScore,
      communityAvgRating: cand.communityAvgRating,
      acclaimNote: cand.acclaimNote,
      matchScore,
      predictedRating,
      primaryPathway: primaryReason.type,
      reasons,
      isOnWatchlist: Boolean(watchlistMatch),
      watchlistAddedDate: watchlistMatch?.loggedDate || null,
    };

    if (dismissedSet.has(slugLower)) {
      dismissedItems.push(item);
    } else {
      activeRecommendations.push(item);
    }
  }

  activeRecommendations.sort(
    (a, b) =>
      b.matchScore - a.matchScore ||
      b.communityAvgRating - a.communityAvgRating ||
      a.title.localeCompare(b.title)
  );

  dismissedItems.sort((a, b) => b.matchScore - a.matchScore);

  return {
    fingerprint,
    recommendations: activeRecommendations,
    dismissedItems,
  };
}
