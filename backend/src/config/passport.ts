import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { findOrLinkOAuthUser, OAuthProfile } from '../services/oauthService';
import { fetchPrimaryVerifiedEmail } from '../services/githubEmail';
import { env } from './env';

const backendUrl = env.BACKEND_URL || 'http://localhost:3001';

passport.use(new GoogleStrategy({
    clientID: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${backendUrl}/api/auth/google/callback`
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const emailObj = profile.emails?.[0];
        const email = emailObj?.value;
        const emailVerified = emailObj?.verified === true || emailObj?.verified === 'true' || profile._json.email_verified === true;

        const oauthProfile: OAuthProfile = {
            provider: 'google',
            providerId: profile.id,
            email,
            emailVerified: !!emailVerified
        };

        const result = await findOrLinkOAuthUser(oauthProfile);
        return done(null, result as any);
    } catch (err) {
        return done(err, false);
    }
}));

passport.use(new GitHubStrategy({
    clientID: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
    callbackURL: `${backendUrl}/api/auth/github/callback`,
    scope: ['user:email']
}, async (accessToken: string, refreshToken: string, profile: any, done: any) => {
    try {
        const { email, verified } = await fetchPrimaryVerifiedEmail(accessToken);

        const oauthProfile: OAuthProfile = {
            provider: 'github',
            providerId: profile.id,
            email,
            emailVerified: verified
        };

        const result = await findOrLinkOAuthUser(oauthProfile);
        return done(null, result as any);
    } catch (err) {
        return done(err, false);
    }
}));

export default passport;
