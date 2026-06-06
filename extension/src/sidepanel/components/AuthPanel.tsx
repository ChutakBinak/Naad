import { useState, useCallback } from 'react';
import { useAuthStore, type UserProfile } from '../store/authStore';

// ── The Vercel web app URL — used as the API base ─────────────────────────────
// Replace with your actual Vercel URL before deploying.
const API_BASE = 'https://naad.vercel.app';

// ── Save profile to the web app's Vercel API ──────────────────────────────────
async function saveProfileToSheets(
  profile: UserProfile,
  accessToken: string
): Promise<void> {
  await fetch(`${API_BASE}/api/users`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      name:      profile.name,
      email:     profile.email,
      instagram: profile.instagram,
      youtube:   profile.youtube,
      // Pass the access token so the server can optionally verify identity
      accessToken,
    }),
  });
}

// ── Fetch Google profile using an OAuth access token ──────────────────────────
async function fetchGoogleProfile(accessToken: string): Promise<{ email: string; name: string; picture?: string }> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to fetch profile');
  return res.json() as Promise<{ email: string; name: string; picture?: string }>;
}

// ── AuthPanel component ───────────────────────────────────────────────────────
export function AuthPanel() {
  const { user, setUser, updateProfile, logout } = useAuthStore();

  const [step, setStep]           = useState<'idle' | 'profile' | 'saving' | 'menu'>('idle');
  const [instagram, setInstagram] = useState('');
  const [youtube,   setYoutube]   = useState('');
  const [error,     setError]     = useState('');
  const [pendingProfile, setPendingProfile] = useState<{ email: string; name: string; picture?: string; token: string } | null>(null);

  // ── Sign in with Google via chrome.identity ───────────────────────────────
  const handleSignIn = useCallback(async () => {
    setError('');
    try {
      const token = await new Promise<string>((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: true }, (token) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else if (!token) reject(new Error('No token returned'));
          else resolve(token);
        });
      });

      const profile = await fetchGoogleProfile(token);
      setPendingProfile({ ...profile, token });
      setInstagram('');
      setYoutube('');
      setStep('profile');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    }
  }, []);

  // ── Save profile (new user) ───────────────────────────────────────────────
  const handleProfileSave = useCallback(async () => {
    if (!pendingProfile) return;
    setError('');
    setStep('saving');

    const finalUser: UserProfile = {
      email:     pendingProfile.email,
      name:      pendingProfile.name,
      picture:   pendingProfile.picture,
      instagram: instagram.replace(/^@/, '').trim(),
      youtube:   youtube.replace(/^@/, '').trim(),
    };

    try {
      await saveProfileToSheets(finalUser, pendingProfile.token);
      setUser(finalUser);
      setStep('idle');
    } catch {
      setError('Could not save profile. Please try again.');
      setStep('profile');
    }
  }, [pendingProfile, instagram, youtube, setUser]);

  // ── Save edited social handles (existing user) ────────────────────────────
  const handleEditSave = useCallback(async () => {
    if (!user) return;
    setError('');
    setStep('saving');

    const updated: UserProfile = {
      ...user,
      instagram: instagram.replace(/^@/, '').trim(),
      youtube:   youtube.replace(/^@/, '').trim(),
    };

    try {
      // Re-use existing token — best-effort (token may have expired)
      await saveProfileToSheets(updated, '');
      updateProfile({ instagram: updated.instagram, youtube: updated.youtube });
      setStep('idle');
    } catch {
      // Still update locally even if sheet save fails
      updateProfile({ instagram: updated.instagram, youtube: updated.youtube });
      setStep('idle');
    }
  }, [user, instagram, youtube, updateProfile]);

  const openEdit = () => {
    setInstagram(user?.instagram ?? '');
    setYoutube(user?.youtube ?? '');
    setError('');
    setStep('profile');
    setPendingProfile(null);
  };

  // ── Signed-in state ───────────────────────────────────────────────────────
  if (user) {
    return (
      <div className="ext-auth">
        {step === 'idle' && (
          <div className="ext-auth-signed-in">
            {user.picture
              ? <img src={user.picture} alt={user.name} className="ext-auth-avatar" referrerPolicy="no-referrer" />
              : <span className="ext-auth-initials">{user.name.slice(0, 1).toUpperCase()}</span>
            }
            <div className="ext-auth-info">
              <span className="ext-auth-name">{user.name.split(' ')[0]}</span>
              {(user.instagram || user.youtube) && (
                <span className="ext-auth-social">
                  {user.instagram ? `@${user.instagram}` : ''}
                  {user.instagram && user.youtube ? ' · ' : ''}
                  {user.youtube   ? `@${user.youtube}` : ''}
                </span>
              )}
            </div>
            <div className="ext-auth-actions">
              <button className="ext-auth-btn" onClick={openEdit} title="Edit profile">✎</button>
              <button className="ext-auth-btn ext-auth-btn--logout" onClick={logout} title="Sign out">⏏</button>
            </div>
          </div>
        )}

        {(step === 'profile' || step === 'saving') && pendingProfile === null && (
          <ExtAuthForm
            title="Edit profile"
            instagram={instagram}
            youtube={youtube}
            error={error}
            isSaving={step === 'saving'}
            setInstagram={setInstagram}
            setYoutube={setYoutube}
            onSave={handleEditSave}
            onCancel={() => setStep('idle')}
          />
        )}
      </div>
    );
  }

  // ── Signed-out state ──────────────────────────────────────────────────────
  return (
    <div className="ext-auth">
      {step === 'idle' && (
        <button className="ext-auth-signin-btn" onClick={handleSignIn}>
          <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          Sign in with Google
        </button>
      )}

      {error && step === 'idle' && (
        <p className="ext-auth-error">{error}</p>
      )}

      {(step === 'profile' || step === 'saving') && pendingProfile !== null && (
        <ExtAuthForm
          title={`Hi, ${pendingProfile.name.split(' ')[0]}!`}
          subtitle="Add your socials (optional)"
          instagram={instagram}
          youtube={youtube}
          error={error}
          isSaving={step === 'saving'}
          setInstagram={setInstagram}
          setYoutube={setYoutube}
          onSave={handleProfileSave}
          onCancel={() => setStep('idle')}
        />
      )}
    </div>
  );
}

