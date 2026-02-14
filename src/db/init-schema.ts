import { Client } from '@libsql/client';
import {
  CREATE_TICKETS_TABLE,
  CREATE_TICKETS_INDEXES,
  CREATE_KNOWLEDGE_TABLE,
  CREATE_KNOWLEDGE_INDEXES,
  CREATE_VECTOR_INDEX,
  CREATE_SPECS_TABLE,
  CREATE_SPECS_INDEXES,
  CREATE_COMMENTS_TABLE,
  CREATE_COMMENTS_INDEXES,
} from './schema.js';

export async function initSchema(client: Client): Promise<void> {
  // Create tickets table
  await client.execute(CREATE_TICKETS_TABLE);

  const ticketIndexes = CREATE_TICKETS_INDEXES.split(';').filter(s => s.trim());
  for (const stmt of ticketIndexes) {
    await client.execute(stmt);
  }

  // Create knowledge table
  await client.execute(CREATE_KNOWLEDGE_TABLE);

  const knowledgeIndexes = CREATE_KNOWLEDGE_INDEXES.split(';').filter(s => s.trim());
  for (const stmt of knowledgeIndexes) {
    await client.execute(stmt);
  }

  // Vector index
  try {
    await client.execute(CREATE_VECTOR_INDEX);
  } catch {
    console.warn('Warning: Could not create vector index.');
  }

  // Create specs table
  await client.execute(CREATE_SPECS_TABLE);

  const specIndexes = CREATE_SPECS_INDEXES.split(';').filter(s => s.trim());
  for (const stmt of specIndexes) {
    await client.execute(stmt);
  }

  // Create comments table
  await client.execute(CREATE_COMMENTS_TABLE);

  const commentIndexes = CREATE_COMMENTS_INDEXES.split(';').filter(s => s.trim());
  for (const stmt of commentIndexes) {
    await client.execute(stmt);
  }

}
