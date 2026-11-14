# Security

ASCLEPIUS is a hackathon prototype and **decision support, not a medical device**. It has not had a security audit.

## What protects the data
- **On the tablet:** every event is encrypted with AES-GCM 256 in IndexedDB. The key is derived from the passphrase (PBKDF2-SHA-256, 600,000 iterations) and kept only in memory.
- **To Earth:** messages are signed with the crew key (ECDSA P-256), encrypted to the ground station's public key (ECDH P-256 + AES-GCM 256), and carry a signed sequence number; the Ground Station rejects replays.
- The crew tablet never holds the ground station's private key.
- **Traffic padding:** every sealed message is padded to the same size (4 KB blocks) before encryption, so message size does not reveal whether it is an emergency. The idea comes from the author's earlier project Hermes; the code here is written fresh for the web app.

## Known limits
- **Demo keys are public.** The shipped "demo ground station" keys are in this repository so the two pages work out of the box. They protect nothing. A real deployment generates new station keys in the Ground Station console and pairs the tablet with them.
- The demo link between the tablet and the console is a browser `BroadcastChannel` (same browser) or copy-paste, not a real radio link.
- The event log is encrypted per event but not hash-chained, so deleting or reordering stored events would not be detected.
- Browser storage can be cleared by the user or the browser; export (JSON / FHIR) is the backup.

## Reporting
Please report security issues privately through GitHub's "Report a vulnerability" (Security tab of this repository) rather than a public issue.
