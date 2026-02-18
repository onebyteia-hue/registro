import {
  doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs,
  serverTimestamp, orderBy, limit,
  runTransaction, writeBatch, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { db } from "./firebase.js";
import { state } from "./state.js";

const USERS = "user_bautizo";
const PASS = "pass_cursos";

export function userDocRef(uid){
  return doc(db, USERS, uid);
}

export async function getMyProfile(uid){
  const ref = userDocRef(uid);
  const snap = await getDoc(ref);
  return { ref, snap, data: snap.exists() ? snap.data() : null };
}

export async function ensureProfile(uid, defaults){
  const ref = userDocRef(uid);
  const snap = await getDoc(ref);
  if (!snap.exists()){
    await setDoc(ref, {
      ...defaults,
      admin: false,
      reglasAceptadas: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    const snap2 = await getDoc(ref);
    return snap2.data();
  }
  return snap.data();
}

export async function saveOnboarding(uid, payload){
  const ref = userDocRef(uid);
  await setDoc(ref, {
    ...payload,
    nombreCompleto: `${payload.nombre} ${payload.apellidoP} ${payload.apellidoM}`.trim(),
    updatedAt: serverTimestamp(),
  }, { merge:true });
}

export async function acceptRules(uid){
  await updateDoc(userDocRef(uid), { reglasAceptadas:true, updatedAt: serverTimestamp() });
}

export async function fetchPassRegistro(){
  // Documento fijo. Crea: pass_cursos/registro  { passRegistroPadrino: "TU_PASS" }
  const ref = doc(db, PASS, "registro");
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data()?.pass || null;

}

export async function queryPadrinos(){
  const q = query(
    collection(db, USERS),
    where("rol", "==", "padrino")
  );

  const snap = await getDocs(q);

  return snap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));
}


export function nowTs(){
  return Timestamp.now();
}

export async function cleanupExpiredForUser(uid){
  // Limpia reservas expiradas del usuario (ahijado) y/o del padrino si aplica
  const my = await getDoc(userDocRef(uid));
  if (!my.exists()) return;

  const data = my.data();
  const now = nowTs();

  // Si soy ahijado: limpiar reservasActivas expiradas
  if (data.rol === "ahijado" && Array.isArray(data.reservasActivas) && data.reservasActivas.length){
    const still = [];
    const expired = [];
    for (const r of data.reservasActivas){
      if (!r?.expiresAt) { continue; }
      const exp = r.expiresAt;
      if (exp.toMillis() <= now.toMillis()) expired.push(r);
      else still.push(r);
    }
    if (expired.length){
      const batch = writeBatch(db);
      batch.update(userDocRef(uid), { reservasActivas: still, updatedAt: serverTimestamp() });

      // liberar padrinos expirados si aún apuntan a este ahijado
      for (const r of expired){
        if (!r?.padrinoId) continue;
        const pRef = userDocRef(r.padrinoId);
        const pSnap = await getDoc(pRef);
        if (!pSnap.exists()) continue;
        const p = pSnap.data();
        if (p?.estadoPadrino === "reservado" && p?.reservaActiva?.ahijadoId === uid){
          batch.update(pRef, { estadoPadrino: "disponible", reservaActiva: null, updatedAt: serverTimestamp() });
        }
      }

      await batch.commit();
    }
  }

  // Si soy padrino: limpiar reservaActiva expirada
  if (data.rol === "padrino" && data.estadoPadrino === "reservado" && data.reservaActiva?.expiresAt){
    if (data.reservaActiva.expiresAt.toMillis() <= now.toMillis()){
      const batch = writeBatch(db);
      batch.update(userDocRef(uid), { estadoPadrino:"disponible", reservaActiva:null, updatedAt: serverTimestamp() });

      // también limpiar del ahijado
      const ahId = data.reservaActiva.ahijadoId;
      if (ahId){
        const aRef = userDocRef(ahId);
        const aSnap = await getDoc(aRef);
        if (aSnap.exists()){
          const a = aSnap.data();
          const next = (a.reservasActivas || []).filter(x => x?.padrinoId !== uid);
          batch.update(aRef, { reservasActivas: next, updatedAt: serverTimestamp() });
        }
      }

      await batch.commit();
    }
  }
}

export async function reservePadrino({ ahijadoId, padrinoId }){
  // Transaction para consistencia sin Cloud Functions
  return runTransaction(db, async (tx) => {
    const aRef = userDocRef(ahijadoId);
    const pRef = userDocRef(padrinoId);

    const aSnap = await tx.get(aRef);
    const pSnap = await tx.get(pRef);

    if (!aSnap.exists()) throw new Error("Ahijado no existe.");
    if (!pSnap.exists()) throw new Error("Padrino no existe.");

    const a = aSnap.data();
    const p = pSnap.data();

    if (a.rol !== "ahijado") throw new Error("Solo un ahijado puede reservar.");
    if (a.estadoApadrinado === "no_disponible") throw new Error("Tu cuenta está en modo solo ver.");
    const reservas = Array.isArray(a.reservasActivas) ? a.reservasActivas : [];
    if (reservas.length >= 2) throw new Error("Solo puedes reservar 2 padrinos.");

    if (p.rol !== "padrino" || p.padrino !== true) throw new Error("Ese usuario no es padrino.");
    if (p.estadoPadrino === "no_disponible") throw new Error("No disponible (bloqueado).");
    if (p.estadoPadrino === "reservado") throw new Error("Actualmente reservado. Espera a que se libere.");

    // 30 minutos
    const expiresAt = Timestamp.fromMillis(Date.now() + 30 * 60 * 1000);

    const ahName = `${a.nombre} ${a.apellidoP} ${a.apellidoM}`.trim();
    const paName = `${p.nombre} ${p.apellidoP} ${p.apellidoM}`.trim();

    tx.update(pRef, {
      estadoPadrino: "reservado",
      reservaActiva: {
        ahijadoId,
        ahijadoNombreCompleto: ahName,
        expiresAt
      },
      updatedAt: serverTimestamp()
    });

    tx.update(aRef, {
      reservasActivas: [
        ...reservas,
        { padrinoId, padrinoNombreCompleto: paName, expiresAt }
      ],
      updatedAt: serverTimestamp()
    });

    return true;
  });
}

export async function savePadrinoProfile({ uid, updates }){
  // updates incluye: apodo, fotoURL, descripcion, aspectos, miPerfilPass, etc.
  await runTransaction(db, async (tx) => {
    const ref = userDocRef(uid);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("No existe tu documento.");
    const d = snap.data();
    if (d.rol !== "padrino") throw new Error("Solo padrino puede registrar perfil.");

    const used = Number(d.editsUsed || 0);
    if (used >= 3) throw new Error("Ya agotaste tus 3 ediciones.");

    tx.update(ref, {
      ...updates,
      padrino: true,
      estadoPadrino: d.estadoPadrino || "disponible",
      editsUsed: used + 1,
      updatedAt: serverTimestamp()
    });
  });
}


// ✅ Admin: listar usuarios por rol (sin índices raros)
export async function adminListUsersByRole(role){
  const r = (role || "").toLowerCase().includes("padr") ? "padrino" : "ahijado";
  const qy = query(collection(db, USERS), where("rol", "==", r));
  const snap = await getDocs(qy);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ✅ Admin: PADRINO → no_disponible (cancela reserva si existía)
export async function adminSetPadrinoNoDisponible({ padrinoId }){
  const padrRef = userDocRef(padrinoId);

  await runTransaction(db, async (tx) => {
    const padrSnap = await tx.get(padrRef);
    if (!padrSnap.exists()) throw new Error("Padrino no existe");

    const padr = padrSnap.data();
    const reserva = padr.reservaActiva || null;

    tx.update(padrRef, {
      estadoPadrino: "no_disponible",
      reservaActiva: null,
      updatedAt: serverTimestamp()
    });

    if (reserva?.ahijadoId) {
      const ahijRef = userDocRef(reserva.ahijadoId);
      const ahijSnap = await tx.get(ahijRef);

      if (ahijSnap.exists()) {
        const ah = ahijSnap.data();
        const arr = Array.isArray(ah.reservasActivas) ? ah.reservasActivas : [];
        const filtered = arr.filter(r => r?.padrinoId !== padrinoId);

        tx.update(ahijRef, {
          reservasActivas: filtered,
          updatedAt: serverTimestamp()
        });
      }
    }
  });
}

// ✅ Admin: PADRINO → disponible
export async function adminSetPadrinoDisponible({ padrinoId }){
  const ref = userDocRef(padrinoId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Padrino no existe");

    const p = snap.data();
    if (p.estadoPadrino === "reservado") {
      throw new Error("Primero cancela la reserva.");
    }

    tx.update(ref, {
      estadoPadrino: "disponible",
      updatedAt: serverTimestamp()
    });
  });
}

// ✅ Admin: AHIJADO → no_disponible
export async function adminSetAhijadoNoDisponible({ ahijadoId }){
  const ahijRef = userDocRef(ahijadoId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ahijRef);
    if (!snap.exists()) throw new Error("Ahijado no existe");

    const ah = snap.data();
    const reservas = Array.isArray(ah.reservasActivas) ? ah.reservasActivas : [];

    tx.update(ahijRef, {
      estadoApadrinado: "no_disponible",
      reservasActivas: [],
      updatedAt: serverTimestamp()
    });

    for (const r of reservas){
      const pRef = userDocRef(r?.padrinoId);
      if (!pRef) continue;

      const pSnap = await tx.get(pRef);
      if (!pSnap.exists()) continue;

      const p = pSnap.data();
      if (p?.reservaActiva?.ahijadoId === ahijadoId){
        tx.update(pRef, {
          estadoPadrino: "disponible",
          reservaActiva: null,
          updatedAt: serverTimestamp()
        });
      }
    }
  });
}

