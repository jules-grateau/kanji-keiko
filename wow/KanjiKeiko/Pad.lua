-- Zone de dessin, comme public/js/pad.js : on écrit à la souris (clic gauche maintenu), et le kanji attendu
-- peut s'afficher en transparence sous le tracé (rouge après Vérifier, gris à repasser sur une Découverte).

local _, ns = ...
local P = {}
ns.pad = P

local FONT_JP = "Interface\\AddOns\\KanjiKeiko\\Fonts\\KanjiKeikoJP.ttf"
P.SIZE = 270
local THICK = 6
local INK = { 0.93, 0.9, 0.83, 1 }
local OVERLAY = { answer = { 0.91, 0.4, 0.3, 0.3 }, trace = { 0.61, 0.57, 0.5, 0.3 } }

local pad, overlay
local pool, strokes = {}, {}
local drawing, lastX, lastY = false, 0, 0

local function cursorXY()
  local x, y = GetCursorPosition()
  local s = pad:GetEffectiveScale()
  x, y = x / s - pad:GetLeft(), pad:GetTop() - y / s
  return math.max(0, math.min(P.SIZE, x)), math.max(0, math.min(P.SIZE, y))
end

local function addSegment(stroke, x1, y1, x2, y2)
  local l = table.remove(pool) or pad:CreateLine(nil, "OVERLAY")
  l:SetThickness(THICK)
  l:SetColorTexture(INK[1], INK[2], INK[3], INK[4])
  l:SetStartPoint("TOPLEFT", pad, x1, -y1)
  l:SetEndPoint("TOPLEFT", pad, x2, -y2)
  l:Show()
  table.insert(stroke, l)
end

local function release(stroke)
  for _, l in ipairs(stroke) do l:Hide(); table.insert(pool, l) end
end

local function startStroke()
  local x, y = cursorXY()
  lastX, lastY = x, y
  local stroke = {}
  addSegment(stroke, x, y, x + 0.5, y + 0.5)   -- un simple clic laisse un point
  table.insert(strokes, stroke)
  drawing = true
end

local function continueStroke()
  if not IsMouseButtonDown("LeftButton") then drawing = false; return end
  local x, y = cursorXY()
  local dx, dy = x - lastX, y - lastY
  if dx * dx + dy * dy >= 9 then
    addSegment(strokes[#strokes], lastX, lastY, x, y)
    lastX, lastY = x, y
  end
end

function P.Undo()
  local s = table.remove(strokes)
  if s then release(s) end
end

-- Efface les traits de l'utilisateur ; le kanji en transparence reste s'il était affiché.
function P.Clear()
  for _, s in ipairs(strokes) do release(s) end
  wipe(strokes)
  drawing = false
end

-- Kanji attendu en transparence : mode "answer" (rouge) ou "trace" (gris) ; nil pour le cacher.
function P.ShowOverlay(char, mode)
  if not char then overlay:Hide(); return end
  local c = OVERLAY[mode]
  overlay:SetText(char)
  overlay:SetTextColor(c[1], c[2], c[3], c[4])
  overlay:Show()
end

function P.Create(parent)
  pad = CreateFrame("Frame", nil, parent, BackdropTemplateMixin and "BackdropTemplate" or nil)
  pad:SetSize(P.SIZE, P.SIZE)
  pad:EnableMouse(true)
  if pad.SetBackdrop then
    pad:SetBackdrop({ bgFile = "Interface\\Buttons\\WHITE8X8", edgeFile = "Interface\\Buttons\\WHITE8X8", edgeSize = 1 })
    pad:SetBackdropColor(0.05, 0.045, 0.035, 1)
    pad:SetBackdropBorderColor(0.93, 0.9, 0.83, 0.9)
  end
  ns.glyph.DashedCross(pad, P.SIZE)

  -- Même proportion que l'appli : police de 520 px dans un carré de 680, centrée un peu plus bas.
  overlay = pad:CreateFontString(nil, "ARTWORK")
  overlay:SetFont(FONT_JP, math.floor(P.SIZE * 0.76), "")
  overlay:SetPoint("CENTER", 0, -P.SIZE * 0.015)
  overlay:Hide()

  pad:SetScript("OnMouseDown", function(_, button) if button == "LeftButton" then startStroke() end end)
  pad:SetScript("OnMouseUp", function() drawing = false end)
  pad:SetScript("OnHide", function() drawing = false end)
  pad:SetScript("OnUpdate", function() if drawing then continueStroke() end end)
  return pad
end
