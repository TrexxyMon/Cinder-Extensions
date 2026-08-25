// Z-Library — source de telechargement pour Cinder.
//
// Tout tient dans ce fichier : aucun serveur, aucun service tiers, aucun secret ailleurs
// que dans le `secureStore` de l'application.
//
// LE CHEMIN EMPRUNTE EST CELUI QUI A ETE PROUVE. Mesure du 2026-08-21 : rendre a Cinder
// un `{ url, headers }` fonctionne (import et lecture corrects), tandis que lui rendre un
// magnet a debrider fait planter l'application a 100 % du telechargement. Z-Library sert
// des liens directs authentifies par cookie : c'est donc exactement la forme qui marche.
//
// Les endpoints et les pieges viennent du greffon KOReader `ZlibraryKO/zlibrary.koplugin`,
// lu plutot que devine.

var Zlibrary = {};

Zlibrary.id = "zlibrary";
Zlibrary.name = "Z-Library";
Zlibrary.version = "1.2.0";
Zlibrary.icon = "book-outline";
Zlibrary.description = "Search, discover, and download ebooks through your Z-Library account.";

// Ce champ ROUTE l'ouverture d'un resultat : avec "manga", Cinder part vers le lecteur de
// chapitres et n'appelle jamais resolve(). Les sources de telechargement font "books".
Zlibrary.contentType = "books";
Zlibrary.contentTypes = ["ebook"];

Zlibrary.capabilities = {
  search: true,
  discover: true,
  // Pas d'URL directe dans les resultats : le lien s'obtient en deux temps.
  download: false,
  resolve: true,
  searchDownloads: true,
  bookChapters: false,
  manga: false,
};

Zlibrary.getSettings = function () {
  return [
    {
      // EN REGLAGE, PAS EN DUR. Les domaines de Z-Library tombent regulierement ; sans
      // ce champ, chaque saisie judiciaire rendrait l'extension inutilisable jusqu'a
      // republication. Ici, l'utilisateur change une ligne et repart.
      //
      // MESURE DU 2026-08-21, depuis la France :
      //   z-library.ec, z-lib.gd, z-lib.gl  -> l'API repond en JSON
      //   z-lib.fm, z-lib.sk               -> defi navigateur DiamWall, infranchissable
      //                                       en HTTP simple (307 en boucle puis 513)
      //   z-library.gs, 1lib.sk            -> injoignables
      // z-library.ec est celui que Z-Library recommande pour la France.
      id: "domaine",
      label: "Z-Library Domain",
      type: "text",
      defaultValue: "z-library.ec",
      placeholder: "z-library.ec, z-lib.gd, z-lib.gl",
    },
    {
      id: "langues",
      label: "Preferred Languages",
      type: "text",
      placeholder: "french, english - blank means all languages",
    },
    { id: "email", label: "Email Address", type: "text", placeholder: "you@example.com" },
    { id: "motdepasse", label: "Password", type: "password", placeholder: "Your Z-Library password" },
  ];
};

Zlibrary.UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";

// ─── Reglages et adresse de base ─────────────────────────────────────────────

Zlibrary._lire = async function (id, secret) {
  var v = await (secret ? cinder.secureStore : cinder.store).get(id);
  return v ? String(v).trim() : "";
};

/**
 * Adresse de base, depuis le REGLAGE et lui seul.
 *
 * Tolere « z-library.ec », « https://z-library.ec/ » et meme un « …/eapi » colle par
 * erreur.
 *
 * Le repli doit rester ALIGNE sur le `defaultValue` du reglage : il valait z-library.sk,
 * un domaine derriere DiamWall, ce qui faisait echouer l'extension reglage vide alors
 * meme que l'interface annoncait z-library.ec.
 */
Zlibrary._base = async function () {
  var brut = (await this._lire("domaine", false)) || "z-library.ec";
  var url = /^https?:\/\//i.test(brut) ? brut : "https://" + brut;
  return url.replace(/\/+$/, "").replace(/\/eapi$/i, "");
};

Zlibrary._form = function (champs) {
  var parts = [];
  for (var k in champs) {
    if (Object.prototype.hasOwnProperty.call(champs, k) && champs[k] !== undefined) {
      parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(champs[k])));
    }
  }
  return parts.join("&");
};

// ─── HTTP ────────────────────────────────────────────────────────────────────

/**
 * Appelle l'API et rend l'objet JSON.
 *
 * DEUX PIEGES TRAITES ICI. D'abord une reponse HTML : domaine mort, saisie judiciaire ou
 * defi anti-bot rendent une page, pas du JSON, et `JSON.parse` echouerait sur un message
 * incomprehensible. Ensuite le fait que `cinder.fetch` rend `{ status, data, headers }`
 * ou `data` est du TEXTE : il faut decoder soi-meme.
 */
