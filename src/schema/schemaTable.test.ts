import { describe, expect, it } from 'vitest';
import { buildFieldTreeFromRootSchema } from '@/schema/schemaTable';

// Sample schema for tests
const sampleSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', 'x-key': true },
    header: {
      type: 'object',
      properties: {
        timestamp: { type: 'string' },
        id: { type: 'string', 'x-key': true },
      },
    },
    transactions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          hash: { type: 'string', 'x-key': true },
          input: {
            oneOf: [
              { type: 'null' },
              {
                type: 'object',
                properties: {
                  address: { type: 'string' },
                  value: { type: 'number' },
                },
              },
            ],
          },
          utxos: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', 'x-key': true },
                amount: { type: 'number' },
              },
            },
          },
        },
      },
    },
  },
};


describe('buildFieldTreeFromRootSchema', () => {
  it ('should build a field tree from a sample schema', () => {
    const tree = buildFieldTreeFromRootSchema(sampleSchema);
    console.assert(tree.id?.type === 'primitive' && tree.id?.xKey, 'id should be primitive xKey');
    console.assert(tree.header?.children?.id?.xKey, 'header.id should be xKey');
    console.assert(tree.transactions?.type === 'array', 'transactions should be array');
    console.assert(tree.transactions?.children?.hash?.xKey, 'transactions.hash should be xKey');
    console.assert(tree.transactions?.children?.input?.children?.address?.type === 'primitive', 'input.address should be primitive');
    console.assert(tree.transactions?.children?.utxos?.type === 'array', 'utxos should be array');
    console.assert(tree.transactions?.children?.utxos?.children?.id?.xKey, 'utxos.id should be xKey');
  });
});
