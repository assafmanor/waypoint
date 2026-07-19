import { randomInt } from 'node:crypto';

// Short public invite handle (ADR-0067): 8 chars of base58 (no 0/O/I/l), ~2^47
// keyspace, case-sensitive. The code lives in a tapped /join/<code> link and is
// itself the grant — join resolves code → row → tripId, no separate token.
const CODE_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const CODE_LENGTH = 8;

export function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}
