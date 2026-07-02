import { useState, useEffect, useRef, useCallback } from "react";

// ─── PERSISTENT STORAGE LAYER (real localStorage — for live/deployed websites) ──
// Falls back to an in-memory store automatically if localStorage isn't available
// (e.g. inside Claude's own artifact preview), so this file works in both places.
const _memoryStore = {};
const _hasLocalStorage = (() => {
  try {
    const t = "__dp_ls_test__";
    window.localStorage.setItem(t, "1");
    window.localStorage.removeItem(t);
    return true;
  } catch { return false; }
})();

const DB = {
  get: (key) => {
    try {
      if (_hasLocalStorage) {
        const raw = window.localStorage.getItem(key);
        return raw === null ? null : JSON.parse(raw);
      }
      const v = _memoryStore[key];
      return v === undefined ? null : JSON.parse(JSON.stringify(v));
    } catch { return null; }
  },
  set: (key, val) => {
    try {
      if (_hasLocalStorage) {
        window.localStorage.setItem(key, JSON.stringify(val));
        return true;
      }
      _memoryStore[key] = JSON.parse(JSON.stringify(val));
      return true;
    } catch { return false; }
  },
  del: (key) => {
    try {
      if (_hasLocalStorage) { window.localStorage.removeItem(key); return; }
      delete _memoryStore[key];
    } catch {}
  },
};

const initDB = () => {
  if (!DB.get("dp_initialized")) {
    DB.set("dp_users", [
      { id: "admin", name: "Admin", phone: "9000000000", password: "admin123",
        diamonds: 0, referralCode: "ADMIN00", referredBy: null, totalDeposited: 0,
        totalWithdrawn: 0, gamesPlayed: 0, joinedAt: new Date().toISOString(), isAdmin: true, email: "admin@diamondplay.in",
        isAgent: false, commissionPaid: 0, customCommissionPercent: null }
    ]);
    DB.set("dp_transactions", []);
    DB.set("dp_notifications_admin", []);
    DB.set("dp_agent_requests", []);
    DB.set("dp_platform_config", {
      siteName: "DiamondPlay",
      upiId: "diamondplay@upi",
      upiName: "DiamondPlay Gaming",
      minDeposit: 100,
      minWithdraw: 200,
      withdrawFeePercent: 5,
      welcomeBonus: 50,
      dailyReward: 25,
      bannerText: "🎉 Deposit ₹1000+ get 20% bonus diamonds!",
      maintenanceMode: false,
      gameCost: 5,
      scratchCost: 10,
      agentCommissionPercent: 10,
      diceWinRate: 17,
      numberWinRate: 10,
      scratchWinRate: 33,
      tournamentEnabled: true,
      gameTournaments: { color: true, dice: true, number: true, scratch: true },
      tournamentPrizes: [
        { rank: 1, label: "🥇 1st Place", prize: 5000, color: "#ffd700", active: true },
        { rank: 2, label: "🥈 2nd Place", prize: 2500, color: "#c0c0c0", active: true },
        { rank: 3, label: "🥉 3rd Place", prize: 1000, color: "#cd7f32", active: true },
        { rank: 4, label: "4th–5th",      prize: 500,  color: "#00d4ff", active: true },
        { rank: 6, label: "6th–10th",     prize: 200,  color: "#b537f2", active: true },
      ],
    });
    DB.set("dp_diamond_packs", [
      { id: "p1", diamonds: 100, price: 100, bonus: 0, popular: false, label: "Starter" },
      { id: "p2", diamonds: 500, price: 490, bonus: 10, popular: false, label: "Basic" },
      { id: "p3", diamonds: 1000, price: 950, bonus: 50, popular: true, label: "Popular" },
      { id: "p4", diamonds: 2500, price: 2300, bonus: 200, popular: false, label: "Pro" },
      { id: "p5", diamonds: 5000, price: 4500, bonus: 500, popular: false, label: "Elite" },
      { id: "p6", diamonds: 10000, price: 8500, bonus: 1500, popular: false, label: "VIP" },
    ]);
    DB.set("dp_initialized", true);
  }
};

// ─── REAL-TIME ADMIN ALERTS ───────────────────────────────────────────────────
const pushAdminAlert = (type, data) => {
  const alerts = DB.get("dp_notifications_admin") || [];
  const alert = { id: `a_${Date.now()}`, type, data, time: new Date().toISOString(), read: false };
  DB.set("dp_notifications_admin", [alert, ...alerts].slice(0, 100));
};

// ─── UTILS ────────────────────────────────────────────────────────────────────
const fmt = (n) => n?.toLocaleString("en-IN") ?? "0";
const fmtINR = (n) => `₹${n?.toLocaleString("en-IN") ?? "0"}`;
const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const uid = () => `u_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const tid = () => `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const timeAgo = (iso) => {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

// ─── STYLES ───────────────────────────────────────────────────────────────────
const S = {
  app: { minHeight: "100vh", maxWidth: 430, margin: "0 auto", background: "#0a0a1a", color: "#fff", fontFamily: "'Inter',-apple-system,sans-serif", position: "relative" },
  page: { paddingBottom: 90, minHeight: "100vh" },
  neonBlue: "#00d4ff", neonPurple: "#b537f2", neonGold: "#ffd700",
  neonGreen: "#00ff88", neonPink: "#ff3d9a", neonOrange: "#ff6b35",
  bg1: "#0a0a1a", bg2: "#0f0f2e",
  glass: "rgba(255,255,255,0.07)",
  gradBlue: "linear-gradient(135deg,#00d4ff,#b537f2)",
  gradGold: "linear-gradient(135deg,#ffd700,#ff6b35)",
  gradGreen: "linear-gradient(135deg,#00ff88,#00d4ff)",
  gradPink: "linear-gradient(135deg,#ff3d9a,#b537f2)",
  gradDark: "linear-gradient(180deg,#0f0f2e,#0a0a1a)",
};

// ─── BASE COMPONENTS ─────────────────────────────────────────────────────────
const Btn = ({ children, onClick, variant = "primary", disabled, full, sm, style = {} }) => {
  const base = {
    border: "none", cursor: disabled ? "not-allowed" : "pointer", fontWeight: 700,
    borderRadius: 14, display: "inline-flex", alignItems: "center", justifyContent: "center",
    gap: 8, width: full ? "100%" : "auto", opacity: disabled ? 0.5 : 1,
    padding: sm ? "8px 18px" : "14px 24px", fontSize: sm ? 13 : 15, transition: "all 0.2s", ...style,
  };
  const v = {
    primary: { background: S.gradBlue, color: "#fff", boxShadow: "0 4px 20px rgba(0,212,255,0.3)" },
    gold: { background: S.gradGold, color: "#000", boxShadow: "0 4px 20px rgba(255,215,0,0.3)" },
    green: { background: S.gradGreen, color: "#000" },
    ghost: { background: "rgba(255,255,255,0.08)", color: "#fff", border: "1px solid rgba(255,255,255,0.15)" },
    danger: { background: "linear-gradient(135deg,#ff3d9a,#ff6b35)", color: "#fff" },
    pink: { background: S.gradPink, color: "#fff" },
    outline: { background: "transparent", color: S.neonBlue, border: `1px solid ${S.neonBlue}` },
  };
  return <button onClick={disabled ? undefined : onClick} style={{ ...base, ...v[variant] }}>{children}</button>;
};

const Card = ({ children, style = {}, glow, onClick }) => (
  <div onClick={onClick} style={{
    background: S.glass, borderRadius: 20, padding: 16,
    border: `1px solid rgba(255,255,255,${glow ? 0.2 : 0.07})`,
    backdropFilter: "blur(12px)", cursor: onClick ? "pointer" : "default",
    boxShadow: glow ? `0 0 20px ${S.neonBlue}33` : "0 4px 16px rgba(0,0,0,0.3)", ...style,
  }}>{children}</div>
);

const Badge = ({ label, color = S.neonBlue }) => (
  <span style={{ background: `${color}22`, color, border: `1px solid ${color}44`, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{label}</span>
);

const Input = ({ label, placeholder, value, onChange, type = "text", icon, readOnly }) => (
  <div style={{ marginBottom: 14 }}>
    {label && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 6, fontWeight: 600 }}>{label}</div>}
    <div style={{ position: "relative" }}>
      {icon && <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 18 }}>{icon}</span>}
      <input
        type={type} placeholder={placeholder} value={value}
        onChange={e => onChange && onChange(e.target.value)}
        readOnly={readOnly}
        style={{
          width: "100%", background: readOnly ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12,
          padding: icon ? "13px 14px 13px 44px" : "13px 14px",
          color: "#fff", fontSize: 15, outline: "none", boxSizing: "border-box",
        }}
        onFocus={e => !readOnly && (e.target.style.borderColor = S.neonBlue)}
        onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.12)"}
      />
    </div>
  </div>
);

const Modal = ({ open, onClose, title, children }) => {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center", backdropFilter: "blur(4px)" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#13132e", borderRadius: "24px 24px 0 0", width: "100%", maxWidth: 430, maxHeight: "92vh", overflow: "auto", padding: 24, border: "1px solid rgba(255,255,255,0.1)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{title}</div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", borderRadius: 50, width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
};

const Toast = ({ msg, type }) => {
  if (!msg) return null;
  const bg = type === "success" ? "rgba(0,255,136,0.15)" : type === "error" ? "rgba(255,61,154,0.15)" : "rgba(0,212,255,0.15)";
  const border = type === "success" ? S.neonGreen : type === "error" ? S.neonPink : S.neonBlue;
  return (
    <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", zIndex: 9999, background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: "12px 22px", color: "#fff", fontWeight: 700, fontSize: 14, backdropFilter: "blur(10px)", maxWidth: 360, textAlign: "center", whiteSpace: "pre-wrap" }}>
      {msg}
    </div>
  );
};

