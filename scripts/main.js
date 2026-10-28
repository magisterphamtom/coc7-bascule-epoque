/**
 * CoC7 – Bascule d'époque
 * Un clic pour passer toute la table de 1933 à 2025-2026 (et retour) :
 * suivis Chance / Santé Mentale / Bonds, thème du chat (et donc HUD et fiches qui le suivent),
 * scène, musique, dossiers de la barre latérale et annonce dans le chat.
 * Foundry VTT v13 / v14 — magisterphamtom — MIT
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const ID = "coc7-bascule-epoque";
const ERAS = ["1933", "modern"];
const DEFAULT_LABELS = { "1933": "1933", modern: "2025-2026" };
const DEFAULT_SUBS = { "1933": "Expédition Starkweather-Moore", modern: "Les descendants" };
const CHAT_THEMES = {
  "": "Ne pas changer",
  none: "Aucun thème",
  annees20: "Années 20",
  newyork: "New York années 20",
  montagnes: "Par-delà les Montagnes Hallucinées",
  ny2026: "New York 2026",
  antarctique2026: "Antarctique 2026"
};

const esc = (str) => String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const isV14 = () => (game.release?.generation ?? 13) >= 14;
const active = (id) => !!game.modules.get(id)?.active;

/* ================================================================== */
/*  Réglages                                                           */
/* ================================================================== */

function defaultConfig() {
  return {
    "1933": { label: "1933", sub: DEFAULT_SUBS["1933"], scene: "", playlist: "", chatTheme: "montagnes", announce: true, banner: true },
    modern: { label: "2025-2026", sub: DEFAULT_SUBS.modern, scene: "", playlist: "", chatTheme: "antarctique2026", announce: true, banner: true }
  };
}

function getConfig() {
  const saved = game.settings.get(ID, "config") ?? {};
  const base = defaultConfig();
  for (const era of ERAS) base[era] = { ...base[era], ...(saved[era] ?? {}) };
  return base;
}

function currentEra() {
  const e = game.settings.get(ID, "currentEra");
  return ERAS.includes(e) ? e : null;
}

