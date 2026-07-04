import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDURkS-FTU7ULyEujCL4IRGA0-pzn41zbs",
  authDomain: "ptm--bookings.firebaseapp.com",
  projectId: "ptm--bookings",
  storageBucket: "ptm--bookings.firebasestorage.app",
  messagingSenderId: "526233519147",
  appId: "1:526233519147:web:fb5efb4b79a12f1408966e"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
