// DEMO KEYS. The fixed "demo ground station" private keys, so the crew tablet and
// the Ground Station console work together out of the box. They are published in
// this repository, so they protect nothing: a real deployment generates its own
// station keys in the console ("New station keys") and pairs the tablet with them.
// This module is loaded only by the console and, lazily, by the Outbox tamper test.
import { DEMO_GROUND_PUBLIC, type GroundKeyBundle } from "../storage/crypto";

export interface StationKeys {
  bundle: GroundKeyBundle;
  /** ECDH P-256 private key: decrypts crew messages. */
  encPrivateJwk: JsonWebKey;
  /** ECDSA P-256 private key: signs replies. */
  signPrivateJwk: JsonWebKey;
}

export const DEMO_STATION: StationKeys = {
  bundle: DEMO_GROUND_PUBLIC,
  encPrivateJwk: { ...DEMO_GROUND_PUBLIC.enc, d: "z6SGYVGfz3SRePSkZekKVYO04R0vNKLw7_uJI9Sj7Ik" },
  signPrivateJwk: { ...DEMO_GROUND_PUBLIC.sign, d: "hgRcTA_x-71EQvSEtqKjYTPd_-0LPq86afpcOjOFGck" },
};
