# BiteClimb Sprint Plan: Purchase-Decision Engine
## Core Lens: "I'm at a restaurant (or I know the cuisine). What should I ORDER?"

BiteClimb sits AFTER restaurant discovery. The user already picked a place or
cuisine. Every feature must help them pick the right DISH faster.

---

## Sprint A: Fix Broken Dish-Selection Flows

### A1. Restaurant Detail Page — "What to Order Here"
The #1 broken flow. Dead links everywhere. Backend API already returns dishes
with tiers, labels, and "Known For" auto-assignment.

**Backend** (already done — `GET /api/restaurants/:id` returns enriched dishes):
- No backend changes needed

**Frontend** — new file: `src/pages/RestaurantDetailPage.tsx`
- Hero: restaurant image, name, neighborhood, community tier
- **"What to Order" section** (top of page, above the fold):
  - Ranked dish list sorted by tier score, standout dishes pinned to top
  - Each dish shows: image, name, tier badge, price, top label, rating count
  - "Known For" dish gets a gold crown/highlight treatment
  - "Worth it %" on each dish for quick decision signal
- Labels visible per dish (Spiciest, Best Value, Best Looking, etc.)
- Community tier distribution for the restaurant overall
- Link from every dish row to DishDetailPage for deep-dive

**Files to modify:**
- `src/App.tsx` — add `/restaurant/:id` route
- `src/api/client.ts` — RestaurantDetailData type already exists, may need enrichment

### A2. Dish-Level Cuisine Rankings — "Best Pizza in Town"
Current rankings show best RESTAURANTS per cuisine. That's Yelp's job.
We need: "Best individual DISHES by cuisine" — the actual decision helper.

**Backend** — new endpoint: `GET /api/dishes/top-by-cuisine`
- Group all dishes by cuisine
- Rank dishes within each cuisine by weighted tier score
- Return: dish name, restaurant, price, tier, labels, rating count, confidence
- Support `?cuisine=Italian` filter

**Frontend** — modify `src/pages/CuisineRankingsPage.tsx`
- Add view toggle: "Best Restaurants" vs "Best Dishes" (default to dishes)
- "Best Dishes" view shows ranked dish cards with:
  - #1/#2/#3 medals, dish image, name, restaurant name, price, tier badge
  - Top labels (Most Popular, Best Tasting, etc.)
  - Rating count + confidence indicator
- This answers: "show me the top 5 pizzas across all restaurants"

### A3. Price on DishCard — Comparison Shopping
Price exists in data but isn't shown on cards. Can't comparison-shop blind.

**Frontend** — modify `src/components/DishCard.tsx`
- Add `price` prop to DishCardProps
- Display price alongside tier badge or in info section
- Show on all dish grids (Discover, Rankings, Restaurant Detail)

**Files to modify:**
- `src/components/DishCard.tsx` — add price display
- `src/pages/DiscoverPage.tsx` — pass price prop
- Update any DishCard usage that needs price

### A4. Seed Data Expansion (Minimal)
Add 2-3 dishes to key restaurants so "What to order here" works.

**File:** `server/seed.ts`
- Olivia (r1): add Cacio e Pepe, Osso Buco
- Eddie & Sams (r7): add Pepperoni Pizza, Garlic Knots
- Ichicoro Ramen (r3): add Spicy Miso Ramen
- Curry Leaves (r8): add Chicken Tikka Masala, Garlic Naan
- Add ratings for new dishes from existing users
- Add a few labels for new dishes

---

## Sprint B: ELO Comparative Ranking Engine

### B1. ELO Data Model + Scoring Engine
The differentiator. Instead of users self-reporting S/A/B/C/D/F (subjective),
they get shown two dishes and pick "which was better?" ELO derives the ranking.

**Backend** — new table + engine:
- `dish_elo` table: dish_id, elo_score (default 1500), matches_played
- `elo_matches` table: id, user_id, dish_a_id, dish_b_id, winner_id, created_at
- ELO calculation: K-factor adjusts with match count (high K early, low K after
  many matches for stability)
- New endpoint: `GET /api/dishes/matchup` — returns a pair of dishes from same
  cuisine for head-to-head comparison