Hooks.once("init", () => {
  game.settings.register(ID, "config", { scope: "world", config: false, type: Object, default: {} });
  game.settings.register(ID, "currentEra", {
    scope: "world", config: false, type: String, default: "",
    onChange: () => { refreshDirectories(); BasculeApp.instance?.render(); }
  });
  // Personnage de chaque joueur par époque : { userId: { "1933": actorId, modern: actorId } }
  game.settings.register(ID, "characters", { scope: "world", config: false, type: Object, default: {} });
  game.settings.register(ID, "syncCharacters", {
    name: "Changer le personnage des joueurs à la bascule",
    hint: "À chaque bascule, le personnage assigné de chaque joueur devient celui de l'époque choisie (voir « Personnages par époque »).",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.registerMenu(ID, "charactersMenu", {
    name: "Personnages par époque",
    label: "Choisir les personnages",
    hint: "Pour chaque joueur, son personnage de 1933 et celui de 2025-2026.",
    icon: "fa-solid fa-user-group",
    type: class { render() { BasculeApp.open("personnages"); } },
    restricted: true
  });
  game.settings.register(ID, "showBanner", {
    name: "Afficher le bandeau de changement d'époque",
    hint: "Grand bandeau animé qui traverse l'écran quand le Gardien change d'époque.",
    scope: "client", config: true, type: Boolean, default: true
  });
  game.settings.registerMenu(ID, "configMenu", {
    name: "Réglages des époques",
    label: "Configurer",
    hint: "Scène, musique, thème du chat et annonce pour chaque époque.",
    icon: "fa-solid fa-hourglass-half",
    type: class { render() { BasculeApp.open("reglages"); } },
    restricted: true
  });
});

/* ================================================================== */
/*  La bascule                                                         */
/* ================================================================== */

async function switchEra(era, { silent = false } = {}) {
  if (!game.user.isGM) return;
  if (!ERAS.includes(era)) return;
  const cfg = getConfig()[era];
  const done = [];
  const failed = [];
  const step = async (label, fn) => {
    try { if (await fn() !== false) done.push(label); }
    catch (err) { console.error(`${ID} | ${label}`, err); failed.push(label); }
  };

  // 0. Bandeau animé chez tous les joueurs (envoyé en premier : il masque le changement de scène)
  if (cfg.banner && !silent) {
    const payload = { type: "banner", era, label: cfg.label || DEFAULT_LABELS[era], sub: cfg.sub ?? "" };
    await step("bandeau", () => { game.socket.emit(`module.${ID}`, payload); showBanner(payload); });
  }

  // 1. Époque courante (sert aux autres modules et à l'affichage)
  await step("époque enregistrée", () => game.settings.set(ID, "currentEra", era));

  // 1b. Personnage assigné de chaque joueur
  if (game.settings.get(ID, "syncCharacters")) {
    await step("personnages", async () => {
      const res = await applyCharacters(era);
      if (res.missing.length) ui.notifications.warn(`Pas de personnage ${getConfig()[era].label || DEFAULT_LABELS[era]} pour : ${res.missing.join(", ")}.`);
      return res.changed > 0 || res.unchanged > 0;
    });
  }

  // 2. Suivis Chance / Santé Mentale / Bonds : n'afficher que cette époque
  await step("suivis", async () => {
    const scopes = active("coc7-luck-tracker")
      ? ["coc7-luck-tracker"]
      : ["coc7-san-tracker", "coc7-bonds-tracker"].filter(active);
    if (!scopes.length) return false;
    for (const s of scopes) await game.user.setFlag(s, "eraFilter", era);
  });

  // 3. Thème du chat imposé à la table (le HUD de combat, Token Action HUD
  //    et les fiches réglées sur « comme le chat » suivent)
  if (cfg.chatTheme && active("coc7-cartes-chat")) {
    await step("thème du chat", () =>
      game.settings.set("coc7-cartes-chat", "forceTheme", cfg.chatTheme === "none" ? "none" : cfg.chatTheme));
  }

  // 4. Dossiers de la barre latérale (module « Masquer les dossiers de journaux »)
  if (active("dossiers-caches")) {
    await step("dossiers", async () => {
      const other = ERAS.find((e) => e !== era);
      const hide = game.folders.filter((f) => f.getFlag(ID, "era") === other).map((f) => f.id);
      const show = new Set(game.folders.filter((f) => f.getFlag(ID, "era") === era).map((f) => f.id));
      if (!hide.length && !show.size) return false;
      const current = game.user.getFlag("dossiers-caches", "hidden");
      const ids = new Set((Array.isArray(current) ? current : []).filter((id) => !show.has(id)));
      hide.forEach((id) => ids.add(id));
      await game.user.setFlag("dossiers-caches", "hidden", [...ids]);
    });
  }

  // 5. Musique : on coupe ce qui joue et on lance la playlist de l'époque
  const playlist = cfg.playlist ? game.playlists.get(cfg.playlist) : null;
  if (playlist) {
    await step("musique", async () => {
      for (const p of game.playlists.playing) if (p.id !== playlist.id) await p.stopAll();
      if (!playlist.playing) await playlist.playAll();
    });
  }

  // 6. Scène : activée pour toute la table
  const scene = cfg.scene ? game.scenes.get(cfg.scene) : null;
  if (scene && !scene.active) await step("scène", () => scene.activate());

  // 7. Annonce dans le chat
  if (cfg.announce && !silent) {
    await step("annonce", () => ChatMessage.create({
      speaker: { alias: "Le Gardien" },
      content: `<div class="cbe-announce cbe-${era}">
        <span class="cbe-announce-kicker">La partie se poursuit en</span>
        <span class="cbe-announce-era">${esc(cfg.label || DEFAULT_LABELS[era])}</span>
        ${cfg.sub ? `<span class="cbe-announce-sub">${esc(cfg.sub)}</span>` : ""}
      </div>`
    }));
  }

  const label = cfg.label || DEFAULT_LABELS[era];
  if (failed.length) ui.notifications.warn(`Bascule vers ${label} : problème avec ${failed.join(", ")} (voir la console F12).`);
  else ui.notifications.info(`Bascule vers ${label} : ${done.join(", ")}.`);
  BasculeApp.instance?.render();
}

/* ================================================================== */
/*  Personnages par époque                                             */
/* ================================================================== */

/**
 * Assigne à chaque joueur son personnage de l'époque.
 * Un joueur sans personnage choisi pour cette époque n'est pas touché (il est signalé).
 */
async function applyCharacters(era) {
  const map = game.settings.get(ID, "characters") ?? {};
  const res = { changed: 0, unchanged: 0, missing: [] };
  for (const user of game.users) {
    if (user.isGM) continue;
    const entry = map[user.id];
    if (!entry || !Object.values(entry).some(Boolean)) continue; // joueur non configuré : on ignore
    const actor = entry[era] ? game.actors.get(entry[era]) : null;
    if (!actor) { res.missing.push(user.name); continue; }
    if (user.character?.id === actor.id) { res.unchanged++; continue; }
    await user.update({ character: actor.id });
    res.changed++;
  }
  return res;
}

/* ================================================================== */
/*  Bandeau animé                                                      */
/* ================================================================== */

const BANNER_MS = 4200;

function showBanner({ era, label, sub }, { force = false } = {}) {
  if (!ERAS.includes(era)) return;
  if (!force && !game.settings.get(ID, "showBanner")) return;
  document.getElementById("cbe-banner")?.remove();

  const kicker = "La partie se poursuit en";
  const el = document.createElement("div");
  el.id = "cbe-banner";
  el.className = `cbe-banner cbe-banner-${era}`;
  el.setAttribute("aria-live", "polite");
  el.innerHTML = `
    <div class="cbe-b-veil"></div>
    <div class="cbe-b-flash"></div>
    <div class="cbe-b-band">
      <div class="cbe-b-deco"></div>
      <span class="cbe-b-line cbe-b-line-top"></span>
      <span class="cbe-b-line cbe-b-line-bottom"></span>
      <span class="cbe-b-corner cbe-b-tl"></span><span class="cbe-b-corner cbe-b-tr"></span>
      <span class="cbe-b-corner cbe-b-bl"></span><span class="cbe-b-corner cbe-b-br"></span>
      <div class="cbe-b-text">
        <div class="cbe-b-kicker">${esc(kicker)}</div>
        <div class="cbe-b-era">${esc(label)}</div>
        ${sub ? `<div class="cbe-b-sub">${esc(sub)}</div>` : ""}
      </div>
    </div>`;
  document.body.append(el);
  setTimeout(() => el.remove(), BANNER_MS + 200);
}

Hooks.once("ready", () => {
  game.socket.on(`module.${ID}`, (data) => {
    try { if (data?.type === "banner") showBanner(data); }
    catch (err) { console.error(`${ID} | bandeau`, err); }
  });
});

/* ================================================================== */
/*  Fenêtre de bascule                                                 */
/* ================================================================== */

const ONGLETS = [
  { id: "epoques", label: "Les époques", icon: "fa-solid fa-hourglass-half" },
  { id: "personnages", label: "Personnages", icon: "fa-solid fa-user-group" },
  { id: "reglages", label: "Réglages", icon: "fa-solid fa-gears" }
];

/** Personnages saisis dans le formulaire : { userId: { "1933": actorId, modern: actorId } } */
function charactersFromForm(data) {
  const map = {};
  for (const [uid, e] of Object.entries(data.p ?? {})) {
    const entry = {};
    for (const era of ERAS) if (e?.[era]) entry[era] = e[era];
    if (Object.keys(entry).length) map[uid] = entry;
  }
  return map;
}

/** Réglages des époques saisis dans le formulaire */
function configFromForm(data) {
  const cfg = {};
  for (const era of ERAS) {
    const d = data[era] ?? {};
    cfg[era] = {
      label: String(d.label ?? "").trim() || DEFAULT_LABELS[era],
      sub: String(d.sub ?? "").trim(),
      scene: d.scene ?? "",
      playlist: d.playlist ?? "",
      chatTheme: d.chatTheme ?? "",
      announce: !!d.announce,
      banner: !!d.banner
    };
  }
  return cfg;
}

/**
 * Une seule fenêtre à trois onglets : Les époques (la bascule), Personnages (par joueur et par époque)
 * et Réglages (scène, musique, thème du chat, annonce, bandeau). Changer d'onglet ne perd pas la saisie.
 */
class BasculeApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static instance = null;

  static DEFAULT_OPTIONS = {
    id: "coc7-bascule-epoque-app",
    tag: "form",
    classes: ["cbe-window"],
    window: { title: "Bascule d'époque", icon: "fa-solid fa-hourglass-half", resizable: true },
    position: { width: 660, height: "auto" },
    form: { handler: BasculeApp.#onSubmit, closeOnSubmit: false, submitOnChange: false },
    actions: {
      tab: BasculeApp.#onTab,
      switch: BasculeApp.#onSwitch,
      apply: BasculeApp.#onApply,
      preview: BasculeApp.#onPreview
    }
  };

  static PARTS = {
    nav: { template: `modules/${ID}/templates/onglets.hbs` },
    epoques: { template: `modules/${ID}/templates/bascule.hbs` },
    personnages: { template: `modules/${ID}/templates/characters.hbs` },
    reglages: { template: `modules/${ID}/templates/config.hbs` },
    pied: { template: `modules/${ID}/templates/pied.hbs` }
  };

  tab = "epoques";

  async _prepareContext() {
    const cfg = getConfig();
    const cur = currentEra();
    const map = game.settings.get(ID, "characters") ?? {};
    const level = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    const players = [...game.users].filter((u) => !u.isGM).sort((a, b) => a.name.localeCompare(b.name, "fr"));
    const charOpts = (user, selected) => {
      const owned = game.actors.filter((a) => a.type === "character" && a.testUserPermission(user, level));
      // si le joueur est déjà lié à une fiche qu'il ne possède pas, on la garde dans la liste
      const sel = selected ? game.actors.get(selected) : null;
      if (sel && !owned.includes(sel)) owned.push(sel);
      owned.sort((a, b) => a.name.localeCompare(b.name, "fr"));
      return [{ id: "", name: "— Aucun —", selected: !selected }]
        .concat(owned.map((a) => ({ id: a.id, name: a.name, selected: a.id === selected })));
    };
    const opt = (items, selected) => [{ id: "", name: "— Ne pas changer —", selected: !selected }]
      .concat(items.map((d) => ({ id: d.id, name: d.name, selected: d.id === selected })));
    const scenes = [...game.scenes].sort((a, b) => a.name.localeCompare(b.name, "fr"));
    const playlists = [...game.playlists].sort((a, b) => a.name.localeCompare(b.name, "fr"));
    const label = (era) => cfg[era].label || DEFAULT_LABELS[era];

    return {
      onglets: ONGLETS.map((o) => ({ ...o, actif: o.id === this.tab })),
      // Les époques
      eras: ERAS.map((era) => ({
        key: era,
        label: label(era),
        sub: cfg[era].sub,
        current: era === cur,
        scene: game.scenes.get(cfg[era].scene)?.name ?? "",
        playlist: game.playlists.get(cfg[era].playlist)?.name ?? "",
        chatTheme: cfg[era].chatTheme ? CHAT_THEMES[cfg[era].chatTheme] : "",
        folders: game.folders.filter((f) => f.getFlag(ID, "era") === era).length,
        players: players.filter((u) => map[u.id]?.[era]).length
      })),
      hasDossiers: active("dossiers-caches"),
      // Personnages
      eraLabels: ERAS.map((era) => ({ key: era, label: label(era) })),
      players: players.map((u) => ({
        id: u.id,
        name: u.name,
        current: u.character?.name ?? "—",
        eras: ERAS.map((era) => ({ key: era, options: charOpts(u, map[u.id]?.[era]) }))
      })),
      sync: game.settings.get(ID, "syncCharacters"),
      currentEra: cur,
      // Réglages
      chatActive: active("coc7-cartes-chat"),
      cfgEras: ERAS.map((era) => ({
        key: era,
        title: era === "1933" ? "Époque 1933" : "Époque 2025-2026",
        ...cfg[era],
        scenes: opt(scenes, cfg[era].scene),
        playlists: opt(playlists, cfg[era].playlist),
        themes: Object.entries(CHAT_THEMES).map(([id, name]) => ({ id, name, selected: id === (cfg[era].chatTheme ?? "") }))
      }))
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.#showTab();
  }

  /** N'affiche que l'onglet choisi ; les autres restent dans le formulaire (la saisie est conservée). */
  #showTab() {
    const el = this.element;
    for (const o of ONGLETS) el.querySelector(`[data-application-part="${o.id}"]`)?.classList.toggle("cbe-cache", o.id !== this.tab);
    el.querySelectorAll(".cbe-onglets a").forEach((a) => a.classList.toggle("actif", a.dataset.tab === this.tab));
    el.querySelector('[data-application-part="pied"]')?.classList.toggle("cbe-cache", this.tab === "epoques");
    this.setPosition({ height: "auto" });
  }

  static #onTab(event, target) {
    this.tab = target.dataset.tab;
    this.#showTab();
  }

  static async #onSwitch(event, target) {
    target.disabled = true;
    await switchEra(target.dataset.era);
  }

  /** Enregistrer : les personnages et les réglages en une fois. */
  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    await game.settings.set(ID, "characters", charactersFromForm(data));
    await game.settings.set(ID, "syncCharacters", !!data.sync);
    await game.settings.set(ID, "config", configFromForm(data));
    ui.notifications.info("Bascule d'époque : personnages et réglages enregistrés.");
    this.render();
  }

  /** Applique tout de suite l'époque en cours, avec les personnages saisis */
  static async #onApply() {
    const fd = new foundry.applications.ux.FormDataExtended(this.element);
    const data = foundry.utils.expandObject(fd.object);
    await game.settings.set(ID, "characters", charactersFromForm(data));
    const era = currentEra();
    if (!era) return ui.notifications.warn("Aucune époque en cours : fais d'abord une bascule.");
    const res = await applyCharacters(era);
    const label = getConfig()[era].label || DEFAULT_LABELS[era];
    if (res.missing.length) ui.notifications.warn(`Pas de personnage ${label} pour : ${res.missing.join(", ")}.`);
    ui.notifications.info(`Personnages ${label} appliqués (${res.changed} changé${res.changed > 1 ? "s" : ""}).`);
    this.render();
  }

  /** Aperçu du bandeau, chez le Gardien seulement, avec les valeurs en cours de saisie */
  static #onPreview(event, target) {
    const era = target.dataset.era;
    const form = this.element;
    const label = form.querySelector(`[name="${era}.label"]`)?.value?.trim() || DEFAULT_LABELS[era];
    const sub = form.querySelector(`[name="${era}.sub"]`)?.value?.trim() ?? "";
    showBanner({ era, label, sub }, { force: true });
  }

  static open(tab = "epoques") {
    this.instance ??= new BasculeApp();
    this.instance.tab = tab;
    if (this.instance.rendered) { this.instance.#showTab(); this.instance.bringToFront?.(); return this.instance; }
    return this.instance.render({ force: true });
  }

  static toggle() {
    if (this.instance?.rendered) return this.instance.close();
    return this.open("epoques");
  }
}