const Spinner = () => (
  <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
    <div style={{ width: 36, height: 36, border: `3px solid rgba(0,212,255,0.2)`, borderTop: `3px solid ${S.neonBlue}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
  </div>
);

const TopBar = ({ title, onBack, right }) => (
  <div style={{ display: "flex", alignItems: "center", padding: "16px 20px", gap: 12, background: "rgba(10,10,26,0.95)", backdropFilter: "blur(10px)", position: "sticky", top: 0, zIndex: 100 }}>
    {onBack && <button onClick={onBack} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "#fff", borderRadius: 50, width: 36, height: 36, cursor: "pointer", fontSize: 18 }}>←</button>}
    <div style={{ flex: 1, fontSize: 18, fontWeight: 800 }}>{title}</div>
    {right}
  </div>
);

const DiamondChip = ({ amount }) => (
  <span style={{ background: S.gradBlue, borderRadius: 50, fontWeight: 800, color: "#fff", display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 12px", fontSize: 14, boxShadow: "0 2px 12px rgba(0,212,255,0.3)" }}>
    💎 {fmt(amount)}
  </span>
);

const ProgressBar = ({ value, max, color = S.neonBlue }) => (
  <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 99, height: 7, overflow: "hidden" }}>
    <div style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: color, height: "100%", borderRadius: 99, transition: "width 0.4s" }} />
  </div>
);

// ─── BOTTOM NAV ───────────────────────────────────────────────────────────────
const BottomNav = ({ page, setPage, isAdmin }) => {
  const adminItems = [
    { id: "admin",          label: "Overview", icon: "📊" },
    { id: "admin_games",    label: "Games",    icon: "🎮" },
    { id: "admin_users",    label: "Users",    icon: "👥" },
    { id: "admin_deposits", label: "Deposits", icon: "💵" },
    { id: "admin_withdraw", label: "Payouts",  icon: "💰" },
    { id: "admin_config",   label: "Settings", icon: "⚙️" },
  ];
  const userItems = [
    { id: "home",        label: "Home",    icon: "🏠" },
    { id: "games",       label: "Games",   icon: "🎮" },
    { id: "wallet",      label: "Wallet",  icon: "💼" },
    { id: "leaderboard", label: "Top",     icon: "🏆" },
    { id: "profile",     label: "Profile", icon: "👤" },
  ];
  const items = isAdmin ? adminItems : userItems;
  return (
    <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, background: "rgba(8,8,20,0.98)", borderTop: "1px solid rgba(255,255,255,0.1)", display: "flex", backdropFilter: "blur(24px)", zIndex: 200 }}>
      {items.map(item => {
        const active = page === item.id;
        return (
          <button key={item.id} onClick={() => setPage(item.id)} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "10px 4px 12px", transition: "all 0.18s" }}>
            <div style={{ width: 38, height: 34, borderRadius: 10, background: active ? "rgba(0,212,255,0.14)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 21, transition: "all 0.18s" }}>
              {item.icon}
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: active ? S.neonBlue : "rgba(255,255,255,0.38)", transition: "color 0.18s" }}>{item.label}</span>
            {active && <div style={{ width: 20, height: 2.5, background: S.neonBlue, borderRadius: 99, marginTop: 1 }} />}
          </button>
        );
      })}
    </div>
  );
};

// ─── LANDING PAGE ─────────────────────────────────────────────────────────────
const LandingPage = ({ setPage, setAuthMode }) => {
  const cfg = DB.get("dp_platform_config") || {};
  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(ellipse at 50% 0%,#1a0a3e 0%,#0a0a1a 70%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", width: 220, height: 220, borderRadius: "50%", background: "radial-gradient(#b537f233,transparent)", top: "5%", left: "50%", transform: "translateX(-50%)" }} />
      <div style={{ textAlign: "center", position: "relative", zIndex: 1, width: "100%" }}>
        <div style={{ fontSize: 80, marginBottom: 8, filter: "drop-shadow(0 0 24px #b537f2)" }}>💎</div>
        <div style={{ fontSize: 34, fontWeight: 900, background: S.gradBlue, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: 4 }}>{cfg.siteName || "DiamondPlay"}</div>
        <div style={{ color: S.neonGold, fontSize: 13, fontWeight: 700, letterSpacing: 3, marginBottom: 8 }}>PLAY • WIN • EARN</div>
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, maxWidth: 280, margin: "0 auto 32px" }}>India's most exciting Diamond gaming platform. Real rewards every day!</div>
        {cfg.bannerText && (
          <div style={{ background: "rgba(255,215,0,0.1)", border: "1px solid rgba(255,215,0,0.3)", borderRadius: 12, padding: "10px 16px", marginBottom: 24, fontSize: 13, color: S.neonGold, fontWeight: 600 }}>{cfg.bannerText}</div>
        )}
        <Btn full onClick={() => { setAuthMode("register"); setPage("auth"); }} style={{ marginBottom: 12 }}>💎 Start Playing Free</Btn>
        <Btn full variant="ghost" onClick={() => { setAuthMode("login"); setPage("auth"); }}>Already have account? Login</Btn>
        <div style={{ marginTop: 16, color: "rgba(255,255,255,0.25)", fontSize: 11 }}>By continuing you agree to our Terms & Privacy Policy</div>
      </div>
    </div>
  );
};

// ─── OTP GATEWAY (SMS Verification) ───────────────────────────────────────────
// 🔌 TO GO LIVE WITH REAL SMS:
//   1. Deploy the backend from the "otp-backend" folder (Twilio Verify server)
//      — see its README.md for exact steps.
//   2. Paste your deployed backend's URL below. That's the ONLY change needed.
//      Leaving it blank keeps DEMO MODE running (OTP shown in a toast, no real
//      SMS) so you can keep testing locally without a backend.
const OTP_BACKEND_URL = ""; // e.g. "https://diamondplay-otp.onrender.com"

const OTP_LENGTH = 6;
const OTP_VALID_MS = 5 * 60 * 1000; // 5 minutes (demo mode only)
const OTP_RESEND_SECONDS = 45;

const sendOtpGateway = async (phone) => {
  if (!OTP_BACKEND_URL) {
    // ── DEMO MODE: no backend configured yet ──
    await sleep(900);
    const code = String(rnd(0, 999999)).padStart(OTP_LENGTH, "0");
    DB.set(`dp_otp_${phone}`, { code, expires: Date.now() + OTP_VALID_MS, attempts: 0 });
    return { success: true, demoCode: code };
  }
  // ── REAL MODE: ask your backend to send a real SMS via Twilio ──
  try {
    const res = await fetch(`${OTP_BACKEND_URL}/api/otp/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    const data = await res.json();
    return { success: !!data.success, reason: data.reason, demoCode: null };
  } catch (err) {
    return { success: false, reason: "Network error contacting OTP server" };
  }
};

const verifyOtpGateway = async (phone, entered) => {
  if (!OTP_BACKEND_URL) {
    // ── DEMO MODE ──
    await sleep(500);
    const rec = DB.get(`dp_otp_${phone}`);
    if (!rec) return { success: false, reason: "No OTP requested. Please resend." };
    if (Date.now() > rec.expires) { DB.del(`dp_otp_${phone}`); return { success: false, reason: "OTP expired. Please resend." }; }
    if (rec.attempts >= 5) { DB.del(`dp_otp_${phone}`); return { success: false, reason: "Too many attempts. Please resend." }; }
    if (rec.code !== entered) {
      DB.set(`dp_otp_${phone}`, { ...rec, attempts: rec.attempts + 1 });
      return { success: false, reason: "Incorrect OTP. Try again." };
    }
    DB.del(`dp_otp_${phone}`);
    return { success: true };
  }
  // ── REAL MODE: ask your backend to verify with Twilio ──
  try {
    const res = await fetch(`${OTP_BACKEND_URL}/api/otp/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, code: entered }),
    });
    const data = await res.json();
    return data.success ? { success: true } : { success: false, reason: data.reason || "Incorrect OTP. Try again." };
  } catch (err) {
    return { success: false, reason: "Network error contacting OTP server" };
  }
};

// ─── OTP INPUT (animated 6-box entry) ─────────────────────────────────────────
const OTPInput = ({ length = OTP_LENGTH, value, onChange, error, shakeKey, success }) => {
  const refs = useRef([]);
  const digits = value.split("");
  useEffect(() => { if (refs.current[0]) refs.current[0].focus(); }, []);

  const setDigit = (i, raw) => {
    const d = raw.replace(/\D/g, "");
    if (!d) {
      const next = value.split(""); next[i] = ""; onChange(next.join("").slice(0, length));
      return;
    }
    // supports typing/pasting multiple digits starting at box i
    const next = value.split("");
    for (let k = 0; k < d.length && i + k < length; k++) next[i + k] = d[k];
    const joined = next.join("").slice(0, length);
    onChange(joined);
    const landing = Math.min(i + d.length, length - 1);
    if (refs.current[landing]) refs.current[landing].focus();
  };

  const handleKeyDown = (i, e) => {
    if (e.key === "Backspace" && !digits[i] && i > 0 && refs.current[i - 1]) {
      refs.current[i - 1].focus();
    }
  };

  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 14, animation: shakeKey ? "otpShake 0.4s" : undefined }} key={shakeKey}>
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={el => (refs.current[i] = el)}
          type="tel" inputMode="numeric" maxLength={length}
          value={digits[i] || ""}
          disabled={success}
          onChange={e => setDigit(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          style={{
            width: 42, height: 52, textAlign: "center", fontSize: 21, fontWeight: 800,
            background: success ? "rgba(0,255,136,0.12)" : "rgba(255,255,255,0.06)",
            border: `1.5px solid ${success ? S.neonGreen : error ? "#ff6b6b" : digits[i] ? S.neonBlue : "rgba(255,255,255,0.15)"}`,
            borderRadius: 12, color: "#fff", outline: "none", boxSizing: "border-box",
            animation: digits[i] && !success ? "otpPop 0.18s ease" : undefined,
            transition: "border-color 0.2s, background 0.2s",
          }}
        />
      ))}
    </div>
  );
};

// ─── AUTH PAGE (Login / Register with CAPTCHA) ────────────────────────────────
const AuthPage = ({ mode, setUser, setPage, showToast }) => {
  const [step, setStep] = useState("phone");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [referral, setReferral] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isAdminSignup, setIsAdminSignup] = useState(false);
  const isRegister = mode === "register";
  const cfg = DB.get("dp_platform_config") || {};

  // ── OTP state ──
  const [otpValue, setOtpValue] = useState("");
  const [otpError, setOtpError] = useState("");
  const [otpShakeKey, setOtpShakeKey] = useState(0);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const resendTimerRef = useRef(null);

  useEffect(() => () => { if (resendTimerRef.current) clearInterval(resendTimerRef.current); }, []);

  const startResendTimer = () => {
    setResendIn(OTP_RESEND_SECONDS);
    if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    resendTimerRef.current = setInterval(() => {
      setResendIn(s => {
        if (s <= 1) { clearInterval(resendTimerRef.current); return 0; }
        return s - 1;
      });
    }, 1000);
  };

  const handlePhoneSubmit = async () => {
    if (phone.length !== 10) { setError("Enter valid 10-digit number"); return; }
    const users = DB.get("dp_users") || [];
    const existing = users.find(u => u.phone === phone);
    if (!isRegister && !existing) { setError("No account found. Please register."); return; }
    if (isRegister && existing) { setError("Account already exists. Please login."); return; }
    setError("");
    await sendOtp();
  };

  const sendOtp = async () => {
    setOtpSending(true);
    setOtpError(""); setOtpValue(""); setOtpVerified(false);
    const res = await sendOtpGateway(phone);
    setOtpSending(false);
    if (res.success) {
      setStep("otp");
      startResendTimer();
      showToast(
        res.demoCode
          ? `📩 DEMO MODE — no real SMS sent. Your OTP is ${res.demoCode} (set OTP_BACKEND_URL to send real SMS)`
          : `📩 OTP sent to +91 ${phone}`,
        "info"
      );
    } else {
      showToast(res.reason || "Couldn't send OTP. Please try again.", "error");
    }
  };

  const handleResend = async () => {
    if (resendIn > 0) return;
    await sendOtp();
  };

  const verifyOtp = async () => {
    if (otpValue.length !== OTP_LENGTH) return;
    setOtpVerifying(true);
    const res = await verifyOtpGateway(phone, otpValue);
    setOtpVerifying(false);
    if (!res.success) {
      setOtpError(res.reason);
      setOtpShakeKey(k => k + 1);
      setOtpValue("");
      return;
    }
    setOtpError("");
    setOtpVerified(true);
    if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    await sleep(700); // let the success animation play
    if (isRegister) {
      setStep("name");
    } else {
      finishLogin();
    }
  };

  // auto-verify once all 6 digits are entered
  useEffect(() => {
    if (step === "otp" && otpValue.length === OTP_LENGTH && !otpVerifying && !otpVerified) {
      verifyOtp();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otpValue]);

  const finishLogin = () => {
    const users = DB.get("dp_users") || [];
    const existing = users.find(u => u.phone === phone);
    const user = existing;
    const updated = users.map(u => u.phone === phone ? { ...u, lastLogin: new Date().toISOString() } : u);
    DB.set("dp_users", updated);
    DB.set("dp_session", { userId: user.id, loginTime: new Date().toISOString() });
    pushAdminAlert("login", { userName: user.name, phone: user.phone, time: new Date().toISOString() });
    setUser({ ...user, lastLogin: new Date().toISOString() });
    setPage(user.isAdmin ? "admin" : "home");
  };

  const completeRegister = async () => {
    if (!name.trim()) { setError("Enter your name"); return; }
    if (name.trim().length < 3) { setError("Name must be at least 3 characters"); return; }
    setLoading(true);
    await sleep(800);
    const users = DB.get("dp_users") || [];
    const refCode = `${name.toUpperCase().replace(/\s/g, "").slice(0, 5)}${rnd(10, 99)}`;
    // Check referral
    const referrer = referral ? users.find(u => u.referralCode === referral.toUpperCase()) : null;
    const welcomeBonus = cfg.welcomeBonus || 50;
    const newUser = {
      id: uid(), name: name.trim(), phone, email: "",
      password: "", diamonds: welcomeBonus,
      referralCode: refCode,
      referredBy: referrer ? referral.toUpperCase() : null,
      totalDeposited: 0, totalWithdrawn: 0, gamesPlayed: 0,
      joinedAt: new Date().toISOString(), isAdmin: isAdminSignup,
      lastLogin: new Date().toISOString(), phoneVerified: true,
      isAgent: false, commissionPaid: 0, customCommissionPercent: null,
    };
    DB.set("dp_users", [...users, newUser]);
    // Give referrer bonus
    if (referrer) {
      const updatedUsers = DB.get("dp_users").map(u =>
        u.id === referrer.id ? { ...u, diamonds: u.diamonds + 30 } : u
      );
      DB.set("dp_users", updatedUsers);
    }
    // Log transaction
    const txns = DB.get("dp_transactions") || [];
    DB.set("dp_transactions", [{ id: tid(), userId: newUser.id, type: "bonus", amount: 0, diamonds: welcomeBonus, status: "success", date: new Date().toISOString(), method: "system", note: "Welcome Bonus" }, ...txns]);
    DB.set("dp_session", { userId: newUser.id, loginTime: new Date().toISOString() });
    pushAdminAlert("new_user", { userName: newUser.name, phone: newUser.phone, time: new Date().toISOString() });
    setLoading(false);
    setUser(newUser);
    setPage(newUser.isAdmin ? "admin" : "home");
    showToast(`Welcome ${newUser.name}! 💎 ${welcomeBonus} Diamonds credited!`, "success");
  };

  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(ellipse at 50% 0%,#1a0a3e,#0a0a1a)", display: "flex", flexDirection: "column", padding: 24, overflowY: "auto" }}>
      <button onClick={() => { if (step === "otp") { setStep("phone"); if (resendTimerRef.current) clearInterval(resendTimerRef.current); } else setPage("landing"); }} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 24, cursor: "pointer", alignSelf: "flex-start", marginBottom: 24 }}>←</button>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 28, fontWeight: 900, marginBottom: 6 }}>
          {step === "phone" && (isRegister ? "Create Account 🚀" : "Welcome Back 👋")}
          {step === "otp" && "Verify Your Number 🔐"}
          {step === "name" && "Almost Done! 🎉"}
        </div>
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>
          {step === "phone" && (isRegister ? "Register with your mobile number" : "Login with your mobile number")}
          {step === "otp" && `Enter the 6-digit code sent to +91 ${phone}`}
          {step === "name" && "Enter your name to complete registration"}
        </div>
      </div>

      {step === "phone" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "13px 14px", marginBottom: 14 }}>
            <span style={{ color: "rgba(255,255,255,0.6)", fontWeight: 600 }}>🇮🇳 +91</span>
            <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.15)" }} />
            <input type="tel" placeholder="Mobile Number" value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              style={{ flex: 1, background: "none", border: "none", color: "#fff", fontSize: 16, outline: "none" }} />
          </div>

          {error && <div style={{ color: "#ff6b6b", fontSize: 13, marginBottom: 10 }}>{error}</div>}

          <Btn
            full
            onClick={handlePhoneSubmit}
            disabled={otpSending || phone.length !== 10}
          >
            {otpSending ? "Sending OTP..." : "Send OTP →"}
          </Btn>
        </>
      )}

      {step === "otp" && (
        <div style={{ animation: "resultSlide 0.35s ease" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
            <div style={{
              width: 72, height: 72, borderRadius: "50%",
              background: otpVerified ? "rgba(0,255,136,0.12)" : "rgba(0,212,255,0.1)",
              border: `1.5px solid ${otpVerified ? S.neonGreen : S.neonBlue}44`,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32,
              animation: otpVerified ? "otpPop 0.35s ease" : "pulse 1.8s infinite",
            }}>
              {otpVerified ? "✅" : "📲"}
            </div>
          </div>

          <OTPInput value={otpValue} onChange={setOtpValue} error={!!otpError} shakeKey={otpShakeKey} success={otpVerified} />

          {otpVerifying && <div style={{ textAlign: "center", color: "rgba(255,255,255,0.5)", fontSize: 13, marginBottom: 10 }}>Verifying…</div>}
          {otpError && !otpVerifying && <div style={{ textAlign: "center", color: "#ff6b6b", fontSize: 13, marginBottom: 10, fontWeight: 600 }}>⚠️ {otpError}</div>}
          {otpVerified && <div style={{ textAlign: "center", color: S.neonGreen, fontSize: 13, marginBottom: 10, fontWeight: 700 }}>Verified! Redirecting…</div>}

          <div style={{ textAlign: "center", marginBottom: 18 }}>
            {resendIn > 0 ? (
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Resend OTP in {resendIn}s</span>
            ) : (
              <button onClick={handleResend} disabled={otpSending} style={{ background: "none", border: "none", color: S.neonBlue, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                {otpSending ? "Resending…" : "🔄 Resend OTP"}
              </button>
            )}
          </div>

          <Btn full onClick={verifyOtp} disabled={otpValue.length !== OTP_LENGTH || otpVerifying || otpVerified}>
            {otpVerifying ? "Verifying..." : otpVerified ? "Verified ✓" : "Verify OTP →"}
          </Btn>
        </div>
      )}

      {step === "name" && (
        <>
          <Input label="Full Name" placeholder="Your full name" value={name} onChange={setName} icon="👤" />
          <Input label="Referral Code (optional)" placeholder="Friend's code for 50💎 bonus" value={referral} onChange={setReferral} icon="🎁" />
          
          {/* Admin Signup Toggle */}
          <div style={{ display: "flex", alignItems: "center", background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: "12px 14px", marginBottom: 14, cursor: "pointer" }} onClick={() => setIsAdminSignup(!isAdminSignup)}>
            <input type="checkbox" checked={isAdminSignup} onChange={() => {}} style={{ cursor: "pointer", width: 18, height: 18 }} />
            <label style={{ marginLeft: 10, flex: 1, cursor: "pointer", fontWeight: 600 }}>
              🔑 Admin Account
            </label>
          </div>
          {isAdminSignup && (
            <div style={{ background: "rgba(255,215,0,0.1)", border: "1px solid rgba(255,215,0,0.3)", borderRadius: 12, padding: 12, marginBottom: 14, fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
              ⚠️ Admin accounts have full platform access and cannot be created casually. Use wisely!
            </div>
          )}
          
          {error && <div style={{ color: "#ff6b6b", fontSize: 13, marginBottom: 10 }}>{error}</div>}
          <Btn full onClick={completeRegister} disabled={loading}>{loading ? "Creating..." : "🎉 Start Playing!"}</Btn>
          <Card style={{ marginTop: 16, textAlign: "center" }}>
            <div style={{ color: S.neonGold, fontWeight: 700 }}>🎁 Welcome Bonus!</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>Get {(DB.get("dp_platform_config") || {}).welcomeBonus || 50} FREE Diamonds on signup</div>
          </Card>
        </>
      )}
    </div>
  );
};

// ─── WEEKLY TOURNAMENT UTILS ──────────────────────────────────────────────────
const getTournamentInfo = () => {
  // Tournament resets every Monday 00:00 IST
  const now = new Date();
  const day = now.getDay(); // 0=Sun,1=Mon...
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  const endDate = new Date(now);
  endDate.setDate(now.getDate() + daysUntilMonday);
  endDate.setHours(0, 0, 0, 0);
  const msLeft = endDate - now;
  const daysLeft = Math.floor(msLeft / (1000 * 60 * 60 * 24));
  const hoursLeft = Math.floor((msLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minsLeft = Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60));
  return { daysLeft, hoursLeft, minsLeft, msLeft };
};

const TOURNAMENT_PRIZES = [
  { rank: 1, label: "🥇 1st Place",  prize: 5000,  color: "#ffd700" },
  { rank: 2, label: "🥈 2nd Place",  prize: 2500,  color: "#c0c0c0" },
  { rank: 3, label: "🥉 3rd Place",  prize: 1000,  color: "#cd7f32" },
  { rank: 4, label: "4th–5th",       prize: 500,   color: S.neonBlue },
  { rank: 6, label: "6th–10th",      prize: 200,   color: S.neonPurple },
];

// ─── HOME PAGE ────────────────────────────────────────────────────────────────
const HomePage = ({ user, setUser, setPage, setNotifOpen, notifications }) => {
  const [bannerIdx, setBannerIdx] = useState(0);
  const [tourTime, setTourTime] = useState(getTournamentInfo());
  const cfg = DB.get("dp_platform_config") || {};

  const banners = [
    { bg: S.gradBlue,   emoji: "💎", title: "Buy Diamonds",      sub: cfg.bannerText || "Get bonus diamonds on top-up!", action: () => setPage("buy") },
    { bg: S.gradGold,   emoji: "🏆", title: "Weekly Tournament", sub: "Play games • Climb ranks • Win big prizes!", action: () => setPage("leaderboard") },
    { bg: S.gradPink,   emoji: "🎮", title: "New: Color Predict", sub: "30-sec rounds · Live results · Win 4.5x!", action: () => setPage("game_color") },
  ];

  useEffect(() => {
    const bi = setInterval(() => setBannerIdx(b => (b + 1) % banners.length), 3500);
    // Update tournament countdown every minute
    const ti = setInterval(() => setTourTime(getTournamentInfo()), 60000);
    return () => { clearInterval(bi); clearInterval(ti); };
  }, []);

  const games = [
    { id: "color",   name: "Color Predict", emoji: "🎨", cost: cfg.gameCost || 5,    hot: true  },
    { id: "dice",    name: "Dice Roll",      emoji: "🎲", cost: cfg.gameCost || 5,    hot: false },
    { id: "number",  name: "Number Pick",    emoji: "🔢", cost: cfg.gameCost || 5,    hot: false },
    { id: "scratch", name: "Scratch Card",   emoji: "🃏", cost: cfg.scratchCost || 10, hot: true },
  ];

  const unread = notifications.filter(n => !n.read).length;
  const freshUser = (DB.get("dp_users") || []).find(u => u.id === user.id) || user;
  const txns = (DB.get("dp_transactions") || []).filter(t => t.userId === user.id);

  // Live leaderboard for tournament widget
  const topPlayers = (DB.get("dp_users") || [])
    .filter(u => !u.isAdmin)
    .sort((a, b) => b.gamesPlayed - a.gamesPlayed)
    .slice(0, 5);
  const myTourneyRank = (DB.get("dp_users") || [])
    .filter(u => !u.isAdmin)
    .sort((a, b) => b.gamesPlayed - a.gamesPlayed)
    .findIndex(u => u.id === user.id) + 1;

  return (
    <div style={S.page}>
      {/* ── HEADER */}
      <div style={{ background: "linear-gradient(180deg,#13132e,transparent)", padding: "16px 20px 10px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Welcome back 👋</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{freshUser.name.split(" ")[0]}</div>
          </div>
          <button onClick={() => setNotifOpen(true)} style={{ position: "relative", background: "rgba(255,255,255,0.08)", border: "none", color: "#fff", borderRadius: 50, width: 40, height: 40, cursor: "pointer", fontSize: 18 }}>
            🔔
            {unread > 0 && <span style={{ position: "absolute", top: 4, right: 4, background: "#ff3d9a", borderRadius: "50%", width: 14, height: 14, fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>{unread}</span>}
          </button>
        </div>

        {/* Balance Card */}
        <Card glow style={{ marginTop: 14, background: "linear-gradient(135deg,rgba(0,212,255,0.12),rgba(181,55,242,0.12))" }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>Your Diamond Balance</div>
          <div style={{ fontSize: 36, fontWeight: 900, display: "flex", alignItems: "center", gap: 8 }}>
            💎 <span style={{ background: S.gradBlue, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{fmt(freshUser.diamonds)}</span>
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 14 }}>≈ {fmtINR(Math.floor(freshUser.diamonds * 0.9))} cashout value</div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="gold" sm onClick={() => setPage("buy")}>+ Buy</Btn>
            <Btn variant="ghost" sm onClick={() => setPage("wallet")}>💳 Wallet</Btn>
            <Btn variant="ghost" sm onClick={() => setPage("profile")}>↗ Withdraw</Btn>
          </div>
        </Card>
      </div>

      {/* ── BANNER CAROUSEL */}
      <div style={{ padding: "8px 20px" }}>
        <div style={{ borderRadius: 18, overflow: "hidden", position: "relative", height: 110 }}>
          {banners.map((b, i) => (
            <div key={i} onClick={b.action} style={{ position: "absolute", inset: 0, background: b.bg, padding: "18px 20px", display: "flex", alignItems: "center", gap: 16, cursor: "pointer", transition: "opacity 0.5s", opacity: i === bannerIdx ? 1 : 0 }}>
              <div style={{ fontSize: 44 }}>{b.emoji}</div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{b.title}</div>
                <div style={{ fontSize: 13, opacity: 0.8 }}>{b.sub}</div>
              </div>
            </div>
          ))}
          <div style={{ position: "absolute", bottom: 10, right: 14, display: "flex", gap: 4 }}>
            {banners.map((_, i) => <div key={i} style={{ width: i === bannerIdx ? 16 : 5, height: 5, borderRadius: 99, background: "rgba(255,255,255,0.8)", transition: "width 0.3s" }} />)}
          </div>
        </div>
      </div>

      {/* ── QUICK STATS */}
      <div style={{ padding: "8px 20px" }}>
        <div style={{ display: "flex", gap: 8 }}>
          {[["Games", freshUser.gamesPlayed], ["Transactions", txns.length], ["Rank", myTourneyRank ? `#${myTourneyRank}` : "—"]].map(([l, v]) => (
            <Card key={l} style={{ flex: 1, textAlign: "center", padding: 10 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: S.neonBlue }}>{v}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>{l}</div>
            </Card>
          ))}
        </div>
      </div>

      {/* ── GAMES */}
      <div style={{ padding: "8px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>🎮 Mini Games</div>
          <span style={{ color: S.neonBlue, fontSize: 13, cursor: "pointer" }} onClick={() => setPage("games")}>See all →</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {games.map(g => (
            <Card key={g.id} onClick={() => setPage(`game_${g.id}`)} style={{ textAlign: "center", padding: 18, position: "relative", cursor: "pointer" }}>
              {g.hot && <div style={{ position: "absolute", top: 10, right: 10, background: S.gradPink, borderRadius: 6, padding: "2px 7px", fontSize: 10, fontWeight: 700 }}>🔥 HOT</div>}
              <div style={{ fontSize: 38, marginBottom: 8 }}>{g.emoji}</div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{g.name}</div>
              <div style={{ fontSize: 12, color: S.neonBlue, marginTop: 4 }}>💎 {g.cost} to play</div>
            </Card>
          ))}
        </div>
      </div>

      {/* ── WEEKLY TOURNAMENT WIDGET */}
      <div style={{ padding: "8px 20px 24px" }}>
        <Card onClick={() => setPage("leaderboard")} glow style={{
          background: "linear-gradient(135deg,rgba(255,215,0,0.08),rgba(255,107,53,0.06))",
          border: "1px solid rgba(255,215,0,0.3)",
          cursor: "pointer",
        }}>
          {/* Header row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 22 }}>🏆</span>
                <span style={{ fontSize: 17, fontWeight: 900, background: S.gradGold, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Weekly Tournament</span>
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Play more games • Climb the leaderboard • Win big!</div>
            </div>
            <div style={{ background: "rgba(255,215,0,0.12)", border: "1px solid rgba(255,215,0,0.3)", borderRadius: 10, padding: "6px 10px", textAlign: "center", flexShrink: 0 }}>
              <div style={{ fontSize: 9, color: "#ffd700", fontWeight: 700, letterSpacing: 1 }}>ENDS IN</div>
              <div style={{ fontSize: 14, fontWeight: 900, color: "#ffd700" }}>
                {tourTime.daysLeft > 0 ? `${tourTime.daysLeft}d ${tourTime.hoursLeft}h` : `${tourTime.hoursLeft}h ${tourTime.minsLeft}m`}
              </div>
            </div>
          </div>

          {/* Prize pool preview */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {(cfg.tournamentPrizes && cfg.tournamentPrizes.length ? cfg.tournamentPrizes : TOURNAMENT_PRIZES.map(p => ({ ...p, active: true })))
              .filter(p => p.active !== false && p.rank <= 3)
              .map(p => (
              <div key={p.rank} style={{ flex: 1, textAlign: "center", background: "rgba(0,0,0,0.25)", borderRadius: 10, padding: "8px 4px" }}>
                <div style={{ fontSize: 18 }}>{["🥇", "🥈", "🥉"][p.rank - 1]}</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: p.color, marginTop: 2 }}>{fmt(p.prize)}💎</div>
              </div>
            ))}
          </div>

          {/* Live top 3 or user rank */}
          {topPlayers.length > 0 ? (
            <div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 700, marginBottom: 8, letterSpacing: 1 }}>LIVE STANDINGS</div>
              {topPlayers.slice(0, 3).map((p, i) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <div style={{ fontSize: 14, width: 20 }}>{["🥇","🥈","🥉"][i]}</div>
                  <div style={{ flex: 1, fontSize: 13, fontWeight: p.id === user.id ? 800 : 600, color: p.id === user.id ? S.neonBlue : "#fff" }}>
                    {p.name.split(" ")[0]}{p.id === user.id ? " (You)" : ""}
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: 700 }}>{p.gamesPlayed} games</div>
                </div>
              ))}
              {myTourneyRank > 3 && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>Your rank</span>
                  <span style={{ fontWeight: 800, color: S.neonBlue }}>#{myTourneyRank} — play more to move up!</span>
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.4)", padding: "8px 0" }}>
              Be the first to play and top the leaderboard! 🚀
            </div>
          )}

          <div style={{ marginTop: 12, textAlign: "right" }}>
            <span style={{ fontSize: 12, color: "#ffd700", fontWeight: 700 }}>View full leaderboard →</span>
          </div>
        </Card>
      </div>
    </div>
  );
};

