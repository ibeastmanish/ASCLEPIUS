//! ASCLEPIUS desktop build.
//!
//! The UI is the same web app. This crate adds one thing: Earth messages are signed and
//! encrypted with Hermes (`aura`, the team's earlier open-source OpenPGP library) instead of
//! WebCrypto. It exposes six commands to the UI:
//!
//! | Command         | Hermes functions used                                         |
//! |-----------------|---------------------------------------------------------------|
//! | `hermes_unlock` | `create_identity`, `save_identity_to_vault`, `load_identity_from_vault` |
//! | `hermes_lock`   | drops the keys from memory (they zeroize on drop)             |
//! | `hermes_status` | key fingerprints                                              |
//! | `hermes_seal`   | `sign_message` (crew key), then `encrypt_message` (to ground) |
//! | `hermes_open`   | `decrypt_message` (ground key), then `verify_message` (crew)  |
//! | `hermes_erase`  | deletes the key vault files                                   |
//!
//! The flight-surgeon ("ground") key is a **simulated ground station** that lives on this
//! device so the demo can show decryption and tamper detection. In a real mission only its
//! public key would be on board.

use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

use anyhow::{anyhow, bail, Context, Result};
use aura::{Identity, MaskedMemory, PublicKey};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use zeroize::Zeroizing;

/// Shown in the Outbox "Ground view".
pub const ALG: &str = "OpenPGP via Hermes aura (Sequoia): Ed25519 signature by the crew key, X25519 encryption to the flight surgeon key";

const CREW_UID: &str = "ASCLEPIUS crew member <crew@asclepius.invalid>";
const GROUND_UID: &str = "ASCLEPIUS simulated flight surgeon ground station <ground@asclepius.invalid>";
/// Same rule as the web vault.
const MIN_PASSPHRASE: usize = 8;

struct Keys {
    crew: Identity,
    ground: Identity,
    /// The vault passphrase, XOR-masked in memory; both OpenPGP secret keys are locked with it.
    pass: MaskedMemory,
}

/// Holds the unlocked keys. Nothing here touches the network.
pub struct Hermes {
    dir: PathBuf,
    keys: Mutex<Option<Keys>>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub unlocked: bool,
    /// True when this unlock generated new keys.
    pub created: bool,
    pub alg: &'static str,
    pub crew_fingerprint: Option<String>,
    pub ground_fingerprint: Option<String>,
    pub ground_simulated: bool,
}

fn fingerprint(pk: &PublicKey) -> Option<String> {
    use sequoia_openpgp::{parse::Parse, Cert};
    Cert::from_bytes(&pk.bytes).ok().map(|c| c.fingerprint().to_spaced_hex())
}

fn public(id: &Identity) -> PublicKey {
    PublicKey { bytes: id.public_key.bytes.clone() }
}

impl Hermes {
    pub fn new(dir: impl Into<PathBuf>) -> Self {
        Self { dir: dir.into(), keys: Mutex::new(None) }
    }

    fn crew_path(&self) -> PathBuf {
        self.dir.join("crew.hvault")
    }

    fn ground_path(&self) -> PathBuf {
        self.dir.join("ground.hvault")
    }