Zlibrary._appel = async function (url, options, contexte) {
  var r;
  try {
    r = await cinder.fetch(url, options);
  } catch (e) {
    // Un domaine derriere DiamWall boucle en 307 sur lui-meme : selon le client, cela
    // remonte comme une exception plutot que comme du HTML. Les deux cas appellent le
    // MEME geste, donc le meme message — sans quoi l'utilisateur lit « injoignable » et
    // ne sait pas qu'il suffit de changer de domaine.
    throw new Error(
      "Z-Library could not be reached on this domain (" + contexte + "). "
      + "Try z-library.ec, z-lib.gd, or z-lib.gl in the extension settings."
    );
  }
  if (!r) throw new Error("Z-Library returned no response (" + contexte + ").");

  var corps = String(r.data || "").trim();
  if (corps.charAt(0) === "<") {
    throw new Error(
      "Z-Library returned a web page instead of API data (" + contexte + "). "
      + "This domain is behind a browser challenge or unavailable. Try "
      + "z-library.ec, z-lib.gd, or z-lib.gl in the extension settings."
    );
  }
  if (r.status < 200 || r.status >= 300) {
    throw new Error("Z-Library returned HTTP " + r.status + " (" + contexte + ").");
  }
  try {
    return JSON.parse(corps);
  } catch (e) {
    throw new Error("Z-Library returned an unreadable response (" + contexte + ").");
  }
};

// ─── Session ─────────────────────────────────────────────────────────────────
//
// La session tient en deux valeurs, `user_id` et `user_key`, renvoyees a la connexion et
// rejouees ensuite en en-tete Cookie. On les garde dans le `secureStore` pour ne pas
// refaire une connexion a chaque recherche.

Zlibrary._connecter = async function () {
  var email = await this._lire("email", false);
  var mdp = await this._lire("motdepasse", true);
  if (!email) throw new Error("Enter your email address in the Z-Library extension settings.");
  if (!mdp) throw new Error("Enter your password in the Z-Library extension settings.");

  var base = await this._base();
  var corps = this._form({ email: email, password: mdp });

  var j = await this._appel(base + "/eapi/user/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": this.UA,
    },
    body: corps,
    timeout: 30000,
  }, "sign in");

  var s = j.user || j.response || {};
  if (Number(j.success) !== 1 || !s.id || !s.remix_userkey) {
    var m = (j.error && j.error.message) || j.error || s.message || j.message;
    throw new Error(m ? "Z-Library: " + m : "Z-Library rejected these credentials. Check them in the extension settings.");
  }

  await cinder.secureStore.set("user_id", String(s.id));
  await cinder.secureStore.set("user_key", String(s.remix_userkey));
  cinder.log("[zlibrary] session opened");
  return { id: String(s.id), cle: String(s.remix_userkey) };
};

/**
 * Rend la session memorisee SANS se connecter.
 *
 * La recherche fonctionne sans compte (mesure du 2026-08-21) : exiger une connexion pour
 * chercher obligerait a saisir ses identifiants avant de savoir si l'extension sert a
 * quelque chose, et consommerait une session pour rien.
 */
Zlibrary._sessionSiConnu = async function () {
  var id = await this._lire("user_id", true);
  var cle = await this._lire("user_key", true);
  return id && cle ? { id: id, cle: cle } : null;
};

/** Rend la session memorisee, ou en ouvre une. Pour ce qui EXIGE un compte. */
Zlibrary._session = async function (forcer) {
  if (!forcer) {
    var id = await this._lire("user_id", true);
    var cle = await this._lire("user_key", true);
    if (id && cle) return { id: id, cle: cle };
  }
  return this._connecter();
};

Zlibrary._enTetes = function (session, base) {
  return {
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "User-Agent": this.UA,
    "Referer": base + "/",
    "Cookie": "remix_userid=" + session.id + "; remix_userkey=" + session.cle,
  };
};

/**
 * Rejoue l'appel une fois avec une session neuve si la premiere est refusee.
 *
 * Une cle memorisee finit par etre invalidee cote serveur. Sans cette reprise, l'extension
 * cesserait de fonctionner jusqu'a ce que l'utilisateur devine qu'il doit se reconnecter —
 * et rien dans l'interface ne le lui dirait.
 */
