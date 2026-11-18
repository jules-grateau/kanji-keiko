-- Fenêtre de l'addon : accueil, séance et fin de séance. La séance suit public/js/session.js :
-- deux séances séparées (Réviser / Apprendre), cartes Découverte puis tests intercalés, réapprentissage
-- des ratés dans la séance, « Je le maîtrise », et « ← Précédent » pour annuler la dernière réponse.

local ADDON, ns = ...
local S, P, G = ns.srs, ns.pad, ns.glyph

local FONT_JP = "Interface\\AddOns\\KanjiKeiko\\Fonts\\KanjiKeikoJP.ttf"
local W, H = 450, 690
local WS_TOP = -176          -- haut de la zone de travail (dessin + carrés), dans la vue séance
local BOX = (P.SIZE - 8) / 2 -- carrés « Ordre » et « Kanji » : à eux deux, la hauteur du dessin
local THUMB, PER_ROW = 40, 9 -- vignettes « Trait par trait »

local f, views, ui = nil, {}, {}
local session = nil

local function Print(msg) print("|cffe8654dKanji Keiko|r : " .. msg) end
local function plural(n, word) return n .. " " .. word .. (n > 1 and "s" or "") end

-- ---------- Petits outils d'interface ----------

local function text(parent, template, size, jp)
  local fs = parent:CreateFontString(nil, "OVERLAY", template or "GameFontHighlight")
  if jp then fs:SetFont(FONT_JP, size or 16, "") end
  return fs
end

local function button(parent, label, w, h, onClick)
  local b = CreateFrame("Button", nil, parent, "UIPanelButtonTemplate")
  b:SetSize(w, h or 26)
  b:SetText(label)
  b:SetScript("OnClick", onClick)
  return b
end

local function bar(parent, w)
  local b = CreateFrame("StatusBar", nil, parent)
  b:SetSize(w, 6)
  b:SetStatusBarTexture("Interface\\Buttons\\WHITE8X8")
  b:SetStatusBarColor(0.9, 0.4, 0.3)
  b:SetMinMaxValues(0, 1)
  local bg = b:CreateTexture(nil, "BACKGROUND")
  bg:SetAllPoints()
  bg:SetColorTexture(1, 1, 1, 0.12)
  return b
end

local function show(name)
  for k, v in pairs(views) do v:SetShown(k == name) end
end

local function syncText()
  local at = S.db.sync.at
  if not at then return "|cffe8654dProgression de l'appli pas encore reçue.|r" end
  return "Progression de l'appli reçue le " .. date("%d/%m à %H:%M", math.floor(at / 1000)) .. "."
end

-- ---------- Accueil ----------

