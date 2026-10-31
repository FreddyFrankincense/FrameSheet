# FrameSheet Personal Film Recommendation & Affinity Engine

Adds a dedicated **Recommendations** workspace that analyzes the active Letterboxd profile's rating history, rewatch behavior, and diary volume across directors, screenwriters, sub-genres, and release decades to recommend unseen films—complete with transparent match evidence, Watchlist badges and one-click Watchlist addition, and a persistent **Remove from Consideration** workflow with a restore drawer.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following product and UX decisions incorporate your confirmed preferences from the clarification step:

- **Confirmed Decision 1 — Dedicated Workspace Tab**: The Recommendation Engine lives in its own **Recommendations** tab in the main navigation bar and left workspace sidebar.
- **Confirmed Decision 2 — Watchlist Films Included with Badge**: Unlogged films that are already on the user's Letterboxd Watchlist remain eligible for recommendation and appear mixed into the ranked results with an explicit **On Watchlist** indicator, while brand-new discoveries feature a one-click **+ Add to Watchlist** action.
- **Confirmed Decision 3 — Dismissal & Watchlist Controls**: Every recommended film includes a **Remove from Consideration** button that immediately excludes it from future recommendations for the active profile, paired with a collapsible **Dismissed Films Drawer** where removed titles can be inspected or restored at any time.

---

## 1. Overview & Core Concept

- **What It Does**: Evaluates every film the user has logged (`!watchlist`) to construct a personalized **Taste & Affinity Profile**, then scores a rich candidate pool of unseen cinema across four core recommendation pathways:
  1. **High-Affinity Directors**: Unseen films by directors whose logged work the user rates above their personal profile mean (or has logged/rewatched multiple times).
  2. **Frequent Screenwriters & Collaborators**: Unseen films written by screenwriters whose scripts the user has logged multiple times across their diary (even when directed by different filmmakers).
  3. **Sub-Genre & Thematic Niche Favorites**: Highly acclaimed and popular unseen films within specific sub-genres (e.g., *Psychological Thriller*, *Neo-Noir*, *Hard Sci-Fi*, *Slow-Burn Character Drama*, *Legal & Procedural Mystery*, *Folk & Cosmic Horror*) that the user frequently watches or rates generously.
  4. **Era & Release Decade Sweet Spots**: Essential unseen films from the specific cinematic decades where the user exhibits their strongest positive rating bias.
- **Target Audience / Persona**: Letterboxd power users and cinephiles who want transparent, data-backed recommendations grounded in their actual diary statistics rather than opaque black-box suggestions.
- **Key Value**: Connects the user's historical rating ledger directly to actionable discovery—allowing them to filter by recommendation reason, add discoveries straight to their Letterboxd Watchlist, and permanently prune unwanted titles via the **Remove from Consideration** control.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Profile Taste Fingerprint Strip**: Opening the **Recommendations** tab displays a 4-column summary of the active profile's top drivers: *Top Positive-Bias Directors*, *Most-Logged Screenwriters*, *Signature Sub-Genres*, and *Peak Rating Decade*, alongside a button to open the **Dismissed Films Drawer**.
  2. **Recommendation Pathway & Filter Bar**: Users can view **All Ranked Recommendations** or filter by a specific recommendation driver (*Director Affinity*, *Writer Frequency*, *Sub-Genre Volume*, *Decade Sweet Spot*), filter by Watchlist status (*All Unseen*, *Not Yet on Watchlist*, *Already on Watchlist*), or search within recommendations.
  3. **Explainable Recommendation Ledger & Cards**: Each recommended film displays:
     - Title, release year, director, screenwriter(s), runtime, country, and sub-genre metadata rendered as clean unboxed text with `·` separators.
     - **Match Score & Primary Driver**: Tabular match score alongside the concrete diary evidence (e.g., *"Directed by Park Chan-wook (+0.74★ above your 3.62★ mean across 3 logged films: The Handmaiden, Oldboy, Decision to Leave)"* or *"Written by Charlie Kaufman (3 films logged in your diary, avg 4.50★)"*).
     - **Watchlist Status & Action**: If the film is already in the profile's Watchlist, it displays an **On Watchlist** status indicator; otherwise, a **+ Add to Watchlist** button appends the film directly to the user's FrameSheet Watchlist (and tracks the addition in the Summary of Changes).
     - **Remove from Consideration Button**: Clicking **Remove from Consideration** immediately dismisses the film from the recommendation list and increments the counter on the **Dismissed Films** button.
  4. **Manageable Dismissed Films Drawer**: Clicking **Dismissed Films (`N`)** expands a clean management tray listing all films removed from consideration for the active profile, with individual **Restore** buttons and a **Restore All** action.

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: High-density editorial SaaS analytics workspace matching FrameSheet's dark slate and amber visual language.
  - *Color Palette & Mood*: Deep slate canvas (`#020617` / `bg-slate-950`), elevated structural containers (`#0F172A` / `bg-slate-900`) with `1px` hairline borders (`border-slate-800`), warm amber primary accents (`#F59E0B` / `text-amber-400`) for star ratings and affinity scores, sky blue (`#38BDF8` / `text-sky-400`) for Watchlist indicators, and emerald (`#34D399` / `text-emerald-400`) for positive rating bias deltas.
  - *Typography & Hierarchy*: Crisp display headings (`font-display font-semibold`), scannable body metadata (`12px`–`14px`), and strict `font-mono tabular-nums` alignment for all match percentages, star rating deltas, release years, and counts.
  - *Component Styling & Layout*: Full-width 1440px desktop layout with single-elevation cards (`border border-slate-800`), zero static pill clutter (metadata separated by `·`), and single-line interactive filter controls (`whitespace-nowrap shrink-0`).

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Deterministic Multi-Signal Scoring Over Opaque Heuristics**
  - *Chosen Approach*: Compute an explicit composite affinity score (`0–99%`) from four weighted, auditable components: Director Rating Bias & Volume, Screenwriter Diary Frequency, Sub-Genre Volume & Rating Delta, and Release Decade Affinity, plus community acclaim weighting.
  - *Why*: Users can see the exact mathematical reason a film was surfaced (including the specific logged films and star ratings from their diary that contributed to the match), and recommendations update instantaneously whenever the user edits a rating or logs a movie in the Spreadsheet.
  - *Alternatives Considered*: Static genre matching alone was rejected because it ignores auteur/writer loyalty and personal rating bias relative to the user's mean.

