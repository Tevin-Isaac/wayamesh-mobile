/**
 * Local end-to-end simulation of the USSD flow — no aggregator or RPC needed.
 * Drives the exact handleUssd() state machine a real phone would, then seeds a
 * deposit and runs a P2P transfer. Run: npm run simulate
 */
import { db } from './db.js';
import { handleUssd } from './ussd.js';
import { creditDeposit, getBalance } from './ledger.js';
import { toBaseUnits, fromBaseUnits } from './wallet.js';

// Fresh slate for the sim.
db.exec('DELETE FROM ledger_tx; DELETE FROM users;');

const ALICE = '+254700000001';
const BOB   = '+254700000002';

let step = 0;
function dial(phone: string, text: string, note: string): string {
  const res = handleUssd({ sessionId: `sim-${phone}`, phoneNumber: phone, text });
  const kind = res.startsWith('CON') ? 'CON' : 'END';
  console.log(`\n[${++step}] ${note}`);
  console.log(`    ${phone}  text="${text}"`);
  console.log(`    → ${kind}: ${res.slice(4).replace(/\n/g, '\n         ')}`);
  return res;
}

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error(`\n✗ ASSERT FAILED: ${msg}`); process.exit(1); }
  console.log(`    ✓ ${msg}`);
}

console.log('═══ Wayamesh USSD — end-to-end simulation ═══');

// 1. Alice registers (1 -> PIN -> confirm)
dial(ALICE, '', 'Alice dials in (new user)');
dial(ALICE, '1', 'Alice chooses Create account');
dial(ALICE, '1*1234', 'Alice sets PIN 1234');
const reg = dial(ALICE, '1*1234*1234', 'Alice confirms PIN');
assert(reg.startsWith('END') && reg.includes('created'), 'Alice account created');

// 2. Bob registers
dial(BOB, '1*5678*5678', 'Bob registers with PIN 5678 (full path)');
assert(!!db.prepare('SELECT 1 FROM users WHERE phone = ?').get(BOB), 'Bob exists in DB');

// 3. Seed Alice with a confirmed deposit of 50 USDC
creditDeposit(ALICE, Number(toBaseUnits('50')), '0xdeposit_demo_hash');
assert(getBalance(ALICE) === Number(toBaseUnits('50')), 'Alice balance = 50 USDC after deposit');

// 4. Alice checks balance (2 -> PIN)
dial(ALICE, '2', 'Alice opens Balance');
const bal = dial(ALICE, '2*1234', 'Alice enters PIN');
assert(bal.includes('50'), 'Balance screen shows 50 USDC');

// 5. Alice sends 12 USDC to Bob (1 -> phone -> amount -> PIN)
dial(ALICE, '1', 'Alice opens Send money');
dial(ALICE, `1*${BOB}`, 'Alice enters Bob as recipient');
dial(ALICE, `1*${BOB}*12`, 'Alice enters 12 USDC');
const sent = dial(ALICE, `1*${BOB}*12*1234`, 'Alice confirms with PIN');
assert(sent.startsWith('END') && sent.includes('Sent'), 'Transfer confirmed');
assert(getBalance(ALICE) === Number(toBaseUnits('38')), `Alice now has 38 USDC (got ${fromBaseUnits(getBalance(ALICE))})`);
assert(getBalance(BOB) === Number(toBaseUnits('12')), `Bob now has 12 USDC (got ${fromBaseUnits(getBalance(BOB))})`);

// 6. Wrong PIN is rejected
const wrong = dial(ALICE, '2*9999', 'Alice enters WRONG PIN for balance');
assert(wrong.startsWith('END') && /wrong pin/i.test(wrong), 'Wrong PIN rejected');

// 7. Overspend is rejected
dial(ALICE, '1', 'Alice opens Send');
dial(ALICE, `1*${BOB}`, 'recipient Bob');
dial(ALICE, `1*${BOB}*1000`, '1000 USDC (more than balance)');
const over = dial(ALICE, `1*${BOB}*1000*1234`, 'confirm with correct PIN');
assert(/insufficient/i.test(over), 'Overspend blocked by ledger');
assert(getBalance(ALICE) === Number(toBaseUnits('38')), 'Alice balance unchanged after failed overspend');

// 8. Deposit address is shown
const addr = dial(BOB, '3', 'Bob views deposit address');
assert(/0x[0-9a-fA-F]{40}/.test(addr), 'Deposit address shown to Bob');

console.log('\n═══ ALL CHECKS PASSED ═══\n');
process.exit(0);