/* ================================================================== */
/*  Bouton dans les contrôles de scène                                 */
/* ================================================================== */

Hooks.on("getSceneControlButtons", (controls) => {
  const tokens = controls.tokens;
  if (!tokens?.tools) return;
  tokens.tools.basculeEpoque = {
    name: "basculeEpoque",
    title: "Bascule d'époque",
    icon: "fa-solid fa-hourglass-half",
    order: Object.keys(tokens.tools).length,
    button: true,
    visible: game.user.isGM,
    onChange: () => BasculeApp.toggle()
  };
});

/* ================================================================== */
/*  Dossiers : rattacher à une époque (clic droit, MJ)                 */
/* ================================================================== */

function folderFromTarget(target) {
  const el = target instanceof HTMLElement ? target : target?.[0];
  const li = el?.closest?.("li.folder") ?? el;
  const id = li?.dataset?.folderId ?? li?.dataset?.entryId ?? li?.dataset?.uuid?.split(".").pop();
  return id ? game.folders.get(id) : null;
}

function pickTarget(args) {
  for (const a of args) {
    if (a instanceof HTMLElement) return a;
    if (a?.[0] instanceof HTMLElement) return a[0];
  }
  return args.find((a) => a?.currentTarget instanceof HTMLElement)?.currentTarget ?? null;
}

