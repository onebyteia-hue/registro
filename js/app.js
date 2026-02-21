
import { consumeRedirectResult } from "./firebase.js";

consumeRedirectResult();

import { onAuth, loginGoogle, logout, uploadPadrinoPhoto } from "./firebase.js";

import { state, setUser, setProfile, clearProfile } from "./state.js";
import {
  setTopAuthUI,
  setHeaderUser,
  setHeaderList,
  setFabVisibility,
  setView,
  openModal,
  bindModalEvents,
  toastInline,
  fmtRemaining,
  roleIsAhijado,
  roleIsPadrino,
} from "./ui.js";
import {
  getMyProfile,
  ensureProfile,
  saveOnboarding,
  acceptRules,
  queryPadrinos,
  cleanupExpiredForUser,
  fetchPassRegistro,
  reservePadrino,
  savePadrinoProfile,
  adminListUsersByRole,
  adminSetPadrinoNoDisponible,
  adminSetPadrinoDisponible,
  adminSetAhijadoNoDisponible,
  adminSetAhijadoDisponible,
} from "./firestore.js";

const $ = (id) => document.getElementById(id);

bindModalEvents();




/* ---------- ROUTER ---------- */
function nav(path) {
  location.hash = path;
}

function route() {
  const hash = location.hash.replace("#", "") || "/";

  if (!state.user) {
    setFabVisibility({
      showDock: false,
      showAdmin: false,
      showRegister: false,
      showMe: false,
    });
    renderWelcome();
    return;
  }
  if (!state.profile) {
    renderLoading("Cargando tu perfil…");
    return;
  }

  // Limpieza de expiraciones frecuente
  cleanupExpiredForUser(state.user.uid).catch(() => {});

  // Forzar onboarding (nombre+2 apellidos+rol)
  const needsOnboarding =
    !state.profile?.nombre ||
    !state.profile?.apellidoP ||
    !state.profile?.apellidoM ||
    !state.profile?.rol;
  if (needsOnboarding && hash !== "/ingreso") {
    nav("/ingreso");
    return;
  }

  // Modal reglas (solo si no aceptó)
  if (state.profile?.reglasAceptadas === false && hash !== "/ingreso") {
    // se muestra después de ingreso, pero si por algo llega acá, la mostramos
    showRulesModalIfNeeded();
  }

  switch (hash) {
    case "/":
      nav("/buscador");
      break;
    case "/ingreso":
      renderIngreso();
      break;
    case "/buscador":
      renderBuscador();
      break;
    case "/perfil":
      renderBuscador();
      break; // perfil se abre por param ?id=
    case "/registro":
      renderRegistro();
      break;
    case "/miperfil":
      renderMiPerfil();
      break;
    case "/admin":
      renderAdmin();
      break;
    default:
      nav("/buscador");
  }
}

window.addEventListener("hashchange", route);

/* ---------- AUTH ---------- */
$("btnLogin").addEventListener("click", async () => {
  try {
    await loginGoogle();
  } catch (e) {
    alert("No se pudo iniciar sesión con Google.");
  }
});
$("btnLogout").addEventListener("click", async () => {
  await logout();
});

onAuth(async (user) => {
  setUser(user || null);
  setTopAuthUI(!!user);

  if (!user) {
    clearProfile();
    setHeaderUser(null);
    setHeaderList([], "Reservas");
    route();
    return;
  }

  // crea doc base si no existe
  const defaults = {
    rol: null,
    nombre: null,
    apellidoP: null,
    apellidoM: null,
    nombreCompleto: null,

    admin: false,
    reglasAceptadas: false,

    // Padrino
    padrino: false,
    estadoPadrino: "disponible", // solo si rol padrino
    reservaActiva: null,
    editsUsed: 0,
    miPerfilPass: null,
    apodo: "",
    fotoURL: "",
    descripcion: "",
    aspectos: {
      alcoholico: 0,
      chismoso: 0,
      estudioso: 0,
      fiestero: 0,
      carinoso: 0,
    }, // placeholder

    // Ahijado
    estadoApadrinado: "disponible",
    reservasActivas: [],
  };

  const prof = await ensureProfile(user.uid, defaults);
  state.profileRefId = user.uid;
  setProfile(prof);

  refreshHeader();
  route();

  // auto-clean reservas vencidas
  cleanupExpiredForUser(user.uid)
    .then(async () => {
      const updated = await getMyProfile(user.uid);
      if (updated.data) {
        setProfile(updated.data);
        refreshHeader();
        route();
      }
    })
    .catch(() => {});
});

/* ---------- HEADER & FABS ---------- */
function refreshHeader() {
  const p = state.profile;
  setHeaderUser(p);

  // Header list
  if (!p) {
    setHeaderList([], "Reservas");
  } else if (p.rol === "ahijado") {
    const items = (p.reservasActivas || []).map((r) => {
      const ms = r.expiresAt ? r.expiresAt.toMillis() - Date.now() : 0;
      return `${r.padrinoNombreCompleto || "—"} · ${fmtRemaining(ms)}`;
    });
    setHeaderList(items, "Tus padrinos (activos)");
  } else if (p.rol === "padrino") {
    if (
      p.estadoPadrino !== "disponible" &&
      p.reservaActiva?.ahijadoNombreCompleto
    ) {
      setHeaderList(
        [`Ahijado: ${p.reservaActiva.ahijadoNombreCompleto}`],
        "Tu estado",
      );
    } else {
      setHeaderList([], "Tu estado");
    }
  }

  // FABs
  const showDock = true;
  const showAdmin = !!p.admin;
  const showRegister = p.rol === "padrino" && Number(p.editsUsed || 0) < 3;
  const showMe = p.rol === "padrino";
  setFabVisibility({ showDock, showAdmin, showRegister, showMe });

  $("fabAdmin").onclick = () => nav("/admin");
  $("fabRegister").onclick = () => nav("/registro");
  $("fabMe").onclick = () => nav("/miperfil");
}