local function renderHome()
  local streak, g = S.streakInfo(), S.goalInfo()
  ui.streak:SetText(streak.count > 0 and ("Série : |cffffffff" .. plural(streak.count, "jour") .. "|r de suite"
    .. (streak.doneToday and "" or "  |cffaaaaaa(fais une carte aujourd'hui)|r")) or "Série : fais une carte par jour pour en lancer une.")
  ui.goal:SetText(g.reached and string.format("Objectif du jour : |cff7fd36e%d / %d atteint !|r", g.done, g.goal)
    or string.format("Objectif du jour : |cffffffff%d / %d|r nouveaux", g.done, g.goal))
  ui.goalBar:SetValue(math.min(1, g.done / g.goal))
  ui.goalBar:SetStatusBarColor(g.reached and 0.45 or 0.9, g.reached and 0.75 or 0.4, g.reached and 0.4 or 0.3)

  local due, fresh = S.dueKanji(), S.freshKanji()
  local mastered = 0
  for _, o in pairs(S.levelStats()) do mastered = mastered + o.mastered end
  ui.stats:SetText(string.format("%d à réviser · %d nouveaux restants · %d maîtrisés", #due, #fresh, mastered))

  ui.review:SetText(#due > 0 and ("Réviser · " .. #due) or "Rien à réviser")
  ui.review:SetEnabled(#due > 0)
  if g.reached then
    ui.learn:SetText("+ " .. S.EXTRA_STEP .. " nouveaux en plus")
    ui.learn:SetEnabled(#S.newKanji(1) > 0)
  else
    ui.learn:SetText(#fresh > 0 and ("Apprendre · " .. #fresh) or "Plus de nouveaux kanji")
    ui.learn:SetEnabled(#fresh > 0)
  end
  ui.sync:SetText(syncText())

  -- Tant que la progression de l'appli n'est pas arrivée, pas de séance : l'addon prendrait pour nouveaux
  -- des kanji déjà appris dans l'appli. (« Utiliser sans l'appli » lève ce blocage, pour qui n'a pas l'appli.)
  local waiting = not S.db.sync.at and not S.db.sync.standalone
  ui.waiting:SetShown(waiting)
  ui.standalone:SetShown(waiting)
  if waiting then
    ui.review:SetEnabled(false)
    ui.learn:SetEnabled(false)
  end
end

-- ---------- Séance ----------

local nextCard, finishSession

local function startSession(mode, extraNew)
  local queue = mode == "review" and S.dueKanji() or S.freshKanji(extraNew)
  local fresh = {}
  if mode == "learn" then for _, k in ipairs(queue) do fresh[k] = true end end
  session = {
    mode = mode, queue = queue,
    fresh = fresh,                 -- nouveaux : leur 1re réponse compte pour l'objectif
    toDiscover = S.copy(fresh),    -- pas encore présentés : leur prochaine carte est une Découverte
    learning = {},                 -- ratés en réapprentissage → réussites encore nécessaires
    redo = nil,                    -- { k, gap } : à réinsérer dans la file après `gap` cartes
    done = 0, ok = 0, ko = 0, known = 0,
    seen = {}, missed = {}, history = {}, streakExtended = false,
  }
  ui.toast:SetText()
  show("session")
  nextCard()
end

local function count(set) local n = 0; for _ in pairs(set) do n = n + 1 end; return n end

-- Avant chaque réponse : l'entrée du kanji et l'état de la séance, pour « ← Précédent ».
local function remember(char)
  table.insert(session.history, {
    char = char,
    entryBefore = S.db.srs[char] and S.copy(S.db.srs[char]) or nil,
    state = {
      queue = S.copy(session.queue), redo = S.copy(session.redo), learning = S.copy(session.learning),
      toDiscover = S.copy(session.toDiscover), done = session.done, ok = session.ok, ko = session.ko,
      known = session.known, seen = S.copy(session.seen), missed = S.copy(session.missed),
    },
  })
end

local function setButtons(phase)   -- "check", "grade", "next"
  ui.check:SetShown(phase == "check")
  ui.bad:SetShown(phase == "grade")
  ui.good:SetShown(phase == "grade")
  ui.next:SetShown(phase == "next")
end

-- Zone de travail, comme l'appli : avant Vérifier, le dessin seul, centré. Après Vérifier (ou sur une
-- Découverte) : dessin à gauche avec le kanji en transparence | « Ordre » (animation, cliquer pour la
-- rejouer) et « Kanji » (fini) à droite ; puis les vignettes « Trait par trait » sous les boutons.
local function renderSteps(char)
  local strokes = G.Decode(char) or {}
  for i, view in ipairs(ui.steps) do
    G.Clear(view)
    view.frame:SetShown(i <= #strokes)
  end
  for i = 1, #strokes do
    local view = ui.steps[i]
    if not view then
      view = G.NewView(ui.stepsWrap, THUMB, { cross = true })
      view.number = view.frame:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
      view.number:SetPoint("BOTTOMRIGHT", -2, 2)
      ui.steps[i] = view
    end
    local col, row = (i - 1) % PER_ROW, math.floor((i - 1) / PER_ROW)
    view.frame:ClearAllPoints()
    view.frame:SetPoint("TOPLEFT", ui.stepsWrap, "TOPLEFT", col * (THUMB + 4), -18 - row * (THUMB + 4))
    view.frame:Show()
    view.number:SetText(i)
    for j = 1, i - 1 do G.Stroke(view, strokes[j], 1.5, G.MUTED) end
    G.Stroke(view, strokes[i], 2, G.RED, 1)
    G.Dot(view, strokes[i][1][1], strokes[i][1][2], 2, G.RED)
  end
end

local function setWorkspace(char, mode)
  ui.pad:ClearAllPoints()
  if not char then
    ui.pad:SetPoint("TOP", views.session, "TOP", 0, WS_TOP)
    P.ShowOverlay(nil)
    G.Clear(ui.order)
    G.Clear(ui.final)
    ui.answerCol:Hide()
    ui.stepsWrap:Hide()
    return
  end
  ui.pad:SetPoint("TOPLEFT", views.session, "TOPLEFT", 20, WS_TOP)
  P.ShowOverlay(char, mode)
  ui.answerCol:Show()
  G.Animate(ui.order, char, 3)
  G.DrawFinal(ui.final, char, 3)
  renderSteps(char)
  ui.stepsWrap:Show()
end

nextCard = function()
  if #session.queue == 0 then return finishSession() end
  local char = table.remove(session.queue, 1)
  local r = S.byChar[char]
  session.current, session.judged = char, false
  session.discovering = session.toDiscover[char] or false
  P.Clear()
  setWorkspace(nil)

  ui.meta:SetText(string.format("N%d · %s", r[2], plural(r[3], "trait")))
  ui.phase:SetShown(session.discovering)
  ui.meaning:SetText(r[4])
  local readings = {}
  if r[5] ~= "" then table.insert(readings, "音 " .. r[5]) end
  if r[6] ~= "" then table.insert(readings, "訓 " .. r[6]) end
  ui.readings:SetText(table.concat(readings, "    "))
  ui.readings:SetShown(not S.db.settings.hard or session.discovering)
  ui.verdict:SetText("")
  ui.back:SetEnabled(#session.history > 0)

  local left = #session.queue + 1 + count(session.toDiscover)
  ui.count:SetText(left .. " à faire")
  ui.progress:SetValue(session.done / (session.done + left))

  if session.discovering then
    -- Découverte : tout est montré, modèle gris à repasser, rien à juger.
    setWorkspace(char, "trace")
    setButtons("next")
    ui.verdict:SetText("|cffccccccRepasse dessus si tu veux. Tu l'écriras de tête dans quelques cartes.|r")
  else
    setButtons("check")
  end
end

local function reveal()
  if not session or session.judged or session.discovering then return end
  ui.toast:SetText()
  ui.readings:Show()
  setWorkspace(session.current, "answer")
  setButtons("grade")
  ui.verdict:SetText("|cffccccccCompare avec ton tracé, puis juge-toi honnêtement.|r")
end

local function goNext()
  if session.discovering then
    -- Fin de la Découverte : le kanji revient en test DISCOVER_GAP cartes plus loin.
    local char = session.current
    remember(char)
    session.toDiscover[char] = nil
    session.discovering = false
    session.done = session.done + 1
    session.redo = { k = char, gap = S.DISCOVER_GAP }
  end
  if session.redo then
    table.insert(session.queue, math.min(session.redo.gap, #session.queue) + 1, session.redo.k)
    session.redo = nil
  end
  nextCard()
end

local function addMissed(char)
  for _, k in ipairs(session.missed) do if k == char then return end end
  table.insert(session.missed, char)
end

-- Renvoie le délai en jours avant la prochaine révision, ou nil s'il revient plus loin dans la séance.
local function judge(ok)
  local char = session.current
  remember(char)
  session.judged = true
  local days = nil
  if not ok then
    S.answerWrong(char)
    session.learning[char] = S.RELEARN_SUCCESSES
    session.redo = { k = char, gap = S.REDO_GAP }
    session.ko = session.ko + 1
    addMissed(char)
  elseif session.learning[char] then
    session.ok = session.ok + 1
    session.learning[char] = session.learning[char] - 1
    if session.learning[char] > 0 then
      S.relearnStep(char)
      session.redo = { k = char, gap = S.RELEARN_GAP }
    else
      session.learning[char] = nil
      days = S.relearnDone(char)
    end
  else
    session.ok = session.ok + 1
    days = S.answerRight(char)
  end
  if S.markActiveToday() then session.streakExtended = true end
  if session.fresh[char] then S.markIntroduced(char) end
  session.seen[char] = true
  session.done = session.done + 1
  return days
end

local function judgeWrong()
  judge(false)
  setButtons("next")
  ui.back:Enable()
  ui.verdict:SetText("|cffe8654dRaté — il revient dans " .. S.REDO_GAP .. " cartes.|r")
end

-- « J'avais juste » : on enchaîne directement ; le verdict s'affiche en bas de la carte suivante.
local function judgeRight()
  local char = session.current
  local days = judge(true)
  goNext()
  local when = not days and "plus loin dans la séance" or days > 1 and ("dans " .. days .. " jours") or "demain"
  ui.toast:SetText(char, "|cff7fd36eJuste|r — revient " .. when .. ".")
end

local function markCurrentKnown()
  local char = session.current
  remember(char)
  -- Nouveau pas encore répondu : il ne compte pas pour l'objectif, un autre prend sa place.
  local introduced = false
  for _, k in ipairs(S.introducedToday()) do if k == char then introduced = true end end
  if session.fresh[char] and not introduced then
    for _, k in ipairs(S.newKanji()) do
      if k ~= char and not session.fresh[k] then
        table.insert(session.queue, k)
        session.fresh[k], session.toDiscover[k] = true, true
        break
      end
    end
  end
  session.toDiscover[char] = nil
  S.markKnown(char)
  if session.redo and session.redo.k == char then session.redo = nil end
  session.learning[char] = nil
  for i = #session.missed, 1, -1 do if session.missed[i] == char then table.remove(session.missed, i) end end
  session.known = session.known + 1
  session.seen[char] = true
  if not session.judged then session.done = session.done + 1 end
  nextCard()
  ui.toast:SetText(char, "ne te sera plus proposé.")
end

-- « ← Précédent » : annule la dernière réponse (les deux si Raté puis « Je le maîtrise ») et réaffiche le kanji.
local function goBack()
  if not session or #session.history == 0 then return end
  local char = session.history[#session.history].char
  local entry
  while #session.history > 0 and session.history[#session.history].char == char do
    entry = table.remove(session.history)
  end
  S.restoreEntry(char, entry.entryBefore)
  -- Champ par champ : un champ vide (redo) doit aussi être remis à vide.
  for _, k in ipairs({ "queue", "redo", "learning", "toDiscover", "done", "ok", "ko", "known", "seen", "missed" }) do
    session[k] = entry.state[k]
  end
  table.insert(session.queue, 1, char)
  ui.toast:SetText()
  show("session")
  nextCard()
end

finishSession = function()
  if not session then return end
  P.Clear()
  setWorkspace(nil)
  local g, streak = S.goalInfo(), S.streakInfo()
  ui.eTitle:SetText(session.mode == "review" and "Révisions terminées" or "Apprentissage terminé")
  ui.eStats:SetText(string.format("|cff7fd36e%d|r justes   ·   |cffe8654d%d|r ratés   ·   %d vus", session.ok, session.ko, count(session.seen)))
  local lines = {}
  if session.mode == "learn" then
    table.insert(lines, g.reached and string.format("Objectif du jour atteint : %d / %d", g.done, g.goal)
      or string.format("%d / %d nouveaux aujourd'hui", g.done, g.goal))
  end
  if streak.count > 0 then
    table.insert(lines, (session.streakExtended and "Série prolongée : " or "Série : ") .. plural(streak.count, "jour"))
  end
  if session.known > 0 then table.insert(lines, plural(session.known, "kanji") .. " marqué(s) comme maîtrisé(s).") end
  ui.eLines:SetText(table.concat(lines, "\n"))
  ui.eMissLabel:SetShown(#session.missed > 0)
  ui.eMiss:SetText(table.concat(session.missed, "  "))
  ui.eSync:SetText(syncText())
  show("end")
end

-- ---------- Construction ----------

local function buildHome(parent)
  local v = CreateFrame("Frame", nil, parent)
  v:SetAllPoints()

  ui.streak = text(v, "GameFontNormal")
  ui.streak:SetPoint("TOPLEFT", 20, -50)
  ui.streak:SetWidth(W - 40)
  ui.streak:SetJustifyH("LEFT")

  ui.goal = text(v, "GameFontNormal")
  ui.goal:SetPoint("TOPLEFT", 20, -84)
  ui.goalBar = bar(v, W - 40)
  ui.goalBar:SetPoint("TOPLEFT", 20, -104)

  ui.stats = text(v, "GameFontHighlightSmall")
  ui.stats:SetPoint("TOPLEFT", 20, -118)

  ui.review = button(v, "Réviser", (W - 50) / 2, 34, function() startSession("review") end)
  ui.review:SetPoint("TOPLEFT", 20, -146)
  ui.learn = button(v, "Apprendre", (W - 50) / 2, 34, function()
    startSession("learn", S.goalInfo().reached and S.EXTRA_STEP or 0)
  end)
  ui.learn:SetPoint("TOPRIGHT", -20, -146)

  -- Avertissement tant que la progression de l'appli n'est pas arrivée (à la place de l'aide).
  ui.waiting = CreateFrame("Frame", nil, v, BackdropTemplateMixin and "BackdropTemplate" or nil)
  ui.waiting:SetPoint("TOPLEFT", 20, -192)
  ui.waiting:SetPoint("BOTTOMRIGHT", v, "BOTTOMRIGHT", -20, 74)
  if ui.waiting.SetBackdrop then
    ui.waiting:SetBackdrop({ bgFile = "Interface\\Buttons\\WHITE8X8", edgeFile = "Interface\\Buttons\\WHITE8X8", edgeSize = 1 })
    ui.waiting:SetBackdropColor(0.25, 0.08, 0.05, 0.95)
    ui.waiting:SetBackdropBorderColor(0.91, 0.4, 0.3, 1)
  end
  ui.waiting:SetFrameLevel(v:GetFrameLevel() + 5)
  local warn = ui.waiting:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
  warn:SetPoint("TOPLEFT", 12, -12)
  warn:SetPoint("TOPRIGHT", -12, -12)
  warn:SetJustifyH("LEFT")
  warn:SetSpacing(4)
  warn:SetText("|cffe8654dTa progression de l'appli n'est pas encore arrivée.|r\n\n"
    .. "Sans elle, l'addon prendrait pour nouveaux des kanji que tu as déjà appris. Réviser et Apprendre "
    .. "sont donc bloqués pour l'instant.\n\nPour la recevoir :\n"
    .. "1. lance le compagnon (KanjiKeikoWoW.exe) sur ce PC, avec ton jeton ;\n"
    .. "2. retourne à l'écran des personnages, attends 5 secondes ;\n"
    .. "3. reconnecte-toi.")
  ui.standalone = button(ui.waiting, "Utiliser sans l'appli", 170, 22, function()
    S.db.sync.standalone = true
    renderHome()
  end)
  ui.standalone:SetPoint("BOTTOMLEFT", 12, 12)

  local how = text(v, "GameFontHighlightSmall")
  how:SetPoint("TOPLEFT", 20, -204)
  how:SetWidth(W - 40)
  how:SetJustifyH("LEFT")
  how:SetSpacing(3)
  how:SetText("|cffccccccMême SRS que l'appli Kanji Keiko : les kanji, les révisions et l'objectif sont les mêmes.\n"
    .. "Écris à la souris (clic gauche maintenu) dans le carré, puis Vérifier.\n"
    .. "\n|cffffd100Envoyer à l'appli|r : déconnexion, ou le bouton ci-dessous (recharge l'interface).\n"
    .. "|cffffd100Recevoir de l'appli|r : retour à l'écran des personnages, puis reconnexion.\n"
    .. "Le compagnon (KanjiKeikoWoW.exe) doit tourner sur ce PC.|r")

  ui.sync = text(v, "GameFontHighlightSmall")
  ui.sync:SetPoint("BOTTOMLEFT", 20, 54)
  local syncBtn = button(v, "Envoyer à l'appli (recharge l'interface)", W - 40, 26, ReloadUI)
  syncBtn:SetPoint("BOTTOM", 0, 18)
  return v
end

local function buildSession(parent)
  local v = CreateFrame("Frame", nil, parent)
  v:SetAllPoints()

  ui.back = button(v, "< Précédent", 100, 22, goBack)
  ui.back:SetPoint("TOPLEFT", 14, -34)
  ui.count = text(v, "GameFontHighlightSmall")
  ui.count:SetPoint("TOP", 0, -40)
  local quit = button(v, "Terminer", 90, 22, function() finishSession() end)
  quit:SetPoint("TOPRIGHT", -14, -34)
  ui.progress = bar(v, W - 28)
  ui.progress:SetPoint("TOPLEFT", 14, -62)

  ui.meta = text(v, "GameFontNormalSmall")
  ui.meta:SetPoint("TOPLEFT", 20, -76)
  ui.phase = text(v, "GameFontNormalSmall")
  ui.phase:SetPoint("LEFT", ui.meta, "RIGHT", 10, 0)
  ui.phase:SetText("|cffe8654d[ Découverte ]|r")
  local known = button(v, "Je le maîtrise", 110, 20, function() markCurrentKnown() end)
  known:SetPoint("TOPRIGHT", -16, -72)

  ui.meaning = text(v, "GameFontHighlightLarge")
  ui.meaning:SetPoint("TOPLEFT", 20, -96)
  ui.meaning:SetWidth(W - 40)
  ui.meaning:SetJustifyH("LEFT")
  if ui.meaning.SetMaxLines then ui.meaning:SetMaxLines(2) end
  ui.readings = text(v, nil, 16, true)
  ui.readings:SetPoint("TOPLEFT", ui.meaning, "BOTTOMLEFT", 0, -6)
  ui.readings:SetWidth(W - 40)
  ui.readings:SetJustifyH("LEFT")
  if ui.readings.SetMaxLines then ui.readings:SetMaxLines(2) end

  -- Zone de dessin, avec ses deux petits boutons dans le coin (comme l'appli).
  ui.pad = P.Create(v)
  ui.pad:SetPoint("TOP", 0, WS_TOP)
  local clear = button(ui.pad, "X", 24, 20, P.Clear)
  clear:SetPoint("TOPRIGHT", -4, -4)
  local undo = button(ui.pad, "<", 24, 20, P.Undo)
  undo:SetPoint("RIGHT", clear, "LEFT", -2, 0)

  -- Colonne de droite après Vérifier : « Ordre » (cliquer pour rejouer) et « Kanji ».
  ui.answerCol = CreateFrame("Frame", nil, v)
  ui.answerCol:SetSize(BOX, P.SIZE)
  ui.answerCol:SetPoint("TOPRIGHT", v, "TOPRIGHT", -20, WS_TOP)
  ui.order = G.NewView(ui.answerCol, BOX, { caption = "ORDRE" })
  ui.order.frame:SetPoint("TOP")
  ui.order.frame:EnableMouse(true)
  ui.order.frame:SetScript("OnMouseDown", function()
    if session and session.current then G.Animate(ui.order, session.current, 3) end
  end)
  ui.final = G.NewView(ui.answerCol, BOX, { caption = "KANJI" })
  ui.final.frame:SetPoint("BOTTOM")
  ui.answerCol:Hide()

  local y = WS_TOP - P.SIZE - 10
  ui.check = button(v, "Vérifier", 200, 30, reveal)
  ui.check:SetPoint("TOP", 0, y)
  ui.bad = button(v, "Raté", 150, 30, judgeWrong)
  ui.bad:SetPoint("TOPRIGHT", v, "TOP", -6, y)
  ui.good = button(v, "J'avais juste", 150, 30, judgeRight)
  ui.good:SetPoint("TOPLEFT", v, "TOP", 6, y)
  ui.next = button(v, "Suivant >", 200, 30, goNext)
  ui.next:SetPoint("TOP", 0, y)

  ui.verdict = text(v, "GameFontHighlight")
  ui.verdict:SetPoint("TOP", 0, y - 38)
  ui.verdict:SetWidth(W - 40)

  -- « Trait par trait » : une vignette par trait, traits précédents estompés, trait courant en rouge.
  ui.stepsWrap = CreateFrame("Frame", nil, v)
  ui.stepsWrap:SetSize(W - 40, 18 + 3 * (THUMB + 4))
  ui.stepsWrap:SetPoint("TOPLEFT", v, "TOPLEFT", 20, y - 60)
  local stepsLabel = ui.stepsWrap:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
  stepsLabel:SetPoint("TOPLEFT")
  stepsLabel:SetText("TRAIT PAR TRAIT")
  ui.steps = {}
  ui.stepsWrap:Hide()

  -- Message en bas de carte : le kanji (police japonaise) puis le texte (police du jeu, qui a les accents ;
  -- la police japonaise de l'addon n'en a pas).
  ui.toastChar = text(v, nil, 18, true)
  ui.toastChar:SetPoint("BOTTOMLEFT", 20, 12)
  ui.toastText = text(v, "GameFontHighlight")
  ui.toastText:SetPoint("LEFT", ui.toastChar, "RIGHT", 6, 0)
  ui.toast = { SetText = function(_, char, msg) ui.toastChar:SetText(char or ""); ui.toastText:SetText(msg or "") end }
  return v
end

local function buildEnd(parent)
  local v = CreateFrame("Frame", nil, parent)
  v:SetAllPoints()
  ui.eTitle = text(v, "GameFontNormalLarge")
  ui.eTitle:SetPoint("TOP", 0, -60)
  ui.eStats = text(v, "GameFontHighlight")
  ui.eStats:SetPoint("TOP", 0, -100)
  ui.eLines = text(v, "GameFontHighlight")
  ui.eLines:SetPoint("TOP", 0, -132)
  ui.eLines:SetSpacing(6)
  ui.eMissLabel = text(v, "GameFontHighlightSmall")
  ui.eMissLabel:SetPoint("TOP", 0, -214)
  ui.eMissLabel:SetText("|cffccccccÀ retravailler :|r")
  ui.eMiss = text(v, nil, 26, true)
  ui.eMiss:SetPoint("TOP", 0, -236)
  ui.eMiss:SetWidth(W - 40)

  ui.eSync = text(v, "GameFontHighlightSmall")
  ui.eSync:SetPoint("BOTTOM", 0, 100)
  local back = button(v, "Retour", W - 40, 30, function() renderHome(); show("home") end)
  back:SetPoint("BOTTOM", 0, 56)
  local syncBtn = button(v, "Envoyer à l'appli (recharge l'interface)", W - 40, 26, ReloadUI)
  syncBtn:SetPoint("BOTTOM", 0, 18)
  return v
end

local function build()
  local ui_db = S.db.ui
  f = CreateFrame("Frame", "KanjiKeikoFrame", UIParent, BackdropTemplateMixin and "BackdropTemplate" or nil)
  f:SetSize(W, H)
  f:SetFrameStrata("DIALOG")
  f:SetClampedToScreen(true)
  f:SetMovable(true)
  f:EnableMouse(true)
  f:RegisterForDrag("LeftButton")
  f:SetScale(ui_db.scale or 1)
  if f.SetBackdrop then
    f:SetBackdrop({ bgFile = "Interface\\Buttons\\WHITE8X8", edgeFile = "Interface\\Buttons\\WHITE8X8", edgeSize = 1 })
    f:SetBackdropColor(0.08, 0.075, 0.06, 0.97)
    f:SetBackdropBorderColor(0.5, 0.45, 0.35, 1)
  end
  if ui_db.point then
    f:SetPoint(ui_db.point[1], UIParent, ui_db.point[2], ui_db.point[3], ui_db.point[4])
  else
    f:SetPoint("CENTER")
  end
  f:SetScript("OnDragStart", f.StartMoving)
  f:SetScript("OnDragStop", function(self)
    self:StopMovingOrSizing()
    local p, _, rp, x, y = self:GetPoint()
    ui_db.point = { p, rp, x, y }
  end)
  table.insert(UISpecialFrames, "KanjiKeikoFrame")   -- Échap ferme la fenêtre

  local title = text(f, nil, 17, true)
  title:SetPoint("TOPLEFT", 14, -10)
  title:SetText("|cffe8654d漢字稽古|r  Kanji Keiko")
  local close = CreateFrame("Button", nil, f, "UIPanelCloseButton")
  close:SetPoint("TOPRIGHT", 2, 2)

  views.home = buildHome(f)
  views.session = buildSession(f)
  views["end"] = buildEnd(f)
  f:Hide()
end

local function toggle()
  if not f then build() end
  if f:IsShown() then
    f:Hide()
  else
    if not session or views.home:IsShown() then renderHome(); show("home") end
    f:Show()
  end
end

-- ---------- Démarrage et commandes ----------

local ev = CreateFrame("Frame")
ev:RegisterEvent("ADDON_LOADED")
ev:SetScript("OnEvent", function(self, _, name)
  if name ~= ADDON then return end
  self:UnregisterEvent("ADDON_LOADED")
  S.Init()
end)

SLASH_KANJIKEIKO1 = "/kanji"
SLASH_KANJIKEIKO2 = "/kk"
SlashCmdList.KANJIKEIKO = function(msg)
  local cmd, arg = (msg or ""):lower():match("^(%S*)%s*(.-)$")
  if cmd == "scale" then
    local v = tonumber(arg)
    if v and v >= 0.5 and v <= 1.5 then
      S.db.ui.scale = v
      if f then f:SetScale(v) end
      Print("taille : " .. v)
    else
      Print("/kanji scale suivi d'un nombre entre 0.5 et 1.5.")
    end
  else
    toggle()
  end
end

ns.ui = { renderHome = renderHome, session = function() return session end }   -- session : pour les tests