- **Decision 2: Profile-Scoped Persistent Dismissal List (`dismissedRecommendationIds`)**
  - *Chosen Approach*: Store dismissed candidate film slugs/IDs per profile inside `localStorage` so each Letterboxd account maintains its own independent "Removed from Consideration" list across browser sessions.
  - *Why*: Switching between profiles in FrameSheet immediately reflects each user's personal logged history, Watchlist, and dismissed recommendations without cross-contaminating accounts.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          App.tsx (Workspace State)                           │
│  • profiles: ProfileAccount[] (films, baselineFilms, dismissedRecSlugs)      │
│  • activeTab: 'spreadsheet' | 'analytics' | 'recommendations' | ...          │
└───────────────────┬──────────────────────────────────────┬───────────────────┘
                    │                                      │
                    ▼                                      ▼
┌─────────────────────────────────────────┐  ┌─────────────────────────────────┐
│     Recommendation Affinity Engine      │  │   Enriched Candidate Catalog    │
│  1. Analyze logged films (!watchlist):  │  │  • Directors & Screenwriters    │
│     - Profile baseline mean & stdDev    │◄─┤  • Sub-genres & thematic motifs │
│     - Director avg ★ delta & count      │  │  • Release year / decade        │
│     - Screenwriter log count & avg ★    │  │  • Acclaim & popularity index   │
│     - Sub-genre volume & ★ bias         │  └─────────────────────────────────┘
│     - Decade volume & ★ bias            │
│  2. Filter out already-logged films     │
│     and dismissedRecSlugs               │
│  3. Tag films present on user Watchlist │
└───────────────────┬─────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           RecommendationsView.tsx                            │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ Profile Taste Fingerprint (Top Directors · Writers · Sub-Genres · Era) │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ Pathway Filter Tabs │ Watchlist Filter │ Search │ Dismissed Drawer (N) │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ Ranked Recommendation List / Grid                                      │  │
│  │  • Match Score % + Explainable Diary Citation ("Because you rated...") │  │
│  │  • Watchlist Status Badge OR [+ Add to Watchlist] Action               │  │
│  │  • [Remove from Consideration] Action                                  │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Data Model & State**:
  - **Enriched Candidate Metadata**: Extends the candidate film catalog with `writers: string[]`, `subgenres: string[]`, `popularityScore: number`, and `acclaimNote: string`, while also dynamically enriching any logged films via slug/title lookup so screenwriter and sub-genre affinities can be calculated from the user's existing diary.
  - **Per-Profile Dismissal Persistence**: Adds `dismissedRecommendations?: string[]` (array of film slugs) to `ProfileAccount` (backed by `localStorage`) so dismissed films are remembered per profile.

- **Interactive Component & State Mapping**:
  - **Pathway & Watchlist Filtering**: Clicking pathway tabs (*All Signals*, *High-Rated Directors*, *Frequent Writers*, *Popular in Sub-Genre*, *Decade Favorites*) or toggling Watchlist inclusion filters the scored candidate list in real time.
  - **Add to Watchlist Handler**: Clicking **+ Add to Watchlist** creates or updates the corresponding `FilmEntry` with `watchlist: true` and `watchedDate: null` in `activeProfile.films` via `onUpdateFilms`, immediately transitioning the item's state to **On Watchlist** and recording the change in **Summary of Changes**.
  - **Remove from Consideration & Restore Handlers**: Clicking **Remove from Consideration** appends the candidate's `slug` to the active profile's `dismissedRecommendations` list, removing it from the active view. Opening the **Dismissed Films Drawer** allows clicking **Restore** on any individual film or **Restore All** to return them to the recommendation pool.
