-- Dessin des kanji à partir des tracés KanjiVG, comme public/js/stroke-order.js : carré « Ordre » (animation),
-- carré « Kanji » (kanji fini) et vignettes « Trait par trait ». WoW ne sait tracer que des segments (CreateLine) :
-- chaque trait est une ligne brisée (voir l'encodage dans scripts/build-wow.js).

local _, ns = ...
local G = {}
ns.glyph = G

-- Couleurs du thème sombre de l'appli.
G.INK = { 0.93, 0.9, 0.83, 1 }
G.RED = { 0.91, 0.4, 0.3, 1 }
G.GHOST = { 0.25, 0.23, 0.18, 1 }     -- --line
G.MUTED = { 0.61, 0.57, 0.5, 0.55 }   -- --muted, estompé
local ANIM_SPEED = 110                -- unités KanjiVG par seconde
local STROKE_PAUSE = 12               -- pause avant chaque trait (même unité)

-- ---------- Décodage des tracés ----------

local cache = {}
local function digit(b) return b - 35 - (b > 92 and 1 or 0) end
function G.Decode(char)
  if cache[char] then return cache[char] end
  local s = ns.strokes[char]
  if not s then return nil end
  local strokes = {}
  for part in s:gmatch("%S+") do
    local pts = {}
    for i = 1, #part, 3 do
      local a, b, c = part:byte(i, i + 2)
      local code = (digit(a) * 91 + digit(b)) * 91 + digit(c)
      local qy = code % 219
      table.insert(pts, { (code - qy) / 219 / 2, qy / 2 })
    end
    table.insert(strokes, pts)
  end
  cache[char] = strokes
  return strokes
end

-- ---------- Vues (carrés de dessin) ----------

local function dashedCross(frame, size)
  local n = 16
  for i = 0, n - 1, 2 do
    local v = frame:CreateTexture(nil, "BACKGROUND", nil, 1)
    v:SetColorTexture(1, 1, 1, 0.08)
    v:SetSize(1, size / n)
    v:SetPoint("TOP", frame, "TOP", 0, -i * size / n)
    local h = frame:CreateTexture(nil, "BACKGROUND", nil, 1)
    h:SetColorTexture(1, 1, 1, 0.08)
    h:SetSize(size / n, 1)
    h:SetPoint("LEFT", frame, "LEFT", i * size / n, 0)
  end
end
G.DashedCross = dashedCross

function G.NewView(parent, size, opts)
  opts = opts or {}
  local f = CreateFrame("Frame", nil, parent, BackdropTemplateMixin and "BackdropTemplate" or nil)
  f:SetSize(size, size)
  if f.SetBackdrop then
    f:SetBackdrop({ bgFile = "Interface\\Buttons\\WHITE8X8", edgeFile = "Interface\\Buttons\\WHITE8X8", edgeSize = 1 })
    f:SetBackdropColor(0.05, 0.045, 0.035, 1)
    f:SetBackdropBorderColor(0.25, 0.23, 0.18, 1)
  end
  if opts.cross ~= false then dashedCross(f, size) end
  if opts.caption then
    local c = f:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
    c:SetPoint("BOTTOMLEFT", 4, 3)
    c:SetText(opts.caption)
  end
  return { frame = f, scale = size / 109, pool = {}, used = {}, dots = {}, dotPool = {} }
end

local function getLine(view, sub)
  local l = table.remove(view.pool) or view.frame:CreateLine(nil, "ARTWORK")
  l:SetDrawLayer("ARTWORK", sub or 0)
  l:Show()
  table.insert(view.used, l)
  return l
end

function G.Clear(view)
  view.anim = nil
  for _, l in ipairs(view.used) do l:Hide(); table.insert(view.pool, l) end
  wipe(view.used)
  for _, d in ipairs(view.dots) do d:Hide(); table.insert(view.dotPool, d) end
  wipe(view.dots)
end

-- Trace une ligne brisée (points en unités KanjiVG). Renvoie ses segments.
function G.Stroke(view, pts, thick, color, sub)
  local segs, sc = {}, view.scale
  for j = 2, #pts do
    local l = getLine(view, sub)
    l:SetThickness(thick)
    l:SetColorTexture(color[1], color[2], color[3], color[4])
    l:SetStartPoint("TOPLEFT", view.frame, pts[j - 1][1] * sc, -pts[j - 1][2] * sc)
    l:SetEndPoint("TOPLEFT", view.frame, pts[j][1] * sc, -pts[j][2] * sc)
    l.len = math.sqrt((pts[j][1] - pts[j - 1][1]) ^ 2 + (pts[j][2] - pts[j - 1][2]) ^ 2)
    table.insert(segs, l)
  end
  return segs
end

-- Point de départ d'un trait (rond rouge des vignettes).
function G.Dot(view, x, y, r, color)
  local d = table.remove(view.dotPool) or view.frame:CreateTexture(nil, "OVERLAY")
  d:SetColorTexture(color[1], color[2], color[3], color[4])
  d:SetSize(r * 2, r * 2)
  d:ClearAllPoints()
  d:SetPoint("CENTER", view.frame, "TOPLEFT", x * view.scale, -y * view.scale)
  d:Show()
  table.insert(view.dots, d)
end

-- Carré « Kanji » : tous les traits, sans animation.
function G.DrawFinal(view, char, thick)
  G.Clear(view)
  for _, pts in ipairs(G.Decode(char) or {}) do G.Stroke(view, pts, thick, G.INK) end
end

-- Carré « Ordre » : les traits en gris clair dessous, puis dessinés un par un par-dessus.
function G.Animate(view, char, thick)
  G.Clear(view)
  local strokes = G.Decode(char) or {}
  for _, pts in ipairs(strokes) do G.Stroke(view, pts, thick, G.GHOST, 0) end
  local queue = {}
  for _, pts in ipairs(strokes) do
    for i, l in ipairs(G.Stroke(view, pts, thick, G.INK, 1)) do
      l.first = i == 1
      l:Hide()
      table.insert(queue, l)
    end
  end
  view.anim = { queue = queue, index = 0, t = 0 }
  view.frame:SetScript("OnUpdate", function(_, elapsed)
    local a = view.anim
    if not a then return end
    a.t = a.t + elapsed * ANIM_SPEED
    while a.index < #a.queue do
      local l = a.queue[a.index + 1]
      local cost = l.len + (l.first and STROKE_PAUSE or 0)
      if a.t < cost then return end
      a.t = a.t - cost
      a.index = a.index + 1
      l:Show()
    end
    view.anim = nil
  end)
end
