/**
 * Seed Firestore: ticket_statuses, ticket_types, job_types, message_templates, users (+ Firebase Auth accounts).
 * Run: npm run db:seed
 *
 * Env:
 *   FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY (required)
 *   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME — default admin when SEED_USERS is empty
 *   SEED_USERS — extra users: 'email1:pass1:Name1,email2:pass2:Name2' (role: user)
 *   SEED_RESET_STATUSES=1 — replace existing ticket_statuses (default: only seed when empty)
 *
 * Seeding a collection is skipped when it already has rows, so the script is safe to re-run.
 */
import 'dotenv/config'

import { createAppUser, findUserByEmail } from '../lib/app-users'
import { isFirebaseAdminConfigured } from '../lib/firebase/admin'
import { seedDefaults } from '../lib/seed-defaults'

type SeedUserRow = {
  email: string
  password: string
  fullName: string
  role: string
}

function buildUsersToSeed(): SeedUserRow[] {
  const list: SeedUserRow[] = []
  const seedUsers = process.env.SEED_USERS
  if (seedUsers) {
    for (const part of seedUsers.split(',')) {
      const [email, password, name] = part.trim().split(':')
      if (email) {
        list.push({
          email: email.trim(),
          password: (password || 'admin123').trim(),
          fullName: (name || email.split('@')[0]).trim(),
          role: 'user',
        })
      }
    }
  }
  if (list.length === 0) {
    list.push({
      email: process.env.SEED_ADMIN_EMAIL || 'admin@example.com',
      password: process.env.SEED_ADMIN_PASSWORD || 'admin123',
      fullName: process.env.SEED_ADMIN_NAME || 'Admin',
      role: 'admin',
    })
  }
  return list
}

async function seedUsers() {
  for (const u of buildUsersToSeed()) {
    if (await findUserByEmail(u.email)) {
      console.log('User already exists:', u.email)
      continue
    }
    await createAppUser({
      email: u.email,
      password: u.password,
      fullName: u.fullName,
      role: u.role,
      status: 'active',
    })
    console.log('Created user:', u.email, `(role: ${u.role})`)
  }
}

async function main() {
  if (!isFirebaseAdminConfigured()) {
    throw new Error('Firebase Admin is not configured (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)')
  }

  for (const line of await seedDefaults({ resetStatuses: process.env.SEED_RESET_STATUSES === '1' })) console.log(line)
  await seedUsers()
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