// ✅ Admin: AHIJADO → disponible
export async function adminSetAhijadoDisponible({ ahijadoId }){
  const ref = userDocRef(ahijadoId);

  await updateDoc(ref, {
    estadoApadrinado: "disponible",
    updatedAt: serverTimestamp()
  });
}



// export async function adminSetPadrinoNoDisponible({ padrinoId }){
//   // Si estaba reservado => cancelar y limpiar del ahijado
//   const pRef = userDocRef(padrinoId);
//   const pSnap = await getDoc(pRef);
//   if (!pSnap.exists()) throw new Error("Padrino no existe.");

//   const p = pSnap.data();
//   const batch = writeBatch(db);

//   // siempre bloquear
//   batch.update(pRef, { estadoPadrino:"no_disponible", updatedAt: serverTimestamp() });

//   // cancelar reserva activa si existe
//   if (p.estadoPadrino === "reservado" && p.reservaActiva?.ahijadoId){
//     const aId = p.reservaActiva.ahijadoId;
//     const aRef = userDocRef(aId);
//     const aSnap = await getDoc(aRef);
//     if (aSnap.exists()){
//       const a = aSnap.data();
//       const next = (a.reservasActivas || []).filter(x => x?.padrinoId !== padrinoId);
//       batch.update(aRef, { reservasActivas: next, updatedAt: serverTimestamp() });
//     }
//     batch.update(pRef, { reservaActiva: null }); // limpia
//   }

