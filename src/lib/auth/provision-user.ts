import { db } from '@/lib/db';
interface ClerkProfile {
  id: string; firstName?: string | null; lastName?: string | null; imageUrl?: string;
  emailAddresses: { emailAddress: string }[];
}
export async function provisionUser(profile: ClerkProfile) {
  const existing = await db.user.findUnique({ where: { clerkId: profile.id }, include: { organization: true } });
  if (existing) {
    if (existing.deletedAt) throw new Error('Account is deactivated');
    return existing;
  }
  const email = profile.emailAddresses[0]?.emailAddress;
  if (!email) throw new Error('A verified account email is required');
  try {
    return await db.user.create({
      data: {
        clerkId: profile.id, email, firstName: profile.firstName, lastName: profile.lastName,
        imageUrl: profile.imageUrl, role: 'OWNER', lastActiveAt: new Date(),
        organization: { create: {
          name: `${[profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'My'} Organization`,
          slug: `personal-${profile.id}`,
        } },
      }, include: { organization: true },
    });
  } catch (error) {
    // Concurrent webhook/init requests may have created the same account.
    const winner = await db.user.findUnique({ where: { clerkId: profile.id }, include: { organization: true } });
    if (winner && !winner.deletedAt) return winner;
    throw error;
  }
}
