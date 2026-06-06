import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuthStore, type UserProfile } from '../store/authStore';

// ── Google Identity Services typings ─────────────────────────────────────────
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            config: {
              theme?: string;
              size?: string;
              shape?: string;
              text?: string;
              width?: number;
            }
          ) => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}

// ── JWT decode (client-side — we trust Google's popup, no sig verify needed) ─
function decodeGoogleJwt(token: string): Record<string, string> {
  try {
    const payload = token.split('.')[1];
    const padded  = payload + '=='.slice((payload.length % 4 || 4) - 4 || 0);
    return JSON.parse(atob(padded.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return {};
  }
}

// ── Save profile to Vercel API ─────────────────────────────────────────────
async function saveProfile(profile: UserProfile): Promise<void> {
  const base = import.meta.env.VITE_APP_URL ?? '';
  await fetch(`${base}/api/users`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      name:      profile.name,
      email:     profile.email,
      instagram: profile.instagram,
      youtube:   profile.youtube,
    }),
  });
}

// ── Component ─────────────────────────────────────────────────────────────────
export function AuthButton() {
  const { user, setUser, updateProfile, logout } = useAuthStore();

  // Step in the flow: 'idle' | 'profile' | 'saving' | 'done'
  const [step, setStep]         = useState<'idle' | 'profile' | 'saving'>('idle');
  const [showMenu, setShowMenu] = useState(false);
  const [instagram, setInstagram] = useState('');
  const [youtube,   setYoutube]   = useState('');
  const [saveError, setSaveError] = useState('');
  const [pendingUser, setPendingUser] = useState<UserProfile | null>(null);

  const gsiRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // ── Close menu on outside click ──────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── GIS initialisation ───────────────────────────────────────────────────
  const initGIS = useCallback(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId || !window.google) return;

    window.google.accounts.id.initialize({
      client_id:   clientId,
      auto_select: false,
      callback:    (response) => {
        const claims = decodeGoogleJwt(response.credential);
        const newUser: UserProfile = {
          email:     claims.email     ?? '',
          name:      claims.name      ?? '',
          picture:   claims.picture,
          instagram: '',
          youtube:   '',
        };
        setPendingUser(newUser);
        setInstagram('');
        setYoutube('');
        setStep('profile');
      },
    });

    if (gsiRef.current) {
      window.google.accounts.id.renderButton(gsiRef.current, {
        theme: 'filled_black',
        size:  'medium',
        shape: 'pill',
        text:  'signin_with',
      });
    }
  }, []);

  // Try to init when the GIS script loads (it may already be loaded)
  useEffect(() => {
    if (user) return; // already signed in — no need to show the button
    if (window.google) {
      initGIS();
      return;
    }
    // Script is async — poll until ready
    const poll = setInterval(() => {
      if (window.google) { clearInterval(poll); initGIS(); }
    }, 200);
    return () => clearInterval(poll);
  }, [user, initGIS]);

  // ── Profile form submit ──────────────────────────────────────────────────
  const handleProfileSave = useCallback(async () => {
    if (!pendingUser) return;
    setSaveError('');
    setStep('saving');

    const finalUser: UserProfile = {
      ...pendingUser,
      instagram: instagram.replace(/^@/, '').trim(),
      youtube:   youtube.replace(/^@/, '').trim(),
    };

    try {
      await saveProfile(finalUser);
      setUser(finalUser);
      setStep('idle');
    } catch {
      setSaveError('Could not save profile. Please try again.');
      setStep('profile');
    }
  }, [pendingUser, instagram, youtube, setUser]);

  // ── Edit social handles ──────────────────────────────────────────────────
  const handleEditSave = useCallback(async () => {
    if (!user) return;
    setSaveError('');
    setStep('saving');

    const updated: UserProfile = {
      ...user,
      instagram: instagram.replace(/^@/, '').trim(),
      youtube:   youtube.replace(/^@/, '').trim(),
    };

    try {
      await saveProfile(updated);
      updateProfile({ instagram: updated.instagram, youtube: updated.youtube });
      setStep('idle');
      setShowMenu(false);
    } catch {
      setSaveError('Could not save. Please try again.');
      setStep('idle');
    }
  }, [user, instagram, youtube, updateProfile]);

  const openEdit = () => {
    setInstagram(user?.instagram ?? '');
    setYoutube(user?.youtube ?? '');
    setSaveError('');
    setShowMenu(false);
    setStep('profile');
    setPendingUser(null); // signals "editing existing user"
  };

  // ── Render: signed-in state ───────────────────────────────────────────────
  if (user) {
    return (
      <div className="auth-signed-in" ref={menuRef}>
        <button
          className="auth-avatar-btn"
          onClick={() => setShowMenu((v) => !v)}
          aria-label="User menu"
          title={user.name}
        >
          {user.picture
            ? <img src={user.picture} alt={user.name} className="auth-avatar-img" referrerPolicy="no-referrer" />
            : <span className="auth-avatar-initials">{user.name.slice(0, 1).toUpperCase()}</span>
          }
        </button>

        {showMenu && (
          <div className="auth-menu">
            <div className="auth-menu-header">
              <p className="auth-menu-name">{user.name}</p>
              <p className="auth-menu-email">{user.email}</p>
              {user.instagram && <p className="auth-menu-social">@{user.instagram} · IG</p>}
              {user.youtube   && <p className="auth-menu-social">@{user.youtube} · YT</p>}
            </div>
            <div className="auth-menu-actions">
              <button className="auth-menu-btn" onClick={openEdit}>Edit Profile</button>
              <button
                className="auth-menu-btn auth-menu-btn--logout"
                onClick={() => { logout(); setShowMenu(false); }}
              >
                Sign Out
              </button>
            </div>
          </div>
        )}

        {/* Profile edit modal */}
        {step === 'profile' && pendingUser === null && (
          <AuthModal
            title="Edit profile"
            instagram={instagram}
            youtube={youtube}
            error={saveError}
            isSaving={false}
            setInstagram={setInstagram}
            setYoutube={setYoutube}
            onSave={handleEditSave}
            onCancel={() => setStep('idle')}
          />
        )}
      </div>
    );
  }

  // ── Render: sign-in state ─────────────────────────────────────────────────
  return (
    <>
      {/* GIS renders the button into this div */}
      <div ref={gsiRef} className="auth-gsi-btn" />

      {/* Profile form shown after Google credential arrives */}
      {(step === 'profile' || step === 'saving') && pendingUser !== null && (
        <AuthModal
          title={`Welcome, ${pendingUser.name.split(' ')[0]}!`}
          subtitle="Add your social handles so producers can find you (optional)."
          instagram={instagram}
          youtube={youtube}
          error={saveError}
          isSaving={step === 'saving'}
          setInstagram={setInstagram}
          setYoutube={setYoutube}
          onSave={handleProfileSave}
          onCancel={() => setStep('idle')}
        />
      )}
    </>
  );
}