    fn guard(&self) -> std::sync::MutexGuard<'_, Option<Keys>> {
        // A panic while holding the lock cannot leave the keys half-written; recover the guard.
        self.keys.lock().unwrap_or_else(|p| p.into_inner())
    }

    /// Unlock with the vault passphrase. `create` (first setup) always makes new keys;
    /// otherwise the saved keys are loaded, or made if there are none yet.
    pub fn unlock(&self, passphrase: &str, create: bool) -> Result<Status> {
        if passphrase.chars().count() < MIN_PASSPHRASE {
            bail!("Passphrase must be at least {MIN_PASSPHRASE} characters");
        }
        let exists = self.crew_path().exists() && self.ground_path().exists();
        let created = create || !exists;
        let (crew, ground) = if created {
            fs::create_dir_all(&self.dir).context("creating the key folder")?;
            let crew = aura::create_identity(passphrase, CREW_UID, "cv25519")?;
            let ground = aura::create_identity(passphrase, GROUND_UID, "cv25519")?;
            aura::save_identity_to_vault(&crew, passphrase, &self.crew_path())?;
            aura::save_identity_to_vault(&ground, passphrase, &self.ground_path())?;
            (crew, ground)
        } else {
            (
                aura::load_identity_from_vault(passphrase, &self.crew_path())?,
                aura::load_identity_from_vault(passphrase, &self.ground_path())?,
            )
        };
        *self.guard() = Some(Keys { crew, ground, pass: MaskedMemory::new(passphrase.as_bytes()) });
        Ok(Status { created, ..self.status() })
    }

    pub fn lock(&self) {
        *self.guard() = None;
    }

    pub fn status(&self) -> Status {
        let g = self.guard();
        Status {
            unlocked: g.is_some(),
            created: false,
            alg: ALG,
            crew_fingerprint: g.as_ref().and_then(|k| fingerprint(&k.crew.public_key)),
            ground_fingerprint: g.as_ref().and_then(|k| fingerprint(&k.ground.public_key)),
            ground_simulated: true,
        }
    }

    fn with_keys<T>(&self, f: impl FnOnce(&Keys, &str) -> Result<T>) -> Result<T> {
        let g = self.guard();
        let k = g.as_ref().ok_or_else(|| anyhow!("Hermes is locked"))?;
        let pass = Zeroizing::new(String::from_utf8(k.pass.unmask()).context("passphrase encoding")?);
        f(k, &pass)
    }

    /// Crew side: sign `body` with the crew key, then encrypt body + signature to the ground key.
    /// Inner layout: u32 LE body length | body | detached OpenPGP signature.
    pub fn seal(&self, body: &[u8]) -> Result<Vec<u8>> {
        self.with_keys(|k, pass| {
            let sig = aura::sign_message(body, &k.crew.private_key, pass)?;
            let len = u32::try_from(body.len()).context("message too large")?;
            let mut inner = Zeroizing::new(Vec::with_capacity(4 + body.len() + sig.len()));
            inner.extend_from_slice(&len.to_le_bytes());
            inner.extend_from_slice(body);
            inner.extend_from_slice(&sig);
            aura::encrypt_message(&inner, &[public(&k.ground)])
        })
    }

    /// Ground side: decrypt with the ground key and check the crew signature.
    /// Fails if any bit changed or the message was not signed by this crew key.
    pub fn open(&self, sealed: &[u8]) -> Result<Vec<u8>> {
        self.with_keys(|k, pass| {
            let inner = Zeroizing::new(
                aura::decrypt_message(sealed, &k.ground.private_key, pass).map_err(|e| anyhow!("decryption failed: {e}"))?,
            );
            if inner.len() < 4 {
                bail!("malformed message");
            }
            let len = u32::from_le_bytes([inner[0], inner[1], inner[2], inner[3]]) as usize;
            let body = inner.get(4..4 + len).ok_or_else(|| anyhow!("malformed message"))?;
            let sig = &inner[4 + len..];
            match aura::verify_message(body, sig, &k.crew.public_key) {
                Ok(true) => Ok(body.to_vec()),
                _ => bail!("signature check failed: not signed by this crew key"),
            }
        })
    }

    /// Delete the key files (used when the Health Vault is erased).
    pub fn erase(&self) -> Result<()> {
        self.lock();
        for p in [self.crew_path(), self.ground_path()] {
            if p.exists() {
                fs::remove_file(&p).with_context(|| format!("removing {}", p.display()))?;
            }
        }
        Ok(())
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }
}

// ---------------------------------------------------------------------------------------------
// Tauri commands. Bytes cross the bridge as base64. Errors become plain strings for the UI.

fn err(e: anyhow::Error) -> String {
    format!("{e:#}")
}

fn b64(s: &str) -> Result<Vec<u8>, String> {
    B64.decode(s.trim()).map_err(|e| format!("bad base64: {e}"))
}

#[tauri::command]
async fn hermes_unlock(hermes: State<'_, Hermes>, passphrase: String, create: bool) -> Result<Status, String> {
    let passphrase = Zeroizing::new(passphrase);
    hermes.unlock(&passphrase, create).map_err(err)
}

#[tauri::command]
fn hermes_lock(hermes: State<'_, Hermes>) {
    hermes.lock();
}

#[tauri::command]
fn hermes_status(hermes: State<'_, Hermes>) -> Status {
    hermes.status()
}

#[tauri::command]
async fn hermes_seal(hermes: State<'_, Hermes>, body: String) -> Result<String, String> {
    hermes.seal(&b64(&body)?).map(|v| B64.encode(v)).map_err(err)
}

#[tauri::command]
async fn hermes_open(hermes: State<'_, Hermes>, payload: String) -> Result<String, String> {
    hermes.open(&b64(&payload)?).map(|v| B64.encode(v)).map_err(err)
}

#[tauri::command]
fn hermes_erase(hermes: State<'_, Hermes>) -> Result<(), String> {
    hermes.erase().map_err(err)
}

// Self-test mode (ASCLEPIUS_SELFTEST=1): the real app runs its own end-to-end check inside the
// real webview, prints a JSON report and exits. Keys go to a temporary folder, never the user's.

struct SelfTest(bool);

#[derive(Serialize)]
struct AppMode {
    selftest: bool,
    desktop: bool,
    version: &'static str,
}

#[tauri::command]
fn app_mode(st: State<'_, SelfTest>) -> AppMode {
    AppMode { selftest: st.0, desktop: true, version: env!("CARGO_PKG_VERSION") }
}

#[tauri::command]
fn selftest_log(st: State<'_, SelfTest>, line: String) {
    if st.0 {
        println!("ASCLEPIUS_SELFTEST_STEP {line}");
    }
}

