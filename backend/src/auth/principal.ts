/** Shaped like the real session JWT payload (ADR-0020: sub/email, no authz claims). */
export interface Principal {
  userId: string;
  email: string;
}
