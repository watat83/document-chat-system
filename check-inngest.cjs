require('dotenv').config({ path: '.env.local' });

console.log('Inngest Configuration Check:');
console.log('============================\n');

const eventKey = process.env.INNGEST_EVENT_KEY;
const signingKey = process.env.INNGEST_SIGNING_KEY;

if (!eventKey || !signingKey) {
  console.log('Status: ❌ Inngest is NOT configured\n');

  console.log('Missing:');
  if (!eventKey) console.log('  - INNGEST_EVENT_KEY');
  if (!signingKey) console.log('  - INNGEST_SIGNING_KEY');

  console.log('\n📋 To enable Inngest background processing:\n');
  console.log('1. Sign up at https://inngest.com (free tier available)');
  console.log('2. Create a new app in the Inngest dashboard');
  console.log('3. Copy your Event Key and Signing Key');
  console.log('4. Add them to .env.local:\n');
  console.log('   INNGEST_EVENT_KEY="your-event-key-here"');
  console.log('   INNGEST_SIGNING_KEY="your-signing-key-here"\n');
  console.log('5. Restart your dev server\n');

  console.log('ℹ️  Note: Inngest is optional. Your document system works without it.');
  console.log('   You only need it for background vectorization and AI processing.');
} else {
  console.log('Status: ✅ Inngest IS configured\n');
  console.log('Event Key:', eventKey.substring(0, 30) + '...');
  console.log('Signing Key:', signingKey.substring(0, 30) + '...\n');
  console.log('✓ Background processing is available!');
}