/* ---------- MODAL RULES ---------- */
async function showRulesModalIfNeeded() {
  const p = state.profile;
  if (!p || p.reglasAceptadas) return;

  const ok = await openModal({
    title: "Reglas del juego",
    okText: "Acepto",
    cancelText: null,
    bodyHTML: `
      <div class="notice">
      <b>Importante:</b> Lee los términos y condiciones.
      <br><br>
      
    </div>

    <div class="hr"></div>

    <h4 style="margin:10px 0 6px;">👶 Reglas para Ahijados</h4>
    <div class="subtle" style="line-height:1.45;">
      • Puedes <b>ver a todos los padrinos</b> y sus perfiles, especialmente los que estén <b>Disponibles</b>.<br>
      • Puedes <b>reservar hasta 2 padrinos</b> a la vez. Cada reserva dura <b>30 minutos</b>.<br>
      • Estados del padrino:
      <ul style="margin:6px 0 0 18px; padding:0;">
        <li><b>Disponible:</b> puedes reservarlo.</li>
        <li><b>Reservado:</b> <b>no se puede reservar</b>. Está en espera para otro ahijado (puede liberarse si vence el tiempo).</li>
        <li><b>No disponible:</b> ya fue ocupado/confirmado y <b>ya no está en juego</b>.</li>
      </ul>
      • Tus padrinos reservados se muestran siempre en el <b>encabezado</b> (arriba) para que los identifiques rápido.
    </div>

    <div class="hr"></div>

    <h4 style="margin:10px 0 6px;">🧑‍🤝‍🧑 Reglas para Padrinos</h4>
    <div class="subtle" style="line-height:1.45;">
      • Como padrino puedes <b>ver perfiles</b>, pero <b>no puedes reservar</b> ni realizar acciones de “elección”.<br>
      • Al ingresar por primera vez, debes <b>llenar tu formulario</b> para estar activo en la lista.<br>
      • El formulario es rápido: tiene <b>solo 3 opciones</b> a completar (tal como aparece en pantalla).<br>
      • Si quedas <b>Reservado</b>, en el <b>encabezado</b> verás el <b>nombre de tu posible ahijado</b> mientras dure la reserva.<br>
      • Si tu reserva vence o se libera, tu estado puede volver a <b>Disponible</b>.
    </div>

    <div class="hr"></div>

    <div class="subtle">
      Al presionar <b>“Acepto”</b>, confirmas que estás de acuerdo con estas reglas y el funcionamiento de la app.
    </div>
    `,
    
  });

  if (ok) {
    await acceptRules(state.user.uid);
    const updated = await getMyProfile(state.user.uid);
    setProfile(updated.data);
    refreshHeader();
  }
}

/* ---------- VIEWS ---------- */
function renderWelcome() {
  setView(`
    <div class="grid">
      <div class="card" style="grid-column: span 12; cursor: default;">
        <img class="card__img" alt="" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Crect width='120' height='120' rx='24' fill='rgba(255,255,255,0.12)'/%3E%3C/svg%3E"/>
        <div class="card__meta">
          <div class="card__title">Inicia sesión con Google</div>
          <div class="card__sub">Para continuar, entra con Google. Luego completarás tu nombre y apellidos.</div>
          <div class="tagrow">
            <span class="tag">Apple-like</span>
            <span class="tag">Responsive</span>
            <span class="tag">Reservas 30 min</span>
          </div>
        </div>
      </div>
    </div>
  `);
}

function renderLoading(text) {
  setView(`
    <div class="notice">${text || "Cargando…"}</div>
  `);
}

function renderIngreso() {
  setView(`
    <div>
      <div class="kicker">Ingreso</div>
      <div class="headline">Completa tus datos</div>
      <div class="subtle">Obligatorio: nombre + apellido paterno + apellido materno + rol.</div>

      <div class="hr"></div>

      <div class="fieldrow">
        <div class="field">
          <label>Nombre</label>
          <input id="inNombre" placeholder="Ej: Juan" autocomplete="given-name">
        </div>
        <div class="field">
          <label>Apellido paterno</label>
          <input id="inApP" placeholder="Ej: Pérez" autocomplete="family-name">
        </div>
      </div>

      <div class="fieldrow" style="margin-top:12px;">
        <div class="field">
          <label>Apellido materno</label>
          <input id="inApM" placeholder="Ej: López" autocomplete="additional-name">
        </div>
        <div class="field">
          <label>Rol</label>
          <select id="inRol">
            <option value="">Selecciona…</option>
            <option value="padrino">Padrino</option>
            <option value="ahijado">Ahijado</option>
          </select>
        </div>
      </div>

      <div class="hr"></div>

      <button id="btnGuardarIngreso" class="btn btn--primary">Aceptar</button>
      <div id="ingresoMsg" style="margin-top:12px;"></div>
    </div>
  `);

  // precarga si ya hay datos
  const p = state.profile || {};
  $("inNombre").value = p.nombre || "";
  $("inApP").value = p.apellidoP || "";
  $("inApM").value = p.apellidoM || "";
  $("inRol").value = p.rol || "";

  $("btnGuardarIngreso").addEventListener("click", async () => {
    const msg = $("ingresoMsg");
    msg.innerHTML = "";

    const nombre = $("inNombre").value.trim();
    const apellidoP = $("inApP").value.trim();
    const apellidoM = $("inApM").value.trim();
    const rol = $("inRol").value;

    if (!nombre || !apellidoP || !apellidoM || !rol) {
      toastInline(
        msg,
        "Completa nombre y tus dos apellidos, y selecciona rol.",
        "danger",
      );
      return;
    }

    // set estados por rol
    const payload = {
      nombre,
      apellidoP,
      apellidoM,
      rol,
    };

    if (rol === "padrino") {
      payload.padrino = true;
      payload.estadoPadrino = state.profile?.estadoPadrino || "disponible";
      payload.estadoApadrinado = "disponible"; // no se usa, pero no molesta
    } else {
      payload.padrino = false;
      payload.estadoApadrinado =
        state.profile?.estadoApadrinado || "disponible";
      // estadoPadrino no aplica
    }

    await saveOnboarding(state.user.uid, payload);

    const updated = await getMyProfile(state.user.uid);
    setProfile(updated.data);
    refreshHeader();

    // mostrar reglas si no aceptó
    await showRulesModalIfNeeded();

    nav("/buscador");
  });
}