function makeEntry({ label, icon, visible, onClick }) {
  const check = (...args) => visible(pickTarget(args));
  const run = (...args) => onClick(pickTarget(args));
  if (isV14()) return { label, icon: `fa-solid ${icon}`, visible: check, onClick: run };
  return { name: label, icon: `<i class="fa-solid ${icon}"></i>`, condition: check, callback: run };
}

async function tagFolder(target, era) {
  const folder = folderFromTarget(target);
  if (!folder) return;
  try {
    if (era) await folder.setFlag(ID, "era", era);
    else await folder.unsetFlag(ID, "era");
    const label = era ? (getConfig()[era].label || DEFAULT_LABELS[era]) : "les deux époques";
    ui.notifications.info(`Dossier « ${folder.name} » : ${label}.`);
  } catch (err) {
    console.error(`${ID} | dossier`, err);
    ui.notifications.error("Bascule d'époque : impossible d'enregistrer l'époque du dossier.");
  }
}

Hooks.on("getFolderContextOptions", (app, menuItems) => {
  if (!game.user.isGM) return;
  const tagOf = (t) => folderFromTarget(t)?.getFlag(ID, "era") ?? "";
  menuItems.push(
    makeEntry({ label: "Époque : 1933", icon: "fa-hourglass-start",
      visible: (t) => !!folderFromTarget(t) && tagOf(t) !== "1933", onClick: (t) => tagFolder(t, "1933") }),
    makeEntry({ label: "Époque : 2025-2026", icon: "fa-hourglass-end",
      visible: (t) => !!folderFromTarget(t) && tagOf(t) !== "modern", onClick: (t) => tagFolder(t, "modern") }),
    makeEntry({ label: "Époque : les deux", icon: "fa-hourglass",
      visible: (t) => !!folderFromTarget(t) && tagOf(t) !== "", onClick: (t) => tagFolder(t, "") })
  );
});

