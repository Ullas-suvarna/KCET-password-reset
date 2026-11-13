import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// Firebase Configuration using Vite environment variables with fallback
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCFYIawcvcSu4aDbx919KeP220SB1jspqQ",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "kcet-app-c0457.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "kcet-app-c0457",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "kcet-app-c0457.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "335362153278",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:335362153278:web:8f2f1060faaf2478466a6f",
};

// Initialize Firebase modular app singleton
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Export authDomain directly for default Firebase action handlers
export const authDomain = firebaseConfig.authDomain;

// Initialize Firebase Authentication
export const auth = getAuth(app);
export default app;