// ─── GAMES PAGE ───────────────────────────────────────────────────────────────
const GamesPage = ({ setPage }) => {
  const cfg = DB.get("dp_platform_config") || {};
  const games = [
    { id: "color", name: "Color Prediction", emoji: "🎨", cost: cfg.gameCost || 5, desc: "Predict the next color and win 1.9x!", tag: "Popular" },
    { id: "dice", name: "Dice Roll", emoji: "🎲", cost: cfg.gameCost || 5, desc: "Roll the dice, pick your number!", tag: "Classic" },
    { id: "number", name: "Number Pick", emoji: "🔢", cost: cfg.gameCost || 5, desc: "Pick a number 1-10 and win big!", tag: "Easy" },
    { id: "scratch", name: "Scratch Card", emoji: "🃏", cost: cfg.scratchCost || 10, desc: "Scratch & reveal your prize!", tag: "Lucky" },
  ];
  return (
    <div style={S.page}>
      <TopBar title="🎮 Game Lobby" />
      <div style={{ padding: "12px 20px" }}>
        {games.map(g => (
          <Card key={g.id} onClick={() => setPage(`game_${g.id}`)} style={{ marginBottom: 12, cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ fontSize: 48 }}>{g.emoji}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{g.name}</div>
                  <Badge label={g.tag} />
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>{g.desc}</div>
                <DiamondChip amount={g.cost} />
              </div>
              <div style={{ fontSize: 24, color: "rgba(255,255,255,0.3)" }}>›</div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

// ─── GAME HELPERS ─────────────────────────────────────────────────────────────
const saveGameResult = (userId, diamonds, note) => {
  const users = DB.get("dp_users") || [];
  const updated = users.map(u => u.id === userId ? { ...u, diamonds: u.diamonds + diamonds, gamesPlayed: u.gamesPlayed + 1 } : u);
  DB.set("dp_users", updated);
  const txns = DB.get("dp_transactions") || [];
  DB.set("dp_transactions", [{ id: tid(), userId, type: diamonds > 0 ? "game_win" : "game_spend", amount: 0, diamonds, status: "success", date: new Date().toISOString(), method: "game", note }, ...txns]);
};

// ─── COLOR GAME UTILS ────────────────────────────────────────────────────────
const getWinningColor = () => {
  const cfg = DB.get("dp_platform_config") || {};
  if (cfg.forcedColor) {
    const color = cfg.forcedColor;
    DB.set("dp_platform_config", { ...cfg, forcedColor: null });
    return color;
  }
  const pool = ["red", "green", "red", "green", "violet", "red", "green"];
  return pool[Math.floor(Math.random() * pool.length)];
};

// ─── COLOR GAME ───────────────────────────────────────────────────────────────
const ROUND_DURATION = 30;
const RESULT_SHOW_DURATION = 7; // seconds to show result before next round

const ColorGame = ({ user, setUser, setPage, showToast }) => {
  const cfg = DB.get("dp_platform_config") || {};
  const COST = cfg.gameCost || 5;

  const colors = [
    { id: "red",    label: "Red",    bg: "linear-gradient(135deg,#ff3d3d,#ff6b6b)", mult: 2,   emoji: "🔴" },
    { id: "green",  label: "Green",  bg: "linear-gradient(135deg,#00c853,#00ff88)", mult: 2,   emoji: "🟢" },
    { id: "violet", label: "Violet", bg: "linear-gradient(135deg,#b537f2,#8b00ff)", mult: 4.5, emoji: "🟣" },
  ];
  const colorMap  = { red: "#ff4444", green: "#00c853", violet: "#b537f2" };
  const colorGlow = { red: "rgba(255,68,68,0.45)", green: "rgba(0,200,83,0.45)", violet: "rgba(181,55,242,0.45)" };

  // ── phase: "betting" | "revealing" | "result" | "next"
  const [phase,        setPhase]        = useState("betting");
  const [timer,        setTimer]        = useState(ROUND_DURATION);
  const [resultTimer,  setResultTimer]  = useState(RESULT_SHOW_DURATION);
  const [roundNum,     setRoundNum]     = useState(() => DB.get("dp_color_roundNum") || 1);
  const [bet,          setBet]          = useState(null);       // chosen color id
  const [betAmt,       setBetAmt]       = useState(COST);      // how many diamonds bet
  const [betPlaced,    setBetPlaced]    = useState(false);
  const [lastWin,      setLastWin]      = useState(null);
  const [roundResult,  setRoundResult]  = useState(null);      // { win, userBet, prize, isWin }
  const [roundHistory, setRoundHistory] = useState(() => DB.get("dp_color_history") || []);
  const [animBall,     setAnimBall]     = useState(false);
  const [confetti,     setConfetti]     = useState(false);

  const timerRef       = useRef(null);
  const resultTimerRef = useRef(null);
  const betRef         = useRef(bet);
  const betAmtRef      = useRef(betAmt);
  const betPlacedRef   = useRef(betPlaced);
  const userRef        = useRef(user);

  useEffect(() => { betRef.current = bet; },       [bet]);
  useEffect(() => { betAmtRef.current = betAmt; }, [betAmt]);
  useEffect(() => { betPlacedRef.current = betPlaced; }, [betPlaced]);
  useEffect(() => { userRef.current = user; },     [user]);

  // ── Start betting phase
  const startBettingPhase = () => {
    clearInterval(timerRef.current);
    clearInterval(resultTimerRef.current);
    setPhase("betting");
    setBetPlaced(false);
    setBet(null);
    setRoundResult(null);
    setLastWin(null);
    setAnimBall(false);
    setConfetti(false);
    setTimer(ROUND_DURATION);

    timerRef.current = setInterval(() => {
      setTimer(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          triggerReveal();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // ── Reveal phase (2 sec animation → show result)
  const triggerReveal = () => {
    setPhase("revealing");
    setAnimBall(true);
    setTimeout(() => {
      const win     = getWinningColor();
      const rNum    = (DB.get("dp_color_roundNum") || 1);
      const nextNum = rNum + 1;
      DB.set("dp_color_roundNum", nextNum);
      setRoundNum(nextNum);

      // Build history entry with user's bet info
      const userBetNow   = betRef.current;
      const betAmtNow    = betAmtRef.current;
      const betPlacedNow = betPlacedRef.current;
      let prize = 0;
      let isWin = false;

      if (betPlacedNow && userBetNow) {
        const col = colors.find(c => c.id === win);
        if (win === userBetNow) {
          isWin = true;
          prize = Math.floor(betAmtNow * col.mult);
          saveGameResult(userRef.current.id, prize, `Color Win - ${win} @${col.mult}x`);
          setUser(u => ({ ...u, diamonds: u.diamonds + prize }));
        }
      }

      const histEntry = {
        round:    rNum,
        color:    win,
        time:     new Date().toISOString(),
        userBet:  betPlacedNow ? userBetNow : null,
        betAmt:   betPlacedNow ? betAmtNow  : 0,
        isWin,
        prize,
      };

      const hist    = DB.get("dp_color_history") || [];
      const newHist = [histEntry, ...hist].slice(0, 30);
      DB.set("dp_color_history", newHist);
      setRoundHistory(newHist);
      setLastWin(win);
      setRoundResult({ win, userBet: userBetNow, betPlaced: betPlacedNow, isWin, prize, betAmt: betAmtNow });
      setPhase("result");
      setAnimBall(false);
      if (isWin) setConfetti(true);

      // Countdown to next round
      setResultTimer(RESULT_SHOW_DURATION);
      let rt = RESULT_SHOW_DURATION;
      resultTimerRef.current = setInterval(() => {
        rt -= 1;
        setResultTimer(rt);
        if (rt <= 0) {
          clearInterval(resultTimerRef.current);
          startBettingPhase();
        }
      }, 1000);
    }, 2200);
  };

  // ── Init on mount
  useEffect(() => {
    startBettingPhase();
    return () => { clearInterval(timerRef.current); clearInterval(resultTimerRef.current); };
  }, []);

  const placeBet = (colorId) => {
    if (phase !== "betting") { showToast("Bets band ho gaye!", "error"); return; }
    if (betPlaced)           { showToast("Bet pehle se laga di hai!", "error"); return; }
    if (user.diamonds < betAmt) { showToast("Diamonds kam hain!", "error"); return; }
    setBet(colorId);
    setBetPlaced(true);
    saveGameResult(user.id, -betAmt, `Color Bet - ${colorId}`);
    setUser(u => ({ ...u, diamonds: u.diamonds - betAmt, gamesPlayed: u.gamesPlayed + 1 }));
    showToast(`✅ ${colorId.toUpperCase()} pe ${betAmt}💎 bet lagaya!`, "success");
  };

  const timerPct     = (timer / ROUND_DURATION) * 100;
  const timerColor   = timer <= 5 ? "#ff3d9a" : timer <= 10 ? "#ffd700" : S.neonGreen;
  const circumference = 2 * Math.PI * 48;

  // ── BET AMOUNT CHIPS
  const betOptions = [COST, COST*2, COST*5, COST*10, COST*20];

  return (
    <div style={S.page}>
      <TopBar title="🎨 Color Prediction" onBack={() => setPage("games")} right={<DiamondChip amount={user.diamonds} />} />

      {/* ── CONFETTI LAYER */}
      {confetti && (
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 999, overflow: "hidden" }}>
          {Array.from({ length: 22 }).map((_, i) => {
            const colors2 = ["#ff4444","#00c853","#b537f2","#ffd700","#00d4ff","#ff3d9a"];
            return (
              <div key={i} style={{
                position: "absolute",
                left:  `${10 + Math.random() * 80}%`,
                top:   `${20 + Math.random() * 40}%`,
                width:  6, height: 6, borderRadius: "50%",
                background: colors2[i % colors2.length],
                animation: `confettiFall${i % 3} 1.1s ease-out forwards`,
                animationDelay: `${Math.random() * 0.4}s`,
              }} />
            );
          })}
        </div>
      )}

      <div style={{ padding: "14px 18px 120px" }}>

        {/* ── ROUND NUMBER + STATUS BAR */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", fontWeight: 800, letterSpacing: 2 }}>
            ROUND #{String(roundNum).padStart(4, "0")}
          </div>
          {phase === "betting" && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(0,255,136,0.1)", border: "1px solid rgba(0,255,136,0.3)", borderRadius: 20, padding: "4px 14px" }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: S.neonGreen, animation: "pulse 1s infinite" }} />
              <span style={{ fontSize: 11, fontWeight: 800, color: S.neonGreen }}>LIVE · BET NOW</span>
            </div>
          )}
          {phase === "revealing" && (
            <div style={{ fontSize: 11, fontWeight: 800, color: "#ffd700", background: "rgba(255,215,0,0.1)", border: "1px solid rgba(255,215,0,0.3)", borderRadius: 20, padding: "4px 14px" }}>⏳ DRAWING...</div>
          )}
          {phase === "result" && (
            <div style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: "4px 14px" }}>
              Next round: {resultTimer}s
            </div>
          )}
        </div>

        {/* ── MAIN TIMER / RESULT CIRCLE */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
          <div style={{ position: "relative", width: 130, height: 130 }}>
            {/* Progress ring */}
            <svg width="130" height="130" style={{ transform: "rotate(-90deg)", position: "absolute", inset: 0 }}>
              <circle cx="65" cy="65" r="48" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
              <circle cx="65" cy="65" r="48" fill="none"
                stroke={
                  phase === "result"    ? colorMap[lastWin] || S.neonBlue :
                  phase === "revealing" ? "#ffd700" : timerColor
                }
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={
                  phase === "betting"   ? circumference * (1 - timerPct / 100) :
                  phase === "revealing" ? circumference * 0.6 :
                  phase === "result"    ? circumference * (1 - resultTimer / RESULT_SHOW_DURATION) : 0
                }
                style={{ transition: phase === "betting" ? "stroke-dashoffset 1s linear, stroke 0.3s" : "stroke 0.3s" }}
              />
            </svg>

            {/* Center content */}
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              {phase === "betting" && (
                <>
                  <div style={{ fontSize: 36, fontWeight: 900, color: timerColor, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                    {String(timer).padStart(2, "0")}
                  </div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", fontWeight: 700, marginTop: 3, letterSpacing: 1 }}>SECONDS</div>
                </>
              )}
              {phase === "revealing" && (
                <div style={{ fontSize: 38, animation: "spin 0.4s linear infinite" }}>🎲</div>
              )}
              {phase === "result" && lastWin && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{
                    width: 60, height: 60, borderRadius: "50%",
                    background: colorMap[lastWin],
                    boxShadow: `0 0 30px ${colorGlow[lastWin]}, 0 0 60px ${colorGlow[lastWin]}`,
                    animation: "pulse 0.6s ease-in-out 3",
                  }} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── RESULT CARD (shown when phase === result) */}
        {phase === "result" && roundResult && (
          <div style={{
            marginBottom: 16,
            borderRadius: 20,
            overflow: "hidden",
            border: `2px solid ${colorMap[roundResult.win]}55`,
            background: `linear-gradient(135deg, ${colorMap[roundResult.win]}12, rgba(0,0,0,0.4))`,
          }}>
            {/* Winner banner */}
            <div style={{
              background: colorMap[roundResult.win],
              padding: "10px 18px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                  {colors.find(c => c.id === roundResult.win)?.emoji}
                </div>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 18, color: "#fff" }}>{roundResult.win.toUpperCase()} WINS!</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>Round #{roundNum - 1}</div>
                </div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, color: "#fff" }}>
                {colors.find(c => c.id === roundResult.win)?.mult}x
              </div>
            </div>

            {/* User result */}
            <div style={{ padding: "14px 18px" }}>
              {!roundResult.betPlaced ? (
                <div style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 13, padding: "6px 0" }}>
                  Aapne is round mein bet nahi lagaya
                </div>
              ) : roundResult.isWin ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 700, color: S.neonGreen, fontSize: 15 }}>🎉 Aap Jeete!</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
                      {roundResult.userBet?.toUpperCase()} pe {roundResult.betAmt}💎 lagaya
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: S.neonGreen }}>+{roundResult.prize}💎</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                      {roundResult.betAmt}💎 × {colors.find(c=>c.id===roundResult.win)?.mult}x
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 700, color: "#ff6b6b", fontSize: 15 }}>😞 Haare</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
                      Aapne {roundResult.userBet?.toUpperCase()} pe bet lagaya tha
                    </div>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: "#ff6b6b" }}>-{roundResult.betAmt}💎</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── BET AMOUNT SELECTOR (show only during betting) */}
        {phase === "betting" && !betPlaced && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", marginBottom: 8, letterSpacing: 1 }}>BET AMOUNT</div>
            <div style={{ display: "flex", gap: 7 }}>
              {betOptions.map(amt => (
                <button key={amt} onClick={() => setBetAmt(amt)} style={{
                  flex: 1, padding: "9px 4px", borderRadius: 10,
                  background: betAmt === amt ? S.gradBlue : "rgba(255,255,255,0.06)",
                  border: `1px solid ${betAmt === amt ? S.neonBlue : "rgba(255,255,255,0.1)"}`,
                  color: betAmt === amt ? "#fff" : "rgba(255,255,255,0.6)",
                  fontWeight: 800, fontSize: 12, cursor: "pointer",
                  boxShadow: betAmt === amt ? `0 0 12px rgba(0,212,255,0.4)` : "none",
                }}>
                  {amt}💎
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── COLOR BET BUTTONS */}
        <div style={{ marginBottom: 6, fontSize: 11, color: "rgba(255,255,255,0.38)", fontWeight: 700, textAlign: "center", letterSpacing: 0.5 }}>
          {phase === "betting" && !betPlaced && "👇 Color choose karo — bet lagao"}
          {phase === "betting" && betPlaced && `✅ ${bet?.toUpperCase()} pe ${betAmt}💎 — result ka wait karo`}
          {phase === "revealing" && "🎲 Bets band — result aa raha hai..."}
          {phase === "result" && `⏳ Agla round ${resultTimer} second mein shuru hoga`}
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          {colors.map(c => {
            const isSelected = bet === c.id;
            const disabled   = phase !== "betting" || betPlaced;
            return (
              <button key={c.id}
                onClick={() => placeBet(c.id)}
                disabled={disabled}
                style={{
                  flex: 1, borderRadius: 16, padding: "14px 4px",
                  cursor: disabled ? "not-allowed" : "pointer",
                  background: isSelected ? c.bg : "rgba(255,255,255,0.06)",
                  border: `3px solid ${isSelected ? "#fff" : colorMap[c.id] + "55"}`,
                  color: isSelected ? "#fff" : colorMap[c.id],
                  fontWeight: 900, fontSize: 13,
                  boxShadow: isSelected ? `0 0 24px ${colorGlow[c.id]}, 0 0 8px ${colorMap[c.id]}` : "none",
                  opacity: disabled && !isSelected ? 0.38 : 1,
                  transition: "all 0.2s",
                  transform: isSelected ? "scale(1.04)" : "scale(1)",
                }}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>{c.emoji}</div>
                <div>{c.label}</div>
                <div style={{ fontSize: 11, opacity: 0.78, marginTop: 3 }}>{c.mult}x</div>
              </button>
            );
          })}
        </div>

        {/* ── ROUND HISTORY */}
        <Card style={{ marginTop: 6, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>📋 Round History</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontWeight: 700 }}>
              {roundHistory.length} rounds
            </div>
          </div>

          {/* Quick color dot strip */}
          {roundHistory.length > 0 && (
            <div style={{ display: "flex", gap: 5, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
              {roundHistory.slice(0, 20).map((h, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flexShrink: 0 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: colorMap[h.color],
                    boxShadow: `0 0 8px ${colorGlow[h.color]}`,
                    border: h.userBet === h.color ? "2px solid #fff" : h.userBet ? "2px solid #ff6b6b" : "2px solid transparent",
                  }} />
                  <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", fontWeight: 700 }}>#{h.round}</div>
                </div>
              ))}
            </div>
          )}

          {roundHistory.length === 0 && (
            <div style={{ textAlign: "center", padding: "20px 0", color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
              Abhi koi round complete nahi hua
            </div>
          )}

          {/* Detailed history rows */}
          {roundHistory.slice(0, 10).map((h, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "11px 0",
              borderBottom: i < Math.min(roundHistory.length, 10) - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
            }}>
              {/* Left: color circle + result */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: "50%",
                  background: colorMap[h.color],
                  boxShadow: `0 0 12px ${colorGlow[h.color]}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18, flexShrink: 0,
                }}>
                  {colors.find(c => c.id === h.color)?.emoji}
                </div>
                <div>
                  <div style={{ fontWeight: 800, color: colorMap[h.color], fontSize: 14 }}>
                    {h.color.toUpperCase()}
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 1 }}>
                    {timeAgo(h.time)}
                  </div>
                </div>
              </div>

              {/* Middle: Round number */}
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontWeight: 700 }}>
                  Round #{h.round}
                </div>
              </div>

              {/* Right: user bet result */}
              <div style={{ textAlign: "right", minWidth: 70 }}>
                {!h.userBet ? (
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>—</div>
                ) : h.isWin ? (
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: S.neonGreen }}>+{h.prize}💎</div>
                    <div style={{ fontSize: 9, color: "rgba(0,255,136,0.6)" }}>WIN</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: "#ff6b6b" }}>-{h.betAmt}💎</div>
                    <div style={{ fontSize: 9, color: "rgba(255,107,107,0.6)" }}>
                      Bet: {h.userBet?.toUpperCase()}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Stats bar */}
          {roundHistory.length >= 3 && (() => {
            const myRounds = roundHistory.filter(h => h.userBet);
            const myWins   = myRounds.filter(h => h.isWin).length;
            const totalR   = roundHistory.length;
            const redCount = roundHistory.filter(h => h.color === "red").length;
            const grnCount = roundHistory.filter(h => h.color === "green").length;
            const vlCount  = roundHistory.filter(h => h.color === "violet").length;
            return (
              <div style={{ marginTop: 14, padding: "12px 14px", background: "rgba(0,0,0,0.3)", borderRadius: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", marginBottom: 10, letterSpacing: 1 }}>
                  STATS (Last {totalR} rounds)
                </div>
                <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                  {[
                    { label: "🔴 Red",    count: redCount, color: "#ff4444" },
                    { label: "🟢 Green",  count: grnCount, color: "#00c853" },
                    { label: "🟣 Violet", count: vlCount,  color: "#b537f2" },
                  ].map(s => (
                    <div key={s.label} style={{ flex: 1, textAlign: "center" }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: s.color }}>{s.count}</div>
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>{s.label}</div>
                      <div style={{ marginTop: 5, height: 4, borderRadius: 99, background: "rgba(255,255,255,0.08)" }}>
                        <div style={{ height: "100%", borderRadius: 99, background: s.color, width: `${totalR ? (s.count/totalR)*100 : 0}%`, transition: "width 0.5s" }} />
                      </div>
                    </div>
                  ))}
                </div>
                {myRounds.length > 0 && (
                  <div style={{ display: "flex", gap: 12, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10 }}>
                    <div style={{ flex: 1, textAlign: "center" }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: S.neonBlue }}>{myRounds.length}</div>
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>My Bets</div>
                    </div>
                    <div style={{ flex: 1, textAlign: "center" }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: S.neonGreen }}>{myWins}</div>
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>Wins</div>
                    </div>
                    <div style={{ flex: 1, textAlign: "center" }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: myWins/myRounds.length >= 0.5 ? S.neonGreen : "#ff6b6b" }}>
                        {Math.round((myWins / myRounds.length) * 100)}%
                      </div>
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>Win Rate</div>
                    </div>
                    <div style={{ flex: 1, textAlign: "center" }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: roundHistory.filter(h=>h.userBet&&h.isWin).reduce((s,h)=>s+h.prize,0) - roundHistory.filter(h=>h.userBet&&!h.isWin).reduce((s,h)=>s+h.betAmt,0) >= 0 ? S.neonGreen : "#ff6b6b" }}>
                        {(() => {
                          const won  = roundHistory.filter(h=>h.userBet&&h.isWin).reduce((s,h)=>s+h.prize,0);
                          const lost = roundHistory.filter(h=>h.userBet&&!h.isWin).reduce((s,h)=>s+h.betAmt,0);
                          const net  = won - lost;
                          return (net >= 0 ? "+" : "") + net + "💎";
                        })()}
                      </div>
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>Net P&L</div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </Card>
      </div>
    </div>
  );
};


// ─── ADMIN COLOR PAGE (Standalone — matches screenshot exactly) ───────────────
const AdminColorPage = ({ showToast }) => {
  const colorMap  = { red: "#ff4444", green: "#00c853", violet: "#b537f2" };
  const colorGlow = { red: "rgba(255,68,68,0.55)", green: "rgba(0,200,83,0.55)", violet: "rgba(181,55,242,0.55)" };

  const [mode, setMode] = useState(() => (DB.get("dp_platform_config") || {}).adminMode || "random");
  const [nextColor, setNextColor] = useState(() => (DB.get("dp_platform_config") || {}).forcedColor || null);

  const getLiveBets = () => {
    const now = Date.now();
    const txns = (DB.get("dp_transactions") || [])
      .filter(t => t.type === "game_spend" && (t.note || "").includes("Color Bet") && now - new Date(t.date).getTime() < 60000);
    const bets = { red: 0, green: 0, violet: 0 };
    txns.forEach(t => {
      if ((t.note||"").includes("red"))    bets.red    += Math.abs(t.diamonds);
      if ((t.note||"").includes("green"))  bets.green  += Math.abs(t.diamonds);
      if ((t.note||"").includes("violet")) bets.violet += Math.abs(t.diamonds);
    });
    return bets;
  };

  const [liveBets, setLiveBets] = useState(getLiveBets);
  useEffect(() => {
    const iv = setInterval(() => setLiveBets(getLiveBets()), 3000);
    return () => clearInterval(iv);
  }, []);

  const totalBets = liveBets.red + liveBets.green + liveBets.violet;
  const pct = (c) => totalBets > 0 ? Math.round((liveBets[c] / totalBets) * 100) : 0;
  const smartColor = (() => {
    const b = getLiveBets();
    if (b.red <= b.green && b.red <= b.violet) return "red";
    if (b.green <= b.red && b.green <= b.violet) return "green";
    return "violet";
  })();

  const applyMode = (m) => {
    const cfg = DB.get("dp_platform_config") || {};
    setMode(m);
    if (m === "random") {
      DB.set("dp_platform_config", { ...cfg, adminMode: "random", forcedColor: null });
      setNextColor(null);
      showToast("🎲 Random mode active", "info");
    } else if (m === "smart") {
      DB.set("dp_platform_config", { ...cfg, adminMode: "smart", forcedColor: null });
      setNextColor(null);
      showToast("🤖 Smart Auto ON — picks minimum payout color", "success");
    } else {
      DB.set("dp_platform_config", { ...cfg, adminMode: m, forcedColor: m });
      setNextColor(m);
      showToast(`✅ ${m.toUpperCase()} forced for next round`, "success");
    }
  };

  const forceOpts = [
    { id: "red",    label: "RED",    color: "#ff4444" },
    { id: "green",  label: "GREEN",  color: "#00c853" },
    { id: "violet", label: "VIOLET", color: "#b537f2" },
  ];

  return (
    <div style={{ ...S.page, background: "#0a0a1a" }}>
      {/* ── HEADER */}
      <div style={{ padding: "16px 20px 10px", background: "linear-gradient(180deg,#0f0f2e,transparent)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <div style={{ fontSize: 20, fontWeight: 900 }}>🎨 Color Game Admin</div>
      </div>

      <div style={{ padding: "16px 20px 100px", display: "flex", flexDirection: "column", gap: 0 }}>

        {/* ── LIVE BETS */}
        <Card style={{ marginBottom: 14, padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#00ff88", boxShadow: "0 0 7px #00ff88", animation: "pulse 1.2s infinite" }} />
            <span style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.45)", letterSpacing: 1.2 }}>LIVE BETS THIS ROUND</span>
          </div>
          {forceOpts.map(c => (
            <div key={c.id} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 11, height: 11, borderRadius: "50%", background: c.color, boxShadow: `0 0 6px ${c.color}` }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: c.color }}>{c.label.charAt(0) + c.label.slice(1).toLowerCase()}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>{liveBets[c.id]} 💎</span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", minWidth: 28, textAlign: "right" }}>{pct(c.id)}%</span>
                </div>
              </div>
              {/* Progress bar */}
              <div style={{ height: 7, background: "rgba(255,255,255,0.07)", borderRadius: 99, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct(c.id)}%`, background: c.color, borderRadius: 99, boxShadow: `0 0 6px ${c.color}88`, transition: "width 0.6s ease" }} />
              </div>
              {liveBets[c.id] === 0 && (
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", marginTop: 3, fontStyle: "italic" }}>
                  No bets on {c.label.toLowerCase()} this round
                </div>
              )}
            </div>
          ))}
          <div style={{ paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.07)", display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>Total bets</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: S.neonBlue }}>{totalBets} 💎</span>
          </div>
        </Card>

        {/* ── NEXT ROUND CONTROL label */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 16 }}>🎯</span>
          <span style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.42)", letterSpacing: 1.4 }}>NEXT ROUND CONTROL</span>
        </div>

        {/* ── STATUS CARD */}
        <Card style={{
          marginBottom: 14, padding: "14px 16px",
          background: mode === "smart" ? "rgba(0,255,136,0.07)" : nextColor ? `${colorMap[nextColor]}10` : "rgba(255,255,255,0.04)",
          border: `1px solid ${mode === "smart" ? "rgba(0,255,136,0.25)" : nextColor ? colorMap[nextColor]+"40" : "rgba(255,255,255,0.1)"}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* Icon */}
            {mode === "smart" ? (
              <div style={{ width: 50, height: 50, borderRadius: 14, background: "rgba(0,255,136,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0 }}>🤖</div>
            ) : nextColor ? (
              <div style={{ width: 50, height: 50, borderRadius: "50%", background: colorMap[nextColor], boxShadow: `0 0 20px ${colorGlow[nextColor]}`, flexShrink: 0 }} />
            ) : (
              <div style={{ width: 50, height: 50, borderRadius: 14, background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0 }}>🎲</div>
            )}
            {/* Text */}
            <div>
              <div style={{ fontSize: 18, fontWeight: 900, color: mode === "smart" ? "#00ff88" : nextColor ? colorMap[nextColor] : "rgba(255,255,255,0.55)", lineHeight: 1.2 }}>
                {mode === "smart" ? "SMART AUTO" : nextColor ? `${nextColor.toUpperCase()} FORCED` : "NOT SET"}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", marginTop: 4 }}>
                {mode === "smart"
                  ? `Will pick: ${smartColor.toUpperCase()} (least bets = min payout)`
                  : nextColor
                    ? "This color wins next round — one shot"
                    : "Choose below to control next round"}
              </div>
            </div>
          </div>
        </Card>

        {/* ── FORCE WIN BUTTONS: Red / Green / Violet */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
          {forceOpts.map(o => {
            const active = (mode === o.id);
            return (
              <button key={o.id} onClick={() => applyMode(o.id)} style={{
                borderRadius: 18, padding: "20px 6px 16px",
                border: `2px solid ${active ? o.color : "rgba(255,255,255,0.1)"}`,
                background: active ? `${o.color}20` : "rgba(255,255,255,0.05)",
                cursor: "pointer", transition: "all 0.2s",
                boxShadow: active ? `0 0 20px ${colorGlow[o.id]}` : "none",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
              }}>
                {/* Big color circle */}
                <div style={{
                  width: 48, height: 48, borderRadius: "50%",
                  background: o.color,
                  boxShadow: active ? `0 0 18px ${colorGlow[o.id]}` : `0 0 6px ${o.color}66`,
                }} />
                {/* Label */}
                <div style={{ fontSize: 13, fontWeight: 900, color: o.color, letterSpacing: 0.5 }}>{o.label}</div>
                {/* Force Win badge */}
                <div style={{
                  fontSize: 10, fontWeight: 800,
                  color: active ? o.color : "rgba(255,255,255,0.35)",
                  background: active ? `${o.color}18` : "rgba(255,255,255,0.06)",
                  border: `1px solid ${active ? o.color + "55" : "rgba(255,255,255,0.12)"}`,
                  borderRadius: 99, padding: "2px 10px",
                }}>Force Win</div>
              </button>
            );
          })}
        </div>

        {/* ── SMART AUTO + RANDOM ROW */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          {/* Smart Auto */}
          <button onClick={() => applyMode("smart")} style={{
            borderRadius: 18, padding: "18px 12px",
            border: `2px solid ${mode === "smart" ? "#00ff88" : "rgba(255,255,255,0.1)"}`,
            background: mode === "smart" ? "linear-gradient(135deg,#00ff88,#00d4ff)" : "rgba(255,255,255,0.05)",
            cursor: "pointer", transition: "all 0.22s",
            boxShadow: mode === "smart" ? "0 0 28px rgba(0,255,136,0.55)" : "none",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 26, marginBottom: 5 }}>🤖</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: mode === "smart" ? "#000" : "#fff", lineHeight: 1.3 }}>
              Smart Auto<br />
              <span style={{ fontSize: 12, fontWeight: 700, color: mode === "smart" ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.5)" }}>(Min Payout)</span>
            </div>
          </button>

          {/* Random */}
          <button onClick={() => applyMode("random")} style={{
            borderRadius: 18, padding: "18px 12px",
            border: `2px solid ${mode === "random" ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.1)"}`,
            background: mode === "random" ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)",
            cursor: "pointer", transition: "all 0.22s",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 26, marginBottom: 5 }}>🎲</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: mode === "random" ? "#fff" : "rgba(255,255,255,0.55)", lineHeight: 1.3 }}>
              Random
            </div>
          </button>
        </div>

        {/* ── TIP */}
        <Card style={{ background: "rgba(255,215,0,0.04)", border: "1px solid rgba(255,215,0,0.14)", padding: "12px 14px" }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.75 }}>
            💡 <strong style={{ color: "#ffd700" }}>Admin Control:</strong><br />
            • <b>Force Win</b> → next round guaranteed result (one-shot)<br />
            • <b>Smart Auto</b> → auto-picks color with least bets (max revenue)<br />
            • <b>Random</b> → pure algorithm, no control<br />
            • Users ko kuch pata nahi chalta 🔒
          </div>
        </Card>
      </div>
    </div>
  );
};