- New endpoint: `POST /api/dishes/matchup` — submit winner, update ELO scores
- New endpoint: `GET /api/dishes/elo-rankings?cuisine=X` — ranked by ELO score

**Frontend** — new file: `src/pages/MatchupPage.tsx`
- "Which was better?" card showing two dishes side-by-side
- Each shows: image, name, restaurant, price
- Tap left or right to pick winner
- Swipe animation for fun/speed
- After picking: shows updated ELO scores briefly, loads next matchup
- "Skip" option if user hasn't tried one

**How it connects to purchase decisions:**
- ELO rankings are MORE trustworthy than self-reported tiers (harder to game)
- "This pizza has beaten 8 other pizzas head-to-head" is a strong buy signal
- Rankings page can show both community tier AND ELO ranking for comparison
- DishCard/DishDetailPage shows ELO rank within cuisine: "#2 Pizza in Tampa"

### B2. ELO Integration into Existing UI
After ELO engine works, surface it where decisions happen:

- **DishCard**: show ELO rank badge ("#2 Pizza" or "#1 Ramen")
- **DishDetailPage**: "Ranked #2 out of 12 pizzas" with head-to-head record
- **Restaurant Detail**: sort dishes by ELO rank (not just tier)
- **Rankings Page**: ELO view alongside community tier view
- **DiscoverPage**: "Top by ELO" sort option

---

## Sprint C: Intent-Based Discovery

### C1. Value Score — "Best Bang for Buck"
The user asked about "Best Value" label but there's no calculation behind it.

**Backend:**
- Compute value_score = tier_weight / price_numeric (parse "$18" to 18)
- Add to dish response: `value_score` field
- New sort option: `sort=value` on GET /api/dishes

**Frontend:**
- "Best Value" sort/filter on Discover page
- Value indicator on DishCard (price-to-quality ratio visual)
- "Great value" badge auto-assigned to top value_score dishes per cuisine

### C2. Vibe/Mood Tags — "Date Night Sushi" vs "Quick Lunch Tacos"
From the Letterboxd nanogenres research. Helps with intent-based discovery.

**Backend:**
- `dish_vibes` table: id, user_id, dish_id, vibe, created_at
- Predefined vibes: "Date Night", "Quick Lunch", "Comfort Food",
  "Impress Visitors", "Late Night", "Hangover Cure", "Group Friendly"
- Vibe voting (same pattern as dish labels)
- Filter dishes by vibe on GET /api/dishes?vibe=date-night

**Frontend:**
- Vibe chips on DiscoverPage (above or alongside cuisine filters)
- Vibe voting section on DishDetailPage (alongside labels)
- Vibe badges on DishCard when relevant

---

## Implementation Order (Priority)

1. **A1** — RestaurantDetailPage (fixes dead links, unblocks dish selection)
2. **A2** — Dish-level cuisine rankings (answers "best pizza in town")
3. **A3** — Price on DishCard (enables comparison shopping)
4. **A4** — Seed data expansion (makes restaurant detail page useful)
5. **B1** — ELO engine (core differentiator, objective ranking)
6. **B2** — ELO integration into existing UI
7. **C1** — Value scoring
8. **C2** — Vibe/mood tags

## Files Summary

### New Files
- `src/pages/RestaurantDetailPage.tsx`
- `src/pages/MatchupPage.tsx`

### Modified Files
- `server/db.ts` — dish_elo, elo_matches, dish_vibes tables
- `server/routes/dishRoutes.ts` — top-by-cuisine, matchup, ELO endpoints
- `server/routes/restaurantRoutes.ts` — enriched restaurant detail
- `server/seed.ts` — additional dishes + ratings + labels
- `src/App.tsx` — new routes
- `src/api/client.ts` — new types + endpoints
- `src/components/DishCard.tsx` — price display, ELO rank badge
- `src/pages/CuisineRankingsPage.tsx` — dish rankings view toggle
- `src/pages/DiscoverPage.tsx` — value sort, vibe filters
- `src/pages/DishDetailPage.tsx` — ELO rank display, vibe voting
- `src/components/Navigation.tsx` — matchup nav item (optional)