//   await batch.commit();
// }

// export async function adminSetPadrinoDisponible({ padrinoId }){
//   // solo si no está reservado; si está reservado, el admin debería bloquear/limpiar primero
//   await updateDoc(userDocRef(padrinoId), { estadoPadrino:"disponible", updatedAt: serverTimestamp() });
// }

// export async function adminSetAhijadoNoDisponible({ ahijadoId }){
//   // borrar reservas del ahijado y liberar padrinos
//   const aRef = userDocRef(ahijadoId);
//   const aSnap = await getDoc(aRef);
//   if (!aSnap.exists()) throw new Error("Ahijado no existe.");
//   const a = aSnap.data();

//   const batch = writeBatch(db);
//   batch.update(aRef, { estadoApadrinado:"no_disponible", reservasActivas: [], updatedAt: serverTimestamp() });

//   const reservas = Array.isArray(a.reservasActivas) ? a.reservasActivas : [];
//   for (const r of reservas){
//     if (!r?.padrinoId) continue;
//     const pRef = userDocRef(r.padrinoId);
//     const pSnap = await getDoc(pRef);
//     if (!pSnap.exists()) continue;
//     const p = pSnap.data();
//     // liberar solo si estaba reservado por ese ahijado y no está admin-bloqueado
//     if (p.estadoPadrino === "reservado" && p.reservaActiva?.ahijadoId === ahijadoId){
//       batch.update(pRef, { estadoPadrino:"disponible", reservaActiva:null, updatedAt: serverTimestamp() });
//     }
//   }

//   await batch.commit();
// }

// export async function adminSetAhijadoDisponible({ ahijadoId }){
//   await updateDoc(userDocRef(ahijadoId), { estadoApadrinado:"disponible", updatedAt: serverTimestamp() });
// }

// export async function adminListUsersByRole(role){
//   const q = query(collection(db, USERS), where("rol","==", role), orderBy("nombreCompleto"), limit(200));
//   const snap = await getDocs(q);
//   const out = [];
//   snap.forEach(d => out.push({ id:d.id, ...d.data() }));
//   return out;
// }