// ─── ADMIN COLOR CONTROL PANEL ────────────────────────────────────────────────
const AdminColorControl = ({ showToast }) => {
  const colorMap  = { red: "#ff4444", green: "#00c853", violet: "#b537f2" };
  const colorGlow = { red: "rgba(255,68,68,0.5)", green: "rgba(0,200,83,0.5)", violet: "rgba(181,55,242,0.5)" };

  const [nextColor, setNextColor] = useState(() => (DB.get("dp_platform_config") || {}).forcedColor || null);
  const [mode,      setMode]      = useState(() => (DB.get("dp_platform_config") || {}).adminMode || "random");
  // "random" | "smart" | "red" | "green" | "violet"

  // Read live bets from current round transactions (last 60 sec)
  const getLiveBets = () => {
    const now  = Date.now();
    const txns = (DB.get("dp_transactions") || [])
      .filter(t => t.type === "game_spend" && (t.note || "").includes("Color Bet") && now - new Date(t.date).getTime() < 60000);
    const bets = { red: 0, green: 0, violet: 0 };
    txns.forEach(t => {
      if ((t.note||"").includes("red"))    bets.red    += Math.abs(t.diamonds);
      if ((t.note||"").includes("green"))  bets.green  += Math.abs(t.diamonds);
      if ((t.note||"").includes("violet")) bets.violet += Math.abs(t.diamonds);
    });
    return bets;
  };

  const [liveBets, setLiveBets] = useState(getLiveBets);
  // Refresh live bets every 3 seconds
  useEffect(() => {
    const iv = setInterval(() => setLiveBets(getLiveBets()), 3000);
    return () => clearInterval(iv);
  }, []);

  const totalBets = liveBets.red + liveBets.green + liveBets.violet;

  // Smart Auto: pick color with LEAST bets (min payout to platform)
  const getSmartColor = () => {
    const b = getLiveBets();
    if (b.red <= b.green && b.red <= b.violet)    return "red";
    if (b.green <= b.red && b.green <= b.violet)  return "green";
    return "violet";
  };

  const applyMode = (newMode) => {
    setMode(newMode);
    const cfg = DB.get("dp_platform_config") || {};
    if (newMode === "random") {
      DB.set("dp_platform_config", { ...cfg, forcedColor: null, adminMode: "random" });
      setNextColor(null);
      showToast("🎲 Random mode — system decides!", "info");
    } else if (newMode === "smart") {
      DB.set("dp_platform_config", { ...cfg, adminMode: "smart", forcedColor: null });
      setNextColor(null);
      showToast("🤖 Smart Auto ON — min payout color will be auto-picked!", "success");
    } else {
      // force a specific color
      DB.set("dp_platform_config", { ...cfg, forcedColor: newMode, adminMode: newMode });
      setNextColor(newMode);
      showToast(`✅ Force WIN set: ${newMode.toUpperCase()}`, "success");
    }
  };

  // Compute smart suggestion live
  const smartSuggestion = getSmartColor();
  const pctOf = (c) => totalBets > 0 ? Math.round((liveBets[c] / totalBets) * 100) : 0;

  const forceOptions = [
    { id: "red",    label: "RED",    color: "#ff4444", glow: colorGlow.red },
    { id: "green",  label: "GREEN",  color: "#00c853", glow: colorGlow.green },
    { id: "violet", label: "VIOLET", color: "#b537f2", glow: colorGlow.violet },
  ];

  return (
    <div style={{ paddingBottom: 30 }}>

      {/* ── LIVE BETS PANEL */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: S.neonGreen, boxShadow: `0 0 8px ${S.neonGreen}`, animation: "pulse 1s infinite" }} />
          <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.5)", letterSpacing: 1 }}>LIVE BETS THIS ROUND</div>
        </div>

        {[
          { id: "red",    label: "Red",    color: "#ff4444" },
          { id: "green",  label: "Green",  color: "#00c853" },
          { id: "violet", label: "Violet", color: "#b537f2" },
        ].map(c => (
          <div key={c.id} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: c.color }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: c.color }}>{c.label}</span>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{liveBets[c.id]}💎</span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", minWidth: 30, textAlign: "right" }}>{pctOf(c.id)}%</span>
              </div>
            </div>
            <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 99, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 99,
                background: c.color,
                width: `${pctOf(c.id)}%`,
                boxShadow: `0 0 8px ${c.color}`,
                transition: "width 0.6s ease",
              }} />
            </div>
            {liveBets[c.id] === 0 && (
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginTop: 3, fontStyle: "italic" }}>
                No bets on {c.label.toLowerCase()} this round
              </div>
            )}
          </div>
        ))}

        <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(255,255,255,0.04)", borderRadius: 10, display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Total bets this round</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: S.neonBlue }}>{totalBets} 💎</span>
        </div>
      </div>

      {/* ── NEXT ROUND CONTROL HEADER */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 16 }}>🎯</span>
        <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.5)", letterSpacing: 1 }}>NEXT ROUND CONTROL</div>
      </div>

      {/* ── STATUS CARD */}
      <Card style={{
        marginBottom: 16,
        background: mode === "smart"
          ? "rgba(0,255,136,0.08)"
          : nextColor
            ? `${colorMap[nextColor]}12`
            : "rgba(255,255,255,0.04)",
        border: `1px solid ${mode === "smart" ? "rgba(0,255,136,0.3)" : nextColor ? colorMap[nextColor]+"44" : "rgba(255,255,255,0.1)"}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {mode === "smart" ? (
            <>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(0,255,136,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>🤖</div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 900, color: S.neonGreen }}>SMART AUTO</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
                  Will pick: <span style={{ color: colorMap[smartSuggestion], fontWeight: 700 }}>{smartSuggestion.toUpperCase()}</span> (min payout)
                </div>
              </div>
            </>
          ) : nextColor ? (
            <>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: colorMap[nextColor], boxShadow: `0 0 20px ${colorGlow[nextColor]}`, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 17, fontWeight: 900, color: colorMap[nextColor] }}>{nextColor.toUpperCase()} FORCED</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>This color will win next round (one-shot)</div>
              </div>
            </>
          ) : (
            <>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0 }}>🎲</div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 900, color: "rgba(255,255,255,0.6)" }}>NOT SET</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>Choose below to control next round</div>
              </div>
            </>
          )}
        </div>
      </Card>

      {/* ── FORCE WIN BUTTONS — Red / Green / Violet */}
      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        {forceOptions.map(o => {
          const isActive = (mode === o.id || nextColor === o.id);
          return (
            <button key={o.id} onClick={() => applyMode(o.id)} style={{
              flex: 1,
              padding: "20px 4px 14px",
              borderRadius: 18,
              border: `2px solid ${isActive ? o.color : "rgba(255,255,255,0.1)"}`,
              background: isActive ? `${o.color}22` : "rgba(255,255,255,0.05)",
              cursor: "pointer",
              transition: "all 0.2s",
              boxShadow: isActive ? `0 0 22px ${o.glow}, inset 0 0 20px ${o.color}15` : "none",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: "50%",
                background: o.color,
                boxShadow: isActive ? `0 0 16px ${o.glow}` : `0 0 6px ${o.color}66`,
              }} />
              <div style={{ fontWeight: 900, fontSize: 14, color: o.color }}>{o.label}</div>
              <div style={{
                fontSize: 11, fontWeight: 800,
                color: isActive ? o.color : "rgba(255,255,255,0.35)",
                background: isActive ? `${o.color}20` : "rgba(255,255,255,0.06)",
                border: `1px solid ${isActive ? o.color+"55" : "rgba(255,255,255,0.1)"}`,
                borderRadius: 99,
                padding: "2px 10px",
                marginTop: 2,
              }}>Force Win</div>
            </button>
          );
        })}
      </div>

      {/* ── SMART AUTO + RANDOM BUTTONS */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        {/* Smart Auto */}
        <button onClick={() => applyMode("smart")} style={{
          flex: 1,
          padding: "18px 14px",
          borderRadius: 18,
          border: `2px solid ${mode === "smart" ? S.neonGreen : "rgba(255,255,255,0.1)"}`,
          background: mode === "smart"
            ? "linear-gradient(135deg,#00ff88,#00d4ff)"
            : "rgba(255,255,255,0.05)",
          cursor: "pointer",
          transition: "all 0.2s",
          boxShadow: mode === "smart" ? "0 0 24px rgba(0,255,136,0.5)" : "none",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 22, marginBottom: 4 }}>🤖</div>
          <div style={{ fontWeight: 900, fontSize: 15, color: mode === "smart" ? "#000" : "#fff" }}>Smart Auto</div>
          <div style={{ fontSize: 11, color: mode === "smart" ? "rgba(0,0,0,0.65)" : "rgba(255,255,255,0.4)", marginTop: 2 }}>(Min Payout)</div>
        </button>

        {/* Random */}
        <button onClick={() => applyMode("random")} style={{
          flex: 1,
          padding: "18px 14px",
          borderRadius: 18,
          border: `2px solid ${mode === "random" ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.1)"}`,
          background: mode === "random" ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)",
          cursor: "pointer",
          transition: "all 0.2s",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 22, marginBottom: 4 }}>🎲</div>
          <div style={{ fontWeight: 900, fontSize: 15, color: mode === "random" ? "#fff" : "rgba(255,255,255,0.6)" }}>Random</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>(System picks)</div>
        </button>
      </div>

      {/* ── INFO TIP */}
      <Card style={{ background: "rgba(255,215,0,0.05)", border: "1px solid rgba(255,215,0,0.15)" }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.7 }}>
          💡 <strong style={{ color: "#ffd700" }}>How it works:</strong><br />
          • <strong>Force Win</strong> → next round mein woh color guaranteed aayega (1 time)<br />
          • <strong>Smart Auto</strong> → automatically wo color choose karta hai jisme sabse kam bets hain (minimum payout)<br />
          • <strong>Random</strong> → pure algorithm decides, no control<br />
          • Users ko kuch pata nahi chalta 🔒
        </div>
      </Card>
    </div>
  );
};

