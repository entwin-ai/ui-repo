# Authentication Implementation - Quick Start

## What Was Implemented

Your Entwin application now has full Google and Outlook authentication with the following features:

### ✅ Features
- **Sign Up / Sign In Modal**: Click the button to choose between Google or Outlook
- **Google OAuth 2.0**: Secure authentication via Google accounts
- **Microsoft Outlook OAuth 2.0**: Secure authentication via Microsoft/Outlook accounts
- **User Greeting**: After login, "Hi, [FirstName]" appears next to the Entwin logo
- **Session Management**: Secure JWT token-based sessions with 7-day expiration
- **Sign Out**: Users can easily log out from the navigation bar
- **Secure Cookies**: HTTP-only cookies with CSRF protection

### 📁 New Files Created

```
app/
├── api/auth/
│   ├── session/route.ts       # Get current user session
│   ├── google/route.ts        # Google OAuth handler
│   ├── microsoft/route.ts     # Outlook OAuth handler
│   └── logout/route.ts        # Logout handler
├── lib/
│   └── auth-context.tsx       # Authentication context with useAuth hook
└── components/
    ├── AuthModal.tsx          # Modal for authentication provider selection
    └── AuthModal.module.css   # Modal styling

Updated Files:
├── app/layout.tsx             # Added AuthProvider wrapper
├── app/components/Navigation.tsx  # Added auth UI and user greeting
└── app/components/Navigation.module.css  # Added greeting & sign out styles
```

### 📝 Configuration Files

- `.env.local.example`: Template for environment variables
- `AUTHENTICATION_SETUP.md`: Detailed setup and deployment guide

## 🚀 Quick Start

### 1. Create `.env.local` file

```bash
cp .env.local.example .env.local
```

### 2. Get Google OAuth Credentials

1. Visit [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable Google+ API
4. Go to Credentials → Create OAuth 2.0 Client ID (Web application)
5. Add redirect URI: `http://localhost:3000/api/auth/google`
6. Copy Client ID and Secret to `.env.local`

### 3. Get Microsoft OAuth Credentials

1. Visit [Azure Portal](https://portal.azure.com/)
2. Go to Azure AD → App Registrations → New registration
3. Add redirect URI: `http://localhost:3000/api/auth/microsoft`
4. Create client secret under Certificates & secrets
5. Copy Client ID and Secret to `.env.local`

### 4. Update `.env.local`

```env
JWT_SECRET=your-random-secret-here

GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google

MICROSOFT_CLIENT_ID=your-microsoft-client-id
MICROSOFT_CLIENT_SECRET=your-microsoft-client-secret
MICROSOFT_REDIRECT_URI=http://localhost:3000/api/auth/microsoft
```

### 5. Run the Development Server

```bash
npm run dev
```

Visit `http://localhost:3000` and click "Sign Up / Sign In"

## 🔗 Authentication Flow

```
User clicks "Sign Up / Sign In"
        ↓
AuthModal appears with Google & Outlook options
        ↓
User selects provider
        ↓
Redirected to OAuth provider login
        ↓
User authenticates with provider
        ↓
Provider redirects back with authorization code
        ↓
Backend exchanges code for user data
        ↓
JWT token created and stored in secure cookie
        ↓
User redirected to home page
        ↓
"Hi, [FirstName]" displayed next to logo
        ↓
User can click "Sign Out" to logout
```

## 🔐 Authentication Context (useAuth Hook)

The `useAuth` hook provides:
- `user`: Current authenticated user object
- `isLoading`: Loading state during auth check
- `signIn(provider)`: Sign in with 'google' or 'outlook'
- `signOut()`: Sign out and clear session

### Example Usage in Components

```tsx
import { useAuth } from '@/app/lib/auth-context'

export default function MyComponent() {
  const { user, signIn, signOut } = useAuth()

  if (!user) {
    return <button onClick={() => signIn('google')}>Sign in</button>
  }

  return (
    <div>
      <p>Welcome, {user.firstName}!</p>
      <button onClick={signOut}>Sign out</button>
    </div>
  )
}
```

## 📋 User Object Structure

```typescript
interface AuthUser {
  id: string              // Unique user ID from provider
  email: string           // User's email
  name: string            // Full name
  firstName: string       // First name (displayed in greeting)
  image?: string          // Profile picture URL
  provider: 'google' | 'outlook'  // Authentication provider
}
```

## 🌐 Environment Variables Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `JWT_SECRET` | Secret for signing JWT tokens | `abc123...xyz` |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID | `123456.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret | `GOCSPX-...` |
| `GOOGLE_REDIRECT_URI` | Google OAuth Redirect URI | `http://localhost:3000/api/auth/google` |
| `MICROSOFT_CLIENT_ID` | Azure App Client ID | `550e8400-e29b-...` |
| `MICROSOFT_CLIENT_SECRET` | Azure App Client Secret | `xyz.1234...` |
| `MICROSOFT_REDIRECT_URI` | Microsoft OAuth Redirect URI | `http://localhost:3000/api/auth/microsoft` |

## 🧪 Testing

1. Test Google authentication:
   - Click "Sign Up / Sign In" → Google
   - Use your Google account
   - Verify "Hi, [FirstName]" appears

2. Test Outlook authentication:
   - Click "Sign Up / Sign In" → Outlook
   - Use your Microsoft/Outlook account
   - Verify "Hi, [FirstName]" appears

3. Test Sign Out:
   - Click "Sign Out" button
   - Verify page reloads and button returns to "Sign Up / Sign In"

## 📚 API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/auth/session` | GET | Retrieve current session |
| `/api/auth/google` | GET | Google OAuth handler |
| `/api/auth/microsoft` | GET | Outlook OAuth handler |
| `/api/auth/logout` | POST | Clear session and sign out |

## 🔒 Security Features

- ✅ HTTPS-only cookies in production
- ✅ HTTP-only cookies (no JavaScript access)
- ✅ CSRF protection with SameSite=Lax
- ✅ JWT token expiration (7 days)
- ✅ No password storage
- ✅ Secure OAuth 2.0 implementation

## 🚨 Troubleshooting

### Issue: "Invalid redirect URI"
**Solution**: Ensure the redirect URI in OAuth provider settings exactly matches `.env.local`

### Issue: User not logging in
**Solution**: 
- Clear browser cookies
- Check `.env.local` has all required variables
- Check browser console for errors

### Issue: Build errors
**Solution**: Run `npm install` to ensure all dependencies are installed

## 📖 For More Information

See `AUTHENTICATION_SETUP.md` for detailed setup instructions and production deployment guide.

## 🎯 Next Steps

1. ✅ Complete OAuth provider setup (Google & Microsoft)
2. ✅ Create `.env.local` with credentials
3. ✅ Test authentication flow
4. Consider: User profile page, preferences, role-based access
5. Deploy to production with updated redirect URIs

---

**Your authentication system is now ready to use!** 🎉
