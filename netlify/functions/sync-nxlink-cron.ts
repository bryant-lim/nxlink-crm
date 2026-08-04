import { schedule } from '@netlify/functions';
import { handler as syncHandler } from './sync-nxlink';

export const handler = schedule('*/5 * * * *', syncHandler as any);