// ── AuthModal ─────────────────────────────────────────────────────────────────

interface AuthModalProps {
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

function AuthModal({
  title, subtitle, instagram, youtube, error,
  isSaving, setInstagram, setYoutube, onSave, onCancel,
}: AuthModalProps) {
  return (
    <div className="auth-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="auth-modal" role="dialog" aria-modal="true" aria-label={title}>
        <h2 className="auth-modal-title">{title}</h2>
        {subtitle && <p className="auth-modal-subtitle">{subtitle}</p>}

        <label className="auth-field">
          <span className="auth-field-label">Instagram handle</span>
          <input
            className="auth-field-input"
            type="text"
            placeholder="@yourhandle"
            value={instagram}
            onChange={(e) => setInstagram(e.target.value)}
            disabled={isSaving}
          />
        </label>

        <label className="auth-field">
          <span className="auth-field-label">YouTube channel</span>
          <input
            className="auth-field-input"
            type="text"
            placeholder="@yourchannel"
            value={youtube}
            onChange={(e) => setYoutube(e.target.value)}
            disabled={isSaving}
          />
        </label>

        {error && <p className="auth-modal-error">{error}</p>}

        <div className="auth-modal-actions">
          <button className="btn btn--slice" onClick={onSave} disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save & Continue'}
          </button>
          <button className="btn btn--reset" onClick={onCancel} disabled={isSaving}>
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
