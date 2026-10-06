import { Pinecone } from '@pinecone-database/pinecone';
let client: Pinecone | undefined;
export function getPinecone(): Pinecone {
  const apiKey = process.env.PINECONE_API_KEY;
  if (!apiKey) throw new Error('Pinecone storage is not configured');
  return client ??= new Pinecone({ apiKey });
}
