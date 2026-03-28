import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const config = window.__FIREBASE_CONFIG__;
if (!config) {
  console.warn('Missing window.__FIREBASE_CONFIG__. Firebase features are disabled.');
}

const app = config ? initializeApp(config) : null;
const db = app ? getFirestore(app) : null;

export {
  db,
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
};
