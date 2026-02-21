import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ✅ Storage
import {
  getStorage,
  ref as sRef,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyA2xTzOJ_fvAIMEjBBWQSxDIZIw8Inp-ww",
  authDomain: "simulacroesfms2026.firebaseapp.com",
  projectId: "simulacroesfms2026",
  storageBucket: "simulacroesfms2026.firebasestorage.app",
  messagingSenderId: "1076674602133",
  appId: "1:1076674602133:web:d0b010c9dfbee969d7e79c",
  measurementId: "G-N1FYQ17Z90"
};





export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

export const googleProvider = new GoogleAuthProvider();


/**
 * ✅ Login robusto:
 * - Intenta popup
 * - Si Chrome/COOP lo rompe, hace fallback a redirect (lo más estable)
 */
export async function loginGoogle() {
  try {
    const res = await signInWithPopup(auth, googleProvider);
    return res.user;
  } catch (e) {
    console.warn("Popup login falló, usando redirect:", e?.code || e);

    // Fallback a redirect en casos típicos:
    // auth/popup-blocked, auth/popup-closed-by-user,
    // auth/operation-not-supported-in-this-environment, etc.
    await signInWithRedirect(auth, googleProvider);

    // Con redirect, aquí no retorna porque la página recarga.
    return null;
  }
}

/**
 * ✅ Consumir resultado del redirect al cargar la app
 * (no pasa nada si no vienes de redirect)
 */
export async function consumeRedirectResult() {
  try {
    await getRedirectResult(auth);
  } catch (e) {
    console.warn("Redirect result error:", e?.code || e);
  }
}

export async function logout() {
  await signOut(auth);
}

export function onAuth(cb) {
  return onAuthStateChanged(auth, cb);
}

// ✅ Subida de foto a Firebase Storage (ruta única por uid + timestamp)
export async function uploadPadrinoPhoto({ uid, file }) {
  if (!file) throw new Error("No se seleccionó archivo.");
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `bautizo_padrinos/${uid}/perfil_${Date.now()}_${safeName}`;
  const r = sRef(storage, path);
  await uploadBytes(r, file, { contentType: file.type || "image/jpeg" });
  const url = await getDownloadURL(r);
  return url;
}