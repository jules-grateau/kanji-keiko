-- Progression et répétition espacée : la copie fidèle de public/js/srs.js, goal.js et streak.js.
-- Même règles, mêmes constantes, même format de données que l'appli : le compagnon (wow/companion)
-- n'a qu'à recopier la sauvegarde dans un sens ou dans l'autre. Si une règle change dans l'appli,
-- la changer ici aussi.
--
-- Sauvegarde (SavedVariables KanjiKeikoDB, écrite par WoW à la déconnexion ou sur /reload) :
--   srs[kanji]   = { boîte, prochaineRévision (ms), nbJustes, nbRatés }   (entrée de l'appli, indices +1)
--   intro[jour]  = { kanji découverts ce jour-là }      days = { "AAAA-MM-JJ", … } (série)
--   settings     = { skip = {niveaux exclus}, goal, hard, t }                ui = position, échelle…
--   sync         = { at = date de la dernière synchro (ms) }, écrit par le compagnon

local _, ns = ...
local S = {}
ns.srs = S

S.INTERVAL_DAYS = { 0, 1, 2, 4, 8, 16, 32, 64, 128, 256, 365 }   -- délai par boîte : INTERVAL_DAYS[boîte + 1]
S.MAX_BOX = 10
S.LEARNED_BOX = 4
S.MASTERED_BOX = 6
S.LAPSE_DROP = 2
S.RELEARN_SUCCESSES = 2
S.REDO_GAP = 4
S.RELEARN_GAP = 10
S.DISCOVER_GAP = 2
S.FUZZ_FROM_DAYS = 8
S.FUZZ = 0.1
S.DAY_START_HOUR = 4
S.LEVELS = { 5, 4, 3, 2, 1 }
S.KNOWN_BOX = 99
S.KNOWN_DUE = 4102444800000   -- 1er janvier 2100 (ms) : date qui n'arrive jamais
S.INTRO_KEEP_DAYS = 14
S.EXTRA_STEP = 5

local db
S.byChar = {}

-- ---------- Outils ----------

local function contains(list, v)
  for _, x in ipairs(list) do if x == v then return true end end
  return false
end

local function copy(t)
  if type(t) ~= "table" then return t end
  local out = {}
  for k, v in pairs(t) do out[k] = copy(v) end
  return out
end
S.copy = copy

-- 1000.0 : toujours en décimal (Lua 5.1 de WoW l'est déjà ; évite les entiers 32 bits d'autres interpréteurs).
local function nowMs() return time() * 1000.0 end
S.nowMs = nowMs

-- ---------- Sauvegarde ----------

local function normalizeSettings(s)
  if type(s) ~= "table" then return { skip = {}, goal = 10, hard = false, t = 0 } end
  local skip = {}
  for _, n in ipairs(type(s.skip) == "table" and s.skip or {}) do
    if contains(S.LEVELS, n) then table.insert(skip, n) end
  end
  local goal = tonumber(s.goal)
  if not goal or goal < 1 or goal > 100 or goal ~= math.floor(goal) then goal = 10 end
  return { skip = skip, goal = goal, hard = s.hard and true or false, t = tonumber(s.t) or 0 }
end

function S.Init()
  KanjiKeikoDB = KanjiKeikoDB or {}
  db = KanjiKeikoDB
  db.srs = db.srs or {}
  db.intro = db.intro or {}
  db.days = db.days or {}
  db.settings = normalizeSettings(db.settings)
  db.ui = db.ui or {}
  db.sync = db.sync or {}
  for _, r in ipairs(ns.kanji) do S.byChar[r[1]] = r end
  S.db = db
end

-- ---------- Jours d'étude ----------

-- Début (4 h) du jour d'étude d'aujourd'hui, décalé de `offset` jours, en ms. Avant 4 h, on est « la veille ».
function S.studyDayStart(offset)
  local t = date("*t", time() - S.DAY_START_HOUR * 3600)
  t.hour, t.min, t.sec, t.isdst = S.DAY_START_HOUR, 0, 0, nil
  t.day = t.day + (offset or 0)   -- time() normalise les débordements de mois
  return time(t) * 1000.0
end

local function dayKey(ms) return date("%Y-%m-%d", math.floor(ms / 1000)) end
function S.todayKey() return dayKey(S.studyDayStart(0)) end

local function previousDay(key)
  local y, m, d = key:match("^(%d+)-(%d+)-(%d+)$")
  return date("%Y-%m-%d", time({ year = tonumber(y), month = tonumber(m), day = tonumber(d) - 1, hour = 12 }))
end

function S.isDue(e) return e[2] < S.studyDayStart(1) end

-- ---------- Niveaux, nouveaux, révisions ----------

function S.levelStats()
  local out = {}
  for _, n in ipairs(S.LEVELS) do out[n] = { total = 0, seen = 0, learned = 0, mastered = 0 } end
  for _, r in ipairs(ns.kanji) do
    local o, e = out[r[2]], db.srs[r[1]]
    o.total = o.total + 1
    if e then
      o.seen = o.seen + 1
      if e[1] >= S.LEARNED_BOX then o.learned = o.learned + 1 end
      if e[1] >= S.MASTERED_BOX then o.mastered = o.mastered + 1 end
    end
  end
  return out
end

-- Kanji jamais vus des niveaux actifs (N5 d'abord), au plus `limit`.
function S.newKanji(limit)
  local out = {}
  for _, r in ipairs(ns.kanji) do
    if not db.srs[r[1]] and not contains(db.settings.skip, r[2]) then
      table.insert(out, r[1])
      if limit and #out >= limit then break end
    end
  end
  return out
end

-- Toutes les révisions échues, les plus anciennes d'abord, sans plafond.
function S.dueKanji()
  local out, tomorrow = {}, S.studyDayStart(1)
  for k, e in pairs(db.srs) do
    if S.byChar[k] and e[2] < tomorrow then table.insert(out, k) end
  end
  table.sort(out, function(a, b) return db.srs[a][2] < db.srs[b][2] end)
  return out
end

-- ---------- Objectif du jour et série ----------

function S.introducedToday() return db.intro[S.todayKey()] or {} end

function S.goalInfo()
  local done, goal = #S.introducedToday(), db.settings.goal
  return { done = done, goal = goal, reached = done >= goal }
end

function S.goalRemaining() return math.max(0, db.settings.goal - #S.introducedToday()) end

-- Nouveaux pour la séance : ceux qui restent pour l'objectif, ou `extraNew` de plus une fois atteint.
function S.freshKanji(extraNew)
  local n = (extraNew and extraNew > 0) and extraNew or S.goalRemaining()
  if n == 0 then return {} end
  return S.newKanji(n)
end

local function pruneIntro()
  local keys = {}
  for d in pairs(db.intro) do table.insert(keys, d) end
  table.sort(keys)
  for i = 1, #keys - S.INTRO_KEEP_DAYS do db.intro[keys[i]] = nil end
end

function S.markIntroduced(k)
  local today = S.todayKey()
  db.intro[today] = db.intro[today] or {}
  if contains(db.intro[today], k) then return end
  table.insert(db.intro[today], k)
  pruneIntro()
end

-- Appelé à chaque carte jugée. Renvoie true si c'est la première de la journée.
function S.markActiveToday()
  local today = S.todayKey()
  if contains(db.days, today) then return false end
  table.insert(db.days, today)
  table.sort(db.days)
  return true
end

function S.streakInfo()
  local days, today = {}, S.todayKey()
  for _, d in ipairs(db.days) do days[d] = true end
  local doneToday = days[today] or false
  local cursor, count = doneToday and today or previousDay(today), 0
  while days[cursor] do count = count + 1; cursor = previousDay(cursor) end
  local best, run, prev = 0, 0, nil
  for _, d in ipairs(db.days) do
    run = (prev and previousDay(d) == prev) and run + 1 or 1
    best = math.max(best, run)
    prev = d
  end
  return { count = count, doneToday = doneToday, best = best }
end

-- ---------- Réponses ----------
-- Toute modification augmente nbJustes + nbRatés : c'est le numéro de version pour la synchro.

local function fuzzDays(days)
  if days < S.FUZZ_FROM_DAYS then return days end
  local spread = math.floor(days * S.FUZZ + 0.5)
  return days + math.floor((math.random() * 2 - 1) * spread + 0.5)
end

local function schedule(e)
  local days = fuzzDays(S.INTERVAL_DAYS[e[1] + 1])
  e[2] = S.studyDayStart(days)
  return days
end

function S.answerRight(k)
  local e = db.srs[k] or { 0, 0, 0, 0 }
  e[1] = math.min(e[1] + 1, S.MAX_BOX)
  e[3] = e[3] + 1
  db.srs[k] = e
  return schedule(e)
end

function S.answerWrong(k)
  local e = db.srs[k] or { 0, 0, 0, 0 }
  e[1] = math.max(0, e[1] - S.LAPSE_DROP)
  e[2] = nowMs()
  e[4] = e[4] + 1
  db.srs[k] = e
end

function S.relearnStep(k)
  local e = db.srs[k]
  e[2] = nowMs()
  e[3] = e[3] + 1
end

function S.relearnDone(k)
  local e = db.srs[k]
  e[1] = math.max(1, e[1])
  e[3] = e[3] + 1
  return schedule(e)
end

function S.markKnown(k)
  local e = db.srs[k] and copy(db.srs[k]) or { 0, 0, 0, 0 }
  e[1], e[2], e[3] = S.KNOWN_BOX, S.KNOWN_DUE, e[3] + 1
  db.srs[k] = e
end

-- Annulation : remet l'entrée d'avant (ou « à revoir tout de suite »), en augmentant quand même la version.
function S.restoreEntry(k, before)
  local cur = db.srs[k]
  if not cur then db.srs[k] = before and copy(before) or nil; return end
  if before then
    db.srs[k] = { before[1], before[2], cur[3] + 1, cur[4] }
  else
    db.srs[k] = { 0, nowMs(), cur[3] + 1, cur[4] }
  end
end
