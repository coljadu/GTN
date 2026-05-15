import { initializeApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  type User,
} from "firebase/auth";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBOkar0Zx4UYZOg2j4i4TylibbMoGv1gTA",
  authDomain: "numer-duel.firebaseapp.com",
  projectId: "numer-duel",
  storageBucket: "numer-duel.firebasestorage.app",
  messagingSenderId: "1070469159294",
  appId: "1:1070469159294:web:d024736d984dda8a443b2f",
  databaseURL: "https://numer-duel-default-rtdb.asia-southeast1.firebasedatabase.app",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

let signInPromise: Promise<User> | null = null;

export function ensureSignedIn(): Promise<User> {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  if (signInPromise) return signInPromise;
  signInPromise = new Promise<User>((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        unsub();
        resolve(user);
      }
    });
    signInAnonymously(auth).catch((err) => {
      unsub();
      signInPromise = null;
      reject(err);
    });
  });
  return signInPromise;
}