// ── Compact form for extension side panel ─────────────────────────────────────

interface ExtAuthFormProps {
  title:        string;
  subtitle?:    string;
  instagram:    string;
  youtube:      string;
  error:        string;
  isSaving:     boolean;
  setInstagram: (v: string) => void;
  setYoutube:   (v: string) => void;
  onSave:       () => void;
  onCancel:     () => void;
}

function ExtAuthForm({
  title, subtitle, instagram, youtube, error,
  isSaving, setInstagram, setYoutube, onSave, onCancel,
}: ExtAuthFormProps) {
  return (
    <div className="ext-auth-form">
      <p className="ext-auth-form-title">{title}</p>
      {subtitle && <p className="ext-auth-form-subtitle">{subtitle}</p>}

      <input
        className="ext-auth-input"
        type="text"
        placeholder="@instagram"
        value={instagram}
        onChange={(e) => setInstagram(e.target.value)}
        disabled={isSaving}
      />
      <input
        className="ext-auth-input"
        type="text"
        placeholder="@youtube"
        value={youtube}
        onChange={(e) => setYoutube(e.target.value)}
        disabled={isSaving}
      />

      {error && <p className="ext-auth-error">{error}</p>}

      <div className="ext-auth-form-btns">
        <button className="btn btn--slice btn--sm" onClick={onSave} disabled={isSaving}>
          {isSaving ? '…' : 'Save'}
        </button>
        <button className="btn btn--reset btn--sm" onClick={onCancel} disabled={isSaving}>
          Skip
        </button>
      </div>
    </div>
  );
}
