import type { RaffleEnv } from "../domain/types";

/**
 * Every environment is a separate namespace, so demo actions can never touch
 * production documents: envs/demo/** vs envs/production/**.
 * The projector-safe document lives outside the private namespace.
 */
export const paths = {
  root: (env: RaffleEnv) => `envs/${env}`,
  participants: (env: RaffleEnv) => `envs/${env}/participants`,
  participant: (env: RaffleEnv, id: string) => `envs/${env}/participants/${id}`,
  prizes: (env: RaffleEnv) => `envs/${env}/prizes`,
  prize: (env: RaffleEnv, id: string) => `envs/${env}/prizes/${id}`,
  draws: (env: RaffleEnv) => `envs/${env}/draws`,
  draw: (env: RaffleEnv, id: string) => `envs/${env}/draws/${id}`,
  state: (env: RaffleEnv) => `envs/${env}/raffleState/main`,
  auditLogs: (env: RaffleEnv) => `envs/${env}/auditLogs`,
  auditLog: (env: RaffleEnv, id: string) => `envs/${env}/auditLogs/${id}`,
  imports: (env: RaffleEnv) => `envs/${env}/imports`,
  import: (env: RaffleEnv, id: string) => `envs/${env}/imports/${id}`,
  idempotencyKeys: (env: RaffleEnv) => `envs/${env}/idempotency`,
  idempotency: (env: RaffleEnv, key: string) => `envs/${env}/idempotency/${key}`,
  publicDisplay: (env: RaffleEnv) => `publicDisplay/${env}`,
};
