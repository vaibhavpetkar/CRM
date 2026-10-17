import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MulterError } from 'multer';
import { errorHandler } from '../src/utils/errorHandler';

const run = (err: unknown) => {
  const out: { status?: number; body?: any } = {};
  const res: any = {
    status(code: number) {
      out.status = code;
      return res;
    },
    json(body: unknown) {
      out.body = body;
      return res;
    },
  };
  errorHandler(err, { method: 'POST', originalUrl: '/api/x' } as any, res, () => undefined);
  return out;
};

test('bad JSON and oversized bodies are client errors, not 500s', () => {
  const badJson = Object.assign(new SyntaxError('Unexpected token'), { status: 400, type: 'entity.parse.failed' });
  assert.deepEqual(run(badJson), { status: 400, body: { message: 'The request body is not valid JSON' } });
  const tooBig = Object.assign(new Error('request entity too large'), { status: 413, type: 'entity.too.large' });
  assert.deepEqual(run(tooBig), { status: 413, body: { message: 'The request is too large' } });
});

test('upload errors map to 413 for size and 400 otherwise', () => {
  assert.equal(run(new MulterError('LIMIT_FILE_SIZE')).status, 413);
  assert.equal(run(new MulterError('LIMIT_UNEXPECTED_FILE', 'file')).status, 400);
});

test('anything else still answers 500 without leaking the message', () => {
  assert.deepEqual(run(new Error('db password is wrong')), { status: 500, body: { message: 'Internal server error' } });
});
