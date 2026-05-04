# Entwin Authentication Setup Guide

This guide will help you set up Google and Outlook authentication for your Entwin application.

## Overview

The authentication system includes:
- **Google OAuth 2.0** authentication
- **Microsoft/Outlook OAuth 2.0** authentication
- User session management with JWT tokens
- Secure cookie-based session storage
- Automatic user greeting display on successful login

## Setup Instructions

### 1. Create `.env.local` File

Copy `.env.local.example` to `.env.local` and update with your credentials:

```bash
cp .env.local.example .env.local
```

### 2. Configure Google OAuth

#### Steps:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Google+ API**
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client IDs**
5. Choose **Web application**
6. Add to **Authorized redirect URIs**:
   - `http://localhost:3000/api/auth/google` (development)
   - `https://yourdomain.com/api/auth/google` (production)
7. Copy the **Client ID** and **Client Secret**

#### Update `.env.local`:
```
GOOGLE_CLIENT_ID=your-client-id-here
GOOGLE_CLIENT_SECRET=your-client-secret-here
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google
```

### 3. Configure Microsoft/Outlook OAuth

#### Steps:
1. Go to [Azure Portal](https://portal.azure.com/)
2. Navigate to **Azure Active Directory** → **App registrations**
3. Click **New registration**
4. Set **Redirect URI** to:
   - `http://localhost:3000/api/auth/microsoft/callback` (development)
   - `https://yourdomain.com/api/auth/microsoft/callback` (production)
5. Go to **Certificates & secrets** → **Client secrets** → **New client secret**
6. Copy the value
7. Note the **Application (client) ID**

#### Update `.env.local`:
```
MICROSOFT_CLIENT_ID=your-application-id-here
MICROSOFT_CLIENT_SECRET=your-client-secret-here
MICROSOFT_REDIRECT_URI=http://localhost:3000/api/auth/microsoft
```

### 4. Set JWT Secret

Generate a strong random string for the JWT secret:

```bash
# On Linux/Mac
openssl rand -base64 32

# On Windows PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

Update `.env.local`:
```
JWT_SECRET=your-generated-secret-here
```

## How It Works

### User Flow:

1. **Sign Up / Sign In Click**
   - User clicks the "Sign Up / Sign In" button in the navigation
   - An authentication modal appears with Google and Outlook options

2. **OAuth Provider Selection**
   - User chooses either Google or Outlook
   - Redirected to the provider's login page

3. **Authentication**
   - User logs in with their credentials
   - Provider redirects back to Entwin with an authorization code

4. **Token Exchange**
   - Entwin backend exchanges the code for user information
   - Creates a JWT token with user data
   - Stores the token in a secure HTTP-only cookie

5. **Home Page Redirect**
   - User is redirected to the home page
   - "Hi, [FirstName]" appears next to the Entwin logo
   - Sign Out button is available in the navigation

### File Structure:

```
app/
  ├── api/
  │   └── auth/
  │       ├── session/route.ts          # Get current session
  │       ├── google/route.ts           # Google OAuth handler
  │       ├── microsoft/route.ts        # Outlook OAuth handler
  │       └── logout/route.ts           # Logout handler
  ├── components/
  │   ├── Navigation.tsx                # Updated with auth UI
  │   ├── AuthModal.tsx                 # Modal for provider selection
  │   └── AuthModal.module.css          # Modal styling
  ├── lib/
  │   └── auth-context.tsx              # Authentication context
  └── layout.tsx                        # Root layout with AuthProvider
```

## Development

To test the authentication:

1. Make sure all environment variables are set in `.env.local`
2. Start the development server:
   ```bash
   npm run dev
   ```
3. Navigate to `http://localhost:3000`
4. Click "Sign Up / Sign In"
5. Choose a provider and complete authentication

## Production Deployment

Before deploying to production:

1. **Update Redirect URIs**: Change all `localhost:3000` URLs to your production domain in both Google Cloud Console and Azure Portal
2. **Environment Variables**: Update `.env.local` with production credentials
3. **JWT Secret**: Use a long, random production secret
4. **HTTPS**: Ensure your site uses HTTPS (required for OAuth)
5. **Cookie Security**: The `secure` flag will automatically be enabled in production

## Security Notes

- JWT tokens expire after 7 days by default (configurable in the auth routes)
- Tokens are stored in HTTP-only cookies (not accessible to JavaScript)
- Cookies are set with `SameSite=Lax` to prevent CSRF attacks
- User credentials are never stored; only user information is cached
- All OAuth communications use HTTPS

## Troubleshooting

### "Invalid redirect URI"
- Ensure the redirect URI in your OAuth provider settings exactly matches the one in your code
- For development: `http://localhost:3000/api/auth/...`
- For production: `https://yourdomain.com/api/auth/...`

### "Client ID or Secret is invalid"
- Double-check the credentials are copied correctly
- Make sure there are no extra spaces or line breaks

### User not logged in after redirect
- Clear browser cookies
- Check browser console for errors
- Verify environment variables are loaded correctly

### "NEXTAUTH_SECRET is not set"
- This is handled automatically; ensure `JWT_SECRET` is set in `.env.local`

## Next Steps

After authentication is set up, you can:

1. **User Profile Page**: Create a profile page to display user information
2. **User Preferences**: Store and manage user settings
3. **Role-Based Access Control**: Implement different access levels
4. **Additional OAuth Providers**: Add more authentication options
5. **Email Verification**: Implement email verification for new users

## Support

For issues with authentication, check:
- Browser console for error messages
- Server logs for detailed error information
- The `.env.local` file for missing or incorrect credentials