/* Petite étiquette d'époque sur les dossiers (visible par le MJ) */
function decorate(root) {
  if (!game.user.isGM || !root) return;
  for (const li of root.querySelectorAll("li.folder")) {
    const id = li.dataset.folderId ?? li.dataset.entryId ?? li.dataset.uuid?.split(".").pop();
    const era = id ? game.folders.get(id)?.getFlag(ID, "era") : null;
    const header = li.querySelector(":scope > .folder-header");
    header?.querySelector(".cbe-tag")?.remove();
    if (!header || !ERAS.includes(era)) continue;
    const tag = document.createElement("span");
    tag.className = `cbe-tag cbe-tag-${era}`;
    tag.textContent = era === "1933" ? "1933" : "2026";
    (header.querySelector("h3, .folder-name") ?? header).append(tag);
  }
}

function refreshDirectories() {
  for (const tab of Object.values(ui.sidebar?.tabs ?? {})) {
    try { decorate(tab.element); } catch (err) { /* décoratif */ }
  }
}

Hooks.on("renderDocumentDirectory", (app, html) => {
  try { decorate(html instanceof HTMLElement ? html : html?.[0] ?? app.element); }
  catch (err) { console.error(`${ID} | étiquettes`, err); }
});
Hooks.on("updateFolder", (folder, changes) => { if (changes?.flags) refreshDirectories(); });

/* ================================================================== */
/*  API pour macros                                                    */
/* ================================================================== */

Hooks.once("ready", () => {
  const mod = game.modules.get(ID);
  if (mod) mod.api = { switchEra, currentEra, open: (tab) => BasculeApp.open(tab), toggle: () => BasculeApp.toggle(), showBanner };
});
