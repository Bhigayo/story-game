// A player's saved wallet in the story game (v37): cash, mission progress and reputation.
// The old life-sim profile (rent, hunger, payslips, homes, backgrounds) is in archive/life-sim/economy.mjs;
// older saves still carry those fields, which are simply ignored now.
import { ensureMissionState } from './missions.mjs'

export const STARTING_CASH = 35000 // £350, in pence

/** A brand new wallet, or one carried over from a very old save that was only a balance. */
export function newWallet(legacyBalance = null) {
  const wallet = { background: 'story', balance: legacyBalance ?? STARTING_CASH, traits: [], dream: null }
  ensureMissionState(wallet)
  return wallet
}