#[tauri::command]
fn selftest_done(app: AppHandle, st: State<'_, SelfTest>, hermes: State<'_, Hermes>, ok: bool, report: serde_json::Value) {
    if !st.0 {
        return;
    }
    println!("ASCLEPIUS_SELFTEST {}", serde_json::json!({ "ok": ok, "report": report }));
    let _ = fs::remove_dir_all(hermes.dir());
    app.exit(if ok { 0 } else { 1 });
}

pub fn run() {
    let selftest = std::env::var_os("ASCLEPIUS_SELFTEST").is_some();
    tauri::Builder::default()
        .setup(move |app| {
            let dir = if selftest {
                std::env::temp_dir().join(format!("asclepius-selftest-{}", std::process::id()))
            } else {
                app.path().app_data_dir()?.join("hermes")
            };
            app.manage(Hermes::new(dir));
            app.manage(SelfTest(selftest));
            if selftest {
                // Never hang a CI job: give up after 120 s.
                std::thread::spawn(|| {
                    std::thread::sleep(std::time::Duration::from_secs(120));
                    eprintln!("ASCLEPIUS_SELFTEST timeout");
                    std::process::exit(3);
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            hermes_unlock,
            hermes_lock,
            hermes_status,
            hermes_seal,
            hermes_open,
            hermes_erase,
            app_mode,
            selftest_log,
            selftest_done
        ])
        .run(tauri::generate_context!())
        .expect("error while running ASCLEPIUS");
}

// ---------------------------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    const PASS: &str = "correct horse battery";

    fn temp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("asclepius-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        d
    }

    fn unlocked(name: &str) -> Hermes {
        let h = Hermes::new(temp(name));
        let s = h.unlock(PASS, true).unwrap();
        assert!(s.unlocked && s.created);
        h
    }

    #[test]
    fn seal_then_open_round_trip() {
        let h = unlocked("roundtrip");
        let body = b"{\"overall\":\"red\",\"day\":212}".to_vec();
        let sealed = h.seal(&body).unwrap();
        assert!(!sealed.windows(body.len()).any(|w| w == body.as_slice()), "plaintext must not appear in the sealed message");
        assert_eq!(h.open(&sealed).unwrap(), body);
        h.erase().unwrap();
    }

    #[test]
    fn one_flipped_bit_is_rejected() {
        let h = unlocked("tamper");
        let mut sealed = h.seal(b"daily digest").unwrap();
        let i = sealed.len() - 8; // same byte the Outbox tamper test flips
        sealed[i] ^= 0x20;
        assert!(h.open(&sealed).is_err());
        h.erase().unwrap();
    }

    #[test]
    fn wrong_signer_is_rejected() {
        let h = unlocked("signer");
        let impostor = aura::create_identity(PASS, "Impostor <x@asclepius.invalid>", "cv25519").unwrap();
        let body = b"forged red alert";
        let forged = h
            .with_keys(|k, _| {
                let sig = aura::sign_message(body, &impostor.private_key, PASS)?;
                let mut inner = (body.len() as u32).to_le_bytes().to_vec();
                inner.extend_from_slice(body);
                inner.extend_from_slice(&sig);
                aura::encrypt_message(&inner, &[public(&k.ground)])
            })
            .unwrap();
        let e = h.open(&forged).unwrap_err().to_string();
        assert!(e.contains("signature"), "{e}");
        h.erase().unwrap();
    }

    #[test]
    fn keys_persist_and_wrong_passphrase_fails() {
        let h = unlocked("persist");
        let before = h.status();
        let sealed = h.seal(b"kept across restarts").unwrap();
        h.lock();
        assert!(!h.status().unlocked);
        assert!(h.seal(b"x").is_err(), "locked Hermes must not sign");

        let again = Hermes::new(h.dir().to_path_buf());
        assert!(again.unlock("wrong passphrase", false).is_err());
        let s = again.unlock(PASS, false).unwrap();
        assert!(!s.created);
        assert_eq!(s.crew_fingerprint, before.crew_fingerprint);
        assert_eq!(s.ground_fingerprint, before.ground_fingerprint);
        assert_eq!(again.open(&sealed).unwrap(), b"kept across restarts");

        again.erase().unwrap();
        assert!(!again.crew_path().exists() && !again.ground_path().exists());
    }

    #[test]
    fn short_passphrase_is_refused() {
        let h = Hermes::new(temp("short"));
        assert!(h.unlock("short", true).is_err());
    }

    #[test]
    fn fingerprints_are_distinct_openpgp_fingerprints() {
        let h = unlocked("fpr");
        let s = h.status();
        let (c, g) = (s.crew_fingerprint.unwrap(), s.ground_fingerprint.unwrap());
        assert_ne!(c, g);
        assert!(c.replace(' ', "").len() >= 40, "{c}");
        h.erase().unwrap();
    }
}