// ─── ADMIN GAMES HUB (central place to manage all games) ─────────────────────
const GameRateCard = ({ icon, title, desc, cfgKey, cfg, showToast, accent }) => {
  const [val, setVal] = useState(String(cfg[cfgKey] ?? 0));
  const save = () => {
    const n = Number(val);
    if (isNaN(n) || n < 0 || n > 100) { showToast("Enter a valid % between 0-100", "error"); return; }
    const latest = DB.get("dp_platform_config") || {};
    DB.set("dp_platform_config", { ...latest, [cfgKey]: n });
    showToast(`${title} win rate set to ${n}%`, "success");
  };
  return (
    <Card style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 28 }}>{icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800 }}>{title}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{desc}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <Input label="Win chance %" value={val} onChange={setVal} type="number" icon="🎯" />
        </div>
        <Btn onClick={save} variant="green" style={{ marginBottom: 14 }}>💾 Save</Btn>
      </div>
    </Card>
  );
};

const AdminGamesHub = ({ setPage, showToast }) => {
  const cfg = DB.get("dp_platform_config") || {};

  return (
    <div style={S.page}>
      <TopBar title="🎮 Games" onBack={() => setPage("admin")} />
      <div style={{ padding: "0 20px" }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 14 }}>
          Sabhi games ka admin control ek hi jagah. Color Prediction apne dedicated advanced panel (auto/manual/live bets) se hi chalega — waisa hi rahega. Baaki games ka win-chance yahin se set karo.
        </div>

        {/* Color Prediction — untouched, links to its existing full control page */}
        <Card onClick={() => setPage("admin_color")} style={{ marginBottom: 16, background: "rgba(181,55,242,0.08)", border: `1px solid ${S.neonPink}44` }} glow>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ fontSize: 28 }}>🎨</div>
              <div>
                <div style={{ fontWeight: 800 }}>Color Prediction</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>Mode: {(cfg.adminMode || "random")} · Full live-bets control</div>
              </div>
            </div>
            <div style={{ color: S.neonBlue, fontWeight: 700 }}>Manage →</div>
          </div>
        </Card>

        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 10 }}>Other Games</div>

        <GameRateCard icon="🎲" title="Dice Roll" desc={`Cost ${cfg.gameCost || 5}💎 · Win 30💎 on exact match`} cfgKey="diceWinRate" cfg={cfg} showToast={showToast} />
        <GameRateCard icon="🔢" title="Number Pick" desc={`Cost ${cfg.gameCost || 5}💎 · Win 45💎 exact, 8💎 near-miss`} cfgKey="numberWinRate" cfg={cfg} showToast={showToast} />
        <GameRateCard icon="🃏" title="Scratch Card" desc={`Cost ${cfg.scratchCost || 10}💎 · Win up to 100💎`} cfgKey="scratchWinRate" cfg={cfg} showToast={showToast} />
      </div>
    </div>
  );
};

// ─── DICE GAME ────────────────────────────────────────────────────────────────
const DiceGame = ({ user, setUser, setPage, showToast }) => {
  const [pick, setPick] = useState(null);
  const [rolled, setRolled] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [msg, setMsg] = useState("");
  const cfg = DB.get("dp_platform_config") || {};
  const COST = cfg.gameCost || 5;
  const diceEmoji = ["", "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣"];
  const play = async () => {
    if (!pick) { setMsg("Pick a number 1-6!"); return; }
    if (user.diamonds < COST) { showToast("Not enough Diamonds!", "error"); return; }
    setMsg(""); setSpinning(true);
    saveGameResult(user.id, -COST, `Dice Roll - pick ${pick}`);
    setUser(u => ({ ...u, diamonds: u.diamonds - COST, gamesPlayed: u.gamesPlayed + 1 }));
    await sleep(1500);
    const winRate = cfg.diceWinRate ?? 17;
    const forceWin = Math.random() * 100 < winRate;
    let r;
    if (forceWin) { r = pick; }
    else { do { r = rnd(1, 6); } while (r === pick); }
    setRolled(r); setSpinning(false);
    if (r === pick) {
      saveGameResult(user.id, 30, `Dice Win - rolled ${r}`);
      setUser(u => ({ ...u, diamonds: u.diamonds + 30 }));
      setMsg("🎉 PERFECT ROLL! +30 Diamonds!");
    } else { setMsg(`Rolled ${r}. Try again!`); }
  };
  return (
    <div style={S.page}>
      <TopBar title="🎲 Dice Roll" onBack={() => setPage("games")} right={<DiamondChip amount={user.diamonds} />} />
      <div style={{ padding: 20, textAlign: "center" }}>
        <div style={{ fontSize: 80, marginBottom: 8 }}>{spinning ? "🎲" : rolled ? diceEmoji[rolled] : "🎲"}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
          {[1, 2, 3, 4, 5, 6].map(n => (
            <button key={n} onClick={() => { setPick(n); setRolled(null); setMsg(""); }} style={{ padding: 16, borderRadius: 14, background: pick === n ? S.gradBlue : "rgba(255,255,255,0.06)", border: `2px solid ${pick === n ? S.neonBlue : "rgba(255,255,255,0.1)"}`, color: "#fff", fontWeight: 800, fontSize: 20, cursor: "pointer" }}>{diceEmoji[n]}</button>
          ))}
        </div>
        {msg && <Card style={{ marginBottom: 14, background: msg.includes("🎉") ? "rgba(0,255,136,0.1)" : "rgba(255,61,154,0.1)" }}><div style={{ fontWeight: 700 }}>{msg}</div></Card>}
        <Btn full onClick={play} disabled={spinning}>{spinning ? "Rolling..." : `💎 Roll (${COST} Diamonds) · Win 30`}</Btn>
      </div>
    </div>
  );
};

// ─── NUMBER GAME ──────────────────────────────────────────────────────────────
const NumberGame = ({ user, setUser, setPage, showToast }) => {
  const [pick, setPick] = useState(null);
  const [result, setResult] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [msg, setMsg] = useState("");
  const cfg = DB.get("dp_platform_config") || {};
  const COST = cfg.gameCost || 5;
  const play = async () => {
    if (!pick) { setMsg("Pick a number!"); return; }
    if (user.diamonds < COST) { showToast("Not enough Diamonds!", "error"); return; }
    setMsg(""); setPlaying(true);
    saveGameResult(user.id, -COST, `Number Pick - pick ${pick}`);
    setUser(u => ({ ...u, diamonds: u.diamonds - COST, gamesPlayed: u.gamesPlayed + 1 }));
    await sleep(1200);
    const winRate = cfg.numberWinRate ?? 10;
    const forceWin = Math.random() * 100 < winRate;
    let r;
    if (forceWin) { r = pick; }
    else { do { r = rnd(1, 10); } while (r === pick); }
    setResult(r); setPlaying(false);
    if (r === pick) {
      saveGameResult(user.id, 45, `Number Win - exact ${r}`);
      setUser(u => ({ ...u, diamonds: u.diamonds + 45 }));
      setMsg("🎉 EXACT MATCH! +45 Diamonds!");
    } else if (Math.abs(r - pick) === 1) {
      saveGameResult(user.id, 8, `Number Near Win - ${r}`);
      setUser(u => ({ ...u, diamonds: u.diamonds + 8 }));
      setMsg(`Close! +8 Diamonds consolation!`);
    } else { setMsg(`Number was ${r}. Try again!`); }
  };
  return (
    <div style={S.page}>
      <TopBar title="🔢 Number Pick" onBack={() => setPage("games")} right={<DiamondChip amount={user.diamonds} />} />
      <div style={{ padding: 20 }}>
        <div style={{ fontSize: 64, textAlign: "center", marginBottom: 16 }}>{playing ? "🤔" : result ? `${result}` : "?"}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8, marginBottom: 16 }}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
            <button key={n} onClick={() => { setPick(n); setResult(null); setMsg(""); }} style={{ padding: "14px 0", borderRadius: 12, fontWeight: 800, fontSize: 18, cursor: "pointer", background: pick === n ? S.gradBlue : "rgba(255,255,255,0.06)", border: `2px solid ${pick === n ? S.neonBlue : "rgba(255,255,255,0.1)"}`, color: "#fff" }}>{n}</button>
          ))}
        </div>
        {msg && <Card style={{ marginBottom: 14, textAlign: "center", background: msg.includes("🎉") ? "rgba(0,255,136,0.1)" : "rgba(255,61,154,0.1)" }}><div style={{ fontWeight: 700 }}>{msg}</div></Card>}
        <Btn full onClick={play} disabled={playing}>{playing ? "Revealing..." : `💎 Play (${COST} Diamonds)`}</Btn>
      </div>
    </div>
  );
};

// ─── SCRATCH GAME ─────────────────────────────────────────────────────────────
const ScratchGame = ({ user, setUser, setPage, showToast }) => {
  const [bought, setBought] = useState(false);
  const [scratched, setScratched] = useState(false);
  const [prize, setPrize] = useState(0);
  const [loading, setLoading] = useState(false);
  const cfg = DB.get("dp_platform_config") || {};
  const COST = cfg.scratchCost || 10;
  const buy = async () => {
    if (user.diamonds < COST) { showToast("Not enough Diamonds!", "error"); return; }
    setLoading(true);
    saveGameResult(user.id, -COST, "Scratch Card Buy");
    setUser(u => ({ ...u, diamonds: u.diamonds - COST, gamesPlayed: u.gamesPlayed + 1 }));
    await sleep(800);
    const winRate = cfg.scratchWinRate ?? 33;
    const winPrizes = [5, 15, 30, 50, 100];
    const isWin = Math.random() * 100 < winRate;
    setPrize(isWin ? winPrizes[rnd(0, winPrizes.length - 1)] : 0);
    setBought(true); setScratched(false); setLoading(false);
  };
  const scratch = () => {
    if (!bought) return;
    setScratched(true);
    if (prize > 0) {
      saveGameResult(user.id, prize, `Scratch Card Win - ${prize}`);
      setUser(u => ({ ...u, diamonds: u.diamonds + prize }));
    }
  };
  return (
    <div style={S.page}>
      <TopBar title="🃏 Scratch Card" onBack={() => setPage("games")} right={<DiamondChip amount={user.diamonds} />} />
      <div style={{ padding: 20, textAlign: "center" }}>
        <Card style={{ padding: 40, marginBottom: 20, background: scratched ? (prize > 0 ? "rgba(0,255,136,0.1)" : "rgba(255,61,154,0.1)") : S.glass }}>
          {!bought ? <div style={{ fontSize: 60 }}>🃏</div>
            : scratched ? <div><div style={{ fontSize: 50 }}>{prize > 0 ? "🎉" : "😢"}</div><div style={{ fontSize: 28, fontWeight: 900, color: prize > 0 ? S.neonGreen : "#ff6b6b", marginTop: 8 }}>{prize > 0 ? `+${prize} 💎` : "No Prize"}</div></div>
              : <div style={{ cursor: "pointer" }} onClick={scratch}><div style={{ fontSize: 60 }}>✋</div><div style={{ marginTop: 10, color: S.neonBlue, fontWeight: 700 }}>Tap to Scratch!</div></div>}
        </Card>
        {!bought ? <Btn full variant="gold" onClick={buy} disabled={loading}>{loading ? "Getting card..." : `💎 Buy Card (${COST} Diamonds)`}</Btn>
          : scratched ? <Btn full onClick={() => { setBought(false); setScratched(false); setPrize(0); }}>🃏 Try Again</Btn>
            : <Btn full onClick={scratch}>✋ Scratch Now!</Btn>}
      </div>
    </div>
  );
};