function renderBuscador() {
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  const openProfileId = params.get("id");

  setView(`
    <div>
      <div class="kicker">Buscador</div>
      <div class="headline">Elige tu padrino</div>
      <div class="subtle">Busca por nombre o apodo, o filtra por características.</div>

      <div class="hr"></div>

      <div class="fieldrow">
        <div class="field">
          <label>Buscar</label>
          <input id="qSearch" placeholder="Nombre o apodo…">
        </div>
        <div class="field">
          <label>Ordenar por</label>
          <select id="qSort">
            <option value="alcoholico_desc">Alcohólico (mayor → menor)</option>
            <option value="chismoso_desc">Chismoso/a (mayor → menor)</option>
            <option value="estudioso_desc">Estudioso/a (mayor → menor)</option>
            <option value="fiestero_desc">Fiestero/a (mayor → menor)</option>
            <option value="nombre_asc">Nombre (A → Z)</option>
          </select>
        </div>
      </div>

      <div class="hr"></div>

      <div id="list" class="grid"></div>
      <div id="listMsg" style="margin-top:12px;"></div>
    </div>
  `);

  const msg = $("listMsg");
  const list = $("list");

  (async () => {
    msg.innerHTML = "";
    list.innerHTML = `<div class="notice" style="grid-column: span 12;">Cargando padrinos…</div>`;

    const all = await queryPadrinos();
    state.padrinosCache = all;

    // limpieza básica de UI y abrir perfil si viene param id
    renderPadrinosList();
    if (openProfileId) openProfile(openProfileId);
  })().catch((err) => {
  console.error("queryPadrinos failed:", err);

  list.innerHTML = "";

  toastInline(
    msg,
    err?.message || "No se pudo cargar padrinos.",
    "danger"
  );
});


  $("qSearch").addEventListener("input", renderPadrinosList);
  $("qSort").addEventListener("change", renderPadrinosList);

  function getScore(p, key) {
    const a = p.aspectos || {};
    const n = Number(a[key] ?? 0);
    return Number.isFinite(n) ? n : 0;
  }

  function renderPadrinosList() {
    const q = $("qSearch").value.trim().toLowerCase();
    const sort = $("qSort").value;

    let arr = [...state.padrinosCache];

    if (q) {
      arr = arr.filter((p) => {
        const name =
          `${p.nombre || ""} ${p.apellidoP || ""} ${p.apellidoM || ""}`.toLowerCase();
        const apodo = (p.apodo || "").toLowerCase();
        return name.includes(q) || apodo.includes(q);
      });
    }

    // sort
    const [field, dir] = sort.split("_");
    if (field === "nombre") {
      arr.sort((a, b) => {
        const aa = `${a.nombre || ""} ${a.apellidoP || ""}`.toLowerCase();
        const bb = `${b.nombre || ""} ${b.apellidoP || ""}`.toLowerCase();
        return aa.localeCompare(bb);
      });
    } else {
      const keyMap = {
        alcoholico: "alcoholico",
        chismoso: "chismoso",
        estudioso: "estudioso",
        fiestero: "fiestero",
      };
      const k = keyMap[field] || "alcoholico";
      arr.sort((a, b) => getScore(b, k) - getScore(a, k));
    }

    list.innerHTML = "";
    if (!arr.length) {
      list.innerHTML = `<div class="notice" style="grid-column: span 12;">No hay resultados.</div>`;
      return;
    }

    for (const p of arr) {
      const full =
        `${p.nombre || ""} ${p.apellidoP || ""} ${p.apellidoM || ""}`.trim();
      const stateText =
        p.estadoPadrino === "disponible"
          ? "Disponible"
          : p.estadoPadrino === "reservado"
            ? "Reservado"
            : "No disponible";
            const stateClass =
  p.estadoPadrino === "disponible"
    ? "statuspill statuspill--ok"
    : p.estadoPadrino === "reservado"
      ? "statuspill statuspill--warn"
      : "statuspill statuspill--danger";


      const img =
        p.fotoURL && p.fotoURL.startsWith("http")
          ? p.fotoURL
          : "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Crect width='120' height='120' rx='24' fill='rgba(255,255,255,0.12)'/%3E%3C/svg%3E";

      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
  <img class="card__img" src="${img}" alt="">
  <div class="card__meta">
    <div class="card__top">
      <span class="${stateClass}">${stateText}</span>
    </div>

    <div class="card__title">${escapeHtml(full || "—")}</div>
    <div class="card__sub">${escapeHtml(p.apodo ? `@${p.apodo}` : "Sin apodo")}</div>

    <div class="tagrow">
      <span class="tag">🍻 ${num(getScore(p, "alcoholico"))}</span>
      <span class="tag">🗣️ ${num(getScore(p, "chismoso"))}</span>
      <span class="tag">📚 ${num(getScore(p, "estudioso"))}</span>
      <span class="tag">🎉 ${num(getScore(p, "fiestero"))}</span>
    </div>
  </div>
`;

      card.addEventListener("click", () => openProfile(p.id));
      list.appendChild(card);
    }
  }

  async function openProfile(id) {
    // Re-render in-place by showing modal-like full profile section
    const p = state.padrinosCache.find((x) => x.id === id);
    if (!p) {
      toastInline(msg, "No se encontró el padrino.", "danger");
      return;
    }

    // Si no disponible o reservado => modal "No disponible" con "Padrino de: ..."
    if (p.estadoPadrino !== "disponible") {
      const chosenBy = p.reservaActiva?.ahijadoNombreCompleto
        ? `<b>Padrino de:</b> ${escapeHtml(p.reservaActiva.ahijadoNombreCompleto)}`
        : `<b>Padrino de:</b> —`;

      await openModal({
        title: "No disponible",
        bodyHTML: `
          <div class="notice">
            Este padrino está <b>${p.estadoPadrino === "reservado" ? "reservado" : "no disponible"}</b>.
            <br><br>
            ${chosenBy}
            <div class="hr"></div>
            <div class="subtle">Puede que no lo ocupen; espera por si se vuelve disponible.</div>
          </div>
        `,
        okText: "Entendido",
      });
    }

    // Navegar a perfil view dentro del mismo panel
    renderPerfil(p);
  }

  function renderPerfil(p) {
    const full =
      `${p.nombre || ""} ${p.apellidoP || ""} ${p.apellidoM || ""}`.trim();
    const img =
      p.fotoURL && p.fotoURL.startsWith("http")
        ? p.fotoURL
        : "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='800'%3E%3Crect width='800' height='800' rx='120' fill='rgba(255,255,255,0.10)'/%3E%3C/svg%3E";

    const stateText =
      p.estadoPadrino === "disponible"
        ? "Disponible"
        : p.estadoPadrino === "reservado"
          ? "Reservado"
          : "No disponible";

    setView(`
      <div>
        <button class="btn btn--ghost" id="btnBack">← Volver</button>
        <div class="hr"></div>

        <div class="profile">
          <div>
            <img class="avatar" src="${img}" alt="">
            <div class="hr"></div>
            <div class="badge">${stateText}</div>
            <div class="subtle" style="margin-top:10px;">
              ${p.apodo ? `@${escapeHtml(p.apodo)}` : "Sin apodo"}
            </div>
          </div>

          <div>
            <h1 class="profile__title">${escapeHtml(full || "—")}</h1>
            

<div class="hr"></div>
<div class="kicker">Aspectos</div>
<div class="tagrow">
  <span class="tag">🍻 "Borracho" ${num((p.aspectos || {}).alcoholico)}%</span>
  <span class="tag">❤️ "Cariñoso"${num((p.aspectos || {}).carinoso)}%</span>
  <span class="tag">🗣️ "Chismoso"${num((p.aspectos || {}).chismoso)}%</span>
  <span class="tag">📚 "Estudioso"${num((p.aspectos || {}).estudioso)}%</span>
  <span class="tag">🎉 "Fiestero"${num((p.aspectos || {}).fiestero)}%</span>
</div>

<div class="hr"></div>
<div class="kicker">Cuestionario</div>
${renderCuestionario(p)}


            <div id="perfilMsg" style="margin-top:14px;"></div>
            <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:12px;">
              ${roleIsAhijado() ? `<button id="btnReserve" class="btn btn--primary">Reservar 30 min</button>` : ``}
              <button id="btnCopyWait" class="btn btn--ghost">¿Qué pasa si está reservado?</button>
            </div>
          </div>
        </div>
      </div>
    `);
    const back = document.getElementById("btnBack");
if (back) back.onclick = () => {
  // vuelve al buscador con la lista/card pequeñita
  location.hash = "#/buscador";   // o nav("/buscador") si tienes nav()
};


    

    $("btnBack").onclick = () => nav("/buscador");
    $("btnCopyWait").onclick = async () => {
      await openModal({
        title: "Si está reservado…",
        bodyHTML: `
          <div class="notice">
            Si está reservado o no disponible, no podrás reservar.
            <div class="hr"></div>
            <div class="subtle">Puede que no lo ocupen; espera por si se vuelve disponible.</div>
          </div>
        `,
        okText: "Ok",
      });
    };

    if (roleIsAhijado()) {
      $("btnReserve").onclick = async () => {
        const msg = $("perfilMsg");
        msg.innerHTML = "";
        try {
          // Recargar datos antes de reservar (evitar stale)
          await cleanupExpiredForUser(state.user.uid);

          // Validaciones simples
          if (state.profile.estadoApadrinado === "no_disponible") {
            toastInline(
              msg,
              "Tu cuenta está bloqueada para reservar (solo ver).",
              "danger",
            );
            return;
          }

          if (p.estadoPadrino !== "disponible") {
            toastInline(
              msg,
              "No se puede reservar. Puede que no lo ocupen; espera por si se vuelve disponible.",
              "danger",
            );
            return;
          }

          await reservePadrino({ ahijadoId: state.user.uid, padrinoId: p.id });

          // refrescar perfil y lista
          const updated = await getMyProfile(state.user.uid);
          setProfile(updated.data);
          refreshHeader();

          toastInline(msg, "✅ Reserva realizada por 30 minutos.", "info");
          nav("/buscador");
        } catch (e) {
          toastInline(msg, e.message || "No se pudo reservar.", "danger");
        }
      };
    }
  }

  function escapeHtml(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
  function num(x) {
    const n = Number(x ?? 0);
    return Number.isFinite(n) ? n : 0;
  }
}

function renderRegistro() {
  if (!roleIsPadrino()) {
    setView(
      `<div class="notice">Solo padrinos pueden acceder a Registro.</div>`,
    );
    return;
  }
  if (Number(state.profile.editsUsed || 0) >= 3) {
    setView(
      `<div class="notice">Ya agotaste tus 3 ediciones de registro.</div>`,
    );

    return;
  }

  setView(`
    <div>
      <div class="kicker">Registro padrino</div>
      <div class="headline">Tu ficha (Normalista)</div>
      <div class="subtle">Solo 3 ediciones. Marca una opción o escribe “Otro”.</div>

      <div class="hr"></div>

      <div class="field">
        <label>Contraseña global (pass_cursos)</label>
        <input id="regPass" type="password" placeholder="Ingresa la contraseña...">
      </div>

      <div class="hr"></div>

      <div class="kicker">Foto de perfil</div>
      <div class="subtle">Se sube a Firebase Storage y se guarda la URL.</div>
      <div class="fieldrow" style="margin-top:10px;">
        <div class="field">
          <label>Seleccionar foto</label>
          <input id="photoFile" type="file" accept="image/*">
        </div>
        <div class="field" style="display:flex; justify-content:flex-end; gap:10px; align-items:end;">
          <button id="btnUploadPhoto" class="btn btn--ghost" type="button">Subir foto</button>
        </div>
      </div>
      <div class="subtle" id="photoStatus" style="margin-top:8px;">Sin foto subida.</div>

      <div class="hr"></div>

      <div class="kicker">Cuestionario (20)</div>
      <div class="subtle">Checkboxes (solo 1). Si escribes en “Otro”, se desmarcan.</div>

      <div class="hr"></div>

      <div id="qContainer" style="display:flex; flex-direction:column; gap:12px;"></div>

      <div class="hr"></div>

      <div class="kicker">Acceso a “Mi Perfil”</div>
      <div class="field">
        <label>Contraseña de Mi Perfil (la defines aquí)</label>
        <input id="miPass" type="password" placeholder="mín. 4 caracteres">
      </div>

      <div class="hr"></div>

      <button id="btnSaveReg" class="btn btn--primary">Guardar (consume 1 edición)</button>
      <button id="btnCancelReg" class="btn btn--ghost">Cancelar</button>
      <div id="regMsg" style="margin-top:12px;"></div>
    </div>
  `);

  $("btnCancelReg").onclick = () => nav("/buscador");

  // ---- preguntas ----
  const Q = [
    // 1 y 2 SOLO TEXTO
    { id: "q1", t: "1. ¿Cuál es tu nombre real?", type: "text" },
    { id: "q2", t: "2. ¿Cuál es tu apodo?", type: "text" },

    // 3–20 opciones + otro
    {
      id: "q3",
      t: "3. ¿Cuál es tu especialidad (Tu condena)?",
      opts: [
        "A) Primaria (Paciencia de santo).",
        "B) Física-Química (Cerebro de Einstein, hígado de acero).",
        "C) Inicial (Estoy agotado/a).",
      ],
    },

    {
      id: "q4",
      t: "4. ¿Cuál es tu situación sentimental actual?",
      opts: [
        "A) Fiel como perro de pueblo.",
        "B) Libre como el viento (y soltero por elección... de los demás).",
        "C) Relación tóxica con mi Tesis: me quita el sueño y me hace llorar.",
        "D) El que da consejos de amor pero muere solo.",
      ],
    },
    {
      id: "q5",
      t: "5. ¿Cuántos 'Casi Algo' acumulaste en la ESFM?",
      opts: [
        "A) Cero, soy un santo de altar.",
        "B) Perdí la cuenta en 2do año; el amor es un deporte de riesgo.",
        "C) Mi crush ni sabe que existo, soy un fantasma en su vida.",
        "D) En proceso de conquista masiva (puro humo).",
      ],
    },

    {
      id: "q6",
      t: "6. ¿A qué le tienes fobia realmente?",
      opts: [
        "A) A que se termine el trago en plena fiesta.",
        "B) A los niños de inicial gritando al unísono.",
        "C) A que Doña Evita me encuentre y me cobre la cuenta.",
        "D) A que cierren 'El Escondite' por falta de clientes.",
      ],
    },
    {
      id: "q7",
      t: "7. ¿Cómo describirías tu estilo de moda?",
      opts: [
        "A) Marca 'Imitación' de la feria.",
        "B) 'Uso lo primero que huela a limpio'.",
        "C) Ropa de segunda con dignidad de primera.",
        "D) Gucci y Prada (versión Vacas).",
      ],
    },
    {
      id: "q8",
      t: "8. ¿Qué comida te hace feliz?",
      opts: [
        "A) La salteña de ayer (recalentada con fe).",
        "B) El Maruchan que me fió Doña Evita.",
        "C) Fideos con fe y mucho picante.",
        "D) La que me invite un ahijado desesperado.",
      ],
    },

    {
      id: "q9",
      t: "9. ¿Cuál es tu resistencia al alcohol?",
      opts: [
        "A) 'Olor a corcho': me mareo con el anuncio de la cerveza.",
        "B) Aguanto hasta el desfile cívico.",
        "C) Leyenda de las verbenas (el último en pie).",
        "D) El que termina llorando por su ex a las 3 AM.",
      ],
    },
    {
      id: "q10",
      t: "10. ¿Has ido a clase 'con poderes' (ebrio)?",
      opts: [
        "A) ¡Jamás! Mi cuerpo es un templo.",
        "B) Una vez y el profe me felicitó por mi 'creatividad'.",
        "C) Es mi estado natural, la sobriedad me da ansiedad.",
        "D) Fui, pero me sacaron por roncar en primera fila.",
      ],
    },
    {
      id: "q11",
      t: "11. ¿Cuál es tu nivel de alcohol en sangre ahora mismo?",
      opts: [
        "A) 0% Aburrido y funcional.",
        "B) 50% Aún recuerdo mi nombre y mi CI.",
        "C) 90% Veo doble, pero los dos se ven guapos.",
        "D) 100% Leyenda viviente: hablo en idiomas olvidados.",
      ],
    },

    {
      id: "q12",
      t: "12. ¿Cómo vas en tus materias?",
      opts: [
        "A) Soy un genio, el docente me consulta a mí.",
        "B) Paso con 51 y mucha oración al Señor de las Caídas.",
        "C) El docente me tiene ojeriza porque soy más popular que él.",
        "D) Casi voy a clase, pero la vida social me consume.",
      ],
    },
    {
      id: "q13",
      t: "13. ¿Cuál es tu situación económica real?",
      opts: [
        "A) 'Sobreviviré' (a punta de pan y agua).",
        "B) Este mes soy becado (por mis papás, a regañadientes).",
        "C) Día 45: Doña Evita aún no me encuentra para cobrarme.",
        "D) Pobreza extrema premium.",
      ],
    },

    {
      id: "q14",
      t: "14. ¿Qué habilidad 'prohibida' le enseñarías a tu ahijado?",
      opts: [
        "A) El arte de copiar sin que el docente pestañee.",
        "B) Cómo escaparte por el muro trasero sin romperte nada.",
        "C) Fingir demencia cuando te preguntan algo que no sabes.",
        "D) Dormir sentado con los ojos abiertos.",
      ],
    },
    {
      id: "q15",
      t: "15. ¿Cuál es tu promesa solemne como padrino?",
      opts: [
        "A) Te lo hago tus trabajos .",
        "B) Te defiendo si le quitas el novio/a a uno de quinto.",
        "C) Te invito un trago cada vez que repruebes para olvidar.",
        "D) Te presento a una/o de gastro para que no mueras de hambre.",
      ],
    },
    {
      id: "q16",
      t: "16. ¿Qué buscas en un ahijado/a ideal?",
      opts: [
        "A) Que vaya a cañar conmigo y no me deje solo.",
        "B) Que me preste dinero cuando mi cuenta llegue a cero.",
        "C) Que sea mi secretario personal para mis trabajos.",
        "D) Que me traiga comida de su casa los lunes.",
      ],
    },
    {
      id: "q17",
      t: "17. Si tu ahijado se emborracha, ¿qué haces con él?",
      opts: [
        "A) Lo cuido y lo llevo a su cama como un ángel.",
        "B) Me emborracho con él para que no se sienta mal.",
        "C) Le tomo fotos vergonzosas para chantaje futuro.",
        "D) Lo dejo en la plaza con un letrero que diga 'Soy Gay'.",
      ],
    },

    {
      id: "q18",
      t: "18. ¿A qué lugar del pueblo NO debería ir nunca tu ahijado/a?",
      opts: [
        "A) Al escondite ahi hacen cosas malas.",
        "B) A donde fían los de 5to (te van a cobrar a ti).",
        "C) A la casa de la docente más chismosa de la Normal.",
      ],
    },
    {
      id: "q19",
      t: "19. ¿A quién 'venderías' por un 51 de nota final?",
      opts: [
        "A) Al representante de curso (por el bien mayor).",
        "B) A mi mejor amigo (él entendería mi dolor).",
        "C) A todos: con tal de graduarme, vendo hasta el alma.",
      ],
    },
    {
      id: "q20",
      t: "20. ¿Cuál es tu nivel de 'Mala Fama' en la Normal?",
      opts: [
        "A) Soy un pan de Dios, hasta los perros me saludan.",
        "B) Solo los envidiosos hablan de mi historial.",
        "C) El Director tiene mi foto en su oficina como 'El mas buscado'.",
        "D) Soy el motivo por el cual hay nuevas reglas de disciplina en el reglamento.",
      ],
    },
  ];

  const qc = $("qContainer");
  const saved = state.profile.cuestionarioPadrino || {};
  let currentPhotoURL = state.profile.fotoURL || "";

  renderQuestions();

  // Foto: subir a Storage
  $("btnUploadPhoto").onclick = async () => {
    const msg = $("regMsg");
    msg.innerHTML = "";
    try {
      const file = $("photoFile").files?.[0];
      if (!file) {
        toastInline(msg, "Selecciona una imagen primero.", "danger");
        return;
      }
      $("photoStatus").textContent = "Subiendo…";
      const url = await uploadPadrinoPhoto({ uid: state.user.uid, file });
      currentPhotoURL = url;
      $("photoStatus").textContent = "✅ Foto subida correctamente.";
    } catch (e) {
      $("photoStatus").textContent = "Sin foto subida.";
      toastInline(
        $("regMsg"),
        e.message || "No se pudo subir la foto.",
        "danger",
      );
    }
  };

  // Single-select y desmarcar si escribe “Otro”
  qc.addEventListener("change", (ev) => {
    const el = ev.target;
    if (!(el instanceof HTMLInputElement)) return;

    // checkbox: solo 1
    if (el.type === "checkbox") {
      const qid = el.dataset.q;
      if (!qid) return;
      if (el.checked) {
        qc.querySelectorAll(`input[type="checkbox"][data-q="${qid}"]`).forEach(
          (cb) => {
            if (cb !== el) cb.checked = false;
          },
        );
        // si marca checkbox, vaciar "otro"
        const other = $(`other_${qid}`);
        if (other) other.value = "";
      }
    }
  });

  qc.addEventListener("input", (ev) => {
    const el = ev.target;
    if (!(el instanceof HTMLInputElement)) return;

    // si escribe en "otro", desmarca checkboxes de esa pregunta
    if (el.id.startsWith("other_")) {
      const qid = el.id.replace("other_", "");
      if (el.value.trim().length > 0) {
        qc.querySelectorAll(`input[type="checkbox"][data-q="${qid}"]`).forEach(
          (cb) => (cb.checked = false),
        );
      }
    }
  });

  $("btnSaveReg").setAttribute("type", "button"); // evita submits raros
  // Guardar
  $("btnSaveReg").onclick = async () => {
    console.log("✅ Guardar!");
    alert("CLICK Guardar"); // temporal

    const pass = $("regPass").value.trim();
    console.log("pass escrito:", pass);

    const serverPass = await fetchPassRegistro();
    console.log("serverPass:", serverPass);

    if (!serverPass || pass !== serverPass) {
      alert("PASS incorrecta o no encontrada");
      return;
    }

    const msg = $("regMsg");
    msg.innerHTML = "";

    try {
      const pass = $("regPass").value.trim();
      const serverPass = await fetchPassRegistro();
      if (!serverPass || pass !== serverPass) {
        toastInline(msg, "Contraseña global incorrecta.", "danger");
        return;
      }

      const miPass = $("miPass").value.trim();
      if (miPass.length < 4) {
        toastInline(
          msg,
          "Define contraseña de Mi Perfil (mín. 4 caracteres).",
          "danger",
        );
        return;
      }

      // Construir cuestionario
      const cuestionarioPadrino = {};
      for (const q of Q) {
        if (q.type === "text") {
          const v = $(`txt_${q.id}`).value.trim();
          cuestionarioPadrino[q.id] = { text: v };
          continue;
        }
        const checked = qc.querySelector(
          `input[type="checkbox"][data-q="${q.id}"]:checked`,
        );
        const option = checked ? checked.dataset.opt : "";
        const otherText = $(`other_${q.id}`).value.trim();
        cuestionarioPadrino[q.id] = { option, otherText };
      }

      // ✅ Calcular aspectos 1..100 según respuestas
      const aspectos = computeAspectos(cuestionarioPadrino);

      const updates = {
        // foto por Storage url
        fotoURL: currentPhotoURL || "",

        // apodo y nombre real se guardan desde preguntas (si quieres también duplicar a campos raíz)
        apodo: (cuestionarioPadrino.q2?.text || "").trim(),

        // perfil pass
        miPerfilPass: miPass,

        // cuestionario
        cuestionarioPadrino,

        // aspectos calculados
        aspectos,
      };

      await savePadrinoProfile({ uid: state.user.uid, updates });

      const updated = await getMyProfile(state.user.uid);
      setProfile(updated.data);
      refreshHeader();

      await openModal({
        title: "Guardado",
        bodyHTML: `<div class="notice">✅ Perfil guardado. Aspectos calculados (1–100%). Te quedan <b>${Math.max(0, 3 - Number(updated.data.editsUsed || 0))}</b> ediciones.</div>`,
        okText: "Continuar",
      });

      nav("/buscador");
    } catch (e) {
      toastInline(msg, e.message || "No se pudo guardar.", "danger");
    }
  };

  function renderQuestions() {
    qc.innerHTML = Q.map((q) => {
      const prev = saved[q.id] || {};

      if (q.type === "text") {
        return `
          <div class="qblock" id="block_${q.id}">
            <div class="qtitle">${escapeHtml(q.t)}</div>
            <div class="otherRow">
              <input type="text" id="txt_${q.id}" placeholder="Escribe aquí…" value="${escapeHtmlAttr(prev.text || "")}">
            </div>
          </div>
        `;
      }

      const prevOpt = prev.option ?? "";
      const prevOther = prev.otherText ?? "";

      const optsHtml = q.opts
        .map((opt) => {
          const checked = prevOpt === opt ? "checked" : "";
          return `
          <label class="choice">
            <input type="checkbox" data-q="${q.id}" data-opt="${escapeHtmlAttr(opt)}" ${checked}>
            <div class="choice__text">${escapeHtml(opt)}</div>
          </label>
        `;
        })
        .join("");

      return `
        <div class="qblock" id="block_${q.id}">
          <div class="qtitle">${escapeHtml(q.t)}</div>
          <div class="choices">${optsHtml}</div>
          <div class="otherRow">
            <label>Otro (texto libre)</label>
            <input type="text" id="other_${q.id}" placeholder="Escribe tu respuesta…" value="${escapeHtmlAttr(prevOther)}">
          </div>
        </div>
      `;
    }).join("");
  }

  // ---------------------------
  // ✅ Aspectos (1..100)
  // ---------------------------
  function computeAspectos(ans) {
    // helpers
    const pick = (id) => (ans[id]?.option || "").trim();
    const clamp = (x) => Math.max(1, Math.min(100, Math.round(x)));

    // Alcoholico: q9,q10,q11 + un poco q6
    const a9 = mapChoice(pick("q9"), { A: 15, B: 45, C: 90, D: 75 }, 35);
    const a10 = mapChoice(pick("q10"), { A: 10, B: 45, C: 95, D: 70 }, 30);
    const a11 = mapChoice(pick("q11"), { A: 5, B: 55, C: 90, D: 100 }, 25);
    const a6 = mapChoice(pick("q6"), { A: 85, B: 20, C: 35, D: 60 }, 30);
    const alcoholico = clamp(a9 * 0.34 + a10 * 0.28 + a11 * 0.28 + a6 * 0.1);

    // Estudioso: q12 principalmente (y un toque de q15 “cuadernos/exámenes”)
    const e12 = mapChoice(pick("q12"), { A: 95, B: 55, C: 45, D: 20 }, 40);
    const e15 = mapChoice(pick("q15"), { A: 70, B: 55, C: 25, D: 65 }, 45);
    const estudioso = clamp(e12 * 0.8 + e15 * 0.2);

    // Fiestero: alcohol + q8 + q9
    const f8 = mapChoice(pick("q8"), { A: 30, B: 35, C: 40, D: 65 }, 35);
    const f9 = mapChoice(pick("q9"), { A: 20, B: 55, C: 90, D: 75 }, 40);
    const fiestero = clamp(alcoholico * 0.55 + f8 * 0.15 + f9 * 0.3);

    // Chismoso: q18 (docente chismosa), q20 (mala fama), q17 (fotos)
    const c18 = mapChoice(pick("q18"), { A: 40, B: 55, C: 85 }, 45);
    const c20 = mapChoice(pick("q20"), { A: 20, B: 55, C: 85, D: 95 }, 45);
    const c17 = mapChoice(pick("q17"), { A: 20, B: 45, C: 95, D: 70 }, 40);
    const chismoso = clamp(c18 * 0.25 + c20 * 0.35 + c17 * 0.4);

    // Cariñoso: q17 cuidado, q15 defensa/ayuda, q16 (ideal)
    const k17 = mapChoice(pick("q17"), { A: 95, B: 55, C: 20, D: 10 }, 50);
    const k15 = mapChoice(pick("q15"), { A: 65, B: 90, C: 40, D: 60 }, 55);
    const k16 = mapChoice(pick("q16"), { A: 60, B: 20, C: 35, D: 30 }, 35);
    const carinoso = clamp(k17 * 0.45 + k15 * 0.4 + k16 * 0.15);

    return { alcoholico, carinoso, chismoso, estudioso, fiestero };

    function mapChoice(full, table, fallback) {
      // detecta letra inicial "A)" "B)" "C)" "D)"
      const m = full.match(/^([A-D])\)/);
      const key = m ? m[1] : null;
      if (key && key in table) return table[key];
      // para items sin letra, intenta por primeras letras
      if (!key) {
        // si table usa A/B/C/D, no hay match -> fallback
        return fallback;
      }
      return fallback;
    }
  }

  function escapeHtml(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
  function escapeHtmlAttr(str) {
    return escapeHtml(str).replaceAll("\n", " ").replaceAll("\r", " ");
  }
}

function renderMiPerfil() {
  if (!roleIsPadrino()) {
    setView(`<div class="notice">Solo padrinos pueden ver “Mi Perfil”.</div>`);
    return;
  }
  setView(`
    <div>
      <div class="kicker">Mi Perfil</div>
      <div class="headline">Acceso protegido</div>
      <div class="subtle">Ingresa tu contraseña de Mi Perfil.</div>

      <div class="hr"></div>

      <div class="field">
        <label>Contraseña</label>
        <input id="mpPass" type="password" placeholder="Tu contraseña…">
      </div>

      <div class="hr"></div>

      <button id="btnMp" class="btn btn--primary">Entrar</button>
      <button id="btnBackMp" class="btn btn--ghost">Volver</button>
      <div id="mpMsg" style="margin-top:12px;"></div>
    </div>
  `);

  $("btnBackMp").onclick = () => nav("/buscador");

  $("btnMp").onclick = async () => {
    const msg = $("mpMsg");
    msg.innerHTML = "";
    const pass = $("mpPass").value.trim();

    if (!state.profile.miPerfilPass) {
      toastInline(msg, "Aún no definiste contraseña. Ve a Registro.", "danger");
      return;
    }
    if (pass !== state.profile.miPerfilPass) {
      toastInline(msg, "Contraseña incorrecta.", "danger");
      return;
    }

    // Mostrar vista interna
    const p = state.profile;
    const full = `${p.nombre} ${p.apellidoP} ${p.apellidoM}`.trim();
    const estado = p.estadoPadrino || "—";
    const chosen = p.reservaActiva?.ahijadoNombreCompleto || "—";
    const img =
      p.fotoURL && p.fotoURL.startsWith("http")
        ? p.fotoURL
        : "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='800'%3E%3Crect width='800' height='800' rx='120' fill='rgba(255,255,255,0.10)'/%3E%3C/svg%3E";

    setView(`
      <div>
        <button class="btn btn--ghost" id="btnBack2">← Volver</button>
        <div class="hr"></div>

        <div class="profile">
          <div>
            <img class="avatar" src="${img}" alt="">
            <div class="hr"></div>
            <div class="badge">Estado: ${estado}</div>
            ${estado !== "disponible" ? `<div class="pill pill--danger" style="margin-top:10px;">Ahijado: ${escapeHtml(chosen)}</div>` : ``}
          </div>

          <div>
            <h1 class="profile__title">${escapeHtml(full)}</h1>
            <div class="profile__sub">${p.apodo ? `@${escapeHtml(p.apodo)}` : "Sin apodo"}</div>

            <div class="profile__sub">
  🍻 ${num((p.aspectos || {}).alcoholico)}% ·
  ❤️ ${num((p.aspectos || {}).carinoso)}% ·
  🗣️ ${num((p.aspectos || {}).chismoso)}% ·
  📚 ${num((p.aspectos || {}).estudioso)}% ·
  🎉 ${num((p.aspectos || {}).fiestero)}%
</div>

<div class="hr"></div>
<div class="kicker">Aspectos</div>
<div class="tagrow">
  <span class="tag">🍻 ${num((p.aspectos || {}).alcoholico)}%</span>
  <span class="tag">❤️ ${num((p.aspectos || {}).carinoso)}%</span>
  <span class="tag">🗣️ ${num((p.aspectos || {}).chismoso)}%</span>
  <span class="tag">📚 ${num((p.aspectos || {}).estudioso)}%</span>
  <span class="tag">🎉 ${num((p.aspectos || {}).fiestero)}%</span>
</div>

<div class="hr"></div>
<div class="kicker">Cuestionario</div>
${renderCuestionario(p)}

          </div>
        </div>
      </div>
    `);

    $("btnBack2").onclick = () => nav("/buscador");
  };

  function escapeHtml(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
  function num(x) {
    const n = Number(x ?? 0);
    return Number.isFinite(n) ? n : 0;
  }
}

function renderAdmin() {
  if (!state.profile?.admin) {
    setView(`<div class="notice">Acceso restringido. No eres admin.</div>`);
    return;
  }

  setView(`
    <div>
      <div class="kicker">Admin</div>
      <div class="headline">Control de usuarios</div>
      <div class="subtle">Filtra padrinos/ahijados. Bloquear cancela reservas automáticamente.</div>

      <div class="hr"></div>

      <div class="fieldrow">
        <div class="field">
          <label>Ver</label>
          <select id="admRole">
            <option value="padrino">Padrinos</option>
            <option value="ahijado">Ahijados</option>
          </select>
        </div>
        <div class="field">
          <label>Buscar</label>
          <input id="admQ" placeholder="Nombre…">
        </div>
      </div>

      <div class="hr"></div>

      <div id="admList" class="grid"></div>
      <div id="admMsg" style="margin-top:12px;"></div>

      <div class="hr"></div>
      <button class="btn btn--ghost" id="admBack">Volver</button>
    </div>
  `);

  $("admBack").onclick = () => nav("/buscador");
  $("admRole").addEventListener("change", load);
  $("admQ").addEventListener("input", render);

  let data = [];

  load();

  async function load() {
    const role = $("admRole").value;
    $("admMsg").innerHTML = "";
    $("admList").innerHTML =
      `<div class="notice" style="grid-column: span 12;">Cargando…</div>`;
    try {
      data = await adminListUsersByRole(role);
      render();
    } catch (e) {
  console.error("ADMIN LOAD ERROR:", e);
  $("admList").innerHTML = "";
  toastInline($("admMsg"), "No se pudo cargar admin: " + (e?.message || e), "danger");
}

  }

  function render() {
    const role = $("admRole").value;
    const q = $("admQ").value.trim().toLowerCase();
    const list = $("admList");
    list.innerHTML = "";

    let arr = [...data];

    if (q) {
      arr = arr.filter((u) =>
        (u.nombreCompleto || "").toLowerCase().includes(q),
      );
    }
    if (!arr.length) {
      list.innerHTML = `<div class="notice" style="grid-column: span 12;">Sin resultados.</div>`;
      return;
    }

    for (const u of arr) {
      const full =
        u.nombreCompleto ||
        `${u.nombre || ""} ${u.apellidoP || ""} ${u.apellidoM || ""}`.trim();
      const img =
        u.fotoURL && u.fotoURL.startsWith("http")
          ? u.fotoURL
          : "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Crect width='120' height='120' rx='24' fill='rgba(255,255,255,0.12)'/%3E%3C/svg%3E";

      const card = document.createElement("div");
      card.className = "card";

      if (role === "padrino") {
        const st = u.estadoPadrino || "disponible";
        const chosen = u.reservaActiva?.ahijadoNombreCompleto || "—";
        card.innerHTML = `
          <img class="card__img" src="${img}" alt="">
          <div class="card__meta">
            <div class="card__title">${escapeHtml(full)}</div>
            <div class="card__sub">Estado: <b>${st}</b> · Padrino de: ${escapeHtml(chosen)}</div>
            <div class="tagrow">
              <button class="btn btn--ghost" data-act="disp">Disponible</button>
              <button class="btn btn--danger" data-act="block">No disponible</button>
            </div>
          </div>
        `;

        card.querySelector('[data-act="disp"]').onclick = async (ev) => {
          ev.stopPropagation();
          try {
            await adminSetPadrinoDisponible({ padrinoId: u.id });
            await load();
          } catch (e) {
            toastInline($("admMsg"), e.message || "Error.", "danger");
          }
        };
        card.querySelector('[data-act="block"]').onclick = async (ev) => {
          ev.stopPropagation();
          const ok = await openModal({
            title: "Bloquear padrino",
            bodyHTML: `<div class="notice">Esto lo pondrá en <b>no_disponible</b> y cancelará su reserva si estaba reservado.</div>`,
            okText: "Bloquear",
            cancelText: "Cancelar",
          });
          if (!ok) return;
          try {
            await adminSetPadrinoNoDisponible({ padrinoId: u.id });
            await load();
          } catch (e) {
            toastInline($("admMsg"), e.message || "Error.", "danger");
          }
        };
      } else {
        // ahijado
        const st = u.estadoApadrinado || "disponible";
        const count = Array.isArray(u.reservasActivas)
          ? u.reservasActivas.length
          : 0;

        card.innerHTML = `
          <img class="card__img" src="${img}" alt="">
          <div class="card__meta">
            <div class="card__title">${escapeHtml(full)}</div>
            <div class="card__sub">estadoApadrinado: <b>${st}</b> · reservas: ${count}</div>
            <div class="tagrow">
              <button class="btn btn--ghost" data-act="disp">Disponible</button>
              <button class="btn btn--danger" data-act="block">No disponible</button>
            </div>
          </div>
        `;

        card.querySelector('[data-act="disp"]').onclick = async (ev) => {
          ev.stopPropagation();
          try {
            await adminSetAhijadoDisponible({ ahijadoId: u.id });
            await load();
          } catch (e) {
            toastInline($("admMsg"), e.message || "Error.", "danger");
          }
        };
        card.querySelector('[data-act="block"]').onclick = async (ev) => {
          ev.stopPropagation();
          const ok = await openModal({
            title: "Bloquear ahijado",
            bodyHTML: `<div class="notice">Esto pondrá al ahijado en <b>no_disponible</b> y borrará sus reservas activas liberando padrinos.</div>`,
            okText: "Bloquear",
            cancelText: "Cancelar",
          });
          if (!ok) return;
          try {
            await adminSetAhijadoNoDisponible({ ahijadoId: u.id });
            await load();
          } catch (e) {
            toastInline($("admMsg"), e.message || "Error.", "danger");
          }
        };
      }

      list.appendChild(card);
    }
  }

  function escapeHtml(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ---------- START ---------- */
route();
function renderCuestionario(p) {
  const q = p?.cuestionarioPadrino || {};
  const has = Object.keys(q).length > 0;
  if (!has)
    return `<div class="subtle">Este padrino aún no completó su registro.</div>`;

  const titles = {
    q1: "1. Nombre Completo",
    q2: "2. Apodo",
    q3: "3. Especialidad",
    q4: "4. Situación sentimental",
    q5: "5. Casi algos en la ESFM",
    q6: "6. Fobias",
    q7: "7. Mi Moda",
    q8: "8. Comida que me hace feliz",
    q9: "9. Resistencia alcohol",
    q10: "10. Ir a clase con poderes (Ebrio)",
    q11: "11. Alcohol en la sangre",
    q12: "12. Materias",
    q13: "13. Economía",
    q14: "14. Habilidad prohibida",
    q15: "15. Promesa padrino",
    q16: "16. Ahijado ideal para mi",
    q17: "17. Si mi ahijado se emborracha",
    q18: "18. Lugar prohibido",
    q19: "19. ¿A quién venderías?",
    q20: "20. Mala fama",
  };

  const fmt = (val) => {
    if (!val) return "—";
    if (val.text) return val.text;
    const parts = [];
    if (val.option) parts.push(val.option);
    if (val.otherText) parts.push(`Otro: ${val.otherText}`);
    return parts.length ? parts.join(" · ") : "—";
  };

  let html = `<div class="headerlist" style="flex-direction:column; gap:10px;">`;
  for (let i = 1; i <= 20; i++) {
    const id = `q${i}`;
    if (!(id in q)) continue;
    html += `
      <div class="pill" style="width:100%; border-radius:16px;">
        <b>${titles[id] || id}</b><br>
        <span style="color:var(--muted)">${escapeHtml(fmt(q[id]))}</span>
      </div>
    `;
  }
  html += `</div>`;
  return html;
}
