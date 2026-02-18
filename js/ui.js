import { state } from "./state.js";

const $ = (id) => document.getElementById(id);

export function setTopAuthUI(isAuthed){
  $("btnLogin").classList.toggle("hidden", isAuthed);
  $("btnLogout").classList.toggle("hidden", !isAuthed);
  $("userBadge").textContent = isAuthed ? "Conectado" : "No conectado";
}

export function setHeaderUser(profile){
  const name = profile ? `${profile.nombre || ""} ${profile.apellidoP || ""} ${profile.apellidoM || ""}`.trim() : "—";
  $("userName").textContent = name || "—";
  $("userRole").textContent = profile ? `Rol: ${profile.rol || "—"}` : "—";
}

export function setHeaderList(items, title){
  $("listTitle").textContent = title || "Reservas";
  const root = $("headerList");
  root.innerHTML = "";
  if (!items || items.length === 0){
    const empty = document.createElement("div");
    empty.className = "headerlist__empty subtle";
    empty.textContent = "—";
    root.appendChild(empty);
    return;
  }
  for (const it of items){
    const pill = document.createElement("div");
    pill.className = "pill";
    pill.textContent = it;
    root.appendChild(pill);
  }
}

export function setFabVisibility({showDock, showAdmin, showRegister, showMe}){
  $("fabDock").classList.toggle("hidden", !showDock);
  $("fabAdmin").classList.toggle("hidden", !showAdmin);
  $("fabRegister").classList.toggle("hidden", !showRegister);
  $("fabMe").classList.toggle("hidden", !showMe);
}

export function setView(html){
  $("view").innerHTML = html;
}

let modalResolve = null;
let modalReject = null;

export function openModal({title, bodyHTML, okText="Aceptar", cancelText=null}){
  $("modalTitle").textContent = title || "Aviso";
  $("modalBody").innerHTML = bodyHTML || "";
  $("modalOk").textContent = okText;

  const showCancel = !!cancelText;
  $("modalCancel").classList.toggle("hidden", !showCancel);
  if (showCancel) $("modalCancel").textContent = cancelText;

  $("modalOverlay").classList.remove("hidden");
  $("modalOverlay").setAttribute("aria-hidden", "false");

  return new Promise((resolve, reject) => {
    modalResolve = resolve;
    modalReject = reject;
  });
}

export function closeModal(){
  $("modalOverlay").classList.add("hidden");
  $("modalOverlay").setAttribute("aria-hidden", "true");
  modalResolve = null;
  modalReject = null;
}

export function bindModalEvents(){
  $("modalClose").addEventListener("click", () => {
    if (modalReject) modalReject(new Error("closed"));
    closeModal();
  });
  $("modalOk").addEventListener("click", () => {
    if (modalResolve) modalResolve(true);
    closeModal();
  });
  $("modalCancel").addEventListener("click", () => {
    if (modalResolve) modalResolve(false);
    closeModal();
  });
}

export function toastInline(targetEl, text, kind="info"){
  const el = document.createElement("div");
  el.className = "notice";
  if (kind === "danger"){
    el.style.borderColor = "rgba(255,77,109,.28)";
    el.style.background = "rgba(255,77,109,.10)";
  }
  el.textContent = text;
  targetEl.prepend(el);
  setTimeout(()=> el.remove(), 3800);
}

export function fmtRemaining(ms){
  if (ms <= 0) return "0m";
  const min = Math.ceil(ms / 60000);
  return `${min}m`;
}

export function roleIsAhijado(){
  return state.profile?.rol === "ahijado";
}
export function roleIsPadrino(){
  return state.profile?.rol === "padrino";
}