// ─── WALLET / PAYMENT PAGE ────────────────────────────────────────────────────
const WalletPage = ({ user, setUser, setPage, showToast }) => {
  const [tab, setTab] = useState("deposit");
  const [selectedPack, setSelectedPack] = useState(null);
  const [payStep, setPayStep] = useState("select"); // select | instructions | utr
  const [utrNumber, setUtrNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [withdrawAmt, setWithdrawAmt] = useState("");
  const [upiId, setUpiId] = useState("");
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const cfg = DB.get("dp_platform_config") || {};
  const packs = DB.get("dp_diamond_packs") || [];
  const txns = (DB.get("dp_transactions") || []).filter(t => t.userId === user.id).slice(0, 20);

  const startPayment = (pack) => {
    setSelectedPack(pack);
    setPayStep("instructions");
  };

  const cancelDeposit = () => {
    setSelectedPack(null);
    setPayStep("select");
    setUtrNumber("");
  };

  const submitDepositRequest = async () => {
    const utr = utrNumber.trim();
    if (utr.length < 6) { showToast("Enter valid UTR / Transaction ID", "error"); return; }
    // Check for duplicate UTR
    const allTxns = DB.get("dp_transactions") || [];
    const duplicate = allTxns.find(t => t.utr === utr);
    if (duplicate) { showToast("This UTR was already submitted!", "error"); return; }
    setSubmitting(true);
    await sleep(800);
    const total = selectedPack.diamonds + selectedPack.bonus;
    const newTxn = {
      id: tid(),
      userId: user.id,
      type: "deposit",
      amount: selectedPack.price,
      diamonds: total,
      status: "pending",
      date: new Date().toISOString(),
      method: "UPI",
      note: `${selectedPack.label} Pack — UTR: ${utr}`,
      utr,
      packId: selectedPack.id,
      packLabel: selectedPack.label,
    };
    DB.set("dp_transactions", [newTxn, ...allTxns]);
    pushAdminAlert("deposit_pending", {
      txnId: newTxn.id,
      userName: user.name,
      phone: user.phone,
      amount: selectedPack.price,
      diamonds: total,
      utr,
      pack: selectedPack.label,
      time: new Date().toISOString(),
    });
    setSubmitting(false);
    cancelDeposit();
    showToast("✅ Deposit request submitted!\nAdmin will verify & credit diamonds within 30 min.", "success");
  };

  const submitWithdrawal = async () => {
    const amt = parseInt(withdrawAmt);
    const minW = cfg.minWithdraw || 200;
    if (!amt || amt < minW) { showToast(`Minimum withdrawal: ${minW} Diamonds`, "error"); return; }
    if (amt > user.diamonds) { showToast("Not enough Diamonds", "error"); return; }
    if (!upiId || !upiId.includes("@")) { showToast("Enter valid UPI ID (e.g. name@upi)", "error"); return; }
    setWithdrawLoading(true);
    await sleep(1000);
    const fee = Math.floor(amt * (cfg.withdrawFeePercent || 5) / 100);
    const net = amt - fee;
    const users = DB.get("dp_users") || [];
    const updated = users.map(u => u.id === user.id ? { ...u, diamonds: u.diamonds - amt, totalWithdrawn: u.totalWithdrawn + amt } : u);
    DB.set("dp_users", updated);
    const txnsNow = DB.get("dp_transactions") || [];
    DB.set("dp_transactions", [{ id: tid(), userId: user.id, type: "withdrawal", amount: net, diamonds: -amt, status: "pending", date: new Date().toISOString(), method: "UPI", note: `Withdraw to ${upiId}`, upiId, fee }, ...txnsNow]);
    pushAdminAlert("withdrawal", { userName: user.name, diamonds: amt, upiId, time: new Date().toISOString() });
    setUser(u => ({ ...u, diamonds: u.diamonds - amt, totalWithdrawn: u.totalWithdrawn + amt }));
    setWithdrawLoading(false);
    setWithdrawAmt(""); setUpiId("");
    showToast("Withdrawal request submitted! Admin will process within 24 hours.", "success");
  };

  // ── Deposit — Step 1: pack select
  const DepositSelectView = () => (
    <div>
      <Card style={{ marginBottom: 16, background: "rgba(0,212,255,0.06)", border: `1px solid rgba(0,212,255,0.2)` }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: S.neonBlue, marginBottom: 6 }}>💳 How it works</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.7 }}>
          1️⃣ Select a Diamond pack<br />
          2️⃣ Pay to our UPI ID via GPay / PhonePe / Paytm<br />
          3️⃣ Submit your UTR / Transaction ID<br />
          4️⃣ Admin verifies & credits diamonds in ≤30 min ✅
        </div>
      </Card>
      <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.6)", marginBottom: 12 }}>Choose a Diamond Pack</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {packs.map(p => (
          <Card key={p.id} onClick={() => startPayment(p)} style={{ position: "relative", cursor: "pointer", textAlign: "center", padding: 14, border: p.popular ? `1px solid ${S.neonGold}` : undefined }}>
            {p.popular && <div style={{ position: "absolute", top: -8, left: "50%", transform: "translateX(-50%)", background: S.gradGold, borderRadius: 20, padding: "2px 10px", fontSize: 10, fontWeight: 800, color: "#000" }}>⭐ POPULAR</div>}
            <div style={{ fontSize: 28, marginBottom: 4 }}>💎</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{fmt(p.diamonds)}</div>
            {p.bonus > 0 && <div style={{ fontSize: 11, color: S.neonGreen }}>+{p.bonus} bonus</div>}
            <div style={{ fontSize: 16, fontWeight: 700, color: S.neonGold, marginTop: 6 }}>{fmtINR(p.price)}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>{p.label}</div>
          </Card>
        ))}
      </div>
    </div>
  );

  // ── Deposit — Step 2: UPI payment instructions
  const DepositInstructionsView = () => (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <button onClick={cancelDeposit} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "#fff", borderRadius: 50, width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>←</button>
        <div style={{ fontSize: 16, fontWeight: 800 }}>Pay via UPI</div>
      </div>

      {/* Pack summary */}
      <Card style={{ textAlign: "center", marginBottom: 16, background: "linear-gradient(135deg,rgba(255,215,0,0.1),rgba(255,107,53,0.08))", border: `1px solid rgba(255,215,0,0.25)` }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 2 }}>You're buying</div>
        <div style={{ fontSize: 28, fontWeight: 900 }}>💎 {fmt(selectedPack.diamonds + selectedPack.bonus)}</div>
        {selectedPack.bonus > 0 && <div style={{ fontSize: 12, color: S.neonGreen }}>({selectedPack.diamonds} + {selectedPack.bonus} bonus)</div>}
        <div style={{ fontSize: 26, fontWeight: 800, color: S.neonGold, marginTop: 6 }}>{fmtINR(selectedPack.price)}</div>
        <Badge label={selectedPack.label} color={S.neonGold} />
      </Card>

      {/* UPI details box */}
      <Card style={{ marginBottom: 16, background: "rgba(0,212,255,0.05)", border: `1px solid rgba(0,212,255,0.2)` }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: S.neonBlue, marginBottom: 12 }}>📲 Send payment to</div>
        <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 12, padding: 14, marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 2 }}>UPI ID</div>
          <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: 0.5, marginBottom: 4 }}>{cfg.upiId || "diamondplay@upi"}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{cfg.upiName || "DiamondPlay Gaming"}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn full sm variant="outline" onClick={() => { navigator.clipboard?.writeText(cfg.upiId || "diamondplay@upi"); showToast("UPI ID copied! 📋", "success"); }}>📋 Copy UPI ID</Btn>
          <Btn full sm variant="primary" onClick={() => {
            const upiUrl = `upi://pay?pa=${encodeURIComponent(cfg.upiId || "diamondplay@upi")}&pn=${encodeURIComponent(cfg.upiName || "DiamondPlay")}&am=${selectedPack.price}&cu=INR`;
            window.open(upiUrl, "_blank");
          }}>🚀 Open GPay</Btn>
        </div>
      </Card>

      {/* Steps */}
      <Card style={{ marginBottom: 16, background: "rgba(255,255,255,0.03)" }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>📋 Steps to complete</div>
        {[
          ["1", `Open GPay / PhonePe / Paytm`, S.neonBlue],
          ["2", `Send exactly ${fmtINR(selectedPack.price)} to the UPI ID above`, S.neonGold],
          ["3", "Note down your UTR / Transaction ID from payment receipt", S.neonGreen],
          ["4", "Tap 'I've Paid' below and enter the UTR number", S.neonPurple],
        ].map(([n, text, c]) => (
          <div key={n} style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: `${c}33`, border: `1px solid ${c}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: c, flexShrink: 0 }}>{n}</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", paddingTop: 3 }}>{text}</div>
          </div>
        ))}
      </Card>

      <Btn full variant="green" onClick={() => setPayStep("utr")}>✅ I've Paid — Enter UTR Number →</Btn>
      <div style={{ marginTop: 10, textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Diamonds credited within 30 minutes after verification</div>
    </div>
  );

  // ── Deposit — Step 3: UTR submission
  const DepositUTRView = () => (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <button onClick={() => setPayStep("instructions")} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "#fff", borderRadius: 50, width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>←</button>
        <div style={{ fontSize: 16, fontWeight: 800 }}>Submit Payment Proof</div>
      </div>

      <Card style={{ marginBottom: 16, background: "rgba(0,255,136,0.06)", border: `1px solid rgba(0,255,136,0.2)` }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Pack</div>
            <div style={{ fontWeight: 800 }}>💎 {fmt(selectedPack.diamonds + selectedPack.bonus)} Diamonds</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Amount Paid</div>
            <div style={{ fontWeight: 800, color: S.neonGold }}>{fmtINR(selectedPack.price)}</div>
          </div>
        </div>
      </Card>

      <div style={{ marginBottom: 6, fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>🔢 UTR / Transaction ID</div>
      <div style={{ marginBottom: 6, fontSize: 12, color: "rgba(255,255,255,0.45)" }}>Find this in your GPay / PhonePe receipt (12-digit number)</div>
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="e.g. 425678901234"
          value={utrNumber}
          onChange={e => setUtrNumber(e.target.value.replace(/\s/g, "").slice(0, 22))}
          style={{ width: "100%", background: "rgba(255,255,255,0.07)", border: `1px solid ${utrNumber.length >= 6 ? S.neonGreen : "rgba(255,255,255,0.15)"}`, borderRadius: 12, padding: "14px 16px", color: "#fff", fontSize: 16, fontWeight: 700, outline: "none", boxSizing: "border-box", letterSpacing: 1 }}
        />
      </div>

      <Card style={{ marginBottom: 16, background: "rgba(255,215,0,0.06)", border: "1px solid rgba(255,215,0,0.2)" }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.7 }}>
          ⚠️ <strong style={{ color: S.neonGold }}>Important:</strong> Enter the exact UTR from your payment app. Admin will cross-verify the transaction before crediting diamonds. Fake UTRs will result in a ban.
        </div>
      </Card>

      <Btn full variant="green" onClick={submitDepositRequest} disabled={submitting || utrNumber.trim().length < 6}>
        {submitting ? "Submitting..." : "📤 Submit Deposit Request"}
      </Btn>
      <div style={{ marginTop: 10, textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Your diamonds will be credited after admin verification (≤30 min)</div>
    </div>
  );

  return (
    <div style={S.page}>
      <TopBar title="💼 Wallet" right={<DiamondChip amount={user.diamonds} />} />
      <div style={{ padding: "0 20px" }}>
        {/* If in deposit flow step 2/3, hide tabs */}
        {payStep === "select" && (
          <div style={{ display: "flex", background: "rgba(255,255,255,0.05)", borderRadius: 14, padding: 4, marginBottom: 20 }}>
            {["deposit", "withdraw", "history"].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: "10px 0", background: tab === t ? S.gradBlue : "none", border: "none", color: "#fff", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer", textTransform: "capitalize" }}>{t === "deposit" ? "💎 Buy" : t === "withdraw" ? "⬆️ Withdraw" : "📜 History"}</button>
            ))}
          </div>
        )}

        {tab === "deposit" && (
          <>
            {payStep === "select" && <DepositSelectView />}
            {payStep === "instructions" && <DepositInstructionsView />}
            {payStep === "utr" && <DepositUTRView />}
          </>
        )}

        {tab === "withdraw" && payStep === "select" && (
          <div>
            <Card style={{ marginBottom: 16, background: "rgba(255,215,0,0.05)" }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>Available Balance</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>💎 {fmt(user.diamonds)}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>≈ {fmtINR(Math.floor(user.diamonds * 0.9))} after {cfg.withdrawFeePercent || 5}% fee</div>
            </Card>
            <Input label="Diamonds to Withdraw" placeholder={`Min ${cfg.minWithdraw || 200} Diamonds`} value={withdrawAmt} onChange={setWithdrawAmt} type="number" icon="💎" />
            <Input label="Your UPI ID" placeholder="yourname@upi" value={upiId} onChange={setUpiId} icon="📲" />
            {withdrawAmt && upiId && (
              <Card style={{ marginBottom: 14, background: "rgba(0,212,255,0.05)" }}>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Fee: 💎{Math.floor(parseInt(withdrawAmt) * (cfg.withdrawFeePercent || 5) / 100)} ({cfg.withdrawFeePercent || 5}%)</div>
                <div style={{ fontWeight: 700 }}>You receive: {fmtINR(Math.floor(parseInt(withdrawAmt) * (100 - (cfg.withdrawFeePercent || 5)) / 100))}</div>
              </Card>
            )}
            <Btn full variant="gold" onClick={submitWithdrawal} disabled={withdrawLoading}>{withdrawLoading ? "Submitting..." : "⬆️ Request Withdrawal"}</Btn>
            <div style={{ marginTop: 12, fontSize: 12, color: "rgba(255,255,255,0.35)", textAlign: "center" }}>Withdrawal processed within 24 hours after admin approval</div>
          </div>
        )}

        {tab === "history" && payStep === "select" && (
          <div>
            {txns.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.35)" }}>No transactions yet</div> :
              txns.map(t => (
                <Card key={t.id} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ flex: 1, paddingRight: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{t.note}</div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{timeAgo(t.date)} · {t.method}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 800, color: t.diamonds > 0 ? S.neonGreen : "#ff6b6b" }}>{t.diamonds > 0 ? "+" : ""}{t.diamonds}💎</div>
                      {t.amount > 0 && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{fmtINR(t.amount)}</div>}
                      <Badge label={t.status} color={t.status === "success" ? S.neonGreen : t.status === "pending" ? S.neonGold : "#ff6b6b"} />
                    </div>
                  </div>
                </Card>
              ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── BUY PAGE ─────────────────────────────────────────────────────────────────
const BuyPage = ({ user, setUser, setPage, showToast }) => {
  return <WalletPage user={user} setUser={setUser} setPage={setPage} showToast={showToast} />;
};

// ─── PROFILE PAGE ─────────────────────────────────────────────────────────────
const ProfilePage = ({ user, setUser, setPage, showToast, onLogout }) => {
  const [editMode, setEditMode] = useState(false);
  const [newName, setNewName] = useState(user.name);
  const [newEmail, setNewEmail] = useState(user.email || "");
  const [tick, setTick] = useState(0);
  const txns = (DB.get("dp_transactions") || []).filter(t => t.userId === user.id);
  const freshUser = (DB.get("dp_users") || []).find(u => u.id === user.id) || user;
  const agentRequests = DB.get("dp_agent_requests") || [];
  const myAgentRequest = agentRequests.find(r => r.userId === user.id && r.status === "pending");

  const saveProfile = () => {
    if (!newName.trim()) { showToast("Name cannot be empty", "error"); return; }
    const users = DB.get("dp_users") || [];
    const updated = users.map(u => u.id === user.id ? { ...u, name: newName.trim(), email: newEmail } : u);
    DB.set("dp_users", updated);
    setUser(u => ({ ...u, name: newName.trim(), email: newEmail }));
    setEditMode(false);
    showToast("Profile updated!", "success");
  };

  const copyReferral = () => {
    navigator.clipboard?.writeText(freshUser.referralCode);
    showToast(`Referral code ${freshUser.referralCode} copied!`, "success");
  };

  const requestAgent = () => {
    const reqs = DB.get("dp_agent_requests") || [];
    const req = {
      id: `ar_${Date.now()}`, userId: freshUser.id, name: freshUser.name, phone: freshUser.phone,
      referralCode: freshUser.referralCode, status: "pending", date: new Date().toISOString(),
    };
    DB.set("dp_agent_requests", [req, ...reqs]);
    pushAdminAlert("agent_request", { userId: freshUser.id, name: freshUser.name, phone: freshUser.phone });
    setTick(t => t + 1);
    showToast("Agent request sent! Admin will review it soon.", "success");
  };

  return (
    <div style={S.page}>
      <TopBar title="👤 Profile" right={<Btn sm variant="danger" onClick={onLogout}>🚪 Logout</Btn>} />
      <div style={{ padding: "0 20px" }}>
        <Card glow style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ width: 70, height: 70, borderRadius: "50%", background: S.gradBlue, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 800, margin: "0 auto 12px" }}>{freshUser.name[0]}</div>
          {editMode ? (
            <>
              <Input label="Name" value={newName} onChange={setNewName} />
              <Input label="Email" value={newEmail} onChange={setNewEmail} placeholder="your@email.com" />
              <div style={{ display: "flex", gap: 8 }}>
                <Btn full sm variant="green" onClick={saveProfile}>Save</Btn>
                <Btn full sm variant="ghost" onClick={() => setEditMode(false)}>Cancel</Btn>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{freshUser.name}</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>📱 +91 {freshUser.phone}</div>
              {freshUser.email && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>✉️ {freshUser.email}</div>}
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>Joined {new Date(freshUser.joinedAt).toLocaleDateString("en-IN")}</div>
              <Btn sm variant="ghost" style={{ marginTop: 12 }} onClick={() => setEditMode(true)}>✏️ Edit Profile</Btn>
            </>
          )}
        </Card>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          {[["💎 Balance", `${fmt(freshUser.diamonds)} 💎`], ["💰 Deposited", fmtINR(freshUser.totalDeposited)], ["⬆️ Withdrawn", fmtINR(freshUser.totalWithdrawn)], ["🎮 Games", freshUser.gamesPlayed]].map(([l, v]) => (
            <Card key={l} style={{ textAlign: "center", padding: 14 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: S.neonBlue }}>{v}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{l}</div>
            </Card>
          ))}
        </div>

        <Card style={{ marginBottom: 16, background: "rgba(255,215,0,0.06)" }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>🎁 Your Referral Code</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: S.neonGold, letterSpacing: 2 }}>{freshUser.referralCode}</div>
            <Btn sm variant="gold" onClick={copyReferral}>📋 Copy</Btn>
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>Share this code — you get 30💎, friend gets 50💎 bonus!</div>
        </Card>

        <Card style={{ marginBottom: 16, background: freshUser.isAgent ? "rgba(0,255,136,0.06)" : "rgba(181,55,242,0.06)" }}>
          {freshUser.isAgent ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>🧑‍💼 You're a Referral Agent</div>
                <Badge label="Active" color={S.neonGreen} />
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>You earn commission on profit from users you've referred. Contact admin for your payout details.</div>
            </>
          ) : myAgentRequest ? (
            <>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>⏳ Agent Request Pending</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>Your request to become a referral agent is awaiting admin approval.</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>🧑‍💼 Become a Referral Agent</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 10 }}>Earn commission every time someone you referred deposits and plays. Request agent status below.</div>
              <Btn full sm variant="pink" onClick={requestAgent}>🚀 Request to Become Agent</Btn>
            </>
          )}
        </Card>

        <Btn full variant="ghost" onClick={() => setPage("wallet")}>📜 Transaction History</Btn>
      </div>
    </div>
  );
};

// ─── LEADERBOARD ──────────────────────────────────────────────────────────────
const LeaderboardPage = ({ user }) => {
  const users = (DB.get("dp_users") || []).filter(u => !u.isAdmin).sort((a, b) => b.diamonds - a.diamonds).slice(0, 10);
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <div style={S.page}>
      <TopBar title="🏆 Leaderboard" />
      <div style={{ padding: "0 20px" }}>
        {users.map((u, i) => (
          <Card key={u.id} style={{ marginBottom: 10, background: u.id === user.id ? "rgba(0,212,255,0.1)" : S.glass, border: u.id === user.id ? `1px solid ${S.neonBlue}` : undefined }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ fontSize: 22, width: 28 }}>{medals[i] || `#${i + 1}`}</div>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: S.gradBlue, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>{u.name[0]}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{u.name} {u.id === user.id && <Badge label="You" color={S.neonGreen} />}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{u.gamesPlayed} games played</div>
              </div>
              <div style={{ fontWeight: 800, color: S.neonGold }}>💎{fmt(u.diamonds)}</div>
            </div>
          </Card>
        ))}
        {users.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)" }}>No players yet</div>}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN PANEL
// ═══════════════════════════════════════════════════════════════════════════════

const AdminOverview = ({ setPage, onLogout }) => {
  const [alerts, setAlerts] = useState([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const i = setInterval(() => setTick(t => t + 1), 3000); // Poll every 3s for new alerts
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    const raw = DB.get("dp_notifications_admin") || [];
    setAlerts(raw.slice(0, 20));
  }, [tick]);

  const users = DB.get("dp_users") || [];
  const txns = DB.get("dp_transactions") || [];
  const realUsers = users.filter(u => !u.isAdmin);
  const deposits = txns.filter(t => t.type === "deposit");
  const withdrawals = txns.filter(t => t.type === "withdrawal");
  const pending = withdrawals.filter(t => t.status === "pending");
  const pendingDeposits = deposits.filter(t => t.status === "pending");
  const totalRevenue = deposits.filter(t => t.status === "success").reduce((s, t) => s + (t.amount || 0), 0);
  const unreadAlerts = alerts.filter(a => !a.read).length;

  // Agent / commission summary
  const cfg = DB.get("dp_platform_config") || {};
  const globalRate = cfg.agentCommissionPercent ?? 10;
  const agents = users.filter(u => u.isAgent);
  const pendingAgentRequests = (DB.get("dp_agent_requests") || []).filter(r => r.status === "pending");
  const pendingCommissionTotal = agents.reduce((sum, agent) => {
    const referred = users.filter(u => u.referredBy === agent.referralCode);
    const referredIds = new Set(referred.map(u => u.id));
    const dep = txns.filter(t => t.type === "deposit" && t.status === "success" && referredIds.has(t.userId)).reduce((s, t) => s + (t.amount || 0), 0);
    const wd = txns.filter(t => t.type === "withdrawal" && t.status === "success" && referredIds.has(t.userId)).reduce((s, t) => s + (t.amount || 0), 0);
    const profit = Math.max(0, dep - wd);
    const rate = agent.customCommissionPercent ?? globalRate;
    const earned = Math.floor(profit * rate / 100);
    return sum + Math.max(0, earned - (agent.commissionPaid || 0));
  }, 0);

  const markAllRead = () => {
    const updated = alerts.map(a => ({ ...a, read: true }));
    DB.set("dp_notifications_admin", updated);
    setAlerts(updated);
  };

  const alertIcon = { login: "🔓", new_user: "👤", deposit: "💰", deposit_pending: "⏳", withdrawal: "⬆️", agent_request: "🙋" };

  return (
    <div style={S.page}>
      <div style={{ background: "linear-gradient(180deg,#13132e,transparent)", padding: "16px 20px 10px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900 }}>⚙️ Admin Panel</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>DiamondPlay Dashboard</div>
          </div>
          <Btn sm variant="danger" onClick={onLogout}>🚪 Logout</Btn>
        </div>

        {/* Real-time Alert Banner */}
        {unreadAlerts > 0 && (
          <div style={{ background: "rgba(255,61,154,0.15)", border: `1px solid ${S.neonPink}44`, borderRadius: 14, padding: "10px 14px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>🔔 {unreadAlerts} new alert{unreadAlerts > 1 ? "s" : ""}</div>
            <button onClick={markAllRead} style={{ background: "none", border: "none", color: S.neonBlue, fontSize: 13, cursor: "pointer", fontWeight: 700 }}>Mark all read</button>
          </div>
        )}

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 8 }}>
          {[
            ["👥 Total Users", realUsers.length, S.neonBlue],
            ["💰 Revenue", fmtINR(totalRevenue), S.neonGreen],
            ["⏳ Pending Deposits", pendingDeposits.length, S.neonGold],
            ["⬆️ Pending Payouts", pending.length, S.neonOrange],
          ].map(([l, v, c]) => (
            <Card key={l} style={{ padding: 14 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: c }}>{v}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{l}</div>
            </Card>
          ))}
        </div>

        {/* Agent / Referral Commission System */}
        <Card onClick={() => setPage("admin_agents")} style={{ marginTop: 10, background: "rgba(255,215,0,0.06)", border: `1px solid ${S.neonGold}44` }} glow>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15 }}>🧑‍💼 Agent System {pendingAgentRequests.length > 0 && <Badge label={`${pendingAgentRequests.length} new`} color={S.neonPink} />}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{agents.length} agent{agents.length !== 1 ? "s" : ""} · {globalRate}% default commission</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 800, color: S.neonOrange }}>💎{fmt(pendingCommissionTotal)}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>pending →</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Recent Alerts / Activity */}
      <div style={{ padding: "0 20px" }}>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>🔔 Real-time Activity</div>
        {alerts.length === 0
          ? <Card style={{ textAlign: "center", padding: 30, color: "rgba(255,255,255,0.35)" }}>No activity yet. Waiting for users...</Card>
          : alerts.map(a => (
            <Card key={a.id} style={{ marginBottom: 8, background: a.read ? S.glass : "rgba(0,212,255,0.08)", border: a.read ? undefined : `1px solid ${S.neonBlue}33` }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ fontSize: 24 }}>{alertIcon[a.type] || "📢"}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {a.type === "new_user" && `New User: ${a.data?.userName}`}
                    {a.type === "login" && `Login: ${a.data?.userName}`}
                    {a.type === "deposit" && `Deposit: ${a.data?.userName} — ${fmtINR(a.data?.amount)}`}
                    {a.type === "deposit_pending" && `⏳ Pending Deposit: ${a.data?.userName} — ${fmtINR(a.data?.amount)} | UTR: ${a.data?.utr}`}
                    {a.type === "withdrawal" && `Withdrawal: ${a.data?.userName} — 💎${a.data?.diamonds}`}
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                    {a.data?.phone && `📱 ${a.data.phone} · `}{timeAgo(a.time)}
                  </div>
                </div>
                {!a.read && <div style={{ width: 8, height: 8, borderRadius: "50%", background: S.neonBlue }} />}
              </div>
            </Card>
          ))}
      </div>
    </div>
  );
};

