"use client";

import type { createClient } from "@/lib/supabase/client";

/**
 * Passkey ceremonies driven by hand, so we can ask for the device's built-in
 * biometric authenticator.
 *
 * WHY THIS EXISTS
 * auth-js's high-level registerPasskey()/signInWithPasskey() ship defaults
 * aimed at hardware security keys:
 *
 *   DEFAULT_CREATION_OPTIONS = {
 *     hints: ['security-key'],
 *     authenticatorSelection: {
 *       authenticatorAttachment: 'cross-platform',
 *       residentKey: 'discouraged',
 *     },
 *   }
 *
 * Those are correct for a YubiKey and wrong for a fingerprint. On Windows they
 * produce "Insert your security key into the USB port" instead of Windows
 * Hello, and `residentKey: 'discouraged'` creates a non-discoverable
 * credential, which usernameless sign-in cannot find afterwards.
 *
 * The SDK also exposes a two-step API (startRegistration / verifyRegistration)
 * for callers who want to run the ceremony themselves. That is what these do:
 * take the server's challenge, substitute authenticator preferences suited to
 * biometrics, and hand the result back for verification.
 *
 * Everything except authenticatorSelection and hints is passed through
 * untouched -- attestation in particular, because the server decides what it
 * is willing to verify.
 */

/** The app's configured browser client, typed from its factory. */
type AnyClient = ReturnType<typeof createClient>;

/* -------------------------------------------------------------------------- */
/* base64url <-> binary                                                        */
/* WebAuthn speaks ArrayBuffers; the wire format is base64url JSON.            */
/* -------------------------------------------------------------------------- */

function b64urlToBuffer(value: string): ArrayBuffer {
  const padding = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function bufferToB64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Authenticator preferences that mean "the biometric sensor on this device". */
const PLATFORM_SELECTION = {
  authenticatorAttachment: "platform" as const,
  // Discoverable, so the member can sign in without typing an identifier
  // first. The SDK default of 'discouraged' makes usernameless sign-in fail.
  residentKey: "required" as const,
  requireResidentKey: true,
  // 'required' forces the fingerprint/face/PIN check. The SDK relaxes this to
  // 'preferred' for older security keys that have no sensor, which is not a
  // constraint that applies here.
  userVerification: "required" as const,
};

/**
 * WebAuthn Level 3 gives credentials a toJSON(); older browsers do not, so
 * serialise by hand when it is missing.
 */
function serialiseCredential(credential: PublicKeyCredential): unknown {
  const withToJson = credential as PublicKeyCredential & {
    toJSON?: () => unknown;
  };
  if (typeof withToJson.toJSON === "function") return withToJson.toJSON();

  const response = credential.response as AuthenticatorAttestationResponse &
    AuthenticatorAssertionResponse;

  const json: Record<string, unknown> = {
    id: credential.id,
    rawId: bufferToB64url(credential.rawId),
    type: credential.type,
    clientExtensionResults: credential.getClientExtensionResults(),
    authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
    response: {
      clientDataJSON: bufferToB64url(response.clientDataJSON),
    },
  };

  const inner = json.response as Record<string, unknown>;
  if (response.attestationObject) {
    inner.attestationObject = bufferToB64url(response.attestationObject);
  }
  if (response.authenticatorData) {
    inner.authenticatorData = bufferToB64url(response.authenticatorData);
  }
  if (response.signature) inner.signature = bufferToB64url(response.signature);
  if (response.userHandle) inner.userHandle = bufferToB64url(response.userHandle);

  return json;
}

/* -------------------------------------------------------------------------- */
/* Registration                                                                */
/* -------------------------------------------------------------------------- */

export async function registerPlatformPasskey(
  supabase: AnyClient,
): Promise<{ error: string | null }> {
  const started = await supabase.auth.passkey.startRegistration();
  if (started.error || !started.data) {
    return { error: started.error?.message ?? "Could not start registration." };
  }

  const { challenge_id: challengeId, options } = started.data as unknown as {
    challenge_id: string;
    options: Record<string, unknown>;
  };

  const user = options.user as { id: string; name: string; displayName: string };
  const exclude = (options.excludeCredentials ?? []) as {
    id: string;
    type?: string;
    transports?: AuthenticatorTransport[];
  }[];

  const publicKey: PublicKeyCredentialCreationOptions = {
    ...(options as unknown as PublicKeyCredentialCreationOptions),
    challenge: b64urlToBuffer(options.challenge as string),
    user: { ...user, id: b64urlToBuffer(user.id) },
    excludeCredentials: exclude.map((c) => ({
      ...c,
      id: b64urlToBuffer(c.id),
      type: "public-key" as const,
    })),
    authenticatorSelection: PLATFORM_SELECTION,
  };

  // `hints` is WebAuthn Level 3 and not in every TypeScript DOM lib yet.
  (publicKey as unknown as { hints?: string[] }).hints = ["client-device"];

  const credential = (await navigator.credentials.create({
    publicKey,
  })) as PublicKeyCredential | null;

  if (!credential) return { error: "No passkey was created." };

  const verified = await supabase.auth.passkey.verifyRegistration({
    challengeId,
    credential: serialiseCredential(credential) as never,
  });

  return { error: verified.error?.message ?? null };
}

/* -------------------------------------------------------------------------- */
/* Authentication                                                              */
/* -------------------------------------------------------------------------- */

export async function signInWithPlatformPasskey(
  supabase: AnyClient,
): Promise<{ error: string | null }> {
  const started = await supabase.auth.passkey.startAuthentication();
  if (started.error || !started.data) {
    return { error: started.error?.message ?? "Could not start sign-in." };
  }

  const { challenge_id: challengeId, options } = started.data as unknown as {
    challenge_id: string;
    options: Record<string, unknown>;
  };

  const allow = (options.allowCredentials ?? []) as {
    id: string;
    type?: string;
    transports?: AuthenticatorTransport[];
  }[];

  const publicKey: PublicKeyCredentialRequestOptions = {
    ...(options as unknown as PublicKeyCredentialRequestOptions),
    challenge: b64urlToBuffer(options.challenge as string),
    allowCredentials: allow.map((c) => ({
      ...c,
      id: b64urlToBuffer(c.id),
      type: "public-key" as const,
    })),
    userVerification: "required",
  };

  (publicKey as unknown as { hints?: string[] }).hints = ["client-device"];

  const credential = (await navigator.credentials.get({
    publicKey,
  })) as PublicKeyCredential | null;

  if (!credential) return { error: "No passkey was offered." };

  const verified = await supabase.auth.passkey.verifyAuthentication({
    challengeId,
    credential: serialiseCredential(credential) as never,
  });

  return { error: verified.error?.message ?? null };
}