Zlibrary._avecSession = async function (faire) {
  var base = await this._base();
  var session = await this._session(false);
  try {
    return await faire(session, base);
  } catch (e) {
    if (!/refus|401|403|authenti/i.test(String(e && e.message))) throw e;
    cinder.warn("[zlibrary] session rejected, reconnecting");
    return faire(await this._session(true), base);
  }
};

// ─── Interface Cinder ────────────────────────────────────────────────────────

Zlibrary.LIMITE = 30;

/**
 * Convertit des livres de l'API en resultats Cinder.
 *
 * Partage par search() et par la decouverte : les quatre endpoints rendent la MEME forme
 * de livre, et deux conversions divergentes produiraient deux identites pour un meme
 * livre — ce que Cinder memorise pour la bibliotheque et la reprise.
 *
 * Un livre sans `hash` est ecarte : resolve() ne saurait pas le demander, et le laisser
 * passer donnerait une fiche qui echoue seulement au moment du telechargement.
 */
Zlibrary.LANGUAGE_ALIASES = {
  fr: "french",
  francais: "french",
  "français": "french",
  en: "english",
  anglais: "english",
  es: "spanish",
  espagnol: "spanish",
  de: "german",
  allemand: "german",
  it: "italian",
  italien: "italian",
  pt: "portuguese",
  portugais: "portuguese",
  ru: "russian",
  russe: "russian",
  ja: "japanese",
  japonais: "japanese",
  zh: "chinese",
  chinois: "chinese",
};

Zlibrary._languages = async function () {
  var raw = await this._lire("langues", false);
  if (!raw) return [];
  var self = this;
  return raw.split(/[,;]/).map(function (value) {
    var normalized = value.trim().toLowerCase();
    return self.LANGUAGE_ALIASES[normalized] || normalized;
  }).filter(Boolean);
};

// Older Cinder builds group extension results by title. Keep editions visible there
// while newer builds use the stable result id and show these fields separately.
Zlibrary._distinctTitle = function (book) {
  var title = String(book.title || "Untitled").trim();
  var details = [];
  if (book.language) details.push(String(book.language).trim());
  if (book.extension) details.push(String(book.extension).toLowerCase().trim());
  if (book.filesizeString) details.push(String(book.filesizeString).trim());
  return details.length ? title + " — " + details.join(" · ") : title;
};

Zlibrary._versResultats = function (livres) {
  return (livres || []).filter(function (b) { return b && b.id && b.hash; }).map(function (b) {
    return {
      // Identite STABLE : Cinder la memorise pour la bibliotheque et la reprise.
      id: "zlibrary:" + b.id,
      title: Zlibrary._distinctTitle(b),
      author: String(b.author || "").trim() || undefined,
      cover: b.cover || undefined,
      description: b.description || undefined,
      format: String(b.extension || "").toLowerCase() || undefined,
      size: b.filesizeString || undefined,
      source: Zlibrary.name,
      extra: {
        livreId: String(b.id),
        hash: String(b.hash || ""),
        language: b.language ? String(b.language).trim() : undefined,
      },
    };
  });
};

/** GET sur un endpoint qui rend { success, books }. */
Zlibrary._livres = async function (chemin, contexte, session, base) {
  var enTetes = session
    ? this._enTetes(session, base)
    : { "Accept": "application/json, text/javascript, */*; q=0.01", "User-Agent": this.UA, "Referer": base + "/" };

  var j = await this._appel(base + chemin, { method: "GET", headers: enTetes, timeout: 30000 }, contexte);
  if (Number(j.success) !== 1 || !j.books) {
    var m = (j && ((typeof j.error === "object" && j.error.message) || j.error || j.message));
    throw new Error("Z-Library: " + (m || "unexpected response (" + contexte + ")."));
  }
  return this._versResultats(j.books);
};