const AdminUsers = () => {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [giftAmt, setGiftAmt] = useState("");
  const [tick, setTick] = useState(0);
  const users = (DB.get("dp_users") || []).filter(u => !u.isAdmin).filter(u =>
    !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.phone.includes(search)
  );

  const giftDiamonds = (userId) => {
    const amt = parseInt(giftAmt);
    if (!amt || amt <= 0) return;
    const allUsers = DB.get("dp_users") || [];
    const updated = allUsers.map(u => u.id === userId ? { ...u, diamonds: u.diamonds + amt } : u);
    DB.set("dp_users", updated);
    const txns = DB.get("dp_transactions") || [];
    DB.set("dp_transactions", [{ id: tid(), userId, type: "bonus", amount: 0, diamonds: amt, status: "success", date: new Date().toISOString(), method: "admin", note: `Admin Gift: ${amt} Diamonds` }, ...txns]);
    setGiftAmt(""); setSelected(null); setTick(t => t + 1);
  };

  const banUser = (userId) => {
    const allUsers = DB.get("dp_users") || [];
    const updated = allUsers.map(u => u.id === userId ? { ...u, banned: !u.banned } : u);
    DB.set("dp_users", updated);
    setTick(t => t + 1);
  };

  const toggleAgent = (userId) => {
    const allUsers = DB.get("dp_users") || [];
    const updated = allUsers.map(u => u.id === userId ? { ...u, isAgent: !u.isAgent } : u);
    DB.set("dp_users", updated);
    setTick(t => t + 1);
  };

  const allUsersForCount = DB.get("dp_users") || [];
  const referredCount = (code) => allUsersForCount.filter(x => x.referredBy === code).length;

  return (
    <div style={S.page}>
      <TopBar title="👥 Users" />
      <div style={{ padding: "0 20px" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search by name or phone..." style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "12px 14px", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box", marginBottom: 14 }} />
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>{users.length} user{users.length !== 1 ? "s" : ""} found</div>
        {users.map(u => (
          <Card key={u.id} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: S.gradBlue, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 18 }}>{u.name[0]}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{u.name} {u.banned && <Badge label="Banned" color="#ff6b6b" />} {u.isAgent && <Badge label="🧑‍💼 Agent" color={S.neonGold} />}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>📱 {u.phone} · {timeAgo(u.joinedAt)}</div>
                {u.isAgent && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>🔗 {referredCount(u.referralCode)} referred users</div>}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 800, color: S.neonGold }}>💎{fmt(u.diamonds)}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{u.gamesPlayed} games</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Btn sm variant="ghost" onClick={() => setSelected(selected?.id === u.id ? null : u)}>🎁 Gift</Btn>
              <Btn sm variant={u.banned ? "green" : "danger"} onClick={() => banUser(u.id)}>{u.banned ? "✓ Unban" : "🚫 Ban"}</Btn>
              <Btn sm variant={u.isAgent ? "danger" : "gold"} onClick={() => toggleAgent(u.id)}>{u.isAgent ? "Remove Agent" : "🧑‍💼 Make Agent"}</Btn>
            </div>
            {selected?.id === u.id && (
              <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                <input type="number" placeholder="Diamonds to gift" value={giftAmt} onChange={e => setGiftAmt(e.target.value)} style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: "8px 12px", color: "#fff", fontSize: 13, outline: "none" }} />
                <Btn sm variant="gold" onClick={() => giftDiamonds(u.id)}>Send</Btn>
              </div>
            )}
          </Card>
        ))}
        {users.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)" }}>No users found</div>}
      </div>
    </div>
  );
};

const AdminTxns = () => {
  const [filter, setFilter] = useState("all");
  const txns = (DB.get("dp_transactions") || []).filter(t => filter === "all" || t.type === filter).slice(0, 50);
  const users = DB.get("dp_users") || [];
  const getUserName = (id) => users.find(u => u.id === id)?.name || id;

  return (
    <div style={S.page}>
      <TopBar title="📜 Transactions" />
      <div style={{ padding: "0 20px" }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto", paddingBottom: 4 }}>
          {["all", "deposit", "withdrawal", "game_win", "bonus"].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ background: filter === f ? S.gradBlue : "rgba(255,255,255,0.06)", border: "none", color: "#fff", borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>{f.replace("_", " ")}</button>
          ))}
        </div>
        {txns.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)" }}>No transactions</div> :
          txns.map(t => (
            <Card key={t.id} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{getUserName(t.userId)}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{t.note} · {timeAgo(t.date)}</div>
                  <Badge label={t.type.replace("_", " ")} color={t.type === "deposit" ? S.neonGreen : t.type === "withdrawal" ? S.neonGold : S.neonBlue} />
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 800, color: t.diamonds > 0 ? S.neonGreen : "#ff6b6b" }}>{t.diamonds > 0 ? "+" : ""}{t.diamonds}💎</div>
                  {t.amount > 0 && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{fmtINR(t.amount)}</div>}
                  <Badge label={t.status} color={t.status === "success" ? S.neonGreen : t.status === "pending" ? S.neonGold : "#ff6b6b"} />
                </div>
              </div>
            </Card>
          ))}
      </div>
    </div>
  );
};

// ─── ADMIN DEPOSITS (manual payment approval) ─────────────────────────────────
const AdminDeposits = ({ showToast }) => {
  const [tick, setTick] = useState(0);
  const [filter, setFilter] = useState("pending");

  const allTxns = (DB.get("dp_transactions") || []).filter(t => t.type === "deposit");
  const txns = filter === "all" ? allTxns : allTxns.filter(t => t.status === filter);
  const users = DB.get("dp_users") || [];
  const getUserName = (id) => users.find(u => u.id === id)?.name || id;
  const getUserPhone = (id) => users.find(u => u.id === id)?.phone || "";

  const pendingCount = allTxns.filter(t => t.status === "pending").length;

  const approveDeposit = (txn) => {
    // Credit diamonds to user
    const allUsers = DB.get("dp_users") || [];
    const updatedUsers = allUsers.map(u =>
      u.id === txn.userId
        ? { ...u, diamonds: u.diamonds + txn.diamonds, totalDeposited: u.totalDeposited + txn.amount }
        : u
    );
    DB.set("dp_users", updatedUsers);
    // Update transaction status
    const allT = DB.get("dp_transactions") || [];
    const updatedT = allT.map(t =>
      t.id === txn.id ? { ...t, status: "success", approvedAt: new Date().toISOString() } : t
    );
    DB.set("dp_transactions", updatedT);
    // Push user notification (via their activity feed)
    const userTxns = DB.get("dp_transactions") || [];
    // Mark the txn note as approved
    const finalT = userTxns.map(t =>
      t.id === txn.id ? { ...t, note: t.note + " ✅ Approved" } : t
    );
    DB.set("dp_transactions", finalT);
    setTick(k => k + 1);
    showToast(`✅ Approved! 💎${fmt(txn.diamonds)} credited to ${getUserName(txn.userId)}`, "success");
  };

  const rejectDeposit = (txn) => {
    const allT = DB.get("dp_transactions") || [];
    const updatedT = allT.map(t =>
      t.id === txn.id ? { ...t, status: "rejected", rejectedAt: new Date().toISOString() } : t
    );
    DB.set("dp_transactions", updatedT);
    setTick(k => k + 1);
    showToast(`Deposit rejected — UTR: ${txn.utr}`, "info");
  };

  const statusColor = { pending: S.neonGold, success: S.neonGreen, rejected: "#ff6b6b" };

  return (
    <div style={S.page}>
      <TopBar title="💰 Deposit Requests" />
      <div style={{ padding: "0 20px" }}>
        {pendingCount > 0 && (
          <div style={{ background: "rgba(255,215,0,0.12)", border: `1px solid ${S.neonGold}44`, borderRadius: 14, padding: "10px 14px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 800, color: S.neonGold }}>⏳ {pendingCount} pending verification{pendingCount > 1 ? "s" : ""}</div>
            <Badge label="Action needed" color={S.neonGold} />
          </div>
        )}

        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {["pending", "success", "rejected", "all"].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ background: filter === f ? S.gradBlue : "rgba(255,255,255,0.06)", border: "none", color: "#fff", borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", textTransform: "capitalize" }}>{f}</button>
          ))}
        </div>

        {txns.length === 0
          ? <Card style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.35)" }}>No {filter} deposits</Card>
          : txns.map(t => (
            <Card key={t.id} style={{ marginBottom: 12, border: t.status === "pending" ? `1px solid ${S.neonGold}44` : undefined, background: t.status === "pending" ? "rgba(255,215,0,0.04)" : S.glass }}>
              {/* Header row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{getUserName(t.userId)}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>📱 {getUserPhone(t.userId)}</div>
                </div>
                <Badge label={t.status} color={statusColor[t.status] || S.neonBlue} />
              </div>

              {/* Amount row */}
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Pack</div>
                  <div style={{ fontWeight: 700 }}>💎 {fmt(t.diamonds)} Diamonds</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Amount</div>
                  <div style={{ fontWeight: 800, color: S.neonGold, fontSize: 18 }}>{fmtINR(t.amount)}</div>
                </div>
              </div>

              {/* UTR box */}
              {t.utr && (
                <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: "8px 12px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>UTR / Transaction ID</div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: S.neonBlue, letterSpacing: 1 }}>{t.utr}</div>
                  </div>
                  <button onClick={() => { navigator.clipboard?.writeText(t.utr); showToast("UTR copied!", "success"); }} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "#fff", padding: "6px 10px", borderRadius: 8, cursor: "pointer", fontSize: 12 }}>📋</button>
                </div>
              )}

              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 10 }}>{timeAgo(t.date)}</div>

              {/* Action buttons — only for pending */}
              {t.status === "pending" && (
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn full variant="green" sm onClick={() => approveDeposit(t)}>✅ Approve & Credit</Btn>
                  <Btn sm variant="danger" onClick={() => rejectDeposit(t)}>✕ Reject</Btn>
                </div>
              )}
              {t.status === "success" && t.approvedAt && (
                <div style={{ fontSize: 12, color: S.neonGreen }}>✅ Approved {timeAgo(t.approvedAt)}</div>
              )}
              {t.status === "rejected" && (
                <div style={{ fontSize: 12, color: "#ff6b6b" }}>✕ Rejected {t.rejectedAt ? timeAgo(t.rejectedAt) : ""}</div>
              )}
            </Card>
          ))}
      </div>
    </div>
  );
};

const AdminWithdrawals = ({ showToast }) => {  const [tick, setTick] = useState(0);
  const txns = (DB.get("dp_transactions") || []).filter(t => t.type === "withdrawal");
  const users = DB.get("dp_users") || [];
  const getUserName = (id) => users.find(u => u.id === id)?.name || id;

  const approve = (txnId) => {
    const all = DB.get("dp_transactions") || [];
    const updated = all.map(t => t.id === txnId ? { ...t, status: "success", approvedAt: new Date().toISOString() } : t);
    DB.set("dp_transactions", updated);
    setTick(t => t + 1);
    showToast("Withdrawal approved!", "success");
  };

  const reject = (txnId, userId, diamonds) => {
    const all = DB.get("dp_transactions") || [];
    const updated = all.map(t => t.id === txnId ? { ...t, status: "rejected" } : t);
    DB.set("dp_transactions", updated);
    // Refund diamonds
    const allUsers = DB.get("dp_users") || [];
    const updatedUsers = allUsers.map(u => u.id === userId ? { ...u, diamonds: u.diamonds + Math.abs(diamonds) } : u);
    DB.set("dp_users", updatedUsers);
    setTick(t => t + 1);
    showToast("Rejected & diamonds refunded", "info");
  };

  const latestTxns = (DB.get("dp_transactions") || []).filter(t => t.type === "withdrawal");

  return (
    <div style={S.page}>
      <TopBar title="⬆️ Payouts" />
      <div style={{ padding: "0 20px" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {[["Pending", latestTxns.filter(t => t.status === "pending").length, S.neonGold],
            ["Approved", latestTxns.filter(t => t.status === "success").length, S.neonGreen],
            ["Rejected", latestTxns.filter(t => t.status === "rejected").length, "#ff6b6b"]].map(([l, v, c]) => (
            <Card key={l} style={{ flex: 1, textAlign: "center", padding: 10 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: c }}>{v}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{l}</div>
            </Card>
          ))}
        </div>
        {latestTxns.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)" }}>No withdrawal requests yet</div> :
          latestTxns.map(t => (
            <Card key={t.id} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{getUserName(t.userId)}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{t.note} · {timeAgo(t.date)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 800, color: "#ff6b6b" }}>{t.diamonds}💎</div>
                  <div style={{ fontSize: 12, color: S.neonGold }}>{fmtINR(t.amount || 0)} net</div>
                </div>
              </div>
              {t.status === "pending"
                ? <div style={{ display: "flex", gap: 8 }}>
                    <Btn sm full variant="green" onClick={() => approve(t.id)}>✓ Approve & Pay</Btn>
                    <Btn sm full variant="danger" onClick={() => reject(t.id, t.userId, t.diamonds)}>✕ Reject</Btn>
                  </div>
                : <Badge label={t.status === "success" ? "✓ Approved" : "✕ Rejected"} color={t.status === "success" ? S.neonGreen : "#ff6b6b"} />}
            </Card>
          ))}
      </div>
    </div>
  );
};

