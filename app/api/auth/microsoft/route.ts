import { cookies } from 'next/headers'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-in-production'
const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || ''
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET || ''
const MICROSOFT_REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:3000/api/auth/microsoft/callback'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  // If this is the initial request, redirect to Microsoft OAuth
  if (!code && !error) {
    const params = new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID,
      redirect_uri: MICROSOFT_REDIRECT_URI,
      response_type: 'code',
      scope: 'openid profile email offline_access',
      response_mode: 'query',
    })

    return Response.redirect(
      `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`
    )
  }

  // Handle callback from Microsoft
  if (error) {
    return Response.redirect('/?auth_error=' + error)
  }

  try {
    // Exchange code for token
    const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: MICROSOFT_CLIENT_ID,
        client_secret: MICROSOFT_CLIENT_SECRET,
        code,
        redirect_uri: MICROSOFT_REDIRECT_URI,
        grant_type: 'authorization_code',
        scope: 'openid profile email offline_access',
      }),
    })

    const tokenData = await tokenResponse.json()

    if (!tokenResponse.ok) {
      throw new Error('Failed to exchange code for token')
    }

    // Decode the ID token to get user info (Microsoft doesn't have a standard userinfo endpoint in v2)
    const idTokenParts = tokenData.id_token.split('.')
    const decodedToken = JSON.parse(
      Buffer.from(idTokenParts[1], 'base64').toString()
    )

    // Create JWT token
    const authToken = jwt.sign(
      {
        id: decodedToken.oid || decodedToken.sub,
        email: decodedToken.preferred_username || decodedToken.email,
        name: decodedToken.name,
        firstName: decodedToken.given_name,
        image: undefined,
        provider: 'outlook',
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    )

    // Set cookie
    const cookieStore = await cookies()
    cookieStore.set('auth_token', authToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    })

    // Redirect to home page
    return Response.redirect('/')
  } catch (error) {
    console.error('Microsoft OAuth error:', error)
    return Response.redirect('/?auth_error=failed')
  }
}