Zlibrary.search = async function (query, page) {
  var q = String(query || "").trim();
  if (!q) return [];

  var base = await this._base();
  var p = page && page > 1 ? page : 1;

  // Connecte si on peut, anonyme sinon : chercher n'exige pas de compte.
  var session = await this._sessionSiConnu();
  var enTetes = session
    ? this._enTetes(session, base)
    : { "Accept": "application/json, text/javascript, */*; q=0.01", "User-Agent": this.UA, "Referer": base + "/" };
  enTetes["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";

  var fields = { message: q, page: p, limit: this.LIMITE };
  var languages = await this._languages();
  for (var i = 0; i < languages.length; i++) fields["languages[" + i + "]"] = languages[i];

  var j = await this._appel(base + "/eapi/book/search", {
    method: "POST",
    headers: enTetes,
    body: this._form(fields),
    timeout: 30000,
  }, "search");

  if (j.error) {
    var m = (typeof j.error === "object" && j.error.message) || j.error;
    throw new Error("Z-Library: " + m);
  }

  // Une recherche exacte range ses resultats ailleurs que la recherche large.
  var livres = (j.books && j.books.length ? j.books : null)
    || (j.exactMatch && j.exactMatch.books) || [];

  cinder.log("[zlibrary] " + livres.length + " result(s) for \"" + q + "\""
    + (session ? "" : " (anonymous)"));

  return this._versResultats(livres);
};

// ─── Decouverte ──────────────────────────────────────────────────────────────
//
// Quatre sections, dont UNE SEULE fonctionne sans compte. Mesure du 2026-08-21 sur
// z-library.ec : `/eapi/book/most-popular` repond 200 avec 100 livres en anonyme, tandis
// que `recommended` et `saved` rendent 400 et `success: 0`.
//
// D'ou la regle appliquee ici : les sections personnelles n'apparaissent QUE si une
// session existe. Les afficher puis echouer serait une promesse non tenue, et
// l'utilisateur n'aurait aucun moyen de comprendre que le probleme est son compte.

Zlibrary.SECTIONS = [
  { id: "populaires", title: "Popular", icon: "flame", compte: false, chemin: "/eapi/book/most-popular", pagine: false },
  { id: "recommandes", title: "Recommended for You", icon: "sparkles", compte: true, chemin: "/eapi/user/book/recommended", pagine: false },
  { id: "enregistres", title: "My Z-Library", icon: "bookmark", compte: true, chemin: "/eapi/user/book/saved", pagine: true },
  { id: "telecharges", title: "Already Downloaded", icon: "download", compte: true, chemin: "/eapi/user/book/downloaded", pagine: true },
];

Zlibrary.getDiscoverSections = async function () {
  var connecte = Boolean(await this._sessionSiConnu());
  return this.SECTIONS
    .filter(function (s) { return connecte || !s.compte; })
    .map(function (s) { return { id: s.id, title: s.title, icon: s.icon }; });
};

Zlibrary.getDiscoverItems = async function (sectionId, page) {
  var section = this.SECTIONS.filter(function (s) { return s.id === sectionId; })[0];
  if (!section) return [];

  var p = page && page > 1 ? page : 1;
  // Les sections non paginees rendent tout d'un bloc : redemander la page 2 renverrait
  // les memes livres, que Cinder afficherait en double.
  if (!section.pagine && p > 1) return [];

  var base = await this._base();
  var self = this;

  if (!section.compte) {
    return this._livres(section.chemin, section.title, await this._sessionSiConnu(), base);
  }

  return this._avecSession(function (session, baseSession) {
    var chemin = section.chemin + "?page=" + p + "&limit=" + self.LIMITE;
    return self._livres(chemin, section.title, session, baseSession);
  });
};

Zlibrary.resolve = async function (item) {
  var e = (item && item.extra) || {};
  if (!e.livreId || !e.hash) throw new Error("This result does not include a book identifier.");
  var self = this;

  return this._avecSession(async function (session, base) {
    var j = await self._appel(
      base + "/eapi/book/" + encodeURIComponent(e.livreId) + "/" + encodeURIComponent(e.hash) + "/file",
      { method: "GET", headers: self._enTetes(session, base), timeout: 30000 },
      "download link"
    );

    var f = j && j.file;
    if (Number(j.success) !== 1 || !f) {
      throw new Error("Z-Library: " + ((j && j.message) || "download link rejected."));
    }

    // LE PIEGE QUI COMPTE, et qu'on ne devine pas : quota epuise, l'API repond
    // `success: 1` AVEC la fiche du livre mais SANS lien, et `allowDownload: false`.
    // Un code qui ne testerait que `success` conclurait a une reussite et rendrait une
    // URL vide.
    if (!f.downloadLink) {
      if (f.allowDownload === false) {
        throw new Error("Your daily Z-Library download limit has been reached. Try again after it resets.");
      }
      throw new Error("Z-Library did not return a download link for this book.");
    }

    var ext = String(f.extension || item.format || "epub").toLowerCase();
    var nom = String(item.title || "book").replace(/[\\/:*?"<>|]+/g, " ").trim();

    cinder.log("[zlibrary] resolved link for \"" + nom + "\" (" + ext + ")");

    // Le lien est authentifie par cookie : les en-tetes DOIVENT accompagner l'URL, sinon
    // Cinder telecharge une page de connexion a la place du fichier.
    return {
      url: f.downloadLink,
      fileName: nom + "." + ext,
      headers: self._enTetes(session, base),
    };
  });
};

__cinderExport = Zlibrary;