// ─── ADMIN AGENT SYSTEM (Referral / Commission management) ───────────────────
// Profit generated by a referred user = their approved deposits (₹) minus their
// approved withdrawals (₹). Agent earns a % commission (global default, or a
// custom per-agent override) of the total profit generated by all users they
// referred (users whose referredBy === agent.referralCode).
const AdminAgents = ({ showToast, onBack }) => {
  const [tick, setTick] = useState(0);
  const [rateInput, setRateInput] = useState(String((DB.get("dp_platform_config") || {}).agentCommissionPercent ?? 10));
  const [customRateEdit, setCustomRateEdit] = useState(null);
  const [customRateVal, setCustomRateVal] = useState("");

  const cfg = DB.get("dp_platform_config") || {};
  const users = DB.get("dp_users") || [];
  const txns = DB.get("dp_transactions") || [];
  const agents = users.filter(u => u.isAgent);
  const pendingRequests = (DB.get("dp_agent_requests") || []).filter(r => r.status === "pending");

  const globalRate = cfg.agentCommissionPercent ?? 10;

  const approveRequest = (req) => {
    const allUsers = DB.get("dp_users") || [];
    const updatedUsers = allUsers.map(u => u.id === req.userId ? { ...u, isAgent: true } : u);
    DB.set("dp_users", updatedUsers);
    const allReqs = DB.get("dp_agent_requests") || [];
    DB.set("dp_agent_requests", allReqs.map(r => r.id === req.id ? { ...r, status: "approved" } : r));
    setTick(t => t + 1);
    showToast(`✅ ${req.name} is now a referral agent`, "success");
  };

  const rejectRequest = (req) => {
    const allReqs = DB.get("dp_agent_requests") || [];
    DB.set("dp_agent_requests", allReqs.map(r => r.id === req.id ? { ...r, status: "rejected" } : r));
    setTick(t => t + 1);
    showToast(`Request from ${req.name} rejected`, "info");
  };

  const agentStats = (agent) => {
    const referred = users.filter(u => u.referredBy === agent.referralCode);
    const referredIds = new Set(referred.map(u => u.id));
    const deposits = txns.filter(t => t.type === "deposit" && t.status === "success" && referredIds.has(t.userId))
      .reduce((s, t) => s + (t.amount || 0), 0);
    const withdrawals = txns.filter(t => t.type === "withdrawal" && t.status === "success" && referredIds.has(t.userId))
      .reduce((s, t) => s + (t.amount || 0), 0);
    const profit = Math.max(0, deposits - withdrawals);
    const rate = agent.customCommissionPercent ?? globalRate;
    const totalEarned = Math.floor(profit * rate / 100);
    const paid = agent.commissionPaid || 0;
    const pending = Math.max(0, totalEarned - paid);
    return { referredCount: referred.length, deposits, withdrawals, profit, rate, totalEarned, paid, pending };
  };

  const allStats = agents.map(a => ({ agent: a, ...agentStats(a) }));
  const totalPendingAll = allStats.reduce((s, a) => s + a.pending, 0);
  const totalPaidAll = allStats.reduce((s, a) => s + a.paid, 0);

  const saveGlobalRate = () => {
    const r = Number(rateInput);
    if (isNaN(r) || r < 0 || r > 100) { showToast("Enter a valid % between 0-100", "error"); return; }
    DB.set("dp_platform_config", { ...cfg, agentCommissionPercent: r });
    showToast(`Default agent commission set to ${r}%`, "success");
    setTick(t => t + 1);
  };

  const saveCustomRate = (agentId) => {
    const r = customRateVal.trim() === "" ? null : Number(customRateVal);
    if (r !== null && (isNaN(r) || r < 0 || r > 100)) { showToast("Enter a valid % between 0-100", "error"); return; }
    const allUsers = DB.get("dp_users") || [];
    const updated = allUsers.map(u => u.id === agentId ? { ...u, customCommissionPercent: r } : u);
    DB.set("dp_users", updated);
    setCustomRateEdit(null);
    setTick(t => t + 1);
    showToast("Custom commission rate updated!", "success");
  };

  const payCommission = (agent, pending) => {
    if (pending <= 0) { showToast("No pending commission to pay", "info"); return; }
    const allUsers = DB.get("dp_users") || [];
    const updated = allUsers.map(u =>
      u.id === agent.id ? { ...u, diamonds: u.diamonds + pending, commissionPaid: (u.commissionPaid || 0) + pending } : u
    );
    DB.set("dp_users", updated);
    const allT = DB.get("dp_transactions") || [];
    DB.set("dp_transactions", [{
      id: tid(), userId: agent.id, type: "commission", amount: 0, diamonds: pending,
      status: "success", date: new Date().toISOString(), method: "admin",
      note: `Agent Commission Payout (${agentStats(agent).rate}%)`,
    }, ...allT]);
    setTick(t => t + 1);
    showToast(`✅ 💎${fmt(pending)} commission credited to ${agent.name}`, "success");
  };

  return (
    <div style={S.page}>
      <TopBar title="🧑‍💼 Agent System" onBack={onBack} />
      <div style={{ padding: "0 20px" }}>
        {/* Global stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          <Card style={{ padding: 14 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: S.neonBlue }}>{agents.length}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>🧑‍💼 Total Agents</div>
          </Card>
          <Card style={{ padding: 14 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: S.neonOrange }}>💎{fmt(totalPendingAll)}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>⏳ Pending Commission</div>
          </Card>
        </div>

        {/* Pending agent requests from users */}
        {pendingRequests.length > 0 && (
          <>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>🙋 Agent Requests ({pendingRequests.length})</div>
            {pendingRequests.map(req => (
              <Card key={req.id} style={{ marginBottom: 12, background: "rgba(181,55,242,0.06)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>{req.name}</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>📱 {req.phone} · 🎟️ {req.referralCode}</div>
                  </div>
                  <Badge label={timeAgo(req.date)} color={S.neonPurple} />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn sm full variant="green" onClick={() => approveRequest(req)}>✓ Approve</Btn>
                  <Btn sm full variant="danger" onClick={() => rejectRequest(req)}>✕ Reject</Btn>
                </div>
              </Card>
            ))}
          </>
        )}

        {/* Global commission rate */}
        <Card style={{ marginBottom: 16, background: "rgba(255,215,0,0.05)" }}>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>⚙️ Default Commission Rate</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 10 }}>Applies to all agents unless a custom rate is set for them below.</div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <Input label="Commission % of profit" value={rateInput} onChange={setRateInput} type="number" icon="💹" />
            </div>
            <Btn onClick={saveGlobalRate} variant="green" style={{ marginBottom: 14 }}>💾 Save</Btn>
          </div>
        </Card>

        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>Agents ({agents.length})</div>

        {agents.length === 0
          ? <Card style={{ textAlign: "center", padding: 30, color: "rgba(255,255,255,0.35)" }}>
              No agents yet. Go to Users tab and tap "🧑‍💼 Make Agent" on any user to turn them into a referral agent.
            </Card>
          : allStats.map(({ agent, referredCount, deposits, withdrawals, profit, rate, totalEarned, paid, pending }) => (
            <Card key={agent.id} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{agent.name}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>📱 {agent.phone} · 🎟️ {agent.referralCode}</div>
                </div>
                <Badge label={`${rate}% rate`} color={S.neonGold} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Referred</div>
                  <div style={{ fontWeight: 700 }}>{referredCount} users</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Deposits</div>
                  <div style={{ fontWeight: 700, color: S.neonGreen }}>{fmtINR(deposits)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Withdrawals</div>
                  <div style={{ fontWeight: 700, color: "#ff6b6b" }}>{fmtINR(withdrawals)}</div>
                </div>
              </div>

              <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: "8px 12px", marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>App Profit from referrals</span>
                  <span style={{ fontWeight: 700 }}>{fmtINR(profit)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Total Commission Earned ({rate}%)</span>
                  <span style={{ fontWeight: 700, color: S.neonGold }}>💎{fmt(totalEarned)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Already Paid</span>
                  <span style={{ fontWeight: 700, color: S.neonGreen }}>💎{fmt(paid)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Pending Payout</span>
                  <span style={{ fontWeight: 800, color: S.neonOrange }}>💎{fmt(pending)}</span>
                </div>
              </div>

              {customRateEdit === agent.id ? (
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <input type="number" placeholder={`Default ${globalRate}%`} value={customRateVal} onChange={e => setCustomRateVal(e.target.value)} style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: "8px 12px", color: "#fff", fontSize: 13, outline: "none" }} />
                  <Btn sm variant="green" onClick={() => saveCustomRate(agent.id)}>✓ Set</Btn>
                  <Btn sm variant="ghost" onClick={() => setCustomRateEdit(null)}>Cancel</Btn>
                </div>
              ) : null}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Btn sm full variant="green" onClick={() => payCommission(agent, pending)} disabled={pending <= 0}>💸 Pay 💎{fmt(pending)}</Btn>
                <Btn sm variant="ghost" onClick={() => { setCustomRateEdit(agent.id); setCustomRateVal(agent.customCommissionPercent != null ? String(agent.customCommissionPercent) : ""); }}>✏️ Custom %</Btn>
              </div>
            </Card>
          ))}
      </div>
    </div>
  );
};

// ─── ADMIN CONFIG (Customize Everything) ──────────────────────────────────────
const AdminConfig = ({ showToast }) => {
  const [cfg, setCfg] = useState(DB.get("dp_platform_config") || {});
  const [packs, setPacks] = useState(DB.get("dp_diamond_packs") || []);
  const [tab, setTab] = useState("general");
  const [editPack, setEditPack] = useState(null);

  const saveCfg = () => {
    DB.set("dp_platform_config", cfg);
    showToast("Settings saved!", "success");
  };

  const savePacks = () => {
    DB.set("dp_diamond_packs", packs);
    showToast("Diamond packs updated!", "success");
  };

  const updatePack = (id, field, val) => {
    setPacks(prev => prev.map(p => p.id === id ? { ...p, [field]: field === "popular" ? val : (isNaN(val) ? val : Number(val)) } : p));
  };

  const addPack = () => {
    const newPack = { id: `p_${Date.now()}`, diamonds: 100, price: 100, bonus: 0, popular: false, label: "New Pack" };
    setPacks(prev => [...prev, newPack]);
    setEditPack(newPack.id);
  };

  const deletePack = (id) => { setPacks(prev => prev.filter(p => p.id !== id)); };

  return (
    <div style={S.page}>
      <TopBar title="⚙️ App Settings" />
      <div style={{ padding: "0 20px" }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto" }}>
          {["general", "payment", "games", "color", "packs", "tournament"].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ background: tab === t ? S.gradBlue : "rgba(255,255,255,0.06)", border: "none", color: "#fff", borderRadius: 20, padding: "7px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", textTransform: "capitalize" }}>{t === "color" ? "🎨 Color" : t === "tournament" ? "🏆 Tournament" : t}</button>
          ))}
        </div>

        {tab === "general" && (
          <div>
            <Input label="Site Name" value={cfg.siteName || ""} onChange={v => setCfg(c => ({ ...c, siteName: v }))} icon="🏷️" />
            <Input label="Banner Text" value={cfg.bannerText || ""} onChange={v => setCfg(c => ({ ...c, bannerText: v }))} icon="📢" />
            <Input label="Welcome Bonus (Diamonds)" value={String(cfg.welcomeBonus || 50)} onChange={v => setCfg(c => ({ ...c, welcomeBonus: Number(v) }))} type="number" icon="🎁" />
            <Input label="Daily Reward (Diamonds)" value={String(cfg.dailyReward || 25)} onChange={v => setCfg(c => ({ ...c, dailyReward: Number(v) }))} type="number" icon="📅" />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
              <div>
                <div style={{ fontWeight: 700 }}>Maintenance Mode</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Disable user access temporarily</div>
              </div>
              <button onClick={() => setCfg(c => ({ ...c, maintenanceMode: !c.maintenanceMode }))} style={{ width: 52, height: 28, borderRadius: 14, background: cfg.maintenanceMode ? S.neonPink : "rgba(255,255,255,0.15)", border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s" }}>
                <div style={{ position: "absolute", top: 4, left: cfg.maintenanceMode ? 28 : 4, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
              </button>
            </div>
            <Btn full variant="green" onClick={saveCfg}>💾 Save General Settings</Btn>
          </div>
        )}

        {tab === "payment" && (
          <div>
            <Input label="UPI ID" value={cfg.upiId || ""} onChange={v => setCfg(c => ({ ...c, upiId: v }))} icon="📲" placeholder="yourapp@upi" />
            <Input label="UPI Name (shown to users)" value={cfg.upiName || ""} onChange={v => setCfg(c => ({ ...c, upiName: v }))} icon="🏷️" />
            <Input label="Minimum Deposit (₹)" value={String(cfg.minDeposit || 100)} onChange={v => setCfg(c => ({ ...c, minDeposit: Number(v) }))} type="number" icon="⬇️" />
            <Input label="Minimum Withdrawal (Diamonds)" value={String(cfg.minWithdraw || 200)} onChange={v => setCfg(c => ({ ...c, minWithdraw: Number(v) }))} type="number" icon="⬆️" />
            <Input label="Withdrawal Fee (%)" value={String(cfg.withdrawFeePercent || 5)} onChange={v => setCfg(c => ({ ...c, withdrawFeePercent: Number(v) }))} type="number" icon="💸" />
            <Card style={{ background: "rgba(255,215,0,0.05)", marginBottom: 14 }}>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>💡 For real payment gateway, integrate Razorpay/Cashfree API keys here. Contact developer to enable webhook-based auto-verification.</div>
            </Card>
            <Btn full variant="green" onClick={saveCfg}>💾 Save Payment Settings</Btn>
          </div>
        )}

        {tab === "games" && (
          <div>
            <Input label="Game Cost (Diamonds per game)" value={String(cfg.gameCost || 5)} onChange={v => setCfg(c => ({ ...c, gameCost: Number(v) }))} type="number" icon="🎮" />
            <Input label="Scratch Card Cost (Diamonds)" value={String(cfg.scratchCost || 10)} onChange={v => setCfg(c => ({ ...c, scratchCost: Number(v) }))} type="number" icon="🃏" />
            <Card style={{ background: "rgba(0,212,255,0.05)", marginBottom: 14 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Game Multipliers</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Color Prediction: Red/Green = 2x, Violet = 4.5x<br />Dice: Exact = 6x (30💎 from 5💎)<br />Number: Exact = 9x, ±1 = 1.6x</div>
            </Card>
            <Btn full variant="green" onClick={saveCfg}>💾 Save Game Settings</Btn>
          </div>
        )}

        {tab === "color" && <AdminColorControl showToast={showToast} />}

        {tab === "packs" && (
          <div>
            {packs.map(p => (
              <Card key={p.id} style={{ marginBottom: 10 }}>
                {editPack === p.id ? (
                  <div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <Input label="Label" value={p.label} onChange={v => updatePack(p.id, "label", v)} />
                      <Input label="Price ₹" value={String(p.price)} onChange={v => updatePack(p.id, "price", v)} type="number" />
                      <Input label="Diamonds" value={String(p.diamonds)} onChange={v => updatePack(p.id, "diamonds", v)} type="number" />
                      <Input label="Bonus 💎" value={String(p.bonus)} onChange={v => updatePack(p.id, "bonus", v)} type="number" />
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10 }}>
                      <label style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Popular:</label>
                      <input type="checkbox" checked={p.popular} onChange={e => updatePack(p.id, "popular", e.target.checked)} />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Btn sm full variant="green" onClick={() => { savePacks(); setEditPack(null); }}>✓ Save</Btn>
                      <Btn sm full variant="ghost" onClick={() => setEditPack(null)}>Cancel</Btn>
                      <Btn sm variant="danger" onClick={() => { deletePack(p.id); setEditPack(null); }}>🗑️</Btn>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{p.label} {p.popular && <Badge label="Popular" color={S.neonGold} />}</div>
                      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>{fmt(p.diamonds + p.bonus)}💎 · {fmtINR(p.price)}</div>
                    </div>
                    <Btn sm variant="ghost" onClick={() => setEditPack(p.id)}>✏️ Edit</Btn>
                  </div>
                )}
              </Card>
            ))}
            <Btn full variant="primary" onClick={addPack} style={{ marginBottom: 10 }}>+ Add New Pack</Btn>
            <Btn full variant="green" onClick={savePacks}>💾 Save All Packs</Btn>
          </div>
        )}

        {tab === "tournament" && <TournamentManagement cfg={cfg} setCfg={setCfg} saveCfg={saveCfg} showToast={showToast} />}
      </div>
    </div>
  );
};

// ─── TOURNAMENT MANAGEMENT (Admin Settings → Tournament tab) ─────────────────
// Lets the admin turn the weekly tournament on/off overall, enable/disable each
// individual game's participation in it, and see the live standings across
// every game at a glance.
const ALL_GAMES = [
  { id: "color",   name: "Color Prediction", emoji: "🎨" },
  { id: "dice",    name: "Dice Roll",        emoji: "🎲" },
  { id: "number",  name: "Number Pick",      emoji: "🔢" },
  { id: "scratch", name: "Scratch Card",     emoji: "🃏" },
];

const TournamentManagement = ({ cfg, setCfg, saveCfg, showToast }) => {
  const [tourTime] = useState(getTournamentInfo());
  const gameTournaments = cfg.gameTournaments || { color: true, dice: true, number: true, scratch: true };
  const prizes = cfg.tournamentPrizes && cfg.tournamentPrizes.length
    ? cfg.tournamentPrizes
    : TOURNAMENT_PRIZES.map(p => ({ ...p, active: true }));
  const topPlayers = (DB.get("dp_users") || []).filter(u => !u.isAdmin).sort((a, b) => b.gamesPlayed - a.gamesPlayed).slice(0, 5);
  const medals = ["🥇", "🥈", "🥉"];

  const toggleOverall = () => {
    const next = { ...cfg, tournamentEnabled: !cfg.tournamentEnabled };
    setCfg(next);
    DB.set("dp_platform_config", next);
    showToast(next.tournamentEnabled ? "Tournament enabled" : "Tournament disabled", next.tournamentEnabled ? "success" : "info");
  };

  const toggleGame = (gameId) => {
    const nextGT = { ...gameTournaments, [gameId]: !gameTournaments[gameId] };
    const next = { ...cfg, gameTournaments: nextGT };
    setCfg(next);
    DB.set("dp_platform_config", next);
    showToast(`${ALL_GAMES.find(g => g.id === gameId)?.name} ${nextGT[gameId] ? "added to" : "removed from"} tournament`, "success");
  };

  const updatePrizeAmount = (rank, val) => {
    const n = val === "" ? "" : Math.max(0, Number(val) || 0);
    setCfg(c => ({ ...c, tournamentPrizes: prizes.map(p => p.rank === rank ? { ...p, prize: n } : p) }));
  };

  const togglePrizeActive = (rank) => {
    setCfg(c => ({ ...c, tournamentPrizes: prizes.map(p => p.rank === rank ? { ...p, active: !p.active } : p) }));
  };

  const savePrizes = () => {
    const cleaned = prizes.map(p => ({ ...p, prize: Number(p.prize) || 0 }));
    const next = { ...cfg, tournamentPrizes: cleaned };
    setCfg(next);
    DB.set("dp_platform_config", next);
    showToast("Prize distribution saved!", "success");
  };

  return (
    <div>
      <Card style={{ marginBottom: 14, background: "rgba(255,215,0,0.06)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>🏆 Weekly Tournament</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Resets every Monday · {tourTime.daysLeft}d {tourTime.hoursLeft}h {tourTime.minsLeft}m left</div>
          </div>
          <button onClick={toggleOverall} style={{ width: 52, height: 28, borderRadius: 14, background: cfg.tournamentEnabled ? S.neonGreen : "rgba(255,255,255,0.15)", border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
            <div style={{ position: "absolute", top: 4, left: cfg.tournamentEnabled ? 28 : 4, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
          </button>
        </div>
      </Card>

      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>🎮 All Games</div>
      {ALL_GAMES.map(g => (
        <Card key={g.id} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 24 }}>{g.emoji}</div>
              <div>
                <div style={{ fontWeight: 700 }}>{g.name}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{gameTournaments[g.id] ? "✅ Counts toward tournament" : "🚫 Excluded from tournament"}</div>
              </div>
            </div>
            <button onClick={() => toggleGame(g.id)} style={{ width: 48, height: 26, borderRadius: 13, background: gameTournaments[g.id] ? S.neonBlue : "rgba(255,255,255,0.15)", border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
              <div style={{ position: "absolute", top: 3, left: gameTournaments[g.id] ? 25 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
            </button>
          </div>
        </Card>
      ))}

      <div style={{ fontSize: 14, fontWeight: 800, margin: "16px 0 10px" }}>🥇 Prize Distribution</div>
      <Card style={{ marginBottom: 6, background: "rgba(0,212,255,0.05)" }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>💡 Set how many diamonds each rank wins. Turn a rank OFF to skip paying it out this week.</div>
      </Card>
      {prizes.map(p => (
        <Card key={p.rank} style={{ marginBottom: 10, opacity: p.active ? 1 : 0.5 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: p.active ? 10 : 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{p.label}</div>
            <button onClick={() => togglePrizeActive(p.rank)} style={{ width: 48, height: 26, borderRadius: 13, background: p.active ? S.neonGreen : "rgba(255,255,255,0.15)", border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
              <div style={{ position: "absolute", top: 3, left: p.active ? 25 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
            </button>
          </div>
          {p.active && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="number" min="0" value={p.prize}
                onChange={e => updatePrizeAmount(p.rank, e.target.value)}
                style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: "10px 12px", color: "#fff", fontSize: 15, fontWeight: 700, outline: "none" }}
              />
              <span style={{ color: p.color, fontWeight: 800 }}>💎</span>
            </div>
          )}
        </Card>
      ))}
      <Btn full variant="green" onClick={savePrizes} style={{ marginBottom: 16 }}>💾 Save Prize Distribution</Btn>

      <div style={{ fontSize: 14, fontWeight: 800, margin: "16px 0 10px" }}>📊 Live Standings (Top 5)</div>
      {topPlayers.length === 0
        ? <Card style={{ textAlign: "center", padding: 24, color: "rgba(255,255,255,0.35)" }}>No players yet</Card>
        : topPlayers.map((p, i) => (
          <Card key={p.id} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 18, width: 24 }}>{medals[i] || `#${i + 1}`}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{p.gamesPlayed} games played</div>
              </div>
              <div style={{ fontWeight: 800, color: S.neonGold }}>💎{fmt(p.diamonds)}</div>
            </div>
          </Card>
        ))}
    </div>
  );
};

// ─── NOTIFICATION PANEL ───────────────────────────────────────────────────────
const NotifPanel = ({ open, onClose, userId }) => {
  const [notifs, setNotifs] = useState([]);
  useEffect(() => {
    if (open) {
      const txns = (DB.get("dp_transactions") || []).filter(t => t.userId === userId && (t.type === "bonus" || t.type === "deposit" || t.type === "withdrawal")).slice(0, 15);
      setNotifs(txns);
    }
  }, [open, userId]);
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 500 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "85%", maxWidth: 360, background: "#13132e", padding: 20, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>🔔 Activity</div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "#fff", borderRadius: 50, width: 32, height: 32, cursor: "pointer" }}>✕</button>
        </div>
        {notifs.length === 0
          ? <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)" }}>No recent activity</div>
          : notifs.map(n => (
            <div key={n.id} style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: 22 }}>{n.type === "deposit" ? "💰" : n.type === "withdrawal" ? "⬆️" : "🎁"}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{n.note}</div>
                <div style={{ fontSize: 12, color: n.diamonds > 0 ? S.neonGreen : "#ff6b6b", marginBottom: 2 }}>{n.diamonds > 0 ? "+" : ""}{n.diamonds}💎</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{timeAgo(n.date)}</div>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
};

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState("landing");
  const [user, setUser] = useState(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [toast, setToast] = useState({ msg: "", type: "info" });
  const toastRef = useRef(null);

  useEffect(() => { initDB(); }, []);

  // Restore session on reload
  useEffect(() => {
    const session = DB.get("dp_session");
    if (session) {
      const users = DB.get("dp_users") || [];
      const u = users.find(x => x.id === session.userId);
      if (u) { setUser(u); setPage(u.isAdmin ? "admin" : "home"); }
    }
  }, []);

  const showToast = (msg, type = "info") => {
    setToast({ msg, type });
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast({ msg: "", type: "info" }), 3200);
  };

  const logout = () => {
    DB.del("dp_session");
    setUser(null);
    setPage("landing");
    showToast("Logged out successfully", "info");
  };

  const isAdmin = user?.isAdmin;
  const cfg = DB.get("dp_platform_config") || {};

  // Maintenance check for non-admins
  if (cfg.maintenanceMode && user && !isAdmin) {
    return (
      <>
        <style>{CSS}</style>
        <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
          <div style={{ textAlign: "center", padding: 40 }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🔧</div>
            <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Under Maintenance</div>
            <div style={{ color: "rgba(255,255,255,0.5)" }}>We'll be back soon! Check back later.</div>
            <Btn style={{ marginTop: 20 }} onClick={logout}>← Go Back</Btn>
          </div>
        </div>
      </>
    );
  }

  const renderPage = () => {
    if (!user) {
      if (page === "auth") return <AuthPage mode={page === "auth" ? (window.__authMode || "login") : "login"} setUser={setUser} setPage={setPage} showToast={showToast} />;
      return <LandingPage setPage={p => { if (p === "auth") {} setPage(p); }} setAuthMode={m => { window.__authMode = m; }} />;
    }
    if (isAdmin) {
      if (page === "admin_color")    return <AdminColorPage showToast={showToast} />;
      if (page === "admin_games")    return <AdminGamesHub setPage={setPage} showToast={showToast} />;
      if (page === "admin_users")    return <AdminUsers />;
      if (page === "admin_txn")      return <AdminTxns />;
      if (page === "admin_deposits") return <AdminDeposits showToast={showToast} />;
      if (page === "admin_withdraw") return <AdminWithdrawals showToast={showToast} />;
      if (page === "admin_config")   return <AdminConfig showToast={showToast} />;
      if (page === "admin_agents")   return <AdminAgents showToast={showToast} onBack={() => setPage("admin")} />;
      return <AdminOverview setPage={setPage} onLogout={logout} />;
    }
    const props = { user, setUser, setPage, showToast };
    switch (page) {
      case "home": return <HomePage {...props} setNotifOpen={setNotifOpen} notifications={[]} />;
      case "games": return <GamesPage setPage={setPage} />;
      case "game_color": return <ColorGame {...props} />;
      case "game_dice": return <DiceGame {...props} />;
      case "game_number": return <NumberGame {...props} />;
      case "game_scratch": return <ScratchGame {...props} />;
      case "wallet": case "buy": return <WalletPage {...props} />;
      case "profile": return <ProfilePage {...props} onLogout={logout} />;
      case "leaderboard": return <LeaderboardPage user={user} />;
      default: return <HomePage {...props} setNotifOpen={setNotifOpen} notifications={[]} />;
    }
  };

  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
    * { box-sizing: border-box; }
    body { margin: 0; background: #0a0a1a; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
    @keyframes pulse { 0%,100% { transform: scale(1); opacity:1; } 50% { transform: scale(1.12); opacity:0.85; } }
    @keyframes confettiFall0 { 0%{transform:translateY(0) scale(1) rotate(0deg);opacity:1} 100%{transform:translateY(-90px) scale(0) rotate(360deg);opacity:0} }
    @keyframes confettiFall1 { 0%{transform:translateY(0) scale(1) rotate(0deg);opacity:1} 100%{transform:translateY(-70px) translateX(30px) scale(0) rotate(-180deg);opacity:0} }
    @keyframes confettiFall2 { 0%{transform:translateY(0) scale(1) rotate(0deg);opacity:1} 100%{transform:translateY(-80px) translateX(-20px) scale(0) rotate(270deg);opacity:0} }
    @keyframes resultSlide { from{transform:translateY(20px);opacity:0} to{transform:translateY(0);opacity:1} }
    @keyframes otpShake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-8px)} 40%{transform:translateX(8px)} 60%{transform:translateX(-6px)} 80%{transform:translateX(6px)} }
    @keyframes otpPop { 0%{transform:scale(0.7)} 60%{transform:scale(1.15)} 100%{transform:scale(1)} }
    ::-webkit-scrollbar { width: 0; }
    input, button { font-family: 'Inter', sans-serif; }
  `;

  // Handle landing page auth navigation
  const handleSetPage = (p) => {
    if (p === "auth") setPage("auth");
    else setPage(p);
  };

  return (
    <>
      <style>{CSS}</style>
      <Toast msg={toast.msg} type={toast.type} />
      <div style={S.app}>
        <div style={{ background: S.gradDark, minHeight: "100vh" }}>
          {!user ? (
            page === "auth"
              ? <AuthPage mode={window.__authMode || "login"} setUser={setUser} setPage={setPage} showToast={showToast} />
              : <LandingPage setPage={handleSetPage} setAuthMode={m => { window.__authMode = m; setPage("auth"); }} />
          ) : (
            <>
              {renderPage()}
              <BottomNav page={page} setPage={setPage} isAdmin={isAdmin} />
              <NotifPanel open={notifOpen} onClose={() => setNotifOpen(false)} userId={user.id} />
            </>
          )}
        </div>
      </div>
    </>
  );
}
