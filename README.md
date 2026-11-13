# KCET App — Custom Password Reset Portal

A dedicated, production-ready web application for resetting user passwords for the **KCET Android Application**, connecting directly to your existing Firebase project (`kcet-app-c0457`).

Built with **React**, **Vite**, **Tailwind CSS**, and **Firebase Modular JavaScript SDK (v9+)**. Ready for instant deployment on **Vercel**.

---

## 🌟 Key Features

- **Direct Firebase Auth Integration**: Connects to your existing Firebase project `kcet-app-c0457` using official modular SDK methods (`verifyPasswordResetCode` and `confirmPasswordReset`).
- **Real-Time Security Code Validation**: Reads `oobCode`, verifies it against Firebase, retrieves the associated account email, and only reveals the reset form if the code is valid.
- **Secure by Design**: Zero sensitive server credentials, no passwords stored in local storage, no console leaks, and anti-replay protection.
- **Modern Dark Navy UI**: High-end glassmorphism design with responsive gradients, tailored for mobile and desktop screens.
- **Author Attribution**: Elegant, subtle badge displaying `"ULLAS U SUVARNA"` fixed cleanly at the top-right corner.
- **Interactive Password Controls**:
  - Show / Hide password toggles on both fields.
  - Real-time password strength meter (Weak / Fair / Good / Strong).
  - Security checklist (8+ chars, upper, lower, digit, special character).
  - Live confirmation matching feedback.
- **State Handling**:
  - Link verification spinner.
  - Multi-submit lock during Firebase password update.
  - Friendly error handling for expired codes (`auth/expired-action-code`), invalid or reused codes (`auth/invalid-action-code`), and weak passwords.
  - Success screen with direct guidance to return to the KCET Android app.
- **Single Page Application Routing**: Includes `vercel.json` rewrite configuration so `/reset-password` or query links reload cleanly without 404s.

---

## 📁 Project Structure

```text
KCET PASSWORD RESET PAGE/
├── public/
│   └── kcet-icon.svg             # Academic shield emblem & app icon
├── src/
│   ├── components/
│   │   ├── Footer.jsx             # Security assurance and copyright
│   │   ├── Navbar.jsx             # Header with logo & "ULLAS U SUVARNA" badge
│   │   ├── PasswordResetCard.jsx  # Main state machine & Firebase handler
│   │   └── PasswordStrengthMeter.jsx # Visual meter & requirements checklist
│   ├── App.jsx                    # Root layout with dynamic mesh gradient
│   ├── firebase.js                # Firebase Modular SDK initialization
│   ├── index.css                  # Tailwind styles and glassmorphism
│   └── main.jsx                   # React entry point
├── .env                           # Local environment config
├── .env.example                   # Template for environment variables
├── index.html                     # HTML head with Plus Jakarta Sans font
├── package.json                   # Dependencies and build scripts
├── postcss.config.js              # PostCSS configuration
├── tailwind.config.js             # Theme & color tokens
├── vercel.json                    # Vercel SPA routing and security headers
└── vite.config.js                 # Vite bundler configuration
```

---

## ⚙️ Environment Configuration

The application uses Vite environment variables. A `.env.example` file is included:

```bash
VITE_FIREBASE_API_KEY=AIzaSyCFYIawcvcSu4aDbx919KeP220SB1jspqQ
VITE_FIREBASE_AUTH_DOMAIN=kcet-app-c0457.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=kcet-app-c0457
VITE_FIREBASE_STORAGE_BUCKET=kcet-app-c0457.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=335362153278
VITE_FIREBASE_APP_ID=1:335362153278:web:8f2f1060faaf2478466a6f
```

---

## 🚀 How to Run Locally

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start the development server**:
   ```bash
   npm run dev
   ```

3. **Open in browser**:
   Navigate to `http://localhost:3000`.

4. **Testing query links locally**:
   - Visiting `http://localhost:3000/` shows the polite landing view.
   - Testing an action link:
     `http://localhost:3000/?mode=resetPassword&oobCode=TEST_CODE`
     *(Firebase will connect and return invalid/expired code, confirming the endpoint is live)*.

---

## 🌐 Deploying to Vercel

### Method 1: Deploy with Vercel CLI (Quickest)

1. In the project folder, run:
   ```bash
   npx vercel
   ```
2. Follow the terminal prompts (defaults are automatically recognized via `vercel.json`).
3. To deploy to production:
   ```bash
   npx vercel --prod
   ```

### Method 2: Deploy via GitHub / Vercel Dashboard

1. Push this project to a GitHub / GitLab / Bitbucket repository.
2. Go to [vercel.com/new](https://vercel.com/new) and import the repository.
3. Under **Environment Variables**, add the keys from `.env.example`:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
4. Click **Deploy**. Vercel will build and assign you a URL (e.g., `https://kcet-reset.vercel.app`).

---

## 🔗 Connecting Your Firebase Project to Use This Website

To have Firebase send users to your new website when they request a password reset from the KCET Android app:

1. Open the [Firebase Console](https://console.firebase.google.com/).
2. Select your project: **kcet-app-c0457**.
3. In the left navigation, click **Authentication** -> **Templates** tab.
4. Click **Password reset** template.
5. Click the **Edit template (pencil icon)**.
6. Click **Customize action URL** at the bottom of the template modal.
7. Enter your Vercel deployment URL:
   ```text
   https://your-vercel-domain.vercel.app
   ```
8. Click **Save**.

Now, whenever a user clicks "Forgot Password" inside the KCET Android app, the email sent by Firebase will automatically link to your custom website!

---

## 🤖 Prompt for Google AI Studio

If you want to use **Google AI Studio** to inspect or modify features, copy and paste this exact prompt:

```text
I have a custom password reset website for my KCET Android application. It connects directly to my existing Firebase project:
- Project ID: kcet-app-c0457
- Auth Domain: kcet-app-c0457.firebaseapp.com
- Firebase SDK: Modular JavaScript SDK v9+ (firebase/auth)

The website captures the Firebase action URL parameters:
- mode (e.g. "resetPassword")
- oobCode (the one-time out-of-band security token generated by Firebase)
- apiKey
- continueUrl

Current logic:
1. Calls verifyPasswordResetCode(auth, oobCode) to validate the code and fetch the account email.
2. Enforces password strength (min 8 chars, mixed case, numbers, special characters).
3. Calls confirmPasswordReset(auth, oobCode, newPassword) to update the password directly in Firebase Authentication without storing passwords anywhere.
4. Top-right corner displays developer attribution: "ULLAS U SUVARNA".

Please provide suggestions or inspect any additional features for this KCET password reset workflow.
```

---

## 🛡️ Security Best Practices Followed

- **Zero Service Account Exposure**: No private keys or Firebase Admin credentials are used on the frontend.
- **No Password Persistence**: Passwords are never stored in localStorage, sessionStorage, or logs.
- **Atomic Operations**: Only official Firebase client SDK methods (`verifyPasswordResetCode` and `confirmPasswordReset`) are used.
- **SPA Rewrites**: Handled cleanly with security headers (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`).
